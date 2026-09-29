// Cel Shade — CARTOON.
// Original: face-anchored toon shading — the face region is sampled tiny,
// posterized to flat color cells, edges re-inked dark, then drawn back crisp
// (smoothing off) with a hand-drawn ink outline.
import type { LensDefinition } from '../types';
import { activeFaces, makeCanvas, thumbScene } from './utils';

const SAMPLE = 72;
const LEVELS = [34, 96, 158, 226];

function createLens(): LensDefinition {
  // Lazily created on first apply() — never at module scope (SSR-safe).
  let tiny: HTMLCanvasElement | null = null;
  let tctx: CanvasRenderingContext2D | null = null;
  const buf = (): { tiny: HTMLCanvasElement; tctx: CanvasRenderingContext2D | null } => {
    if (!tiny) {
      tiny = makeCanvas(SAMPLE, SAMPLE);
      tctx = tiny.getContext('2d', { willReadFrequently: true });
    }
    return { tiny, tctx };
  };

  return {
    id: 'cel-shade',
    name: 'Cel Shade',
    category: 'CARTOON',
    description: 'Flat toon colors and bold ink lines, anime-style.',
    isPremium: false,

    apply(ctx, frame, faces, _t) {
      void _t;
      const list = activeFaces(faces);
      if (list.length === 0) return;
      const { tiny, tctx } = buf();
      if (!tctx) return;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;

      for (const f of list) {
        const pad = 0.08;
        const sx = Math.max(0, Math.round(f.x - f.w * pad));
        const sy = Math.max(0, Math.round(f.y - f.h * pad));
        const sw = Math.round(Math.min(W - sx, f.w * (1 + pad * 2)));
        const sh = Math.round(Math.min(H - sy, f.h * (1 + pad * 2)));
        if (sw < 10 || sh < 10) continue;

        const tw = SAMPLE;
        const th = Math.max(1, Math.round((SAMPLE * sh) / sw));
        if (tiny.width !== tw || tiny.height !== th) {
          tiny.width = tw;
          tiny.height = th;
        }
        tctx.drawImage(frame, sx, sy, sw, sh, 0, 0, tw, th);
        let img: ImageData;
        try {
          img = tctx.getImageData(0, 0, tw, th);
        } catch {
          continue;
        }
        const d = img.data;
        const lumAt = (x: number, y: number): number => {
          const o = (y * tw + x) * 4;
          return d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114;
        };
        for (let y = 0; y < th; y++) {
          for (let x = 0; x < tw; x++) {
            const o = (y * tw + x) * 4;
            const lum = lumAt(x, y);
            // Posterize: pick the nearest flat cell, keep the hue.
            let cell = LEVELS[0];
            for (const L of LEVELS) if (Math.abs(lum - L) < Math.abs(lum - cell)) cell = L;
            const k = lum > 4 ? cell / lum : 1;
            // Ink the edges.
            const ex = x + 1 < tw ? Math.abs(lum - lumAt(x + 1, y)) : 0;
            const ey = y + 1 < th ? Math.abs(lum - lumAt(x, y + 1)) : 0;
            const edge = ex + ey > 26;
            if (edge) {
              d[o] = 22; d[o + 1] = 16; d[o + 2] = 32;
            } else {
              d[o] = Math.min(255, d[o] * k);
              d[o + 1] = Math.min(255, d[o + 1] * k);
              d[o + 2] = Math.min(255, d[o + 2] * k);
            }
            d[o + 3] = 255;
          }
        }
        tctx.putImageData(img, 0, 0);

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tiny, 0, 0, tw, th, sx, sy, sw, sh);
        ctx.restore();

        // Hand-drawn ink outline with a wobble.
        ctx.save();
        ctx.strokeStyle = 'rgba(20, 14, 30, 0.9)';
        ctx.lineWidth = Math.max(2, f.w * 0.022);
        ctx.beginPath();
        ctx.ellipse(f.x + f.w / 2, f.y + f.h / 2, f.w * 0.52, f.h * 0.52, 0.04, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },

    thumbnail(canvas) {
      const { face } = thumbScene(canvas, 200, 160);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.fillStyle = '#f2c9a4';
      ctx.beginPath();
      ctx.ellipse(face.x + face.w / 2, face.y + face.h / 2, face.w * 0.5, face.h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d99a6c';
      ctx.fillRect(face.x + face.w * 0.2, face.y + face.h * 0.55, face.w * 0.6, face.h * 0.2);
      ctx.strokeStyle = '#14101e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(face.x + face.w / 2, face.y + face.h / 2, face.w * 0.52, face.h * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
  };
}

export const celShade: LensDefinition = createLens();
