// Glitch Static — TRENDING.
// Original: a restless broadcast signal — constant micro RGB-split plus
// rolling surge windows of slice displacement, channel tearing and static.
import type { LensDefinition } from '../types';
import { sampleLowRes, thumbScene } from './utils';

const MAX_W = 160;

function createLens(): LensDefinition {
  // Lazily created on first apply() — never at module scope (SSR-safe).
  let glitch: HTMLCanvasElement | null = null;
  const buf = (): HTMLCanvasElement => {
    if (!glitch) glitch = document.createElement('canvas');
    return glitch;
  };
  let gw = 0;
  let gh = 0;

  // Deterministic pseudo-random in [0,1).
  const rnd = (n: number): number => {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  return {
    id: 'glitch-static',
    name: 'Glitch Static',
    category: 'TRENDING',
    description: 'A restless signal: RGB tears and rolling static.',
    isPremium: false,

    apply(ctx, frame, _faces, t) {
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;
      const s = sampleLowRes(frame, MAX_W);
      if (!s) return;
      const { w, h, data } = s;

      const g = buf();
      if (gw !== w || gh !== h) {
        g.width = w;
        g.height = h;
        gw = w;
        gh = h;
      }
      const gctx = g.getContext('2d');
      if (!gctx) return;
      const out = gctx.createImageData(w, h);
      const src = data.data;
      const dst = out.data;

      // Surge windows: ~0.35s of heavy tearing every few seconds.
      const cycle = t % 3.7;
      const surge = cycle < 0.35 ? 1 - cycle / 0.35 : 0;
      const base = 1.5; // constant micro split (px at sample res)
      const tear = base + surge * 7;

      for (let y = 0; y < h; y++) {
        // Per-row slice displacement during surges.
        const rowSeed = Math.floor(t * 24) * 131 + y * 17;
        const rowTear = rnd(rowSeed) > 1 - surge * 0.55;
        const roff = rowTear ? Math.round((rnd(rowSeed + 5) - 0.5) * tear * 2.4) : 0;
        const kR = Math.round(tear * (0.7 + rnd(rowSeed + 9) * 0.6)); // red shift
        const kB = Math.round(tear * (0.7 + rnd(rowSeed + 13) * 0.6)); // blue shift
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          const xr = Math.max(0, Math.min(w - 1, x - kR + roff));
          const xb = Math.max(0, Math.min(w - 1, x + kB + roff));
          const xg = Math.max(0, Math.min(w - 1, x + roff));
          const orr = (y * w + xr) * 4;
          const obb = (y * w + xb) * 4;
          const ogg = (y * w + xg) * 4;
          dst[o] = src[orr];
          dst[o + 1] = src[ogg + 1];
          dst[o + 2] = src[obb + 2];
          dst[o + 3] = 255;
        }
      }

      // Static noise sprinkled during surges.
      if (surge > 0) {
        const n = Math.floor(w * h * surge * 0.02);
        for (let i = 0; i < n; i++) {
          const o = (Math.floor(rnd(i * 3 + Math.floor(t * 24)) * w * h) * 4);
          const v = rnd(i * 7 + 1) > 0.5 ? 255 : 0;
          dst[o] = v;
          dst[o + 1] = v;
          dst[o + 2] = v;
        }
      }
      gctx.putImageData(out, 0, 0);

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(g, 0, 0, W, H);
      ctx.restore();

      // Rolling dark band during surges.
      if (surge > 0) {
        const bandY = ((t * 1.4) % 1.3 - 0.15) * H;
        const g = ctx.createLinearGradient(0, bandY - 24, 0, bandY + 24);
        g.addColorStop(0, 'rgba(0, 0, 0, 0)');
        g.addColorStop(0.5, `rgba(0, 0, 0, ${(0.35 * surge).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, bandY - 24, W, 48);
      }
    },

    thumbnail(canvas) {
      thumbScene(canvas, 190, 320);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.save();
      // Torn color bars.
      const bars: Array<[string, number, number]> = [
        ['rgba(255, 70, 90, 0.75)', 0.18, 6],
        ['rgba(70, 255, 170, 0.75)', 0.47, -8],
        ['rgba(90, 170, 255, 0.75)', 0.72, 5],
      ];
      for (const [col, fy, off] of bars) {
        ctx.fillStyle = col;
        ctx.fillRect(w * 0.08 + off, h * fy, w * 0.84, 5);
      }
      ctx.restore();
    },
  };
}

export const glitchStatic: LensDefinition = createLens();
