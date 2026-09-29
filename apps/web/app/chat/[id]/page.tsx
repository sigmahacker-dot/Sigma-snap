
'use client';
// Chat thread: paginated history, realtime messages, typing, read receipts,
// replies/reactions/forward/edit/delete, disappearing messages, voice notes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { Conversation, Message } from '@sigma-snap/shared';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { Avatar, BottomSheet, EmptyState, ErrorState, LoadingScreen, Spinner } from '@/components/ui';
import { IconChevronLeft, IconPhone, IconVideo, IconMore } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { useConfig } from '@/lib/config';
import MessageBubble from '@/components/chat/MessageBubble';
import Composer, { type OutgoingMedia } from '@/components/chat/Composer';
import InfoSheet from '@/components/chat/InfoSheet';
import CallManager, { type CallType } from '@/components/calls/CallManager';
import {
  convoTitle, convoAvatar, dmOther, dayDividerLabel, lastSeenLabel, isExpired, isMutedLocal,
} from '@/components/chat/chat-utils';

export default function ThreadPage() {
  const params = useParams();
  const id = params.id as string;
  const searchParams = useSearchParams();
  const callParam = searchParams.get('call'); // 'voice' | 'video'
  const { user, loading } = useAuth();
  const router = useRouter();
  const meId = user?.id ?? '';
  const { flagOn } = useConfig();
  const callsEnabled = flagOn('calls');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]); // oldest → newest
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [online, setOnline] = useState<{ isOnline: boolean; lastSeenAt?: string | null } | null>(null);
  const [tick, setTick] = useState(0); // re-render tick for expiring messages

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const convosRef = useRef<Conversation | null>(null);
  convosRef.current = conversation;
  const meRef = useRef(meId);
  meRef.current = meId;
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // ── load conversation + first page ──────────────────────────────────────
  const loadThread = useCallback(async () => {
    setInitialLoading(true);
    setError(null);
    try {
      const [c, page] = await Promise.all([api.getConversation(id), api.messages(id)]);
      setConversation(c);
      const asc = [...page.data].reverse().filter((m) => !isExpired(m));
      setMessages(asc);
      setCursor(page.page.nextCursor);
      setHasMore(!!page.page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load conversation');
    } finally {
      setInitialLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user) void loadThread();
  }, [user, loadThread]);

  // DM online status seed (presence events keep it fresh)
  useEffect(() => {
    if (!conversation || conversation.type !== 'DIRECT' || !user) return;
    const other = dmOther(conversation, user.id);
    if (!other) return;
    api.getUser(other.user.username)
      .then((p) => setOnline({ isOnline: p.isOnline, lastSeenAt: p.lastSeenAt }))
      .catch(() => {});
  }, [conversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expiry tick + conversation refresh (receipts, members, timer)
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      setTick((x) => x + 1);
      api.getConversation(id).then(setConversation).catch(() => {});
    }, 20000);
    const e = setInterval(() => setTick((x) => x + 1), 30000);
    return () => { clearInterval(t); clearInterval(e); };
  }, [user, id]);

  // ── scroll helpers ──────────────────────────────────────────────────────
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const nearBottom = () => {
    const el = scrollRef.current;
    return el ? el.scrollHeight - el.scrollTop - el.clientHeight < 160 : true;
  };

  useEffect(() => {
    if (!initialLoading && messages.length) {
      const t = setTimeout(() => scrollToBottom(false), 60);
      return () => clearTimeout(t);
    }
  }, [initialLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevH = el?.scrollHeight ?? 0;
    try {
      const page = await api.messages(id, cursor);
      const older = [...page.data].reverse().filter((m) => !isExpired(m));
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !ids.has(m.id)), ...prev];
      });
      setCursor(page.page.nextCursor);
      setHasMore(!!page.page.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevH;
      });
    } catch { /* keep old messages */ } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, cursor, id]);

  const onScroll = () => {
    if (scrollRef.current && scrollRef.current.scrollTop < 90) void loadOlder();
  };

  // ── read receipts ───────────────────────────────────────────────────────
  const markLatestRead = useCallback((latestId?: string) => {
    if (!latestId) return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      api.markRead(id, latestId).catch(() => {});
      connectSocket().emit('message:read', { conversationId: id, messageId: latestId });
    }, 600);
  }, [id]);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest && latest.senderId !== meRef.current && !initialLoading) markLatestRead(latest.id);
  }, [messages.length, initialLoading, markLatestRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── socket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const socket = connectSocket();
    socket.emit('conversation:join', { conversationId: id });

    const onNew = (p: { message?: Message }) => {
      const msg = p.message;
      if (!msg || msg.conversationId !== id || isExpired(msg)) return;
      const wasBottom = nearBottom();
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        // replace optimistic twin
        const tmpIdx = prev.findIndex((m) => m.id.startsWith('tmp-') && m.senderId === msg.senderId &&
          Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 30000);
        if (tmpIdx >= 0) {
          const next = [...prev];
          next[tmpIdx] = msg;
          return next;
        }
        return [...prev, msg];
      });
      if (msg.senderId !== user.id) {
        if (wasBottom) setTimeout(() => scrollToBottom(true), 50);
        if (!isMutedLocal(id)) sounds.receive();
        markLatestRead(msg.id);
      }
    };
    const onUpdated = (p: { message?: Message }) => {
      const msg = p.message;
      if (!msg || msg.conversationId !== id) return;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
    };
    const onDeleted = (p: { messageId?: string; conversationId?: string }) => {
      if (p.conversationId !== id || !p.messageId) return;
      setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, isDeleted: true, text: null } : m)));
    };
    const onTyping = (p: { conversationId?: string; userId?: string; typing?: boolean }) => {
      if (p.conversationId !== id || !p.userId || p.userId === user.id) return;
      setTypingUsers((prev) => {
        const has = prev.includes(p.userId!);
        if (p.typing && !has) return [...prev, p.userId!];
        if (!p.typing && has) return prev.filter((u) => u !== p.userId);
        return prev;
      });
      if (p.typing) {
        setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u !== p.userId)), 4000);
      }
    };
    const onPresence = (p: { userId: string; isOnline: boolean; lastSeenAt?: string | null }) => {
      const other = convosRef.current?.type === 'DIRECT' ? dmOther(convosRef.current, meRef.current) : undefined;
      if (other && p.userId === other.userId) setOnline({ isOnline: p.isOnline, lastSeenAt: p.lastSeenAt });
    };

    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    socket.on('typing:update', onTyping);
    socket.on('presence:update', onPresence);
    return () => {
      socket.emit('conversation:leave', { conversationId: id });
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('typing:update', onTyping);
      socket.off('presence:update', onPresence);
    };
  }, [user, id, markLatestRead, scrollToBottom]);

  // ── sending ─────────────────────────────────────────────────────────────
  const expiresAtForNew = () => {
    const sec = conversation?.disappearingAfterSec ?? 0;
    return sec > 0 ? new Date(Date.now() + sec * 1000).toISOString() : undefined;
  };

  const pushOptimistic = (partial: Partial<Message> & { type: Message['type']; text?: string | null }): Message => {
    const tmp: Message = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      conversationId: id,
      senderId: meRef.current,
      sender: user ? { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl } : undefined,
      type: partial.type,
      text: partial.text ?? null,
      replyToId: replyTo?.id ?? null,
      attachments: [],
      reactions: [],
      expiresAt: expiresAtForNew() ?? null,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tmp]);
    setTimeout(() => scrollToBottom(true), 50);
    return tmp;
  };

  const doSend = useCallback(async (body: { type: string; text?: string; attachmentIds?: string[]; replyToId?: string; expiresAt?: string }, tmpId?: string) => {
    try {
      const saved = await api.sendMessage(id, body);
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? saved : m)));
      sounds.send();
    } catch {
      sounds.error();
      if (tmpId) setMessages((prev) => prev.filter((m) => m.id !== tmpId));
    }
  }, [id]);

  const sendText = (text: string) => {
    const tmp = pushOptimistic({ type: 'TEXT', text });
    setReplyTo(null);
    void doSend({
      type: 'TEXT', text,
      replyToId: tmp.replyToId ?? undefined,
      expiresAt: expiresAtForNew(),
    }, tmp.id);
  };

  const sendMedia = async ({ file, kind }: OutgoingMedia) => {
    const tmp = pushOptimistic({ type: kind, text: file.name });
    setReplyTo(null);
    try {
      const asset = await api.uploadFile(kind === 'IMAGE' ? 'PHOTO' : 'VIDEO', file);
      await doSend({
        type: kind, attachmentIds: [asset.id],
        replyToId: tmp.replyToId ?? undefined,
        expiresAt: expiresAtForNew(),
      }, tmp.id);
    } catch {
      sounds.error();
      setMessages((prev) => prev.filter((m) => m.id !== tmp.id));
    }
  };

  const sendSticker = (stickerId: string) => {
    const tmp = pushOptimistic({ type: 'STICKER', text: stickerId });
    setReplyTo(null);
    sounds.send();
    void doSend({
      type: 'STICKER', text: stickerId,
      replyToId: tmp.replyToId ?? undefined,
      expiresAt: expiresAtForNew(),
    }, tmp.id);
  };

  const sendVoice = async (blob: Blob, _durationSec: number) => {
    const tmp = pushOptimistic({ type: 'VOICE', text: null });
    setReplyTo(null);
    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
      const asset = await api.uploadFile('AUDIO', file);
      await doSend({
        type: 'VOICE', attachmentIds: [asset.id],
        replyToId: tmp.replyToId ?? undefined,
        expiresAt: expiresAtForNew(),
      }, tmp.id);
    } catch {
      sounds.error();
      setMessages((prev) => prev.filter((m) => m.id !== tmp.id));
    }
  };

  const saveEdit = (text: string) => {
    if (!editing) return;
    const target = editing;
    setEditing(null);
    api.editMessage(target.id, text)
      .then((updated) => setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, ...updated } : m))))
      .catch(() => sounds.error());
  };

  // ── message actions ─────────────────────────────────────────────────────
  const react = (m: Message, emoji: string) => {
    const mine = m.reactions.find((r) => r.userId === meId);
    const next = mine?.emoji === emoji
      ? m.reactions.filter((r) => !(r.userId === meId && r.emoji === emoji))
      : [...m.reactions.filter((r) => r.userId !== meId), { userId: meId, emoji }];
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: next } : x)));
    api.reactMessage(m.id, emoji).catch(() => {});
  };

  const del = (m: Message) => {
    api.deleteMessage(m.id)
      .then(() => setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, isDeleted: true, text: null } : x))))
      .catch(() => sounds.error());
  };

  // ── saved messages ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    api.savedMessages()
      .then((list) => setSavedIds(new Set(list.map((s) => s.messageId))))
      .catch(() => {});
  }, [user]);

  const toggleSave = (m: Message) => {
    const isSaved = savedIds.has(m.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(m.id); else next.add(m.id);
      return next;
    });
    (isSaved ? api.unsaveMessage(m.id) : api.saveMessage(m.id)).catch(() => {
      sounds.error();
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(m.id); else next.delete(m.id);
        return next;
      });
    });
  };

  const copyText = (m: Message) => {
    if (!m.text) return;
    navigator.clipboard?.writeText(m.text).catch(() => {});
    sounds.pop();
  };

  const downloadMedia = async (m: Message) => {
    const url = m.attachments[0]?.url;
    if (!url) return;
    sounds.tap();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const ext = m.type === 'IMAGE' ? 'jpg' : m.type === 'VIDEO' ? 'mp4' : 'ogg';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sigmasnap-${m.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      sounds.error();
    }
  };

  const onTyping = (typing: boolean) => {
    connectSocket().emit(typing ? 'typing:start' : 'typing:stop', { conversationId: id });
  };

  // ── derived ─────────────────────────────────────────────────────────────
  const visible = useMemo(() => messages.filter((m) => !isExpired(m)), [messages, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(visible.map((m) => [m.id, m])), [visible]);
  const other = conversation && user ? (conversation.type === 'DIRECT' ? dmOther(conversation, user.id) : undefined) : undefined;
  const title = conversation && user ? convoTitle(conversation, user.id) : 'Chat';
  const statusLine = useMemo(() => {
    if (!conversation) return '';
    if (conversation.type === 'GROUP') {
      if (typingUsers.length) return typingNames();
      return `${conversation.participants.length} members`;
    }
    if (typingUsers.length) return typingNames();
    return online ? lastSeenLabel(online.isOnline, online.lastSeenAt) : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, typingUsers, online]);

  function typingNames(): string {
    const names = typingUsers.map((uid) => {
      const p = conversation?.participants.find((x) => x.userId === uid);
      return p?.user.displayName.split(' ')[0] ?? 'Someone';
    });
    return `${names.slice(0, 2).join(', ')} is typing…`;
  }

  const readByAll = useCallback((m: Message): boolean => {
    const c = convosRef.current;
    if (!c) return false;
    return c.participants
      .filter((p) => p.userId !== meRef.current)
      .every((p) => p.lastReadAt && new Date(p.lastReadAt).getTime() >= new Date(m.createdAt).getTime());
  }, []);

  const startCall = (t: 'voice' | 'video') => {
    sounds.tap();
    router.push(`/chat/${id}?call=${t}`);
  };

  if (loading) return <LoadingScreen label="Opening chat…" />;
  if (!user) return null;

  const callType: CallType | null = callParam === 'video' ? 'VIDEO' : callParam === 'voice' ? 'VOICE' : null;

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-void">
      <CallManager meId={user.id}
        outgoing={callType ? { conversationId: id, userId: other?.userId, type: callType } : null}
        onDone={() => router.replace(`/chat/${id}`)} />

      {/* header */}
      <header className="z-30 border-b border-line bg-void/95 px-2 pb-2 pt-4 backdrop-blur-lg">
        <div className="flex items-center gap-1">
          <button onClick={() => router.back()} aria-label="Back"
            className="rounded-full p-2 text-dim transition hover:text-ink active:scale-95">
            <IconChevronLeft size={22} />
          </button>
          {conversation && (
            <button onClick={() => setInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl p-1 text-left">
              <div className="relative">
                <Avatar src={conversation.type === 'GROUP' ? conversation.avatarUrl : convoAvatar(conversation, user.id)} name={title} size={42} />
                {conversation.type === 'DIRECT' && online?.isOnline && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-void bg-[#2ED573]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{title}</p>
                <p className={`truncate text-xs ${typingUsers.length ? 'font-semibold text-vio' : 'text-dim'}`}>
                  {statusLine || ' '}
                </p>
              </div>
            </button>
          )}
          {callsEnabled && (
            <button onClick={() => startCall('voice')} aria-label="Voice call"
              className="rounded-full p-2.5 text-dim transition hover:text-ink active:scale-95">
              <IconPhone size={20} />
            </button>
          )}
          {callsEnabled && (
            <button onClick={() => startCall('video')} aria-label="Video call"
              className="rounded-full p-2.5 text-dim transition hover:text-ink active:scale-95">
              <IconVideo size={21} />
            </button>
          )}
          <button onClick={() => setInfoOpen(true)} aria-label="Chat info"
            className="rounded-full p-2.5 text-dim transition hover:text-ink active:scale-95">
            <IconMore size={20} />
          </button>
        </div>
      </header>

      {/* messages */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-3">
        {initialLoading ? (
          <LoadingScreen label="Loading messages…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void loadThread()} />
        ) : visible.length === 0 ? (
          <EmptyState title="No messages yet" hint="Say hello — messages disappear here only if you enable the timer." />
        ) : (
          <div className="space-y-2.5">
            {loadingMore && (
              <div className="flex justify-center py-2"><Spinner size={18} /></div>
            )}
            {visible.map((m, i) => {
              const prev = visible[i - 1];
              const showDay = !prev || dayDividerLabel(prev.createdAt) !== dayDividerLabel(m.createdAt);
              return (
                <React.Fragment key={m.id}>
                  {showDay && (
                    <div className="flex justify-center py-1">
                      <span className="rounded-full bg-panel2 px-3 py-1 text-[11px] font-semibold text-dim">
                        {dayDividerLabel(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    meId={user.id}
                    isGroup={conversation?.type === 'GROUP'}
                    readByAll={m.senderId === user.id && !m.id.startsWith('tmp-') ? readByAll(m) : false}
                    replyTo={m.replyToId ? byId.get(m.replyToId) ?? m.replyTo ?? null : null}
                    disappearingAfterSec={conversation?.disappearingAfterSec ?? 0}
                    saved={savedIds.has(m.id)}
                    onReact={react}
                    onReply={(msg) => { setReplyTo(msg); setEditing(null); }}
                    onForward={(msg) => setForwardMsg(msg)}
                    onEdit={(msg) => { setEditing(msg); setReplyTo(null); }}
                    onDelete={del}
                    onSave={toggleSave}
                    onCopy={copyText}
                    onDownload={(msg) => void downloadMedia(msg)}
                  />
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* composer */}
      <footer className="border-t border-line bg-void/95 py-2 backdrop-blur-lg" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <Composer
          replyTo={replyTo}
          editing={editing}
          onSendText={sendText}
          onSendMedia={(m) => void sendMedia(m)}
          onSendSticker={sendSticker}
          onSendVoice={(b, d) => void sendVoice(b, d)}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditing(null)}
          onClearReply={() => setReplyTo(null)}
          onTyping={onTyping}
        />
      </footer>

      {/* info sheet */}
      {conversation && (
        <InfoSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          conversation={conversation}
          meId={user.id}
          onUpdated={setConversation}
          onLeft={() => router.replace('/chat')}
          onBlocked={() => router.replace('/chat')}
        />
      )}

      {/* forward sheet */}
      <ForwardSheet
        open={!!forwardMsg}
        onClose={() => setForwardMsg(null)}
        meId={user.id}
        onPick={(convId) => {
          if (!forwardMsg) return;
          const msg = forwardMsg;
          setForwardMsg(null);
          api.forwardMessage(msg.id, convId)
            .then(() => { sounds.success(); router.push(`/chat/${convId}`); })
            .catch(() => sounds.error());
        }}
      />
    </div>
  );
}

function ForwardSheet({ open, onClose, meId, onPick }: {
  open: boolean; onClose: () => void; meId: string; onPick: (conversationId: string) => void;
}) {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loadingF, setLoadingF] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingF(true);
    api.conversations().then(setConvos).catch(() => setConvos([])).finally(() => setLoadingF(false));
  }, [open ]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Forward to…">
      {loadingF ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {convos.map((c) => (
            <li key={c.id}>
              <button onClick={() => onPick(c.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-panel2">
                <Avatar src={c.type === 'GROUP' ? c.avatarUrl : convoAvatar(c, meId)} name={convoTitle(c, meId)} size={44} />
                <span className="truncate text-sm font-bold">{convoTitle(c, meId)}</span>
              </button>
            </li>
          ))}
          {convos.length === 0 && <p className="py-6 text-center text-sm text-dim">No conversations</p>}
        </ul>
      )}
    </BottomSheet>
  );
}
