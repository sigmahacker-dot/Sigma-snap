'use client';
// Merge admin-managed lenses (remote config) into the camera lens picker.
// A ManagedLens resolves to a LensDefinition in one of two ways:
//   1. { "registryKey": "<lens-sdk id>" } — curates/renames an existing
//      procedural lens (admin controls order + visibility, no rebuild).
//   2. { "kind": "grade", "cssFilter": "saturate(1.4) contrast(1.1) …" } — a
//      pure color-grade lens rendered entirely from the admin payload.
import { useMemo } from 'react';
import type { LensDefinition, ManagedLens } from '@sigma-snap/shared';
import { registry } from '@sigma-snap/lens-sdk';
import { useConfig } from './config';

function gradeThumbnail(cssFilter: string, name: string) {
  return (canvas: HTMLCanvasElement) => {
    const c = canvas.getContext('2d');
    if (!c) return;
    const w = canvas.width, h = canvas.height;
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#2a1e4f');
    g.addColorStop(0.5, '#0e2a3a');
    g.addColorStop(1, '#3a0e2e');
    c.save();
    c.filter = cssFilter;
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = `700 ${Math.round(h / 9)}px system-ui`;
    c.textAlign = 'center';
    c.fillText(name.slice(0, 10), w / 2, h / 2);
  };
}

export function managedLensToDefinition(m: ManagedLens): LensDefinition | null {
  const cfg = m.configJson ?? {};
  const registryKey = typeof cfg.registryKey === 'string' ? cfg.registryKey : null;

  if (registryKey) {
    const base = registry.get(registryKey);
    if (!base) return null;
    return {
      ...base,
      id: `managed:${m.key}`,
      name: m.name,
      description: m.description ?? base.description,
      isPremium: typeof cfg.isPremium === 'boolean' ? cfg.isPremium : base.isPremium,
    };
  }

  if (cfg.kind === 'grade' && typeof cfg.cssFilter === 'string' && cfg.cssFilter.trim()) {
    const cssFilter = cfg.cssFilter;
    return {
      id: `managed:${m.key}`,
      name: m.name,
      category: 'CINEMATIC',
      description: m.description ?? 'Admin-curated color grade',
      isPremium: cfg.isPremium === true,
      apply(ctx, frame) {
        ctx.save();
        try {
          ctx.filter = cssFilter;
        } catch { /* older browsers ignore filter */ }
        ctx.drawImage(frame, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      },
      thumbnail: gradeThumbnail(cssFilter, m.name),
    };
  }

  return null;
}

/** Registry lenses + enabled managed lenses (managed first, registry deduped). */
export function useMergedLenses(): LensDefinition[] {
  const { lenses: managed } = useConfig();
  return useMemo(() => {
    const defs: LensDefinition[] = [];
    const referenced = new Set<string>();
    for (const m of managed) {
      const def = managedLensToDefinition(m);
      if (def) {
        defs.push(def);
        const cfg = m.configJson ?? {};
        if (typeof cfg.registryKey === 'string') referenced.add(cfg.registryKey);
      }
    }
    for (const l of registry.all()) {
      if (!referenced.has(l.id)) defs.push(l);
    }
    return defs;
  }, [managed]);
}
