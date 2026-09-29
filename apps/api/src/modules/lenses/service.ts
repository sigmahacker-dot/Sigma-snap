import type { LensCategory, Plan } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { forbidden, notFound } from '../../utils/errors';
import { planAtLeast } from '../../config/plans';
import { recordAudit } from '../../middleware/audit';

export async function listLenses(category?: LensCategory) {
  return prisma.lens.findMany({
    where: { isActive: true, ...(category ? { category } : {}) },
    orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
}

export async function getLens(id: string) {
  const lens = await prisma.lens.findFirst({ where: { id, isActive: true } });
  if (!lens) throw notFound('LENS_NOT_FOUND', 'Lens not found');
  return lens;
}

/** Premium lenses require PRO or CREATOR. Increments usage on success. */
export async function useLens(userId: string, plan: Plan, id: string, assetId?: string) {
  const lens = await prisma.lens.findFirst({ where: { id, isActive: true } });
  if (!lens) throw notFound('LENS_NOT_FOUND', 'Lens not found');
  if (lens.isPremium && !planAtLeast(plan, 'PRO')) {
    throw forbidden('PREMIUM_REQUIRED', 'This lens requires a Pro or Creator plan');
  }
  if (assetId) {
    const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, deletedAt: null } });
    if (!asset || asset.ownerId !== userId) throw forbidden('NOT_OWNER', 'Asset not found or not yours');
  }
  const updated = await prisma.lens.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  return { lens: updated, assetId: assetId ?? null };
}

export async function adminCreateLens(userId: string, input: {
  name: string; category: LensCategory; description?: string; bundleUrl?: string;
  config?: Record<string, unknown>; thumbnailUrl?: string; isPremium?: boolean;
}, ip?: string) {
  const lens = await prisma.lens.create({
    data: {
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      bundleUrl: input.bundleUrl ?? null,
      config: (input.config ?? {}) as object,
      thumbnailUrl: input.thumbnailUrl ?? null,
      isPremium: input.isPremium ?? false,
      createdById: userId,
    },
  });
  await recordAudit({ actorId: userId, action: 'lens.create', entityType: 'Lens', entityId: lens.id, ip });
  return lens;
}

export async function adminPatchLens(userId: string, id: string, input: Partial<{
  name: string; category: LensCategory; description?: string; bundleUrl?: string;
  config: Record<string, unknown>; thumbnailUrl?: string; isPremium: boolean; isActive: boolean;
}>, ip?: string) {
  const lens = await prisma.lens.findUnique({ where: { id } });
  if (!lens) throw notFound('LENS_NOT_FOUND', 'Lens not found');
  const updated = await prisma.lens.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.bundleUrl !== undefined ? { bundleUrl: input.bundleUrl } : {}),
      ...(input.config !== undefined ? { config: input.config as object } : {}),
      ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
      ...(input.isPremium !== undefined ? { isPremium: input.isPremium } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  await recordAudit({ actorId: userId, action: 'lens.update', entityType: 'Lens', entityId: id, ip });
  return updated;
}

export async function adminDeleteLens(userId: string, id: string, ip?: string) {
  const lens = await prisma.lens.findUnique({ where: { id } });
  if (!lens) throw notFound('LENS_NOT_FOUND', 'Lens not found');
  await prisma.lens.update({ where: { id }, data: { isActive: false } });
  await recordAudit({ actorId: userId, action: 'lens.delete', entityType: 'Lens', entityId: id, ip });
  return { ok: true };
}
