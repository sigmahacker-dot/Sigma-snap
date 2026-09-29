// Portrait-mode composite lens for the SIGMA SNAP camera.
// Wraps the real @sigma-snap/lens-sdk LensEngine: implements the portrait
// bokeh as a built-in lens-like pass (blur whole frame, then paint the sharp
// face-box region on top) and composites the user's selected lens over it.
import type { FaceBox, LensDefinition } from '@sigma-snap/shared';

let scratch: HTMLCanvasElement | null = null;
function getScratch(w: number, h: number): HTMLCanvasElement {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  return scratch;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/**
 * Returns a transient LensDefinition that first applies the portrait bokeh
 * pass, then the selected lens on top. Not registered — rebuilt whenever the
 * mode or selected lens changes.
 */
export function withPortrait(selected: LensDefinition | null): LensDefinition {
  return {
    id: '__sigma_portrait__',
    name: 'Portrait',
    category: 'BACKGROUND',
    description: 'Portrait bokeh with the active lens applied on top',
    isPremium: false,
    apply(ctx, frame, faces, t) {
      const w = frame.width;
      const h = frame.height;
      if (!w || !h) return;
      // Pass 1 — bokeh: blurred background + sharp subject region.
      const s = getScratch(w, h);
      const sctx = s.getContext('2d');
      if (!sctx) return;
      sctx.save();
      sctx.filter = 'blur(18px) saturate(1.05)';
      sctx.drawImage(frame, 0, 0, w, h);
      sctx.restore();
      const box: FaceBox = faces[0] ?? { x: w * 0.2, y: h * 0.2, w: w * 0.6, h: h * 0.52, confidence: 0 };
      sctx.save();
      rr(sctx, box.x, box.y, box.w, box.h, Math.min(box.w, box.h) * 0.3);
      sctx.clip();
      sctx.drawImage(frame, 0, 0, w, h);
      sctx.restore();
      // Pass 2 — paint the bokeh result, then the selected lens over it.
      ctx.save();
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(s, 0, 0, w, h);
      ctx.restore();
      if (selected) selected.apply(ctx, s, faces, t);
    },
    thumbnail(canvas) {
      const c = canvas.getContext('2d');
      if (!c) return;
      const w = canvas.width;
      const h = canvas.height;
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#2a2a3f');
      g.addColorStop(1, '#0b0b12');
      c.save();
      c.filter = 'blur(6px)';
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.restore();
      c.save();
      rr(c, w * 0.25, h * 0.2, w * 0.5, h * 0.6, w * 0.14);
      c.clip();
      const g2 = c.createLinearGradient(0, 0, 0, h);
      g2.addColorStop(0, '#7C5CFF');
      g2.addColorStop(1, '#38E1FF');
      c.fillStyle = g2;
      c.fillRect(0, 0, w, h);
      c.restore();
    },
  };
}
