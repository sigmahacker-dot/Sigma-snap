'use client';
// Stories home: your-story tile + friends' rings, viewer, archive + highlights.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Story, User } from '@sigma-snap/shared';
import { Button, Input, EmptyState, ErrorState, LoadingScreen, Avatar, BottomSheet, Tabs, Badge } from '@/components/ui';
import { IconPlus, IconCheck, IconX, IconTrash, IconRefresh } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import StoryViewer, { type StoryGroup } from '@/components/stories/StoryViewer';
import StoryComposer from '@/components/stories/StoryComposer';

interface Highlight { id: string; title: string; storyIds?: string[]; coverAssetId?: string | null; stories?: Story[]; }

export default function StoriesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'stories' | 'archive'>('stories');

  const [feed, setFeed] = useState<StoryGroup[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  const [composerOpen, setComposerOpen] = useState(false);
  const [viewer, setViewer] = useState<{ groups: StoryGroup[]; index: number } | null>(null);

  // archive + highlights
  const [archive, setArchive] = useState<Story[]>([]);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveErr, setArchiveErr] = useState('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [hlOpen, setHlOpen] = useState(false);
  const [hlTitle, setHlTitle] = useState('');
  const [hlSel, setHlSel] = useState<string[]>([]);
  const [hlBusy, setHlBusy] = useState(false);
  const [hlErr, setHlErr] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true); setErr('');
    try {
      const [f, mine] = await Promise.all([api.storyFeed(), api.userStories(user.id)]);
      setFeed(f.filter((g) => g.stories.length > 0));
      setMyStories(mine);
    } catch (e) {
      setErr(e instanceof ApiException ? e.message : 'Could not load stories');
    } finally { setBusy(false); }
  }, [user]);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const loadArchive = useCallback(async () => {
    setArchiveBusy(true); setArchiveErr('');
    try {
      const [a, h] = await Promise.all([api.storyArchive(), api.highlights()]);
      setArchive(a);
      setHighlights(h as Highlight[]);
    } catch (e) {
      setArchiveErr(e instanceof ApiException ? e.message : 'Could not load archive');
    } finally { setArchiveBusy(false); }
  }, []);

  useEffect(() => { if (tab === 'archive' && user) void loadArchive(); }, [tab, user, loadArchive]);

  const markViewed = useCallback((storyId: string) => {
    setFeed((prev) => prev.map((g) => ({
      ...g, stories: g.stories.map((s) => s.id === storyId ? { ...s, viewedByMe: true } : s),
    })));
    setMyStories((prev) => prev.map((s) => s.id === storyId ? { ...s, viewedByMe: true } : s));
  }, []);

  const openViewer = (groups: StoryGroup[], index: number) => {
    if (!groups[index] || groups[index].stories.length === 0) return;
    sounds.tap();
    setViewer({ groups, index });
  };

  // viewer groups: mine first (if any), then feed — mirrors the rail order
  const viewerGroups = useCallback((): StoryGroup[] => {
    const g: StoryGroup[] = [];
    if (user && myStories.length) g.push({ user, stories: myStories });
    g.push(...feed);
    return g;
  }, [user, myStories, feed]);

  const createHighlight = async () => {
    if (!hlTitle.trim() || hlSel.length === 0 || hlBusy) return;
    setHlBusy(true); setHlErr('');
    try {
      await api.createHighlight({ title: hlTitle.trim(), storyIds: hlSel });
      sounds.success();
      setHlOpen(false); setHlTitle(''); setHlSel([]);
      await loadArchive();
    } catch (e) {
      sounds.error();
      setHlErr(e instanceof ApiException ? e.message : 'Could not create highlight');
    } finally { setHlBusy(false); }
  };

  const deleteHighlight = async (id: string) => {
    try { await api.deleteHighlight(id); sounds.tap(); setHighlights((p) => p.filter((h) => h.id !== id)); }
    catch { sounds.error(); }
  };

  if (loading || (!user && !err)) return <LoadingScreen label="Loading stories…" />;

  const myUnviewed = myStories.length > 0 && myStories.some((s) => !s.viewedByMe);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between pt-safe">
        <h1 className="text-xl font-extrabold">Stories</h1>
        <button onClick={() => void load()} aria-label="Refresh" className="rounded-full bg-white/5 p-2.5 hover:bg-white/10">
          <IconRefresh size={18} />
        </button>
      </div>

      <Tabs tabs={[{ id: 'stories', label: 'Stories' }, { id: 'archive', label: 'Archive' }]}
        active={tab} onChange={(t) => { setTab(t); sounds.tap(); }} />

      {tab === 'stories' && (
        <>
          {busy && <LoadingScreen label="Loading stories…" />}
          {!busy && err && <ErrorState message={err} onRetry={() => void load()} />}
          {!busy && !err && (
            <>
              {/* rail */}
              <div className="no-scrollbar -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-2">
                {/* your tile */}
                <button onClick={() => myStories.length ? openViewer(viewerGroups(), 0) : setComposerOpen(true)}
                  className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
                  <span className={`relative rounded-full p-[3px] ${myUnviewed ? 'bg-gradient-to-tr from-vio via-fuchsia-400 to-cy' : 'bg-line'}`}>
                    <Avatar src={user?.avatarUrl} name={user?.displayName} size={64} />
                    {!myStories.length && (
                      <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-void bg-vio text-white">
                        <IconPlus size={15} />
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate text-[11px] font-semibold text-dim">Your story</span>
                </button>
                <button onClick={() => setComposerOpen(true)}
                  className="flex w-[76px] shrink-0 flex-col items-center gap-1.5" aria-label="Add story">
                  <span className="flex h-[70px] w-[70px] items-center justify-center rounded-full border-2 border-dashed border-line text-dim hover:border-vio hover:text-vio">
                    <IconPlus size={26} />
                  </span>
                  <span className="text-[11px] font-semibold text-dim">Add</span>
                </button>
                {feed.map((g, i) => {
                  const unviewed = g.stories.some((s) => !s.viewedByMe);
                  return (
                    <button key={g.user.id} onClick={() => openViewer(viewerGroups(), myStories.length ? i + 1 : i)}
                      className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
                      <span className={`rounded-full p-[3px] ${unviewed ? 'bg-gradient-to-tr from-vio via-fuchsia-400 to-cy' : 'bg-line'}`}>
                        <Avatar src={g.user.avatarUrl} name={g.user.displayName} size={64} />
                      </span>
                      <span className="max-w-full truncate text-[11px] font-semibold text-dim">{g.user.username}</span>
                    </button>
                  );
                })}
              </div>

              {feed.length === 0 && myStories.length === 0 && (
                <EmptyState title="No stories yet"
                  hint="Stories from people you follow will appear here. Share your first story — it disappears after 24 hours."
                  action={<Button onClick={() => setComposerOpen(true)}>Create a story</Button>} />
              )}

              {/* recent list */}
              {feed.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Recent updates</p>
                  <ul className="space-y-1">
                    {feed.map((g, i) => (
                      <li key={g.user.id}>
                        <button onClick={() => openViewer(viewerGroups(), myStories.length ? i + 1 : i)}
                          className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-white/5">
                          <span className={`rounded-full p-[2.5px] ${g.stories.some((s) => !s.viewedByMe) ? 'bg-gradient-to-tr from-vio via-fuchsia-400 to-cy' : 'bg-line'}`}>
                            <Avatar src={g.user.avatarUrl} name={g.user.displayName} size={46} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{g.user.displayName}</span>
                            <span className="block text-xs text-dim">
                              {g.stories.length} {g.stories.length === 1 ? 'story' : 'stories'}
                            </span>
                          </span>
                          {g.stories.some((s) => !s.viewedByMe) && <Badge tone="vio">New</Badge>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'archive' && (
        <div className="mt-4">
          {archiveBusy && <LoadingScreen label="Loading archive…" />}
          {!archiveBusy && archiveErr && <ErrorState message={archiveErr} onRetry={() => void loadArchive()} />}
          {!archiveBusy && !archiveErr && (
            <>
              {/* highlights */}
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-dim">Highlights</p>
                <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => { setHlOpen(true); sounds.tap(); }}>
                  + New highlight
                </Button>
              </div>
              {highlights.length > 0 ? (
                <div className="no-scrollbar -mx-4 mb-5 flex gap-3 overflow-x-auto px-4">
                  {highlights.map((h) => (
                    <div key={h.id} className="group relative w-[76px] shrink-0 text-center">
                      <div className="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-gradient-to-br from-gold/60 to-vio/60 text-lg font-extrabold text-white">
                        {(h.title ?? '?').slice(0, 1).toUpperCase()}
                      </div>
                      <p className="mt-1 truncate text-[11px] font-semibold text-dim">{h.title}</p>
                      <button onClick={() => void deleteHighlight(h.id)} aria-label={`Delete ${h.title}`}
                        className="absolute -right-1 -top-1 hidden rounded-full bg-danger p-1 text-white group-hover:block">
                        <IconTrash size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-5 text-sm text-dim">Keep your favorite stories on your profile with highlights.</p>
              )}

              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">
                Archive <span className="text-dim/60">({archive.length})</span>
              </p>
              {archive.length === 0 ? (
                <EmptyState title="Archive is empty"
                  hint="Expired stories are saved here privately, so you can relive them or turn them into highlights." />
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {archive.map((s) => (
                    <div key={s.id} className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-panel">
                      {s.mediaType === 'VIDEO'
                        ? <video src={s.mediaUrl} className="media-cover" muted playsInline preload="metadata" />
                        : <img src={s.thumbnailUrl ?? s.mediaUrl} alt="" className="media-cover" loading="lazy" />}
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                        {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* composer */}
      <StoryComposer open={composerOpen} onClose={() => setComposerOpen(false)}
        onCreated={() => { setComposerOpen(false); void load(); }} />

      {/* viewer */}
      {viewer && (
        <StoryViewer groups={viewer.groups} initialGroup={viewer.index}
          onClose={() => setViewer(null)} onViewed={markViewed}
          onDeleted={() => { setViewer(null); void load(); }} />
      )}

      {/* highlight builder */}
      <BottomSheet open={hlOpen} onClose={() => setHlOpen(false)} title="New highlight">
        {hlErr && <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{hlErr}</p>}
        <Input value={hlTitle} onChange={(e) => setHlTitle(e.target.value)}
          placeholder="Highlight title" maxLength={30} className="mb-3" />
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">
          Select stories ({hlSel.length})
        </p>
        {archive.length === 0 && <p className="py-4 text-center text-sm text-dim">No archived stories to choose from.</p>}
        <div className="grid grid-cols-3 gap-2">
          {archive.map((s) => {
            const on = hlSel.includes(s.id);
            return (
              <button key={s.id} onClick={() => {
                setHlSel((p) => on ? p.filter((x) => x !== s.id) : [...p, s.id]); sounds.tap();
              }}
                className={`relative aspect-[3/4] overflow-hidden rounded-2xl border-2 ${on ? 'border-vio' : 'border-transparent'}`}>
                {s.mediaType === 'VIDEO'
                  ? <video src={s.mediaUrl} className="media-cover" muted playsInline preload="metadata" />
                  : <img src={s.thumbnailUrl ?? s.mediaUrl} alt="" className="media-cover" loading="lazy" />}
                {on && (
                  <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-vio text-white">
                    <IconCheck size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <Button className="mt-4 w-full" disabled={!hlTitle.trim() || hlSel.length === 0 || hlBusy}
          onClick={() => void createHighlight()}>
          {hlBusy ? 'Creating…' : `Create highlight (${hlSel.length})`}
        </Button>
        <button onClick={() => { setHlOpen(false); setHlSel([]); setHlTitle(''); }}
          className="mt-2 flex w-full items-center justify-center gap-1 py-2 text-sm text-dim">
          <IconX size={14} /> Cancel
        </button>
      </BottomSheet>
    </main>
  );
}
