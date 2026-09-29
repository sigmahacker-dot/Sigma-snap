// Shared chat helpers: time formatting, snippets, DM resolution.
import type { Conversation, Message, User } from '@sigma-snap/shared';

export type ChatUser = Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;

export function dmOther(c: Conversation, meId: string): { userId: string; user: ChatUser } | undefined {
  const p = c.participants.find((x) => x.userId !== meId) ?? c.participants[0];
  return p ? { userId: p.userId, user: p.user } : undefined;
}

export function convoTitle(c: Conversation, meId: string): string {
  if (c.type === 'GROUP') return c.title || 'Group chat';
  return dmOther(c, meId)?.user.displayName || 'Chat';
}

export function convoAvatar(c: Conversation, meId: string): string | null | undefined {
  if (c.type === 'GROUP') return c.avatarUrl;
  return dmOther(c, meId)?.user.avatarUrl;
}

export function messageSnippet(m: Message | null | undefined): string {
  if (!m) return 'No messages yet';
  if (m.isDeleted) return 'This message was deleted';
  switch (m.type) {
    case 'TEXT': return m.text || '';
    case 'IMAGE': return '📷 Photo';
    case 'VIDEO': return '🎬 Video';
    case 'VOICE': return '🎙 Voice message';
    case 'STICKER': return '✨ Sticker';
    case 'GIF': return 'GIF';
    case 'FILE': return '📎 Attachment';
    default: return m.text || 'Message';
  }
}

/** Short list time: "14:22", "Yesterday", "Mon", or "12 Sep". */
export function listTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => x.getFullYear() * 1000 + dayOfYear(x);
  const diff = day(now) - day(d);
  if (diff <= 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function dayOfYear(x: Date) {
  return Math.floor((x.getTime() - new Date(x.getFullYear(), 0, 0).getTime()) / 86400000);
}

/** Bubble time "14:22". */
export function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "Today" / "Yesterday" / "Monday, 28 September". */
export function dayDividerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

export function lastSeenLabel(isOnline: boolean, lastSeenAt?: string | null): string {
  if (isOnline) return 'online';
  if (!lastSeenAt) return 'last seen recently';
  const mins = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (mins < 1) return 'last seen just now';
  if (mins < 60) return `last seen ${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `last seen ${h}h ago`;
  return `last seen ${Math.floor(h / 24)}d ago`;
}

export function durationLabel(sec?: number | null): string {
  if (!sec || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function disappearingLabel(sec: number): string {
  if (sec <= 0) return 'Off';
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

export function isExpired(m: Message): boolean {
  return !!m.expiresAt && new Date(m.expiresAt).getTime() <= Date.now();
}

/** localStorage-backed conversation mute (no server endpoint exists yet). */
const MUTE_KEY = 'sigmasnap.mutedConvos';
export function isMutedLocal(conversationId: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(MUTE_KEY) ?? '[]') as string[]).includes(conversationId);
  } catch { return false; }
}
export function setMutedLocal(conversationId: string, muted: boolean) {
  try {
    const arr = JSON.parse(localStorage.getItem(MUTE_KEY) ?? '[]') as string[];
    const next = muted ? [...new Set([...arr, conversationId])] : arr.filter((x) => x !== conversationId);
    localStorage.setItem(MUTE_KEY, JSON.stringify(next));
  } catch { /* noop */ }
}
