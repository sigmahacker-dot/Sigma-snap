// Thermal Wave — TRENDING.
// Original: false-color heat vision — luminance remapped through a 256-entry
// heat palette, with a slow thermal wave rolling through the frame.
import type { LensDefinition } from '../types';
import { sampleLowRes, thumbScene } from './utils';

const MAX_W = 160;

// Palette stops: deep violet → magenta → red → orange → gold → white-hot.
const STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [10, 6, 24]],
  [0.25, [59, 29, 110]],
  [0.45, [198, 43, 77]],
  [0.65, [255, 122, 26]],
  [0.85, [255, 210, 62]],
  [1.0, [255, 255, 244]],
];

const LUT: Array<[number, number, number]> = (() => {
  const lut: Array<[number, number, number]> = [];
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let a = STOPS[0];
    let b = STOPS[STOPS.length - 1];
    for (let s = 0; s < STOPS.length - 1; s++) {
      if (v >= STOPS[s][0] && v <= STOPS[s + 1][0]) {
        a = STOPS[s];
        b = STOPS[s + 1];
        break;
      }
    }
    const k = (v - a[0]) / Math.max(1e-6, b[0] - a[0]);
    lut.push([
      Math.round(a[1][0] + (b[1][0] - a[1][0]) * k),
      Math.round(a[1][1] + (b[1][1] - a[1][1]) * k),
      Math.round(a[1][2] + (b[1][2] - a[1][2]) * k),
    ]);
  }
  return lut;
})();

function createLens(): LensDefinition {
  // Lazily created on first apply() — never at module scope (SSR-safe).
  let heat: HTMLCanvasElement | null = null;
  const buf = (): HTMLCanvasElement => {
    if (!heat) heat = document.createElement('canvas');
    return heat;
  };
  let hw = 0;
  let hh = 0;

  return {
    id: 'thermal-wave',
    name: 'Thermal Wave',
    category: 'TRENDING',
    description: 'False-color heat vision with a rolling thermal wave.',
    isPremium: false,

    apply(ctx, frame, _faces, t) {
      void _faces;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;
      const s = sampleLowRes(frame, MAX_W);
      if (!s) return;
      const { w, h, data } = s;

      const ht = buf();
      if (hw !== w || hh !== h) {
        ht.width = w;
        ht.height = h;
        hw = w;
        hh = h;
      }
      const hctx = ht.getContext('2d');
      if (!hctx) return;
      const out = hctx.createImageData(w, h);
      const src = data.data;
      const dst = out.data;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          const lum = (src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114) / 255;
          const wave = 0.5 + 0.5 * Math.sin(t * 2.4 + y * 0.32 + x * 0.07);
          const v = Math.max(0, Math.min(1, lum * 0.8 + wave * 0.32));
          const c = LUT[(v * 255) | 0];
          dst[o] = c[0];
          dst[o + 1] = c[1];
          dst[o + 2] = c[2];
          dst[o + 3] = 255;
        }
      }
      hctx.putImageData(out, 0, 0);

      ctx.save();
      ctx.imageSmoothingEnabled = true; // silky gradient bands
      ctx.drawImage(ht, 0, 0, W, H);
      ctx.restore();
    },

    thumbnail(canvas) {
      thumbScene(canvas, 10, 30);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const g = ctx.createLinearGradient(0, 0, w, 0);
      for (const [stop, [r, gg, b]] of STOPS) {
        g.addColorStop(stop, `rgb(${r}, ${gg}, ${b})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(w * 0.1, h * 0.82, w * 0.8, h * 0.08);
    },
  };
}

export const thermalWave: LensDefinition = createLens();
