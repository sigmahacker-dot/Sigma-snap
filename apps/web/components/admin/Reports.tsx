'use client';
// Admin → Reports queue: review, then dismiss / remove / warn / suspend / ban (reason required).
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BottomSheet, Button, EmptyState, Spinner, Tabs, Badge, TextArea } from '@/components/ui';
import { IconFlag } from '@/lib/icons';
import { SectionHead, Row, Field, fmtDate, errMsg, type NotifyFn } from './common';

type StatusFilter = 'PENDING' | 'RESOLVED' | 'ALL';

interface Report {
  id: string; reason?: string; details?: string | null; status?: string;
  targetType?: string; targetId?: string; createdAt?: string;
  reporter?: { username?: string } | null;
  target?: { summary?: string; caption?: string; text?: string; username?: string } | null;
}

const ACTIONS = [
  { id: 'DISMISS', label: 'Dismiss', desc: 'No violation — close the report.' },
  { id: 'REMOVE_CONTENT', label: 'Remove content', desc: 'Delete the reported post/comment/story.' },
  { id: 'WARN', label: 'Warn user', desc: 'Send a warning to the content owner.' },
  { id: 'SUSPEND', label: 'Suspend user', desc: 'Temporarily suspend the account.' },
  { id: 'BAN', label: 'Ban user', desc: 'Permanently ban the account.' },
];

export default function Reports({ notify }: { notify: NotifyFn }) {
  const [filter, setFilter] = useState<StatusFilter>('PENDING');
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(true);
  const [sel, setSel] = useState<Report | null>(null);
  const [action, setAction] = useState('DISMISS');
  const [reason, setReason] = useState('');
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async (f: StatusFilter) => {
    setBusy(true);
    try {
      const page = await api.adminReports(f === 'ALL' ? undefined : f);
      setReports((page?.data ?? []) as Report[]);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);

  useEffect(() => { void load(filter); }, [filter, load]);

  const open = (r: Report) => { setSel(r); setAction('DISMISS'); setReason(''); };

  const resolve = async () => {
    if (!sel) return;
    if (!reason.trim()) { notify('A reason is required for every moderation action.', 'err'); return; }
    setResolving(true);
    try {
      await api.adminResolveReport(sel.id, { status: 'RESOLVED', action, reason: reason.trim() });
      notify(`Report ${action === 'DISMISS' ? 'dismissed' : 'actioned'}.`);
      setSel(null);
      void load(filter);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setResolving(false); }
  };

  const targetSummary = (r: Report): string => {
    const t = r.target;
    const direct = t?.summary ?? t?.caption ?? t?.text ?? t?.username;
    if (direct && direct.length > 0) return direct;
    const typeLabel = r.targetType ? r.targetType : 'content';
    const idLabel = r.targetId ? r.targetId : '';
    const fallback = `${typeLabel} ${idLabel}`.trim();
    return fallback.length > 0 ? fallback : '—';
  };

  return (
    <div>
      <SectionHead title="Reports queue" hint="Every action needs a reason" />
      <Tabs
        tabs={[{ id: 'PENDING', label: 'Pending' }, { id: 'RESOLVED', label: 'Resolved' }, { id: 'ALL', label: 'All' }]}
        active={filter} onChange={setFilter}
      />
      <div className="mt-3">
        {busy ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : reports.length === 0 ? (
          <EmptyState title="Queue is clear" hint={filter === 'PENDING' ? 'No pending reports. Nice.' : 'Nothing here under this filter.'} />
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <button key={r.id} onClick={() => open(r)} className="w-full text-left">
                <Row className="transition hover:border-vio">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
                      <IconFlag size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold text-ink">{r.reason ?? 'Report'}</p>
                        <Badge tone={r.status === 'PENDING' ? 'danger' : 'cy'}>{r.status ?? '?'}</Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-dim">
                        Target: {targetSummary(r)} · by @{r.reporter?.username ?? 'unknown'} · {fmtDate(r.createdAt)}
                      </p>
                    </div>
                  </div>
                </Row>
              </button>
            ))}
          </div>
        )}
      </div>

      <BottomSheet open={!!sel} onClose={() => setSel(null)} title="Review report">
        {sel && (
          <div>
            <div className="rounded-2xl bg-panel2 p-3 text-sm">
              <p><span className="font-bold text-ink">Reason:</span> <span className="text-dim">{sel.reason ?? '—'}</span></p>
              {sel.details && <p className="mt-1"><span className="font-bold text-ink">Details:</span> <span className="text-dim">{sel.details}</span></p>}
              <p className="mt-1"><span className="font-bold text-ink">Target:</span> <span className="text-dim">{targetSummary(sel)}</span></p>
              <p className="mt-1"><span className="font-bold text-ink">Reporter:</span> <span className="text-dim">@{sel.reporter?.username ?? 'unknown'}</span></p>
              <p className="mt-1"><span className="font-bold text-ink">Filed:</span> <span className="text-dim">{fmtDate(sel.createdAt)}</span></p>
            </div>
            <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-dim">Resolution action</p>
            <div className="space-y-1.5">
              {ACTIONS.map((a) => (
                <button key={a.id} onClick={() => setAction(a.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${action === a.id ? 'border-vio bg-vio/10' : 'border-line bg-panel2'}`}>
                  <p className="text-sm font-bold text-ink">{a.label}</p>
                  <p className="text-[11px] text-dim">{a.desc}</p>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Field label="Reason (required — stored in audit log)">
                <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this the right call?" />
              </Field>
            </div>
            <Button className="mt-4 w-full" onClick={resolve} disabled={resolving}>
              {resolving ? <span className="flex items-center justify-center gap-2"><Spinner size={15} /> Resolving…</span> : 'Resolve report'}
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
