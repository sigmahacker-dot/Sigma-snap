'use client';
// Paginated user list inside a BottomSheet (followers / following / friends).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BottomSheet, EmptyState, ErrorState, Spinner, Button } from '@/components/ui';
import { UserRow } from '@/components/friends/UserRow';
import { sounds } from '@/lib/sounds';
import type { Page, User } from '@sigma-snap/shared';

export function UserListSheet({
  open, onClose, title, loader,
}: {
  open: boolean; onClose: () => void; title: string;
  loader: (cursor?: string) => Promise<Page<User>>;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setUsers([]); setCursor(null); setError(''); setLoading(true);
    let live = true;
    loader()
      .then((p) => { if (!live) return; setUsers(p.data); setCursor(p.page.nextCursor); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadMore = async () => {
    if (!cursor || moreLoading) return;
    setMoreLoading(true); setError('');
    try {
      const p = await loader(cursor);
      setUsers((u) => [...u, ...p.data]);
      setCursor(p.page.nextCursor);
      sounds.tap();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load more');
    } finally { setMoreLoading(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : error && users.length === 0 ? (
        <ErrorState message={error} onRetry={() => { setLoading(true); setError(''); loader().then((p) => { setUsers(p.data); setCursor(p.page.nextCursor); }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false)); }} />
      ) : users.length === 0 ? (
        <EmptyState title="Nobody here yet" hint="This list is empty for now." />
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <Link key={u.id} href={`/profile/${u.username}`} onClick={onClose} className="block">
              <UserRow user={u} online={u.isOnline} />
            </Link>
          ))}
          {cursor && (
            <Button variant="ghost" className="mt-2" onClick={loadMore} disabled={moreLoading}>
              {moreLoading ? <Spinner size={16} /> : 'Load more'}
            </Button>
          )}
          {error && <p className="text-center text-xs text-danger">{error}</p>}
        </div>
      )}
    </BottomSheet>
  );
}
