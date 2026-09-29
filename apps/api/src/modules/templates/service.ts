import { MediaStatus, PostStatus, TemplateCategory } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { planAtLeast } from '../../config/plans';
import { recordAudit } from '../../middleware/audit';

interface Slot {
  index: number;
  kind: 'media' | 'text';
  label: string;
  required: boolean;
}

function slotsOf(template: { slots: unknown }): Slot[] {
  return Array.isArray(template.slots) ? (template.slots as Slot[]) : [];
}

export async function listTemplates(category?: TemplateCategory) {
  return prisma.template.findMany({
    where: { isPublished: true, deletedAt: null, ...(category ? { category } : {}) },
    orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
}

export async function getTemplate(id: string) {
  const template = await prisma.template.findFirst({
    where: { id, isPublished: true, deletedAt: null },
    include: { music: true, assets: true },
  });
  if (!template) throw notFound('TEMPLATE_NOT_FOUND', 'Template not found');
  return template;
}

/** Instantiate a template into a DRAFT post. */
export async function useTemplate(
  userId: string,
  plan: 'FREE' | 'PRO' | 'CREATOR',
  id: string,
  input: { media: Record<string, string>; texts: Record<string, string>; musicId?: string },
) {
  const template = await prisma.template.findFirst({ where: { id, isPublished: true, deletedAt: null } });
  if (!template) throw notFound('TEMPLATE_NOT_FOUND', 'Template not found');
  if (template.isPremium && !planAtLeast(plan, 'PRO')) {
    throw forbidden('PREMIUM_REQUIRED', 'This template requires a Pro or Creator plan');
  }
  const slots = slotsOf(template);
  const missing: string[] = [];
  for (const s of slots) {
    if (!s.required) continue;
    if (s.kind === 'media' && !input.media[String(s.index)]) missing.push(`media slot ${s.index} (${s.label})`);
    if (s.kind === 'text' && !input.texts[String(s.index)]) missing.push(`text slot ${s.index} (${s.label})`);
  }
  if (missing.length > 0) {
    throw badRequest('TEMPLATE_SLOTS_MISSING', 'Required template slots are missing', { missing });
  }

  const assetIds = Object.values(input.media);
  if (assetIds.length > 0) {
    const assets = await prisma.mediaAsset.findMany({ where: { id: { in: assetIds }, deletedAt: null } });
    if (assets.length !== assetIds.length) throw badRequest('ASSET_NOT_FOUND', 'One or more media assets were not found');
    for (const a of assets) {
      if (a.ownerId !== userId) throw forbidden('NOT_OWNER', 'You do not own all of these assets');
      if (a.status !== MediaStatus.READY) throw badRequest('ASSET_NOT_READY', `Asset ${a.id} is not ready yet`);
    }
  }

  const caption = Object.entries(input.texts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, v]) => v)
    .join('\n');

  const post = await prisma.post.create({
    data: {
      userId,
      kind: 'PHOTO',
      caption: caption || null,
      musicId: input.musicId ?? template.musicId ?? null,
      isPublic: false,
      status: PostStatus.DRAFT,
      assets: { connect: assetIds.map((aid) => ({ id: aid })) },
    },
  });
  await prisma.template.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  return { post, template: { id: template.id, title: template.title } };
}

export async function adminCreateTemplate(userId: string, input: {
  title: string; description?: string; category: TemplateCategory; previewUrl?: string;
  durationSec?: number; slots?: Slot[]; effects?: unknown[]; musicId?: string;
  transitions?: unknown[]; filters?: string[]; isPremium?: boolean; isPublished?: boolean;
}, ip?: string) {
  const template = await prisma.template.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      previewUrl: input.previewUrl ?? null,
      durationSec: input.durationSec ?? null,
      slots: (input.slots ?? []) as object,
      effects: (input.effects ?? []) as object,
      musicId: input.musicId ?? null,
      transitions: (input.transitions ?? []) as object,
      filters: (input.filters ?? []) as object,
      isPremium: input.isPremium ?? false,
      isPublished: input.isPublished ?? false,
      createdById: userId,
    },
  });
  await recordAudit({ actorId: userId, action: 'template.create', entityType: 'Template', entityId: template.id, ip });
  return template;
}

export async function adminPatchTemplate(userId: string, id: string, input: Partial<{
  title: string; description?: string; category: TemplateCategory; previewUrl?: string;
  durationSec?: number; slots: Slot[]; effects: unknown[]; musicId?: string;
  transitions: unknown[]; filters: string[]; isPremium: boolean; isPublished: boolean;
}>, ip?: string) {
  const template = await prisma.template.findFirst({ where: { id, deletedAt: null } });
  if (!template) throw notFound('TEMPLATE_NOT_FOUND', 'Template not found');
  const updated = await prisma.template.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl } : {}),
      ...(input.durationSec !== undefined ? { durationSec: input.durationSec } : {}),
      ...(input.slots !== undefined ? { slots: input.slots as object } : {}),
      ...(input.effects !== undefined ? { effects: input.effects as object } : {}),
      ...(input.musicId !== undefined ? { musicId: input.musicId } : {}),
      ...(input.transitions !== undefined ? { transitions: input.transitions as object } : {}),
      ...(input.filters !== undefined ? { filters: input.filters as object } : {}),
      ...(input.isPremium !== undefined ? { isPremium: input.isPremium } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
    },
  });
  await recordAudit({ actorId: userId, action: 'template.update', entityType: 'Template', entityId: id, ip });
  return updated;
}

export async function adminDeleteTemplate(userId: string, id: string, ip?: string) {
  const template = await prisma.template.findFirst({ where: { id, deletedAt: null } });
  if (!template) throw notFound('TEMPLATE_NOT_FOUND', 'Template not found');
  await prisma.template.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({ actorId: userId, action: 'template.delete', entityType: 'Template', entityId: id, ip });
  return { ok: true };
}
