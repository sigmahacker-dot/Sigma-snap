import { env, ttlToSeconds } from '../config/env';
import { getRedis } from './redis';

interface MemEntry {
  userId: string;
  expiresAt: number;
}

const mem = new Map<string, MemEntry>();

function pruneMem(): void {
  const now = Date.now();
  for (const [k, v] of mem) {
    if (v.expiresAt <= now) mem.delete(k);
  }
}

/**
 * Server-side registry of issued refresh-token JTIs (for rotation/revocation).
 * Redis-backed when available, in-memory fallback otherwise.
 */
export async function storeRefreshToken(jti: string, userId: string): Promise<void> {
  const ttl = ttlToSeconds(env.JWT_REFRESH_TTL);
  const redis = await getRedis();
  if (redis) {
    await redis.set(`refresh:${jti}`, userId, 'EX', ttl);
    return;
  }
  pruneMem();
  mem.set(jti, { userId, expiresAt: Date.now() + ttl * 1000 });
}

/** Atomically consume a refresh JTI (single use). Returns the userId or null. */
export async function consumeRefreshToken(jti: string): Promise<string | null> {
  const redis = await getRedis();
  if (redis) {
    const key = `refresh:${jti}`;
    const userId = await redis.get(key);
    if (!userId) return null;
    await redis.del(key);
    return userId;
  }
  pruneMem();
  const entry = mem.get(jti);
  if (!entry) return null;
  mem.delete(jti);
  return entry.userId;
}

export async function revokeRefreshToken(jti: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.del(`refresh:${jti}`);
    return;
  }
  mem.delete(jti);
}
