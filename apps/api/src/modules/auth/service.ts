import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { env, isProd } from '../../config/env';
import { ah, unauthorized, forbidden, badRequest, conflict, providerNotConfigured } from '../../utils/errors';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../middleware/auth';
import { storeRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../../services/refreshStore';
import { recordAudit } from '../../middleware/audit';

const BCRYPT_COST = 12;
const REFRESH_COOKIE = 'sigma_refresh';
const REFRESH_PATH = '/api/v1/auth';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    // Production: web (Vercel) + API (Render) are cross-site, so the refresh
    // cookie needs SameSite=None; Secure or browsers will not send it.
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: REFRESH_PATH,
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    path: REFRESH_PATH,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
  });
}

function publicUser(u: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  plan: string;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    role: u.role,
    plan: u.plan,
    createdAt: u.createdAt.toISOString(),
  };
}

async function issueSession(user: { id: string; role: 'USER' | 'MODERATOR' | 'ADMIN'; plan: 'FREE' | 'PRO' | 'CREATOR' }) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, jti } = signRefreshToken(user.id);
  await storeRefreshToken(jti, user.id);
  return { accessToken, refreshToken };
}

export async function register(data: {
  email: string;
  username: string;
  password: string;
  displayName: string;
}) {
  const email = data.email.toLowerCase().trim();
  const username = data.username.toLowerCase().trim();

  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
  ]);
  if (emailTaken) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
  if (usernameTaken) throw conflict('USERNAME_TAKEN', 'This username is already taken');

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      displayName: data.displayName.trim(),
      usernameChangedAt: new Date(),
      profile: { create: {} },
    },
  });

  const { accessToken, refreshToken } = await issueSession(user);
  await recordAudit({ actorId: user.id, action: 'auth.register', entityType: 'User', entityId: user.id });
  return { user: publicUser(user), accessToken, refreshToken };
}

export async function login(emailOrUsername: string, password: string) {
  const key = emailOrUsername.toLowerCase().trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: key }, { username: key }],
      deletedAt: null,
    },
  });
  if (!user || !user.passwordHash) throw unauthorized('INVALID_CREDENTIALS', 'Invalid email/username or password');
  if (user.isBanned && (!user.bannedUntil || user.bannedUntil > new Date())) {
    throw forbidden('ACCOUNT_BANNED', 'This account is banned');
  }
  if (user.suspendedUntil && user.suspendedUntil > new Date()) {
    throw forbidden('ACCOUNT_SUSPENDED', 'This account is temporarily suspended');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('INVALID_CREDENTIALS', 'Invalid email/username or password');

  const { accessToken, refreshToken } = await issueSession(user);
  await recordAudit({ actorId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id });
  return { user: publicUser(user), accessToken, refreshToken };
}

export async function refresh(refreshToken: string | undefined) {
  if (!refreshToken) throw unauthorized('REFRESH_REQUIRED', 'Refresh token missing');
  const payload = verifyRefreshToken(refreshToken);
  const userId = await consumeRefreshToken(payload.jti);
  if (!userId || userId !== payload.sub) {
    throw unauthorized('INVALID_TOKEN', 'Refresh token already used or revoked');
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, plan: true, deletedAt: true, isBanned: true, bannedUntil: true },
  });
  if (!user || user.deletedAt) throw unauthorized('USER_NOT_FOUND', 'Account no longer exists');
  if (user.isBanned && (!user.bannedUntil || user.bannedUntil > new Date())) {
    throw forbidden('ACCOUNT_BANNED', 'This account is banned');
  }
  // rotation: issue a fresh pair
  const session = await issueSession(user);
  return { user: publicUser(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })), ...session };
}

export async function logout(userId: string, refreshToken: string | undefined) {
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await revokeRefreshToken(payload.jti);
    } catch {
      // ignore invalid tokens on logout
    }
  }
  await recordAudit({ actorId: userId, action: 'auth.logout', entityType: 'User', entityId: userId });
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user || user.deletedAt) throw unauthorized('USER_NOT_FOUND', 'Account no longer exists');
  const flags = await prisma.featureFlag.findMany({ where: { enabled: true } });
  const resolved: Record<string, boolean> = {};
  for (const f of flags) {
    resolved[f.key] = f.plans.length === 0 || f.plans.includes(user.plan);
  }
  const { passwordHash: _ph, ...rest } = user;
  return {
    ...rest,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    featureFlags: resolved,
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) throw badRequest('PASSWORD_NOT_SET', 'Password is not set for this account');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw unauthorized('INVALID_CREDENTIALS', 'Current password is incorrect');
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await recordAudit({ actorId: userId, action: 'auth.change-password', entityType: 'User', entityId: userId });
}

export async function oauth(provider: string) {
  if (!env.OAUTH_GOOGLE_CLIENT_ID || !env.OAUTH_GOOGLE_CLIENT_SECRET) {
    throw providerNotConfigured(`OAuth provider "${provider}" is not configured`);
  }
  // Configured but the interactive OAuth handshake is out of scope for this build — never fake it.
  throw providerNotConfigured(`OAuth provider "${provider}" flow is not implemented in this build`);
}

export const cookieHelpers = { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE };
