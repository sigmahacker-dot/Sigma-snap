'use client';
// Admin → Content: moderate posts, stories, comments — delete / feature.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EmptyState, Spinner, Tabs, Badge, Input } from '@/components/ui';
import { IconSearch, IconTrash, IconStar, IconVideo, IconStories, IconComment } from '@/lib/icons';
import { ConfirmSheet, SectionHead, Row, fmtDate, errMsg, type NotifyFn } from './common';

type CType = 'posts' | 'stories' | 'comments';

interface Item {
  id: string; caption?: string | null; text?: string | null; createdAt?: string;
  user?: { username?: string } | null; isFeatured?: boolean; featured?: boolean;
  likeCount?: number; viewCount?: number; reportCount?: number;
}

export default function Content({ notify }: { notify: NotifyFn }) {
  const [type, setType] = useState<CType>('posts');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);
  const [del, setDel] = useState<Item | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async (t: CType, query: string) => {
    setBusy(true);
    try {
      const page = await api.adminContent(t, query || undefined);
      setItems((page?.data ?? []) as Item[]);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);

  useEffect(() => { void load(type, ''); setQ(''); }, [type, load]);

  const summary = (it: Item) => it.caption ?? it.text ?? '(no text)';

  const doDelete = async () => {
    if (!del) return;
    setWorking(del.id);
    try {
      await api.adminDeleteContent(type, del.id);
      notify('Content deleted.');
      setDel(null);
      void load(type, q);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setWorking(null); }
  };

  const toggleFeature = async (it: Item) => {
    setWorking(it.id);
    try {
      await api.adminFeatureContent(type, it.id);
      notify('Feature flag updated.');
      void load(type, q);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setWorking(null); }
  };

  const typeIcon = (t: CType) => t === 'posts' ? <IconVideo size={14} /> : t === 'stories' ? <IconStories size={14} /> : <IconComment size={14} />;

  return (
    <div>
      <SectionHead title="Content moderation" hint="Delete or feature platform content" />
      <Tabs
        tabs={[{ id: 'posts', label: 'Posts' }, { id: 'stories', label: 'Stories' }, { id: 'comments', label: 'Comments' }]}
        active={type} onChange={setType}
      />
      <form className="mb-3 mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void load(type, q); }}>
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dim"><IconSearch size={15} /></span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${type}…`} className="pl-9" />
        </div>
        <button type="submit" className="rounded-2xl bg-vio px-4 text-sm font-bold text-white" disabled={busy}>
          {busy ? <Spinner size={15} /> : 'Go'}
        </button>
      </form>

      {busy ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState title={`No ${type}`} hint="Try a different search." />
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const featured = Boolean(it.isFeatured ?? it.featured);
            return (
              <Row key={it.id}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-dim">
                    {typeIcon(type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-ink">@{it.user?.username ?? 'unknown'}</p>
                      {featured && <Badge tone="gold"><span className="flex items-center gap-1"><IconStar size={10} /> Featured</span></Badge>}
                      {typeof it.reportCount === 'number' && it.reportCount > 0 && <Badge tone="danger">{it.reportCount} reports</Badge>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-dim">{summary(it)}</p>
                    <p className="mt-0.5 text-[11px] text-dim/70">
                      {fmtDate(it.createdAt)}
                      {typeof it.viewCount === 'number' ? ` · ${it.viewCount} views` : ''}
                      {typeof it.likeCount === 'number' ? ` · ${it.likeCount} likes` : ''}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  <button disabled={working === it.id} onClick={() => toggleFeature(it)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold/10 px-2 py-2 text-xs font-bold text-gold hover:bg-gold/20 disabled:opacity-40">
                    {working === it.id ? <Spinner size={13} /> : <IconStar size={13} />}
                    {featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button onClick={() => setDel(it)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-danger/10 px-2 py-2 text-xs font-bold text-danger hover:bg-danger/20">
                    <IconTrash size={13} /> Delete
                  </button>
                </div>
              </Row>
            );
          })}
        </div>
      )}

      <ConfirmSheet
        open={!!del}
        onClose={() => setDel(null)}
        title={`Delete this ${type.slice(0, -1)}?`}
        body={`“${del ? summary(del).slice(0, 120) : ''}” will be permanently removed. This can't be undone.`}
        confirmLabel="Delete"
        danger
        busy={working === del?.id}
        onConfirm={doDelete}
      />
    </div>
  );
}
