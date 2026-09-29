'use client';
// Remote config: announcements, feature flags, managed lenses.
// Fetched once per session after login; drives banners, tab gating,
// and the camera lens picker — admin changes go live without a rebuild.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Announcement, AppConfig, ManagedLens } from '@sigma-snap/shared';
import { api } from './api';
import { useAuth } from './auth';
import { IconClose, IconMegaphone } from './icons';

interface ConfigCtx {
  announcements: Announcement[];
  flags: Record<string, boolean>;
  lenses: ManagedLens[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  flagOn: (key: string) => boolean;
}

const Ctx = createContext<ConfigCtx>({
  announcements: [],
  flags: {},
  lenses: [],
  loading: true,
  error: null,
  refresh: () => {},
  flagOn: () => true,
});

export function useConfig(): ConfigCtx {
  return useContext(Ctx);
}

const DISMISSED_KEY = 'sigmasnap.dismissedAnnouncements';

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setConfig(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.appConfig()
      .then((c) => { if (!cancelled) { setConfig(c); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Could not load config'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [user, authLoading, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<ConfigCtx>(() => ({
    announcements: config?.announcements ?? [],
    flags: config?.flags ?? {},
    lenses: config?.lenses ?? [],
    loading,
    error,
    refresh,
    flagOn: (key: string) => config?.flags[key] ?? true,
  }), [config, loading, error, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Dismissible announcement banners rendered under the app header. */
export function AnnouncementBanners() {
  const { announcements, loading } = useConfig();
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);

  if (loading || announcements.length === 0) return null;
  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <div className="space-y-2 px-4 pt-3">
      {visible.map((a) => (
        <div key={a.id} className="relative overflow-hidden rounded-2xl border border-vio/30 bg-gradient-to-r from-vio/15 to-cy/10 p-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-vio/20 text-vio">
              <IconMegaphone size={16} />
            </span>
            <div className="min-w-0 flex-1 pr-6">
              <p className="text-sm font-extrabold">{a.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-dim">{a.body}</p>
              {a.ctaUrl && (
                <a href={a.ctaUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-bold text-cy hover:underline">
                  Learn more →
                </a>
              )}
            </div>
            <button onClick={() => dismiss(a.id)} aria-label="Dismiss announcement"
              className="absolute right-2 top-2 rounded-full p-1 text-dim transition hover:text-ink">
              <IconClose size={14} />
            </button>
          </div>
          {a.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.imageUrl} alt="" className="mt-2 h-28 w-full rounded-xl object-cover" loading="lazy" />
          )}
        </div>
      ))}
    </div>
  );
}
