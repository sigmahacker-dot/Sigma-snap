import { z } from 'zod';

export const listMessagesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export const editMessageSchema = z.object({
  text: z.string().min(1).max(4000),
});

export const reactMessageSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const forwardMessageSchema = z.object({
  toConversationId: z.string().uuid(),
});

export const messageIdParam = z.object({
  id: z.string().uuid(),
});

export const conversationIdParam = z.object({
  id: z.string().uuid(),
});

export const emojiParam = z.object({
  id: z.string().uuid(),
  emoji: z.string().min(1).max(16),
});
