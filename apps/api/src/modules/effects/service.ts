import type { Plan } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { forbidden, notFound } from '../../utils/errors';
import { planAtLeast } from '../../config/plans';
import { recordAudit } from '../../middleware/audit';

export async function listEffects(category?: string) {
  return prisma.effect.findMany({
    where: { isActive: true, ...(category ? { category } : {}) },
    orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
}

export async function getEffect(id: string) {
  const effect = await prisma.effect.findFirst({ where: { id, isActive: true } });
  if (!effect) throw notFound('EFFECT_NOT_FOUND', 'Effect not found');
  return effect;
}

export async function useEffect(userId: string, plan: Plan, id: string) {
  const effect = await prisma.effect.findFirst({ where: { id, isActive: true } });
  if (!effect) throw notFound('EFFECT_NOT_FOUND', 'Effect not found');
  if (effect.isPremium && !planAtLeast(plan, 'PRO')) {
    throw forbidden('PREMIUM_REQUIRED', 'This effect requires a Pro or Creator plan');
  }
  void userId;
  return prisma.effect.update({ where: { id }, data: { usageCount: { increment: 1 } } });
}

export async function adminCreateEffect(userId: string, input: {
  name: string; category: string; description?: string;
  config?: Record<string, unknown>; thumbnailUrl?: string; isPremium?: boolean;
}, ip?: string) {
  const effect = await prisma.effect.create({
    data: {
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      config: (input.config ?? {}) as object,
      thumbnailUrl: input.thumbnailUrl ?? null,
      isPremium: input.isPremium ?? false,
      createdById: userId,
    },
  });
  await recordAudit({ actorId: userId, action: 'effect.create', entityType: 'Effect', entityId: effect.id, ip });
  return effect;
}

export async function adminPatchEffect(userId: string, id: string, input: Partial<{
  name: string; category: string; description?: string;
  config: Record<string, unknown>; thumbnailUrl?: string; isPremium: boolean; isActive: boolean;
}>, ip?: string) {
  const effect = await prisma.effect.findUnique({ where: { id } });
  if (!effect) throw notFound('EFFECT_NOT_FOUND', 'Effect not found');
  const updated = await prisma.effect.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.config !== undefined ? { config: input.config as object } : {}),
      ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
      ...(input.isPremium !== undefined ? { isPremium: input.isPremium } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  await recordAudit({ actorId: userId, action: 'effect.update', entityType: 'Effect', entityId: id, ip });
  return updated;
}

export async function adminDeleteEffect(userId: string, id: string, ip?: string) {
  const effect = await prisma.effect.findUnique({ where: { id } });
  if (!effect) throw notFound('EFFECT_NOT_FOUND', 'Effect not found');
  await prisma.effect.update({ where: { id }, data: { isActive: false } });
  await recordAudit({ actorId: userId, action: 'effect.delete', entityType: 'Effect', entityId: id, ip });
  return { ok: true };
}
