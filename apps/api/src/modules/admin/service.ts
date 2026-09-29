import type { Plan, Role } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../utils/errors';
import { recordAudit } from '../../middleware/audit';
import { resolveReport as resolveReportSvc } from '../moderation/service';
import { clampLimit } from '../../utils/pagination';

const adminUserSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  plan: true,
  isBanned: true,
  bannedUntil: true,
  suspendedUntil: true,
  createdAt: true,
} as const;

export async function stats() {
  const [users, posts, stories, reportsPending, storage, aiUsage] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.post.count({ where: { deletedAt: null } }),
    prisma.story.count({ where: { deletedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.report.count({ where: { status: 'PENDING' } }),
    prisma.mediaAsset.aggregate({ where: { deletedAt: null }, _sum: { sizeBytes: true }, _count: true }),
    prisma.aiGeneration.count({ where: { createdAt: { gt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } }),
  ]);
  return {
    users,
    posts,
    storiesActive: stories,
    reportsPending,
    storageBytes: storage._sum.sizeBytes ?? 0,
    mediaAssets: storage._count,
    aiGenerationsLast30d: aiUsage,
  };
}

export async function listUsers(q?: string, filter?: 'banned' | 'suspended', limitRaw?: unknown) {
  const limit = clampLimit(limitRaw, 50);
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(q ? { OR: [{ username: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] } : {}),
      ...(filter === 'banned' ? { isBanned: true } : {}),
      ...(filter === 'suspended' ? { suspendedUntil: { gt: new Date() } } : {}),
    },
    select: adminUserSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

async function getUserOrThrow(id: string) {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  return user;
}

export async function banUser(adminId: string, id: string, days?: number, reason?: string, ip?: string) {
  const user = await getUserOrThrow(id);
  if (user.role === 'ADMIN') throw badRequest('CANNOT_BAN_ADMIN', 'Admins cannot be banned');
  const updated = await prisma.user.update({
    where: { id },
    data: { isBanned: true, bannedUntil: days ? new Date(Date.now() + days * 86400000) : null },
    select: adminUserSelect,
  });
  await recordAudit({ actorId: adminId, action: 'admin.user.ban', entityType: 'User', entityId: id, metadata: { days: days ?? null, reason: reason ?? null }, ip });
  return updated;
}

export async function unbanUser(adminId: string, id: string, ip?: string) {
  await getUserOrThrow(id);
  const updated = await prisma.user.update({
    where: { id },
    data: { isBanned: false, bannedUntil: null },
    select: adminUserSelect,
  });
  await recordAudit({ actorId: adminId, action: 'admin.user.unban', entityType: 'User', entityId: id, ip });
  return updated;
}

export async function suspendUser(adminId: string, id: string, days: number, reason?: string, ip?: string) {
  const user = await getUserOrThrow(id);
  if (user.role === 'ADMIN') throw badRequest('CANNOT_SUSPEND_ADMIN', 'Admins cannot be suspended');
  const updated = await prisma.user.update({
    where: { id },
    data: { suspendedUntil: new Date(Date.now() + days * 86400000) },
    select: adminUserSelect,
  });
  await recordAudit({ actorId: adminId, action: 'admin.user.suspend', entityType: 'User', entityId: id, metadata: { days, reason: reason ?? null }, ip });
  return updated;
}

export async function unsuspendUser(adminId: string, id: string, ip?: string) {
  await getUserOrThrow(id);
  const updated = await prisma.user.update({
    where: { id },
    data: { suspendedUntil: null },
    select: adminUserSelect,
  });
  await recordAudit({ actorId: adminId, action: 'admin.user.unsuspend', entityType: 'User', entityId: id, ip });
  return updated;
}

export async function setPlan(adminId: string, id: string, plan: Plan, ip?: string) {
  await getUserOrThrow(id);
  const updated = await prisma.user.update({ where: { id }, data: { plan }, select: adminUserSelect });
  await recordAudit({ actorId: adminId, action: 'admin.user.set-plan', entityType: 'User', entityId: id, metadata: { plan }, ip });
  return updated;
}

export async function setRole(adminId: string, id: string, role: Role, ip?: string) {
  const user = await getUserOrThrow(id);
  if (user.id === adminId && role !== 'ADMIN') {
    throw badRequest('CANNOT_DEMOTE_SELF', 'You cannot demote yourself');
  }
  const updated = await prisma.user.update({ where: { id }, data: { role }, select: adminUserSelect });
  await recordAudit({ actorId: adminId, action: 'admin.user.set-role', entityType: 'User', entityId: id, metadata: { role }, ip });
  return updated;
}

export async function listReports(status?: 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED' | 'APPEALED') {
  return prisma.report.findMany({
    where: status ? { status } : {},
    include: {
      reporter: { select: { id: true, username: true, displayName: true } },
      resolvedBy: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export const resolveReport = (
  adminId: string,
  reportId: string,
  input: { status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED'; action?: 'WARN' | 'REMOVE_CONTENT' | 'SUSPEND' | 'BAN' | 'FEATURE' | 'UNFEATURE'; reason?: string },
  ip?: string,
) => resolveReportSvc(adminId, reportId, input, ip);

export async function moderationActions() {
  return prisma.moderationAction.findMany({
    include: { moderator: { select: { id: true, username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function listAppeals() {
  return prisma.appeal.findMany({
    include: {
      appellant: { select: { id: true, username: true, displayName: true } },
      report: true,
      moderationAction: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function resolveAppeal(adminId: string, id: string, status: 'UPHELD' | 'OVERTURNED', ip?: string) {
  const appeal = await prisma.appeal.findUnique({ where: { id } });
  if (!appeal) throw notFound('APPEAL_NOT_FOUND', 'Appeal not found');
  const updated = await prisma.appeal.update({ where: { id }, data: { status } });
  await recordAudit({ actorId: adminId, action: 'admin.appeal.resolve', entityType: 'Appeal', entityId: id, metadata: { status }, ip });
  return updated;
}

export async function contentList(type: 'posts' | 'stories' | 'comments', q?: string, limitRaw?: unknown) {
  const limit = clampLimit(limitRaw, 50);
  if (type === 'posts') {
    return prisma.post.findMany({
      where: { deletedAt: null, ...(q ? { caption: { contains: q, mode: 'insensitive' } } : {}) },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
  if (type === 'stories') {
    return prisma.story.findMany({
      where: { deletedAt: null, ...(q ? { caption: { contains: q, mode: 'insensitive' } } : {}) },
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
  return prisma.comment.findMany({
    where: { deletedAt: null, ...(q ? { text: { contains: q, mode: 'insensitive' } } : {}) },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function deleteContent(adminId: string, type: 'posts' | 'stories' | 'comments', id: string, ip?: string) {
  if (type === 'posts') {
    const post = await prisma.post.findFirst({ where: { id, deletedAt: null } });
    if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
    await prisma.post.update({ where: { id }, data: { deletedAt: new Date() } });
  } else if (type === 'stories') {
    const story = await prisma.story.findFirst({ where: { id, deletedAt: null } });
    if (!story) throw notFound('STORY_NOT_FOUND', 'Story not found');
    await prisma.story.update({ where: { id }, data: { deletedAt: new Date() } });
  } else {
    const comment = await prisma.comment.findFirst({ where: { id, deletedAt: null } });
    if (!comment) throw notFound('COMMENT_NOT_FOUND', 'Comment not found');
    await prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  await recordAudit({ actorId: adminId, action: 'admin.content.delete', entityType: type, entityId: id, ip });
  return { ok: true };
}

export async function featureContent(adminId: string, type: 'posts' | 'stories' | 'comments', id: string, featured: boolean, ip?: string) {
  if (type !== 'posts') {
    throw badRequest('FEATURE_POSTS_ONLY', 'Featuring is only supported for posts');
  }
  const post = await prisma.post.findFirst({ where: { id, deletedAt: null } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  const updated = await prisma.post.update({ where: { id }, data: { isFeatured: featured } });
  await recordAudit({
    actorId: adminId,
    action: featured ? 'admin.content.feature' : 'admin.content.unfeature',
    entityType: 'Post',
    entityId: id,
    ip,
  });
  return updated;
}

export async function aiUsage() {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const rows = await prisma.aiGeneration.groupBy({
    by: ['kind', 'provider', 'status'],
    where: { createdAt: { gt: since } },
    _count: true,
  });
  const total = await prisma.aiGeneration.count({ where: { createdAt: { gt: since } } });
  return { total, breakdown: rows };
}

export async function auditLogs(limitRaw?: unknown) {
  const limit = clampLimit(limitRaw, 100);
  return prisma.auditLog.findMany({
    include: { actor: { select: { id: true, username: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function storageStats() {
  const [total, byKind, byStatus] = await Promise.all([
    prisma.mediaAsset.aggregate({ where: { deletedAt: null }, _sum: { sizeBytes: true }, _count: true }),
    prisma.mediaAsset.groupBy({ by: ['kind'], where: { deletedAt: null }, _sum: { sizeBytes: true }, _count: true }),
    prisma.mediaAsset.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
  ]);
  return {
    totalBytes: total._sum.sizeBytes ?? 0,
    totalAssets: total._count,
    byKind,
    byStatus,
  };
}

export async function getFeatureFlags() {
  return prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
}

export async function putFeatureFlags(
  adminId: string,
  flags: { key: string; enabled: boolean; plans: Plan[]; config: Record<string, unknown> }[],
  ip?: string,
) {
  const result = [];
  for (const f of flags) {
    const flag = await prisma.featureFlag.upsert({
      where: { key: f.key },
      create: { key: f.key, enabled: f.enabled, plans: f.plans, config: f.config as object },
      update: { enabled: f.enabled, plans: f.plans, config: f.config as object },
    });
    result.push(flag);
  }
  await recordAudit({
    actorId: adminId,
    action: 'admin.feature-flags.update',
    metadata: { keys: flags.map((f) => f.key) },
    ip,
  });
  return result;
}

export async function broadcast(adminId: string, input: { title: string; body?: string; data: Record<string, unknown> }, ip?: string) {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true },
    take: 5000,
  });
  const { emitToUser } = await import('../../realtime/events');
  let sent = 0;
  const chunks: { id: string }[][] = [];
  for (let i = 0; i < users.length; i += 500) chunks.push(users.slice(i, i + 500));
  for (const chunk of chunks) {
    await prisma.notification.createMany({
      data: chunk.map((u) => ({
        userId: u.id,
        type: 'SYSTEM' as const,
        title: input.title,
        body: input.body ?? null,
        data: input.data as object,
      })),
    });
    for (const u of chunk) {
      emitToUser(u.id, 'notification:new', {
        notification: { type: 'SYSTEM', title: input.title, body: input.body ?? null },
      });
    }
    sent += chunk.length;
  }
  await recordAudit({
    actorId: adminId,
    action: 'admin.notifications.broadcast',
    metadata: { title: input.title, recipients: sent },
    ip,
  });
  return { sent };
}
