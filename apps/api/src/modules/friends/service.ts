import { FriendRequestStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { notify } from '../notifications/service';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isOnline: true,
} as const;

async function assertNotBlocked(a: string, b: string): Promise<void> {
  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  if (blocked) throw forbidden('BLOCKED', 'Action not allowed with this user');
}

export async function listFriends(userId: string) {
  const rows = await prisma.friend.findMany({
    where: { userId },
    include: { friend: { select: userSelect } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => r.friend);
}

export async function listRequests(userId: string, dir: 'incoming' | 'outgoing') {
  const rows = await prisma.friendRequest.findMany({
    where: dir === 'incoming' ? { toUserId: userId, status: 'PENDING' } : { fromUserId: userId, status: 'PENDING' },
    include: {
      fromUser: { select: userSelect },
      toUser: { select: userSelect },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows;
}

export async function sendRequest(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) throw badRequest('CANNOT_FRIEND_SELF', 'You cannot friend yourself');
  const target = await prisma.user.findFirst({ where: { id: toUserId, deletedAt: null } });
  if (!target) throw notFound('USER_NOT_FOUND', 'User not found');
  await assertNotBlocked(fromUserId, toUserId);

  const existingFriend = await prisma.friend.findUnique({
    where: { userId_friendId: { userId: fromUserId, friendId: toUserId } },
  });
  if (existingFriend) throw badRequest('ALREADY_FRIENDS', 'You are already friends');

  const pending = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { fromUserId, toUserId, status: 'PENDING' },
        { fromUserId: toUserId, toUserId: fromUserId, status: 'PENDING' },
      ],
    },
  });
  if (pending) throw badRequest('REQUEST_PENDING', 'A friend request is already pending');

  const request = await prisma.friendRequest.create({
    data: { fromUserId, toUserId },
    include: { fromUser: { select: userSelect }, toUser: { select: userSelect } },
  });
  const actor = await prisma.user.findUnique({ where: { id: fromUserId }, select: { displayName: true } });
  await notify({
    userId: toUserId,
    type: 'FRIEND_REQUEST',
    title: 'Friend request',
    body: `${actor?.displayName ?? 'Someone'} sent you a friend request`,
    actorId: fromUserId,
    data: { requestId: request.id },
  });
  return request;
}

export async function acceptRequest(userId: string, requestId: string) {
  const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
  if (!request || request.toUserId !== userId) throw notFound('REQUEST_NOT_FOUND', 'Friend request not found');
  if (request.status !== FriendRequestStatus.PENDING) {
    throw badRequest('REQUEST_NOT_PENDING', 'This request has already been handled');
  }
  const [updated] = await prisma.$transaction([
    prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    }),
    prisma.friend.create({ data: { userId: request.fromUserId, friendId: request.toUserId } }),
    prisma.friend.create({ data: { userId: request.toUserId, friendId: request.fromUserId } }),
  ]);
  // accepting also follows both ways
  await prisma.$transaction([
    prisma.follow.upsert({
      where: { followerId_followingId: { followerId: request.fromUserId, followingId: request.toUserId } },
      create: { followerId: request.fromUserId, followingId: request.toUserId },
      update: {},
    }),
    prisma.follow.upsert({
      where: { followerId_followingId: { followerId: request.toUserId, followingId: request.fromUserId } },
      create: { followerId: request.toUserId, followingId: request.fromUserId },
      update: {},
    }),
  ]);
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  await notify({
    userId: request.fromUserId,
    type: 'FRIEND_ACCEPTED',
    title: 'Friend request accepted',
    body: `${actor?.displayName ?? 'Someone'} accepted your friend request`,
    actorId: userId,
  });
  return updated;
}

export async function rejectRequest(userId: string, requestId: string) {
  const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
  if (!request || request.toUserId !== userId) throw notFound('REQUEST_NOT_FOUND', 'Friend request not found');
  if (request.status !== FriendRequestStatus.PENDING) {
    throw badRequest('REQUEST_NOT_PENDING', 'This request has already been handled');
  }
  return prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', respondedAt: new Date() },
  });
}

export async function removeFriend(userId: string, friendId: string) {
  await prisma.$transaction([
    prisma.friend.deleteMany({ where: { userId, friendId } }),
    prisma.friend.deleteMany({ where: { userId: friendId, friendId: userId } }),
    prisma.closeFriend.deleteMany({ where: { OR: [{ userId, closeFriendId: friendId }, { userId: friendId, closeFriendId: userId }] } }),
  ]);
  return { ok: true };
}

export async function listCloseFriends(userId: string) {
  const rows = await prisma.closeFriend.findMany({
    where: { userId },
    include: { closeFriend: { select: userSelect } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => r.closeFriend);
}

export async function addCloseFriend(userId: string, friendId: string) {
  const isFriend = await prisma.friend.findUnique({
    where: { userId_friendId: { userId, friendId } },
  });
  if (!isFriend) throw badRequest('NOT_FRIENDS', 'Close friends must be friends first');
  try {
    await prisma.closeFriend.create({ data: { userId, closeFriendId: friendId } });
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
  }
  return { ok: true };
}

export async function removeCloseFriend(userId: string, friendId: string) {
  await prisma.closeFriend.deleteMany({ where: { userId, closeFriendId: friendId } });
  return { ok: true };
}

/**
 * Contacts discovery stub. Requires explicit `contactsPermission: true` in the
 * body — without it we refuse (403). We never upload raw contacts; the client
 * is expected to hash them. This returns friend-of-friend suggestions as the
 * discovery result set.
 */
export async function discover(userId: string, contactsPermission: boolean, limit = 20) {
  if (!contactsPermission) {
    throw forbidden('PERMISSION_REQUIRED', 'contactsPermission must be true to use discovery');
  }
  const friends = await prisma.friend.findMany({ where: { userId }, select: { friendId: true } });
  const friendIds = friends.map((f) => f.friendId);
  const blocked = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = new Set(blocked.flatMap((b) => [b.blockerId, b.blockedId]));
  const fof = friendIds.length
    ? await prisma.friend.findMany({
        where: { userId: { in: friendIds }, friendId: { notIn: [...friendIds, userId] } },
        select: { friendId: true },
        take: 100,
      })
    : [];
  const ids = [...new Set(fof.map((f) => f.friendId))].filter((id) => !blockedIds.has(id)).slice(0, limit);
  if (ids.length === 0) return [];
  return prisma.user.findMany({ where: { id: { in: ids }, deletedAt: null }, select: userSelect });
}
