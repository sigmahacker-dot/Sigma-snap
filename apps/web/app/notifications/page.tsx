'use client';
// Notifications: infinite list, deep links, mark-read, realtime socket.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import type { AppNotification } from '@sigma-snap/shared';
import { EmptyState, ErrorState, LoadingScreen, Avatar, Spinner } from '@/components/ui';
import {
  IconBell, IconHeartFill, IconComment, IconUserPlus, IconChat, IconStories, IconShare, IconCheck,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function iconFor(type: string) {
  const t = (type ?? '').toLowerCase();
  if (t.includes('like') || t.includes('react')) return { Icon: IconHeartFill, cls: 'bg-danger/15 text-danger' };
  if (t.includes('comment') || t.includes('reply')) return { Icon: IconComment, cls: 'bg-cy/15 text-cy' };
  if (t.includes('follow')) return { Icon: IconUserPlus, cls: 'bg-vio/15 text-vio' };
  if (t.includes('message') || t.includes('mention')) return { Icon: IconChat, cls: 'bg-gold/15 text-gold' };
  if (t.includes('story')) return { Icon: IconStories, cls: 'bg-vio/15 text-vio' };
  if (t.includes('share')) return { Icon: IconShare, cls: 'bg-cy/15 text-cy' };
  return { Icon: IconBell, cls: 'bg-white/10 text-dim' };
}

function deepLink(n: AppNotification): string | null {
  if (n.postId) return `/spotlight?post=${n.postId}`;
  if (n.conversationId) return `/chat/${n.conversationId}`;
  if (n.storyId) return '/stories';
  if (n.actor?.username) return `/profile/${n.actor.username}`;
  return null;
}

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const loadPage = useCallback(async (cur: string | null, initial: boolean) => {
    if (initial) { setBusy(true); setErr(''); }
    else setLoadingMore(true);
    try {
      const r = await api.notifications(cur ?? undefined);
      setItems((p) => (initial ? r.data : [...p, ...r.data]));
      setCursor(r.page.nextCursor);
    } catch (e) {
      if (initial) setErr(e instanceof ApiException ? e.message : 'Could not load notifications');
    } finally {
      setBusy(false); setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadPage(null, true);
  }, [user, loadPage]);

  // realtime
  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    const onNew = (n: AppNotification) => {
      setItems((p) => (p.some((x) => x.id === n.id) ? p : [n, ...p]));
      sounds.receive();
    };
    s.on('notification:new', onNew);
    return () => { s.off('notification:new', onNew); };
  }, [user]);

  // infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting && cursor && !loadingMore && !busy) void loadPage(cursor, false);
    }, { rootMargin: '500px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore, busy, loadPage]);

  const markRead = async (n: AppNotification) => {
    if (n.readAt) return;
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    try { await api.readNotification(n.id); }
    catch { /* best-effort */ }
  };

  const markAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await api.readAllNotifications();
      const now = new Date().toISOString();
      setItems((p) => p.map((x) => ({ ...x, readAt: x.readAt ?? now })));
      sounds.success();
    } catch { sounds.error(); }
    finally { setMarkingAll(false); }
  };

  if (loading || (!user && !err)) return <LoadingScreen label="Loading notifications…" />;

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between pt-safe">
        <h1 className="flex items-center gap-2 text-xl font-extrabold">
          Notifications
          {unread > 0 && (
            <span className="rounded-full bg-vio px-2.5 py-0.5 text-xs font-bold text-white">{unread}</span>
          )}
        </h1>
        {unread > 0 && (
          <button onClick={() => void markAll()} disabled={markingAll}
            className="flex items-center gap-1.5 rounded-full bg-white/5 px-3.5 py-2 text-xs font-bold text-vio hover:bg-white/10 disabled:opacity-50">
            {markingAll ? <Spinner size={14} /> : <IconCheck size={14} />}
            Mark all read
          </button>
        )}
      </div>

      {busy && <LoadingScreen label="Loading notifications…" />}
      {!busy && err && <ErrorState message={err} onRetry={() => void loadPage(null, true)} />}

      {!busy && !err && items.length === 0 && (
        <EmptyState title="You're all caught up"
          hint="Likes, comments, follows and messages will show up here the moment they happen."
          action={
            <Link href="/spotlight"
              className="rounded-2xl bg-gradient-to-r from-vio to-vio-deep px-5 py-3 text-sm font-semibold text-white shadow-glow">
              Explore spotlight
            </Link>
          } />
      )}

      {!busy && !err && items.length > 0 && (
        <ul className="space-y-1">
          {items.map((n) => {
            const { Icon, cls } = iconFor(n.type);
            const href = deepLink(n);
            const body = (
              <span className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${n.readAt ? 'opacity-70 hover:bg-white/5' : 'bg-vio/[0.07] hover:bg-vio/[0.12]'}`}>
                {n.actor?.avatarUrl || n.actor?.displayName ? (
                  <Avatar src={n.actor?.avatarUrl} name={n.actor?.displayName ?? '?'} size={46} />
                ) : (
                  <span className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full ${cls}`}>
                    <Icon size={22} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug">
                    {n.actor && <b>@{n.actor.username} </b>}
                    <span className="text-ink/90">{n.body ?? n.title}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-dim">{timeAgo(n.createdAt)} ago</span>
                </span>
                {!n.readAt && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-vio shadow-glow" />}
                {n.actor?.avatarUrl && (
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cls}`}>
                    <Icon size={17} />
                  </span>
                )}
              </span>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} onClick={() => { void markRead(n); sounds.tap(); }}>{body}</Link>
                ) : (
                  <button onClick={() => void markRead(n)}>{body}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div ref={sentinelRef} className="flex h-16 items-center justify-center">
        {loadingMore && <Spinner size={20} />}
        {!loadingMore && !cursor && items.length > 0 && (
          <p className="text-xs text-dim">No more notifications</p>
        )}
      </div>
    </main>
  );
}
