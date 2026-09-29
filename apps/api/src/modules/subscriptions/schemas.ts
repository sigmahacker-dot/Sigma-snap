import { z } from 'zod';
import { Plan } from '@prisma/client';

export const checkoutSchema = z.object({
  plan: z.enum([Plan.PRO, Plan.CREATOR]),
});
