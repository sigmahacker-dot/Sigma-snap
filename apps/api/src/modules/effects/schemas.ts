import { z } from 'zod';

export const listEffectsQuery = z.object({
  category: z.string().max(64).optional(),
});

export const createEffectSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  config: z.record(z.unknown()).default({}),
  thumbnailUrl: z.string().url().max(1024).optional(),
  isPremium: z.boolean().default(false),
});

export const patchEffectSchema = createEffectSchema.partial();
