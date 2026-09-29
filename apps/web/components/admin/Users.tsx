'use client';
// Admin → Users: search, ban/unban, suspend/unsuspend, set plan, set role.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Avatar, EmptyState, Spinner } from '@/components/ui';
import { IconSearch, IconBlock, IconShield, IconWallet, IconCheck } from '@/lib/icons';
import {
  ConfirmSheet, SectionHead, Row, Field, Input, Badge, fmtDate, errMsg, type NotifyFn,
} from './common';
import type { Plan, Role, User } from '@sigma-snap/shared';

type Action = 'ban' | 'unban' | 'suspend' | 'unsuspend' | 'set-plan' | 'set-role';

const ACTION_META: Record<Action, { label: string; danger?: boolean; needsValue?: 'plan' | 'role' }> = {
  ban: { label: 'Ban user', danger: true },
  unban: { label: 'Unban user' },
  suspend: { label: 'Suspend user', danger: true },
  unsuspend: { label: 'Unsuspend user' },
  'set-plan': { label: 'Set plan', needsValue: 'plan' },
  'set-role': { label: 'Set role', needsValue: 'role' },
};

export default function Users({ notify }: { notify: NotifyFn }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sel, setSel] = useState<{ user: User; action: Action } | null>(null);
  const [note, setNote] = useState('');
  const [value, setValue] = useState('');
  const [acting, setActing] = useState(false);

  const search = useCallback(async (query: string) => {
    setBusy(true);
    try {
      const page = await api.adminUsers(query || undefined);
      setUsers(page?.data ?? []);
      setSearched(true);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);

  useEffect(() => { void search(''); }, [search]);

  const openAction = (user: User, action: Action) => {
    setSel({ user, action }); setNote('');
    setValue(action === 'set-plan' ? user.plan : action === 'set-role' ? user.role : '');
  };

  const doAction = async () => {
    if (!sel) return;
    const meta = ACTION_META[sel.action];
    if (meta.needsValue && !value) { notify('Pick a value first.', 'err'); return; }
    setActing(true);
    try {
      const body: Record<string, unknown> = {};
      if (note.trim()) body.note = note.trim();
      if (meta.needsValue === 'plan') body.plan = value;
      if (meta.needsValue === 'role') body.role = value;
      await api.adminUserAction(sel.user.id, sel.action, body);
      notify(`${meta.label} — done.`);
      setSel(null);
      void search(q);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setActing(false); }
  };

  const banned = (u: User) => Boolean((u as unknown as { bannedAt?: unknown }).bannedAt ?? (u as unknown as { isBanned?: boolean }).isBanned);
  const suspended = (u: User) => Boolean((u as unknown as { suspendedAt?: unknown }).suspendedAt ?? (u as unknown as { isSuspended?: boolean }).isSuspended);

  return (
    <div>
      <SectionHead title="Users" hint="Search and moderate accounts" />
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(q); }}>
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dim"><IconSearch size={15} /></span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username, email…" className="pl-9" />
        </div>
        <button type="submit" className="rounded-2xl bg-vio px-4 text-sm font-bold text-white disabled:opacity-40" disabled={busy}>
          {busy ? <Spinner size={15} /> : 'Search'}
        </button>
      </form>

      {busy && !searched ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : users.length === 0 ? (
        <EmptyState title="No users found" hint="Try a different search term." />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Row key={u.id}>
              <div className="flex items-center gap-3">
                <Avatar src={u.avatarUrl} name={u.displayName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">@{u.username}</p>
                  <p className="truncate text-[11px] text-dim">{u.email} · joined {fmtDate(u.createdAt)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={u.plan === 'FREE' ? 'vio' : 'gold'}>{u.plan}</Badge>
                    {u.role !== 'USER' && <Badge tone="cy">{u.role}</Badge>}
                    {banned(u) && <Badge tone="danger">BANNED</Badge>}
                    {suspended(u) && <Badge tone="danger">SUSPENDED</Badge>}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {banned(u)
                  ? <ActBtn onClick={() => openAction(u, 'unban')} icon={<IconCheck size={13} />} label="Unban" />
                  : <ActBtn onClick={() => openAction(u, 'ban')} icon={<IconBlock size={13} />} label="Ban" danger />}
                {suspended(u)
                  ? <ActBtn onClick={() => openAction(u, 'unsuspend')} icon={<IconCheck size={13} />} label="Unsuspend" />
                  : <ActBtn onClick={() => openAction(u, 'suspend')} icon={<IconBlock size={13} />} label="Suspend" danger />}
                <ActBtn onClick={() => openAction(u, 'set-plan')} icon={<IconWallet size={13} />} label="Plan" />
                <ActBtn onClick={() => openAction(u, 'set-role')} icon={<IconShield size={13} />} label="Role" />
              </div>
            </Row>
          ))}
        </div>
      )}

      <ConfirmSheet
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? ACTION_META[sel.action].label : ''}
        body={sel ? `${ACTION_META[sel.action].label} for @${sel.user.username} (${sel.user.email})?` : ''}
        confirmLabel={sel ? ACTION_META[sel.action].label : 'Confirm'}
        danger={sel ? !!ACTION_META[sel.action].danger : false}
        busy={acting}
        onConfirm={doAction}
      >
        {sel?.action === 'set-plan' && (
          <Field label="Plan">
            <select value={value} onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-2xl border border-line bg-panel2 px-4 py-3 text-sm text-ink outline-none focus:border-vio">
              {(['FREE', 'PRO', 'CREATOR'] as Plan[]).map((p) => <option key={p} value={p} className="bg-panel2">{p}</option>)}
            </select>
          </Field>
        )}
        {sel?.action === 'set-role' && (
          <Field label="Role">
            <select value={value} onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-2xl border border-line bg-panel2 px-4 py-3 text-sm text-ink outline-none focus:border-vio">
              {(['USER', 'MODERATOR', 'ADMIN'] as Role[]).map((r) => <option key={r} value={r} className="bg-panel2">{r}</option>)}
            </select>
          </Field>
        )}
        <div className="mt-3">
          <Field label="Audit note (recorded in audit log)" hint="Why is this action being taken?">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. repeated spam after warning…" />
          </Field>
        </div>
      </ConfirmSheet>
    </div>
  );
}

function ActBtn({ onClick, icon, label, danger = false }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition ${danger ? 'bg-danger/10 text-danger hover:bg-danger/20' : 'bg-white/5 text-ink hover:bg-white/10'}`}>
      {icon}{label}
    </button>
  );
}
