// Gloom Pulse — HORROR (premium).
// Original: a slowly breathing darkness that swallows the frame edges,
// strobing desaturated glitch slices, and hollow shadows over faces.
import type { LensDefinition } from '../types';
import { activeFaces, makeNoiseTile, thumbScene } from './utils';

function createLens(): LensDefinition {
  // Lazily created on first apply() — never at module scope (SSR-safe).
  let grain: HTMLCanvasElement | null = null;
  const grainBuf = (): HTMLCanvasElement => {
    if (!grain) grain = makeNoiseTile(128, 666);
    return grain;
  };

  // Deterministic flicker signal in [0,1).
  const flick = (t: number, salt: number): number => {
    const x = Math.sin(Math.floor(t * 9 + salt) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  return {
    id: 'gloom-pulse',
    name: 'Gloom Pulse',
    category: 'HORROR',
    description: 'The dark breathes. Faces hollow out. Do not watch alone.',
    isPremium: true,

    apply(ctx, frame, faces, t) {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;

      // Breathing vignette of darkness.
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.35);
      const dark = 0.42 + 0.30 * pulse;
      const vg = ctx.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * 0.22,
        W / 2, H / 2, Math.max(W, H) * 0.72,
      );
      vg.addColorStop(0, 'rgba(4, 0, 8, 0)');
      vg.addColorStop(1, `rgba(4, 0, 8, ${dark.toFixed(3)})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // Hollow shadows over faces — sunken eye sockets.
      for (const f of activeFaces(faces)) {
        const cx = f.x + f.w / 2;
        const ey = f.y + f.h * 0.40;
        for (const side of [-1, 1]) {
          const ex = cx + side * f.w * 0.17;
          const r = f.w * 0.13;
          const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
          g.addColorStop(0, `rgba(6, 0, 10, ${0.62 + 0.2 * pulse})`);
          g.addColorStop(1, 'rgba(6, 0, 10, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ex, ey, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Faint crimson glint that comes and goes.
        if (flick(t, 3.7) > 0.55) {
          ctx.fillStyle = `rgba(255, 40, 50, ${(0.25 * pulse).toFixed(3)})`;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(cx + side * f.w * 0.17, ey, Math.max(1.5, f.w * 0.018), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Desaturated glitch slices during "surge" windows.
      const surge = flick(t, 11.2);
      if (surge > 0.68) {
        const strength = (surge - 0.68) / 0.32;
        const slices = 4 + Math.floor(strength * 4);
        ctx.save();
        const prev = ctx.filter;
        ctx.filter = `grayscale(1) brightness(${0.75 + strength * 0.2})`;
        for (let i = 0; i < slices; i++) {
          const sy = flick(t, 40 + i) * H;
          const sh = 12 + flick(t, 60 + i) * H * 0.08;
          const off = (flick(t, 80 + i) - 0.5) * W * 0.12 * strength;
          ctx.drawImage(frame, 0, sy, W, sh, off, sy, W, sh);
        }
        ctx.filter = prev;
        ctx.restore();
        // Blood-moon tint flash.
        ctx.fillStyle = `rgba(150, 16, 26, ${(0.10 * strength).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Uneven grain.
      ctx.save();
      ctx.globalAlpha = 0.05 + 0.05 * pulse;
      const pattern = ctx.createPattern(grainBuf(), 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    },

    thumbnail(canvas) {
      thumbScene(canvas, 280, 300);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const vg = ctx.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w * 0.75);
      vg.addColorStop(0, 'rgba(4, 0, 8, 0)');
      vg.addColorStop(1, 'rgba(4, 0, 8, 0.85)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      // Jagged crack.
      ctx.strokeStyle = 'rgba(160, 20, 30, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let x = w * 0.15;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < h) {
        x += (Math.sin(y * 0.4) * 8);
        y += 9;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
  };
}

export const gloomPulse: LensDefinition = createLens();
