'use client';
// Original lightweight SVG charts for SIGMA SNAP — hand-built, no chart libraries.
import React, { useId } from 'react';

const VIO = '#7C5CFF';
const CY = '#38E1FF';
const GOLD = '#FFC44D';
const DANGER = '#FF5470';

function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`;
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

/** Area/line chart for a single numeric series. */
export function AreaChart({
  points, height = 160, labels, color = VIO, fillTo,
}: {
  points: number[]; height?: number; labels?: string[]; color?: string; fillTo?: string;
}) {
  const gid = useId();
  const W = 320; const H = height; const PAD = 8;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const px = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(points.length - 1, 1);
  const py = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = points.map((v, i) => [px(i), py(v)] as [number, number]);
  const d = smoothPath(line);
  const area = `${d} L ${px(points.length - 1)},${H} L ${px(0)},${H} Z`;
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label="trend chart">
      <defs>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.45" />
          <stop offset="1" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="#26263a" strokeWidth="1" opacity="0.6" />
      ))}
      {points.length > 0 && <path d={area} fill={fillTo ?? `url(#${gid}-g)`} />}
      {points.length > 0 && <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {points.length > 0 && <circle cx={px(last)} cy={py(points[last])} r="4" fill={color} stroke="#0B0B12" strokeWidth="2" />}
      {labels && labels.length === points.length && labels.map((l, i) =>
        i % Math.ceil(labels.length / 5) === 0 ? (
          <text key={i} x={px(i)} y={H - 1} fontSize="8" fill="#9A9AB2" textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{l}</text>
        ) : null
      )}
    </svg>
  );
}

/** Grouped/stacked vertical bars, e.g. engagement per day. */
export function StackedBars({
  groups, height = 150, legend,
}: {
  groups: Array<{ label: string; segments: Array<{ value: number; color: string; name: string }> }>;
  height?: number;
  legend?: boolean;
}) {
  const max = Math.max(...groups.flatMap((g) => [g.segments.reduce((s, x) => s + x.value, 0)]), 1);
  return (
    <div>
      <div className="flex items-end justify-between gap-1" style={{ height }}>
        {groups.map((g, i) => {
          const total = g.segments.reduce((s, x) => s + x.value, 0);
          const hPct = Math.max((total / max) * 100, total > 0 ? 3 : 0);
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${g.label}: ${total}`}>
              <div className="flex w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-md" style={{ height: `${hPct}%`, minHeight: total > 0 ? 6 : 0 }}>
                {g.segments.map((s, j) => (
                  <div key={j} style={{ background: s.color, height: `${(s.value / Math.max(total, 1)) * 100}%`, minHeight: s.value > 0 ? 2 : 0 }} />
                ))}
              </div>
              <span className="text-[9px] text-dim">{g.label}</span>
            </div>
          );
        })}
      </div>
      {legend && groups[0] && (
        <div className="mt-2 flex flex-wrap gap-3">
          {groups[0].segments.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-dim">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tiny inline sparkline. */
export function Sparkline({ points, width = 96, height = 32, color = CY }: { points: number[]; width?: number; height?: number; color?: string }) {
  if (points.length < 2) return <span className="text-dim text-xs">—</span>;
  const max = Math.max(...points); const min = Math.min(...points); const span = max - min || 1;
  const line = points.map((v, i) => [ (i / (points.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6) ] as [number, number]);
  return (
    <svg width={width} height={height} role="img" aria-label="sparkline">
      <path d={smoothPath(line)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export const CHART_COLORS = { vio: VIO, cy: CY, gold: GOLD, danger: DANGER };
