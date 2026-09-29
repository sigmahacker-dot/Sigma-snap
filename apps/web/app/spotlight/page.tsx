'use client';
// Spotlight: full-screen vertical short-video feed (For You / Following).
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Post } from '@sigma-snap/shared';
import { EmptyState, ErrorState, LoadingScreen, Spinner } from '@/components/ui';
import { IconSearch, IconDiscover } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import SpotlightSlide from '@/components/spotlight/SpotlightSlide';

type TabId = 'foryou' | 'following';

function SpotlightInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepPostId = searchParams.get('post');

  const [tab, setTab] = useState<TabId>('foryou');
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const seenDeep = useRef(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const loadPage = useCallback(async (t: TabId, cur: string | null, initial: boolean) => {
    if (initial) { setBusy(true); setErr(''); }
    else setLoadingMore(true);
    try {
      const r = t === 'foryou' ? await api.feed(cur ?? undefined) : await api.followingFeed(cur ?? undefined);
      setPosts((p) => (initial ? r.data : [...p, ...r.data]));
      setCursor(r.page.nextCursor);
    } catch (e) {
      if (initial) setErr(e instanceof ApiException ? e.message : 'Could not load spotlight');
    } finally {
      setBusy(false); setLoadingMore(false);
    }
  }, []);

  // initial load + tab switch
  useEffect(() => {
    if (!user) return;
    setPosts([]); setCursor(null); setActiveIdx(0);
    scrollRef.current?.scrollTo({ top: 0 });
    void loadPage(tab, null, true);
  }, [tab, user, loadPage]);

  // deep-linked post (?post=id)
  useEffect(() => {
    if (!deepPostId || seenDeep.current || !user) return;
    seenDeep.current = true;
    api.getPost(deepPostId)
      .then((p) => setPosts((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev])))
      .catch(() => { /* invalid id — feed continues */ });
  }, [deepPostId, user]);

  // infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting && cursor && !loadingMore && !busy) void loadPage(tab, cursor, false);
    }, { root: scrollRef.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore, busy, tab, loadPage]);

  // active slide tracking
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const slides = Array.from(root.querySelectorAll<HTMLElement>('[data-slide]'));
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          const i = Number((e.target as HTMLElement).dataset.slide);
          setActiveIdx(i);
        }
      });
    }, { root, threshold: 0.6 });
    slides.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [posts.length]);

  if (loading || (!user && !err)) return <LoadingScreen label="Loading spotlight…" />;

  return (
    <main className="relative mx-auto w-full max-w-md">
      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-4 pt-safe">
        <div className="pointer-events-auto flex gap-1 rounded-2xl bg-black/45 p-1 backdrop-blur">
          {([['foryou', 'For You'], ['following', 'Following']] as Array<[TabId, string]>).map(([id, label]) => (
            <button key={id}
              onClick={() => { setTab(id); sounds.tap(); }}
              className={`rounded-xl px-4 py-1.5 text-sm font-bold transition ${tab === id ? 'bg-vio text-white shadow-glow' : 'text-white/70 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        <Link href="/search" aria-label="Search"
          onClick={() => sounds.tap()}
          className="pointer-events-auto rounded-full bg-black/45 p-2.5 text-white backdrop-blur hover:bg-black/65">
          <IconSearch size={20} />
        </Link>
      </div>

      {busy && (
        <div className="flex h-[100dvh] items-center justify-center">
          <LoadingScreen label="Finding videos for you…" />
        </div>
      )}
      {!busy && err && (
        <div className="flex h-[100dvh] items-center justify-center px-6">
          <ErrorState message={err} onRetry={() => void loadPage(tab, null, true)} />
        </div>
      )}
      {!busy && !err && posts.length === 0 && (
        <div className="flex h-[100dvh] flex-col items-center justify-center px-6 text-center">
          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-panel2">
            <IconDiscover size={30} className="text-vio" />
          </span>
          <EmptyState
            title={tab === 'following' ? 'Nothing from people you follow' : 'No videos yet'}
            hint={tab === 'following'
              ? 'Follow creators to fill this feed, or check For You for trending videos.'
              : 'Be the first to post — open the camera and share a moment.'}
          />
        </div>
      )}

      {!busy && !err && posts.length > 0 && (
        <div ref={scrollRef}
          className="no-scrollbar h-[100dvh] snap-y snap-mandatory overflow-y-auto overscroll-contain">
          {posts.map((p, i) => (
            <div key={p.id} data-slide={i}>
              <SpotlightSlide post={p} active={i === activeIdx} viewerId={user?.id ?? null}
                globalMuted={globalMuted} onToggleGlobalMute={() => { setGlobalMuted((m) => !m); sounds.tap(); }} />
            </div>
          ))}
          <div ref={sentinelRef} className="flex h-24 snap-start items-center justify-center bg-black">
            {loadingMore && <Spinner size={22} className="text-white" />}
            {!loadingMore && !cursor && posts.length > 0 && (
              <p className="text-xs text-white/50">You're all caught up</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function SpotlightPage() {
  return (
    <Suspense fallback={<LoadingScreen label="Loading spotlight…" />}>
      <SpotlightInner />
    </Suspense>
  );
}
