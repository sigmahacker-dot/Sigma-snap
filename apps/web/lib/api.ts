// Typed HTTP client for the SIGMA SNAP API (docs/API.md).
// Token is kept in localStorage; refresh handled via httpOnly cookie.

import type {
  ApiError, AppConfig, AppNotification, Announcement, Conversation, FeatureFlagDto, Lens, ManagedLens, MediaAsset, MediaKind, Message,
  Page, Post, Profile, SavedMessage, Sound, Story, Template, User,
} from '@sigma-snap/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'sigmasnap.accessToken';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiException extends Error {
  code: string; status: number; details?: unknown;
  constructor(status: number, body: ApiError) {
    super(body.error.message);
    this.status = status; this.code = body.error.code; this.details = body.error.details;
  }
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/v1${path}`, { ...opts, headers, credentials: 'include' });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiException(res.status, body as ApiError);
  return body as T;
}

export const api = {
  // ── auth ──
  register: (b: { email: string; username: string; password: string; displayName: string }) =>
    req<{ user: User; accessToken: string }>('/auth/register', { method: 'POST', body: JSON.stringify(b) }),
  login: (b: { emailOrUsername: string; password: string }) =>
    req<{ user: User; accessToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify(b) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  me: () => req<User>('/auth/me'),
  changePassword: (b: { currentPassword: string; newPassword: string }) =>
    req('/auth/change-password', { method: 'POST', body: JSON.stringify(b) }),

  // ── media ──
  presign: (b: { kind: MediaKind; mimeType: string; sizeBytes: number }) =>
    req<{ assetId: string; uploadUrl: string; expiresAt: string }>('/media/presign', { method: 'POST', body: JSON.stringify(b) }),
  completeUpload: (id: string, b: { width?: number; height?: number; durationSec?: number }) =>
    req<MediaAsset>(`/media/${id}/complete`, { method: 'POST', body: JSON.stringify(b) }),
  getAsset: (id: string) => req<MediaAsset>(`/media/${id}`),

  async uploadFile(kind: MediaKind, file: File, onProgress?: (p: number) => void): Promise<MediaAsset> {
    const { assetId, uploadUrl } = await api.presign({ kind, mimeType: file.type, sizeBytes: file.size });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('upload failed'));
      xhr.send(file);
    });
    let meta: { width?: number; height?: number; durationSec?: number } = {};
    if (kind === 'PHOTO') {
      const dims = await loadImageDims(file);
      meta = { width: dims.w, height: dims.h };
    } else if (kind === 'VIDEO') {
      const dims = await loadVideoDims(file);
      meta = { width: dims.w, height: dims.h, durationSec: dims.d };
    } else if (kind === 'AUDIO') {
      const d = await loadAudioDuration(file);
      meta = { durationSec: d };
    }
    return api.completeUpload(assetId, meta);
  },

  // ── users ──
  searchUsers: (q: string) => req<User[]>(`/users/search?q=${encodeURIComponent(q)}`),
  suggestions: () => req<User[]>('/users/suggestions'),
  getUser: (username: string) => req<Profile>(`/users/${encodeURIComponent(username)}`),
  updateMe: (b: Partial<Pick<User, 'displayName' | 'bio'>> & { website?: string; location?: string }) =>
    req<User>('/users/me', { method: 'PATCH', body: JSON.stringify(b) }),
  changeUsername: (username: string) => req<User>('/users/me/username', { method: 'PATCH', body: JSON.stringify({ username }) }),
  setAvatar: (assetId: string) => req<User>('/users/me/avatar', { method: 'PATCH', body: JSON.stringify({ assetId }) }),
  updatePrivacy: (b: Record<string, unknown>) => req<User>('/users/me/privacy', { method: 'PATCH', body: JSON.stringify(b) }),
  updateNotificationPrefs: (b: Record<string, boolean>) => req('/users/me/notifications', { method: 'PATCH', body: JSON.stringify(b) }),
  updateLocation: (b: { mode: 'OFF' | 'FRIENDS' | 'TEMPORARY'; latitude?: number; longitude?: number; minutes?: number }) =>
    req<User>('/users/me/location', { method: 'PATCH', body: JSON.stringify(b) }),
  followers: (id: string, cursor?: string) => req<Page<User>>(`/users/${id}/followers${cursor ? `?cursor=${cursor}` : ''}`),
  following: (id: string, cursor?: string) => req<Page<User>>(`/users/${id}/following${cursor ? `?cursor=${cursor}` : ''}`),
  follow: (id: string) => req(`/users/${id}/follow`, { method: 'POST' }),
  unfollow: (id: string) => req(`/users/${id}/follow`, { method: 'DELETE' }),
  block: (id: string) => req(`/users/${id}/block`, { method: 'POST' }),
  unblock: (id: string) => req(`/users/${id}/block`, { method: 'DELETE' }),
  mute: (id: string) => req(`/users/${id}/mute`, { method: 'POST' }),
  unmute: (id: string) => req(`/users/${id}/mute`, { method: 'DELETE' }),
  blockedList: () => req<User[]>('/users/me/blocked'),

  // ── friends ──
  friends: () => req<User[]>('/friends'),
  friendRequests: (dir: 'incoming' | 'outgoing') => req<any[]>(`/friends/requests?dir=${dir}`),
  sendFriendRequest: (toUserId: string) => req('/friends/requests', { method: 'POST', body: JSON.stringify({ toUserId }) }),
  acceptRequest: (id: string) => req(`/friends/requests/${id}/accept`, { method: 'POST' }),
  rejectRequest: (id: string) => req(`/friends/requests/${id}/reject`, { method: 'POST' }),
  removeFriend: (userId: string) => req(`/friends/${userId}`, { method: 'DELETE' }),
  closeFriends: () => req<User[]>('/friends/close'),
  addCloseFriend: (userId: string) => req(`/friends/close/${userId}`, { method: 'POST' }),
  removeCloseFriend: (userId: string) => req(`/friends/close/${userId}`, { method: 'DELETE' }),

  // ── stories ──
  createStory: (b: Record<string, unknown>) => req<Story>('/stories', { method: 'POST', body: JSON.stringify(b) }),
  storyFeed: () => req<Array<{ user: User; stories: Story[] }>>('/stories/feed'),
  userStories: (userId: string) => req<Story[]>(`/stories/user/${userId}`),
  deleteStory: (id: string) => req(`/stories/${id}`, { method: 'DELETE' }),
  viewStory: (id: string) => req(`/stories/${id}/view`, { method: 'POST' }),
  storyViewers: (id: string) => req<User[]>(`/stories/${id}/viewers`),
  reactStory: (id: string, emoji: string) => req(`/stories/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  replyStory: (id: string, text: string) => req(`/stories/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
  storyArchive: () => req<Story[]>('/stories/archive'),
  highlights: () => req<any[]>('/stories/highlights'),
  createHighlight: (b: { title: string; storyIds: string[]; coverAssetId?: string }) =>
    req('/stories/highlights', { method: 'POST', body: JSON.stringify(b) }),
  deleteHighlight: (id: string) => req(`/stories/highlights/${id}`, { method: 'DELETE' }),

  // ── posts / feed ──
  createPost: (b: Record<string, unknown>) => req<Post>('/posts', { method: 'POST', body: JSON.stringify(b) }),
  feed: (cursor?: string) => req<Page<Post>>(`/feed${cursor ? `?cursor=${cursor}` : ''}`),
  followingFeed: (cursor?: string) => req<Page<Post>>(`/feed/following${cursor ? `?cursor=${cursor}` : ''}`),
  getPost: (id: string) => req<Post>(`/posts/${id}`),
  updatePost: (id: string, b: Record<string, unknown>) => req<Post>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deletePost: (id: string) => req(`/posts/${id}`, { method: 'DELETE' }),
  likePost: (id: string) => req(`/posts/${id}/like`, { method: 'POST' }),
  unlikePost: (id: string) => req(`/posts/${id}/like`, { method: 'DELETE' }),
  postComments: (id: string, cursor?: string) => req<Page<any>>(`/posts/${id}/comments${cursor ? `?cursor=${cursor}` : ''}`),
  comment: (id: string, b: { text: string; parentId?: string }) =>
    req(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify(b) }),
  deleteComment: (id: string) => req(`/comments/${id}`, { method: 'DELETE' }),
  likeComment: (id: string) => req(`/comments/${id}/like`, { method: 'POST' }),
  sharePost: (id: string, target?: string) => req(`/posts/${id}/share`, { method: 'POST', body: JSON.stringify({ target }) }),
  savePost: (id: string) => req(`/posts/${id}/save`, { method: 'POST' }),
  unsavePost: (id: string) => req(`/posts/${id}/save`, { method: 'DELETE' }),
  savedPosts: () => req<Post[]>('/users/me/saved'),

  // ── search ──
  search: (q: string, type = 'all') => req<any>(`/search?q=${encodeURIComponent(q)}&type=${type}`),
  trending: () => req<any>('/search/trending'),
  searchSuggestions: (q: string) => req<string[]>(`/search/suggestions?q=${encodeURIComponent(q)}`),
  searchHistory: () => req<Array<{ id: string; query: string }>>('/search/history'),
  clearSearchHistory: () => req('/search/history', { method: 'DELETE' }),

  // ── sounds / lenses / effects / templates ──
  sounds: (q?: string) => req<Page<Sound>>(`/sounds${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getSound: (id: string) => req<Sound>(`/sounds/${id}`),
  createSound: (b: { title: string; artist?: string; assetId: string }) =>
    req<Sound>('/sounds', { method: 'POST', body: JSON.stringify(b) }),
  soundPosts: (id: string) => req<Page<Post>>(`/sounds/${id}/posts`),
  lenses: (category?: string) => req<Lens[]>(`/lenses${category ? `?category=${category}` : ''}`),
  useLens: (id: string) => req(`/lenses/${id}/use`, { method: 'POST' }),
  effects: (category?: string) => req<any[]>(`/effects${category ? `?category=${category}` : ''}`),
  aiEffect: (prompt: string, language?: string) =>
    req<{ pipeline: any; generationId: string }>('/ai/effect', { method: 'POST', body: JSON.stringify({ prompt, language }) }),
  templates: (category?: string) => req<Page<Template>>(`/templates${category ? `?category=${category}` : ''}`),
  getTemplate: (id: string) => req<Template>(`/templates/${id}`),
  useTemplate: (id: string, b: { media: Record<number, string>; texts: Record<number, string>; musicId?: string }) =>
    req<Post>(`/templates/${id}/use`, { method: 'POST', body: JSON.stringify(b) }),

  // ── conversations / messages ──
  conversations: () => req<Conversation[]>('/conversations'),
  createConversation: (b: { type: 'DIRECT' | 'GROUP'; userIds: string[]; title?: string }) =>
    req<Conversation>('/conversations', { method: 'POST', body: JSON.stringify(b) }),
  getConversation: (id: string) => req<Conversation>(`/conversations/${id}`),
  updateConversation: (id: string, b: Record<string, unknown>) =>
    req<Conversation>(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  leaveConversation: (id: string) => req(`/conversations/${id}/leave`, { method: 'POST' }),
  messages: (id: string, cursor?: string) => req<Page<Message>>(`/conversations/${id}/messages${cursor ? `?cursor=${cursor}` : ''}`),
  sendMessage: (id: string, b: { type: string; text?: string; attachmentIds?: string[]; replyToId?: string; expiresAt?: string }) =>
    req<Message>(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify(b) }),
  editMessage: (id: string, text: string) => req<Message>(`/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
  deleteMessage: (id: string) => req(`/messages/${id}`, { method: 'DELETE' }),
  reactMessage: (id: string, emoji: string) => req(`/messages/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  forwardMessage: (id: string, toConversationId: string) =>
    req(`/messages/${id}/forward`, { method: 'POST', body: JSON.stringify({ toConversationId }) }),
  markRead: (id: string, messageId: string) =>
    req(`/conversations/${id}/read`, { method: 'POST', body: JSON.stringify({ lastReadAt: new Date().toISOString(), messageId }) }),
  saveMessage: (id: string) => req<SavedMessage>(`/messages/${id}/save`, { method: 'POST' }),
  unsaveMessage: (id: string) => req(`/messages/${id}/save`, { method: 'DELETE' }),
  savedMessages: () => req<SavedMessage[]>('/messages/saved'),

  // ── calls ──
  startCall: (b: { userId?: string; conversationId?: string; type: 'VOICE' | 'VIDEO' }) =>
    req<any>('/calls', { method: 'POST', body: JSON.stringify(b) }),
  callHistory: () => req<any[]>('/calls/history'),
  endCall: (id: string) => req(`/calls/${id}/end`, { method: 'POST' }),

  // ── notifications ──
  notifications: (cursor?: string) => req<Page<AppNotification>>(`/notifications${cursor ? `?cursor=${cursor}` : ''}`),
  readNotification: (id: string) => req(`/notifications/${id}/read`, { method: 'PATCH' }),
  readAllNotifications: () => req('/notifications/read-all', { method: 'POST' }),
  registerPushToken: (token: string, platform: 'IOS' | 'ANDROID' | 'WEB') =>
    req('/devices/push-token', { method: 'POST', body: JSON.stringify({ token, platform }) }),

  // ── AI tools ──
  ai: (kind: string, b: Record<string, unknown>) => req<any>(`/ai/${kind}`, { method: 'POST', body: JSON.stringify(b) }),

  // ── plans ──
  plans: () => req<any[]>('/plans'),
  mySubscription: () => req<any>('/subscriptions/me'),
  checkout: (plan: string) => req<{ url?: string }>(`/subscriptions/checkout`, { method: 'POST', body: JSON.stringify({ plan }) }),
  features: () => req<Record<string, string | number | boolean>>('/features'),

  // ── reports / appeals ──
  report: (b: { targetType: string; targetId: string; reason: string; details?: string }) =>
    req('/reports', { method: 'POST', body: JSON.stringify(b) }),
  myReports: () => req<any[]>('/reports/me'),
  appeal: (b: { reportId?: string; moderationActionId?: string; text: string }) =>
    req('/appeals', { method: 'POST', body: JSON.stringify(b) }),

  // ── creator ──
  creatorAnalytics: (days = 30) => req<any>(`/creator/analytics?days=${days}`),
  creatorDrafts: () => req<Post[]>('/creator/drafts'),
  creatorPosts: () => req<Post[]>('/creator/posts'),

  // ── admin ──
  adminStats: () => req<any>('/admin/stats'),
  adminUsers: (q?: string) => req<Page<User>>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminUserAction: (id: string, action: string, b: Record<string, unknown> = {}) =>
    req(`/admin/users/${id}/${action}`, { method: 'PATCH', body: JSON.stringify(b) }),
  adminReports: (status?: string) => req<Page<any>>(`/admin/reports${status ? `?status=${status}` : ''}`),
  adminResolveReport: (id: string, b: { status: string; action?: string; reason?: string }) =>
    req(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  adminAppeals: () => req<any[]>('/admin/appeals'),
  adminResolveAppeal: (id: string, status: string) =>
    req(`/admin/appeals/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  adminContent: (type: string, q?: string) => req<Page<any>>(`/admin/content/${type}${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminDeleteContent: (type: string, id: string) => req(`/admin/content/${type}/${id}`, { method: 'DELETE' }),
  adminFeatureContent: (type: string, id: string) => req(`/admin/content/${type}/${id}/feature`, { method: 'POST' }),
  adminAiUsage: () => req<any>('/admin/ai-usage'),
  adminAuditLogs: () => req<Page<any>>('/admin/audit-logs'),
  adminLenses: (b: Record<string, unknown>) => req('/lenses', { method: 'POST', body: JSON.stringify(b) }),
  adminDeleteLens: (id: string) => req(`/lenses/${id}`, { method: 'DELETE' }),
  adminTemplates: (b: Record<string, unknown>) => req('/templates', { method: 'POST', body: JSON.stringify(b) }),
  adminUpdateTemplate: (id: string, b: Record<string, unknown>) =>
    req(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  adminDeleteTemplate: (id: string) => req(`/templates/${id}`, { method: 'DELETE' }),
  adminBroadcast: (b: { title: string; body: string }) =>
    req('/admin/notifications/broadcast', { method: 'POST', body: JSON.stringify(b) }),

  // ── admin CMS (announcements / feature flags / managed lenses) ──
  adminAnnouncements: () => req<Announcement[]>('/admin/announcements'),
  adminCreateAnnouncement: (b: Record<string, unknown>) =>
    req<Announcement>('/admin/announcements', { method: 'POST', body: JSON.stringify(b) }),
  adminUpdateAnnouncement: (id: string, b: Record<string, unknown>) =>
    req<Announcement>(`/admin/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  adminDeleteAnnouncement: (id: string) => req(`/admin/announcements/${id}`, { method: 'DELETE' }),
  adminFeatureFlags: () => req<FeatureFlagDto[]>('/admin/feature-flags'),
  adminPutFeatureFlags: (flags: Array<{ key: string; enabled: boolean; plans?: string[]; config?: Record<string, unknown> }>) =>
    req<FeatureFlagDto[]>('/admin/feature-flags', { method: 'PUT', body: JSON.stringify({ flags }) }),
  adminPatchFeatureFlag: (key: string, b: Record<string, unknown>) =>
    req<FeatureFlagDto>(`/admin/feature-flags/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(b) }),
  adminManagedLenses: () => req<ManagedLens[]>('/admin/lenses'),
  adminCreateManagedLens: (b: Record<string, unknown>) =>
    req<ManagedLens>('/admin/lenses', { method: 'POST', body: JSON.stringify(b) }),
  adminUpdateManagedLens: (id: string, b: Record<string, unknown>) =>
    req<ManagedLens>(`/admin/lenses/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  adminDeleteManagedLens: (id: string) => req(`/admin/lenses/${id}`, { method: 'DELETE' }),

  // ── remote config (app shell) ──
  appConfig: () => req<AppConfig>('/config'),
};

// ─── local media probing helpers (no server round-trip) ───
function loadImageDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
function loadVideoDims(file: File): Promise<{ w: number; h: number; d: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight, d: v.duration });
    v.onerror = reject;
    v.src = URL.createObjectURL(file);
  });
}
function loadAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = reject;
    a.src = URL.createObjectURL(file);
  });
}
