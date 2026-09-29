// Ember Storm — SEASONAL (premium).
// Original: a rising storm of bonfire embers — flickering orange sparks with
// additive glow, swaying as they climb, over a faint warm haze.
import type { LensDefinition } from '../types';
import { ParticlePool, makeGlowSprite, thumbScene } from './utils';

// Lazily created on first use — never at module scope (SSR-safe).
let EMBER: HTMLCanvasElement | null = null;
let EMBER_DEEP: HTMLCanvasElement | null = null;
function sprites(): { EMBER: HTMLCanvasElement; EMBER_DEEP: HTMLCanvasElement } {
  if (!EMBER || !EMBER_DEEP) {
    EMBER = makeGlowSprite(64, 'rgba(255, 170, 80, 1)', 'rgba(255, 120, 40, 0)');
    EMBER_DEEP = makeGlowSprite(64, 'rgba(255, 90, 50, 1)', 'rgba(200, 40, 20, 0)');
  }
  return { EMBER, EMBER_DEEP };
}

function createLens(): LensDefinition {
  const pool = new ParticlePool(
    90,
    (p, rand) => {
      p.x = rand();
      p.y = 1.02 + rand() * 0.12;
      p.vx = (rand() - 0.5) * 0.06;
      p.vy = -(0.07 + rand() * 0.16);
      p.maxLife = 3.5 + rand() * 4;
      p.life = p.maxLife;
      p.size = 3 + rand() * 8;
      p.seed = rand() * 1000;
    },
    5150,
  );
  let lastT = -1;

  return {
    id: 'ember-storm',
    name: 'Ember Storm',
    category: 'SEASONAL',
    description: 'A rising storm of bonfire embers.',
    isPremium: true,

    apply(ctx, frame, _faces, t) {
      void frame;
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;
      const dt = lastT < 0 ? 0.016 : Math.min(0.05, Math.max(0.001, t - lastT));
      lastT = t;
      pool.update(dt);

      // Warm haze near the bottom.
      const haze = ctx.createLinearGradient(0, H * 0.55, 0, H);
      haze.addColorStop(0, 'rgba(255, 120, 40, 0)');
      haze.addColorStop(1, 'rgba(255, 110, 30, 0.12)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const unit = H / 720;
      for (const p of pool.parts) {
        const flicker = 0.45 + 0.55 * Math.abs(Math.sin(t * 9 + p.seed * 7.3));
        const fade = Math.min(1, p.life / (p.maxLife * 0.35));
        const sway = Math.sin(t * 2.6 + p.seed) * W * 0.012;
        const r = p.size * unit * (0.7 + 0.6 * flicker);
        const { EMBER, EMBER_DEEP } = sprites();
        const sprite = (Math.floor(p.seed) % 3 === 0) ? EMBER_DEEP : EMBER;
        ctx.globalAlpha = Math.max(0, Math.min(1, flicker * fade));
        ctx.drawImage(sprite, p.x * W + sway - r / 2, p.y * H - r / 2, r, r);
      }
      ctx.restore();
    },

    thumbnail(canvas) {
      thumbScene(canvas, 20, 10);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const dots: Array<[number, number, number]> = [
        [0.3, 0.8, 6], [0.6, 0.65, 4], [0.75, 0.85, 7],
        [0.45, 0.5, 3], [0.2, 0.55, 4], [0.85, 0.4, 3],
      ];
      for (const [fx, fy, r] of dots) {
        const g = ctx.createRadialGradient(w * fx, h * fy, 0, w * fx, h * fy, r);
        g.addColorStop(0, 'rgba(255, 170, 80, 0.95)');
        g.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(w * fx, h * fy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

export const emberStorm: LensDefinition = createLens();
