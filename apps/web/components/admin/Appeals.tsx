'use client';
// Admin → Appeals: uphold or overturn moderation decisions.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BottomSheet, Button, EmptyState, Spinner, Badge } from '@/components/ui';
import { IconShield } from '@/lib/icons';
import { ConfirmSheet, SectionHead, Row, fmtDate, errMsg, type NotifyFn } from './common';

interface Appeal {
  id: string; text?: string; status?: string; createdAt?: string;
  reportId?: string | null; moderationActionId?: string | null;
  user?: { username?: string; displayName?: string } | null;
  action?: { type?: string; reason?: string } | null;
}

export default function Appeals({ notify }: { notify: NotifyFn }) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [busy, setBusy] = useState(true);
  const [sel, setSel] = useState<Appeal | null>(null);
  const [choice, setChoice] = useState<'UPHELD' | 'OVERTURNED' | null>(null);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const list = await api.adminAppeals();
      setAppeals((list ?? []) as Appeal[]);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const resolve = async () => {
    if (!sel || !choice) return;
    setResolving(true);
    try {
      await api.adminResolveAppeal(sel.id, choice);
      notify(choice === 'UPHELD' ? 'Appeal denied — decision upheld.' : 'Appeal granted — decision overturned.');
      setChoice(null); setSel(null);
      void load();
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setResolving(false); }
  };

  return (
    <div>
      <SectionHead title="Appeals" hint="Users contesting moderation decisions" />
      {busy ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : appeals.length === 0 ? (
        <EmptyState title="No appeals" hint="Nobody is contesting a decision right now." />
      ) : (
        <div className="space-y-2">
          {appeals.map((a) => (
            <button key={a.id} onClick={() => setSel(a)} className="w-full text-left">
              <Row className="transition hover:border-vio">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cy/15 text-cy">
                    <IconShield size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-ink">@{a.user?.username ?? 'unknown'}</p>
                      <Badge tone={a.status === 'PENDING' ? 'gold' : 'cy'}>{a.status ?? '?'}</Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-dim">{a.text ?? '—'}</p>
                    <p className="mt-0.5 text-[11px] text-dim/70">{fmtDate(a.createdAt)}</p>
                  </div>
                </div>
              </Row>
            </button>
          ))}
        </div>
      )}

      <BottomSheet open={!!sel && !choice} onClose={() => setSel(null)} title="Review appeal">
        {sel && (
          <div>
            <div className="rounded-2xl bg-panel2 p-3 text-sm">
              <p><span className="font-bold text-ink">From:</span> <span className="text-dim">@{sel.user?.username ?? 'unknown'}</span></p>
              <p className="mt-1"><span className="font-bold text-ink">Appeal:</span> <span className="text-dim">{sel.text ?? '—'}</span></p>
              {sel.action?.type && <p className="mt-1"><span className="font-bold text-ink">Original action:</span> <span className="text-dim">{sel.action.type}{sel.action.reason ? ` — ${sel.action.reason}` : ''}</span></p>}
              <p className="mt-1"><span className="font-bold text-ink">Filed:</span> <span className="text-dim">{fmtDate(sel.createdAt)}</span></p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setChoice('UPHELD')}>Uphold</Button>
              <Button onClick={() => setChoice('OVERTURNED')}>Overturn</Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-dim">Uphold keeps the moderation decision. Overturn reverses it.</p>
          </div>
        )}
      </BottomSheet>

      <ConfirmSheet
        open={!!choice}
        onClose={() => setChoice(null)}
        title={choice === 'UPHELD' ? 'Uphold decision?' : 'Overturn decision?'}
        body={choice === 'UPHELD'
          ? 'The appeal will be denied and the original moderation decision stands.'
          : 'The appeal will be granted and the original moderation decision reversed.'}
        confirmLabel={choice === 'UPHELD' ? 'Uphold' : 'Overturn'}
        danger={choice === 'UPHELD'}
        busy={resolving}
        onConfirm={resolve}
      />
    </div>
  );
}
