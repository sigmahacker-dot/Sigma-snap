'use client';
// Template marketplace — browse original video templates by category.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, ApiException } from '@/lib/api';
import { EmptyState, ErrorState, LoadingScreen, Badge, Tabs } from '@/components/ui';
import { IconTemplate, IconPlay, IconLock, IconMusic } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import type { Template, TemplateCategory } from '@sigma-snap/shared';

const CATS: Array<{ id: TemplateCategory; label: string }> = [
  { id: 'TRENDING', label: 'Trending' },
  { id: 'TRAVEL', label: 'Travel' },
  { id: 'NATURE', label: 'Nature' },
  { id: 'POETRY', label: 'Poetry' },
  { id: 'ISLAMIC', label: 'Islamic' },
  { id: 'MOTIVATION', label: 'Motivation' },
  { id: 'BIRTHDAY', label: 'Birthday' },
  { id: 'WEDDING', label: 'Wedding' },
  { id: 'CINEMATIC', label: 'Cinematic' },
  { id: 'GAMING', label: 'Gaming' },
  { id: 'BUSINESS', label: 'Business' },
  { id: 'MEME', label: 'Meme' },
  { id: 'MUSIC', label: 'Music' },
  { id: 'BEAT_SYNC', label: 'Beat Sync' },
];

function fmtDur(sec?: number | null): string {
  if (!sec) return '—';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;
}
function fmt(n?: number | null): string {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
}

const GRADIENTS = [
  'from-vio/60 to-cy/60', 'from-vio-deep/70 to-vio/50', 'from-cy/50 to-vio/60',
  'from-gold/50 to-vio/60', 'from-vio/50 to-danger/50',
];
function gradFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export default function TemplatesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cat, setCat] = useState<TemplateCategory>('TRENDING');
  const [items, setItems] = useState<Template[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const load = useCallback(async (c: TemplateCategory) => {
    setBusy(true); setError(null);
    try {
      const page = await api.templates(c);
      setItems(page?.data ?? []);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load templates.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (user) void load(cat); }, [user, cat, load]);

  if (loading) return <LoadingScreen label="Loading templates…" />;
  if (!user) return null;

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">Templates</h1>
          <p className="text-xs text-dim">One tap to a finished-looking video</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-vio/15 text-vio">
          <IconTemplate size={20} />
        </span>
      </div>

      <div className="mt-4">
        <Tabs tabs={CATS} active={cat} onChange={(c) => { setCat(c); sounds.tap(); }} />
      </div>

      <div className="mt-4">
        {busy ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer aspect-[3/4] rounded-2xl" />)}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => load(cat)} />
        ) : items.length === 0 ? (
          <EmptyState title="No templates here yet" hint="Try another category — new templates land every week." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((t) => (
              <Link key={t.id} href={`/templates/${t.id}`}
                className="group overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-vio active:scale-[.98] animate-fade-up">
                <div className="relative aspect-[3/4] overflow-hidden bg-void">
                  {t.previewUrl ? (
                    <img src={t.previewUrl} alt={t.title} className="media-cover transition group-hover:scale-105" />
                  ) : (
                    <div className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${gradFor(t.id)} p-3 text-center`}>
                      <IconTemplate size={26} className="text-white/80" />
                      <p className="mt-2 line-clamp-3 text-sm font-extrabold text-white">{t.title}</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                  {t.isPremium && (
                    <span className="absolute left-2 top-2"><Badge tone="gold"><span className="flex items-center gap-1"><IconLock size={10} /> PRO</span></Badge></span>
                  )}
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
                    <IconPlay size={10} /> {fmtDur(t.durationSec)}
                  </span>
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
                    {t.slots?.length ?? 0} slots
                  </span>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-bold text-ink">{t.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-dim">
                    <IconMusic size={11} /> {fmt(t.usageCount)} uses
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
