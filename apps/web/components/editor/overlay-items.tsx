// Interactive canvas overlays shared by the photo and video editors:
// draggable text layers, selectable stickers with scale/rotate handles,
// crop overlay with draggable corners, and the drawing layer.
'use client';
import React, { useEffect, useRef, useState } from 'react';
import { IconTrash } from '@/lib/icons';
import { FONTS } from './types';
import type { CropRect, DrawStroke, DrawTool, StickerInstance, TextLayer } from './types';
import { uid } from './types';
import { drawStrokes } from './pipeline';
import { readBrush } from './panels';

// ─── container size hook ───────────────────────────────────────────────────
export function useContainerSize<T extends HTMLElement>(): [React.RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// ─── Draggable text ────────────────────────────────────────────────────────
export function DraggableText({ layer, dispW, onMove, selected, onSelect }:
  { layer: TextLayer; dispW: number; onMove: (x: number, y: number) => void;
    selected: boolean; onSelect: () => void }) {
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const font = FONTS.find((f) => f.id === layer.fontId) ?? FONTS[0];
  const scale = dispW / 1080;
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        drag.current = { dx: e.clientX - r.left - layer.x * r.width, dy: e.clientY - r.top - layer.y * r.height, moved: false };
        onSelect();
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        const nx = Math.min(1, Math.max(0, (e.clientX - r.left - d.dx) / r.width));
        const ny = Math.min(1, Math.max(0, (e.clientY - r.top - d.dy) / r.height));
        d.moved = true;
        onMove(nx, ny);
      }}
      onPointerUp={() => { drag.current = null; }}
      className={`absolute max-w-[90%] touch-none select-none whitespace-pre-wrap break-words text-center ${selected ? 'z-20' : 'z-10'}`}
      style={{
        left: `${layer.x * 100}%`, top: `${layer.y * 100}%`,
        transform: `translate(-50%,-50%) rotate(${layer.rotation}deg)`,
        fontFamily: font.stack,
        fontWeight: layer.bold ? 700 : 400,
        fontSize: Math.max(10, layer.size * scale),
        lineHeight: 1.28,
        color: layer.color,
        textAlign: layer.align,
        WebkitTextStroke: layer.stroke ? `${Math.max(1, layer.size * scale * 0.05)}px ${layer.strokeColor}` : undefined,
        textShadow: layer.glow
          ? `0 0 ${18 * scale}px ${layer.color}`
          : layer.shadow ? `0 ${3 * scale}px ${10 * scale}px rgba(0,0,0,.55)` : undefined,
        outline: selected ? '2px dashed #7C5CFF' : 'none',
        outlineOffset: 4,
        cursor: 'move',
      }}>
      {layer.text || ' '}
    </div>
  );
}

// ─── Selectable sticker with scale/rotate handles ──────────────────────────
export function DraggableSticker({ st, dispW, selected, onSelect, onMove, onScale, onRotate, onDelete }:
  { st: StickerInstance; dispW: number; selected: boolean; onSelect: () => void;
    onMove: (x: number, y: number) => void; onScale: (s: number) => void;
    onRotate: (r: number) => void; onDelete: () => void }) {
  const drag = useRef<'move' | 'scale' | 'rotate' | null>(null);
  const start = useRef({ cx: 0, cy: 0, dist: 0, ang: 0, scale: 1, rot: 0 });
  const scale = dispW / 1080;
  const px = 150 * scale * st.scale; // display diameter

  const geom = (e: React.PointerEvent, container: HTMLElement) => {
    const r = container.getBoundingClientRect();
    const cx = st.x * r.width, cy = st.y * r.height;
    const dx = e.clientX - r.left - cx, dy = e.clientY - r.top - cy;
    return { r, dist: Math.hypot(dx, dy), ang: (Math.atan2(dy, dx) * 180) / Math.PI };
  };

  return (
    <div className={`absolute ${selected ? 'z-20' : 'z-10'}`}
      style={{ left: `${st.x * 100}%`, top: `${st.y * 100}%`, width: px, height: px, transform: 'translate(-50%,-50%)' }}>
      <div
        className="relative h-full w-full touch-none select-none"
        style={{ transform: `rotate(${st.rotation}deg)` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const container = (e.currentTarget.parentElement?.parentElement as HTMLElement);
          const g = geom(e, container);
          drag.current = 'move';
          start.current = { cx: 0, cy: 0, dist: 0, ang: 0, scale: st.scale, rot: st.rotation };
          start.current.cx = e.clientX - g.r.left - st.x * g.r.width;
          start.current.cy = e.clientY - g.r.top - st.y * g.r.height;
          onSelect();
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const container = (e.currentTarget.parentElement?.parentElement as HTMLElement);
          const g = geom(e, container);
          if (drag.current === 'move') {
            onMove(
              Math.min(1, Math.max(0, (e.clientX - g.r.left - start.current.cx) / g.r.width)),
              Math.min(1, Math.max(0, (e.clientY - g.r.top - start.current.cy) / g.r.height)),
            );
          } else if (drag.current === 'scale') {
            const base = Math.max(20, start.current.dist);
            onScale(Math.min(4, Math.max(0.2, start.current.scale * (g.dist / base))));
          } else if (drag.current === 'rotate') {
            let d = g.ang - start.current.ang;
            if (d > 180) d -= 360; if (d < -180) d += 360;
            onRotate(start.current.rot + d);
          }
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}>
        {/* rendered art lives on the main canvas; overlay shows a hit ring */}
        <div className={`absolute inset-0 rounded-full ${selected ? 'ring-2 ring-vio' : ''}`} style={{ cursor: 'move' }} />
        {selected && (
          <>
            <button
              className="absolute -bottom-2 -right-2 z-30 h-8 w-8 touch-none rounded-full bg-vio text-sm font-bold text-white shadow-glow"
              aria-label="Scale sticker"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                const container = (e.currentTarget.parentElement?.parentElement?.parentElement as HTMLElement);
                const g = geom(e, container);
                drag.current = 'scale';
                start.current = { cx: 0, cy: 0, dist: g.dist, ang: 0, scale: st.scale, rot: st.rotation };
              }}
              onPointerMove={(e) => {
                if (drag.current !== 'scale') return;
                const container = (e.currentTarget.parentElement?.parentElement?.parentElement as HTMLElement);
                const g = geom(e, container);
                const base = Math.max(20, start.current.dist);
                onScale(Math.min(4, Math.max(0.2, start.current.scale * (g.dist / base))));
              }}
              onPointerUp={(e) => { e.stopPropagation(); drag.current = null; }}>
              ⤡
            </button>
            <button
              className="absolute -right-2 -top-2 z-30 h-8 w-8 touch-none rounded-full bg-cy text-sm font-bold text-void"
              aria-label="Rotate sticker"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                const container = (e.currentTarget.parentElement?.parentElement?.parentElement as HTMLElement);
                const g = geom(e, container);
                drag.current = 'rotate';
                start.current = { cx: 0, cy: 0, dist: 0, ang: g.ang, scale: st.scale, rot: st.rotation };
              }}
              onPointerMove={(e) => {
                if (drag.current !== 'rotate') return;
                const container = (e.currentTarget.parentElement?.parentElement?.parentElement as HTMLElement);
                const g = geom(e, container);
                let d = g.ang - start.current.ang;
                if (d > 180) d -= 360; if (d < -180) d += 360;
                onRotate(start.current.rot + d);
              }}
              onPointerUp={(e) => { e.stopPropagation(); drag.current = null; }}>
              ⟳
            </button>
            <button
              className="absolute -left-2 -top-2 z-30 flex h-8 w-8 touch-none items-center justify-center rounded-full bg-danger text-white"
              aria-label="Delete sticker"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <IconTrash size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Crop overlay ──────────────────────────────────────────────────────────
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;

export function CropOverlay({ crop, aspect, onChange }:
  { crop: CropRect; aspect: number; onChange: (c: CropRect) => void }) {
  const drag = useRef<{ kind: 'move' | (typeof CORNERS)[number]; sx: number; sy: number; orig: CropRect } | null>(null);

  const clampRect = (c: CropRect): CropRect => {
    let { x, y, w, h } = c;
    w = Math.min(1, Math.max(0.05, w)); h = Math.min(1, Math.max(0.05, h));
    x = Math.min(1 - w, Math.max(0, x)); y = Math.min(1 - h, Math.max(0, y));
    return { x, y, w, h };
  };

  const applyAspect = (c: CropRect, fixedCorner: (typeof CORNERS)[number]): CropRect => {
    if (!aspect) return c;
    // keep the dragged corner, resize to aspect around opposite corner
    const opp = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }[fixedCorner] as (typeof CORNERS)[number];
    const ax = opp.includes('e') ? c.x : c.x + c.w;
    const ay = opp.includes('s') ? c.y : c.y + c.h;
    let w = c.w, h = c.w / aspect;
    if (ay + h > 1 || ay + h < 0) { h = c.h; w = h * aspect; }
    const x = opp.includes('e') ? ax : ax - w;
    const y = opp.includes('s') ? ay : ay - h;
    return clampRect({ x, y, w, h });
  };

  const onDown = (kind: 'move' | (typeof CORNERS)[number]) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, sx: e.clientX, sy: e.clientY, orig: { ...crop } };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const el = (e.currentTarget as HTMLElement);
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - d.sx) / r.width;
    const dy = (e.clientY - d.sy) / r.height;
    const o = d.orig;
    let next: CropRect;
    if (d.kind === 'move') {
      next = clampRect({ ...o, x: o.x + dx, y: o.y + dy });
    } else {
      const k = d.kind;
      let x = o.x, y = o.y, w = o.w, h = o.h;
      if (k.includes('e')) w = o.w + dx; else { x = o.x + dx; w = o.w - dx; }
      if (k.includes('s')) h = o.h + dy; else { y = o.y + dy; h = o.h - dy; }
      next = applyAspect(clampRect({ x, y, w, h }), k);
    }
    onChange(next);
  };
  const end = () => { drag.current = null; };

  return (
    <div className="absolute inset-0 z-30 touch-none" onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}>
      {/* dim outside */}
      <div className="absolute inset-0 bg-black/55" style={{
        clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%, ${(crop.x + crop.w) * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${crop.y * 100}%)`,
      }} />
      <div className="absolute border-2 border-white/90"
        style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
        onPointerDown={onDown('move')}>
        {/* rule-of-thirds */}
        {[1 / 3, 2 / 3].map((f) => (
          <React.Fragment key={f}>
            <div className="absolute top-0 h-full w-px bg-white/40" style={{ left: `${f * 100}%` }} />
            <div className="absolute left-0 h-px w-full bg-white/40" style={{ top: `${f * 100}%` }} />
          </React.Fragment>
        ))}
        {CORNERS.map((c) => (
          <div key={c}
            onPointerDown={onDown(c)}
            className="absolute h-7 w-7 rounded-full border-2 border-white bg-vio shadow-glow"
            style={{
              left: c.includes('e') ? '100%' : 0, top: c.includes('s') ? '100%' : 0,
              transform: 'translate(-50%,-50%)', cursor: 'nwse-resize',
            }} />
        ))}
      </div>
    </div>
  );
}

// ─── Drawing layer ─────────────────────────────────────────────────────────
/**
 * Largest centered crop rect with the given pixel aspect ratio, in normalized
 * coords of an image with pixel dims (rdW × rdH).
 */
export function centeredAspectCrop(aspect: number, rdW: number, rdH: number): CropRect {
  let w = 1;
  let h = (w * rdW) / (rdH * aspect);
  if (h > 1) { h = 1; w = (h * rdH * aspect) / rdW; }
  w = Math.min(1, Math.max(0.05, w));
  h = Math.min(1, Math.max(0.05, h));
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
export function DrawingLayer({ tool, strokes, onStrokes, dispW, dispH, active }:
  { tool: DrawTool; strokes: DrawStroke[]; onStrokes: (s: DrawStroke[]) => void;
    dispW: number; dispH: number; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef<DrawStroke | null>(null);
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = Math.max(1, dispW * dpr);
    c.height = Math.max(1, dispH * dpr);
    // redraw in-progress stroke after resize
    const ctx = c.getContext('2d');
    if (ctx && current.current) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save(); ctx.scale(dpr, dpr);
      drawStrokes(ctx, [current.current], dispW, dispH);
      ctx.restore();
    }
  }, [dispW, dispH, dpr]);

  if (!active) return null;

  const pos = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const paint = (st: DrawStroke) => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save(); ctx.scale(dpr, dpr);
    drawStrokes(ctx, [st], dispW, dispH);
    ctx.restore();
  };

  return (
    <canvas ref={canvasRef}
      className="absolute inset-0 z-20 h-full w-full touch-none"
      style={{ cursor: 'crosshair' }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const b = readBrush();
        const p = pos(e);
        current.current = { id: uid(), tool, color: b.color, width: b.width, opacity: b.opacity, points: [p] };
        paint(current.current);
      }}
      onPointerMove={(e) => {
        const st = current.current;
        if (!st) return;
        st.points.push(pos(e));
        paint(st);
      }}
      onPointerUp={() => {
        const st = current.current;
        current.current = null;
        const c = canvasRef.current;
        c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        if (st && st.points.length > 0) onStrokes([...strokes, st]);
      }}
      onPointerCancel={() => {
        current.current = null;
        const c = canvasRef.current;
        c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      }}
    />
  );
}
