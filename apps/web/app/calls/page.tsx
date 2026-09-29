
'use client';
// Calls — history list plus the global call overlay (incoming + active).
// Start a call from a chat header via ?start=<conversationId>&type=VOICE|VIDEO.
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar, EmptyState, ErrorState, LoadingScreen } from '@/components/ui';
import { IconPhone, IconVideo, IconChevronLeft, IconPhoneOff } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import CallManager, { type CallType } from '@/components/calls/CallManager';
import { listTime, durationLabel, type ChatUser } from '@/components/chat/chat-utils';

interface CallRecord {
  id: string;
  type?: 'VOICE' | 'VIDEO' | string;
  status?: string;
  direction?: string;
  durationSec?: number | null;
  createdAt: string;
  conversationId?: string | null;
  otherUser?: ChatUser | null;
  user?: ChatUser | null;
  fromUser?: ChatUser | null;
  toUser?: ChatUser | null;
}

function recordPeer(r: CallRecord, meId: string): ChatUser {
  return r.otherUser ?? r.fromUser ?? r.toUser ?? r.user ?? { id: '', username: '', displayName: 'Unknown', avatarUrl: null };
}

function directionOf(r: CallRecord): 'incoming' | 'outgoing' | 'missed' {
  const s = (r.status ?? '').toUpperCase();
  if (s.includes('MISS') || s === 'REJECTED' || s === 'DECLINED') return 'missed';
  const d = (r.direction ?? '').toUpperCase();
  return d === 'INCOMING' ? 'incoming' : 'outgoing';
}

function CallsInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const startConv = searchParams.get('start');
  const startType = (searchParams.get('type')?.toUpperCase() === 'VIDEO' ? 'VIDEO' : 'VOICE') as CallType;

  const [history, setHistory] = useState<CallRecord[]>([]);
  const [loadingH, setLoadingH] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const load = useCallback(async () => {
    setLoadingH(true);
    setError(null);
    try {
      const h = await api.callHistory();
      setHistory(Array.isArray(h) ? h : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load call history');
    } finally {
      setLoadingH(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const clearStart = useCallback(() => {
    router.replace('/calls');
    void load();
  }, [router, load]);

  const redial = (r: CallRecord) => {
    sounds.tap();
    const peer = recordPeer(r, user?.id ?? '');
    if (r.conversationId) {
      router.push(`/calls?start=${r.conversationId}&type=${r.type === 'VIDEO' ? 'VIDEO' : 'VOICE'}`);
    } else if (peer.id) {
      // No conversation on the record — open (or create) a DM thread, then call.
      api.createConversation({ type: 'DIRECT', userIds: [peer.id] })
        .then((c) => router.push(`/chat/${c.id}?call=${r.type === 'VIDEO' ? 'video' : 'voice'}`))
        .catch(() => sounds.error());
    }
  };

  if (loading) return <LoadingScreen label="Opening calls…" />;
  if (!user) return null;

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      <CallManager meId={user.id}
        outgoing={startConv ? { conversationId: startConv, type: startType } : null}
        onDone={clearStart} />

      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-void/90 px-3 pb-3 pt-5 backdrop-blur-lg">
        <button onClick={() => router.back()} aria-label="Back"
          className="rounded-full p-2 text-dim transition hover:text-ink active:scale-95">
          <IconChevronLeft size={22} />
        </button>
        <h1 className="bg-gradient-to-r from-vio to-cy bg-clip-text text-2xl font-extrabold text-transparent">Calls</h1>
      </header>

      <main className="px-2 py-2">
        {loadingH ? (
          <LoadingScreen label="Loading call history…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : history.length === 0 ? (
          <EmptyState
            title="No calls yet"
            hint="Voice and video calls you make or receive will appear here. Start one from any chat."
          />
        ) : (
          <ul className="space-y-1">
            {history.map((r) => {
              const peer = recordPeer(r, user.id);
              const dir = directionOf(r);
              const isVideo = (r.type ?? '').toUpperCase() === 'VIDEO';
              return (
                <li key={r.id}>
                  <button onClick={() => redial(r)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-panel active:bg-panel2">
                    <Avatar src={peer.avatarUrl} name={peer.displayName} size={50} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[15px] font-bold ${dir === 'missed' ? 'text-danger' : ''}`}>
                        {peer.displayName}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-dim">
                        {dir === 'missed' ? (
                          <IconPhoneOff size={13} className="text-danger" />
                        ) : dir === 'incoming' ? (
                          <span className="inline-block rotate-[135deg]"><IconPhone size={13} className="text-[#2ED573]" /></span>
                        ) : (
                          <span className="inline-block -rotate-45"><IconPhone size={13} className="text-cy" /></span>
                        )}
                        <span className="capitalize">{dir}</span>
                        <span>·</span>
                        <span>{isVideo ? 'Video' : 'Voice'}</span>
                        {dir !== 'missed' && r.durationSec != null && r.durationSec > 0 && (
                          <><span>·</span><span>{durationLabel(r.durationSec)}</span></>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-dim">{listTime(r.createdAt)}</span>
                    <span className="rounded-full bg-panel2 p-2.5 text-vio">
                      {isVideo ? <IconVideo size={18} /> : <IconPhone size={18} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<LoadingScreen label="Opening calls…" />}>
      <CallsInner />
    </Suspense>
  );
}
