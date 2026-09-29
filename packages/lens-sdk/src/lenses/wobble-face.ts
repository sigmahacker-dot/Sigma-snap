// Wobble Face — FUNNY.
// Original: the face region is sliced into horizontal ribbons and each ribbon
// is offset by a travelling sine wave — like the face is made of jelly.
import type { LensDefinition } from '../types';
import { activeFaces, makeCanvas, thumbScene } from './utils';

const SLICES = 22;

function createLens(): LensDefinition {
  // Lazily created on first apply() — never at module scope (SSR-safe).
  let sliceCanvas: HTMLCanvasElement | null = null;
  let sctx: CanvasRenderingContext2D | null = null;
  const buf = (): { sliceCanvas: HTMLCanvasElement; sctx: CanvasRenderingContext2D | null } => {
    if (!sliceCanvas) {
      sliceCanvas = makeCanvas(8, 8);
      sctx = sliceCanvas.getContext('2d');
    }
    return { sliceCanvas, sctx };
  };

  return {
    id: 'wobble-face',
    name: 'Wobble Face',
    category: 'FUNNY',
    description: 'Turns your face into wobbling jelly. Try talking!',
    isPremium: false,

    apply(ctx, frame, faces, _t) {
      const list = activeFaces(faces);
      if (list.length === 0) return;
      const { sliceCanvas, sctx } = buf();
      if (!sctx) return;
      const t = _t;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;

      for (const f of list) {
        const pad = 0.12;
        const sx = Math.max(0, Math.round(f.x - f.w * pad));
        const sy = Math.round(Math.max(0, f.y - f.h * pad));
        const sw = Math.round(Math.min(W - sx, f.w * (1 + pad * 2)));
        const sh = Math.round(Math.min(H - sy, f.h * (1 + pad * 2)));
        if (sw < 8 || sh < 8) continue;

        if (sliceCanvas.width !== sw || sliceCanvas.height !== sh) {
          sliceCanvas.width = sw;
          sliceCanvas.height = sh;
        }
        // Source region copied 1:1 (offscreen canvas is in output pixels).
        sctx.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const sliceH = sh / SLICES;
        for (let i = 0; i < SLICES; i++) {
          const srcY = i * sliceH;
          // Envelope pins the top/bottom ribbons; middle wobbles hardest.
          const env = Math.sin((Math.PI * i) / SLICES);
          const off = Math.sin(t * 7 + i * 0.62) * sw * 0.06 * env;
          const bob = Math.cos(t * 5.2 + i * 0.4) * sh * 0.008 * env;
          ctx.drawImage(
            sliceCanvas,
            0, srcY, sw, sliceH + 1,
            sx + off, sy + srcY + bob, sw, sliceH + 1,
          );
        }
      }
    },

    thumbnail(canvas) {
      const { face } = thumbScene(canvas, 45, 20);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.9)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const y = face.y + (face.h * (i + 1)) / 6;
        ctx.beginPath();
        for (let x = face.x; x <= face.x + face.w; x += 4) {
          const yy = y + Math.sin(x * 0.3 + i) * 3;
          if (x === face.x) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

export const wobbleFace: LensDefinition = createLens();
