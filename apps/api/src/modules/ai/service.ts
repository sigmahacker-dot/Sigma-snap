import type { AiGenerationKind } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { getAiProvider, LocalAiProvider, type AiLanguage, type AiProvider } from '../../services/ai';
import { notFound, providerNotConfigured } from '../../utils/errors';

/** Run a generation, logging every call to AiGeneration for the admin dashboard. */
async function run<T extends Record<string, unknown>>(
  userId: string,
  kind: AiGenerationKind,
  input: Record<string, unknown>,
  language: string | undefined,
  fn: (provider: AiProvider) => Promise<T>,
): Promise<T> {
  const provider = getAiProvider();
  try {
    const output = await fn(provider);
    await prisma.aiGeneration.create({
      data: {
        userId,
        kind,
        input: input as object,
        output: output as object,
        provider: provider.name,
        language: language ?? null,
        status: 'SUCCEEDED',
      },
    });
    return output;
  } catch (err) {
    await prisma.aiGeneration.create({
      data: {
        userId,
        kind,
        input: input as object,
        output: {},
        provider: provider.name,
        language: language ?? null,
        status: 'FAILED',
      },
    });
    throw err;
  }
}

export const caption = (userId: string, input: { context?: string; language: AiLanguage }) =>
  run(userId, 'CAPTION', input, input.language, (p) => p.caption(input));

export const hashtags = (userId: string, input: { caption?: string; language: AiLanguage }) =>
  run(userId, 'HASHTAG', input, input.language, (p) => p.hashtags(input));

export const title = (userId: string, input: { context?: string; language: AiLanguage }) =>
  run(userId, 'TITLE', input, input.language, (p) => p.title(input));

export const script = (userId: string, input: { topic: string; durationSec?: number; language: AiLanguage }) =>
  run(userId, 'SCRIPT', input, input.language, (p) => p.script(input));

export const ideas = (userId: string, input: { kind: 'story' | 'video'; niche?: string; language: AiLanguage }) =>
  run(
    userId,
    input.kind === 'story' ? 'STORY_IDEA' : 'VIDEO_IDEA',
    input,
    input.language,
    (p) => p.ideas(input),
  );

export const effect = (userId: string, input: { prompt: string; language?: AiLanguage }) =>
  run(userId, 'EFFECT_PROMPT', input, input.language, (p) => p.effect(input));

export async function thumbnail(userId: string, input: { postId: string }) {
  const post = await prisma.post.findFirst({ where: { id: input.postId, deletedAt: null } });
  if (!post) throw notFound('POST_NOT_FOUND', 'Post not found');
  return run(userId, 'THUMBNAIL', input, undefined, (p) =>
    p.thumbnailSpec({ postId: input.postId, caption: post.caption ?? undefined }),
  );
}

export async function subtitles(userId: string, input: { assetId: string; language: AiLanguage }) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.assetId, deletedAt: null } });
  if (!asset) throw notFound('ASSET_NOT_FOUND', 'Media asset not found');
  return run(userId, 'SUBTITLE', input, input.language, (p) =>
    p.subtitles({ assetId: input.assetId, durationSec: asset.durationSec ?? 30, language: input.language }),
  );
}

export const translate = (userId: string, input: { text: string; targetLang: AiLanguage }) =>
  run(userId, 'TRANSLATION', input, input.targetLang, (p) => p.translate(input));

/** Voice synthesis: the local provider cannot do TTS → honest 501. */
export async function voice(userId: string, input: { text: string; voice?: string; language: AiLanguage }) {
  const provider = getAiProvider();
  if (provider instanceof LocalAiProvider) {
    await prisma.aiGeneration.create({
      data: {
        userId,
        kind: 'VOICE',
        input: input as object,
        output: {},
        provider: provider.name,
        language: input.language,
        status: 'FAILED',
      },
    });
    throw providerNotConfigured(
      'Voice synthesis is not available with the local AI provider. Configure a TTS provider via AI_PROVIDER/AI_API_KEY.',
    );
  }
  return run(userId, 'VOICE', input, input.language, async () => {
    throw providerNotConfigured('Voice synthesis provider is not implemented in this build');
  });
}

export async function background(userId: string, input: { assetId: string; prompt: string }) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.assetId, deletedAt: null } });
  if (!asset) throw notFound('ASSET_NOT_FOUND', 'Media asset not found');
  if (asset.ownerId !== userId) {
    // allow any authenticated user to generate the spec; the source stays the owner's
  }
  return run(userId, 'BACKGROUND', input, undefined, (p) => p.background(input));
}
