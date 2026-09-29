import { z } from 'zod';
import { PushPlatform } from '@prisma/client';

export const pushTokenSchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.nativeEnum(PushPlatform),
});

export const deletePushTokenSchema = z.object({
  token: z.string().min(1).max(512),
});
