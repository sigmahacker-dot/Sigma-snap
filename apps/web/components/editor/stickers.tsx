// Original SIGMA SNAP sticker pack — 12 geometric stickers, hand-drawn with
// canvas paths. No emoji, no copied artwork.
'use client';
import React, { useEffect, useRef } from 'react';
import type { StickerId } from './types';

export const STICKERS: Array<{ id: StickerId; label: string }> = [
  { id: 'star', label: 'Star' },
  { id: 'heart', label: 'Heart' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'crown', label: 'Crown' },
  { id: 'flower', label: 'Flower' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'moon', label: 'Moon' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'ring', label: 'Ring' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'hex', label: 'Hex' },
  { id: 'burst', label: 'Burst' },
];

function pathStar(ctx: CanvasRenderingContext2D, r: number, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Draw the sticker centered at (0,0), fitting in a ~100×100 box. */
export function drawStickerArt(ctx: CanvasRenderingContext2D, id: StickerId): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = 'rgba(20,16,40,0.9)';
  const ow = 5;
  switch (id) {
    case 'star': {
      pathStar(ctx, 44);
      ctx.fillStyle = '#FFC44D'; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      pathStar(ctx, 20);
      ctx.fillStyle = '#FFE9B8'; ctx.fill();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, 34);
      ctx.bezierCurveTo(-48, -2, -34, -40, 0, -18);
      ctx.bezierCurveTo(34, -40, 48, -2, 0, 34);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -40, 0, 36);
      g.addColorStop(0, '#FF7D9C'); g.addColorStop(1, '#FF2E63');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      ctx.beginPath(); ctx.arc(-14, -14, 7, 0, 6.29);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
      break;
    }
    case 'bolt': {
      ctx.beginPath();
      ctx.moveTo(10, -46); ctx.lineTo(-24, 8); ctx.lineTo(-4, 8);
      ctx.lineTo(-10, 46); ctx.lineTo(24, -8); ctx.lineTo(4, -8);
      ctx.closePath();
      ctx.fillStyle = '#38E1FF'; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      break;
    }
    case 'crown': {
      ctx.beginPath();
      ctx.moveTo(-40, 26); ctx.lineTo(-44, -24); ctx.lineTo(-22, -6);
      ctx.lineTo(0, -36); ctx.lineTo(22, -6); ctx.lineTo(44, -24); ctx.lineTo(40, 26);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -36, 0, 28);
      g.addColorStop(0, '#FFE066'); g.addColorStop(1, '#F5A623');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      ctx.fillStyle = '#FF5470';
      for (const cx of [-22, 0, 22]) { ctx.beginPath(); ctx.arc(cx, 6, 6, 0, 6.29); ctx.fill(); }
      ctx.fillStyle = '#7C5CFF';
      ctx.beginPath(); ctx.arc(0, -36, 7, 0, 6.29); ctx.fill();
      break;
    }
    case 'flower': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, -26, 13, 24, 0, 0, 6.29);
        ctx.fillStyle = i % 2 ? '#B388FF' : '#7C5CFF'; ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = outline; ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.29);
      ctx.fillStyle = '#FFC44D'; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(0, -44); ctx.lineTo(32, -8); ctx.lineTo(0, 44); ctx.lineTo(-32, -8);
      ctx.closePath();
      const g = ctx.createLinearGradient(-32, 0, 32, 0);
      g.addColorStop(0, '#7DE8FF'); g.addColorStop(0.5, '#E3FBFF'); g.addColorStop(1, '#38B6FF');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-32, -8); ctx.lineTo(32, -8); ctx.moveTo(0, -44); ctx.lineTo(-14, -8); ctx.lineTo(0, 44);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
      break;
    }
    case 'moon': {
      // Crescent via two arcs in one path (opposite winding).
      ctx.beginPath(); ctx.arc(4, -2, 38, 0, 6.29);
      ctx.arc(22, -16, 33, 0, 6.29, true);
      ctx.closePath();
      ctx.fillStyle = '#FFE9A8'; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      ctx.save(); ctx.translate(-30, -30);
      pathStar(ctx, 10, 4, 0.35);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
      break;
    }
    case 'sparkle': {
      pathStar(ctx, 44, 4, 0.22);
      ctx.fillStyle = '#E9E4FF'; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = '#7C5CFF'; ctx.stroke();
      pathStar(ctx, 16);
      ctx.save(); ctx.translate(30, 28); ctx.fillStyle = '#7C5CFF'; ctx.fill(); ctx.restore();
      break;
    }
    case 'ring': {
      ctx.beginPath(); ctx.arc(0, 0, 36, 0, 6.29);
      ctx.lineWidth = 16; ctx.strokeStyle = '#38E1FF'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 36, 0, 6.29);
      ctx.lineWidth = 4; ctx.strokeStyle = outline; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, 6.29);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
      break;
    }
    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(0, -42); ctx.lineTo(40, 30); ctx.lineTo(-40, 30); ctx.closePath();
      const g = ctx.createLinearGradient(0, -42, 0, 32);
      g.addColorStop(0, '#7CFFB2'); g.addColorStop(1, '#12B76A');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(20, 18); ctx.lineTo(-20, 18); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
      break;
    }
    case 'hex': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * 42, y = Math.sin(a) * 42;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#7C5CFF'; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * 24, y = Math.sin(a) * 24;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#38E1FF'; ctx.fill();
      break;
    }
    case 'burst': {
      pathStar(ctx, 44, 12, 0.72);
      const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 46);
      g.addColorStop(0, '#FFD166'); g.addColorStop(1, '#FF6B35');
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.29);
      ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Thumbnail preview rendered with the exact same art as the canvas. */
export function StickerThumb({ id, size = 44 }: { id: StickerId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale((size * dpr) / 120, (size * dpr) / 120);
    ctx.translate(60, 60);
    drawStickerArt(ctx, id);
  }, [id, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}
