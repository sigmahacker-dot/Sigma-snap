// Starlight Bokeh — BACKGROUND.
// Original: dreamy out-of-focus light orbs (gold, ice-blue, rose) drifting
// upward with pulsing halos, over a gentle indigo wash.
import type { LensDefinition } from '../types';
import { ParticlePool, makeGlowSprite, thumbScene } from './utils';

// Lazily created on first use — never at module scope (SSR-safe).
let TINTS: HTMLCanvasElement[] | null = null;
function tints(): HTMLCanvasElement[] {
  return (TINTS ??= [
    makeGlowSprite(64, 'rgba(255, 214, 140, 1)', 'rgba(255, 180, 90, 0)'),
    makeGlowSprite(64, 'rgba(170, 220, 255, 1)', 'rgba(120, 180, 255, 0)'),
    makeGlowSprite(64, 'rgba(255, 170, 200, 1)', 'rgba(255, 140, 180, 0)'),
  ]);
}

function createLens(): LensDefinition {
  const pool = new ParticlePool(
    34,
    (p, rand) => {
      p.x = rand();
      p.y = rand();
      p.vx = (rand() - 0.5) * 0.02;
      p.vy = -(0.008 + rand() * 0.025);
      p.maxLife = 6 + rand() * 8;
      p.life = p.maxLife;
      p.size = 16 + rand() * 52;
      p.seed = rand() * 1000;
    },
    20260,
  );
  let lastT = -1;

  return {
    id: 'starlight-bokeh',
    name: 'Starlight Bokeh',
    category: 'BACKGROUND',
    description: 'Floating orbs of golden and icy light.',
    isPremium: false,

    apply(ctx, frame, _faces, t) {
      void frame;
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;
      const dt = lastT < 0 ? 0.016 : Math.min(0.05, Math.max(0.001, t - lastT));
      lastT = t;
      pool.update(dt);

      // Indigo wash.
      const wash = ctx.createLinearGradient(0, 0, 0, H);
      wash.addColorStop(0, 'rgba(40, 40, 90, 0.10)');
      wash.addColorStop(1, 'rgba(20, 16, 60, 0.22)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H);

      const unit = H / 720;
      for (const p of pool.parts) {
        const tw = 0.55 + 0.45 * Math.sin(t * 1.8 + p.seed);
        const fade = Math.min(1, (p.life / p.maxLife) * 3, ((p.maxLife - p.life) / p.maxLife) * 3 + 0.2);
        const palette = tints();
        const sprite = palette[Math.floor(p.seed) % palette.length];
        const r = p.size * unit;
        const sway = Math.sin(t * 0.8 + p.seed) * W * 0.01;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(0.75, tw * fade * 0.7));
        ctx.drawImage(sprite, (p.x * W + sway) - r / 2, p.y * H - r / 2, r, r);
        ctx.restore();
      }
    },

    thumbnail(canvas) {
      thumbScene(canvas, 240, 260);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const cols = ['255, 214, 140', '170, 220, 255', '255, 170, 200'];
      const spots: Array<[number, number, number, number]> = [
        [0.2, 0.25, 14, 0], [0.75, 0.2, 10, 1], [0.55, 0.7, 16, 2],
        [0.85, 0.6, 8, 0], [0.35, 0.85, 9, 1],
      ];
      for (const [fx, fy, r, ci] of spots) {
        const g = ctx.createRadialGradient(w * fx, h * fy, 0, w * fx, h * fy, r);
        g.addColorStop(0, `rgba(${cols[ci]}, 0.95)`);
        g.addColorStop(1, `rgba(${cols[ci]}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(w * fx, h * fy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

export const starlightBokeh: LensDefinition = createLens();
