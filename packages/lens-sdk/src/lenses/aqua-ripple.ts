// Aqua Ripple — DISTORTION.
// Original: the whole frame is re-drawn as horizontal ribbons, each shifted
// by layered sine waves so the world looks submerged, plus a drifting sheen.
import type { LensDefinition } from '../types';
import { thumbScene } from './utils';

const SLICE_H = 8;

function createLens(): LensDefinition {
  return {
    id: 'aqua-ripple',
    name: 'Aqua Ripple',
    category: 'DISTORTION',
    description: 'The world, seen through rippling water.',
    isPremium: false,

    apply(ctx, frame, _faces, t) {
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;

      const amp = W * 0.014 * (0.7 + 0.3 * Math.sin(t * 0.9));
      const n = Math.ceil(H / SLICE_H);
      for (let i = 0; i < n; i++) {
        const y = i * SLICE_H;
        const off =
          Math.sin(y * 0.045 + t * 3.2) * amp +
          Math.sin(y * 0.013 - t * 1.7) * amp * 0.6;
        ctx.drawImage(frame, 0, y, W, SLICE_H + 1, off, y, W, SLICE_H + 1);
      }

      // Drifting light sheen.
      const sheenX = ((t * 0.07) % 1.6) - 0.3;
      const g = ctx.createLinearGradient(
        W * sheenX, 0, W * (sheenX + 0.35), H,
      );
      g.addColorStop(0, 'rgba(120, 220, 255, 0)');
      g.addColorStop(0.5, 'rgba(120, 220, 255, 0.10)');
      g.addColorStop(1, 'rgba(120, 220, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Cool underwater tint.
      ctx.fillStyle = 'rgba(30, 120, 160, 0.10)';
      ctx.fillRect(0, 0, W, H);
    },

    thumbnail(canvas) {
      thumbScene(canvas, 195, 175);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(140, 225, 255, 0.85)';
      ctx.lineWidth = 2;
      const w = canvas.width;
      const h = canvas.height;
      for (let y = 6; y < h; y += 10) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const yy = y + Math.sin(x * 0.12 + y) * 3;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

export const aquaRipple: LensDefinition = createLens();
