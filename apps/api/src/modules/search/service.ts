import { prisma } from '../../db/prisma';
import {
  searchUsersDb,
  searchPostsDb,
  searchHashtagsDb,
  searchPlacesDb,
  suggestPrefixes,
  trendingHashtags,
} from '../../services/search';

export type SearchType = 'all' | 'users' | 'videos' | 'sounds' | 'hashtags' | 'effects' | 'templates' | 'places';

async function blockedIdsFor(userId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.flatMap((r) => [r.blockerId, r.blockedId]))];
}

export async function search(userId: string, q: string, type: SearchType) {
  const query = q.trim();
  // save to history (dedupe, keep last 50)
  await prisma.$transaction([
    prisma.searchHistory.deleteMany({ where: { userId, query } }),
    prisma.searchHistory.create({ data: { userId, query } }),
  ]);
  const count = await prisma.searchHistory.count({ where: { userId } });
  if (count > 50) {
    const old = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: count - 50,
      select: { id: true },
    });
    await prisma.searchHistory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }

  const blocked = await blockedIdsFor(userId);
  const result: Record<string, unknown> = {};

  const want = (t: SearchType) => type === 'all' || type === t;

  if (want('users')) {
    result.users = await searchUsersDb(query, 10, [...blocked, userId]);
  }
  if (want('videos')) {
    result.videos = await searchPostsDb(query, 10);
  }
  if (want('sounds')) {
    result.sounds = await prisma.sound.findMany({
      where: { isActive: true, OR: [{ title: { contains: query, mode: 'insensitive' } }, { artist: { contains: query, mode: 'insensitive' } }] },
      orderBy: { usageCount: 'desc' },
      take: 10,
    });
  }
  if (want('hashtags')) {
    result.hashtags = await searchHashtagsDb(query, 10);
  }
  if (want('effects')) {
    result.effects = await prisma.effect.findMany({
      where: { isActive: true, OR: [{ name: { contains: query, mode: 'insensitive' } }, { category: { contains: query, mode: 'insensitive' } }] },
      take: 10,
    });
  }
  if (want('templates')) {
    result.templates = await prisma.template.findMany({
      where: { isPublished: true, deletedAt: null, OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
      take: 10,
    });
  }
  if (want('places')) {
    result.places = await searchPlacesDb(query, 10);
  }
  return result;
}

export async function trending() {
  const [hashtags, sounds, templates] = await Promise.all([
    trendingHashtags(10),
    prisma.sound.findMany({ where: { isActive: true }, orderBy: { usageCount: 'desc' }, take: 10 }),
    prisma.template.findMany({ where: { isPublished: true, deletedAt: null }, orderBy: { usageCount: 'desc' }, take: 10 }),
  ]);
  return { hashtags, sounds, templates };
}

export async function suggestions(q: string) {
  return suggestPrefixes(q.trim(), 10);
}

export async function history(userId: string) {
  return prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function clearHistory(userId: string) {
  await prisma.searchHistory.deleteMany({ where: { userId } });
  return { ok: true };
}
