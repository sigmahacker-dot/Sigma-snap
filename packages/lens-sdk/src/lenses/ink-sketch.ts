// Ink Sketch — CARTOON.
// Original: the frame is re-imagined as ink on paper — luminance posterized
// to four ink washes on warm paper, edges dipped in ink, finished with grain.
import type { LensDefinition } from '../types';
import { makeNoiseTile, sampleLowRes, thumbScene } from './utils';

const MAX_W = 160;
const PAPER: [number, number, number] = [243, 236, 221];
const INK: [number, number, number] = [28, 26, 34];
// Ink density per posterized level (0 = paper, 1 = full ink).
const WASH = [0.04, 0.32, 0.64, 0.94];

function createLens(): LensDefinition {
  // Lazily created on first apply() — never at module scope (SSR-safe).
  let sketch: HTMLCanvasElement | null = null;
  let grain: HTMLCanvasElement | null = null;
  const buf = (): HTMLCanvasElement => {
    if (!sketch) sketch = document.createElement('canvas');
    return sketch;
  };
  const grainBuf = (): HTMLCanvasElement => {
    if (!grain) grain = makeNoiseTile(128, 4242);
    return grain;
  };
  let sw = 0;
  let sh = 0;

  return {
    id: 'ink-sketch',
    name: 'Ink Sketch',
    category: 'CARTOON',
    description: 'Hand-inked sketch on warm paper.',
    isPremium: false,

    apply(ctx, frame, _faces, _t) {
      void _faces;
      void _t;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;
      const s = sampleLowRes(frame, MAX_W);
      if (!s) return;
      const { w, h, data } = s;

      const sk = buf();
      if (sw !== w || sh !== h) {
        sk.width = w;
        sk.height = h;
        sw = w;
        sh = h;
      }
      const sctx = sk.getContext('2d');
      if (!sctx) return;
      const out = sctx.createImageData(w, h);
      const src = data.data;
      const dst = out.data;

      const lumAt = (x: number, y: number): number => {
        const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
        const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
        const o = (cy * w + cx) * 4;
        return src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114;
      };

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          const lum = lumAt(x, y);
          const level = Math.min(3, (lum / 64) | 0);
          // Dip strong edges in ink.
          const ex = Math.abs(lum - lumAt(x + 1, y));
          const ey = Math.abs(lum - lumAt(x, y + 1));
          const density = ex + ey > 30 ? 0.97 : WASH[level];
          dst[o] = PAPER[0] + (INK[0] - PAPER[0]) * density;
          dst[o + 1] = PAPER[1] + (INK[1] - PAPER[1]) * density;
          dst[o + 2] = PAPER[2] + (INK[2] - PAPER[2]) * density;
          dst[o + 3] = 255;
        }
      }
      sctx.putImageData(out, 0, 0);

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sk, 0, 0, W, H);
      ctx.restore();

      // Paper grain.
      ctx.save();
      ctx.globalAlpha = 0.07;
      const pattern = ctx.createPattern(grainBuf(), 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    },

    thumbnail(canvas) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width || 96;
      const h = canvas.height || 96;
      if (!ctx) return;
      const { face } = thumbScene(canvas, 40, 30);
      // Wash the scene out to warm paper, keeping a ghost of the sketch.
      ctx.fillStyle = 'rgba(243, 236, 221, 0.82)';
      ctx.fillRect(0, 0, w, h);
      // Re-ink the face circle sketch-style.
      ctx.save();
      ctx.strokeStyle = 'rgb(28, 26, 34)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(face.x + face.w / 2, face.y + face.h / 2, face.w * 0.5, face.h * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const y = face.y + face.h * (0.25 + i * 0.18);
        ctx.beginPath();
        ctx.moveTo(face.x + face.w * 0.15, y);
        ctx.lineTo(face.x + face.w * 0.85, y + 3);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

export const inkSketch: LensDefinition = createLens();
