import { MediaStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { recordAudit } from '../../middleware/audit';

export async function listSounds(q?: string, sort: 'trending' | 'new' = 'trending') {
  return prisma.sound.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { artist: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: sort === 'new' ? { createdAt: 'desc' } : { usageCount: 'desc' },
    take: 50,
  });
}

export async function createSound(userId: string, input: { title: string; artist?: string; assetId?: string }) {
  let url: string | null = null;
  let durationSec: number | null = null;
  if (input.assetId) {
    const asset = await prisma.mediaAsset.findFirst({ where: { id: input.assetId, deletedAt: null } });
    if (!asset || asset.ownerId !== userId) throw badRequest('INVALID_ASSET', 'Audio asset not found or not yours');
    if (asset.status !== MediaStatus.READY) throw badRequest('ASSET_NOT_READY', 'Audio asset is not ready yet');
    url = asset.url;
    durationSec = asset.durationSec;
  }
  return prisma.sound.create({
    data: {
      title: input.title,
      artist: input.artist ?? null,
      url,
      durationSec,
      license: 'USER_UPLOAD',
      uploadedById: userId,
    },
  });
}

export async function getSound(id: string) {
  const sound = await prisma.sound.findFirst({ where: { id, isActive: true } });
  if (!sound) throw notFound('SOUND_NOT_FOUND', 'Sound not found');
  return sound;
}

export async function soundPosts(id: string) {
  const sound = await prisma.sound.findFirst({ where: { id, isActive: true }, select: { id: true } });
  if (!sound) throw notFound('SOUND_NOT_FOUND', 'Sound not found');
  return prisma.post.findMany({
    where: { musicId: id, deletedAt: null, status: 'PUBLISHED', isPublic: true },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function deleteSound(userId: string, role: string, id: string, ip?: string) {
  const sound = await prisma.sound.findUnique({ where: { id } });
  if (!sound) throw notFound('SOUND_NOT_FOUND', 'Sound not found');
  if (sound.uploadedById !== userId && role !== 'ADMIN') {
    throw forbidden('FORBIDDEN', 'Only the uploader or an admin can delete this sound');
  }
  await prisma.sound.update({ where: { id }, data: { isActive: false } });
  await recordAudit({ actorId: userId, action: 'sound.delete', entityType: 'Sound', entityId: id, ip });
  return { ok: true };
}
