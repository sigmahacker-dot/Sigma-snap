import type { NotificationType } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { emitToUser } from '../../realtime/events';
import { getPushProvider } from '../../services/push';
import { notFound } from '../../utils/errors';
import { decodeCursor, encodeCursor, pageEnvelope, clampLimit } from '../../utils/pagination';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  actorId?: string;
  postId?: string;
  storyId?: string;
  conversationId?: string;
  data?: Record<string, unknown>;
}

/**
 * Create a notification, emit it to the recipient's user room,
 * and fan out to push tokens (best-effort, no-op when unconfigured).
 */
export async function notify(input: NotifyInput) {
  if (input.actorId && input.actorId === input.userId) return null; // no self-notifications
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      actorId: input.actorId ?? null,
      postId: input.postId ?? null,
      storyId: input.storyId ?? null,
      conversationId: input.conversationId ?? null,
      data: (input.data ?? {}) as object,
    },
    include: {
      actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
  emitToUser(input.userId, 'notification:new', { notification });
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: input.userId },
      select: { token: true },
    });
    if (tokens.length > 0) {
      await getPushProvider().send(
        input.userId,
        tokens.map((t) => t.token),
        {
          title: input.title,
          body: input.body,
          data: {
            type: input.type,
            ...(input.postId ? { postId: input.postId } : {}),
            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          },
        },
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notifications] push fan-out failed:', err);
  }
  return notification;
}

export async function listNotifications(userId: string, cursor?: string, limitRaw?: unknown) {
  const limit = clampLimit(limitRaw);
  const c = decodeCursor<{ createdAt: string; id: string }>(cursor ?? null);
  const items = await prisma.notification.findMany({
    where: {
      userId,
      ...(c ? { OR: [{ createdAt: { lt: new Date(c.createdAt) } }, { createdAt: new Date(c.createdAt), id: { lt: c.id } }] } : {}),
    },
    include: { actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
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

export async function markRead(userId: string, id: string) {
  const n = await prisma.notification.findFirst({ where: { id, userId } });
  if (!n) throw notFound('NOTIFICATION_NOT_FOUND', 'Notification not found');
  return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  const r = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: r.count };
}

export async function registerPushToken(userId: string, token: string, platform: 'IOS' | 'ANDROID' | 'WEB') {
  return prisma.pushToken.upsert({
    where: { token },
    update: { userId, platform },
    create: { userId, token, platform },
  });
}

export async function deletePushToken(userId: string, token: string) {
  await prisma.pushToken.deleteMany({ where: { userId, token } });
  return { ok: true };
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
