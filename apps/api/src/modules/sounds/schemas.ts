import { z } from 'zod';

export const listSoundsQuery = z.object({
  q: z.string().max(100).optional(),
  sort: z.enum(['trending', 'new']).default('trending'),
});

export const createSoundSchema = z.object({
  title: z.string().min(1).max(120),
  artist: z.string().max(120).optional(),
  assetId: z.string().uuid().optional(),
});
