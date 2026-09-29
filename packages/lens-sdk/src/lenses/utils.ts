// @sigma-snap/lens-sdk — shared helpers for lens authors.
// Everything here is original procedural code; no image assets anywhere.
import type { FaceBox } from '../types';

/** Faces worth drawing accessories on (drops stale low-confidence boxes). */
export function activeFaces(faces: FaceBox[]): FaceBox[] {
  return faces.filter((f) => f.confidence >= 0.15 && f.w > 4 && f.h > 4);
}

/** Deterministic PRNG so effects look the same across reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Particle {
  x: number; // 0..1 across canvas
  y: number; // 0..1 down canvas
  vx: number; // units per second
  vy: number;
  life: number; // seconds remaining
  maxLife: number;
  size: number; // px at 720p reference
  seed: number;
}

/** Fixed-pool particle system. `spawn` re-initialises a dead particle. */
export class ParticlePool {
  readonly parts: Particle[] = [];

  constructor(
    count: number,
    private readonly spawn: (p: Particle, rand: () => number) => void,
    seed = 1337,
  ) {
    const rand = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const p: Particle = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 4, seed: rand() * 1000 };
      spawn(p, rand);
      p.life = rand() * p.maxLife; // stagger so the first frame isn't empty
      this.parts.push(p);
    }
    // Re-seed the spawn rng per recycle to keep motion varied but stable.
    this.spawnRand = mulberry32(seed ^ 0x9e3779b9);
  }

  private spawnRand: () => number;

  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      if (p.life <= 0) {
        this.spawn(p, this.spawnRand);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
}

/** Create a blank canvas of the given size. */
export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Sample `src` into a small canvas (max `maxW` wide) and return its pixels.
 * The workhorse for pixel-level effects — keeps getImageData cheap.
 */
export function sampleLowRes(
  src: HTMLCanvasElement,
  maxW: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number; data: ImageData } | null {
  const w = Math.min(maxW, src.width);
  const h = Math.max(1, Math.round((w * src.height) / Math.max(1, src.width)));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  return { canvas, ctx, w, h, data };
}

/** Draw src cover-fit into a ctx of size dw×dh. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): void {
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
  const scale = Math.max(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(src, (dw - w) / 2, (dh - h) / 2, w, h);
}

// ─── Thumbnails ─────────────────────────────────────────────────────
// Every thumbnail draws the same tiny "selfie" scene (gradient backdrop +
// shoulders + head + simple face) so the carousel looks coherent, then each
// lens paints its signature accent on top.

export interface ThumbScene {
  w: number;
  h: number;
  /** Face box inside the thumbnail, for face-anchored accents. */
  face: FaceBox;
}

export function thumbScene(canvas: HTMLCanvasElement, hueA: number, hueB: number): ThumbScene {
  const w = canvas.width || 96;
  const h = canvas.height || 96;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  const s = Math.min(w, h);
  const cx = w / 2;
  if (!ctx) return { w, h, face: { x: 0, y: 0, w: 0, h: 0, confidence: 1 } };

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, `hsl(${hueA}, 45%, 16%)`);
  bg.addColorStop(1, `hsl(${hueB}, 50%, 8%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Shoulders.
  ctx.fillStyle = 'hsl(220, 18%, 26%)';
  ctx.beginPath();
  ctx.ellipse(cx, h * 1.02, s * 0.42, s * 0.34, 0, Math.PI, 0);
  ctx.fill();

  // Head.
  const hr = s * 0.21;
  const hy = h * 0.46;
  const skin = ctx.createRadialGradient(cx - hr * 0.3, hy - hr * 0.3, hr * 0.2, cx, hy, hr * 1.25);
  skin.addColorStop(0, '#f2c9a4');
  skin.addColorStop(1, '#c98f62');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, hy, hr, 0, Math.PI * 2);
  ctx.fill();

  // Hair cap.
  ctx.fillStyle = 'hsl(20, 35%, 14%)';
  ctx.beginPath();
  ctx.arc(cx, hy - hr * 0.12, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();

  // Eyes + smile.
  ctx.fillStyle = 'hsl(20, 30%, 12%)';
  ctx.beginPath();
  ctx.arc(cx - hr * 0.36, hy - hr * 0.05, hr * 0.09, 0, Math.PI * 2);
  ctx.arc(cx + hr * 0.36, hy - hr * 0.05, hr * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'hsl(20, 30%, 12%)';
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.beginPath();
  ctx.arc(cx, hy + hr * 0.28, hr * 0.34, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  return {
    w,
    h,
    face: { x: cx - hr, y: hy - hr, w: hr * 2, h: hr * 2, confidence: 1 },
  };
}

/** Pre-rendered soft round sprite (white core → transparent), tinted per use. */
export function makeGlowSprite(size: number, inner: string, outer: string): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.4, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

/** Pre-rendered monochrome noise tile for grain overlays. */
export function makeNoiseTile(size: number, seed = 42): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const rand = mulberry32(seed);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (rand() * 255) | 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  return c;
}
