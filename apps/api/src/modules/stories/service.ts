import { MediaStatus, StoryPrivacy, Prisma } from '@prisma/client';
import type { Story } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { notify } from '../notifications/service';
import { emitToUser } from '../../realtime/events';
import { findOrCreateDirectConversation, sendMessage } from '../conversations/service';

const STORY_TTL_MS = 24 * 3600 * 1000;

const storyUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

function isActive(story: Story): boolean {
  return !story.deletedAt && !story.isArchived && story.expiresAt > new Date();
}

export async function canViewStory(viewerId: string, story: Story): Promise<boolean> {
  if (!isActive(story)) return false;
  if (story.userId === viewerId) return true;
  if (story.hideFrom.includes(viewerId)) return false;
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: story.userId },
        { blockerId: story.userId, blockedId: viewerId },
      ],
    },
  });
  if (blocked) return false;
  switch (story.privacy) {
    case StoryPrivacy.EVERYONE:
      return true;
    case StoryPrivacy.FRIENDS: {
      const f = await prisma.friend.findUnique({
        where: { userId_friendId: { userId: story.userId, friendId: viewerId } },
      });
      return !!f;
    }
    case StoryPrivacy.CLOSE_FRIENDS: {
      const cf = await prisma.closeFriend.findUnique({
        where: { userId_closeFriendId: { userId: story.userId, closeFriendId: viewerId } },
      });
      return !!cf;
    }
    default:
      return false;
  }
}

async function getViewableStory(viewerId: string, id: string): Promise<Story> {
  const story = await prisma.story.findFirst({ where: { id, deletedAt: null } });
  if (!story) throw notFound('STORY_NOT_FOUND', 'Story not found');
  if (!(await canViewStory(viewerId, story))) {
    throw story.userId === viewerId || isActive(story)
      ? forbidden('STORY_NOT_VISIBLE', 'You cannot view this story')
      : notFound('STORY_NOT_FOUND', 'Story not found');
  }
  return story;
}

export async function createStory(userId: string, input: {
  assetId: string;
  mediaType: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'THUMBNAIL';
  caption?: string;
  textOverlays?: unknown[];
  stickers?: unknown[];
  musicId?: string;
  locationName?: string;
  mentions?: string[];
  poll?: Record<string, unknown> | null;
  question?: string;
  privacy?: StoryPrivacy;
  hideFrom?: string[];
}) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.assetId, deletedAt: null } });
  if (!asset) throw notFound('ASSET_NOT_FOUND', 'Media asset not found');
  if (asset.ownerId !== userId) throw forbidden('NOT_OWNER', 'You do not own this asset');
  if (asset.status !== MediaStatus.READY) {
    throw badRequest('ASSET_NOT_READY', 'Media asset is not ready yet');
  }
  const owner = await prisma.user.findUnique({ where: { id: userId } });
  const story = await prisma.story.create({
    data: {
      userId,
      mediaUrl: asset.url,
      mediaType: input.mediaType,
      thumbnailUrl: asset.thumbnailUrl,
      caption: input.caption ?? null,
      textOverlays: (input.textOverlays ?? []) as object,
      stickers: (input.stickers ?? []) as object,
      musicId: input.musicId ?? null,
      locationName: input.locationName ?? null,
      mentions: input.mentions ?? [],
      poll: input.poll ? (input.poll as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      question: input.question ?? null,
      privacy: input.privacy ?? owner?.storyPrivacyDefault ?? StoryPrivacy.FRIENDS,
      hideFrom: input.hideFrom ?? [],
      expiresAt: new Date(Date.now() + STORY_TTL_MS),
    },
  });
  return story;
}

export async function storyFeed(userId: string) {
  const friends = await prisma.friend.findMany({ where: { userId }, select: { friendId: true } });
  const ids = [userId, ...friends.map((f) => f.friendId)];
  const now = new Date();
  const stories = await prisma.story.findMany({
    where: {
      userId: { in: ids },
      deletedAt: null,
      isArchived: false,
      expiresAt: { gt: now },
    },
    include: { user: { select: storyUserSelect } },
    orderBy: { createdAt: 'desc' },
  });
  const visible: typeof stories = [];
  for (const s of stories) {
    if (await canViewStory(userId, s)) visible.push(s);
  }
  const grouped = new Map<string, { user: (typeof stories)[number]['user']; stories: typeof visible }>();
  for (const s of visible) {
    let g = grouped.get(s.userId);
    if (!g) {
      g = { user: s.user, stories: [] };
      grouped.set(s.userId, g);
    }
    g.stories.push(s);
  }
  // own stories first, then most recent
  return [...grouped.values()].sort((a, b) => {
    if (a.user.id === userId) return -1;
    if (b.user.id === userId) return 1;
    return b.stories[0].createdAt.getTime() - a.stories[0].createdAt.getTime();
  });
}

export async function userStories(viewerId: string, targetUserId: string) {
  const now = new Date();
  const stories = await prisma.story.findMany({
    where: { userId: targetUserId, deletedAt: null, isArchived: false, expiresAt: { gt: now } },
    orderBy: { createdAt: 'asc' },
  });
  const out: Story[] = [];
  for (const s of stories) {
    if (await canViewStory(viewerId, s)) out.push(s);
  }
  return out;
}

export async function getStory(viewerId: string, id: string) {
  return getViewableStory(viewerId, id);
}

export async function deleteStory(userId: string, id: string) {
  const story = await prisma.story.findFirst({ where: { id, deletedAt: null } });
  if (!story) throw notFound('STORY_NOT_FOUND', 'Story not found');
  if (story.userId !== userId) throw forbidden('NOT_OWNER', 'You do not own this story');
  await prisma.story.update({ where: { id }, data: { deletedAt: new Date() } });
  return { ok: true };
}

export async function viewStory(viewerId: string, id: string) {
  const story = await getViewableStory(viewerId, id);
  const existing = await prisma.storyView.findUnique({
    where: { storyId_viewerId: { storyId: id, viewerId } },
  });
  if (existing) return { viewed: true, alreadyViewed: true };
  await prisma.$transaction([
    prisma.storyView.create({ data: { storyId: id, viewerId } }),
    prisma.story.update({ where: { id }, data: { viewCount: { increment: 1 } } }),
  ]);
  emitToUser(story.userId, 'story:viewed', { storyId: id, viewerId });
  return { viewed: true, alreadyViewed: false };
}

export async function storyViewers(userId: string, id: string) {
  const story = await prisma.story.findFirst({ where: { id, deletedAt: null } });
  if (!story) throw notFound('STORY_NOT_FOUND', 'Story not found');
  if (story.userId !== userId) throw forbidden('NOT_OWNER', 'Only the owner can see viewers');
  return prisma.storyView.findMany({
    where: { storyId: id },
    include: { viewer: { select: storyUserSelect } },
    orderBy: { viewedAt: 'desc' },
  });
}

export async function reactToStory(userId: string, id: string, emoji: string) {
  const story = await getViewableStory(userId, id);
  const reaction = await prisma.storyReaction.upsert({
    where: { storyId_userId: { storyId: id, userId } },
    create: { storyId: id, userId, emoji },
    update: { emoji },
  });
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  await notify({
    userId: story.userId,
    type: 'STORY_REACTION',
    title: 'Story reaction',
    body: `${actor?.displayName ?? 'Someone'} reacted ${emoji} to your story`,
    actorId: userId,
    storyId: id,
  });
  return reaction;
}

export async function replyToStory(userId: string, id: string, text: string) {
  const story = await getViewableStory(userId, id);
  const reply = await prisma.storyReply.create({ data: { storyId: id, userId, text } });
  // Also deliver as a DM to the story owner.
  if (story.userId !== userId) {
    const conversation = await findOrCreateDirectConversation(userId, story.userId);
    await sendMessage(userId, conversation.id, {
      type: 'TEXT',
      text,
      data: { storyReply: true, storyId: id },
    });
    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    await notify({
      userId: story.userId,
      type: 'STORY_REPLY',
      title: 'Story reply',
      body: `${actor?.displayName ?? 'Someone'} replied to your story: ${text.slice(0, 80)}`,
      actorId: userId,
      storyId: id,
      conversationId: conversation.id,
    });
  }
  return reply;
}

export async function archive(userId: string) {
  return prisma.story.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [{ isArchived: true }, { expiresAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function listHighlights(userId: string, targetUserId?: string) {
  return prisma.storyHighlight.findMany({
    where: { userId: targetUserId ?? userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createHighlight(userId: string, input: { title: string; storyIds: string[]; coverAssetId?: string }) {
  let coverUrl: string | null = null;
  if (input.coverAssetId) {
    const asset = await prisma.mediaAsset.findFirst({ where: { id: input.coverAssetId, deletedAt: null } });
    if (!asset || asset.ownerId !== userId) throw badRequest('INVALID_COVER', 'Cover asset not found or not yours');
    coverUrl = asset.thumbnailUrl ?? asset.url;
  }
  if (input.storyIds.length > 0) {
    const count = await prisma.story.count({ where: { id: { in: input.storyIds }, userId, deletedAt: null } });
    if (count !== input.storyIds.length) throw badRequest('INVALID_STORIES', 'Some stories do not exist or are not yours');
  }
  return prisma.storyHighlight.create({
    data: { userId, title: input.title, storyIds: input.storyIds, coverUrl },
  });
}

export async function updateHighlight(userId: string, id: string, input: { title?: string; storyIds?: string[]; coverAssetId?: string | null }) {
  const highlight = await prisma.storyHighlight.findFirst({ where: { id, userId } });
  if (!highlight) throw notFound('HIGHLIGHT_NOT_FOUND', 'Highlight not found');
  let coverUrl = highlight.coverUrl;
  if (input.coverAssetId !== undefined) {
    if (input.coverAssetId === null) {
      coverUrl = null;
    } else {
      const asset = await prisma.mediaAsset.findFirst({ where: { id: input.coverAssetId, deletedAt: null } });
      if (!asset || asset.ownerId !== userId) throw badRequest('INVALID_COVER', 'Cover asset not found or not yours');
      coverUrl = asset.thumbnailUrl ?? asset.url;
    }
  }
  if (input.storyIds) {
    const count = await prisma.story.count({ where: { id: { in: input.storyIds }, userId, deletedAt: null } });
    if (count !== input.storyIds.length) throw badRequest('INVALID_STORIES', 'Some stories do not exist or are not yours');
  }
  return prisma.storyHighlight.update({
    where: { id },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.storyIds ? { storyIds: input.storyIds } : {}),
      coverUrl,
    },
  });
}

export async function deleteHighlight(userId: string, id: string) {
  const highlight = await prisma.storyHighlight.findFirst({ where: { id, userId } });
  if (!highlight) throw notFound('HIGHLIGHT_NOT_FOUND', 'Highlight not found');
  await prisma.storyHighlight.delete({ where: { id } });
  return { ok: true };
}
