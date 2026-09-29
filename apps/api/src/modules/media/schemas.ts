import { z } from 'zod';
import { MediaKind } from '@prisma/client';

export const presignSchema = z.object({
  kind: z.nativeEnum(MediaKind),
  mimeType: z.string().min(3).max(128),
  sizeBytes: z.number().int().positive().max(4 * 1024 * 1024 * 1024),
});

export const completeUploadSchema = z.object({
  width: z.number().int().positive().max(16384).optional(),
  height: z.number().int().positive().max(16384).optional(),
  durationSec: z.number().positive().max(24 * 3600).optional(),
});
