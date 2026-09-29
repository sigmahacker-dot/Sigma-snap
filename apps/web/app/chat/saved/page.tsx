'use client';
// Saved messages — everything the user bookmarked across chats.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SavedMessage } from '@sigma-snap/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar, EmptyState, ErrorState, LoadingScreen } from '@/components/ui';
import { IconChevronLeft, IconBookmark, IconBookmarkFill, IconTrash } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { messageSnippet } from '@/components/chat/chat-utils';

export default function SavedMessagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<SavedMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const load = useCallback(async () => {
    setLoadingList(true); setError(null);
    try { setItems(await api.savedMessages()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load saved messages'); }
    finally { setLoadingList(false); }
  }, []);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const unsave = (id: string, messageId: string) => {
    sounds.tap();
    setItems((prev) => prev.filter((s) => s.id !== id));
    api.unsaveMessage(messageId).catch(() => { sounds.error(); void load(); });
  };

  if (loading) return <LoadingScreen label="Opening saved messages…" />;
  if (!user) return null;

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-void/90 px-2 pb-3 pt-4 backdrop-blur-lg">
        <div className="flex items-center gap-1">
          <button onClick={() => router.back()} aria-label="Back"
            className="rounded-full p-2 text-dim transition hover:text-ink active:scale-95">
            <IconChevronLeft size={22} />
          </button>
          <h1 className="flex items-center gap-2 text-xl font-extrabold">
            <IconBookmarkFill size={20} className="text-vio" /> Saved messages
          </h1>
        </div>
      </header>

      <main className="px-3 py-3">
        {loadingList ? (
          <LoadingScreen label="Loading saved messages…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            hint="Long-press any message and tap Save to keep it here — it stays even after refresh."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((s) => {
              const m = s.message;
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-3">
                  <Avatar src={m.sender?.avatarUrl} name={m.sender?.displayName ?? 'User'} size={40} />
                  <Link href={`/chat/${m.conversationId}`} onClick={() => sounds.tap()} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{m.sender?.displayName ?? 'User'}</p>
                    <p className="truncate text-[13px] text-dim">{messageSnippet(m)}</p>
                    <p className="mt-0.5 text-[11px] text-dim">
                      {m.conversation?.type === 'GROUP' && m.conversation.title ? `${m.conversation.title} · ` : ''}
                      {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </Link>
                  <button onClick={() => unsave(s.id, m.id)} aria-label="Remove bookmark"
                    className="shrink-0 rounded-full p-2 text-dim transition hover:text-danger active:scale-95">
                    <IconTrash size={17} />
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
