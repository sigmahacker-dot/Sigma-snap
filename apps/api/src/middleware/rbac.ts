import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { forbidden, unauthorized } from '../utils/errors';

const RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2 };

/** RBAC guard: USER < MODERATOR < ADMIN. */
export function requireRole(minimum: 'MODERATOR' | 'ADMIN') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthorized('AUTH_REQUIRED', 'Authentication required'));
      return;
    }
    if (RANK[req.user.role] < RANK[minimum]) {
      next(forbidden('FORBIDDEN', `Requires ${minimum} role or higher`));
      return;
    }
    next();
  };
}
