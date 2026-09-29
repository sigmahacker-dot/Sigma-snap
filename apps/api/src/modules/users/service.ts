import { MediaKind, MediaStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { searchUsersDb } from '../../services/search';
import { notify } from '../notifications/service';
import { clampLimit, decodeCursor, encodeCursor, pageEnvelope } from '../../utils/pagination';

const publicSelect = {
  id: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  role: true,
  plan: true,
  isOnline: true,
  lastSeenAt: true,
  showOnlineStatus: true,
  createdAt: true,
} as const;

async function blockSet(userId: string): Promise<Set<string>> {
  const [a, b] = await Promise.all([
    prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
  ]);
  return new Set([...a.map((x) => x.blockedId), ...b.map((x) => x.blockerId)]);
}

export async function searchUsers(viewerId: string, q: string, limitRaw?: unknown) {
  const blocked = await blockSet(viewerId);
  const hits = await searchUsersDb(q, clampLimit(limitRaw), [...blocked, viewerId]);
  return hits;
}

export async function suggestions(userId: string) {
  // follow-graph: people followed by people you follow; plus active creators
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = following.map((f) => f.followingId);
  const blocked = await blockSet(userId);

  const secondDegree = followingIds.length
    ? await prisma.follow.findMany({
        where: { followerId: { in: followingIds }, followingId: { notIn: [...followingIds, userId] } },
        select: { followingId: true },
        take: 60,
      })
    : [];
  const counts = new Map<string, number>();
  for (const s of secondDegree) {
    if (blocked.has(s.followingId)) continue;
    counts.set(s.followingId, (counts.get(s.followingId) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);

  let filler: string[] = [];
  if (ranked.length < 10) {
    const active = await prisma.user.findMany({
      where: { id: { notIn: [...followingIds, userId, ...blocked] }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true },
    });
    filler = active.map((a) => a.id).filter((id) => !ranked.includes(id));
  }
  const ids = [...ranked, ...filler].slice(0, 10);
  if (ids.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: publicSelect,
  });
}

export async function getProfile(viewerId: string | undefined, username: string) {
  const user = await prisma.user.findFirst({
    where: { username: username.toLowerCase(), deletedAt: null },
    include: { profile: true },
  });
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');

  if (viewerId) {
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: user.id },
          { blockerId: user.id, blockedId: viewerId },
        ],
      },
    });
    if (blocked) throw notFound('USER_NOT_FOUND', 'User not found');
  }

  const [followers, following, posts] = await Promise.all([
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    prisma.post.count({ where: { userId: user.id, deletedAt: null, status: 'PUBLISHED' } }),
  ]);

  let isFollowing = false;
  let isFollower = false;
  let isFriend = false;
  if (viewerId && viewerId !== user.id) {
    const [f1, f2, fr] = await Promise.all([
      prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: user.id } } }),
      prisma.follow.findUnique({ where: { followerId_followingId: { followerId: user.id, followingId: viewerId } } }),
      prisma.friend.findUnique({ where: { userId_friendId: { userId: viewerId, friendId: user.id } } }),
    ]);
    isFollowing = !!f1;
    isFollower = !!f2;
    isFriend = !!fr;
  }

  const isPrivate = user.profile?.isPrivate ?? false;
  const canSeeDetails = !isPrivate || (viewerId !== undefined && (viewerId === user.id || isFollowing || isFriend));
  const { passwordHash: _ph, ...safe } = user;
  return {
    ...safe,
    stats: { followers, following, posts },
    relationship: viewerId ? { isFollowing, isFollower, isFriend } : undefined,
    ...(canSeeDetails ? {} : { bio: null, stats: { followers, following, posts: 0 } }),
  };
}

export async function updateMe(userId: string, data: { displayName?: string; bio?: string | null; website?: string | null; location?: string | null }) {
  const { bio: _b, website, location, ...rest } = data;
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(rest.displayName ? { displayName: rest.displayName.trim() } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      profile: {
        upsert: {
          create: { website: website ?? null, location: location ?? null },
          update: {
            ...(website !== undefined ? { website } : {}),
            ...(location !== undefined ? { location } : {}),
          },
        },
      },
    },
    include: { profile: true },
  });
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

const USERNAME_CHANGE_DAYS = 30;

export async function changeUsername(userId: string, username: string) {
  const next = username.toLowerCase();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  if (user.username === next) return { username: next };
  if (user.usernameChangedAt) {
    const days = (Date.now() - user.usernameChangedAt.getTime()) / 86400000;
    if (days < USERNAME_CHANGE_DAYS) {
      throw badRequest('USERNAME_CHANGE_TOO_SOON', 'Username can only be changed once every 30 days', {
        nextAllowedAt: new Date(user.usernameChangedAt.getTime() + USERNAME_CHANGE_DAYS * 86400000).toISOString(),
      });
    }
  }
  const taken = await prisma.user.findUnique({ where: { username: next } });
  if (taken) throw conflict('USERNAME_TAKEN', 'This username is already taken');
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { username: next, usernameChangedAt: new Date() },
  });
  return { username: updated.username };
}

export async function setAvatar(userId: string, assetId: string) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, deletedAt: null } });
  if (!asset) throw notFound('ASSET_NOT_FOUND', 'Media asset not found');
  if (asset.ownerId !== userId) throw forbidden('NOT_OWNER', 'You do not own this asset');
  if (asset.kind !== MediaKind.PHOTO || asset.status !== MediaStatus.READY) {
    throw badRequest('INVALID_AVATAR', 'Avatar must be a READY photo you uploaded');
  }
  const updated = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: asset.url } });
  return { avatarUrl: updated.avatarUrl };
}

export async function updatePrivacy(userId: string, data: {
  isPrivate?: boolean;
  allowMessagesFrom?: 'EVERYONE' | 'FRIENDS' | 'NOBODY';
  storyPrivacyDefault?: 'EVERYONE' | 'FRIENDS' | 'CLOSE_FRIENDS';
  showOnlineStatus?: boolean;
}) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.allowMessagesFrom ? { allowMessagesFrom: data.allowMessagesFrom } : {}),
      ...(data.storyPrivacyDefault ? { storyPrivacyDefault: data.storyPrivacyDefault } : {}),
      ...(data.showOnlineStatus !== undefined ? { showOnlineStatus: data.showOnlineStatus } : {}),
      profile: {
        upsert: {
          create: { isPrivate: data.isPrivate ?? false },
          update: data.isPrivate !== undefined ? { isPrivate: data.isPrivate } : {},
        },
      },
    },
    include: { profile: true },
  });
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

export async function updateNotificationPrefs(userId: string, prefs: Record<string, boolean>) {
  const existing = await prisma.profile.findUnique({ where: { userId } });
  const current = (existing?.prefs as Record<string, boolean> | null) ?? {};
  const merged = { ...current, ...prefs };
  const profile = await prisma.profile.upsert({
    where: { userId },
    create: { userId, prefs: merged },
    update: { prefs: merged },
  });
  return { notificationPrefs: profile.prefs };
}

export async function updateLocation(userId: string, data: {
  mode: 'OFF' | 'FRIENDS' | 'TEMPORARY';
  latitude?: number;
  longitude?: number;
  minutes?: number;
}) {
  if (data.mode !== 'OFF' && (data.latitude === undefined || data.longitude === undefined)) {
    throw badRequest('LOCATION_REQUIRED', 'Latitude and longitude are required to share location');
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      locationShareMode: data.mode,
      ...(data.mode === 'OFF'
        ? { lastLatitude: null, lastLongitude: null, lastLocationAt: null, tempShareExpiresAt: null }
        : {
            lastLatitude: data.latitude!,
            lastLongitude: data.longitude!,
            lastLocationAt: new Date(),
            tempShareExpiresAt:
              data.mode === 'TEMPORARY'
                ? new Date(Date.now() + (data.minutes ?? 60) * 60000)
                : null,
          }),
    },
    select: {
      locationShareMode: true,
      lastLatitude: true,
      lastLongitude: true,
      lastLocationAt: true,
      tempShareExpiresAt: true,
    },
  });
  return updated;
}

async function pagedFollowList(
  userId: string,
  dir: 'followers' | 'following',
  cursor?: string,
  limitRaw?: unknown,
) {
  const limit = clampLimit(limitRaw);
  const c = decodeCursor<{ createdAt: string; id: string }>(cursor ?? null);
  const where = dir === 'followers' ? { followingId: userId } : { followerId: userId };
  const rows = await prisma.follow.findMany({
    where: {
      ...where,
      ...(c ? { createdAt: { lt: new Date(c.createdAt) } } : {}),
    },
    include: {
      follower: dir === 'followers' ? { select: publicSelect } : undefined,
      following: dir === 'following' ? { select: publicSelect } : undefined,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => (dir === 'followers' ? r.follower : r.following));
  const nextCursor =
    hasMore && rows.length > 0
      ? encodeCursor({ createdAt: rows[limit - 1].createdAt.toISOString(), id: rows[limit - 1].id })
      : null;
  return pageEnvelope(data, nextCursor);
}

export const followers = (userId: string, cursor?: string, limit?: unknown) =>
  pagedFollowList(userId, 'followers', cursor, limit);
export const following = (userId: string, cursor?: string, limit?: unknown) =>
  pagedFollowList(userId, 'following', cursor, limit);

export async function follow(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw badRequest('CANNOT_FOLLOW_SELF', 'You cannot follow yourself');
  const target = await prisma.user.findFirst({ where: { id: targetId, deletedAt: null } });
  if (!target) throw notFound('USER_NOT_FOUND', 'User not found');
  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: viewerId, blockedId: targetId }, { blockerId: targetId, blockedId: viewerId }] },
  });
  if (blocked) throw forbidden('BLOCKED', 'You cannot follow this user');
  try {
    await prisma.follow.create({ data: { followerId: viewerId, followingId: targetId } });
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
  }
  const actor = await prisma.user.findUnique({ where: { id: viewerId }, select: { displayName: true, username: true } });
  await notify({
    userId: targetId,
    type: 'FOLLOW',
    title: 'New follower',
    body: `${actor?.displayName ?? 'Someone'} started following you`,
    actorId: viewerId,
  });
  return { ok: true };
}

export async function unfollow(viewerId: string, targetId: string) {
  await prisma.follow.deleteMany({ where: { followerId: viewerId, followingId: targetId } });
  return { ok: true };
}

export async function block(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw badRequest('CANNOT_BLOCK_SELF', 'You cannot block yourself');
  const target = await prisma.user.findFirst({ where: { id: targetId, deletedAt: null } });
  if (!target) throw notFound('USER_NOT_FOUND', 'User not found');
  try {
    await prisma.block.create({ data: { blockerId: viewerId, blockedId: targetId } });
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
  }
  // blocking severs follow + friendship both ways
  await prisma.$transaction([
    prisma.follow.deleteMany({ where: { OR: [{ followerId: viewerId, followingId: targetId }, { followerId: targetId, followingId: viewerId }] } }),
    prisma.friend.deleteMany({ where: { OR: [{ userId: viewerId, friendId: targetId }, { userId: targetId, friendId: viewerId }] } }),
    prisma.closeFriend.deleteMany({ where: { OR: [{ userId: viewerId, closeFriendId: targetId }, { userId: targetId, closeFriendId: viewerId }] } }),
  ]);
  return { ok: true };
}

export async function unblock(viewerId: string, targetId: string) {
  await prisma.block.deleteMany({ where: { blockerId: viewerId, blockedId: targetId } });
  return { ok: true };
}

export async function mute(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw badRequest('CANNOT_MUTE_SELF', 'You cannot mute yourself');
  try {
    await prisma.mute.create({ data: { muterId: viewerId, mutedId: targetId } });
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
  }
  return { ok: true };
}

export async function unmute(viewerId: string, targetId: string) {
  await prisma.mute.deleteMany({ where: { muterId: viewerId, mutedId: targetId } });
  return { ok: true };
}

export async function blockedList(userId: string) {
  const rows = await prisma.block.findMany({
    where: { blockerId: userId },
    include: { blocked: { select: publicSelect } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => r.blocked);
}
