'use client';
// Global search: users, videos, sounds, hashtags, effects, templates.
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Input, Spinner, Avatar, LoadingScreen, EmptyState, Badge } from '@/components/ui';
import { IconSearch, IconX, IconPlay, IconWand, IconTemplate, IconUserPlus, IconCheck, IconClock } from '@/lib/icons';
import { sounds } from '@/lib/sounds';

type TabId = 'all' | 'users' | 'videos' | 'sounds' | 'hashtags' | 'effects' | 'templates';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'users', label: 'Users' }, { id: 'videos', label: 'Videos' },
  { id: 'sounds', label: 'Sounds' }, { id: 'hashtags', label: 'Hashtags' },
  { id: 'effects', label: 'Effects' }, { id: 'templates', label: 'Templates' },
];

interface SearchResult {
  users: any[]; videos: any[]; sounds: any[]; hashtags: any[]; effects: any[]; templates: any[];
}

function normalize(r: any): SearchResult {
  const d = r?.data ?? r ?? {};
  const pick = (...keys: string[]): any[] => {
    for (const k of keys) {
      const v = d[k] ?? r?.[k];
      if (Array.isArray(v)) return v;
      if (v?.data && Array.isArray(v.data)) return v.data;
    }
    return [];
  };
  return {
    users: pick('users'),
    videos: pick('videos', 'posts'),
    sounds: pick('sounds'),
    hashtags: pick('hashtags', 'tags'),
    effects: pick('effects'),
    templates: pick('templates'),
  };
}

function SearchInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [tab, setTab] = useState<TabId>('all');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [suggest, setSuggest] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [trending, setTrending] = useState<any>(null);
  const [history, setHistory] = useState<Array<{ id: string; query: string }>>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // trending + history on mount
  useEffect(() => {
    if (!user) return;
    api.trending().then(setTrending).catch(() => {});
    api.searchHistory().then(setHistory).catch(() => {});
  }, [user]);

  // debounced search
  useEffect(() => {
    const query = q.trim();
    if (!query) { setResults(null); setErr(''); setBusy(false); return; }
    setBusy(true);
    const id = ++reqId.current;
    const t = window.setTimeout(async () => {
      try {
        const r = await api.search(query, tab);
        if (reqId.current !== id) return;
        setResults(normalize(r));
        setErr('');
      } catch (e) {
        if (reqId.current !== id) return;
        setErr(e instanceof ApiException ? e.message : 'Search failed');
        setResults(null);
      } finally {
        if (reqId.current === id) setBusy(false);
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [q, tab]);

  // suggestions dropdown
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setSuggest([]); return; }
    const t = window.setTimeout(() => {
      api.searchSuggestions(query).then(setSuggest).catch(() => setSuggest([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const commitSearch = (term: string) => {
    const t = term.trim();
    if (!t) return;
    setQ(t);
    setSuggestOpen(false);
    setHistory((h) => [{ id: `local-${Date.now()}`, query: t }, ...h.filter((x) => x.query !== t)].slice(0, 12));
    sounds.tap();
  };

  const clearHistory = async () => {
    try { await api.clearSearchHistory(); } catch { /* noop */ }
    setHistory([]);
    sounds.tap();
  };

  const toggleFollow = async (u: any) => {
    const next = !followed[u.id];
    setFollowed((p) => ({ ...p, [u.id]: next }));
    try {
      if (next) await api.follow(u.id);
      else await api.unfollow(u.id);
      sounds.tap();
    } catch {
      setFollowed((p) => ({ ...p, [u.id]: !next }));
      sounds.error();
    }
  };

  const previewSound = (s: any) => {
    if (!s.url) return;
    if (previewId === s.id) { audioRef.current?.pause(); setPreviewId(null); return; }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = s.url;
    audioRef.current.play().catch(() => {});
    audioRef.current.onended = () => setPreviewId(null);
    setPreviewId(s.id);
    sounds.tap();
  };

  if (loading || !user) return <LoadingScreen label="Loading search…" />;

  const showTrending = !q.trim() && !busy;
  const emptyResults = results && TABS.slice(1).every((t) => (results[t.id as keyof SearchResult] as any[]).length === 0);

  const visible = (id: TabId) => tab === 'all' || tab === id;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-28 pt-4">
      {/* search box */}
      <div className="relative pt-safe">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-dim">
            <IconSearch size={18} />
          </span>
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitSearch(q); }}
            placeholder="Search users, videos, sounds…"
            className="!pl-11 !pr-10"
            aria-label="Search"
          />
          {q && (
            <button onClick={() => { setQ(''); setSuggest([]); sounds.tap(); }} aria-label="Clear"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-1 text-dim">
              <IconX size={14} />
            </button>
          )}
        </div>
        {/* suggestions */}
        {suggestOpen && suggest.length > 0 && q.trim().length >= 2 && (
          <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
            {suggest.slice(0, 6).map((s) => (
              <li key={s}>
                <button onClick={() => commitSearch(s)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-white/5">
                  <IconSearch size={14} className="text-dim" /> <span className="truncate">{s}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* type tabs */}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); sounds.tap(); }}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${tab === t.id ? 'bg-vio text-white shadow-glow' : 'bg-white/5 text-dim hover:bg-white/10'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {busy && (
          <div className="flex items-center justify-center gap-2 py-12 text-dim">
            <Spinner size={22} /> Searching…
          </div>
        )}
        {err && !busy && (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{err}</p>
        )}

        {/* ── trending + history (empty query) ── */}
        {showTrending && (
          <div className="space-y-6 animate-fade-up">
            {history.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-dim">Recent</p>
                  <button onClick={() => void clearHistory()} className="text-xs font-bold text-vio">Clear all</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((h) => (
                    <button key={h.id} onClick={() => commitSearch(h.query)}
                      className="flex items-center gap-1.5 rounded-full bg-white/5 px-3.5 py-2 text-xs font-semibold text-dim hover:bg-white/10">
                      <IconClock size={12} /> {h.query}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {trending?.hashtags?.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Trending hashtags</p>
                <div className="flex flex-wrap gap-2">
                  {trending.hashtags.slice(0, 12).map((t: any, i: number) => {
                    const tag = typeof t === 'string' ? t : t.tag ?? t.name ?? `#${i}`;
                    const label = tag.startsWith('#') ? tag : `#${tag}`;
                    return (
                      <Link key={label + i} href={`/search?q=${encodeURIComponent(label)}`}
                        className="rounded-full bg-vio/10 px-3.5 py-2 text-xs font-bold text-vio hover:bg-vio/20">
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
            {trending?.sounds?.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Trending sounds</p>
                <ul className="space-y-1">
                  {trending.sounds.slice(0, 5).map((s: any) => (
                    <SoundRow key={s.id ?? s.title} s={s} previewId={previewId} onPreview={() => previewSound(s)} />
                  ))}
                </ul>
              </section>
            )}
            {trending?.templates?.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Trending templates</p>
                <div className="grid grid-cols-2 gap-2">
                  {trending.templates.slice(0, 4).map((t: any) => (
                    <TemplateCard key={t.id} t={t} />
                  ))}
                </div>
              </section>
            )}
            {!trending && (
              <p className="py-6 text-center text-sm text-dim">Discover trending hashtags, sounds and templates.</p>
            )}
          </div>
        )}

        {/* ── results ── */}
        {!busy && !err && results && emptyResults && (
          <EmptyState title={`No results for "${q.trim()}"`}
            hint="Try a different spelling, or browse trending instead." />
        )}

        {!busy && !err && results && !emptyResults && (
          <div className="space-y-6 animate-fade-up">
            {visible('users') && results.users.length > 0 && (
              <section>
                {tab === 'all' && <SectionHead label="Users" />}
                <ul className="space-y-1">
                  {results.users.map((u: any) => (
                    <li key={u.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5">
                      <Link href={`/profile/${u.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar src={u.avatarUrl} name={u.displayName ?? u.username} size={44} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{u.displayName ?? u.username}</span>
                          <span className="block truncate text-xs text-dim">@{u.username}</span>
                        </span>
                      </Link>
                      {u.id !== user.id && (
                        <button onClick={() => void toggleFollow(u)}
                          className={`flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${followed[u.id] ? 'bg-white/10 text-ink' : 'bg-vio text-white shadow-glow'}`}>
                          {followed[u.id] ? <><IconCheck size={13} /> Following</> : <><IconUserPlus size={13} /> Follow</>}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {visible('videos') && results.videos.length > 0 && (
              <section>
                {tab === 'all' && <SectionHead label="Videos" />}
                <div className="grid grid-cols-3 gap-1.5">
                  {results.videos.map((v: any) => {
                    const thumb = v.assets?.[0]?.thumbnailUrl ?? v.assets?.[0]?.url ?? v.thumbnailUrl;
                    return (
                      <Link key={v.id} href={`/spotlight?post=${v.id}`} onClick={() => sounds.tap()}
                        className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-panel">
                        {thumb ? <img src={thumb} alt="" loading="lazy" className="media-cover group-hover:scale-105 transition" />
                          : <span className="flex h-full items-center justify-center text-dim"><IconPlay size={22} /></span>}
                        <span className="absolute bottom-1 left-1.5 flex items-center gap-1 text-[10px] font-bold text-white drop-shadow">
                          <IconPlay size={10} /> {v.viewCount ?? v.likeCount ?? ''}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {visible('sounds') && results.sounds.length > 0 && (
              <section>
                {tab === 'all' && <SectionHead label="Sounds" />}
                <ul className="space-y-1">
                  {results.sounds.map((s: any) => (
                    <SoundRow key={s.id} s={s} previewId={previewId} onPreview={() => previewSound(s)} />
                  ))}
                </ul>
              </section>
            )}

            {visible('hashtags') && results.hashtags.length > 0 && (
              <section>
                {tab === 'all' && <SectionHead label="Hashtags" />}
                <div className="flex flex-wrap gap-2">
                  {results.hashtags.map((t: any, i: number) => {
                    const raw = typeof t === 'string' ? t : t.tag ?? t.name ?? '';
                    if (!raw) return null;
                    const label = raw.startsWith('#') ? raw : `#${raw}`;
                    const count = typeof t === 'object' ? t.count ?? t.usageCount : undefined;
                    return (
                      <Link key={label + i} href={`/search?q=${encodeURIComponent(label)}`} onClick={() => sounds.tap()}
                        className="rounded-2xl border border-line bg-panel px-4 py-2.5 hover:border-vio">
                        <span className="block text-sm font-bold text-vio">{label}</span>
                        {count != null && <span className="block text-[11px] text-dim">{count} posts</span>}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {visible('effects') && results.effects.length > 0 && (
              <section>
                {tab === 'all' && <SectionHead label="Effects" />}
                <ul className="space-y-1">
                  {results.effects.map((e: any) => (
                    <li key={e.id}>
                      <Link href={`/camera?effect=${encodeURIComponent(e.id)}`} onClick={() => sounds.tap()}
                        className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-vio to-cy">
                          <IconWand size={20} className="text-white" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{e.name ?? e.title}</span>
                          <span className="block truncate text-xs text-dim">{e.category ?? 'Effect'}</span>
                        </span>
                        <Badge tone="cy">Try</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {visible('templates') && results.templates.length > 0 && (
              <section>
                {tab === 'all' && <SectionHead label="Templates" />}
                <div className="grid grid-cols-2 gap-2">
                  {results.templates.map((t: any) => <TemplateCard key={t.id} t={t} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function SectionHead({ label }: { label: string }) {
  return <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">{label}</p>;
}

function SoundRow({ s, previewId, onPreview }: { s: any; previewId: string | null; onPreview: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5">
      <button onClick={onPreview} aria-label={previewId === s.id ? 'Stop preview' : 'Play preview'}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-vio to-cy text-sm font-black text-white">
        {previewId === s.id ? '❚❚' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{s.title}</p>
        <p className="truncate text-xs text-dim">{s.artist ?? 'Original'} · {s.usageCount ?? 0} uses</p>
      </div>
      {s.url && <span className="text-[11px] font-bold text-dim">{s.durationSec ? `${Math.round(s.durationSec)}s` : ''}</span>}
    </li>
  );
}

function TemplateCard({ t }: { t: any }) {
  return (
    <Link href={`/templates/${t.id}`} onClick={() => sounds.tap()}
      className="overflow-hidden rounded-2xl border border-line bg-panel hover:border-vio">
      {t.previewUrl
        ? <img src={t.previewUrl} alt={t.title} loading="lazy" className="aspect-video w-full object-cover" />
        : <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-vio/30 to-cy/20">
            <IconTemplate size={26} className="text-vio" />
          </div>}
      <div className="p-2.5">
        <p className="truncate text-sm font-bold">{t.title}</p>
        <p className="truncate text-[11px] text-dim">{t.usageCount ?? 0} uses{t.isPremium ? ' · PRO' : ''}</p>
      </div>
    </Link>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingScreen label="Loading search…" />}>
      <SearchInner />
    </Suspense>
  );
}
