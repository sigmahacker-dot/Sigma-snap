'use client';
// One full-screen spotlight slide: autoplay video, action rail,
// comments / share / save / report / sound sheets.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import type { Post, Sound } from '@sigma-snap/shared';
import { BottomSheet, Button, Input, Spinner, Avatar } from '@/components/ui';
import {
  IconHeart, IconHeartFill, IconComment, IconShare, IconSave, IconFlag,
  IconMusic, IconX, IconSend, IconChevronRight, IconUserPlus, IconCheck,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';

interface Props {
  post: Post;
  active: boolean;
  globalMuted: boolean;
  onToggleGlobalMute: () => void;
  viewerId: string | null;
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function captionParts(caption: string): Array<{ t: string; tag?: string }> {
  const parts: Array<{ t: string; tag?: string }> = [];
  const re = /#[\p{L}\p{N}_]+/gu;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(caption))) {
    if (m.index > last) parts.push({ t: caption.slice(last, m.index) });
    parts.push({ t: m[0], tag: m[0].slice(1) });
    last = m.index + m[0].length;
  }
  if (last < caption.length) parts.push({ t: caption.slice(last) });
  return parts;
}

export default function SpotlightSlide({ post, active, globalMuted, onToggleGlobalMute, viewerId }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seenRef = useRef(false);

  const [liked, setLiked] = useState(!!post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(!!post.savedByMe);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [likeBurst, setLikeBurst] = useState(false);
  const [pausedTap, setPausedTap] = useState(false);
  const [toast, setToast] = useState('');

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);

  const creator = post.user;
  const isSelf = !!viewerId && !!creator && creator.id === viewerId;
  const asset = post.assets[0];

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  };

  // autoplay / pause on visibility
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = globalMuted;
    if (active) {
      setPausedTap(false);
      v.play().catch(() => { /* blocked until interaction */ });
      if (!seenRef.current) {
        seenRef.current = true;
        api.getPost(post.id).catch(() => { /* view count best-effort */ });
      }
    } else {
      v.pause();
    }
  }, [active, globalMuted, post.id]);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    if (next) {
      sounds.pop();
      setLikeBurst(true);
      window.setTimeout(() => setLikeBurst(false), 700);
    }
    try {
      if (next) await api.likePost(post.id);
      else await api.unlikePost(post.id);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      sounds.error();
    }
  };

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    try {
      if (next) { await api.savePost(post.id); flash('Saved'); }
      else { await api.unsavePost(post.id); flash('Removed from saved'); }
      sounds.tap();
    } catch { setSaved(!next); sounds.error(); }
  };

  const toggleFollow = async () => {
    if (!creator || isSelf) return;
    const next = !(following ?? false);
    setFollowing(next);
    try {
      if (next) await api.follow(creator.id);
      else await api.unfollow(creator.id);
      sounds.tap();
    } catch { setFollowing(!next); sounds.error(); }
  };

  const share = async () => {
    const url = `${window.location.origin}/spotlight?post=${post.id}`;
    try { await api.sharePost(post.id); } catch { /* best-effort */ }
    sounds.send();
    if (navigator.share) {
      try { await navigator.share({ title: 'SIGMA SNAP', text: post.caption ?? 'Check this out', url }); }
      catch { /* dismissed */ }
    } else {
      try { await navigator.clipboard.writeText(url); flash('Link copied to clipboard'); }
      catch { flash('Could not copy link'); }
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPausedTap(false); }
    else { v.pause(); setPausedTap(true); }
    sounds.tap();
  };

  const railBtn =
    'flex flex-col items-center gap-1 text-white drop-shadow-[0_1px_6px_rgba(0,0,0,.8)] active:scale-90 transition';

  return (
    <article className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-black">
      {/* media */}
      {post.kind === 'VIDEO' && asset ? (
        <video
          ref={videoRef}
          src={asset.url}
          poster={asset.thumbnailUrl ?? undefined}
          className="media-cover absolute inset-0"
          playsInline loop preload="metadata"
          onClick={togglePlay}
          onDoubleClick={() => { if (!liked) void toggleLike(); }}
        />
      ) : asset ? (
        <img src={asset.thumbnailUrl ?? asset.url} alt={post.caption ?? 'spotlight'}
          className="media-cover absolute inset-0" draggable={false}
          onDoubleClick={() => { if (!liked) void toggleLike(); }} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-panel text-dim">No media</div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

      {/* like burst */}
      {likeBurst && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <IconHeartFill size={96} className="animate-ping text-danger/90" />
        </div>
      )}
      {pausedTap && post.kind === 'VIDEO' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/55 px-5 py-3 text-sm font-bold text-white">Paused</span>
        </div>
      )}
      {toast && (
        <div className="absolute inset-x-0 top-24 z-10 flex justify-center">
          <span className="rounded-full bg-black/70 px-4 py-2 text-xs font-bold text-white animate-fade-up">{toast}</span>
        </div>
      )}

      {/* creator + caption */}
      <div className="absolute bottom-24 left-0 right-16 z-10 px-4">
        {creator && (
          <div className="mb-2 flex items-center gap-2.5">
            <Link href={`/profile/${creator.username}`} onClick={() => sounds.tap()}>
              <Avatar src={creator.avatarUrl} name={creator.displayName} size={42} ring />
            </Link>
            <Link href={`/profile/${creator.username}`} onClick={() => sounds.tap()}
              className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-white">@{creator.username}</p>
              <p className="text-[11px] text-white/60">{timeAgo(post.createdAt)}</p>
            </Link>
            {!isSelf && (
              <button onClick={() => void toggleFollow()}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${following ? 'bg-white/15 text-white' : 'bg-vio text-white shadow-glow'}`}>
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        )}
        {post.caption && (
          <p className="line-clamp-3 text-[13px] leading-snug text-white/95">
            {captionParts(post.caption).map((p, i) => p.tag ? (
              <Link key={i} href={`/search?q=${encodeURIComponent('#' + p.tag)}`}
                onClick={() => sounds.tap()} className="font-bold text-cy">{p.t}</Link>
            ) : <span key={i}>{p.t}</span>)}
          </p>
        )}
      </div>

      {/* action rail */}
      <div className="absolute bottom-24 right-2 z-10 flex flex-col items-center gap-5">
        <button onClick={() => void toggleLike()} aria-label="Like" className={railBtn}>
          {liked ? <IconHeartFill size={32} className="text-danger" /> : <IconHeart size={32} />}
          <span className="text-xs font-bold">{likeCount}</span>
        </button>
        <button onClick={() => { setCommentsOpen(true); sounds.tap(); }} aria-label="Comments" className={railBtn}>
          <IconComment size={30} />
          <span className="text-xs font-bold">{post.commentCount}</span>
        </button>
        <button onClick={() => void share()} aria-label="Share" className={railBtn}>
          <IconShare size={30} />
          <span className="text-xs font-bold">{post.shareCount}</span>
        </button>
        <button onClick={() => void toggleSave()} aria-label="Save" className={railBtn}>
          <IconSave size={30} className={saved ? 'text-gold' : ''} />
          <span className="text-xs font-bold">{saved ? 'Saved' : 'Save'}</span>
        </button>
        <button onClick={() => { setSoundOpen(true); sounds.tap(); }} aria-label="Sound" className={railBtn}>
          <span className="flex h-11 w-11 animate-[spin_6s_linear_infinite] items-center justify-center rounded-full bg-gradient-to-br from-vio to-cy">
            <IconMusic size={20} className="text-white" />
          </span>
          <span className="text-xs font-bold">Sound</span>
        </button>
        <button onClick={() => { setReportOpen(true); sounds.tap(); }} aria-label="Report" className={railBtn}>
          <IconFlag size={26} />
        </button>
      </div>

      {/* mute toggle */}
      {post.kind === 'VIDEO' && (
        <button onClick={onToggleGlobalMute} aria-label={globalMuted ? 'Unmute' : 'Mute'}
          className="absolute left-4 top-20 z-10 rounded-full bg-black/55 px-3.5 py-2 text-xs font-bold text-white">
          {globalMuted ? '🔇 Tap for sound' : '🔊'}
        </button>
      )}

      {/* sheets */}
      <CommentsSheet post={post} open={commentsOpen} onClose={() => setCommentsOpen(false)} />
      <ReportSheet postId={post.id} open={reportOpen} onClose={() => setReportOpen(false)} />
      <SoundSheet open={soundOpen} onClose={() => setSoundOpen(false)} />
    </article>
  );
}

/* ─── comments ─── */
function CommentsSheet({ post, open, onClose }: { post: Post; open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems([]); setCursor(null); setErr('');
    setBusy(true);
    api.postComments(post.id)
      .then((r) => { setItems(r.data); setCursor(r.page.nextCursor); })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load comments'))
      .finally(() => setBusy(false));
  }, [open, post.id]);

  const more = async () => {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const r = await api.postComments(post.id, cursor);
      setItems((p) => [...p, ...r.data]);
      setCursor(r.page.nextCursor);
    } catch { /* noop */ } finally { setBusy(false); }
  };

  const send = async () => {
    const t = draft.trim();
    if (!t || posting) return;
    setPosting(true);
    try {
      await api.comment(post.id, { text: t });
      sounds.send();
      setDraft('');
      const r = await api.postComments(post.id);
      setItems(r.data); setCursor(r.page.nextCursor);
    } catch { sounds.error(); }
    finally { setPosting(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`Comments · ${post.commentCount}`}>
      <div className="max-h-[46vh] space-y-3 overflow-y-auto pb-2">
        {busy && items.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-dim"><Spinner size={20} /> Loading…</div>
        )}
        {err && <p className="py-4 text-center text-sm text-danger">{err}</p>}
        {!busy && !err && items.length === 0 && (
          <p className="py-8 text-center text-sm text-dim">No comments yet. Be the first!</p>
        )}
        {items.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar src={c.user?.avatarUrl} name={c.user?.displayName ?? c.user?.username} size={34} />
            <div className="min-w-0 flex-1 rounded-2xl bg-white/5 px-3 py-2">
              <p className="text-xs font-bold">@{c.user?.username ?? 'user'}</p>
              <p className="text-sm">{c.text}</p>
            </div>
          </div>
        ))}
        {cursor && (
          <button onClick={() => void more()} className="w-full py-2 text-xs font-bold text-vio">
            {busy ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-line pt-3">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          placeholder="Add a comment…" maxLength={300} />
        <button onClick={() => void send()} disabled={posting || !draft.trim()}
          aria-label="Post comment" className="rounded-2xl bg-vio p-3 text-white shadow-glow disabled:opacity-40">
          {posting ? <Spinner size={18} className="text-white" /> : <IconSend size={18} />}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─── report ─── */
const REASONS = ['Spam', 'Harassment', 'Violence', 'Nudity', 'Misinformation', 'Copyright', 'Other'];

function ReportSheet({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setDone(false); setErr(''); setReason(REASONS[0]); setDetails(''); } }, [open ]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await api.report({ targetType: 'POST', targetId: postId, reason, details: details.trim() || undefined });
      sounds.success();
      setDone(true);
      window.setTimeout(onClose, 1400);
    } catch (e) {
      sounds.error();
      setErr(e instanceof ApiException ? e.message : 'Could not submit report');
    } finally { setBusy(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Report video">
      {done ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center animate-fade-up">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cy/15">
            <IconCheck size={26} className="text-cy" />
          </span>
          <p className="font-bold">Report submitted</p>
          <p className="text-sm text-dim">Thanks — our team will review it.</p>
        </div>
      ) : (
        <>
          {err && <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Reason</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} onClick={() => { setReason(r); sounds.tap(); }}
                className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${reason === r ? 'bg-vio text-white shadow-glow' : 'bg-white/5 text-dim hover:bg-white/10'}`}>
                {r}
              </button>
            ))}
          </div>
          <Input value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder="Details (optional)" maxLength={300} className="mb-3" />
          <Button className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Submitting…' : 'Submit report'}
          </Button>
        </>
      )}
    </BottomSheet>
  );
}

/* ─── sound picker ─── */
function SoundSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = useState<Sound[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(true); setErr('');
    api.sounds()
      .then((r) => setList(r.data))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load sounds'))
      .finally(() => setBusy(false));
    return () => { audioRef.current?.pause(); setPlaying(null); };
  }, [open ]);

  const preview = (s: Sound) => {
    if (!s.url) return;
    if (playing === s.id) { audioRef.current?.pause(); setPlaying(null); return; }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = s.url;
    audioRef.current.play().catch(() => {});
    setPlaying(s.id);
    audioRef.current.onended = () => setPlaying(null);
    sounds.tap();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Trending sounds">
      {busy && <div className="flex items-center justify-center gap-2 py-8 text-dim"><Spinner size={20} /> Loading sounds…</div>}
      {err && <p className="py-4 text-center text-sm text-danger">{err}</p>}
      {!busy && !err && list.length === 0 && <p className="py-8 text-center text-sm text-dim">No sounds found.</p>}
      <ul className="space-y-1">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5">
            <button onClick={() => preview(s)} aria-label={playing === s.id ? 'Stop preview' : 'Play preview'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-vio to-cy text-white">
              <span className="text-sm font-black">{playing === s.id ? '❚❚' : '▶'}</span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{s.title}</p>
              <p className="truncate text-xs text-dim">{s.artist ?? 'Original'} · {s.usageCount} uses</p>
            </div>
            <button
              onClick={() => { sounds.tap(); router.push(`/camera?sound=${encodeURIComponent(s.id)}`); }}
              className="flex shrink-0 items-center gap-1 rounded-full bg-vio/15 px-3 py-1.5 text-xs font-bold text-vio hover:bg-vio/25">
              Use sound <IconChevronRight size={13} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-dim">
        <IconMusic size={12} /> Sounds shown are the trending library; per-video sound pages arrive with the full sound service.
      </p>
    </BottomSheet>
  );
}
