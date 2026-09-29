import { z } from 'zod';
import { Plan, Role, ReportStatus, AppealStatus } from '@prisma/client';

export const adminUsersQuery = z.object({
  q: z.string().max(100).optional(),
  filter: z.enum(['banned', 'suspended']).optional(),
  limit: z.string().optional(),
});

export const banUserSchema = z.object({
  days: z.number().int().positive().max(3650).optional(),
  reason: z.string().max(500).optional(),
});

export const suspendUserSchema = z.object({
  days: z.number().int().positive().max(3650).default(7),
  reason: z.string().max(500).optional(),
});

export const setPlanSchema = z.object({
  plan: z.nativeEnum(Plan),
});

export const setRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

export const adminReportsQuery = z.object({
  status: z.nativeEnum(ReportStatus).optional(),
});

export const resolveReportSchema = z.object({
  status: z.enum(['REVIEWING', 'RESOLVED', 'DISMISSED']),
  action: z.enum(['WARN', 'REMOVE_CONTENT', 'SUSPEND', 'BAN', 'FEATURE', 'UNFEATURE']).optional(),
  reason: z.string().max(500).optional(),
});

export const resolveAppealSchema = z.object({
  status: z.enum(['UPHELD', 'OVERTURNED']),
});

export const contentQuery = z.object({
  q: z.string().max(100).optional(),
  limit: z.string().optional(),
});

export const contentTypeParam = z.object({
  type: z.enum(['posts', 'stories', 'comments']),
});

export const contentIdParam = z.object({
  type: z.enum(['posts', 'stories', 'comments']),
  id: z.string().uuid(),
});

export const featureContentSchema = z.object({
  featured: z.boolean().default(true),
});

export const featureFlagsSchema = z.object({
  flags: z.array(
    z.object({
      key: z.string().min(1).max(64),
      enabled: z.boolean(),
      plans: z.array(z.nativeEnum(Plan)).default([]),
      config: z.record(z.unknown()).default({}),
    }),
  ),
});

export const broadcastSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  data: z.record(z.unknown()).default({}),
});

// ─── Admin CMS: announcements ────────────────────────────────────────────

export const announcementSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  imageUrl: z.string().url().max(500).optional(),
  ctaUrl: z.string().url().max(500).optional(),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export const announcementPatchSchema = announcementSchema.partial();

export const announcementIdParam = z.object({
  id: z.string().uuid(),
});

// ─── Admin CMS: feature flags (per-key patch; bulk PUT already exists) ───

export const featureFlagPatchSchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().max(300).optional().nullable(),
  plans: z.array(z.nativeEnum(Plan)).optional(),
  config: z.record(z.unknown()).optional(),
});

export const featureFlagKeyParam = z.object({
  key: z.string().min(1).max(64),
});

// ─── Admin CMS: managed lenses ───────────────────────────────────────────

const lensKey = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'key must be lowercase letters, numbers and dashes');

export const managedLensSchema = z.object({
  key: lensKey,
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  configJson: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const managedLensPatchSchema = managedLensSchema.partial().omit({ key: true });

export const managedLensIdParam = z.object({
  id: z.string().uuid(),
});
