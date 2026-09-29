// Aurora Wash — ENVIRONMENT.
// Original: slow curtains of polar light — tall additive gradient ribbons in
// mint, ice and violet that breathe across the sky of your frame.
import type { LensDefinition } from '../types';
import { mulberry32, thumbScene } from './utils';

const CURTAINS = [
  { color: '46, 255, 170', baseX: 0.22, baseY: 0.30, speed: 0.45, phase: 0.0, alpha: 0.20 },
  { color: '56, 225, 255', baseX: 0.52, baseY: 0.24, speed: 0.32, phase: 2.1, alpha: 0.16 },
  { color: '150, 92, 255', baseX: 0.80, baseY: 0.34, speed: 0.52, phase: 4.4, alpha: 0.18 },
];

function createLens(): LensDefinition {
  // Fixed starfield for the upper sky.
  const rand = mulberry32(90210);
  const stars: Array<{ x: number; y: number; r: number; s: number }> = [];
  for (let i = 0; i < 46; i++) {
    stars.push({ x: rand(), y: rand() * 0.55, r: 0.6 + rand() * 1.4, s: rand() * 10 });
  }

  return {
    id: 'aurora-wash',
    name: 'Aurora Wash',
    category: 'ENVIRONMENT',
    description: 'Slow curtains of polar light across your sky.',
    isPremium: false,

    apply(ctx, frame, _faces, t) {
      void frame;
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;

      // Deepen the sky a touch so the aurora reads.
      const night = ctx.createLinearGradient(0, 0, 0, H);
      night.addColorStop(0, 'rgba(8, 10, 32, 0.28)');
      night.addColorStop(0.6, 'rgba(8, 10, 32, 0.10)');
      night.addColorStop(1, 'rgba(8, 10, 32, 0)');
      ctx.fillStyle = night;
      ctx.fillRect(0, 0, W, H);

      // Aurora curtains — additive tall ellipses.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const c of CURTAINS) {
        const cxp = (c.baseX + Math.sin(t * c.speed + c.phase) * 0.09) * W;
        const sway = Math.sin(t * c.speed * 1.7 + c.phase * 2) * W * 0.03;
        const cyp = c.baseY * H;
        const rx = W * 0.16;
        const ry = H * 0.42;
        const breathe = c.alpha * (0.75 + 0.25 * Math.sin(t * 0.9 + c.phase));
        // Elliptical curtain via transformed gradient.
        ctx.save();
        ctx.translate(cxp + sway, cyp);
        ctx.scale(rx, ry);
        const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        eg.addColorStop(0, `rgba(${c.color}, ${breathe.toFixed(3)})`);
        eg.addColorStop(0.55, `rgba(${c.color}, ${(breathe * 0.45).toFixed(3)})`);
        eg.addColorStop(1, `rgba(${c.color}, 0)`);
        ctx.fillStyle = eg;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
      ctx.restore();

      // Twinkling stars.
      ctx.save();
      for (const s of stars) {
        const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.7 + s.s));
        ctx.globalAlpha = tw * 0.8;
        ctx.fillStyle = '#dfeaff';
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    thumbnail(canvas) {
      thumbScene(canvas, 150, 200);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const cols = ['46, 255, 170', '56, 225, 255', '150, 92, 255'];
      for (let i = 0; i < 3; i++) {
        const g = ctx.createLinearGradient(w * (0.2 + i * 0.25), 0, w * (0.35 + i * 0.25), h * 0.5);
        g.addColorStop(0, `rgba(${cols[i]}, 0.45)`);
        g.addColorStop(1, `rgba(${cols[i]}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h * 0.6);
      }
      ctx.restore();
    },
  };
}

export const auroraWash: LensDefinition = createLens();
