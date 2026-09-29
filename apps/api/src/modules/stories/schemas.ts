import { z } from 'zod';
import { MediaKind, StoryPrivacy } from '@prisma/client';

export const createStorySchema = z.object({
  assetId: z.string().uuid(),
  mediaType: z.nativeEnum(MediaKind),
  caption: z.string().max(500).optional(),
  textOverlays: z.array(z.record(z.unknown())).default([]),
  stickers: z.array(z.record(z.unknown())).default([]),
  musicId: z.string().uuid().optional(),
  locationName: z.string().max(120).optional(),
  mentions: z.array(z.string().max(32)).default([]),
  poll: z.record(z.unknown()).nullable().optional(),
  question: z.string().max(300).optional(),
  privacy: z.nativeEnum(StoryPrivacy).optional(),
  hideFrom: z.array(z.string().uuid()).default([]),
});

export const reactSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const replySchema = z.object({
  text: z.string().min(1).max(1000),
});

export const createHighlightSchema = z.object({
  title: z.string().min(1).max(60),
  storyIds: z.array(z.string().uuid()).default([]),
  coverAssetId: z.string().uuid().optional(),
});

export const updateHighlightSchema = z.object({
  title: z.string().min(1).max(60).optional(),
  storyIds: z.array(z.string().uuid()).optional(),
  coverAssetId: z.string().uuid().nullable().optional(),
});
