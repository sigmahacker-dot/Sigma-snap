import cron from 'node-cron';
import { prisma } from '../db/prisma';

/** Archive stories older than 24h (isArchived + soft-delete) and prune their views. */
async function expireStories(): Promise<void> {
  try {
    const now = new Date();
    const expired = await prisma.story.findMany({
      where: { expiresAt: { lte: now }, isArchived: false, deletedAt: null },
      select: { id: true },
    });
    if (expired.length === 0) return;
    const ids = expired.map((s) => s.id);
    await prisma.story.updateMany({ where: { id: { in: ids } }, data: { isArchived: true, deletedAt: now } });
    await prisma.storyView.deleteMany({ where: { storyId: { in: ids } } });
    // eslint-disable-next-line no-console
    console.log(`[scheduler] archived ${ids.length} expired stories`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[scheduler] expireStories failed:', (err as Error).message);
  }
}

/** Hard-delete messages past their expiresAt (disappearing messages). */
async function deleteExpiredMessages(): Promise<void> {
  try {
    const result = await prisma.message.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    if (result.count > 0) {
      // eslint-disable-next-line no-console
      console.log(`[scheduler] deleted ${result.count} expired messages`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[scheduler] deleteExpiredMessages failed:', (err as Error).message);
  }
}

export function startScheduler(): void {
  cron.schedule('*/15 * * * *', expireStories);
  cron.schedule('*/5 * * * *', deleteExpiredMessages);
  // eslint-disable-next-line no-console
  console.log('[scheduler] started (story expiry every 15m, message expiry every 5m)');
}
