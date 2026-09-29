import { z } from 'zod';
import { MediaKind } from '@prisma/client';

export const createPostSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(10),
  kind: z.nativeEnum(MediaKind),
  caption: z.string().max(2200).optional(),
  mentions: z.array(z.string().max(32)).default([]),
  locationName: z.string().max(120).optional(),
  musicId: z.string().uuid().optional(),
  isPublic: z.boolean().default(true),
  allowComments: z.boolean().default(true),
});

export const patchPostSchema = z.object({
  caption: z.string().max(2200).nullable().optional(),
  isPublic: z.boolean().optional(),
  allowComments: z.boolean().optional(),
});

export const commentSchema = z.object({
  text: z.string().min(1).max(1000),
  parentId: z.string().uuid().optional(),
});

export const shareSchema = z.object({
  target: z.string().uuid().optional(),
});

export const reportPostSchema = z.object({
  reason: z.string().min(1).max(120),
  details: z.string().max(2000).optional(),
});
