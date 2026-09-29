import { z } from 'zod';

export const searchSchema = z.object({
  q: z.string().min(1).max(100),
  type: z.enum(['all', 'users', 'videos', 'sounds', 'hashtags', 'effects', 'templates', 'places']).default('all'),
});

export const suggestionsSchema = z.object({
  q: z.string().min(1).max(100),
});
