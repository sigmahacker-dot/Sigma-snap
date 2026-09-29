import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env, ttlToSeconds } from '../config/env';
import { prisma } from '../db/prisma';
import { ah, unauthorized, forbidden } from '../utils/errors';
import type { AuthUser } from '../types/express';

interface AccessPayload {
  sub: string;
  role: AuthUser['role'];
  plan: AuthUser['plan'];
  type: 'access';
}

interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export function signAccessToken(user: { id: string; role: AuthUser['role']; plan: AuthUser['plan'] }): string {
  const payload: AccessPayload = { sub: user.id, role: user.role, plan: user.plan, type: 'access' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ttlToSeconds(env.JWT_ACCESS_TTL) });
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = uuidv4();
  const payload: RefreshPayload = { sub: userId, jti, type: 'refresh' };
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: ttlToSeconds(env.JWT_REFRESH_TTL),
  });
  return { token, jti };
}

export function verifyRefreshToken(token: string): RefreshPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
    if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
      throw unauthorized('INVALID_TOKEN', 'Invalid refresh token');
    }
    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw unauthorized('TOKEN_EXPIRED', 'Refresh token expired');
    }
    throw unauthorized('INVALID_TOKEN', 'Invalid refresh token');
  }
}

/** Verify a Bearer access token and attach the user to the request. */
export const requireAuth = ah(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) throw unauthorized('AUTH_REQUIRED', 'Authentication required');

  let payload: AccessPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
  } catch {
    throw unauthorized('INVALID_TOKEN', 'Invalid or expired access token');
  }
  if (payload.type !== 'access' || !payload.sub) {
    throw unauthorized('INVALID_TOKEN', 'Invalid access token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      role: true,
      plan: true,
      isBanned: true,
      bannedUntil: true,
      suspendedUntil: true,
      deletedAt: true,
    },
  });
  if (!user || user.deletedAt) throw unauthorized('USER_NOT_FOUND', 'Account no longer exists');
  if (user.isBanned && (!user.bannedUntil || user.bannedUntil > new Date())) {
    throw forbidden('ACCOUNT_BANNED', 'This account is banned');
  }

  req.user = { id: user.id, role: user.role, plan: user.plan };
  next();
});

/** Like requireAuth, but continues anonymously when no token is present. */
export const optionalAuth = ah(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    if (payload.type === 'access' && payload.sub) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, plan: true, deletedAt: true },
      });
      if (user && !user.deletedAt) {
        req.user = { id: user.id, role: user.role, plan: user.plan };
      }
    }
  } catch {
    // ignore invalid tokens on optional auth
  }
  next();
});
