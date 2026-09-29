// Velvet Glow — BEAUTY.
// Original: face-anchored softening — the face region is re-drawn blurred and
// brightened inside an elliptical mask, then kissed with a rose-gold glow.
import type { LensDefinition } from '../types';
import { activeFaces, thumbScene } from './utils';

function createLens(): LensDefinition {
  return {
    id: 'velvet-glow',
    name: 'Velvet Glow',
    category: 'BEAUTY',
    description: 'Silky-smooth skin and a soft rose-gold radiance.',
    isPremium: false,

    apply(ctx, frame, faces, t) {
      const list = activeFaces(faces);
      if (list.length === 0) return;
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      const shimmer = 0.5 + 0.5 * Math.sin(t * 1.6);

      for (const f of list) {
        const pad = 0.1;
        const fx = Math.max(0, f.x - f.w * pad);
        const fy = Math.max(0, f.y - f.h * pad);
        const fw = Math.min(W - fx, f.w * (1 + pad * 2));
        const fh = Math.min(H - fy, f.h * (1 + pad * 2));
        if (fw <= 2 || fh <= 2) continue;
        const cx = fx + fw / 2;
        const cy = fy + fh / 2;

        // Softened skin: blurred, slightly brightened copy inside an ellipse.
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, fw * 0.46, fh * 0.48, 0, 0, Math.PI * 2);
        ctx.clip();
        const prevFilter = ctx.filter;
        ctx.filter = 'blur(3px) brightness(1.06) saturate(0.94)';
        ctx.drawImage(frame, fx, fy, fw, fh, fx, fy, fw, fh);
        ctx.filter = prevFilter;
        ctx.restore();

        // Rose-gold radiance.
        const glow = ctx.createRadialGradient(cx, cy - fh * 0.1, fh * 0.1, cx, cy, fh * 0.75);
        glow.addColorStop(0, `rgba(255, 190, 170, ${0.16 + 0.06 * shimmer})`);
        glow.addColorStop(1, 'rgba(255, 150, 160, 0)');
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = glow;
        ctx.fillRect(fx - fw * 0.2, fy - fh * 0.2, fw * 1.4, fh * 1.4);
        ctx.restore();

        // Gentle cheek blush.
        const blush = (side: number): void => {
          const bx = cx + side * fw * 0.22;
          const by = cy + fh * 0.14;
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, fw * 0.13);
          g.addColorStop(0, 'rgba(255, 110, 130, 0.20)');
          g.addColorStop(1, 'rgba(255, 110, 130, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, by, fw * 0.13, 0, Math.PI * 2);
          ctx.fill();
        };
        blush(-1);
        blush(1);
      }
    },

    thumbnail(canvas) {
      const { face } = thumbScene(canvas, 330, 280);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cx = face.x + face.w / 2;
      const cy = face.y + face.h / 2;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, face.w * 0.9);
      g.addColorStop(0, 'rgba(255, 190, 175, 0.55)');
      g.addColorStop(1, 'rgba(255, 150, 160, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    },
  };
}

export const velvetGlow: LensDefinition = createLens();
