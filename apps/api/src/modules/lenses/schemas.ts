import { z } from 'zod';
import { LensCategory } from '@prisma/client';

export const listLensesQuery = z.object({
  category: z.nativeEnum(LensCategory).optional(),
});

export const useLensSchema = z.object({
  assetId: z.string().uuid().optional(),
});

export const createLensSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.nativeEnum(LensCategory),
  description: z.string().max(500).optional(),
  bundleUrl: z.string().url().max(1024).optional(),
  config: z.record(z.unknown()).default({}),
  thumbnailUrl: z.string().url().max(1024).optional(),
  isPremium: z.boolean().default(false),
});

export const patchLensSchema = createLensSchema.partial();
