// Galaxy Dust — TRENDING.
// Original: drifting violet/cyan nebula veils plus a field of twinkling
// stardust — a pocket cosmos over your camera.
import type { LensDefinition } from '../types';
import { ParticlePool, mulberry32, thumbScene } from './utils';

const NEBULAE = [
  { hue: '124, 92, 255', x: 0.28, y: 0.32, r: 0.55, speed: 0.21, phase: 0.0 },
  { hue: '56, 225, 255', x: 0.72, y: 0.58, r: 0.48, speed: 0.16, phase: 2.1 },
  { hue: '255, 92, 180', x: 0.5, y: 0.82, r: 0.42, speed: 0.26, phase: 4.2 },
];

function createLens(): LensDefinition {
  const stars = new ParticlePool(
    110,
    (p, rand) => {
      p.x = rand();
      p.y = rand();
      p.vx = (rand() - 0.5) * 0.006;
      p.vy = -(0.002 + rand() * 0.008);
      p.maxLife = 5 + rand() * 9;
      p.life = p.maxLife;
      p.size = 0.8 + rand() * 2.2;
      p.seed = rand() * 1000;
    },
    31337,
  );
  let lastT = -1;

  return {
    id: 'galaxy-dust',
    name: 'Galaxy Dust',
    category: 'TRENDING',
    description: 'Nebula veils and twinkling stardust.',
    isPremium: false,

    apply(ctx, frame, _faces, t) {
      void frame;
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;
      const dt = lastT < 0 ? 0.016 : Math.min(0.05, Math.max(0.001, t - lastT));
      lastT = t;
      stars.update(dt);

      // Nebula veils.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const neb of NEBULAE) {
        const nx = (neb.x + Math.sin(t * neb.speed + neb.phase) * 0.06) * W;
        const ny = (neb.y + Math.cos(t * neb.speed * 0.8 + neb.phase) * 0.05) * H;
        const nr = neb.r * Math.max(W, H);
        const breathe = 0.13 + 0.05 * Math.sin(t * 0.7 + neb.phase);
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        g.addColorStop(0, `rgba(${neb.hue}, ${breathe.toFixed(3)})`);
        g.addColorStop(1, `rgba(${neb.hue}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
      }
      ctx.restore();

      // Stardust.
      ctx.save();
      const unit = H / 720;
      for (const p of stars.parts) {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.2 + p.seed * 3.1));
        const fade = Math.min(1, p.life / (p.maxLife * 0.3));
        ctx.globalAlpha = tw * fade * 0.9;
        ctx.fillStyle = '#eef4ff';
        const r = p.size * unit;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    thumbnail(canvas) {
      thumbScene(canvas, 270, 290);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const rand = mulberry32(7);
      ctx.fillStyle = 'rgba(240, 244, 255, 0.9)';
      for (let i = 0; i < 22; i++) {
        ctx.beginPath();
        ctx.arc(rand() * w, rand() * h * 0.7, 0.6 + rand() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(w * 0.7, h * 0.25, 0, w * 0.7, h * 0.25, w * 0.5);
      g.addColorStop(0, 'rgba(124, 92, 255, 0.5)');
      g.addColorStop(1, 'rgba(124, 92, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  };
}

export const galaxyDust: LensDefinition = createLens();
