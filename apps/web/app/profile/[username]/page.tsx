'use client';
// PUBLIC PROFILE — view someone else: follow, add friend, message, block/report.
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Avatar, Button, Input, TextArea, EmptyState, ErrorState, LoadingScreen, BottomSheet, Spinner, Badge,
} from '@/components/ui';
import {
  IconChevronLeft, IconChat, IconUserPlus, IconMore, IconBlock, IconFlag, IconLock, IconGlobe, IconPin, IconCheck,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { UserListSheet } from '@/components/profile/UserListSheet';
import type { Page, Profile, User } from '@sigma-snap/shared';

type SheetKind = 'followers' | 'following' | null;

interface PublicProfile extends Profile {
  isFollowing?: boolean;
  isFriend?: boolean;
  requestSent?: boolean;
}

const REPORT_REASONS = ['Spam', 'Harassment', 'Impersonation', 'Inappropriate content', 'Other'];

function errMsg(e: unknown): string {
  return e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Something went wrong';
}

export default function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [pageState, setPageState] = useState<'loading' | 'notfound' | 'blocked' | 'error' | 'ready'>('loading');
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState('');

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  useEffect(() => {
    try {
      const t = localStorage.getItem('sigmasnap.theme');
      if (t === 'light') document.documentElement.dataset.theme = 'light';
    } catch { /* noop */ }
  }, []);

  const load = async () => {
    setPageState('loading'); setBanner('');
    try {
      const p = await api.getUser(username);
      setProfile(p as PublicProfile);
      setPageState('ready');
    } catch (e) {
      if (e instanceof ApiException && e.status === 404) setPageState('notfound');
      else if (e instanceof ApiException && (e.status === 403 || e.code === 'BLOCKED')) setPageState('blocked');
      else { setPageState('error'); setBanner(errMsg(e)); }
    }
  };

  useEffect(() => {
    if (!user) return;
    if (user.username.toLowerCase() === username.toLowerCase()) { router.replace('/profile'); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, username]);

  if (loading || !user) return <LoadingScreen label="Loading profile…" />;
  if (pageState === 'loading') return <LoadingScreen label={`Loading @${username}…`} />;
  if (pageState === 'notfound') {
    return (
      <div className="px-4 pt-6">
        <BackHeader title="Profile" />
        <EmptyState title="User not found" hint={`@${username} doesn't exist or was removed.`}
          action={<Link href="/friends"><Button variant="outline">Find friends</Button></Link>} />
      </div>
    );
  }
  if (pageState === 'blocked') {
    return (
      <div className="px-4 pt-6">
        <BackHeader title="Profile" />
        <EmptyState title="Not available" hint="This profile isn't available — it may be private to you or the account blocked you." />
      </div>
    );
  }
  if (pageState === 'error' || !profile) {
    return (
      <div className="px-4 pt-6">
        <BackHeader title="Profile" />
        <ErrorState message={banner || 'Could not load this profile.'} onRetry={load} />
      </div>
    );
  }

  const isPrivateLocked = profile.isPrivate && !profile.isFriend;

  const toggleFollow = async () => {
    setBusy('follow'); setBanner('');
    try {
      if (profile.isFollowing) {
        await api.unfollow(profile.id);
        setProfile({ ...profile, isFollowing: false, followersCount: Math.max(0, profile.followersCount - 1) });
      } else {
        await api.follow(profile.id);
        setProfile({ ...profile, isFollowing: true, followersCount: profile.followersCount + 1 });
        sounds.pop();
      }
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusy(null); }
  };

  const addFriend = async () => {
    setBusy('friend'); setBanner('');
    try {
      await api.sendFriendRequest(profile.id);
      setProfile({ ...profile, requestSent: true });
      sounds.success();
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusy(null); }
  };

  const message = async () => {
    setBusy('message'); setBanner('');
    try {
      const conv = await api.createConversation({ type: 'DIRECT', userIds: [profile.id] });
      sounds.send();
      router.push(`/chat/${conv.id}`);
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusy(null); }
  };

  const toggleBlock = async () => {
    setBusy('block'); setBanner(''); setMenuOpen(false);
    try {
      // block state tracked locally; API exposes block/unblock only
      await api.block(profile.id);
      sounds.success();
      router.replace('/friends');
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusy(null); }
  };

  const submitReport = async () => {
    setReportError('');
    if (reportDetails.trim().length > 500) { setReportError('Details are too long (max 500).'); return; }
    setBusy('report');
    try {
      await api.report({ targetType: 'USER', targetId: profile.id, reason: reportReason, details: reportDetails.trim() || undefined });
      sounds.success();
      setReportOpen(false); setReportDetails('');
      setBanner('Report submitted. Our team will review this account.');
    } catch (e) { setReportError(errMsg(e)); sounds.error(); }
    finally { setBusy(null); }
  };

  const listLoader = (kind: Exclude<SheetKind, null>): ((cursor?: string) => Promise<Page<User>>) =>
    kind === 'followers' ? (c) => api.followers(profile.id, c) : (c) => api.following(profile.id, c);

  return (
    <div className="animate-fade-up px-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => router.back()} className="rounded-full bg-panel p-2.5 text-dim hover:text-ink" aria-label="Back">
          <IconChevronLeft size={18} />
        </button>
        <h1 className="text-lg font-extrabold">@{profile.username}</h1>
        <button onClick={() => { sounds.tap(); setMenuOpen(true); }} className="rounded-full bg-panel p-2.5 text-dim hover:text-ink" aria-label="More options">
          <IconMore size={18} />
        </button>
      </div>

      {banner && (
        <div className="mb-3 rounded-2xl border border-cy/30 bg-cy/10 px-4 py-3 text-sm text-cy">{banner}</div>
      )}

      <div className="rounded-3xl border border-line bg-panel p-5">
        <div className="flex items-start gap-4">
          <Avatar src={profile.avatarUrl} name={profile.displayName} size={84} ring={!!profile.isFriend} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-extrabold">{profile.displayName}</h2>
              {profile.isFriend && <Badge tone="cy">Friend</Badge>}
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

        {/* stats */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Followers', value: profile.followersCount, kind: 'followers' as SheetKind },
            { label: 'Following', value: profile.followingCount, kind: 'following' as SheetKind },
            { label: 'Friends', value: profile.friendsCount, kind: null },
          ].map((s) => (
            <button key={s.label} disabled={!s.kind} onClick={() => { sounds.tap(); setSheet(s.kind); }}
              className="rounded-2xl bg-panel2 px-2 py-3 text-center disabled:opacity-80 hover:bg-white/5">
              <p className="text-lg font-extrabold text-ink">{s.value}</p>
              <p className="text-[11px] font-medium text-dim">{s.label}</p>
            </button>
          ))}
        </div>

        {/* actions */}
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" variant={profile.isFollowing ? 'ghost' : 'primary'}
            disabled={busy === 'follow'} onClick={toggleFollow}>
            {busy === 'follow' ? <Spinner size={16} />
              : profile.isFollowing
                ? <span className="flex items-center justify-center gap-1.5"><IconCheck size={15} /> Following</span>
                : 'Follow'}
          </Button>
          {profile.isFriend ? (
            <Button variant="ghost" className="flex-1" disabled={busy === 'message'} onClick={message}>
              {busy === 'message' ? <Spinner size={16} />
                : <span className="flex items-center justify-center gap-1.5"><IconChat size={15} /> Message</span>}
            </Button>
          ) : profile.requestSent ? (
            <Button variant="ghost" className="flex-1" disabled><Badge tone="cy">Request sent</Badge></Button>
          ) : (
            <Button variant="outline" className="flex-1" disabled={busy === 'friend'} onClick={addFriend}>
              {busy === 'friend' ? <Spinner size={16} />
                : <span className="flex items-center justify-center gap-1.5"><IconUserPlus size={15} /> Add friend</span>}
            </Button>
          )}
        </div>
      </div>

      {/* posts */}
      <div className="mt-6 pb-10">
        <h3 className="mb-2 text-sm font-bold text-ink">Posts</h3>
        {isPrivateLocked ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-panel px-6 py-12 text-center">
            <span className="rounded-full bg-panel2 p-4 text-dim"><IconLock size={24} /></span>
            <p className="font-semibold text-ink">This account is private</p>
            <p className="max-w-[240px] text-sm text-dim">
              Follow {profile.displayName} to see their posts, or add them as a friend.
            </p>
            <Button variant="outline" onClick={toggleFollow} disabled={busy === 'follow'}>
              {busy === 'follow' ? <Spinner size={16} /> : profile.isFollowing ? 'Following' : 'Follow'}
            </Button>
          </div>
        ) : (
          <EmptyState
            title="No posts to show"
            hint={`Posts by @${profile.username} will appear here once the API exposes them.`}
          />
        )}
      </div>

      {/* stats sheets */}
      <UserListSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'followers' ? 'Followers' : 'Following'}
        loader={listLoader(sheet ?? 'followers')}
      />

      {/* overflow menu */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={`@${profile.username}`}>
        <div className="flex flex-col gap-1">
          <button onClick={() => { setMenuOpen(false); setReportOpen(true); sounds.tap(); }}
            className="flex items-center gap-3 rounded-2xl px-3 py-3.5 text-left text-sm hover:bg-white/5">
            <IconFlag size={18} className="text-gold" /> Report account
          </button>
          <button onClick={toggleBlock} disabled={busy === 'block'}
            className="flex items-center gap-3 rounded-2xl px-3 py-3.5 text-left text-sm text-danger hover:bg-danger/10 disabled:opacity-40">
            {busy === 'block' ? <Spinner size={18} /> : <IconBlock size={18} />} Block account
          </button>
          <p className="px-3 pt-2 text-xs text-dim">Blocking hides your profile from this account and prevents messages.</p>
        </div>
      </BottomSheet>

      {/* report sheet */}
      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report account">
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-dim">Reason</label>
            <div className="flex flex-wrap gap-2">
              {REPORT_REASONS.map((r) => (
                <button key={r} onClick={() => { setReportReason(r); sounds.tap(); }}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${reportReason === r ? 'bg-vio text-white' : 'bg-panel2 text-dim hover:text-ink'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-dim">Details (optional)</label>
            <TextArea value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} rows={3} maxLength={500}
              placeholder="What happened?" />
            <p className="mt-1 text-right text-xs text-dim">{reportDetails.length}/500</p>
          </div>
          {reportError && <p className="text-sm text-danger">{reportError}</p>}
          <Button onClick={submitReport} disabled={busy === 'report'}>
            {busy === 'report' ? <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Sending…</span> : 'Submit report'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function BackHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="mb-4 flex items-center gap-3">
      <button onClick={() => router.back()} className="rounded-full bg-panel p-2.5 text-dim hover:text-ink" aria-label="Back">
        <IconChevronLeft size={18} />
      </button>
      <h1 className="text-lg font-extrabold">{title}</h1>
    </div>
  );
}
