// Noir Letterbox — CINEMATIC.
// Original: anamorphic-style letterbox bars, a warm-highlight/cool-shadow
// grade, drifting film grain and a soft vignette — a tiny movie theater.
import type { LensDefinition } from '../types';
import { makeNoiseTile, thumbScene } from './utils';

function createLens(): LensDefinition {
  // Lazily created on first apply() — never at module scope (SSR-safe).
  let grain: HTMLCanvasElement | null = null;
  const grainBuf = (): HTMLCanvasElement => {
    if (!grain) grain = makeNoiseTile(128, 9001);
    return grain;
  };

  return {
    id: 'noir-letterbox',
    name: 'Noir Letterbox',
    category: 'CINEMATIC',
    description: 'Widescreen bars, film grain and a moody grade.',
    isPremium: false,

    apply(ctx, frame, _faces, t) {
      void frame;
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;

      // Color grade: warm highlights, cool shadows.
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      const grade = ctx.createLinearGradient(0, 0, 0, H);
      grade.addColorStop(0, 'rgba(255, 170, 110, 0.28)');
      grade.addColorStop(0.45, 'rgba(128, 128, 128, 0)');
      grade.addColorStop(1, 'rgba(50, 110, 180, 0.30)');
      ctx.fillStyle = grade;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Animated film grain.
      const ox = Math.abs(Math.sin(t * 12.9) * 43758.5453) % 1 * 128;
      const oy = Math.abs(Math.sin(t * 7.7 + 3.1) * 24634.6345) % 1 * 128;
      ctx.save();
      ctx.globalAlpha = 0.055;
      const pattern = ctx.createPattern(grainBuf(), 'repeat');
      if (pattern) {
        ctx.translate(-ox, -oy);
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, W + 128, H + 128);
      }
      ctx.restore();

      // Vignette.
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vg.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // Letterbox bars.
      const bar = Math.round(H * 0.105);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
    },

    thumbnail(canvas) {
      thumbScene(canvas, 220, 200);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h * 0.12);
      ctx.fillRect(0, h * 0.88, w, h * 0.12);
    },
  };
}

export const noirLetterbox: LensDefinition = createLens();
