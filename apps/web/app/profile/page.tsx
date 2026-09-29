'use client';
// OWN PROFILE — header, stats, posts / saved / highlights, edit.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Avatar, Button, Input, TextArea, EmptyState, ErrorState, LoadingScreen, BottomSheet, Tabs, Spinner, Badge,
} from '@/components/ui';
import {
  IconSettings, IconEdit, IconPlus, IconCamera, IconSave, IconGrid, IconChevronLeft, IconGlobe, IconPin,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { UserListSheet } from '@/components/profile/UserListSheet';
import type { Page, Post, Profile, User } from '@sigma-snap/shared';

type Tab = 'posts' | 'saved' | 'highlights';
type SheetKind = 'followers' | 'following' | 'friends' | null;

interface Highlight { id: string; title: string }

function errMsg(e: unknown): string {
  return e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Something went wrong';
}

function postThumb(p: Post): string | null {
  const a = p.assets?.[0];
  return a ? (a.thumbnailUrl ?? a.url ?? null) : null;
}

export default function ProfilePage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pageState, setPageState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [banner, setBanner] = useState('');

  const [tab, setTab] = useState<Tab>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [saved, setSaved] = useState<Post[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [tabState, setTabState] = useState<'loading' | 'error' | 'ready'>('loading');

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', website: '', location: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  useEffect(() => {
    try {
      const t = localStorage.getItem('sigmasnap.theme');
      if (t === 'light') document.documentElement.dataset.theme = 'light';
    } catch { /* noop */ }
  }, []);

  const loadProfile = async () => {
    if (!user) return;
    setPageState('loading'); setBanner('');
    try {
      const p = await api.getUser(user.username);
      setProfile(p);
      setPageState('ready');
    } catch {
      // fallback: basic /auth/me data (no counts)
      try {
        const me = await api.me();
        setProfile({ ...me, website: null, location: null, isPrivate: false, followersCount: 0, followingCount: 0, friendsCount: 0 });
        setPageState('ready');
      } catch (e) { setPageState('error'); setBanner(errMsg(e)); }
    }
  };

  const loadTab = async (t: Tab) => {
    setTabState('loading');
    try {
      if (t === 'posts') setPosts(await api.creatorPosts());
      else if (t === 'saved') setSaved(await api.savedPosts());
      else {
        const hs = await api.highlights();
        setHighlights((hs as Array<{ id?: string; title?: string }>).map((h, i) => ({
          id: h.id ?? `hl-${i}`, title: h.title ?? 'Highlight',
        })));
      }
      setTabState('ready');
    } catch (e) { setTabState('error'); setBanner(errMsg(e)); }
  };

  useEffect(() => { if (user) void loadProfile(); /* eslint-disable-line */ }, [user]);
  useEffect(() => { if (user) void loadTab(tab); /* eslint-disable-line */ }, [tab, user]);

  if (loading || !user) return <LoadingScreen label="Loading profile…" />;
  if (pageState === 'error') {
    return (
      <div className="px-4 pt-10">
        <ErrorState message={banner || 'Could not load your profile.'} onRetry={loadProfile} />
      </div>
    );
  }
  if (pageState === 'loading' || !profile) return <LoadingScreen label="Loading profile…" />;

  const openEdit = () => {
    setForm({
      displayName: profile.displayName ?? '',
      bio: profile.bio ?? '',
      website: profile.website ?? '',
      location: profile.location ?? '',
    });
    setFormErrors({});
    sounds.tap();
    setEditOpen(true);
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (form.displayName.trim().length < 2) errs.displayName = 'Display name needs at least 2 characters.';
    if (form.displayName.trim().length > 40) errs.displayName = 'Display name is too long (max 40).';
    if (form.bio.length > 160) errs.bio = 'Bio is too long (max 160).';
    if (form.website && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(form.website.trim()))
      errs.website = 'Enter a valid URL, e.g. example.com.';
    if (form.location.length > 60) errs.location = 'Location is too long (max 60).';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveProfile = async () => {
    if (!validateForm()) { sounds.error(); return; }
    setSaving(true); setBanner('');
    try {
      await api.updateMe({
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        website: form.website.trim() || undefined,
        location: form.location.trim() || undefined,
      });
      await refreshUser();
      await loadProfile();
      sounds.success();
      setEditOpen(false);
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setSaving(false); }
  };

  const onAvatarPicked = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setBanner('Please choose an image file.'); sounds.error(); return; }
    if (f.size > 8 * 1024 * 1024) { setBanner('Image must be under 8 MB.'); sounds.error(); return; }
    setAvatarBusy(true); setAvatarProgress(0); setBanner('');
    try {
      const asset = await api.uploadFile('PHOTO', f, (p) => setAvatarProgress(p));
      await api.setAvatar(asset.id);
      await refreshUser();
      await loadProfile();
      sounds.success();
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setAvatarBusy(false); setAvatarProgress(0); if (fileRef.current) fileRef.current.value = ''; }
  };

  const listLoader = (kind: Exclude<SheetKind, null>): ((cursor?: string) => Promise<Page<User>>) =>
    kind === 'followers'
      ? (c) => api.followers(profile.id, c)
      : kind === 'following'
        ? (c) => api.following(profile.id, c)
        : async () => ({ data: await api.friends(), page: { nextCursor: null } });

  const stats: Array<{ label: string; value: number; kind: SheetKind }> = [
    { label: 'Followers', value: profile.followersCount, kind: 'followers' },
    { label: 'Following', value: profile.followingCount, kind: 'following' },
    { label: 'Friends', value: profile.friendsCount, kind: 'friends' },
  ];

  return (
    <div className="animate-fade-up px-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/spotlight" className="rounded-full bg-panel p-2.5 text-dim hover:text-ink" aria-label="Back">
          <IconChevronLeft size={18} />
        </Link>
        <h1 className="text-lg font-extrabold">@{profile.username}</h1>
        <Link href="/settings" className="rounded-full bg-panel p-2.5 text-dim hover:text-ink" aria-label="Settings">
          <IconSettings size={18} />
        </Link>
      </div>

      {banner && (
        <div className="mb-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{banner}</div>
      )}

      {/* header */}
      <div className="rounded-3xl border border-line bg-panel p-5">
        <div className="flex items-start gap-4">
          <button type="button" onClick={() => { sounds.tap(); fileRef.current?.click(); }}
            className="relative shrink-0 rounded-full" aria-label="Change avatar" title="Change avatar">
            <Avatar src={profile.avatarUrl} name={profile.displayName} size={84} ring />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-vio p-1.5 text-white shadow-glow">
              <IconCamera size={13} />
            </span>
            {avatarBusy && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
                <Spinner size={22} />
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatarPicked(e.target.files?.[0])} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-extrabold">{profile.displayName}</h2>
              {profile.isPrivate && <Badge tone="gold">Private</Badge>}
            </div>
            <p className="text-sm text-dim">@{profile.username}</p>
            {profile.bio && <p className="mt-2 text-sm text-ink/90">{profile.bio}</p>}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-dim">
              {profile.website && (
                <span className="flex items-center gap-1"><IconGlobe size={12} />
                  <span className="max-w-[140px] truncate text-cy">{profile.website}</span>
                </span>
              )}
              {profile.location && (
                <span className="flex items-center gap-1"><IconPin size={12} />
                  <span className="max-w-[140px] truncate">{profile.location}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        {avatarBusy && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel2">
            <div className="h-full rounded-full bg-gradient-to-r from-vio to-cy transition-all" style={{ width: `${Math.round(avatarProgress * 100)}%` }} />
          </div>
        )}

        {/* stats */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <button key={s.label} onClick={() => { sounds.tap(); setSheet(s.kind); }}
              className="rounded-2xl bg-panel2 px-2 py-3 text-center hover:bg-white/5">
              <p className="text-lg font-extrabold text-ink">{s.value}</p>
              <p className="text-[11px] font-medium text-dim">{s.label}</p>
            </button>
          ))}
        </div>

        <Button variant="outline" className="mt-3 w-full" onClick={openEdit}>
          <span className="flex items-center justify-center gap-2"><IconEdit size={15} /> Edit profile</span>
        </Button>
      </div>

      {/* tabs */}
      <div className="mt-4">
        <Tabs<Tab>
          tabs={[{ id: 'posts', label: 'Posts' }, { id: 'saved', label: 'Saved' }, { id: 'highlights', label: 'Highlights' }]}
          active={tab}
          onChange={(t) => { sounds.tap(); setTab(t); }}
        />
      </div>

      <div className="mt-4 pb-8">
        {tabState === 'loading' ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : tabState === 'error' ? (
          <ErrorState message={banner || 'Could not load this section.'} onRetry={() => loadTab(tab)} />
        ) : tab === 'posts' ? (
          posts.length === 0 ? (
            <EmptyState title="No posts yet" hint="Capture something and share it — your posts will live here."
              action={<Link href="/camera"><Button>Open camera</Button></Link>} />
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {posts.map((p) => (
                <Link key={p.id} href="/spotlight" className="group relative aspect-square overflow-hidden rounded-xl bg-panel2">
                  {postThumb(p)
                    ? <img src={postThumb(p)!} alt="post" className="media-cover transition group-hover:scale-105" loading="lazy" />
                    : <div className="flex h-full items-center justify-center text-dim"><IconGrid size={22} /></div>}
                </Link>
              ))}
            </div>
          )
        ) : tab === 'saved' ? (
          saved.length === 0 ? (
            <EmptyState title="Nothing saved" hint="Tap the save icon on any post to keep it here for later."
              action={<Link href="/spotlight"><Button variant="outline">Browse spotlight</Button></Link>} />
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {saved.map((p) => (
                <Link key={p.id} href="/spotlight" className="group relative aspect-square overflow-hidden rounded-xl bg-panel2">
                  {postThumb(p)
                    ? <img src={postThumb(p)!} alt="saved post" className="media-cover transition group-hover:scale-105" loading="lazy" />
                    : <div className="flex h-full items-center justify-center text-dim"><IconSave size={22} /></div>}
                  <span className="absolute right-1.5 top-1.5 text-white/90"><IconSave size={14} /></span>
                </Link>
              ))}
            </div>
          )
        ) : (
          <div className="flex gap-4 overflow-x-auto no-scrollbar py-2">
            <Link href="/stories" className="flex shrink-0 flex-col items-center gap-1.5">
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-2 border-dashed border-line text-dim hover:border-vio hover:text-vio">
                <IconPlus size={22} />
              </span>
              <span className="text-[11px] text-dim">New</span>
            </Link>
            {highlights.map((h) => (
              <button key={h.id} type="button" className="flex shrink-0 flex-col items-center gap-1.5" onClick={() => sounds.tap()}>
                <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-gradient-to-br from-vio to-cy p-[3px]">
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-panel text-lg font-extrabold text-gradient">
                    {h.title.slice(0, 1).toUpperCase()}
                  </span>
                </span>
                <span className="max-w-[72px] truncate text-[11px] text-ink">{h.title}</span>
              </button>
            ))}
            {highlights.length === 0 && (
              <p className="self-center text-sm text-dim">No highlights yet — create one from your stories archive.</p>
            )}
          </div>
        )}
      </div>

      {/* stats sheet */}
      <UserListSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'followers' ? 'Followers' : sheet === 'following' ? 'Following' : 'Friends'}
        loader={listLoader(sheet ?? 'followers')}
      />

      {/* edit profile sheet */}
      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit profile">
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-dim">Display name</label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={40} />
            {formErrors.displayName && <p className="mt-1 text-xs text-danger">{formErrors.displayName}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-dim">Bio</label>
            <TextArea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} maxLength={160}
              placeholder="A line about you…" />
            <div className="mt-1 flex justify-between">
              {formErrors.bio ? <p className="text-xs text-danger">{formErrors.bio}</p> : <span />}
              <p className="text-xs text-dim">{form.bio.length}/160</p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-dim">Website</label>
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="example.com" inputMode="url" />
            {formErrors.website && <p className="mt-1 text-xs text-danger">{formErrors.website}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-dim">Location</label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={60} placeholder="City, Country" />
            {formErrors.location && <p className="mt-1 text-xs text-danger">{formErrors.location}</p>}
          </div>
          <Button onClick={saveProfile} disabled={saving} className="mt-1">
            {saving ? <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Saving…</span> : 'Save changes'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
