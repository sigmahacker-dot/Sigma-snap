import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { getRedis } from '../services/redis';

let mediaQueue: Queue | null = null;

/** Dedicated BullMQ connection (BullMQ requires maxRetriesPerRequest: null). */
export function bullConnection(): IORedis {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

async function getMediaQueue(): Promise<Queue | null> {
  const redis = await getRedis();
  if (!redis) return null; // Redis unreachable → degrade
  if (!mediaQueue) {
    mediaQueue = new Queue('media', { connection: bullConnection() });
    mediaQueue.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[queue] media queue error:', err.message);
    });
  }
  return mediaQueue;
}

/**
 * Enqueue a video-processing job. If Redis is unreachable at boot (or drops),
 * this degrades to a logged no-op — it NEVER throws and never crashes boot.
 */
export async function enqueueVideoProcessing(assetId: string): Promise<void> {
  try {
    const queue = await getMediaQueue();
    if (!queue) {
      // eslint-disable-next-line no-console
      console.warn(`[queue] Redis unavailable — skipping video:process job for asset ${assetId} (no-op degrade)`);
      return;
    }
    await queue.add(
      'video:process',
      { assetId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[queue] enqueue video:process failed:', (err as Error).message);
  }
}
