import Redis from 'ioredis';
import { env } from '../config/env';

let client: Redis | null = null;
let attempted = false;
let attemptPromise: Promise<Redis | null> | null = null;

/**
 * Lazily connect to Redis exactly once. Returns null when Redis is unreachable —
 * callers must degrade gracefully (inline no-op) and MUST NOT crash boot.
 */
export function getRedis(): Promise<Redis | null> {
  if (attempted) return Promise.resolve(client);
  if (attemptPromise) return attemptPromise;
  attemptPromise = (async () => {
    attempted = true;
    try {
      const r = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        connectTimeout: 3000,
        // Returning null stops automatic reconnection attempts.
        retryStrategy: () => null,
      });
      r.on('error', () => {
        // swallowed: Redis is optional
      });
      await r.ping();
      client = r;
      // eslint-disable-next-line no-console
      console.log('[redis] connected');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[redis] unreachable at',
        env.REDIS_URL,
        '— running without Redis (queues/inline caches degrade to no-op).',
        (err as Error).message,
      );
      client = null;
    }
    return client;
  })();
  return attemptPromise;
}
