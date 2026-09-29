import { z } from 'zod';

export const requestFriendSchema = z.object({
  toUserId: z.string().uuid(),
});

export const requestsQuerySchema = z.object({
  dir: z.enum(['incoming', 'outgoing']).default('incoming'),
});

export const requestIdSchema = z.object({
  id: z.string().uuid(),
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const discoverSchema = z.object({
  contactsPermission: z.boolean(),
  limit: z.number().int().positive().max(50).optional(),
});

export const discoverQuerySchema = z.object({
  contactsPermission: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
