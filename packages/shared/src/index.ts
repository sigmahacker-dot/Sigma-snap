// @sigma-snap/shared — shared types + plan/feature-flag constants.
// Single source of truth for DTOs used by apps/api and apps/web.

export type Role = 'USER' | 'MODERATOR' | 'ADMIN';
export type Plan = 'FREE' | 'PRO' | 'CREATOR';
export type MediaKind = 'PHOTO' | 'VIDEO' | 'AUDIO' | 'THUMBNAIL';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'STICKER' | 'GIF' | 'FILE';
export type StoryPrivacy = 'EVERYONE' | 'FRIENDS' | 'CLOSE_FRIENDS';
export type PrivacyLevel = 'EVERYONE' | 'FRIENDS' | 'NOBODY';
export type LensCategory =
  | 'FACE_EFFECTS' | 'BEAUTY' | 'FUNNY' | 'ANIMALS' | 'CARTOON' | 'THREE_D'
  | 'DISTORTION' | 'BACKGROUND' | 'ENVIRONMENT' | 'WEATHER' | 'GAMING'
  | 'HORROR' | 'CINEMATIC' | 'SEASONAL' | 'TRENDING';
export type TemplateCategory =
  | 'TRENDING' | 'TRAVEL' | 'NATURE' | 'POETRY' | 'ISLAMIC' | 'MOTIVATION'
  | 'BIRTHDAY' | 'WEDDING' | 'CINEMATIC' | 'GAMING' | 'BUSINESS' | 'MEME'
  | 'MUSIC' | 'BEAT_SYNC';
export type AiLanguage = 'ur' | 'roman-ur' | 'en' | 'ar' | 'hi';

export interface User {
  id: string; email: string; username: string; displayName: string;
  bio?: string | null; avatarUrl?: string | null; role: Role; plan: Plan;
  isOnline: boolean; lastSeenAt?: string | null; showOnlineStatus: boolean;
  createdAt: string;
}

export interface Profile extends User {
  website?: string | null; location?: string | null; isPrivate: boolean;
  followersCount: number; followingCount: number; friendsCount: number;
}

export interface AuthResponse { user: User; accessToken: string; }

export interface MediaAsset {
  id: string; kind: MediaKind; url: string; thumbnailUrl?: string | null;
  width?: number | null; height?: number | null; durationSec?: number | null;
  status: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
}

export interface Post {
  id: string; userId: string; user?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  kind: MediaKind; caption?: string | null; assets: MediaAsset[];
  likeCount: number; commentCount: number; shareCount: number; viewCount: number;
  likedByMe?: boolean; savedByMe?: boolean; createdAt: string;
}

export interface Story {
  id: string; userId: string; user?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  mediaUrl: string; mediaType: MediaKind; thumbnailUrl?: string | null;
  caption?: string | null; textOverlays: unknown[]; stickers: unknown[];
  musicId?: string | null; locationName?: string | null; mentions: string[];
  poll?: unknown | null; question?: string | null; privacy: StoryPrivacy;
  expiresAt: string; viewCount: number; viewedByMe?: boolean; createdAt: string;
}

export interface Message {
  id: string; conversationId: string; senderId: string;
  sender?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  type: MessageType; text?: string | null; replyToId?: string | null;
  replyTo?: { id: string; senderId: string; type: MessageType; text?: string | null;
    sender?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> } | null;
  attachments: Array<{ id: string; kind: string; url: string; thumbnailUrl?: string | null; durationSec?: number | null; mimeType?: string | null }>;
  reactions: Array<{ userId: string; emoji: string }>;
  expiresAt?: string | null; isDeleted: boolean; createdAt: string;
}

export interface Conversation {
  id: string; type: 'DIRECT' | 'GROUP'; title?: string | null; avatarUrl?: string | null;
  participants: Array<{ userId: string; user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>; lastReadAt?: string | null; muted: boolean }>;
  lastMessage?: Message | null; unreadCount: number; disappearingAfterSec: number;
  lastMessageAt?: string | null;
}

export interface AppNotification {
  id: string; type: string; title: string; body?: string | null;
  actor?: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> | null;
  postId?: string | null; storyId?: string | null; conversationId?: string | null;
  data: Record<string, unknown>; readAt?: string | null; createdAt: string;
}

export interface Lens {
  id: string; name: string; category: LensCategory; description?: string | null;
  config: Record<string, unknown>; thumbnailUrl?: string | null;
  isPremium: boolean; usageCount: number;
}

export interface Sound {
  id: string; title: string; artist?: string | null; durationSec?: number | null;
  url?: string | null; license: string; usageCount: number;
}

export interface Template {
  id: string; title: string; description?: string | null; category: TemplateCategory;
  previewUrl?: string | null; durationSec?: number | null;
  slots: Array<{ index: number; kind: 'media' | 'text'; label: string; required: boolean }>;
  isPremium: boolean; usageCount: number;
}

export interface Page<T> { data: T[]; page: { nextCursor: string | null }; }
export interface ApiError { error: { code: string; message: string; details?: unknown } }

// ─── Admin CMS / remote config ─────────────────────────────────────────

export interface Announcement {
  id: string; title: string; body: string;
  imageUrl?: string | null; ctaUrl?: string | null;
  active: boolean; startsAt?: string | null; endsAt?: string | null;
  createdAt: string; updatedAt: string;
}

export interface ManagedLens {
  id: string; key: string; name: string; description?: string | null;
  configJson: Record<string, unknown>; enabled: boolean; sortOrder: number;
  createdAt: string; updatedAt: string;
}

export interface FeatureFlagDto {
  id: string; key: string; enabled: boolean; description?: string | null;
  plans: Plan[]; config: Record<string, unknown>; updatedAt: string;
}

/** Remote-config payload for the app shell: banners, tab gating, camera lenses. */
export interface AppConfig {
  announcements: Announcement[];
  flags: Record<string, boolean>;
  lenses: ManagedLens[];
}

export interface SavedMessage {
  id: string; userId: string; messageId: string; createdAt: string;
  message: Message & { conversation?: Pick<Conversation, 'id' | 'type' | 'title'> | null };
}

// ─── Plans & feature flags ─────────────────────────────────────────────

export const PLANS: Record<Plan, { label: string; priceMonthlyUSD: number; perks: string[] }> = {
  FREE: { label: 'Free', priceMonthlyUSD: 0, perks: ['720p exports', 'Basic lenses', '3 AI credits / day'] },
  PRO: { label: 'Pro', priceMonthlyUSD: 4.99, perks: ['1080p exports', 'Premium lenses', '100 AI credits / day', 'Extra cloud storage'] },
  CREATOR: { label: 'Creator', priceMonthlyUSD: 9.99, perks: ['4K exports', 'All lenses + effects', 'Unlimited AI credits', 'Advanced analytics', 'Premium templates'] },
};

export const FEATURE_KEYS = [
  'premium_lenses', 'ai_credits', 'export_quality', 'cloud_storage_gb',
  'advanced_analytics', 'premium_templates', 'priority_processing',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const PLAN_FEATURES: Record<Plan, Record<FeatureKey, string | number | boolean>> = {
  FREE: { premium_lenses: false, ai_credits: 3, export_quality: '720p', cloud_storage_gb: 2, advanced_analytics: false, premium_templates: false, priority_processing: false },
  PRO: { premium_lenses: true, ai_credits: 100, export_quality: '1080p', cloud_storage_gb: 50, advanced_analytics: false, premium_templates: true, priority_processing: true },
  CREATOR: { premium_lenses: true, ai_credits: -1, export_quality: '4K', cloud_storage_gb: 200, advanced_analytics: true, premium_templates: true, priority_processing: true },
};

// ─── Lens SDK contract (mirrored in packages/lens-sdk) ────────────────

export interface FaceBox { x: number; y: number; w: number; h: number; confidence: number; }

export interface LensDefinition {
  id: string;
  name: string;
  category: LensCategory;
  description: string;
  isPremium: boolean;
  /** Draw the effect. ctx = output canvas 2d context (frame already drawn). */
  apply(ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, faces: FaceBox[], t: number): void;
  /** Render a small thumbnail for the carousel. */
  thumbnail(canvas: HTMLCanvasElement): void;
}
