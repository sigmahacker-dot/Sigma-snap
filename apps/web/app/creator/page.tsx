'use client';
// Creator dashboard — analytics, drafts, post management.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, ApiException } from '@/lib/api';
import {
  BottomSheet, Button, EmptyState, ErrorState, Input, LoadingScreen, Spinner, Tabs, Badge, TextArea,
} from '@/components/ui';
import { AreaChart, StackedBars, CHART_COLORS } from '@/components/charts';
import {
  IconEye, IconHeart, IconComment, IconShare, IconUsers, IconClock, IconChart,
  IconEdit, IconTrash, IconPlay, IconZap, IconCheck, IconPlus,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import type { Post } from '@sigma-snap/shared';

function fmt(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}
function fmtDur(sec: number | null | undefined): string {
  const s = Math.round(Number(sec ?? 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

interface SeriesPoint {
  date?: string; day?: string;
  views?: number; likes?: number; comments?: number; shares?: number; followers?: number;
}

function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-dim">—</span>;
  const up = value >= 0;
  return (
    <span className={`text-[11px] font-bold ${up ? 'text-cy' : 'text-danger'}`}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function StatCard({ label, value, delta, icon, hint }: {
  label: string; value: string; delta: number | null; icon: React.ReactNode; hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <span className="text-dim">{icon}</span>
        <Delta value={delta} />
      </div>
      <p className="mt-2 text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs text-dim">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-dim/70">{hint}</p>}
    </div>
  );
}

function thumbOf(p: Post): string | null {
  const a = p.assets?.[0];
  return a?.thumbnailUrl ?? a?.url ?? null;
}

export default function CreatorPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [tab, setTab] = useState<'overview' | 'drafts' | 'posts'>('overview');
  const [analytics, setAnalytics] = useState<{ totals?: Record<string, unknown>; series?: SeriesPoint[]; topPosts?: Post[] } | null>(null);
  const [drafts, setDrafts] = useState<Post[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingA, setLoadingA] = useState(true);
  const [loadingLists, setLoadingLists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'delete' | 'publish'; title: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; caption: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const loadAnalytics = useCallback(async (days: number) => {
    setLoadingA(true); setError(null);
    try {
      const d = await api.creatorAnalytics(days);
      setAnalytics(d ?? {});
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load analytics.');
    } finally {
      setLoadingA(false);
    }
  }, []);

  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const [dr, ps] = await Promise.all([api.creatorDrafts(), api.creatorPosts()]);
      setDrafts(dr ?? []); setPosts(ps ?? []);
    } catch { /* lists are best-effort; analytics errors surface above */ }
    finally { setLoadingLists(false); }
  }, []);

  useEffect(() => { if (user) { void loadAnalytics(period); } }, [user, period, loadAnalytics]);
  useEffect(() => { if (user) { void loadLists(); } }, [user, loadLists]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2800);
  };

  const totals = useMemo(() => analytics?.totals ?? {}, [analytics]);
  const series = useMemo(() => analytics?.series ?? [], [analytics]);
  const topPosts = useMemo(() => analytics?.topPosts ?? [], [analytics]);

  const halfDeltas = useMemo(() => {
    // Compare second half of the series vs first half as "previous period".
    const keys = ['views', 'likes', 'comments', 'shares', 'followers'] as const;
    const out: Record<string, number | null> = {};
    if (series.length < 4) { keys.forEach((k) => { out[k] = null; }); return out; }
    const mid = Math.floor(series.length / 2);
    const sum = (arr: SeriesPoint[], k: string) => arr.reduce((s, p) => s + num(p[k as keyof SeriesPoint]), 0);
    keys.forEach((k) => {
      out[k] = deltaPct(sum(series.slice(mid), k), sum(series.slice(0, mid), k));
    });
    return out;
  }, [series]);

  const engagementRate = useMemo(() => {
    const v = num(totals.views);
    if (v <= 0) return 0;
    return ((num(totals.likes) + num(totals.comments) + num(totals.shares)) / v) * 100;
  }, [totals]);

  const viewSeries = useMemo(() => series.map((p) => num(p.views)), [series]);
  const dayLabels = useMemo(() => series.map((p) => fmtDate(p.date ?? p.day)), [series]);
  const engGroups = useMemo(() => series.map((p) => ({
    label: fmtDate(p.date ?? p.day),
    segments: [
      { name: 'Likes', value: num(p.likes), color: CHART_COLORS.vio },
      { name: 'Comments', value: num(p.comments), color: CHART_COLORS.cy },
      { name: 'Shares', value: num(p.shares), color: CHART_COLORS.gold },
    ],
  })), [series]);

  const doConfirm = async () => {
    if (!confirm) return;
    setBusyId(confirm.id);
    try {
      if (confirm.kind === 'delete') {
        await api.deletePost(confirm.id);
        setDrafts((d) => d.filter((p) => p.id !== confirm.id));
        setPosts((d) => d.filter((p) => p.id !== confirm.id));
        sounds.tap(); flash('Deleted.');
      } else {
        await api.updatePost(confirm.id, { status: 'PUBLISHED' });
        setDrafts((d) => d.filter((p) => p.id !== confirm.id));
        sounds.success(); flash('Draft published.');
        void loadLists();
      }
    } catch (e) {
      sounds.error();
      flash(e instanceof ApiException ? e.message : 'Action failed.');
    } finally {
      setBusyId(null); setConfirm(null);
    }
  };

  const saveCaption = async () => {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      await api.updatePost(editing.id, { caption: editing.caption });
      setPosts((ps) => ps.map((p) => (p.id === editing.id ? { ...p, caption: editing.caption } : p)));
      sounds.success(); flash('Caption updated.');
      setEditing(null);
    } catch (e) {
      sounds.error();
      flash(e instanceof ApiException ? e.message : 'Could not update caption.');
    } finally { setBusyId(null); }
  };

  if (loading) return <LoadingScreen label="Loading creator studio…" />;
  if (!user) return null;

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">Creator studio</h1>
          <p className="text-xs text-dim">Your performance at a glance</p>
        </div>
        <div className="flex gap-1 rounded-2xl bg-panel p-1">
          {([7, 30, 90] as const).map((d) => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${period === d ? 'bg-vio text-white' : 'text-dim hover:text-ink'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Tabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'drafts', label: `Drafts${drafts.length ? ` (${drafts.length})` : ''}` },
            { id: 'posts', label: 'Posts' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {notice && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-full bg-panel2 px-4 py-2 text-sm font-semibold text-ink shadow-card border border-line">
          {notice}
        </div>
      )}

      {tab === 'overview' && (
        <div className="mt-4">
          {loadingA ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer h-28 rounded-2xl" />)}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => loadAnalytics(period)} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Views" value={fmt(num(totals.views))} delta={halfDeltas.views} icon={<IconEye size={18} />} hint="vs previous period" />
                <StatCard label="Likes" value={fmt(num(totals.likes))} delta={halfDeltas.likes} icon={<IconHeart size={18} />} hint="vs previous period" />
                <StatCard label="Comments" value={fmt(num(totals.comments))} delta={halfDeltas.comments} icon={<IconComment size={18} />} hint="vs previous period" />
                <StatCard label="Shares" value={fmt(num(totals.shares))} delta={halfDeltas.shares} icon={<IconShare size={18} />} hint="vs previous period" />
                <StatCard label="Followers" value={fmt(num(totals.followers))} delta={halfDeltas.followers} icon={<IconUsers size={18} />} hint="vs previous period" />
                <StatCard label="Watch time" value={fmtDur(num(totals.watchTimeSec ?? totals.watchTime ?? totals.watch_time))} delta={null} icon={<IconClock size={18} />} hint="total" />
              </div>

              <div className="mt-3 rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Engagement rate</p>
                  <Badge tone="cy">{engagementRate.toFixed(1)}%</Badge>
                </div>
                <p className="mt-1 text-xs text-dim">(likes + comments + shares) ÷ views</p>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-gradient-to-r from-vio to-cy transition-all" style={{ width: `${Math.min(engagementRate, 100)}%` }} />
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-center gap-2">
                  <IconChart size={16} className="text-vio" />
                  <p className="text-sm font-bold">Views · last {period} days</p>
                </div>
                <div className="mt-2">
                  {viewSeries.length > 1
                    ? <AreaChart points={viewSeries} labels={dayLabels} />
                    : <p className="py-8 text-center text-sm text-dim">Not enough data yet — post something!</p>}
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-center gap-2">
                  <IconZap size={16} className="text-gold" />
                  <p className="text-sm font-bold">Engagement by day</p>
                </div>
                <div className="mt-3">
                  {engGroups.length > 1
                    ? <StackedBars groups={engGroups} legend />
                    : <p className="py-8 text-center text-sm text-dim">No engagement data for this period.</p>}
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-line bg-panel p-4">
                <p className="text-sm font-bold">Top posts</p>
                {topPosts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-dim">No top posts yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {topPosts.slice(0, 5).map((p, i) => (
                      <Link key={p.id} href="/spotlight" className="flex items-center gap-3 rounded-xl bg-panel2 p-2 hover:border-vio border border-transparent transition">
                        <span className="w-5 text-center text-sm font-extrabold text-dim">#{i + 1}</span>
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-void">
                          {thumbOf(p)
                            ? <img src={thumbOf(p) ?? ''} alt="" className="media-cover" />
                            : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-vio/40 to-cy/40"><IconPlay size={18} className="text-white" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-ink">{p.caption || 'Untitled'}</p>
                          <p className="text-[11px] text-dim">{fmt(p.viewCount)} views · {fmt(p.likeCount)} likes</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'drafts' && (
        <div className="mt-4">
          {loadingLists ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-24 rounded-2xl" />)}</div>
          ) : drafts.length === 0 ? (
            <EmptyState title="No drafts" hint="Start a video from a template or the camera and it will wait for you here."
              action={<Button onClick={() => router.push('/templates')}>Browse templates</Button>} />
          ) : (
            <div className="space-y-3">
              {drafts.map((d) => (
                <div key={d.id} className="rounded-2xl border border-line bg-panel p-3 animate-fade-up">
                  <div className="flex gap-3">
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-void">
                      {thumbOf(d) ? <img src={thumbOf(d) ?? ''} alt="" className="media-cover" />
                        : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-vio/40 to-cy/40"><IconPlay size={16} className="text-white" /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge tone="gold">DRAFT</Badge>
                        <span className="text-[11px] text-dim">{fmtDate(d.createdAt)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-ink">{d.caption || 'Untitled draft'}</p>
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => router.push(`/editor?postId=${d.id}`)}
                          className="flex items-center gap-1 rounded-xl bg-vio/15 px-3 py-1.5 text-xs font-bold text-vio hover:bg-vio/25">
                          <IconEdit size={13} /> Edit
                        </button>
                        <button disabled={busyId === d.id} onClick={() => setConfirm({ id: d.id, kind: 'publish', title: d.caption || 'this draft' })}
                          className="flex items-center gap-1 rounded-xl bg-cy/15 px-3 py-1.5 text-xs font-bold text-cy hover:bg-cy/25 disabled:opacity-40">
                          {busyId === d.id ? <Spinner size={13} /> : <IconCheck size={13} />} Publish
                        </button>
                        <button onClick={() => setConfirm({ id: d.id, kind: 'delete', title: d.caption || 'this draft' })}
                          className="flex items-center gap-1 rounded-xl bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/25">
                          <IconTrash size={13} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'posts' && (
        <div className="mt-4">
          {loadingLists ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-24 rounded-2xl" />)}</div>
          ) : posts.length === 0 ? (
            <EmptyState title="No posts yet" hint="Your published posts will show up here for management."
              action={<Button onClick={() => router.push('/camera')}><span className="flex items-center gap-2"><IconPlus size={15} /> Create</span></Button>} />
          ) : (
            <div className="space-y-3">
              {posts.map((p) => (
                <div key={p.id} className="rounded-2xl border border-line bg-panel p-3 animate-fade-up">
                  <div className="flex gap-3">
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-void">
                      {thumbOf(p) ? <img src={thumbOf(p) ?? ''} alt="" className="media-cover" />
                        : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-vio/40 to-cy/40"><IconPlay size={16} className="text-white" /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      {editing?.id === p.id ? (
                        <div>
                          <TextArea rows={2} value={editing.caption} onChange={(e) => setEditing({ id: p.id, caption: e.target.value })} />
                          <div className="mt-2 flex gap-2">
                            <button disabled={busyId === p.id} onClick={saveCaption}
                              className="rounded-xl bg-vio px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                              {busyId === p.id ? <Spinner size={13} /> : 'Save'}
                            </button>
                            <button onClick={() => setEditing(null)} className="rounded-xl bg-white/5 px-3 py-1.5 text-xs font-bold text-dim">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="line-clamp-2 text-sm text-ink">{p.caption || 'Untitled'}</p>
                          <p className="mt-1 text-[11px] text-dim">
                            {fmt(p.viewCount)} views · {fmt(p.likeCount)} likes · {fmt(p.commentCount)} comments · {fmtDate(p.createdAt)}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => setEditing({ id: p.id, caption: p.caption ?? '' })}
                              className="flex items-center gap-1 rounded-xl bg-white/5 px-3 py-1.5 text-xs font-bold text-ink hover:bg-white/10">
                              <IconEdit size={13} /> Caption
                            </button>
                            <button onClick={() => setConfirm({ id: p.id, kind: 'delete', title: p.caption || 'this post' })}
                              className="flex items-center gap-1 rounded-xl bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/25">
                              <IconTrash size={13} /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <BottomSheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === 'delete' ? 'Delete?' : 'Publish draft?'}>
        <p className="text-sm text-dim">
          {confirm?.kind === 'delete'
            ? `This will permanently delete “${confirm?.title}”. This can't be undone.`
            : `Publish “${confirm?.title}” to your profile and the feed?`}
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant={confirm?.kind === 'delete' ? 'danger' : 'primary'} className="flex-1" onClick={doConfirm} disabled={!!busyId}>
            {busyId ? <span className="flex items-center justify-center gap-2"><Spinner size={15} /> Working…</span>
              : confirm?.kind === 'delete' ? 'Delete' : 'Publish'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
