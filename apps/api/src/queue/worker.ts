import { Worker } from 'bullmq';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { MediaStatus } from '@prisma/client';
import { prisma } from '../db/prisma';
import { getRedis } from '../services/redis';
import { bullConnection } from './queues';
import { presignGet, putBuffer, objectKeyFor, publicUrl, keyFromUrl } from '../services/storage';

const execFileAsync = promisify(execFile);

interface ProbeResult {
  durationSec?: number;
  width?: number;
  height?: number;
}

async function probe(input: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-show_entries', 'format=duration',
    '-of', 'json',
    input,
  ]);
  const json = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: { width?: number; height?: number }[];
  };
  const out: ProbeResult = {};
  if (json.format?.duration) out.durationSec = Number.parseFloat(json.format.duration);
  const stream = json.streams?.[0];
  if (stream?.width) out.width = stream.width;
  if (stream?.height) out.height = stream.height;
  return out;
}

async function downloadToTmp(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}

/**
 * Process a video asset: probe duration/dimensions, extract a thumbnail,
 * transcode a 720p mp4 rendition, upload derivatives, update rows.
 * On any error the asset/video/post are marked FAILED cleanly.
 */
export async function processVideo(assetId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error(`asset ${assetId} not found`);
  if (asset.kind !== 'VIDEO') {
    await prisma.mediaAsset.update({ where: { id: assetId }, data: { status: MediaStatus.READY } });
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `sigma-${assetId}-`));
  const inputPath = path.join(tmpDir, 'input');
  const thumbPath = path.join(tmpDir, 'thumb.jpg');
  const renditionPath = path.join(tmpDir, 'rendition-720p.mp4');

  try {
    const key = keyFromUrl(asset.url) ?? asset.id;
    const downloadUrl = await presignGet(key);
    await downloadToTmp(downloadUrl, inputPath);

    const meta = await probe(inputPath);

    // thumbnail (frame near the start)
    const thumbAt = Math.min(1, (meta.durationSec ?? 2) / 2);
    await execFileAsync('ffmpeg', [
      '-y', '-ss', String(thumbAt), '-i', inputPath,
      '-vframes', '1', '-q:v', '3', thumbPath,
    ]);
    const thumbKey = objectKeyFor(asset.ownerId, `${asset.id}-thumb`, '.jpg');
    await putBuffer(thumbKey, await fs.readFile(thumbPath), 'image/jpeg');
    const thumbnailUrl = publicUrl(thumbKey);

    // 720p rendition
    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', 'scale=1280:-2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-movflags', '+faststart',
      renditionPath,
    ]);
    const renditionKey = objectKeyFor(asset.ownerId, `${asset.id}-720p`, '.mp4');
    await putBuffer(renditionKey, await fs.readFile(renditionPath), 'video/mp4');
    const renditionUrl = publicUrl(renditionKey);

    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: MediaStatus.READY,
        thumbnailUrl,
        durationSec: meta.durationSec ?? asset.durationSec,
        width: meta.width ?? asset.width,
        height: meta.height ?? asset.height,
      },
    });
    if (asset.postId) {
      await prisma.video.upsert({
        where: { postId: asset.postId },
        create: {
          postId: asset.postId,
          durationSec: meta.durationSec ?? asset.durationSec,
          width: meta.width ?? asset.width,
          height: meta.height ?? asset.height,
          status: MediaStatus.READY,
          renditions: [{ label: '720p', url: renditionUrl }],
          thumbnailUrl,
        },
        update: {
          durationSec: meta.durationSec ?? asset.durationSec,
          width: meta.width ?? asset.width,
          height: meta.height ?? asset.height,
          status: MediaStatus.READY,
          renditions: [{ label: '720p', url: renditionUrl }],
          thumbnailUrl,
        },
      });
      await prisma.post.update({ where: { id: asset.postId }, data: { status: 'PUBLISHED' } });
    }
    // eslint-disable-next-line no-console
    console.log(`[worker] video processed: ${assetId}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[worker] video processing failed for ${assetId}:`, (err as Error).message);
    await prisma.mediaAsset.update({ where: { id: assetId }, data: { status: MediaStatus.FAILED } }).catch(() => undefined);
    if (asset.postId) {
      await prisma.video
        .updateMany({ where: { postId: asset.postId }, data: { status: MediaStatus.FAILED } })
        .catch(() => undefined);
      await prisma.post
        .update({ where: { id: asset.postId }, data: { status: 'FAILED' } })
        .catch(() => undefined);
    }
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Start the BullMQ media worker. No-ops (with a warning) when Redis is down. */
export async function startWorker(): Promise<void> {
  const redis = await getRedis();
  if (!redis) {
    // eslint-disable-next-line no-console
    console.warn('[worker] Redis unavailable — media worker not started (jobs degrade to no-op)');
    return;
  }
  const worker = new Worker(
    'media',
    async (job) => {
      if (job.name === 'video:process') {
        await processVideo((job.data as { assetId: string }).assetId);
      }
    },
    { connection: bullConnection(), concurrency: 2 },
  );
  worker.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] job ${job.id} (${job.name}) completed`);
  });
  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker] job ${job?.id} (${job?.name}) failed:`, err.message);
  });
  worker.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[worker] error:', err.message);
  });
  // eslint-disable-next-line no-console
  console.log('[worker] media worker started');
}
