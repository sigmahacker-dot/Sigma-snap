
'use client';
// Chat — conversation list with realtime updates, presence dots, and new-chat sheet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Conversation, User } from '@sigma-snap/shared';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { Avatar, BottomSheet, EmptyState, ErrorState, LoadingScreen, Tabs, Spinner } from '@/components/ui';
import { IconSearch, IconPlus, IconCheck, IconChevronRight, IconChat, IconBookmark } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import CallManager from '@/components/calls/CallManager';
import { convoTitle, convoAvatar, dmOther, messageSnippet, listTime, isMutedLocal } from '@/components/chat/chat-utils';

interface PresenceMap { [userId: string]: { isOnline: boolean; lastSeenAt?: string | null } }

// (presence fills in live via socket 'presence:update' events)

function GroupAvatar({ c, meId }: { c: Conversation; meId: string }) {
  const others = c.participants.filter((p) => p.userId !== meId).slice(0, 3);
  if (!others.length) return <Avatar src={c.avatarUrl} name={c.title ?? 'G'} size={52} />;
  return (
    <div className="relative h-[52px] w-[52px] shrink-0">
      {others.slice(0, 2).map((p, i) => (
        <div key={p.userId} className="absolute overflow-hidden rounded-full border-2 border-void"
          style={{ width: 34, height: 34, left: i === 0 ? 0 : 18, top: i === 0 ? 0 : 18 }}>
          {p.user.avatarUrl
            ? <img src={p.user.avatarUrl} alt={p.user.displayName} className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-vio to-cy text-[11px] font-bold text-white">
                {p.user.displayName.slice(0, 1).toUpperCase()}
              </div>}
        </div>
      ))}
      {c.participants.length > 3 && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-vio px-1.5 text-[9px] font-bold text-white">
          +{c.participants.length - 2}
        </span>
      )}
    </div>
  );
}

export default function ChatListPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [presence, setPresence] = useState<PresenceMap>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const convosRef = useRef(convos);
  convosRef.current = convos;
  const meId = user?.id ?? '';

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const load = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const list = await api.conversations();
      setConvos(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load conversations');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  // ── realtime ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const socket = connectSocket();

    const bumpConvo = (conversationId: string, msg: any, fromMe: boolean) => {
      setConvos((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) return prev; // unknown convo — refresh list to pick it up
        const next = [...prev];
        const c = { ...next[idx], lastMessage: msg, lastMessageAt: msg.createdAt };
        if (!fromMe && !isMutedLocal(conversationId)) c.unreadCount = (c.unreadCount ?? 0) + 1;
        next.splice(idx, 1);
        next.unshift(c);
        return next;
      });
    };

    const onMessageNew = (p: { message?: any }) => {
      const msg = p.message;
      if (!msg?.conversationId) return;
      const fromMe = msg.senderId === user.id;
      const known = convosRef.current.some((c) => c.id === msg.conversationId);
      if (!known) { void load(); return; }
      bumpConvo(msg.conversationId, msg, fromMe);
      if (!fromMe && !isMutedLocal(msg.conversationId)) sounds.receive();
    };
    const onPresence = (p: { userId: string; isOnline: boolean; lastSeenAt?: string | null }) => {
      if (!p.userId) return;
      setPresence((prev) => ({ ...prev, [p.userId]: { isOnline: p.isOnline, lastSeenAt: p.lastSeenAt } }));
    };
    const onNotification = (p: { notification?: { type?: string; conversationId?: string | null } }) => {
      const n = p.notification;
      // message notifications for conversations we don't know yet → refresh
      if (n?.type === 'MESSAGE' && n.conversationId && !convosRef.current.some((c) => c.id === n.conversationId)) {
        void load();
      }
    };

    socket.on('message:new', onMessageNew);
    socket.on('presence:update', onPresence);
    socket.on('notification:new', onNotification);
    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('presence:update', onPresence);
      socket.off('notification:new', onNotification);
    };
  }, [user, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return convos;
    return convos.filter((c) =>
      convoTitle(c, meId).toLowerCase().includes(q) ||
      messageSnippet(c.lastMessage).toLowerCase().includes(q));
  }, [convos, search, meId]);

  if (loading) return <LoadingScreen label="Opening chat…" />;
  if (!user) return null;

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      <CallManager meId={user.id} />
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-line bg-void/90 px-4 pb-3 pt-5 backdrop-blur-lg">
        <div className="flex items-center justify-between">
          <h1 className="bg-gradient-to-r from-vio to-cy bg-clip-text text-2xl font-extrabold text-transparent">Chats</h1>
          <Link href="/calls" onClick={() => sounds.tap()} aria-label="Call history"
            className="rounded-full bg-panel2 p-2.5 text-dim hover:text-ink">
            <IconChat size={20} />
          </Link>
        </div>
        <div className="relative mt-3">
          <IconSearch size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…"
            className="w-full rounded-2xl border border-line bg-panel2 py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-dim/70 focus:border-vio" />
        </div>
      </header>

      {/* list */}
      <main className="px-2 py-2">
        {!search && (
          <Link href="/chat/saved" onClick={() => sounds.tap()}
            className="mb-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-panel active:bg-panel2">
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-vio/15 text-vio">
              <IconBookmark size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold">Saved messages</p>
              <p className="truncate text-sm text-dim">Your bookmarked messages</p>
            </div>
          </Link>
        )}
        {loadingList ? (
          <LoadingScreen label="Loading conversations…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'No chats match your search' : 'No conversations yet'}
            hint={search ? 'Try a different name or message.' : 'Start a chat with a friend — messages, voice notes and calls live here.'}
            action={!search ? (
              <button onClick={() => setSheetOpen(true)}
                className="rounded-2xl bg-gradient-to-r from-vio to-vio-deep px-6 py-3 text-sm font-bold text-white shadow-glow">
                Start chatting
              </button>
            ) : undefined}
          />
        ) : (
          <ul className="space-y-1">
            {filtered.map((c) => {
              const title = convoTitle(c, meId);
              const other = c.type === 'DIRECT' ? dmOther(c, meId) : undefined;
              const pres = other ? presence[other.userId] : undefined;
              const online = !!pres?.isOnline;
              const last = c.lastMessage;
              const snippet = last ? `${last.senderId === user.id ? 'You: ' : ''}${messageSnippet(last)}` : 'No messages yet';
              return (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} onClick={() => sounds.tap()}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-panel active:bg-panel2">
                    <div className="relative">
                      {c.type === 'GROUP'
                        ? <GroupAvatar c={c} meId={meId} />
                        : <Avatar src={convoAvatar(c, meId)} name={title} size={52} />}
                      {c.type === 'DIRECT' && online && (
                        <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-void bg-[#2ED573]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[15px] font-bold">{title}</p>
                        <span className="shrink-0 text-[11px] text-dim">{listTime(last?.createdAt ?? c.lastMessageAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1 truncate text-sm text-dim">
                          {last && last.senderId === user.id && !last.isDeleted && (
                            <IconCheck size={14} className="shrink-0 text-cy" />
                          )}
                          <span className="truncate">{snippet}</span>
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-vio px-1.5 text-[11px] font-bold text-white">
                            {c.unreadCount > 99 ? '99+' : c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* new chat FAB */}
      <button onClick={() => { setSheetOpen(true); sounds.tap(); }} aria-label="New chat"
        className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-gradient-to-r from-vio to-vio-deep p-4 text-white shadow-glow transition active:scale-95"
        style={{ marginLeft: 140 }}>
        <IconPlus size={24} />
      </button>

      <NewChatSheet open={sheetOpen} onClose={() => setSheetOpen(false)}
        onCreated={(id) => { setSheetOpen(false); void load(); router.push(`/chat/${id}`); }} />
    </div>
  );
}

function NewChatSheet({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [tab, setTab] = useState<'friends' | 'group'>('friends');
  const [friends, setFriends] = useState<User[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('friends'); setSelected([]); setTitle(''); setErr(null);
    setLoadingFriends(true);
    api.friends().then(setFriends).catch(() => setFriends([])).finally(() => setLoadingFriends(false));
  }, [open ]);

  const toggle = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const create = async () => {
    setCreating(true); setErr(null);
    try {
      if (tab === 'friends') {
        const id = selected[0];
        const c = await api.createConversation({ type: 'DIRECT', userIds: [id] });
        onCreated(c.id);
      } else {
        if (selected.length === 0) throw new Error('Pick at least one friend');
        const c = await api.createConversation({
          type: 'GROUP', userIds: selected, title: title.trim() || 'Group chat',
        });
        onCreated(c.id);
      }
      sounds.success();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create conversation');
      sounds.error();
    } finally { setCreating(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="New chat">
      <Tabs tabs={[{ id: 'friends', label: 'Friends' }, { id: 'group', label: 'New group' }]}
        active={tab} onChange={(t) => { setTab(t); setSelected([]); setErr(null); }} />
      <div className="mt-4 max-h-72 overflow-y-auto">
        {loadingFriends ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : friends.length === 0 ? (
          <EmptyState title="No friends yet" hint="Add friends to start chatting with them." />
        ) : (
          <ul className="space-y-1">
            {friends.map((f) => {
              const sel = selected.includes(f.id);
              return (
                <li key={f.id}>
                  <button
                    onClick={() => {
                      if (tab === 'friends') { setSelected([f.id]); void create(); }
                      else toggle(f.id);
                      sounds.tap();
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-panel2 ${sel ? 'bg-vio/10 ring-1 ring-vio' : ''}`}>
                    <Avatar src={f.avatarUrl} name={f.displayName} size={44} />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-bold">{f.displayName}</p>
                      <p className="truncate text-xs text-dim">@{f.username}</p>
                    </div>
                    {tab === 'group' && (
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${sel ? 'border-vio bg-vio text-white' : 'border-line text-transparent'}`}>
                        <IconCheck size={14} strokeWidth={3} />
                      </span>
                    )}
                    {tab === 'friends' && <IconChevronRight size={16} className="text-dim" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {tab === 'group' && (
        <div className="mt-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Group name…"
            className="w-full rounded-2xl border border-line bg-panel2 px-4 py-3 text-sm outline-none placeholder:text-dim/70 focus:border-vio" />
          <button onClick={() => void create()} disabled={creating || selected.length === 0}
            className="w-full rounded-2xl bg-gradient-to-r from-vio to-vio-deep py-3 text-sm font-bold text-white shadow-glow disabled:opacity-40">
            {creating ? 'Creating…' : `Create group${selected.length ? ` (${selected.length})` : ''}`}
          </button>
        </div>
      )}
      {err && <p className="mt-3 text-center text-sm text-danger">{err}</p>}
    </BottomSheet>
  );
}
