
'use client';
// Original geometric SVG sticker set for SIGMA SNAP chat.
// Pure vector shapes rendered in code — no image assets.
import React from 'react';

export interface StickerDef { id: string; name: string; bg: string; fg: string }

export const STICKERS: StickerDef[] = [
  { id: 'hex', name: 'Sigma Hex', bg: '#7C5CFF', fg: '#FFFFFF' },
  { id: 'burst', name: 'Starburst', bg: '#FFC44D', fg: '#0B0B12' },
  { id: 'bolt', name: 'Bolt', bg: '#38E1FF', fg: '#0B0B12' },
  { id: 'rings', name: 'Orbit', bg: '#FF5470', fg: '#FFFFFF' },
  { id: 'diamond', name: 'Prism', bg: '#7C5CFF', fg: '#38E1FF' },
  { id: 'wave', name: 'Wave', bg: '#38E1FF', fg: '#7C5CFF' },
  { id: 'moon', name: 'Crescent', bg: '#1A1A26', fg: '#FFC44D' },
  { id: 'peak', name: 'Peak', bg: '#FF5470', fg: '#FFC44D' },
  { id: 'check', name: 'Stamp', bg: '#2ED573', fg: '#0B0B12' },
];

export function StickerArt({ id, size = 96, className = '' }: { id: string; size?: number; className?: string }) {
  const def = STICKERS.find((s) => s.id === id) ?? STICKERS[0];
  const { bg, fg } = def;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-label={def.name}>
      {id === 'hex' && (<>
        <path d="M48 6 84 27v42L48 90 12 69V27Z" fill={bg} />
        <path d="M62 32H34l10 16-10 16h28" fill="none" stroke={fg} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </>)}
      {id === 'burst' && (<>
        <path d="M48 4 56 30 82 26 62 44 84 60 58 60 60 86 48 64 36 86 38 60 12 60 34 44 14 26 40 30Z" fill={bg} />
        <circle cx="48" cy="52" r="10" fill={fg} />
      </>)}
      {id === 'bolt' && (<>
        <circle cx="48" cy="48" r="42" fill={bg} />
        <path d="M54 14 28 52h16l-6 30 28-42H50Z" fill={fg} />
      </>)}
      {id === 'rings' && (<>
        <circle cx="48" cy="48" r="40" fill="none" stroke={bg} strokeWidth="9" />
        <circle cx="48" cy="48" r="22" fill="none" stroke={bg} strokeWidth="6" opacity="0.6" />
        <circle cx="48" cy="48" r="8" fill={fg} />
      </>)}
      {id === 'diamond' && (<>
        <path d="M48 8 80 36 48 88 16 36Z" fill={bg} />
        <path d="M48 8 64 36 48 88 32 36Z" fill={fg} opacity="0.85" />
        <path d="M16 36h64M48 8v80" stroke={bg} strokeWidth="3" opacity="0.5" />
      </>)}
      {id === 'wave' && (<>
        <rect x="8" y="8" width="80" height="80" rx="22" fill={bg} />
        <path d="M14 62c8-14 16-14 24 0s16 14 24 0 12-10 18-4" fill="none" stroke={fg} strokeWidth="7" strokeLinecap="round" />
        <path d="M14 40c8-14 16-14 24 0s16 14 24 0 12-10 18-4" fill="none" stroke={fg} strokeWidth="7" strokeLinecap="round" opacity="0.55" />
      </>)}
      {id === 'moon' && (<>
        <circle cx="48" cy="48" r="42" fill={bg} stroke={fg} strokeWidth="3" />
        <path d="M62 20a28 28 0 1 0 12 52A34 34 0 0 1 62 20Z" fill={fg} />
        <circle cx="66" cy="30" r="4" fill={bg} /><circle cx="74" cy="52" r="3" fill={bg} />
      </>)}
      {id === 'peak' && (<>
        <path d="M8 78 36 22l18 30 12-18 22 44Z" fill={bg} />
        <circle cx="68" cy="24" r="10" fill={fg} />
      </>)}
      {id === 'check' && (<>
        <circle cx="48" cy="48" r="42" fill={bg} />
        <path d="m30 50 13 13 24-28" fill="none" stroke={fg} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </>)}
    </svg>
  );
}

export function StickerPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  return (
    <div className="rounded-t-3xl border-t border-line bg-panel p-4 pb-8">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold">Stickers</p>
        <button onClick={onClose} className="text-xs font-semibold text-dim hover:text-ink">Close</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {STICKERS.map((s) => (
          <button key={s.id} onClick={() => { onPick(s.id); onClose(); }}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-panel2 p-3 transition active:scale-95 hover:bg-white/5"
            aria-label={s.name}>
            <StickerArt id={s.id} size={64} />
            <span className="text-[10px] font-medium text-dim">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
