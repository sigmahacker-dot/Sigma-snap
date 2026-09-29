'use client';
// FRIENDS — list, requests, suggestions, search, blocked.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Avatar, Button, Input, EmptyState, ErrorState, LoadingScreen, BottomSheet, Tabs, Spinner, Badge,
} from '@/components/ui';
import {
  IconChat, IconSearch, IconUserPlus, IconCheck, IconX, IconTrash, IconChevronLeft, IconBlock, IconShield,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { UserRow } from '@/components/friends/UserRow';
import type { User } from '@sigma-snap/shared';

type Tab = 'friends' | 'requests' | 'suggestions' | 'blocked';

interface FriendRequest {
  id: string;
  fromUser?: User | null;
  toUser?: User | null;
  createdAt?: string;
}

function errMsg(e: unknown): string {
  return e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Something went wrong';
}

export default function FriendsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('friends');
  const [banner, setBanner] = useState('');

  // friends
  const [friends, setFriends] = useState<User[]>([]);
  const [friendsState, setFriendsState] = useState<'loading' | 'error' | 'ready'>('loading');
  // requests
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [reqState, setReqState] = useState<'loading' | 'error' | 'ready'>('loading');
  // suggestions
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [sugState, setSugState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [reqSent, setReqSent] = useState<Set<string>>(new Set());
  // blocked
  const [blocked, setBlocked] = useState<User[]>([]);
  const [blockedState, setBlockedState] = useState<'loading' | 'error' | 'ready'>('loading');
  // search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<User | null>(null);
  const [confirmUnblock, setConfirmUnblock] = useState<User | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  useEffect(() => {
    try {
      const t = localStorage.getItem('sigmasnap.theme');
      if (t === 'light') document.documentElement.dataset.theme = 'light';
    } catch { /* noop */ }
  }, []);

  const loadFriends = async () => {
    setFriendsState('loading'); setBanner('');
    try { setFriends(await api.friends()); setFriendsState('ready'); }
    catch (e) { setFriendsState('error'); setBanner(errMsg(e)); }
  };
  const loadRequests = async () => {
    setReqState('loading'); setBanner('');
    try {
      const [inc, out] = await Promise.all([api.friendRequests('incoming'), api.friendRequests('outgoing')]);
      setIncoming(inc as FriendRequest[]); setOutgoing(out as FriendRequest[]);
      setReqState('ready');
    } catch (e) { setReqState('error'); setBanner(errMsg(e)); }
  };
  const loadSuggestions = async () => {
    setSugState('loading'); setBanner('');
    try { setSuggestions(await api.suggestions()); setSugState('ready'); }
    catch (e) { setSugState('error'); setBanner(errMsg(e)); }
  };
  const loadBlocked = async () => {
    setBlockedState('loading'); setBanner('');
    try { setBlocked(await api.blockedList()); setBlockedState('ready'); }
    catch (e) { setBlockedState('error'); setBanner(errMsg(e)); }
  };

  useEffect(() => {
    if (!user) return;
    loadFriends(); loadRequests(); loadSuggestions(); loadBlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // debounced user search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try { setResults(await api.searchUsers(q)); }
      catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  if (loading || !user) return <LoadingScreen label="Loading friends…" />;

  const messageUser = async (target: User) => {
    setBusyId(`msg-${target.id}`); setBanner('');
    try {
      const conv = await api.createConversation({ type: 'DIRECT', userIds: [target.id] });
      sounds.send();
      router.push(`/chat/${conv.id}`);
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusyId(null); }
  };

  const doRemoveFriend = async () => {
    if (!confirmRemove) return;
    const target = confirmRemove;
    setConfirmRemove(null); setBusyId(`rm-${target.id}`);
    const prev = friends;
    setFriends((f) => f.filter((x) => x.id !== target.id));
    try { await api.removeFriend(target.id); sounds.success(); }
    catch (e) { setFriends(prev); setBanner(errMsg(e)); sounds.error(); }
    finally { setBusyId(null); }
  };

  const accept = async (r: FriendRequest) => {
    const prev = incoming;
    setIncoming((l) => l.filter((x) => x.id !== r.id));
    setBusyId(`acc-${r.id}`);
    try { await api.acceptRequest(r.id); sounds.success(); void loadFriends(); }
    catch (e) { setIncoming(prev); setBanner(errMsg(e)); sounds.error(); }
    finally { setBusyId(null); }
  };
  const reject = async (r: FriendRequest) => {
    const prev = incoming;
    setIncoming((l) => l.filter((x) => x.id !== r.id)); // optimistic
    setBusyId(`rej-${r.id}`);
    try { await api.rejectRequest(r.id); sounds.tap(); }
    catch (e) { setIncoming(prev); setBanner(errMsg(e)); sounds.error(); }
    finally { setBusyId(null); }
  };
  const cancelOutgoing = async (r: FriendRequest) => {
    const prev = outgoing;
    setOutgoing((l) => l.filter((x) => x.id !== r.id)); // optimistic
    setBusyId(`can-${r.id}`);
    try { await api.rejectRequest(r.id); sounds.tap(); } // best available cancel path
    catch (e) { setOutgoing(prev); setBanner(errMsg(e)); sounds.error(); }
    finally { setBusyId(null); }
  };

  const followToggle = async (target: User) => {
    const isF = followed.has(target.id);
    setBusyId(`fol-${target.id}`);
    try {
      if (isF) { await api.unfollow(target.id); setFollowed((s) => { const n = new Set(s); n.delete(target.id); return n; }); }
      else { await api.follow(target.id); setFollowed((s) => new Set(s).add(target.id)); sounds.pop(); }
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusyId(null); }
  };

  const sendRequest = async (target: User) => {
    setBusyId(`add-${target.id}`);
    try {
      await api.sendFriendRequest(target.id);
      setReqSent((s) => new Set(s).add(target.id));
      sounds.success();
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusyId(null); }
  };

  const doUnblock = async () => {
    if (!confirmUnblock) return;
    const target = confirmUnblock;
    setConfirmUnblock(null); setBusyId(`ubl-${target.id}`);
    const prev = blocked;
    setBlocked((b) => b.filter((x) => x.id !== target.id));
    try { await api.unblock(target.id); sounds.success(); }
    catch (e) { setBlocked(prev); setBanner(errMsg(e)); sounds.error(); }
    finally { setBusyId(null); }
  };

  const tabBtn = (t: Tab) => { sounds.tap(); setTab(t); setBanner(''); };

  return (
    <div className="animate-fade-up px-4 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/profile" className="rounded-full bg-panel p-2.5 text-dim hover:text-ink" aria-label="Back to profile">
          <IconChevronLeft size={18} />
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">Friends</h1>
        <Badge tone="vio">{friends.length}</Badge>
      </div>

      {banner && (
        <div className="mb-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {banner}
        </div>
      )}

      {/* search */}
      <div className="relative mb-4">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-dim"><IconSearch size={17} /></span>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" className="pl-11" />
      </div>
      {query.trim().length >= 2 && (
        <div className="mb-4 rounded-2xl border border-line bg-panel p-2">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-dim">
            {searching ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}
          </p>
          {results.map((u) => (
            <UserRow key={u.id} user={u} href={`/profile/${u.username}`}
              right={reqSent.has(u.id)
                ? <Badge tone="cy">Sent</Badge>
                : (
                  <Button variant="ghost" className="!px-3 !py-2 text-xs" disabled={busyId === `add-${u.id}`}
                    onClick={(e) => { e.preventDefault(); sendRequest(u); }}>
                    {busyId === `add-${u.id}` ? <Spinner size={14} /> : <span className="flex items-center gap-1"><IconUserPlus size={14} /> Add</span>}
                  </Button>
                )} />
          ))}
          {!searching && results.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-dim">No people found for “{query.trim()}”.</p>
          )}
        </div>
      )}

      <Tabs<Tab>
        tabs={[
          { id: 'friends', label: `Friends (${friends.length})` },
          { id: 'requests', label: `Requests${incoming.length ? ` (${incoming.length})` : ''}` },
          { id: 'suggestions', label: 'Suggestions' },
          { id: 'blocked', label: `Blocked (${blocked.length})` },
        ]}
        active={tab}
        onChange={tabBtn}
      />

      <div className="mt-4 pb-8">
        {tab === 'friends' && (
          friendsState === 'loading' ? <div className="flex justify-center py-12"><Spinner /></div>
          : friendsState === 'error' ? <ErrorState message={banner || 'Could not load friends.'} onRetry={loadFriends} />
          : friends.length === 0 ? <EmptyState title="No friends yet" hint="Find people with the search above or check Suggestions." />
          : (
            <div className="flex flex-col gap-2">
              {friends.map((f) => (
                <UserRow key={f.id} user={f} online={f.isOnline} href={`/profile/${f.username}`}
                  right={(
                    <div className="flex items-center gap-1.5">
                      <button
                        className="rounded-full bg-vio/15 p-2.5 text-vio hover:bg-vio/25 disabled:opacity-40"
                        title="Message" aria-label={`Message ${f.displayName}`}
                        disabled={busyId === `msg-${f.id}`}
                        onClick={(e) => { e.preventDefault(); messageUser(f); }}>
                        {busyId === `msg-${f.id}` ? <Spinner size={16} /> : <IconChat size={16} />}
                      </button>
                      <button
                        className="rounded-full bg-danger/10 p-2.5 text-danger hover:bg-danger/20 disabled:opacity-40"
                        title="Remove friend" aria-label={`Remove ${f.displayName}`}
                        disabled={busyId === `rm-${f.id}`}
                        onClick={(e) => { e.preventDefault(); sounds.tap(); setConfirmRemove(f); }}>
                        <IconTrash size={16} />
                      </button>
                    </div>
                  )} />
              ))}
            </div>
          )
        )}

        {tab === 'requests' && (
          reqState === 'loading' ? <div className="flex justify-center py-12"><Spinner /></div>
          : reqState === 'error' ? <ErrorState message={banner || 'Could not load requests.'} onRetry={loadRequests} />
          : incoming.length === 0 && outgoing.length === 0
            ? <EmptyState title="No pending requests" hint="When someone adds you, it'll show up here." />
            : (
              <div className="flex flex-col gap-5">
                {incoming.length > 0 && (
                  <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Incoming</p>
                    <div className="flex flex-col gap-2">
                      {incoming.map((r) => r.fromUser && (
                        <UserRow key={r.id} user={r.fromUser} href={`/profile/${r.fromUser.username}`}
                          right={(
                            <div className="flex items-center gap-1.5">
                              <button
                                className="rounded-full bg-emerald-400/15 p-2.5 text-emerald-300 hover:bg-emerald-400/25 disabled:opacity-40"
                                title="Accept" aria-label="Accept request" disabled={busyId === `acc-${r.id}`}
                                onClick={(e) => { e.preventDefault(); accept(r); }}>
                                {busyId === `acc-${r.id}` ? <Spinner size={15} /> : <IconCheck size={15} />}
                              </button>
                              <button
                                className="rounded-full bg-danger/10 p-2.5 text-danger hover:bg-danger/20 disabled:opacity-40"
                                title="Reject" aria-label="Reject request" disabled={busyId === `rej-${r.id}`}
                                onClick={(e) => { e.preventDefault(); reject(r); }}>
                                {busyId === `rej-${r.id}` ? <Spinner size={15} /> : <IconX size={15} />}
                              </button>
                            </div>
                          )} />
                      ))}
                    </div>
                  </section>
                )}
                {outgoing.length > 0 && (
                  <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Sent by you</p>
                    <div className="flex flex-col gap-2">
                      {outgoing.map((r) => r.toUser && (
                        <UserRow key={r.id} user={r.toUser} href={`/profile/${r.toUser.username}`}
                          right={(
                            <Button variant="ghost" className="!px-3 !py-2 text-xs" disabled={busyId === `can-${r.id}`}
                              onClick={() => cancelOutgoing(r)}>
                              {busyId === `can-${r.id}` ? <Spinner size={14} /> : 'Cancel'}
                            </Button>
                          )} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )
        )}

        {tab === 'suggestions' && (
          sugState === 'loading' ? <div className="flex justify-center py-12"><Spinner /></div>
          : sugState === 'error' ? <ErrorState message={banner || 'Could not load suggestions.'} onRetry={loadSuggestions} />
          : suggestions.length === 0 ? <EmptyState title="No suggestions right now" hint="As you follow people and post, we'll suggest new connections here." />
          : (
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <UserRow key={s.id} user={s} online={s.isOnline} href={`/profile/${s.username}`}
                  right={(
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" className="!px-3 !py-2 text-xs" disabled={busyId === `fol-${s.id}`}
                        onClick={() => followToggle(s)}>
                        {busyId === `fol-${s.id}` ? <Spinner size={14} /> : followed.has(s.id) ? 'Following' : 'Follow'}
                      </Button>
                      {reqSent.has(s.id)
                        ? <Badge tone="cy">Sent</Badge>
                        : (
                          <Button variant="outline" className="!px-3 !py-2 text-xs" disabled={busyId === `add-${s.id}`}
                            onClick={() => sendRequest(s)}>
                            {busyId === `add-${s.id}` ? <Spinner size={14} /> : <span className="flex items-center gap-1"><IconUserPlus size={14} /> Add</span>}
                          </Button>
                        )}
                    </div>
                  )} />
              ))}
            </div>
          )
        )}

        {tab === 'blocked' && (
          blockedState === 'loading' ? <div className="flex justify-center py-12"><Spinner /></div>
          : blockedState === 'error' ? <ErrorState message={banner || 'Could not load blocked list.'} onRetry={loadBlocked} />
          : blocked.length === 0 ? (
            <EmptyState title="Nobody blocked" hint="Blocked accounts won't be able to find or message you." />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-xs text-dim"><IconShield size={14} /> These accounts can't see or contact you.</p>
              {blocked.map((b) => (
                <UserRow key={b.id} user={b}
                  right={(
                    <Button variant="ghost" className="!px-3 !py-2 text-xs" disabled={busyId === `ubl-${b.id}`}
                      onClick={() => { sounds.tap(); setConfirmUnblock(b); }}>
                      {busyId === `ubl-${b.id}` ? <Spinner size={14} /> : 'Unblock'}
                    </Button>
                  )} />
              ))}
            </div>
          )
        )}
      </div>

      {/* remove friend confirm */}
      <BottomSheet open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remove friend?">
        {confirmRemove && (
          <div className="flex flex-col items-center gap-4 text-center">
            <Avatar src={confirmRemove.avatarUrl} name={confirmRemove.displayName} size={64} />
            <p className="text-sm text-dim">
              Remove <span className="font-semibold text-ink">{confirmRemove.displayName}</span> (@{confirmRemove.username}) from your friends?
              You'll also unfollow each other.
            </p>
            <div className="flex w-full gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmRemove(null)}>Keep</Button>
              <Button variant="danger" className="flex-1" onClick={doRemoveFriend}>Remove</Button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* unblock confirm */}
      <BottomSheet open={!!confirmUnblock} onClose={() => setConfirmUnblock(null)} title="Unblock account?">
        {confirmUnblock && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-panel2 p-4 text-dim"><IconBlock size={26} /></div>
            <p className="text-sm text-dim">
              Unblock <span className="font-semibold text-ink">{confirmUnblock.displayName}</span> (@{confirmUnblock.username})?
              They'll be able to find you and see your public profile again.
            </p>
            <div className="flex w-full gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmUnblock(null)}>Cancel</Button>
              <Button className="flex-1" onClick={doUnblock}>Unblock</Button>
            </div>
          </div>
        )}
      </BottomSheet>

    </div>
  );
}
