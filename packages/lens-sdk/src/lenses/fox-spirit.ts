// Fox Spirit — ANIMALS.
// Original: procedural fox ears (gradient triangles with inner-ear blush),
// whisker fans and a tiny nose — all canvas primitives, gently swaying.
import type { LensDefinition } from '../types';
import { activeFaces, thumbScene } from './utils';

function createLens(): LensDefinition {
  return {
    id: 'fox-spirit',
    name: 'Fox Spirit',
    category: 'ANIMALS',
    description: 'Sly fox ears, whiskers and a boopable nose.',
    isPremium: false,

    apply(ctx, frame, faces, t) {
      void frame;
      const list = activeFaces(faces);
      for (const f of list) {
        const cx = f.x + f.w / 2;
        const topY = f.y;
        const sway = Math.sin(t * 3.1) * 0.07;

        const ear = (side: -1 | 1): void => {
          const baseX = cx + side * f.w * 0.30;
          ctx.save();
          ctx.translate(baseX, topY + f.h * 0.06);
          ctx.rotate(side * sway);
          const ew = f.w * 0.30;
          const eh = f.h * 0.42;
          // Outer ear.
          const g = ctx.createLinearGradient(0, 0, 0, -eh);
          g.addColorStop(0, '#e2711d');
          g.addColorStop(1, '#f4a259');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(-ew / 2, 0);
          ctx.lineTo(side * ew * 0.18, -eh);
          ctx.lineTo(ew / 2, 0);
          ctx.closePath();
          ctx.fill();
          // Inner ear blush.
          ctx.fillStyle = 'rgba(255, 205, 200, 0.9)';
          ctx.beginPath();
          ctx.moveTo(-ew * 0.26, -eh * 0.06);
          ctx.lineTo(side * ew * 0.14, -eh * 0.74);
          ctx.lineTo(ew * 0.26, -eh * 0.06);
          ctx.closePath();
          ctx.fill();
          // Dark ear tip.
          ctx.fillStyle = 'rgba(60, 25, 10, 0.85)';
          ctx.beginPath();
          ctx.moveTo(side * ew * 0.10, -eh * 0.92);
          ctx.lineTo(side * ew * 0.18, -eh);
          ctx.lineTo(side * ew * 0.24, -eh * 0.88);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };
        ear(-1);
        ear(1);

        // Whiskers fanning from the muzzle.
        const noseX = cx;
        const noseY = f.y + f.h * 0.64;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = Math.max(1, f.w * 0.008);
        ctx.lineCap = 'round';
        for (const side of [-1, 1] as const) {
          for (let i = -1; i <= 1; i++) {
            const len = f.w * (0.30 + 0.04 * Math.abs(i));
            ctx.beginPath();
            ctx.moveTo(noseX + side * f.w * 0.06, noseY + i * f.h * 0.02);
            ctx.quadraticCurveTo(
              noseX + side * len * 0.6, noseY + i * f.h * 0.035 - f.h * 0.01,
              noseX + side * len, noseY + i * f.h * 0.05,
            );
            ctx.stroke();
          }
        }
        ctx.restore();

        // Nose.
        const nw = f.w * 0.075;
        ctx.fillStyle = 'rgba(45, 20, 18, 0.92)';
        ctx.beginPath();
        ctx.moveTo(noseX - nw, noseY - nw * 0.5);
        ctx.lineTo(noseX + nw, noseY - nw * 0.5);
        ctx.lineTo(noseX, noseY + nw * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(noseX - nw * 0.3, noseY - nw * 0.25, nw * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    thumbnail(canvas) {
      const { face } = thumbScene(canvas, 25, 15);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cx = face.x + face.w / 2;
      ctx.fillStyle = '#e2711d';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * face.w * 0.30 - face.w * 0.12, face.y + face.h * 0.06);
        ctx.lineTo(cx + side * face.w * 0.34, face.y - face.h * 0.30);
        ctx.lineTo(cx + side * face.w * 0.30 + face.w * 0.12, face.y + face.h * 0.06);
        ctx.closePath();
        ctx.fill();
      }
    },
  };
}

export const foxSpirit: LensDefinition = createLens();
