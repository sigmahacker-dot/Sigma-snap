// Prism Rain — WEATHER (premium).
// Original: diagonal rain streaks that cycle through the spectrum, over soft
// drifting prismatic wash bands. Each drop refracts its own hue.
import type { LensDefinition } from '../types';
import { ParticlePool, thumbScene } from './utils';

function createLens(): LensDefinition {
  const drops = new ParticlePool(
    80,
    (p, rand) => {
      p.x = rand() * 1.3 - 0.15;
      p.y = rand() * 1.2 - 0.2;
      p.vx = 0.16; // diagonal drift (fractions of width per second)
      p.vy = 0.55 + rand() * 0.6;
      p.maxLife = 1.4 + rand() * 1.2;
      p.life = p.maxLife;
      p.size = 0.05 + rand() * 0.11; // streak length as fraction of H
      p.seed = rand() * 1000;
    },
    777,
  );
  let lastT = -1;

  return {
    id: 'prism-rain',
    name: 'Prism Rain',
    category: 'WEATHER',
    description: 'Rain that falls in ribbons of refracted color.',
    isPremium: true,

    apply(ctx, frame, _faces, t) {
      void frame;
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;
      const dt = lastT < 0 ? 0.016 : Math.min(0.05, Math.max(0.001, t - lastT));
      lastT = t;

      // Wrap drops manually for seamless rain (pool respawn would pop).
      for (const p of drops.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > 1.15) {
          p.y -= 1.3;
          p.x -= 0.2;
          if (p.x < -0.15) p.x += 1.45;
        }
        if (p.x > 1.2) p.x -= 1.35;
      }

      // Soft prismatic wash bands behind the rain.
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const bx = W * (0.2 + i * 0.3) + Math.sin(t * 0.4 + i * 2.2) * W * 0.08;
        const hue = (t * 24 + i * 120) % 360;
        const g = ctx.createLinearGradient(bx - W * 0.12, 0, bx + W * 0.12, H);
        g.addColorStop(0, `hsla(${hue}, 90%, 65%, 0)`);
        g.addColorStop(0.5, `hsla(${hue}, 90%, 65%, 0.07)`);
        g.addColorStop(1, `hsla(${hue}, 90%, 65%, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();

      // Rain streaks: slanted along the fall direction.
      const dx = 0.28; // slant
      const dy = 1;
      const inv = 1 / Math.hypot(dx, dy);
      const ux = dx * inv;
      const uy = dy * inv;
      ctx.save();
      ctx.lineCap = 'round';
      for (const p of drops.parts) {
        const hue = (p.seed * 1.7 + t * 36) % 360;
        const len = p.size * H;
        const x0 = p.x * W;
        const y0 = p.y * H;
        const alpha = 0.28 + 0.3 * (0.5 + 0.5 * Math.sin(t * 6 + p.seed));
        ctx.strokeStyle = `hsla(${hue}, 95%, 68%, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + (p.seed % 1) * 1.6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 - ux * len, y0 - uy * len);
        ctx.stroke();
        // Bright head.
        ctx.fillStyle = `hsla(${hue}, 100%, 82%, ${(alpha + 0.25).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x0, y0, ctx.lineWidth * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Cool storm tint.
      ctx.fillStyle = 'rgba(60, 90, 160, 0.08)';
      ctx.fillRect(0, 0, W, H);
    },

    thumbnail(canvas) {
      thumbScene(canvas, 210, 230);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.lineCap = 'round';
      const w = canvas.width;
      const h = canvas.height;
      const hues = [0, 50, 120, 190, 280, 320];
      for (let i = 0; i < 18; i++) {
        const x = ((i * 37) % w) + 4;
        const y = ((i * 53) % h) + 4;
        ctx.strokeStyle = `hsla(${hues[i % hues.length]}, 95%, 68%, 0.85)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y - 12);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

export const prismRain: LensDefinition = createLens();
