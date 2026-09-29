'use client';
// Admin → Overview: platform stats + mini charts.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Sparkline, CHART_COLORS } from '@/components/charts';
import { ErrorState } from '@/components/ui';
import { IconUsers, IconVideo, IconStories, IconFlag, IconWallet, IconZap, IconRefresh } from '@/lib/icons';
import { StatCard, SectionHead, fmtNum, fmtBytes, errMsg, type NotifyFn } from './common';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const arr = (v: unknown): number[] => (Array.isArray(v) ? v.map(num) : []);

export default function Overview({ notify }: { notify: NotifyFn }) {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      setStats((await api.adminStats()) ?? {});
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (busy) {
    return <div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer h-28 rounded-2xl" />)}</div>;
  }
  if (error || !stats) return <ErrorState message={error ?? 'No stats.'} onRetry={load} />;

  const cards: Array<{ label: string; value: string; sub?: string; icon: React.ReactNode; series?: number[]; color?: string }> = [
    { label: 'Users', value: fmtNum(stats.users ?? stats.totalUsers), icon: <IconUsers size={16} />, series: arr(stats.usersByDay), color: CHART_COLORS.vio },
    { label: 'Posts', value: fmtNum(stats.posts ?? stats.totalPosts), icon: <IconVideo size={16} />, series: arr(stats.postsByDay), color: CHART_COLORS.cy },
    { label: 'Stories (active)', value: fmtNum(stats.stories ?? stats.activeStories), icon: <IconStories size={16} /> },
    { label: 'Pending reports', value: fmtNum(stats.pendingReports ?? stats.reportsPending), icon: <IconFlag size={16} />, sub: 'needs review' },
    { label: 'Storage used', value: fmtBytes(stats.storageBytes ?? stats.storage), icon: <IconWallet size={16} />, sub: 'media volume' },
    { label: 'AI generations today', value: fmtNum(stats.aiToday ?? stats.aiGenerationsToday), icon: <IconZap size={16} />, series: arr(stats.aiByDay), color: CHART_COLORS.gold },
  ];

  return (
    <div>
      <SectionHead title="Platform overview" hint="Live counters from the API"
        right={<button onClick={() => { void load(); notify('Refreshed'); }} className="rounded-xl bg-white/5 p-2 text-dim hover:text-ink" aria-label="Refresh"><IconRefresh size={15} /></button>} />
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="relative">
            <span className="absolute right-3 top-3 text-dim">{c.icon}</span>
            <StatCard label={c.label} value={c.value} sub={c.sub}
              spark={c.series && c.series.length > 1 ? <Sparkline points={c.series} color={c.color} /> : undefined} />
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-line bg-panel p-4">
        <p className="text-sm font-bold text-ink">Health notes</p>
        <ul className="mt-2 space-y-1.5 text-xs text-dim">
          <li>· Every admin write in this panel is audit-logged with your account.</li>
          <li>· Destructive actions (ban, delete, broadcast) always ask for confirmation.</li>
          <li>· Resolve the reports queue before it grows — pending reports are shown above.</li>
        </ul>
      </div>
    </div>
  );
}
