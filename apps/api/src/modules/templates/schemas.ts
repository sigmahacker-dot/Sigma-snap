import { z } from 'zod';
import { TemplateCategory } from '@prisma/client';

export const listTemplatesQuery = z.object({
  category: z.nativeEnum(TemplateCategory).optional(),
});

export const useTemplateSchema = z.object({
  media: z.record(z.string().uuid()).default({}),
  texts: z.record(z.string().max(500)).default({}),
  musicId: z.string().uuid().optional(),
});

export const createTemplateSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.nativeEnum(TemplateCategory),
  previewUrl: z.string().url().max(1024).optional(),
  durationSec: z.number().positive().max(3600).optional(),
  slots: z.array(z.object({
    index: z.number().int().min(0),
    kind: z.enum(['media', 'text']),
    label: z.string().max(80),
    required: z.boolean().default(false),
  })).default([]),
  effects: z.array(z.record(z.unknown())).default([]),
  musicId: z.string().uuid().optional(),
  transitions: z.array(z.record(z.unknown())).default([]),
  filters: z.array(z.string().max(64)).default([]),
  isPremium: z.boolean().default(false),
  isPublished: z.boolean().default(false),
});

export const patchTemplateSchema = createTemplateSchema.partial();
