'use client';
// Horizontal lens carousel: renders each lens thumbnail via lens.thumbnail(),
// "No lens" first, premium lenses show a lock badge.
import React, { useCallback } from 'react';
import type { LensDefinition } from '@sigma-snap/shared';
import { IconLock, IconSparkles } from '@/lib/icons';

function Thumb({ lens, size = 54 }: { lens: LensDefinition | null; size?: number }) {
  const ref = useCallback(
    (el: HTMLCanvasElement | null) => {
      if (!el) return;
      el.width = size * 2;
      el.height = size * 2;
      if (lens) {
        lens.thumbnail(el);
      } else {
        const c = el.getContext('2d');
        if (!c) return;
        const g = c.createLinearGradient(0, 0, el.width, el.height);
        g.addColorStop(0, '#1A1A26');
        g.addColorStop(1, '#12121B');
        c.fillStyle = g;
        c.fillRect(0, 0, el.width, el.height);
      }
    },
    [lens, size],
  );
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-2xl" />;
}

export default function LensCarousel({
  lenses,
  activeId,
  onSelect,
  onPremium,
}: {
  lenses: LensDefinition[];
  activeId: string | null;
  onSelect: (lens: LensDefinition | null) => void;
  onPremium: (lens: LensDefinition) => void;
}) {
  const item = (
    key: string,
    label: string,
    lens: LensDefinition | null,
    isActive: boolean,
    locked: boolean,
    onTap: () => void,
  ) => (
    <button
      key={key}
      onClick={onTap}
      className="flex w-[68px] shrink-0 flex-col items-center gap-1.5"
      aria-label={label}
      aria-pressed={isActive}
    >
      <span
        className={`relative rounded-2xl p-[2.5px] transition ${
          isActive ? 'bg-gradient-to-br from-vio to-cy shadow-glow' : 'bg-white/10'
        }`}
      >
        <Thumb lens={lens} />
        {locked && (
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-void">
            <IconLock size={12} strokeWidth={2.4} />
          </span>
        )}
      </span>
      <span
        className={`flex max-w-full items-center gap-1 truncate text-[10px] font-semibold ${
          isActive ? 'text-ink' : 'text-dim'
        }`}
      >
        {locked && <IconSparkles size={10} className="text-gold" />}
        {label}
      </span>
    </button>
  );

  return (
    <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 py-1" role="listbox" aria-label="Lenses">
      {item('none', 'No lens', null, activeId === null, false, () => onSelect(null))}
      {lenses.map((l) =>
        item(
          l.id,
          l.name,
          l,
          activeId === l.id,
          l.isPremium,
          () => (l.isPremium ? onPremium(l) : onSelect(l)),
        ),
      )}
    </div>
  );
}
