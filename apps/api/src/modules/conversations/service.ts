import { ConversationType, MediaKind, MessageType, AttachmentKind, MediaStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { emitToConversationMembers } from '../../realtime/events';
import { notify } from '../notifications/service';

const participantUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isOnline: true,
  lastSeenAt: true,
} as const;

const messageInclude = {
  sender: { select: participantUserSelect },
  attachments: true,
  reactions: { include: { user: { select: participantUserSelect } } },
  replyTo: { include: { sender: { select: participantUserSelect } } },
} as const;

export async function assertMembership(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, deletedAt: null },
    include: { participants: { include: { user: { select: participantUserSelect } } } },
  });
  if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  const participant = conversation.participants.find((p) => p.userId === userId);
  if (!participant) throw forbidden('NOT_PARTICIPANT', 'You are not a participant of this conversation');
  return { conversation, participant };
}

/** Find an existing DIRECT conversation between exactly these two users, or create one. */
export async function findOrCreateDirectConversation(a: string, b: string) {
  const [x, y] = [a, b].sort();
  const candidates = await prisma.conversation.findMany({
    where: {
      type: ConversationType.DIRECT,
      deletedAt: null,
      participants: { some: { userId: x } },
    },
    include: { participants: { select: { userId: true } } },
  });
  for (const c of candidates) {
    const ids = c.participants.map((p) => p.userId).sort();
    if (ids.length === 2 && ids[0] === x && ids[1] === y) return c;
  }
  return prisma.conversation.create({
    data: {
      type: ConversationType.DIRECT,
      createdById: a,
      participants: { create: [{ userId: a }, { userId: b }] },
    },
    include: { participants: { select: { userId: true } } },
  });
}

async function checkCanMessage(initiatorId: string, targetId: string): Promise<void> {
  const target = await prisma.user.findFirst({ where: { id: targetId, deletedAt: null } });
  if (!target) throw notFound('USER_NOT_FOUND', 'User not found');
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: initiatorId, blockedId: targetId },
        { blockerId: targetId, blockedId: initiatorId },
      ],
    },
  });
  if (blocked) throw forbidden('BLOCKED', 'You cannot message this user');
  if (target.allowMessagesFrom === 'NOBODY') {
    throw forbidden('MESSAGES_NOT_ALLOWED', 'This user does not accept messages');
  }
  if (target.allowMessagesFrom === 'FRIENDS') {
    const f = await prisma.friend.findUnique({
      where: { userId_friendId: { userId: targetId, friendId: initiatorId } },
    });
    if (!f) throw forbidden('MESSAGES_NOT_ALLOWED', 'This user only accepts messages from friends');
  }
}

export async function listConversations(userId: string) {
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId, conversation: { deletedAt: null } },
    include: {
      conversation: {
        include: {
          participants: { include: { user: { select: participantUserSelect } } },
          messages: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { sender: { select: participantUserSelect } },
          },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: 'desc' } },
  });
  const result = [];
  for (const p of participations) {
    const c = p.conversation;
    const unread = await prisma.message.count({
      where: {
        conversationId: c.id,
        isDeleted: false,
        senderId: { not: userId },
        createdAt: { gt: p.lastReadAt ?? new Date(0) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    result.push({ ...c, lastMessage: c.messages[0] ?? null, unreadCount: unread, messages: undefined });
  }
  return result;
}

export async function createConversation(userId: string, input: {
  type: ConversationType;
  userIds: string[];
  title?: string;
}) {
  const others = [...new Set(input.userIds.filter((id) => id !== userId))];
  if (input.type === ConversationType.DIRECT) {
    if (others.length !== 1) throw badRequest('INVALID_DIRECT', 'DIRECT conversations need exactly one other user');
    await checkCanMessage(userId, others[0]);
    return findOrCreateDirectConversation(userId, others[0]);
  }
  if (others.length === 0) throw badRequest('EMPTY_GROUP', 'Group conversations need at least one other user');
  for (const id of others) {
    const u = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!u) throw notFound('USER_NOT_FOUND', `User ${id} not found`);
  }
  return prisma.conversation.create({
    data: {
      type: ConversationType.GROUP,
      title: input.title ?? null,
      createdById: userId,
      participants: {
        create: [
          { userId, role: 'ADMIN' },
          ...others.map((id) => ({ userId: id, role: 'MEMBER' })),
        ],
      },
    },
    include: { participants: { include: { user: { select: participantUserSelect } } } },
  });
}

export async function getConversation(userId: string, id: string) {
  const { conversation } = await assertMembership(userId, id);
  return conversation;
}

export async function patchConversation(userId: string, id: string, input: { title?: string | null; disappearingAfterSec?: number }) {
  const { conversation, participant } = await assertMembership(userId, id);
  if (conversation.type === ConversationType.GROUP && input.title !== undefined) {
    if (participant.role !== 'ADMIN' && conversation.createdById !== userId) {
      throw forbidden('NOT_GROUP_ADMIN', 'Only group admins can change the title');
    }
  }
  return prisma.conversation.update({
    where: { id },
    data: {
      ...(input.title !== undefined
        ? { title: conversation.type === ConversationType.GROUP ? input.title : conversation.title }
        : {}),
      ...(input.disappearingAfterSec !== undefined ? { disappearingAfterSec: input.disappearingAfterSec } : {}),
    },
  });
}

export async function leaveConversation(userId: string, id: string) {
  const { conversation } = await assertMembership(userId, id);
  if (conversation.type === ConversationType.DIRECT) {
    throw badRequest('CANNOT_LEAVE_DIRECT', 'Cannot leave a direct conversation');
  }
  await prisma.conversationParticipant.deleteMany({ where: { conversationId: id, userId } });
  const remaining = await prisma.conversationParticipant.count({ where: { conversationId: id } });
  if (remaining === 0) {
    await prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  return { ok: true };
}

function attachmentKindFor(kind: MediaKind): AttachmentKind {
  switch (kind) {
    case MediaKind.PHOTO:
    case MediaKind.THUMBNAIL:
      return AttachmentKind.IMAGE;
    case MediaKind.VIDEO:
      return AttachmentKind.VIDEO;
    case MediaKind.AUDIO:
      return AttachmentKind.VOICE;
    default:
      return AttachmentKind.FILE;
  }
}

export interface SendMessageInput {
  type: MessageType;
  text?: string;
  attachmentIds?: string[];
  replyToId?: string;
  expiresAt?: string;
  /** internal metadata (e.g. story replies) — not user input */
  data?: Record<string, unknown>;
}

export async function sendMessage(senderId: string, conversationId: string, input: SendMessageInput) {
  const { conversation } = await assertMembership(senderId, conversationId);

  if (!input.text?.trim() && (!input.attachmentIds || input.attachmentIds.length === 0)) {
    throw badRequest('EMPTY_MESSAGE', 'Message must have text or attachments');
  }
  if (input.replyToId) {
    const replyTo = await prisma.message.findFirst({
      where: { id: input.replyToId, conversationId, isDeleted: false },
    });
    if (!replyTo) throw notFound('REPLY_TARGET_NOT_FOUND', 'Replied-to message not found');
  }

  const attachments: { kind: AttachmentKind; url: string; thumbnailUrl: string | null; durationSec: number | null; sizeBytes: number | null; mimeType: string | null }[] = [];
  if (input.attachmentIds?.length) {
    for (const assetId of input.attachmentIds) {
      const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, deletedAt: null } });
      if (!asset || asset.ownerId !== senderId) {
        throw badRequest('INVALID_ATTACHMENT', `Attachment ${assetId} not found or not yours`);
      }
      if (asset.status !== MediaStatus.READY) {
        throw badRequest('ATTACHMENT_NOT_READY', `Attachment ${assetId} is not ready yet`);
      }
      attachments.push({
        kind: attachmentKindFor(asset.kind),
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        durationSec: asset.durationSec,
        sizeBytes: asset.sizeBytes,
        mimeType: asset.mimeType,
      });
    }
  }

  let expiresAt: Date | null = null;
  if (conversation.disappearingAfterSec > 0) {
    expiresAt = new Date(Date.now() + conversation.disappearingAfterSec * 1000);
  } else if (input.expiresAt) {
    expiresAt = new Date(input.expiresAt);
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      type: input.type,
      text: input.text?.trim() || null,
      replyToId: input.replyToId ?? null,
      expiresAt,
      attachments: { create: attachments },
    },
    include: messageInclude,
  });

  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId: senderId },
    data: { lastReadAt: new Date() },
  });

  // Realtime to the room + every participant's user room (all their devices).
  await emitToConversationMembers(conversationId, 'message:new', { message, conversationId });

  // Notify the other participants (unless they muted the conversation).
  const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { displayName: true } });
  const others = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: senderId }, muted: false },
    select: { userId: true },
  });
  for (const o of others) {
    await notify({
      userId: o.userId,
      type: 'MESSAGE',
      title: sender?.displayName ?? 'New message',
      body: (message.text ?? (attachments.length ? 'Sent an attachment' : 'New message')).slice(0, 120),
      actorId: senderId,
      conversationId,
      data: input.data ?? {},
    });
  }

  return message;
}

export async function markRead(userId: string, conversationId: string, lastReadAt?: string) {
  const { participant } = await assertMembership(userId, conversationId);
  const readAt = lastReadAt ? new Date(lastReadAt) : new Date();
  await prisma.conversationParticipant.update({
    where: { id: participant.id },
    data: { lastReadAt: readAt },
  });
  // Upsert read receipts for recent messages from others.
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      senderId: { not: userId },
      isDeleted: false,
      createdAt: { lte: readAt },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  if (messages.length > 0) {
    await prisma.$transaction(
      messages.map((m) =>
        prisma.messageReceipt.upsert({
          where: { messageId_userId: { messageId: m.id, userId } },
          create: { messageId: m.id, userId, readAt },
          update: { readAt },
        }),
      ),
    );
  }
  return { ok: true, readAt: readAt.toISOString() };
}
