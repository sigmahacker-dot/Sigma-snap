import { z } from 'zod';

export const languageSchema = z.enum(['ur', 'roman-ur', 'en', 'ar', 'hi']).default('en');

export const captionSchema = z.object({
  context: z.string().max(500).optional(),
  language: languageSchema,
});

export const hashtagsSchema = z.object({
  caption: z.string().max(1000).optional(),
  language: languageSchema,
});

export const titleSchema = z.object({
  context: z.string().max(500).optional(),
  language: languageSchema,
});

export const scriptSchema = z.object({
  topic: z.string().min(1).max(200),
  durationSec: z.number().int().positive().max(600).optional(),
  language: languageSchema,
});

export const ideasSchema = z.object({
  kind: z.enum(['story', 'video']),
  niche: z.string().max(100).optional(),
  language: languageSchema,
});

export const thumbnailSchema = z.object({
  postId: z.string().uuid(),
});

export const subtitlesSchema = z.object({
  assetId: z.string().uuid(),
  language: languageSchema,
});

export const translateSchema = z.object({
  text: z.string().min(1).max(2000),
  targetLang: z.enum(['ur', 'roman-ur', 'en', 'ar', 'hi']),
});

export const voiceSchema = z.object({
  text: z.string().min(1).max(1000),
  voice: z.string().max(64).optional(),
  language: languageSchema,
});

export const backgroundSchema = z.object({
  assetId: z.string().uuid(),
  prompt: z.string().min(1).max(500),
});

export const effectSchema = z.object({
  prompt: z.string().min(1).max(500),
  language: languageSchema,
});
