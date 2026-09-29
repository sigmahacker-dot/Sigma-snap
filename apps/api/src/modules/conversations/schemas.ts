import { z } from 'zod';
import { ConversationType, MessageType } from '@prisma/client';

export const createConversationSchema = z.object({
  type: z.nativeEnum(ConversationType).default('DIRECT'),
  userIds: z.array(z.string().uuid()).min(1).max(50),
  title: z.string().max(80).optional(),
});

export const patchConversationSchema = z.object({
  title: z.string().max(80).nullable().optional(),
  disappearingAfterSec: z.number().int().min(0).max(7 * 24 * 3600).optional(),
});

export const readConversationSchema = z.object({
  lastReadAt: z.string().datetime().optional(),
});

export const sendMessageSchema = z.object({
  type: z.nativeEnum(MessageType).default('TEXT'),
  text: z.string().max(4000).optional(),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
  replyToId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const conversationIdParam = z.object({
  id: z.string().uuid(),
});
