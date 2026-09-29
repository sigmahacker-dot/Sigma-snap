// Admin CMS service: announcements, feature flags (per-key), managed lenses,
// and the public remote-config payload consumed by the app shell.
import type { Plan } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../utils/errors';
import { recordAudit } from '../../middleware/audit';
import { clampLimit } from '../../utils/pagination';

export interface AnnouncementInput {
  title: string;
  body: string;
  imageUrl?: string;
  ctaUrl?: string;
  active?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export async function listAnnouncements(limitRaw?: unknown) {
  const limit = clampLimit(limitRaw, 50);
  return prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
}

export async function createAnnouncement(adminId: string, input: AnnouncementInput, ip?: string) {
  if (input.startsAt && input.endsAt && new Date(input.startsAt) > new Date(input.endsAt)) {
    throw badRequest('INVALID_WINDOW', 'startsAt must be before endsAt');
  }
  const created = await prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? null,
      ctaUrl: input.ctaUrl ?? null,
      active: input.active ?? true,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    },
  });
  await recordAudit({ actorId: adminId, action: 'admin.announcement.create', entityType: 'Announcement', entityId: created.id, metadata: { title: created.title }, ip });
  return created;
}

export async function updateAnnouncement(adminId: string, id: string, input: Partial<AnnouncementInput>, ip?: string) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw notFound('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
  const startsAt = input.startsAt !== undefined ? (input.startsAt ? new Date(input.startsAt) : null) : undefined;
  const endsAt = input.endsAt !== undefined ? (input.endsAt ? new Date(input.endsAt) : null) : undefined;
  const s = startsAt !== undefined ? startsAt : existing.startsAt;
  const e = endsAt !== undefined ? endsAt : existing.endsAt;
  if (s && e && s > e) throw badRequest('INVALID_WINDOW', 'startsAt must be before endsAt');
  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl ?? null } : {}),
      ...(input.ctaUrl !== undefined ? { ctaUrl: input.ctaUrl ?? null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(startsAt !== undefined ? { startsAt } : {}),
      ...(endsAt !== undefined ? { endsAt } : {}),
    },
  });
  await recordAudit({ actorId: adminId, action: 'admin.announcement.update', entityType: 'Announcement', entityId: id, ip });
  return updated;
}

export async function deleteAnnouncement(adminId: string, id: string, ip?: string) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw notFound('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
  await prisma.announcement.delete({ where: { id } });
  await recordAudit({ actorId: adminId, action: 'admin.announcement.delete', entityType: 'Announcement', entityId: id, ip });
  return { ok: true };
}

// ─── Feature flags (per-key patch; bulk upsert already exists) ──────────

export async function patchFeatureFlag(
  adminId: string,
  key: string,
  input: { enabled?: boolean; description?: string | null; plans?: Plan[]; config?: Record<string, unknown> },
  ip?: string,
) {
  const existing = await prisma.featureFlag.findUnique({ where: { key } });
  if (!existing) throw notFound('FLAG_NOT_FOUND', 'Feature flag not found');
  const updated = await prisma.featureFlag.update({
    where: { key },
    data: {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.plans !== undefined ? { plans: input.plans } : {}),
      ...(input.config !== undefined ? { config: input.config as object } : {}),
    },
  });
  await recordAudit({ actorId: adminId, action: 'admin.feature-flag.patch', entityType: 'FeatureFlag', entityId: key, metadata: input, ip });
  return updated;
}

// ─── Managed lenses ─────────────────────────────────────────────────────

export interface ManagedLensInput {
  key: string;
  name: string;
  description?: string;
  configJson?: Record<string, unknown>;
  enabled?: boolean;
  sortOrder?: number;
}

export async function listManagedLenses(limitRaw?: unknown) {
  const limit = clampLimit(limitRaw, 200);
  return prisma.managedLens.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: limit });
}

export async function createManagedLens(adminId: string, input: ManagedLensInput, ip?: string) {
  const dup = await prisma.managedLens.findUnique({ where: { key: input.key } });
  if (dup) throw badRequest('LENS_KEY_TAKEN', 'A managed lens with this key already exists');
  const created = await prisma.managedLens.create({
    data: {
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      configJson: (input.configJson ?? {}) as object,
      enabled: input.enabled ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await recordAudit({ actorId: adminId, action: 'admin.managed-lens.create', entityType: 'ManagedLens', entityId: created.id, metadata: { key: created.key }, ip });
  return created;
}

export async function updateManagedLens(adminId: string, id: string, input: Partial<Omit<ManagedLensInput, 'key'>>, ip?: string) {
  const existing = await prisma.managedLens.findUnique({ where: { id } });
  if (!existing) throw notFound('LENS_NOT_FOUND', 'Managed lens not found');
  const updated = await prisma.managedLens.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.configJson !== undefined ? { configJson: input.configJson as object } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  await recordAudit({ actorId: adminId, action: 'admin.managed-lens.update', entityType: 'ManagedLens', entityId: id, ip });
  return updated;
}

export async function deleteManagedLens(adminId: string, id: string, ip?: string) {
  const existing = await prisma.managedLens.findUnique({ where: { id } });
  if (!existing) throw notFound('LENS_NOT_FOUND', 'Managed lens not found');
  await prisma.managedLens.delete({ where: { id } });
  await recordAudit({ actorId: adminId, action: 'admin.managed-lens.delete', entityType: 'ManagedLens', entityId: id, ip });
  return { ok: true };
}

// ─── Public remote config (app shell) ───────────────────────────────────

export async function publicConfig() {
  const now = new Date();
  const [announcements, flags, lenses] = await Promise.all([
    prisma.announcement.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }),
    prisma.managedLens.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);
  return {
    announcements,
    flags: Object.fromEntries(flags.map((f) => [f.key, f.enabled])),
    lenses,
  };
}
