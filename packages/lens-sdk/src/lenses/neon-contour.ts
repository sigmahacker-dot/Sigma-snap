// Neon Contour — FACE_EFFECTS (premium).
// Original: luminance Sobel edge field sampled at low res, upscaled and
// composited additively as a violet→cyan neon glow that breathes with time.
import type { LensDefinition } from '../types';
import { sampleLowRes, thumbScene } from './utils';

const MAX_W = 160;

function createLens(): LensDefinition {
  let edgeCanvas: HTMLCanvasElement | null = null; // lazy: document unavailable during SSR
  let ew = 0;
  let eh = 0;

  return {
    id: 'neon-contour',
    name: 'Neon Contour',
    category: 'FACE_EFFECTS',
    description: 'Your edges traced in breathing violet-cyan neon light.',
    isPremium: true,

    apply(ctx, frame, _faces, t) {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      if (W === 0 || H === 0) return;
      const s = sampleLowRes(frame, MAX_W);
      if (!s) return;
      const { w, h, data } = s;
      if (!edgeCanvas) edgeCanvas = document.createElement('canvas');

      if (ew !== w || eh !== h) {
        edgeCanvas.width = w;
        edgeCanvas.height = h;
        ew = w;
        eh = h;
      }
      const ectx = edgeCanvas.getContext('2d');
      if (!ectx) return;
      const out = ectx.createImageData(w, h);
      const src = data.data;
      const dst = out.data;

      // Luminance helper over the source buffer.
      const lum = (x: number, y: number): number => {
        const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
        const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
        const o = (cy * w + cx) * 4;
        return src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114;
      };

      // Breathing hue drift between violet and cyan.
      const mix = 0.5 + 0.5 * Math.sin(t * 2.1);
      const rC = 124 + (56 - 124) * mix;
      const gC = 92 + (225 - 92) * mix;
      const bC = 255;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = lum(x + 1, y) - lum(x - 1, y);
          const dy = lum(x, y + 1) - lum(x, y - 1);
          const mag = Math.sqrt(dx * dx + dy * dy);
          const o = (y * w + x) * 4;
          if (mag > 14) {
            const k = Math.min(1, (mag - 14) / 70);
            dst[o] = rC;
            dst[o + 1] = gC;
            dst[o + 2] = bC;
            dst[o + 3] = Math.min(255, k * 300);
          } else {
            dst[o + 3] = 0;
          }
        }
      }
      ectx.putImageData(out, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 3.0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(edgeCanvas, 0, 0, W, H);
      ctx.restore();
    },

    thumbnail(canvas) {
      const { face } = thumbScene(canvas, 268, 195);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.strokeStyle = '#8f7bff';
      ctx.shadowColor = '#7c5cff';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(
        face.x + face.w / 2, face.y + face.h / 2,
        face.w * 0.62, face.h * 0.62, 0, 0, Math.PI * 2,
      );
      ctx.stroke();
      ctx.strokeStyle = '#38e1ff';
      ctx.shadowColor = '#38e1ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(
        face.x + face.w / 2, face.y + face.h / 2,
        face.w * 0.72, face.h * 0.72, 0, 0, Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    },
  };
}

export const neonContour: LensDefinition = createLens();
