
'use client';
// Conversation info sheet: members, disappearing-message timer, mute,
// rename (groups), leave group, block user (DMs).
import React, { useState } from 'react';
import type { Conversation } from '@sigma-snap/shared';
import { api } from '@/lib/api';
import { Avatar, BottomSheet, Toggle, Button } from '@/components/ui';
import { IconTimer, IconEdit, IconCheck } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { isMutedLocal, setMutedLocal, dmOther } from './chat-utils';

const TIMER_OPTIONS = [
  { sec: 0, label: 'Off' },
  { sec: 3600, label: '1 hour' },
  { sec: 86400, label: '24 hours' },
  { sec: 604800, label: '7 days' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  meId: string;
  onUpdated: (c: Conversation) => void;
  onLeft: () => void;
  onBlocked: () => void;
}

export default function InfoSheet({ open, onClose, conversation: c, meId, onUpdated, onLeft, onBlocked }: Props) {
  const [muted, setMuted] = useState(() => isMutedLocal(c.id));
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(c.title ?? '');
  const [confirm, setConfirm] = useState<'leave' | 'block' | null>(null);
  const other = c.type === 'DIRECT' ? dmOther(c, meId) : undefined;

  const saveTimer = async (sec: number) => {
    setSaving(true);
    try {
      const updated = await api.updateConversation(c.id, { disappearingAfterSec: sec });
      onUpdated(updated);
      sounds.success();
    } catch { sounds.error(); } finally { setSaving(false); }
  };

  const toggleMute = (v: boolean) => {
    setMutedLocal(c.id, v);
    setMuted(v);
    sounds.tap();
  };

  const saveTitle = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      const updated = await api.updateConversation(c.id, { title: t });
      onUpdated(updated);
      setRenaming(false);
      sounds.success();
    } catch { sounds.error(); } finally { setSaving(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={c.type === 'GROUP' ? 'Group info' : 'Chat info'}>
      <div className="space-y-5">
        {/* Members */}
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">
            {c.type === 'GROUP' ? `Members · ${c.participants.length}` : 'Chat with'}
          </p>
          <div className="space-y-1">
            {c.participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-3 rounded-2xl bg-panel2 px-3 py-2.5">
                <Avatar src={p.user.avatarUrl} name={p.user.displayName} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.user.displayName}</p>
                  <p className="text-xs text-dim">@{p.user.username}{p.userId === meId ? ' · you' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Group title */}
        {c.type === 'GROUP' && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Group name</p>
            {renaming ? (
              <div className="flex gap-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60}
                  className="w-full rounded-2xl border border-line bg-panel2 px-4 py-2.5 text-sm outline-none focus:border-vio" />
                <button onClick={saveTitle} disabled={saving || !title.trim()} aria-label="Save name"
                  className="rounded-2xl bg-vio px-4 text-white disabled:opacity-40"><IconCheck size={18} /></button>
              </div>
            ) : (
              <button onClick={() => { setTitle(c.title ?? ''); setRenaming(true); }}
                className="flex w-full items-center justify-between rounded-2xl bg-panel2 px-4 py-3 text-sm font-semibold hover:bg-white/5">
                <span>{c.title || 'Unnamed group'}</span><IconEdit size={16} className="text-dim" />
              </button>
            )}
          </section>
        )}

        {/* Disappearing messages */}
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-dim">
            <IconTimer size={14} /> Disappearing messages
          </p>
          <div className="grid grid-cols-4 gap-2">
            {TIMER_OPTIONS.map((o) => {
              const active = (c.disappearingAfterSec ?? 0) === o.sec;
              return (
                <button key={o.sec} disabled={saving} onClick={() => void saveTimer(o.sec)}
                  className={`rounded-2xl border px-2 py-2.5 text-xs font-bold transition active:scale-95 disabled:opacity-40 ${
                    active ? 'border-vio bg-vio/15 text-white shadow-glow' : 'border-line bg-panel2 text-dim hover:text-ink'}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-dim">New messages auto-delete after this time. Applies to messages you send.</p>
        </section>

        {/* Mute */}
        <section className="flex items-center justify-between rounded-2xl bg-panel2 px-4 py-3">
          <span className="text-sm font-semibold">Mute notifications</span>
          <Toggle checked={muted} onChange={toggleMute} />
        </section>

        {/* Danger zone */}
        <section className="space-y-2 pt-1">
          {c.type === 'GROUP' ? (
            confirm === 'leave' ? (
              <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
                <p className="mb-3 text-sm font-semibold">Leave this group? You won't receive new messages.</p>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>Stay</Button>
                  <Button variant="danger" className="flex-1" onClick={async () => {
                    try { await api.leaveConversation(c.id); sounds.success(); onLeft(); }
                    catch { sounds.error(); }
                  }}>Leave group</Button>
                </div>
              </div>
            ) : (
              <Button variant="danger" className="w-full" onClick={() => setConfirm('leave')}>Leave group</Button>
            )
          ) : other && (
            confirm === 'block' ? (
              <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
                <p className="mb-3 text-sm font-semibold">Block {other.user.displayName}? They won't be able to message you.</p>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
                  <Button variant="danger" className="flex-1" onClick={async () => {
                    try { await api.block(other.userId); sounds.success(); onBlocked(); }
                    catch { sounds.error(); }
                  }}>Block</Button>
                </div>
              </div>
            ) : (
              <Button variant="danger" className="w-full" onClick={() => setConfirm('block')}>Block user</Button>
            )
          )}
        </section>
      </div>
    </BottomSheet>
  );
}
