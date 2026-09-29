import { z } from 'zod';
import { CallType } from '@prisma/client';

export const createCallSchema = z.object({
  userId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  type: z.nativeEnum(CallType),
}).refine((d) => d.userId || d.conversationId, {
  message: 'Either userId or conversationId is required',
});
