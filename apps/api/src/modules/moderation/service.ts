import type { ReportTargetType } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../utils/errors';
import { recordAudit } from '../../middleware/audit';

export async function createReport(userId: string, input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
}) {
  const report = await prisma.report.create({
    data: {
      reporterId: userId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details ?? null,
    },
  });
  return report;
}

export async function myReports(userId: string) {
  return prisma.report.findMany({
    where: { reporterId: userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createAppeal(userId: string, input: {
  reportId?: string;
  moderationActionId?: string;
  text: string;
}) {
  if (input.reportId) {
    const report = await prisma.report.findFirst({ where: { id: input.reportId, reporterId: userId } });
    if (!report) throw notFound('REPORT_NOT_FOUND', 'Report not found');
  }
  if (input.moderationActionId) {
    const action = await prisma.moderationAction.findUnique({ where: { id: input.moderationActionId } });
    if (!action) throw notFound('ACTION_NOT_FOUND', 'Moderation action not found');
  }
  const appeal = await prisma.appeal.create({
    data: {
      appellantId: userId,
      reportId: input.reportId ?? null,
      moderationActionId: input.moderationActionId ?? null,
      text: input.text,
    },
  });
  if (input.reportId) {
    await prisma.report.update({ where: { id: input.reportId }, data: { status: 'APPEALED' } });
  }
  return appeal;
}

export async function myAppeals(userId: string) {
  return prisma.appeal.findMany({
    where: { appellantId: userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

/** Admin: resolve a report with a status + optional moderation action. */
export async function resolveReport(
  moderatorId: string,
  reportId: string,
  input: { status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED'; action?: 'WARN' | 'REMOVE_CONTENT' | 'SUSPEND' | 'BAN' | 'FEATURE' | 'UNFEATURE'; reason?: string },
  ip?: string,
) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw notFound('REPORT_NOT_FOUND', 'Report not found');

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: input.status,
      resolvedById: moderatorId,
      resolvedAt: input.status === 'RESOLVED' || input.status === 'DISMISSED' ? new Date() : null,
    },
  });

  if (input.action) {
    const validTransitions: Record<string, string[]> = {
      WARN: ['USER'],
      REMOVE_CONTENT: ['POST', 'STORY', 'COMMENT', 'MESSAGE', 'SOUND', 'LENS', 'TEMPLATE'],
      SUSPEND: ['USER'],
      BAN: ['USER'],
      FEATURE: ['POST', 'STORY'],
      UNFEATURE: ['POST', 'STORY'],
    };
    if (!validTransitions[input.action]?.includes(report.targetType)) {
      throw badRequest('INVALID_ACTION_TARGET', `Action ${input.action} cannot target ${report.targetType}`);
    }
    await applyModerationAction(moderatorId, {
      targetType: report.targetType,
      targetId: report.targetId,
      action: input.action,
      reason: input.reason ?? `report ${reportId}`,
    }, ip);
  }

  await recordAudit({
    actorId: moderatorId,
    action: 'moderation.resolve-report',
    entityType: 'Report',
    entityId: reportId,
    metadata: { status: input.status, action: input.action ?? null },
    ip,
  });
  return updated;
}

/** Admin: apply a moderation action to a target and audit-log it. */
export async function applyModerationAction(
  moderatorId: string,
  input: {
    targetType: ReportTargetType;
    targetId: string;
    action: 'WARN' | 'REMOVE_CONTENT' | 'SUSPEND' | 'BAN' | 'UNBAN' | 'FEATURE' | 'UNFEATURE';
    reason?: string;
  },
  ip?: string,
) {
  const action = await prisma.moderationAction.create({
    data: {
      moderatorId,
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      reason: input.reason ?? null,
    },
  });

  switch (input.action) {
    case 'REMOVE_CONTENT':
      if (input.targetType === 'POST') {
        await prisma.post.updateMany({ where: { id: input.targetId }, data: { deletedAt: new Date() } });
      } else if (input.targetType === 'STORY') {
        await prisma.story.updateMany({ where: { id: input.targetId }, data: { deletedAt: new Date() } });
      } else if (input.targetType === 'COMMENT') {
        await prisma.comment.updateMany({ where: { id: input.targetId }, data: { deletedAt: new Date() } });
      } else if (input.targetType === 'MESSAGE') {
        await prisma.message.updateMany({ where: { id: input.targetId }, data: { isDeleted: true } });
      } else if (input.targetType === 'SOUND' || input.targetType === 'LENS' || input.targetType === 'TEMPLATE') {
        // deactivation handled by admin content endpoints; log only
      }
      break;
    case 'SUSPEND':
      if (input.targetType === 'USER') {
        await prisma.user.update({
          where: { id: input.targetId },
          data: { suspendedUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
        });
      }
      break;
    case 'BAN':
      if (input.targetType === 'USER') {
        await prisma.user.update({ where: { id: input.targetId }, data: { isBanned: true } });
      }
      break;
    case 'UNBAN':
      if (input.targetType === 'USER') {
        await prisma.user.update({
          where: { id: input.targetId },
          data: { isBanned: false, bannedUntil: null, suspendedUntil: null },
        });
      }
      break;
    case 'FEATURE':
      if (input.targetType === 'POST') {
        await prisma.post.updateMany({ where: { id: input.targetId }, data: { isFeatured: true } });
      }
      break;
    case 'UNFEATURE':
      if (input.targetType === 'POST') {
        await prisma.post.updateMany({ where: { id: input.targetId }, data: { isFeatured: false } });
      }
      break;
    case 'WARN':
      break;
  }

  await recordAudit({
    actorId: moderatorId,
    action: `moderation.${input.action.toLowerCase()}`,
    entityType: input.targetType,
    entityId: input.targetId,
    metadata: { reason: input.reason ?? null, actionId: action.id },
    ip,
  });
  return action;
}
