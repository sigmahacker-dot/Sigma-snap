import { MediaKind, MediaStatus, PostStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { notify } from '../notifications/service';
import { emitToUser } from '../../realtime/events';
import { enqueueVideoProcessing } from '../../queue/queues';
import { getRedis } from '../../services/redis';
import { createReport } from '../moderation/service';
import { decodeCursor, encodeCursor, pageEnvelope, clampLimit } from '../../utils/pagination';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const postInclude = {
  user: { select: userSelect },
  assets: true,
  video: true,
  music: { select: { id: true, title: true, artist: true } },
} as const;

function extractHashtags(caption: string | undefined | null): string[] {
  if (!caption) return [];
  const tags = new Set<string>();
  const re = /#([\p{L}\p{N}_]{1,64})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(caption)) !== null) tags.add(m[1].toLowerCase());
  return [...tags];
}

async function linkHashtags(postId: string, tags: string[]): Promise<void> {
  for (const name of tags) {
    const tag = await prisma.hashtag.upsert({
      where: { name },
      create: { name, usageCount: 1 },
      update: { usageCount: { increment: 1 } },
    });
    await prisma.postHashtag.upsert({
      where: { postId_hashtagId: { postId, hashtagId: tag.id } },
      create: { postId, hashtagId: tag.id },
      update: {},
    });
  }
}

export async function createPost(userId: string, input: {
  assetIds: string[];
  kind: MediaKind;
  caption?: string;
  mentions?: string[];
  locationName?: string;
  musicId?: string;
  isPublic?: boolean;
  allowComments?: boolean;
}) {
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: input.assetIds }, deletedAt: null },
  });
  if (assets.length !== input.assetIds.length) {
    throw badRequest('ASSET_NOT_FOUND', 'One or more assets were not found');
  }
  for (const a of assets) {
    if (a.ownerId !== userId) throw forbidden('NOT_OWNER', 'You do not own all of these assets');
    if (a.status !== MediaStatus.READY) {
      throw badRequest('ASSET_NOT_READY', `Asset ${a.id} is not ready yet`);
    }
  }
  const isVideo = input.kind === MediaKind.VIDEO;
  const post = await prisma.post.create({
    data: {
      userId,
      kind: input.kind,
      caption: input.caption ?? null,
      mentions: input.mentions ?? [],
      locationName: input.locationName ?? null,
      musicId: input.musicId ?? null,
      isPublic: input.isPublic ?? true,
      allowComments: input.allowComments ?? true,
      status: isVideo ? PostStatus.PROCESSING : PostStatus.PUBLISHED,
      assets: { connect: input.assetIds.map((id) => ({ id })) },
      ...(isVideo
        ? {
            video: {
              create: {
                status: MediaStatus.PROCESSING,
                durationSec: assets[0]?.durationSec ?? null,
                width: assets[0]?.width ?? null,
                height: assets[0]?.height ?? null,
              },
            },
          }
        : {}),
    },
    include: postInclude,
  });
  await linkHashtags(post.id, extractHashtags(input.caption));
  if (isVideo) {
    // Re-run processing for the post's primary asset to produce renditions.
    await enqueueVideoProcessing(assets[0].id);
  }
  return post;
}

/** Feed score per spec: engagement * recency decay * follow boost * featured boost. */
export function feedScore(p: {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  createdAt: Date;
  isFeatured: boolean;
}, followed: boolean): number {
  const engagement = p.likeCount * 2 + p.commentCount * 3 + p.shareCount * 4 + p.viewCount * 0.1;
  const ageHours = (Date.now() - p.createdAt.getTime()) / 3600000;
  return engagement * Math.exp(-ageHours / 36) * (followed ? 3 : 1) * (p.isFeatured ? 2 : 1);
}

interface FeedCursor {
  score: number;
  id: string;
}

async function rankedFeed(userId: string, cursor?: string, limitRaw?: unknown, followingOnly = false) {
  const limit = clampLimit(limitRaw);
  const c = decodeCursor<FeedCursor>(cursor ?? null);

  const following = await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
  const followingIds = new Set(following.map((f) => f.followingId));
  const blockedRows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blockedRows.flatMap((b) => [b.blockerId, b.blockedId]));

  const candidates = await prisma.post.findMany({
    where: {
      status: PostStatus.PUBLISHED,
      isPublic: true,
      deletedAt: null,
      createdAt: { gt: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      ...(followingOnly ? { userId: { in: [...followingIds] } } : {}),
    },
    include: postInclude,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const scored = candidates
    .filter((p) => !blocked.has(p.userId) && p.userId !== undefined)
    .map((p) => ({ post: p, score: feedScore(p, followingIds.has(p.userId)) }))
    .filter((s) => (c ? s.score < c.score || (s.score === c.score && s.post.id < c.id) : true))
    .sort((a, b) => b.score - a.score || (a.post.id < b.post.id ? 1 : -1));

  const slice = scored.slice(0, limit);
  const hasMore = scored.length > limit;
  const nextCursor =
    hasMore && slice.length > 0
      ? encodeCursor({ score: slice[slice.length - 1].score, id: slice[slice.length - 1].post.id })
      : null;
  return pageEnvelope(
    slice.map((s) => ({ ...s.post, _feedScore: s.score })),
    nextCursor,
  );
}

export const getFeed = (userId: string, cursor?: string, limit?: unknown) => rankedFeed(userId, cursor, limit, false);
export const getFollowingFeed = (userId: string, cursor?: string, limit?: unknown) =>
  rankedFeed(userId, cursor, limit, true);

// ─── view counting (dedupe per user per hour) ─────────────────────────────

const memViews = new Map<string, number>();

async function shouldCountView(postId: string, userId?: string): Promise<boolean> {
  if (!userId) return true;
  const key = `postview:${postId}:${userId}`;
  const redis = await getRedis();
  if (redis) {
    const set = await redis.set(key, '1', 'EX', 3600, 'NX');
    return set === 'OK';
  }
  const last = memViews.get(key) ?? 0;
  if (Date.now() - last < 3600_000) return false;
  memViews.set(key, Date.now());
  return true;
}

export async function getPost(viewerId: string | undefined, id: string) {
  const post = await prisma.post.findFirst({
    where: { id, deletedAt: null },
    include: postInclude,
  });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  if (!post.isPublic && post.userId !== viewerId) {
    throw forbidden('POST_PRIVATE', 'This post is private');
  }
  if (await shouldCountView(id, viewerId)) {
    await prisma.post.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    // daily creator analytics rollup
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.creatorAnalytics.upsert({
      where: { userId_date: { userId: post.userId, date: today } },
      create: { userId: post.userId, date: today, views: 1 },
      update: { views: { increment: 1 } },
    });
  }
  return post;
}

export async function patchPost(userId: string, id: string, input: { caption?: string | null; isPublic?: boolean; allowComments?: boolean }) {
  const post = await prisma.post.findFirst({ where: { id, deletedAt: null } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  if (post.userId !== userId) throw forbidden('NOT_OWNER', 'You do not own this post');
  const updated = await prisma.post.update({
    where: { id },
    data: {
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.allowComments !== undefined ? { allowComments: input.allowComments } : {}),
    },
    include: postInclude,
  });
  if (input.caption !== undefined) {
    await prisma.postHashtag.deleteMany({ where: { postId: id } });
    await linkHashtags(id, extractHashtags(input.caption));
  }
  return updated;
}

export async function deletePost(userId: string, role: string, id: string) {
  const post = await prisma.post.findFirst({ where: { id, deletedAt: null } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  if (post.userId !== userId && role !== 'ADMIN') throw forbidden('NOT_OWNER', 'You do not own this post');
  await prisma.post.update({ where: { id }, data: { deletedAt: new Date() } });
  return { ok: true };
}

export async function likePost(userId: string, id: string) {
  const post = await prisma.post.findFirst({ where: { id, deletedAt: null } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  try {
    await prisma.like.create({ data: { userId, postId: id } });
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
    return { liked: true };
  }
  await prisma.post.update({ where: { id }, data: { likeCount: { increment: 1 } } });
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  await notify({
    userId: post.userId,
    type: 'LIKE',
    title: 'New like',
    body: `${actor?.displayName ?? 'Someone'} liked your post`,
    actorId: userId,
    postId: id,
  });
  return { liked: true };
}

export async function unlikePost(userId: string, id: string) {
  const r = await prisma.like.deleteMany({ where: { userId, postId: id } });
  if (r.count > 0) {
    await prisma.post.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
  }
  return { liked: false };
}

export async function postLikes(id: string) {
  const post = await prisma.post.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  return prisma.like.findMany({
    where: { postId: id },
    include: { user: { select: userSelect } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function addComment(userId: string, postId: string, input: { text: string; parentId?: string }) {
  const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: null } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  if (!post.allowComments) throw forbidden('COMMENTS_DISABLED', 'Comments are disabled for this post');
  if (input.parentId) {
    const parent = await prisma.comment.findFirst({ where: { id: input.parentId, postId, deletedAt: null } });
    if (!parent) throw notFound('PARENT_NOT_FOUND', 'Parent comment not found');
  }
  const comment = await prisma.comment.create({
    data: { postId, userId, text: input.text.trim(), parentId: input.parentId ?? null },
    include: { user: { select: userSelect } },
  });
  await prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  await notify({
    userId: post.userId,
    type: 'COMMENT',
    title: 'New comment',
    body: `${actor?.displayName ?? 'Someone'} commented: ${input.text.slice(0, 80)}`,
    actorId: userId,
    postId,
  });
  return comment;
}

interface CommentNode {
  id: string;
  text: string;
  likeCount: number;
  createdAt: Date;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  replies: CommentNode[];
}

export async function listComments(postId: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  const rows = await prisma.comment.findMany({
    where: { postId, deletedAt: null },
    include: { user: { select: userSelect } },
    orderBy: { createdAt: 'asc' },
  });
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      text: r.text,
      likeCount: r.likeCount,
      createdAt: r.createdAt,
      user: r.user,
      replies: [],
    });
  }
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parentId && byId.has(r.parentId)) byId.get(r.parentId)!.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function deleteComment(userId: string, role: string, commentId: string) {
  const comment = await prisma.comment.findFirst({ where: { id: commentId, deletedAt: null } });
  if (!comment) throw notFound('COMMENT_NOT_FOUND', 'Comment not found');
  const post = await prisma.post.findUnique({ where: { id: comment.postId }, select: { userId: true } });
  const canDelete = comment.userId === userId || post?.userId === userId || role === 'ADMIN';
  if (!canDelete) throw forbidden('FORBIDDEN', 'You cannot delete this comment');
  await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  await prisma.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } });
  return { ok: true };
}

export async function likeComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findFirst({ where: { id: commentId, deletedAt: null } });
  if (!comment) throw notFound('COMMENT_NOT_FOUND', 'Comment not found');
  try {
    await prisma.like.create({ data: { userId, commentId } });
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
    return { liked: true };
  }
  await prisma.comment.update({ where: { id: commentId }, data: { likeCount: { increment: 1 } } });
  return { liked: true };
}

export async function unlikeComment(userId: string, commentId: string) {
  const r = await prisma.like.deleteMany({ where: { userId, commentId } });
  if (r.count > 0) {
    await prisma.comment.update({ where: { id: commentId }, data: { likeCount: { decrement: 1 } } });
  }
  return { liked: false };
}

export async function sharePost(userId: string, postId: string, target?: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: null } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  await prisma.share.create({ data: { userId, postId } });
  await prisma.post.update({ where: { id: postId }, data: { shareCount: { increment: 1 } } });
  if (target) {
    // share into a conversation the user participates in
    const { sendMessage } = await import('../conversations/service');
    await sendMessage(userId, target, {
      type: 'TEXT',
      text: `Shared a post: ${postId}`,
      data: { sharedPostId: postId },
    });
  }
  return { ok: true };
}

export async function savePost(userId: string, postId: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  try {
    await prisma.savedPost.create({ data: { userId, postId } });
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
    return { saved: true };
  }
  await prisma.post.update({ where: { id: postId }, data: { saveCount: { increment: 1 } } });
  return { saved: true };
}

export async function unsavePost(userId: string, postId: string) {
  const r = await prisma.savedPost.deleteMany({ where: { userId, postId } });
  if (r.count > 0) {
    await prisma.post.update({ where: { id: postId }, data: { saveCount: { decrement: 1 } } });
  }
  return { saved: false };
}

export async function savedPosts(userId: string) {
  const rows = await prisma.savedPost.findMany({
    where: { userId, post: { deletedAt: null } },
    include: { post: { include: postInclude } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => r.post);
}

export async function reportPost(userId: string, postId: string, reason: string, details?: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  return createReport(userId, { targetType: 'POST', targetId: postId, reason, details });
}

export async function featurePost(postId: string, featured: boolean) {
  return prisma.post.update({ where: { id: postId }, data: { isFeatured: featured } });
}

// ─── creator dashboard ────────────────────────────────────────────────────

export async function creatorAnalytics(userId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.creatorAnalytics.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });
  const totals = rows.reduce(
    (acc, r) => ({
      views: acc.views + r.views,
      likes: acc.likes + r.likes,
      comments: acc.comments + r.comments,
      shares: acc.shares + r.shares,
      newFollowers: acc.newFollowers + r.newFollowers,
      watchTimeSec: acc.watchTimeSec + r.watchTimeSec,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0, newFollowers: 0, watchTimeSec: 0 },
  );
  const topPosts = await prisma.post.findMany({
    where: { userId, deletedAt: null, status: 'PUBLISHED' },
    orderBy: { viewCount: 'desc' },
    take: 10,
    include: { assets: { take: 1 } },
  });
  return { totals, series: rows, topPosts };
}

export async function creatorDrafts(userId: string) {
  return prisma.post.findMany({
    where: { userId, status: PostStatus.DRAFT, deletedAt: null },
    include: postInclude,
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
}

export async function creatorPosts(userId: string) {
  return prisma.post.findMany({
    where: { userId, status: { in: [PostStatus.PUBLISHED, PostStatus.PROCESSING] }, deletedAt: null },
    include: postInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
