import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { assertMembership, sendMessage } from '../conversations/service';
import { emitToConversationMembers } from '../../realtime/events';
import { decodeCursor, encodeCursor, pageEnvelope, clampLimit } from '../../utils/pagination';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const messageInclude = {
  sender: { select: userSelect },
  attachments: true,
  reactions: { include: { user: { select: userSelect } } },
  replyTo: { include: { sender: { select: userSelect } } },
} as const;

async function getMessageInConversation(userId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { id: true } } },
  });
  if (!message) throw notFound('MESSAGE_NOT_FOUND', 'Message not found');
  await assertMembership(userId, message.conversationId);
  return message;
}

export async function listMessages(userId: string, conversationId: string, cursor?: string, limitRaw?: unknown) {
  await assertMembership(userId, conversationId);
  const limit = clampLimit(limitRaw);
  const c = decodeCursor<{ createdAt: string; id: string }>(cursor ?? null);
  const items = await prisma.message.findMany({
    where: {
      conversationId,
      isDeleted: false,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        ...(c
          ? [
              {
                OR: [
                  { createdAt: { lt: new Date(c.createdAt) } },
                  { createdAt: new Date(c.createdAt), id: { lt: c.id } },
                ],
              },
            ]
          : []),
      ],
    },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = items.length > limit;
  const data = items.slice(0, limit);
  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor({ createdAt: data[data.length - 1].createdAt.toISOString(), id: data[data.length - 1].id })
      : null;
  return pageEnvelope(data, nextCursor);
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export async function editMessage(userId: string, messageId: string, text: string) {
  const message = await getMessageInConversation(userId, messageId);
  if (message.senderId !== userId) throw forbidden('NOT_SENDER', 'Only the sender can edit this message');
  if (message.isDeleted) throw badRequest('MESSAGE_DELETED', 'Cannot edit a deleted message');
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw badRequest('EDIT_WINDOW_EXPIRED', 'Messages can only be edited within 15 minutes');
  }
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { text: text.trim() },
    include: messageInclude,
  });
  await emitToConversationMembers(message.conversationId, 'message:updated', { message: updated, conversationId: message.conversationId });
  return updated;
}

export async function deleteMessage(userId: string, role: string, messageId: string) {
  const message = await getMessageInConversation(userId, messageId);
  if (message.senderId !== userId && role !== 'ADMIN') {
    throw forbidden('NOT_SENDER', 'Only the sender or an admin can delete this message');
  }
  await prisma.$transaction([
    prisma.messageAttachment.deleteMany({ where: { messageId } }),
    prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, text: null, expiresAt: null },
    }),
  ]);
  await emitToConversationMembers(message.conversationId, 'message:deleted', {
    messageId,
    conversationId: message.conversationId,
  });
  return { ok: true };
}

export async function reactToMessage(userId: string, messageId: string, emoji: string) {
  const message = await getMessageInConversation(userId, messageId);
  if (message.isDeleted) throw badRequest('MESSAGE_DELETED', 'Cannot react to a deleted message');
  const reaction = await prisma.messageReaction.upsert({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
    create: { messageId, userId, emoji },
    update: {},
    include: { user: { select: userSelect } },
  });
  const full = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  await emitToConversationMembers(message.conversationId, 'message:updated', { message: full, conversationId: message.conversationId });
  return reaction;
}

export async function removeReaction(userId: string, messageId: string, emoji: string) {
  const message = await getMessageInConversation(userId, messageId);
  await prisma.messageReaction.deleteMany({ where: { messageId, userId, emoji } });
  const full = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  await emitToConversationMembers(message.conversationId, 'message:updated', { message: full, conversationId: message.conversationId });
  return { ok: true };
}

export async function forwardMessage(userId: string, messageId: string, toConversationId: string) {
  const message = await getMessageInConversation(userId, messageId);
  if (message.isDeleted) throw badRequest('MESSAGE_DELETED', 'Cannot forward a deleted message');
  await assertMembership(userId, toConversationId);
  const full = await prisma.message.findUnique({
    where: { id: messageId },
    include: { attachments: true },
  });
  const forwarded = await sendMessage(userId, toConversationId, {
    type: message.type,
    text: full?.text ?? undefined,
    attachmentIds: [],
    data: { forwardedFromId: messageId },
  });
  // Copy attachment rows (same URLs — no re-upload).
  if (full && full.attachments.length > 0) {
    await prisma.messageAttachment.createMany({
      data: full.attachments.map((a) => ({
        messageId: forwarded.id,
        kind: a.kind,
        url: a.url,
        thumbnailUrl: a.thumbnailUrl,
        durationSec: a.durationSec,
        sizeBytes: a.sizeBytes,
        mimeType: a.mimeType,
      })),
    });
  }
  return prisma.message.findUnique({ where: { id: forwarded.id }, include: messageInclude });
}

// ─── Saved (bookmarked) messages ─────────────────────────────────────────

const savedMessageInclude = {
  message: {
    include: {
      sender: { select: userSelect },
      attachments: true,
      reactions: { include: { user: { select: userSelect } } },
      replyTo: { include: { sender: { select: userSelect } } },
      conversation: { select: { id: true, type: true, title: true } },
    },
  },
} as const;

export async function saveMessage(userId: string, messageId: string) {
  const message = await getMessageInConversation(userId, messageId);
  if (message.isDeleted) throw badRequest('MESSAGE_DELETED', 'Cannot save a deleted message');
  const saved = await prisma.savedMessage.upsert({
    where: { userId_messageId: { userId, messageId } },
    create: { userId, messageId },
    update: {},
    include: savedMessageInclude,
  });
  return saved;
}

export async function unsaveMessage(userId: string, messageId: string) {
  // Membership check first so users can't probe other conversations' ids.
  await getMessageInConversation(userId, messageId);
  await prisma.savedMessage.deleteMany({ where: { userId, messageId } });
  return { ok: true };
}

export async function listSavedMessages(userId: string, limitRaw?: unknown) {
  const limit = clampLimit(limitRaw, 50);
  return prisma.savedMessage.findMany({
    where: { userId, message: { isDeleted: false } },
    include: savedMessageInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
