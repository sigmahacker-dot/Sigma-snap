import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './db/prisma';
import { env } from './config/env';

const BCRYPT_COST = 12;

function seedUrl(name: string): string {
  return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/seed/${name}`;
}

async function upsertUser(data: {
  email: string;
  username: string;
  password: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  plan: 'FREE' | 'PRO' | 'CREATOR';
  bio?: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);
  return prisma.user.upsert({
    where: { email: data.email },
    update: { role: data.role, plan: data.plan, passwordHash },
    create: {
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName,
      usernameChangedAt: new Date(),
      role: data.role,
      plan: data.plan,
      bio: data.bio ?? null,
      profile: { create: {} },
    },
  });
}

async function main(): Promise<void> {
  console.log('[seed] starting…');

  const admin = await upsertUser({
    email: 'admin@sigmasnap.app',
    username: 'sigma.admin',
    password: 'SigmaAdmin123!',
    displayName: 'Sigma Admin',
    role: 'ADMIN',
    plan: 'CREATOR',
    bio: 'Platform administrator',
  });
  const nova = await upsertUser({
    email: 'nova@sigmasnap.app',
    username: 'nova',
    password: 'SigmaDemo123!',
    displayName: 'Nova Ray',
    role: 'USER',
    plan: 'FREE',
    bio: 'Chasing light, one frame at a time ✨',
  });
  const pixel = await upsertUser({
    email: 'pixel@sigmasnap.app',
    username: 'pixel',
    password: 'SigmaDemo123!',
    displayName: 'Pixel Khan',
    role: 'USER',
    plan: 'FREE',
    bio: 'Street stories & golden hours',
  });
  console.log('[seed] users ready');

  // follows (idempotent via unique constraint)
  for (const [followerId, followingId] of [[nova.id, pixel.id], [pixel.id, nova.id]] as const) {
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });
  }
  // friendship both ways
  for (const [userId, friendId] of [[nova.id, pixel.id], [pixel.id, nova.id]] as const) {
    await prisma.friend.upsert({
      where: { userId_friendId: { userId, friendId } },
      create: { userId, friendId },
      update: {},
    });
  }
  console.log('[seed] follows + friendship ready');

  // demo media assets + posts
  const asset1 = await prisma.mediaAsset.upsert({
    where: { id: 'seed-asset-nova-1' },
    update: {},
    create: {
      id: 'seed-asset-nova-1',
      ownerId: nova.id,
      kind: 'PHOTO',
      url: seedUrl('nova-city-dawn.jpg'),
      width: 1080,
      height: 1350,
      sizeBytes: 420_000,
      mimeType: 'image/jpeg',
      status: 'READY',
    },
  });
  const asset2 = await prisma.mediaAsset.upsert({
    where: { id: 'seed-asset-pixel-1' },
    update: {},
    create: {
      id: 'seed-asset-pixel-1',
      ownerId: pixel.id,
      kind: 'PHOTO',
      url: seedUrl('pixel-street-tales.jpg'),
      width: 1080,
      height: 1350,
      sizeBytes: 510_000,
      mimeType: 'image/jpeg',
      status: 'READY',
    },
  });

  const postCount = await prisma.post.count({ where: { userId: { in: [nova.id, pixel.id] } } });
  if (postCount === 0) {
    const p1 = await prisma.post.create({
      data: {
        userId: nova.id,
        kind: 'PHOTO',
        caption: 'First light over the city #goldenhour #sigmasnap',
        isPublic: true,
        status: 'PUBLISHED',
        assets: { connect: [{ id: asset1.id }] },
      },
    });
    const p2 = await prisma.post.create({
      data: {
        userId: pixel.id,
        kind: 'PHOTO',
        caption: 'Street tales, frame two #streetphotography',
        isPublic: true,
        status: 'PUBLISHED',
        assets: { connect: [{ id: asset2.id }] },
      },
    });
    for (const tag of ['goldenhour', 'sigmasnap', 'streetphotography']) {
      const h = await prisma.hashtag.upsert({
        where: { name: tag },
        create: { name: tag, usageCount: 1 },
        update: { usageCount: { increment: 1 } },
      });
      await prisma.postHashtag.createMany({
        data: [
          ...(tag === 'streetphotography' ? [{ postId: p2.id, hashtagId: h.id }] : [{ postId: p1.id, hashtagId: h.id }]),
        ],
        skipDuplicates: true,
      });
    }
    console.log('[seed] 2 demo posts created');
  }

  // demo story (24h expiry)
  const storyCount = await prisma.story.count({ where: { userId: nova.id } });
  if (storyCount === 0) {
    await prisma.story.create({
      data: {
        userId: nova.id,
        mediaUrl: seedUrl('nova-story-bts.jpg'),
        mediaType: 'PHOTO',
        caption: 'Behind the scenes 🎬',
        privacy: 'FRIENDS',
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });
    console.log('[seed] 1 demo story created');
  }

  // sounds (metadata only — original, no copyrighted audio)
  const sounds = [
    { title: 'Neon Pulse', artist: 'Sigma Lab', durationSec: 15 },
    { title: 'Desert Wind', artist: 'Sigma Lab', durationSec: 30 },
    { title: 'Midnight Drive', artist: 'Sigma Lab', durationSec: 22 },
  ];
  for (const s of sounds) {
    const existing = await prisma.sound.findFirst({ where: { title: s.title, artist: s.artist } });
    if (!existing) {
      await prisma.sound.create({ data: { ...s, license: 'ORIGINAL', isOriginal: true } });
    }
  }

  // lenses (original procedural effects)
  const lenses = [
    { name: 'Neon Contours', category: 'FACE_EFFECTS' as const, description: 'Glowing neon edge tracing', isPremium: false },
    { name: 'Prism Rain', category: 'WEATHER' as const, description: 'Rainbow light refractions in rain', isPremium: false },
    { name: 'Galaxy Dust', category: 'ENVIRONMENT' as const, description: 'Swirling stardust particles', isPremium: true },
    { name: 'Sketch Ink', category: 'CARTOON' as const, description: 'Hand-drawn ink outline look', isPremium: false },
  ];
  for (const l of lenses) {
    const existing = await prisma.lens.findFirst({ where: { name: l.name } });
    if (!existing) {
      await prisma.lens.create({ data: { ...l, config: {}, createdById: admin.id } });
    }
  }

  // templates (original compositions)
  const templates = [
    {
      title: 'Golden Hour Reel',
      category: 'CINEMATIC' as const,
      description: 'Warm cinematic montage for sunset clips',
      slots: [
        { index: 0, kind: 'media', label: 'Opening shot', required: true },
        { index: 1, kind: 'media', label: 'Golden moment', required: true },
        { index: 2, kind: 'text', label: 'Caption', required: false },
      ],
    },
    {
      title: 'Birthday Bash',
      category: 'BIRTHDAY' as const,
      description: 'Confetti-filled birthday celebration cut',
      slots: [
        { index: 0, kind: 'media', label: 'Birthday star', required: true },
        { index: 1, kind: 'text', label: 'Wish', required: true },
      ],
    },
  ];
  for (const t of templates) {
    const existing = await prisma.template.findFirst({ where: { title: t.title } });
    if (!existing) {
      await prisma.template.create({
        data: {
          title: t.title,
          category: t.category,
          description: t.description,
          slots: t.slots as unknown as object,
          isPublished: true,
          createdById: admin.id,
        },
      });
    }
  }

  // feature flags
  const flags: { key: string; plans: ('FREE' | 'PRO' | 'CREATOR')[] }[] = [
    { key: 'premium-lenses', plans: ['PRO', 'CREATOR'] },
    { key: 'ai-studio', plans: ['PRO', 'CREATOR'] },
    { key: 'advanced-analytics', plans: ['CREATOR'] },
    { key: 'premium-templates', plans: ['PRO', 'CREATOR'] },
    { key: 'export-4k', plans: ['CREATOR'] },
  ];
  for (const f of flags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      create: { key: f.key, enabled: true, plans: f.plans, config: {} },
      update: { enabled: true, plans: f.plans },
    });
  }

  // remote-config flags consumed by the app shell (announcements, tab gating)
  const remoteFlags: { key: string; description: string }[] = [
    { key: 'calls', description: 'Voice & video calling entry points' },
    { key: 'spotlight', description: 'Discover (Spotlight) feed tab' },
    { key: 'ai_effects', description: 'AI effects studio' },
  ];
  for (const f of remoteFlags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      create: { key: f.key, enabled: true, description: f.description, plans: [], config: {} },
      update: { description: f.description },
    });
  }

  // sample announcements
  const announcements = [
    {
      title: 'Welcome to SIGMA SNAP',
      body: 'Capture, create and connect — your camera-first social home. Try a lens and share your first Snap!',
      active: true,
    },
    {
      title: 'Go Pro, unlock more',
      body: 'Premium lenses, 1080p exports and 100 AI credits a day. Upgrade from Settings → Subscription.',
      ctaUrl: 'https://sigmasnap.app/pro',
      active: true,
    },
  ];
  for (const a of announcements) {
    const existing = await prisma.announcement.findFirst({ where: { title: a.title } });
    if (!existing) await prisma.announcement.create({ data: a });
  }

  console.log('[seed] done.');
  console.log('[seed] admin: admin@sigmasnap.app / SigmaAdmin123!');
  console.log('[seed] demo:  nova@sigmasnap.app / SigmaDemo123!');
  console.log('[seed] demo:  pixel@sigmasnap.app / SigmaDemo123!');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
