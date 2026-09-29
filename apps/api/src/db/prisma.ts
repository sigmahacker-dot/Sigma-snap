import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __sigmaPrisma: PrismaClient | undefined;
}

/** PrismaClient singleton — safe across tsx watch restarts. */
export const prisma: PrismaClient =
  globalThis.__sigmaPrisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__sigmaPrisma = prisma;
}

export default prisma;
