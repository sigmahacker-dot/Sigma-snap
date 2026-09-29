import type { CallType } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { emitToUser } from '../../realtime/events';
import { notify } from '../notifications/service';
import { decodeCursor, encodeCursor, pageEnvelope, clampLimit } from '../../utils/pagination';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const callInclude = {
  initiator: { select: userSelect },
  participants: { include: { user: { select: userSelect } } },
} as const;

export async function createCall(initiatorId: string, input: { userId?: string; conversationId?: string; type: CallType }) {
  let participantIds: string[];
  let conversationId: string | null = null;

  if (input.userId) {
    const callee = await prisma.user.findFirst({ where: { id: input.userId, deletedAt: null } });
    if (!callee) throw notFound('USER_NOT_FOUND', 'User not found');
    if (input.userId === initiatorId) throw badRequest('CANNOT_CALL_SELF', 'You cannot call yourself');
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: initiatorId, blockedId: input.userId },
          { blockerId: input.userId, blockedId: initiatorId },
        ],
      },
    });
    if (blocked) throw forbidden('BLOCKED', 'You cannot call this user');
    participantIds = [initiatorId, input.userId];
  } else {
    const conversation = await prisma.conversation.findFirst({
      where: { id: input.conversationId!, deletedAt: null },
      include: { participants: { select: { userId: true } } },
    });
    if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
    if (!conversation.participants.some((p) => p.userId === initiatorId)) {
      throw forbidden('NOT_PARTICIPANT', 'You are not a participant of this conversation');
    }
    conversationId = conversation.id;
    participantIds = conversation.participants.map((p) => p.userId);
  }

  const call = await prisma.call.create({
    data: {
      conversationId,
      initiatorId,
      type: input.type,
      status: 'RINGING',
      participants: { create: participantIds.map((userId) => ({ userId })) },
    },
    include: callInclude,
  });

  const fromUser = await prisma.user.findUnique({ where: { id: initiatorId }, select: userSelect });
  for (const pid of participantIds) {
    if (pid === initiatorId) continue;
    emitToUser(pid, 'call:incoming', { call, fromUser });
  }
  return call;
}

export async function callHistory(userId: string, cursor?: string, limitRaw?: unknown) {
  const limit = clampLimit(limitRaw);
  const c = decodeCursor<{ createdAt: string; id: string }>(cursor ?? null);
  const participations = await prisma.callParticipant.findMany({
    where: {
      userId,
      ...(c ? { call: { createdAt: { lt: new Date(c.createdAt) } } } : {}),
    },
    include: { call: { include: callInclude } },
    orderBy: { call: { createdAt: 'desc' } },
    take: limit + 1,
  });
  const hasMore = participations.length > limit;
  const data = participations.slice(0, limit).map((p) => p.call);
  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor({ createdAt: data[data.length - 1].createdAt.toISOString(), id: data[data.length - 1].id })
      : null;
  return pageEnvelope(data, nextCursor);
}

export async function getCall(userId: string, id: string) {
  const call = await prisma.call.findUnique({ where: { id }, include: callInclude });
  if (!call) throw notFound('CALL_NOT_FOUND', 'Call not found');
  if (!call.participants.some((p) => p.userId === userId)) {
    throw forbidden('NOT_PARTICIPANT', 'You are not a participant of this call');
  }
  return call;
}

export async function endCall(userId: string, id: string) {
  const call = await prisma.call.findUnique({
    where: { id },
    include: { participants: { select: { userId: true } } },
  });
  if (!call) throw notFound('CALL_NOT_FOUND', 'Call not found');
  if (!call.participants.some((p) => p.userId === userId)) {
    throw forbidden('NOT_PARTICIPANT', 'You are not a participant of this call');
  }
  if (call.status === 'ENDED' || call.status === 'MISSED') return call;
  const updated = await prisma.call.update({
    where: { id },
    data: { status: 'ENDED', endedAt: new Date() },
    include: callInclude,
  });
  await prisma.callParticipant.updateMany({
    where: { callId: id, leftAt: null },
    data: { leftAt: new Date() },
  });
  for (const p of call.participants) {
    emitToUser(p.userId, 'call:ended', { callId: id, reason: 'hangup' });
  }
  return updated;
}

/** Mark a ringing call as missed and notify the initiator. Used by socket reject/timeout. */
export async function markCallMissed(callId: string, missedByUserId: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { participants: { select: { userId: true } }, initiator: { select: userSelect } },
  });
  if (!call || call.status !== 'RINGING') return null;
  const updated = await prisma.call.update({
    where: { id: callId },
    data: { status: 'MISSED', endedAt: new Date() },
  });
  const missedBy = await prisma.user.findUnique({ where: { id: missedByUserId }, select: { displayName: true } });
  await notify({
    userId: call.initiatorId,
    type: 'CALL_MISSED',
    title: 'Missed call',
    body: `You missed a call from ${missedBy?.displayName ?? 'someone'}`,
    actorId: missedByUserId,
  });
  for (const p of call.participants) {
    emitToUser(p.userId, 'call:ended', { callId, reason: 'missed' });
  }
  return updated;
}

/** Callee rejects: mark REJECTED, notify initiator of the missed call. */
export async function rejectCall(userId: string, callId: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { participants: { select: { userId: true } } },
  });
  if (!call) throw notFound('CALL_NOT_FOUND', 'Call not found');
  if (!call.participants.some((p) => p.userId === userId)) {
    throw forbidden('NOT_PARTICIPANT', 'You are not a participant of this call');
  }
  if (call.status !== 'RINGING') return call;
  const updated = await prisma.call.update({
    where: { id: callId },
    data: { status: 'REJECTED', endedAt: new Date() },
  });
  const rejectedBy = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  await notify({
    userId: call.initiatorId,
    type: 'CALL_MISSED',
    title: 'Missed call',
    body: `${rejectedBy?.displayName ?? 'Someone'} declined your call`,
    actorId: userId,
  });
  for (const p of call.participants) {
    emitToUser(p.userId, 'call:ended', { callId, reason: 'rejected' });
  }
  return updated;
}
