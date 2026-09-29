import type { Plan, Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  plan: Plan;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
