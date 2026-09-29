'use client';
// Shared admin building blocks — toasts, confirm sheets, stat cards, formatters.
import React, { useState } from 'react';
import { BottomSheet, Button, Spinner, Input, TextArea, Toggle, Badge } from '@/components/ui';
import { IconShield } from '@/lib/icons';

export type NotifyFn = (msg: string, tone?: 'ok' | 'err') => void;

export function useToasts(): { notify: NotifyFn; host: React.ReactNode } {
  const [items, setItems] = useState<Array<{ id: number; msg: string; tone: 'ok' | 'err' }>>([]);
  const notify: NotifyFn = (msg, tone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, tone }]);
    window.setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 3400);
  };
  const host = (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
      {items.map((i) => (
        <div key={i.id} className={`animate-fade-up rounded-full border px-4 py-2 text-sm font-semibold shadow-card ${i.tone === 'ok' ? 'border-cy/40 bg-panel2 text-ink' : 'border-danger/40 bg-panel2 text-danger'}`}>
          {i.msg}
        </div>
      ))}
    </div>
  );
  return { notify, host };
}

export function ConfirmSheet({ open, onClose, title, body, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, children }:
  { open: boolean; onClose: () => void; title: string; body?: string; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; children?: React.ReactNode }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {body && <p className="text-sm text-dim">{body}</p>}
      {children}
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm} disabled={busy}>
          {busy ? <span className="flex items-center justify-center gap-2"><Spinner size={15} /> Working…</span> : confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}

export function StatCard({ label, value, sub, spark }: {
  label: string; value: string; sub?: string; spark?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="text-xs text-dim">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-dim">{sub}</p>}
      {spark && <div className="mt-2">{spark}</div>}
    </div>
  );
}

export function SectionHead({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div>
        <p className="text-sm font-extrabold text-ink">{title}</p>
        {hint && <p className="text-[11px] text-dim">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function Row({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-panel p-3 ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

export function AdminGateDenied() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-panel2 text-dim"><IconShield size={30} /></span>
      <p className="mt-4 text-lg font-extrabold text-ink">Admins only</p>
      <p className="mt-1 max-w-xs text-sm text-dim">This area is restricted to SIGMA SNAP administrators. If you believe this is a mistake, contact support.</p>
    </div>
  );
}

export { Input, TextArea, Toggle, Badge, Button, Spinner };

/* ── formatters ── */
export function fmtNum(n: unknown): string {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? parseFloat(n) : 0;
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}
export function fmtBytes(b: unknown): string {
  const v = Number(b ?? 0);
  if (!Number.isFinite(v) || v <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), units.length - 1);
  return `${(v / 1024 ** i).toFixed(1)} ${units[i]}`;
}
export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
