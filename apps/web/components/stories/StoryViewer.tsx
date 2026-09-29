'use client';
// Full-screen story viewer: progress, tap navigation, pause-on-hold,
// video support, replies, reactions, owner viewer list, expiry chip.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Story, User } from '@sigma-snap/shared';
import { BottomSheet, Spinner, Avatar } from '@/components/ui';
import {
  IconX, IconEye, IconSend, IconTrash, IconPin, IconMusic, IconChevronLeft,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';

export interface StoryGroup { user: User; stories: Story[]; }

interface Props {
  groups: StoryGroup[];
  initialGroup: number;
  onClose: () => void;
  onViewed: (storyId: string) => void;
  onDeleted: () => void;
}

const REACTS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function expiryLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `expires in ${h}h`;
  const m = Math.max(1, Math.floor(ms / 60000));
  return `expires in ${m}m`;
}

interface TextOverlay { text?: string; color?: string; x?: number; y?: number; }
interface Sticker { shape?: string; color?: string; x?: number; y?: number; size?: number; }
interface PollShape { question?: string; options?: Array<string | { text?: string }> | null; }

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export default function StoryViewer({ groups, initialGroup, onClose, onViewed, onDeleted }: Props) {
  const { user } = useAuth();
  const [gi, setGi] = useState(initialGroup);
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [durationMs, setDurationMs] = useState(5000);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [reactSent, setReactSent] = useState<string | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<User[] | null>(null);
  const [viewersErr, setViewersErr] = useState('');
  const [deleteArm, setDeleteArm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [voted, setVoted] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const group = groups[gi];
  const story: Story | undefined = group?.stories[si];
  const isOwner = !!user && !!story && story.userId === user.id;

  const goNext = useCallback(() => {
    if (!group) return;
    if (si + 1 < group.stories.length) { setSi(si + 1); }
    else if (gi + 1 < groups.length) { setGi(gi + 1); setSi(0); }
    else { onClose(); }
  }, [gi, si, group, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].stories.length - 1); }
  }, [gi, si, groups]);

  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  // reset + record view on story change
  useEffect(() => {
    if (!story) return;
    setProgress(0);
    setPaused(false);
    setReply(''); setReplySent(false); setReactSent(null); setVoted(null);
    setDurationMs(story.mediaType === 'VIDEO' ? 15000 : 5000);
    api.viewStory(story.id).then(() => onViewed(story.id)).catch(() => { /* noop */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // progress ticker
  useEffect(() => {
    if (!story || paused) return;
    const iv = window.setInterval(() => {
      setProgress((p) => {
        const np = p + 100 / durationMs;
        if (np >= 1) { window.clearInterval(iv); goNextRef.current(); return 1; }
        return np;
      });
    }, 100);
    return () => window.clearInterval(iv);
  }, [paused, durationMs, story?.id]);

  // keep video in sync with pause
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => { /* autoplay blocked */ });
  }, [paused, story?.id]);

  // Escape closes
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  if (!story || !group) return null;
  const gUser = group.user;

  const sendReply = async (text: string) => {
    const t = text.trim();
    if (!t || replyBusy) return;
    setReplyBusy(true);
    try {
      await api.replyStory(story.id, t);
      sounds.send();
      setReply(''); setReplySent(true);
      window.setTimeout(() => setReplySent(false), 2500);
    } catch { sounds.error(); }
    finally { setReplyBusy(false); }
  };

  const sendReact = async (emoji: string) => {
    try {
      await api.reactStory(story.id, emoji);
      sounds.pop();
      setReactSent(emoji);
      window.setTimeout(() => setReactSent(null), 1500);
    } catch { sounds.error(); }
  };

  const openViewers = async () => {
    setViewersOpen(true); setViewers(null); setViewersErr('');
    try { setViewers(await api.storyViewers(story.id)); }
    catch (e) { setViewersErr(e instanceof Error ? e.message : 'Could not load viewers'); }
  };

  const doDelete = async () => {
    if (!deleteArm) { setDeleteArm(true); window.setTimeout(() => setDeleteArm(false), 3000); return; }
    setDeleteBusy(true);
    try { await api.deleteStory(story.id); sounds.success(); onDeleted(); }
    catch { sounds.error(); setDeleteBusy(false); }
  };

  const vote = (opt: string) => {
    if (voted) return;
    setVoted(opt);
    void sendReply(`🗳️ ${opt}`);
  };

  const texts = asArray<TextOverlay>(story.textOverlays);
  const stickers = asArray<Sticker>(story.stickers);
  const poll = (story.poll ?? null) as PollShape | null;
  const pollOptions = poll?.options
    ? poll.options.map((o) => (typeof o === 'string' ? o : o.text ?? '')).filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-[60] bg-black" role="dialog" aria-modal aria-label="Story viewer">
      <div className="relative mx-auto h-dvh w-full max-w-md overflow-hidden bg-void">
        {/* media */}
        {story.mediaType === 'VIDEO' ? (
          <video
            key={story.id}
            ref={videoRef}
            src={story.mediaUrl}
            className="media-cover absolute inset-0"
            autoPlay playsInline muted={muted} loop={false}
            onLoadedMetadata={(e) => setDurationMs(Math.max(1000, e.currentTarget.duration * 1000))}
            onEnded={() => goNextRef.current()}
          />
        ) : (
          <img key={story.id} src={story.thumbnailUrl ?? story.mediaUrl} alt="story"
            className="media-cover absolute inset-0 animate-fade-up" draggable={false} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />

        {/* tap zones (below header/footer) */}
        <button aria-label="Previous" className="absolute left-0 top-24 bottom-36 w-[30%]"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => { setPaused(false); goPrev(); }}
          onPointerLeave={() => setPaused(false)} />
        <button aria-label="Next" className="absolute right-0 top-24 bottom-36 w-[70%]"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => { setPaused(false); goNextRef.current(); }}
          onPointerLeave={() => setPaused(false)} />

        {/* progress */}
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1 pt-safe">
          {group.stories.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white transition-[width]"
                style={{ width: `${i < si ? 100 : i === si ? progress : 0}%` }} />
            </div>
          ))}
        </div>

        {/* header */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4 pb-2 pt-8">
          <Avatar src={gUser.avatarUrl} name={gUser.displayName} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{gUser.displayName}</p>
            <p className="text-[11px] text-white/70">{timeAgo(story.createdAt)} · {expiryLabel(story.expiresAt)}</p>
          </div>
          {isOwner && (
            <>
              <button onClick={openViewers} aria-label="Viewers"
                className="rounded-full bg-black/40 p-2 text-white hover:bg-black/60">
                <IconEye size={18} />
              </button>
              <button onClick={doDelete} aria-label="Delete story" disabled={deleteBusy}
                className={`rounded-full p-2 text-white ${deleteArm ? 'bg-danger' : 'bg-black/40 hover:bg-black/60'}`}>
                {deleteBusy ? <Spinner size={18} className="text-white" /> : <IconTrash size={18} />}
              </button>
            </>
          )}
          <button onClick={onClose} aria-label="Close"
            className="rounded-full bg-black/40 p-2 text-white hover:bg-black/60">
            <IconX size={18} />
          </button>
        </div>
        {deleteArm && (
          <p className="absolute inset-x-0 top-24 z-10 text-center text-xs font-semibold text-danger">
            Tap trash again to delete this story
          </p>
        )}

        {/* overlays: text + stickers */}
        <div className="pointer-events-none absolute inset-0 z-[5]">
          {texts.map((t, i) => (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 text-center font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,.8)]"
              style={{ left: `${t.x ?? 50}%`, top: `${t.y ?? 50}%`, color: t.color ?? '#fff', fontSize: 26 }}>
              {t.text}
            </div>
          ))}
          {stickers.map((s, i) => (
            <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-bold text-white shadow-glow"
              style={{
                left: `${s.x ?? 50}%`, top: `${s.y ?? 40}%`,
                width: s.size ?? 56, height: s.size ?? 56,
                background: s.color ?? 'linear-gradient(135deg,#7C5CFF,#38E1FF)',
              }}>
              {s.shape === 'star' ? '★' : s.shape === 'zap' ? '⚡' : s.shape === 'heart' ? '♥' : s.shape === 'fire' ? '🔥' : '●'}
            </div>
          ))}
        </div>

        {/* location / music / caption */}
        <div className="absolute inset-x-4 bottom-32 z-10 space-y-2">
          {story.locationName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white">
              <IconPin size={14} /> {story.locationName}
            </span>
          )}
          {story.musicId && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white">
              <IconMusic size={14} /> Original sound
            </span>
          )}
          {story.caption && <p className="text-sm text-white drop-shadow">{story.caption}</p>}
          {story.question && (
            <div className="rounded-2xl border border-white/20 bg-black/55 p-3 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wide text-cy">Ask me</p>
              <p className="mt-1 text-sm font-semibold text-white">{story.question}</p>
              <p className="mt-1 text-[11px] text-white/60">Reply below to answer</p>
            </div>
          )}
          {poll && pollOptions.length > 0 && (
            <div className="pointer-events-auto rounded-2xl border border-white/20 bg-black/55 p-3 backdrop-blur">
              <p className="text-sm font-bold text-white">{poll.question ?? 'Poll'}</p>
              <div className="mt-2 space-y-1.5">
                {pollOptions.map((o) => (
                  <button key={o} onClick={() => vote(o)} disabled={!!voted}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${voted === o ? 'bg-vio text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                    {o} {voted === o && '✓'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-6 pt-2">
          {story.mediaType === 'VIDEO' && (
            <button onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}
              className="mb-2 rounded-full bg-black/50 px-3 py-1.5 text-xs font-bold text-white">
              {muted ? '🔇 Tap for sound' : '🔊 Sound on'}
            </button>
          )}
          {!isOwner && (
            <>
              <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
                {REACTS.map((e) => (
                  <button key={e} onClick={() => void sendReact(e)} aria-label={`React ${e}`}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-lg transition active:scale-90 ${reactSent === e ? 'bg-vio/40' : 'bg-black/50'}`}>
                    {e}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void sendReply(reply); }}
                  placeholder={replySent ? 'Reply sent ✓' : `Reply to ${gUser.username}…`}
                  className="min-w-0 flex-1 rounded-full border border-white/25 bg-black/50 px-4 py-2.5 text-sm text-white placeholder:text-white/50 outline-none focus:border-vio"
                />
                <button onClick={() => void sendReply(reply)} disabled={replyBusy || !reply.trim()}
                  aria-label="Send reply" className="rounded-full bg-vio p-2.5 text-white shadow-glow disabled:opacity-40">
                  {replyBusy ? <Spinner size={18} className="text-white" /> : <IconSend size={18} />}
                </button>
              </div>
            </>
          )}
          {isOwner && (
            <button onClick={openViewers}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-black/50 py-2.5 text-sm font-semibold text-white">
              <IconEye size={16} /> {story.viewCount} {story.viewCount === 1 ? 'view' : 'views'}
            </button>
          )}
        </div>

        {/* back to feed (desktop) */}
        <button onClick={onClose} aria-label="Back"
          className="absolute left-4 top-20 z-10 hidden rounded-full bg-black/40 p-2 text-white sm:block">
          <IconChevronLeft size={18} />
        </button>
      </div>

      {/* viewers sheet */}
      <BottomSheet open={viewersOpen} onClose={() => setViewersOpen(false)} title={`Viewers · ${story.viewCount}`}>
        {viewers === null && !viewersErr && (
          <div className="flex items-center justify-center gap-2 py-8 text-dim"><Spinner size={20} /> Loading viewers…</div>
        )}
        {viewersErr && <p className="py-6 text-center text-sm text-danger">{viewersErr}</p>}
        {viewers && viewers.length === 0 && <p className="py-6 text-center text-sm text-dim">No views yet.</p>}
        {viewers && viewers.length > 0 && (
          <ul className="space-y-1">
            {viewers.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5">
                <Avatar src={v.avatarUrl} name={v.displayName} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{v.displayName}</p>
                  <p className="truncate text-xs text-dim">@{v.username}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
    </div>
  );
}
