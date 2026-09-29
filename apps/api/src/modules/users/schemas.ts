import { z } from 'zod';
import { usernameSchema } from '../auth/schemas';
import { LocationShareMode, PrivacyLevel, StoryPrivacy } from '@prisma/client';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.string().optional(),
});

export const updateMeSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  bio: z.string().max(500).nullable().optional(),
  website: z.string().url().max(255).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
});

export const changeUsernameSchema = z.object({
  username: usernameSchema,
});

export const setAvatarSchema = z.object({
  assetId: z.string().uuid(),
});

export const updatePrivacySchema = z.object({
  isPrivate: z.boolean().optional(),
  allowMessagesFrom: z.nativeEnum(PrivacyLevel).optional(),
  storyPrivacyDefault: z.nativeEnum(StoryPrivacy).optional(),
  showOnlineStatus: z.boolean().optional(),
});

export const updateNotificationPrefsSchema = z.object({
  likes: z.boolean().optional(),
  comments: z.boolean().optional(),
  follows: z.boolean().optional(),
  messages: z.boolean().optional(),
  stories: z.boolean().optional(),
  calls: z.boolean().optional(),
});

export const updateLocationSchema = z.object({
  mode: z.nativeEnum(LocationShareMode),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  minutes: z.number().int().positive().max(24 * 60).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const usernameParamSchema = z.object({
  username: z.string().min(1).max(64),
});
