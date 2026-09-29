import { z } from 'zod';
import { ReportTargetType } from '@prisma/client';

export const createReportSchema = z.object({
  targetType: z.nativeEnum(ReportTargetType),
  targetId: z.string().min(1).max(64),
  reason: z.string().min(1).max(120),
  details: z.string().max(2000).optional(),
});

export const createAppealSchema = z.object({
  reportId: z.string().uuid().optional(),
  moderationActionId: z.string().uuid().optional(),
  text: z.string().min(1).max(2000),
}).refine((d) => d.reportId || d.moderationActionId, {
  message: 'Either reportId or moderationActionId is required',
});
