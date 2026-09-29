import { prisma } from '../db/prisma';

/**
 * PostgreSQL full-text / trigram helpers. The default search provider is
 * plain Postgres (no external service needed). Results are sanitized rows.
 */

export interface UserHit {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PostHit {
  id: string;
  kind: string;
  caption: string | null;
  likeCount: number;
  viewCount: number;
  createdAt: Date;
  userId: string;
  username: string;
}

export interface HashtagHit {
  id: string;
  name: string;
  usageCount: number;
}

export async function searchUsersDb(q: string, limit = 20, excludeIds: string[] = []): Promise<UserHit[]> {
  const like = `%${q}%`;
  return prisma.$queryRaw<UserHit[]>`
    SELECT id, username, "displayName", "avatarUrl"
    FROM "User"
    WHERE "deletedAt" IS NULL
      AND (username ILIKE ${like} OR "displayName" ILIKE ${like})
      AND NOT (id = ANY(${excludeIds}::text[]))
    ORDER BY username ASC
    LIMIT ${limit}`;
}

export async function searchPostsDb(q: string, limit = 20): Promise<PostHit[]> {
  const like = `%${q}%`;
  return prisma.$queryRaw<PostHit[]>`
    SELECT p.id, p.kind::text AS kind, p.caption, p."likeCount", p."viewCount", p."createdAt",
           p."userId", u.username
    FROM "Post" p
    JOIN "User" u ON u.id = p."userId"
    WHERE p."deletedAt" IS NULL AND p.status = 'PUBLISHED'::"PostStatus" AND p."isPublic" = true
      AND (p.caption ILIKE ${like} OR p."locationName" ILIKE ${like})
    ORDER BY p."createdAt" DESC
    LIMIT ${limit}`;
}

export async function searchHashtagsDb(q: string, limit = 20): Promise<HashtagHit[]> {
  const like = `%${q.toLowerCase().replace(/^#/, '')}%`;
  return prisma.$queryRaw<HashtagHit[]>`
    SELECT id, name, "usageCount"
    FROM "Hashtag"
    WHERE name ILIKE ${like}
    ORDER BY "usageCount" DESC
    LIMIT ${limit}`;
}

export async function searchPlacesDb(q: string, limit = 10): Promise<{ name: string; uses: number }[]> {
  const like = `%${q}%`;
  return prisma.$queryRaw<{ name: string; uses: number }[]>`
    SELECT "locationName" AS name, COUNT(*)::int AS uses
    FROM (
      SELECT "locationName" FROM "Post" WHERE "locationName" ILIKE ${like} AND "deletedAt" IS NULL
      UNION ALL
      SELECT "locationName" FROM "Story" WHERE "locationName" ILIKE ${like} AND "deletedAt" IS NULL
    ) s
    GROUP BY "locationName"
    ORDER BY uses DESC
    LIMIT ${limit}`;
}

export async function suggestPrefixes(q: string, limit = 10): Promise<string[]> {
  const like = `${q.toLowerCase()}%`;
  const tags = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM "Hashtag" WHERE name ILIKE ${like} ORDER BY "usageCount" DESC LIMIT ${limit}`;
  const users = await prisma.$queryRaw<{ username: string }[]>`
    SELECT username FROM "User"
    WHERE "deletedAt" IS NULL AND (username ILIKE ${like} OR "displayName" ILIKE ${like})
    ORDER BY username ASC LIMIT ${limit}`;
  const out: string[] = [];
  for (const t of tags) out.push(`#${t.name}`);
  for (const u of users) out.push(`@${u.username}`);
  return out.slice(0, limit);
}

export async function trendingHashtags(limit = 10): Promise<HashtagHit[]> {
  return prisma.hashtag.findMany({
    orderBy: { usageCount: 'desc' },
    take: limit,
    select: { id: true, name: true, usageCount: true },
  });
}
