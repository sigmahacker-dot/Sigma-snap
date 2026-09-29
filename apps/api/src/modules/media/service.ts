import { MediaKind, MediaStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { maxFileBytes, storageQuotaBytes } from '../../config/plans';
import { getMalwareScanner } from '../../services/malware';
import { objectKeyFor, presignPut, publicUrl, keyFromUrl } from '../../services/storage';
import { enqueueVideoProcessing } from '../../queue/queues';

const MIME_ALLOW: Record<MediaKind, string[]> = {
  PHOTO: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  VIDEO: ['video/mp4', 'video/quicktime', 'video/webm'],
  AUDIO: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a'],
  THUMBNAIL: ['image/jpeg', 'image/png', 'image/webp'],
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'audio/x-m4a': '.m4a',
};

export async function presign(userId: string, plan: 'FREE' | 'PRO' | 'CREATOR', input: {
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
}) {
  const allowed = MIME_ALLOW[input.kind];
  if (!allowed.includes(input.mimeType.toLowerCase())) {
    throw badRequest('MIME_NOT_ALLOWED', `MIME type ${input.mimeType} is not allowed for ${input.kind}`, {
      allowed,
    });
  }
  const maxBytes = maxFileBytes(plan, input.kind);
  if (input.sizeBytes > maxBytes) {
    throw badRequest('FILE_TOO_LARGE', `File exceeds the ${plan} plan limit for ${input.kind}`, {
      sizeBytes: input.sizeBytes,
      maxBytes,
    });
  }
  const quota = storageQuotaBytes(plan);
  const used = await prisma.mediaAsset.aggregate({
    where: { ownerId: userId, deletedAt: null },
    _sum: { sizeBytes: true },
  });
  if ((used._sum.sizeBytes ?? 0) + input.sizeBytes > quota) {
    throw badRequest('STORAGE_QUOTA_EXCEEDED', 'Plan storage quota exceeded', {
      usedBytes: used._sum.sizeBytes ?? 0,
      quotaBytes: quota,
    });
  }

  const ext = EXT_BY_MIME[input.mimeType.toLowerCase()] ?? '';
  const asset = await prisma.mediaAsset.create({
    data: {
      ownerId: userId,
      kind: input.kind,
      url: '', // filled after key is known
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      status: MediaStatus.UPLOADED,
    },
  });
  const key = objectKeyFor(userId, asset.id, ext);
  const url = publicUrl(key);
  await prisma.mediaAsset.update({ where: { id: asset.id }, data: { url } });
  const { uploadUrl, expiresAt } = await presignPut(key, input.mimeType);
  return { assetId: asset.id, uploadUrl, expiresAt };
}

export async function completeUpload(userId: string, assetId: string, input: {
  width?: number;
  height?: number;
  durationSec?: number;
}) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw notFound('ASSET_NOT_FOUND', 'Media asset not found');
  if (asset.ownerId !== userId) throw forbidden('NOT_OWNER', 'You do not own this asset');
  if (asset.status !== MediaStatus.UPLOADED) {
    throw badRequest('INVALID_ASSET_STATE', `Asset is already ${asset.status}`);
  }

  // Malware screen (AllowAll fallback when no scanner configured — named honestly).
  const scan = await getMalwareScanner().scan({
    key: keyFromUrl(asset.url) ?? asset.url,
    mimeType: asset.mimeType ?? '',
    sizeBytes: asset.sizeBytes ?? 0,
  });
  if (!scan.clean) {
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: MediaStatus.FAILED } });
    throw badRequest('MALWARE_DETECTED', 'Upload failed the malware scan', { verdict: scan.verdict });
  }

  const updated = await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      width: input.width ?? null,
      height: input.height ?? null,
      durationSec: input.durationSec ?? null,
      status: asset.kind === MediaKind.VIDEO ? MediaStatus.PROCESSING : MediaStatus.READY,
    },
  });

  if (asset.kind === MediaKind.VIDEO) {
    await enqueueVideoProcessing(asset.id);
  }
  return updated;
}

export async function getAsset(viewerId: string | undefined, assetId: string) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, deletedAt: null },
    include: { post: { select: { id: true, isPublic: true, status: true, deletedAt: true } } },
  });
  if (!asset) throw notFound('ASSET_NOT_FOUND', 'Media asset not found');
  if (asset.ownerId === viewerId) return asset;
  // Public context: READY asset attached to a published public post.
  if (
    asset.status === MediaStatus.READY &&
    asset.post &&
    asset.post.isPublic &&
    asset.post.status === 'PUBLISHED' &&
    !asset.post.deletedAt
  ) {
    return asset;
  }
  throw notFound('ASSET_NOT_FOUND', 'Media asset not found');
}
