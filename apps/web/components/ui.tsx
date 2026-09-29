'use client';
// Shared UI primitives — original SIGMA SNAP design system.
import React, { useEffect } from 'react';
import { IconX } from '@/lib/icons';

export function Spinner({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-label="loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#7C5CFF" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Button({ variant = 'primary', className = '', ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'outline' }) {
  const v = {
    primary: 'bg-gradient-to-r from-vio to-vio-deep text-white shadow-glow hover:brightness-110',
    ghost: 'bg-white/5 text-ink hover:bg-white/10',
    danger: 'bg-danger/15 text-danger hover:bg-danger/25',
    outline: 'border border-line text-ink hover:border-vio',
  }[variant];
  return <button className={`rounded-2xl px-5 py-3 text-sm font-semibold transition active:scale-[.98] disabled:opacity-40 ${v} ${className}`} {...rest} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-2xl border border-line bg-panel2 px-4 py-3 text-sm text-ink placeholder:text-dim/70 outline-none focus:border-vio ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded-2xl border border-line bg-panel2 px-4 py-3 text-sm text-ink placeholder:text-dim/70 outline-none focus:border-vio ${props.className ?? ''}`} />;
}

export function Avatar({ src, name, size = 40, ring = false }: { src?: string | null; name?: string; size?: number; ring?: boolean }) {
  const initial = (name ?? '?').slice(0, 1).toUpperCase();
  return (
    <div className={`shrink-0 overflow-hidden rounded-full ${ring ? 'ring-2 ring-vio ring-offset-2 ring-offset-void' : ''}`}
      style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt={name ?? 'avatar'} className="h-full w-full object-cover" />
        : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-vio to-cy text-white font-bold"
            style={{ fontSize: size * 0.42 }}>{initial}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center animate-fade-up">
      <div className="mb-2 h-16 w-16 rounded-3xl bg-panel2 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-vio/40 to-cy/40" />
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-xs text-sm text-dim">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center animate-fade-up">
      <p className="font-semibold text-danger">Something went wrong</p>
      <p className="max-w-xs text-sm text-dim">{message}</p>
      {onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Spinner size={30} /><p className="text-sm text-dim">{label}</p>
    </div>
  );
}

export function BottomSheet({ open, onClose, title, children }:
  { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-line bg-panel p-5 shadow-card animate-fade-up">
        <div className="mb-4 flex items-center justify-between">
          {title ? <h3 className="text-base font-bold">{title}</h3> : <span />}
          <button onClick={onClose} className="rounded-full bg-white/5 p-2 hover:bg-white/10" aria-label="Close"><IconX size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex items-center gap-3">
      {label && <span className="text-sm text-ink">{label}</span>}
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-vio' : 'bg-white/10'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: Array<{ id: T; label: string }>; active: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl bg-panel p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${active === t.id ? 'bg-vio text-white shadow-glow' : 'text-dim hover:text-ink'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'vio' }: { children: React.ReactNode; tone?: 'vio' | 'cy' | 'gold' | 'danger' }) {
  const c = { vio: 'bg-vio/15 text-vio', cy: 'bg-cy/15 text-cy', gold: 'bg-gold/15 text-gold', danger: 'bg-danger/15 text-danger' }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${c}`}>{children}</span>;
}
