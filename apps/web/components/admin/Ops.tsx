'use client';
// Admin → Ops: sounds library, trending hashtags, AI usage, audit logs, broadcast.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, EmptyState, Spinner, Tabs, Badge, TextArea } from '@/components/ui';
import { IconMusic, IconZap, IconBell, IconShield } from '@/lib/icons';
import { ConfirmSheet, SectionHead, Row, Field, Input, fmtNum, fmtDate, errMsg, type NotifyFn } from './common';
import type { Sound } from '@sigma-snap/shared';

type Sub = 'sounds' | 'ai' | 'audit' | 'broadcast';

export default function Ops({ notify }: { notify: NotifyFn }) {
  const [sub, setSub] = useState<Sub>('sounds');
  return (
    <div>
      <SectionHead title="Operations" hint="Library, usage, logs & messaging" />
      <Tabs
        tabs={[{ id: 'sounds', label: 'Sounds' }, { id: 'ai', label: 'AI usage' }, { id: 'audit', label: 'Audit logs' }, { id: 'broadcast', label: 'Broadcast' }]}
        active={sub} onChange={setSub}
      />
      <div className="mt-3">
        {sub === 'sounds' && <SoundsTags notify={notify} />}
        {sub === 'ai' && <AiUsage notify={notify} />}
        {sub === 'audit' && <Audit notify={notify} />}
        {sub === 'broadcast' && <Broadcast notify={notify} />}
      </div>
    </div>
  );
}

/* ── Sounds + trending hashtags ─────────────────────────────────────── */
function SoundsTags({ notify }: { notify: NotifyFn }) {
  const [soundsList, setSoundsList] = useState<Sound[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [sp, tr] = await Promise.allSettled([api.sounds(), api.trending()]);
      if (sp.status === 'fulfilled') setSoundsList(sp.value?.data ?? []);
      if (tr.status === 'fulfilled') {
        const t = tr.value as { hashtags?: Array<string | { tag?: string; name?: string }>; tags?: string[] };
        const raw = t?.hashtags ?? t?.tags ?? [];
        setTags(raw.map((h) => (typeof h === 'string' ? h : h.tag ?? h.name ?? '')).filter(Boolean));
      }
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  if (busy) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-dim">Trending hashtags</p>
      {tags.length === 0 ? (
        <p className="mb-4 text-sm text-dim">No trending hashtags right now.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {tags.map((h, i) => <Badge key={i} tone="vio">#{h.replace(/^#/, '')}</Badge>)}
        </div>
      )}
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-dim">Sound library ({soundsList.length})</p>
      {soundsList.length === 0 ? (
        <EmptyState title="No sounds" hint="Sounds appear here once uploaded." />
      ) : (
        <div className="space-y-2">
          {soundsList.slice(0, 50).map((s) => (
            <Row key={s.id}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vio/15 text-vio"><IconMusic size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{s.title}</p>
                  <p className="text-[11px] text-dim">{s.artist ?? 'Original'} · {fmtNum(s.usageCount)} uses</p>
                </div>
              </div>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── AI usage ───────────────────────────────────────────────────────── */
interface AiRow { kind?: string; type?: string; provider?: string; count?: number; total?: number; today?: number }

function AiUsage({ notify }: { notify: NotifyFn }) {
  const [rows, setRows] = useState<AiRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.adminAiUsage();
      if (Array.isArray(d)) {
        setRows(d as AiRow[]);
      } else if (d && typeof d === 'object') {
        const obj = d as Record<string, unknown>;
        const list = Array.isArray(obj.byKind) ? (obj.byKind as AiRow[])
          : Array.isArray(obj.rows) ? (obj.rows as AiRow[])
          : Array.isArray(obj.usage) ? (obj.usage as AiRow[]) : [];
        setRows(list);
        const t = obj.total ?? obj.today ?? obj.count;
        setTotal(typeof t === 'number' ? t : null);
      }
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  if (busy) return <div className="flex justify-center py-10"><Spinner /></div>;
  return (
    <div>
      <SectionHead title="AI usage" hint="Generations by tool & provider"
        right={total !== null ? <Badge tone="gold">{fmtNum(total)} total</Badge> : undefined} />
      {rows.length === 0 ? (
        <EmptyState title="No AI usage recorded" hint="Generations will appear here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-panel2 text-[11px] uppercase tracking-wider text-dim">
                <th className="px-4 py-2.5 font-bold">Tool</th>
                <th className="px-4 py-2.5 font-bold">Provider</th>
                <th className="px-4 py-2.5 text-right font-bold">Count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line bg-panel">
                  <td className="px-4 py-2.5 font-semibold text-ink">
                    <span className="flex items-center gap-2"><IconZap size={13} className="text-gold" />{r.kind ?? r.type ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-dim">{r.provider ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-ink">{fmtNum(r.count ?? r.total ?? r.today ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Audit logs ─────────────────────────────────────────────────────── */
interface AuditEntry { id?: string | number; actor?: { username?: string } | null; actorId?: string; action?: string; target?: string; targetId?: string; createdAt?: string; meta?: unknown }

function Audit({ notify }: { notify: NotifyFn }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const page = await api.adminAuditLogs();
      setEntries(((page?.data ?? []) as AuditEntry[]));
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  if (busy) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (entries.length === 0) return <EmptyState title="No audit entries" hint="Admin actions will be logged here." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-panel2 text-[11px] uppercase tracking-wider text-dim">
            <th className="px-4 py-2.5 font-bold">When</th>
            <th className="px-4 py-2.5 font-bold">Actor</th>
            <th className="px-4 py-2.5 font-bold">Action</th>
            <th className="px-4 py-2.5 font-bold">Target</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id ?? i} className="border-t border-line bg-panel align-top">
              <td className="whitespace-nowrap px-4 py-2.5 text-xs text-dim">{fmtDate(e.createdAt)}</td>
              <td className="px-4 py-2.5 text-xs font-semibold text-ink">@{e.actor?.username ?? e.actorId ?? '—'}</td>
              <td className="px-4 py-2.5">
                <Badge tone="vio">{e.action ?? '—'}</Badge>
              </td>
              <td className="max-w-[140px] truncate px-4 py-2.5 text-xs text-dim">{e.target ?? e.targetId ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Broadcast ──────────────────────────────────────────────────────── */
function Broadcast({ notify }: { notify: NotifyFn }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) { notify('Title and body are both required.', 'err'); return; }
    setSending(true);
    try {
      await api.adminBroadcast({ title: title.trim(), body: body.trim() });
      notify('Broadcast sent to all users.');
      setTitle(''); setBody(''); setConfirm(false);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setSending(false); }
  };

  return (
    <div>
      <SectionHead title="Broadcast" hint="Push notification to every user — use sparingly" />
      <div className="rounded-2xl border border-line bg-panel p-4">
        <div className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New lenses just dropped" maxLength={80} />
          </Field>
          <Field label="Body" hint={`${body.length}/200`}>
            <TextArea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tell everyone what's new…" maxLength={200} />
          </Field>
          <div className="rounded-2xl bg-gold/10 p-3 text-xs text-gold">
            This goes to <b>all users</b> as a push notification. Double-check the wording before sending.
          </div>
          <Button className="w-full" onClick={() => setConfirm(true)} disabled={!title.trim() || !body.trim()}>
            <span className="flex items-center justify-center gap-2"><IconBell size={15} /> Review & send</span>
          </Button>
        </div>
      </div>

      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Send broadcast?"
        body={`“${title}” — ${body}`}
        confirmLabel="Send to all users"
        busy={sending}
        onConfirm={send}
      >
        <p className="mt-2 flex items-center gap-2 text-xs text-dim"><IconShield size={13} /> This action is audit-logged under your account.</p>
      </ConfirmSheet>
    </div>
  );
}
