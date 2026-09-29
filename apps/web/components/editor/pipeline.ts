// Core canvas rendering pipeline for the editor.
// Every operation here is applied identically in live preview and on export,
// so what the user sees is what gets rendered.
import { FONTS } from './types';
import type {
  Adjust, AiEffect, CropRect, DrawStroke, FilterId, OverlayId, Pipeline, StickerInstance, TextLayer, TransformState,
} from './types';
import { drawStickerArt } from './stickers';

// ─── deterministic PRNG (stable particles/grain across preview & export) ──
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Filter string ─────────────────────────────────────────────────────────
const PRESET_FILTERS: Record<FilterId, string> = {
  none: '',
  vivid: 'saturate(1.4) contrast(1.12)',
  noir: 'grayscale(1) contrast(1.22) brightness(1.02)',
  warm: 'sepia(0.32) saturate(1.25) contrast(1.04)',
  cool: 'saturate(1.12) hue-rotate(14deg) brightness(1.03)',
  sepia: 'sepia(0.85) contrast(1.02)',
  fade: 'contrast(0.86) brightness(1.08) saturate(0.68)',
};

/** Allow only safe CSS filter characters through (server-provided color grade). */
export function sanitizeCss(s: string): string {
  return s.replace(/[^a-z0-9().,\s%\-]/gi, '').slice(0, 300).trim();
}

export function buildFilterString(filter: FilterId, adjust: Adjust, ai?: AiEffect | null): string {
  const parts: string[] = [];
  const preset = PRESET_FILTERS[filter];
  if (preset) parts.push(preset);
  const b = 1 + adjust.brightness / 100;
  const c = 1 + adjust.contrast / 100;
  const s = 1 + adjust.saturation / 100;
  if (Math.abs(b - 1) > 0.001) parts.push(`brightness(${b.toFixed(3)})`);
  if (Math.abs(c - 1) > 0.001) parts.push(`contrast(${c.toFixed(3)})`);
  if (Math.abs(s - 1) > 0.001) parts.push(`saturate(${s.toFixed(3)})`);
  if (ai) {
    if (ai.filter && ai.filter !== 'none') {
      const p = PRESET_FILTERS[ai.filter];
      if (p) parts.push(p);
    }
    const grade = sanitizeCss(ai.colorGrade);
    if (grade) parts.push(grade);
  }
  return parts.join(' ');
}

// ─── Geometry helpers ─────────────────────────────────────────────────────
/** Rotated full-image dimensions (before crop). */
export function rotatedDims(w: number, h: number, t: TransformState): { w: number; h: number } {
  return t.rotation === 90 || t.rotation === 270 ? { w: h, h: w } : { w, h };
}

/** Output canvas dims = rotated dims with crop applied. */
export function outputDims(w: number, h: number, t: TransformState): { w: number; h: number } {
  const r = rotatedDims(w, h, t);
  if (!t.crop) return r;
  return { w: Math.max(2, Math.round(r.w * t.crop.w)), h: Math.max(2, Math.round(r.h * t.crop.h)) };
}

/** Map a crop rect from post-rotation (output) space back to source space. */
function sourceCrop(crop: CropRect | null, t: TransformState): CropRect | null {
  if (!crop) return null;
  // Canvas applies transforms as translate · rotate · scale, so to invert we
  // undo the flip first (in output space), then the rotation.
  let { x, y, w, h } = crop;
  if (t.flipH) x = 1 - (x + w);
  if (t.flipV) y = 1 - (y + h);
  if (t.rotation === 90) { const nx = y, ny = 1 - (x + w); x = nx; y = ny; const nw = h; h = w; w = nw; }
  else if (t.rotation === 180) { x = 1 - (x + w); y = 1 - (y + h); }
  else if (t.rotation === 270) { const nx = 1 - (y + h), ny = x; x = nx; y = ny; const nw = h; h = w; w = nw; }
  return { x, y, w, h };
}

/**
 * Draw src (HTMLImageElement or HTMLVideoElement) into ctx[0..W,0..H] with
 * rotation, flip, crop and the pipeline filter applied. All layers are drawn
 * on top in output space afterwards.
 *
 * NOTE: crop is defined in post-rotation (output) space — the same space the
 * crop overlay shows — and is mapped back to source space here.
 */
export function drawBase(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number },
  srcW: number, srcH: number,
  t: TransformState,
  filterStr: string,
  W: number, H: number,
): void {
  const crop = sourceCrop(t.crop, t);
  const sw = crop ? Math.max(2, Math.round(srcW * crop.w)) : srcW;
  const sh = crop ? Math.max(2, Math.round(srcH * crop.h)) : srcH;
  const sx = crop ? Math.round(srcW * crop.x) : 0;
  const sy = crop ? Math.round(srcH * crop.y) : 0;

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
  // In rotated space, destination is W×H with axes swapped for 90/270.
  const dw = t.rotation === 90 || t.rotation === 270 ? H : W;
  const dh = t.rotation === 90 || t.rotation === 270 ? W : H;
  ctx.filter = filterStr || 'none';
  try {
    ctx.drawImage(src, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  } catch {
    /* draw of not-yet-ready video frame — skip */
  }
  ctx.filter = 'none';
  ctx.restore();
}

// ─── Text layers ──────────────────────────────────────────────────────────
function easeOutBack(p: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

export function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  W: number, H: number,
  time?: number, // video source time; undefined = photo (always visible, no entrance)
): void {
  if (time !== undefined && (time < layer.appearAt || time > layer.appearTo)) return;
  const scale = W / 1080;
  const x = layer.x * W;
  const y = layer.y * H;
  const font = FONTS.find((f) => f.id === layer.fontId) ?? FONTS[0];

  let alpha = 1, dy = 0, s = 1;
  if (time !== undefined && layer.anim !== 'none') {
    const p = Math.min(1, Math.max(0, (time - layer.appearAt) / 0.6));
    if (p <= 0) return;
    if (p < 1) {
      if (layer.anim === 'fade') alpha = p;
      else if (layer.anim === 'slide') { alpha = p; dy = (1 - p) * 60 * scale; }
      else if (layer.anim === 'pop') { s = Math.max(0.01, easeOutBack(p)); alpha = Math.min(1, p * 2.5); }
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.translate(0, dy);
  ctx.scale(s, s);
  ctx.globalAlpha *= alpha;
  const px = Math.max(8, layer.size * scale);
  ctx.font = `${layer.bold ? '700' : '400'} ${px}px ${font.stack}`;
  ctx.textAlign = layer.align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const lines = layer.text.split('\n');
  const lh = px * 1.28;
  const y0 = -((lines.length - 1) * lh) / 2;

  if (layer.shadow || layer.glow) {
    ctx.shadowColor = layer.glow ? layer.color : 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = (layer.glow ? 22 : 10) * scale;
    ctx.shadowOffsetY = layer.glow ? 0 : 3 * scale;
  }
  lines.forEach((line, i) => {
    const ly = y0 + i * lh;
    if (layer.stroke) {
      ctx.lineWidth = Math.max(1, px * 0.09);
      ctx.strokeStyle = layer.strokeColor;
      ctx.strokeText(line, 0, ly);
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(line, 0, ly);
  });
  ctx.restore();
}

// ─── Stickers ─────────────────────────────────────────────────────────────
export function drawStickerInstance(
  ctx: CanvasRenderingContext2D,
  st: StickerInstance,
  W: number, H: number,
  time?: number,
): void {
  void time;
  const scale = W / 1080;
  ctx.save();
  ctx.translate(st.x * W, st.y * H);
  ctx.rotate((st.rotation * Math.PI) / 180);
  const size = 150 * scale * st.scale;
  ctx.scale(size / 100, size / 100);
  drawStickerArt(ctx, st.stickerId);
  ctx.restore();
}

// ─── Drawing strokes ──────────────────────────────────────────────────────
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: DrawStroke[], W: number, H: number): void {
  const scale = W / 1080;
  for (const st of strokes) {
    if (st.points.length === 0) continue;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (st.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.globalAlpha = 1;
      ctx.lineWidth = st.width * scale;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = st.color;
      ctx.globalAlpha = st.tool === 'marker' ? st.opacity * 0.45 : st.opacity;
      ctx.lineWidth = st.width * scale * (st.tool === 'marker' ? 2.4 : 1);
    }
    ctx.beginPath();
    const pts = st.points;
    ctx.moveTo(pts[0].x * W, pts[0].y * H);
    if (pts.length === 1) {
      ctx.lineTo(pts[0].x * W + 0.1, pts[0].y * H + 0.1);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = ((pts[i].x + pts[i + 1].x) / 2) * W;
        const yc = ((pts[i].y + pts[i + 1].y) / 2) * H;
        ctx.quadraticCurveTo(pts[i].x * W, pts[i].y * H, xc, yc);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x * W, last.y * H);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ─── AI overlays ──────────────────────────────────────────────────────────
function drawRain(ctx: CanvasRenderingContext2D, W: number, H: number, time: number): void {
  const N = 130;
  const slant = W * 0.06;
  ctx.save();
  ctx.strokeStyle = 'rgba(174, 214, 255, 0.5)';
  ctx.lineWidth = Math.max(1, W / 900);
  ctx.lineCap = 'round';
  for (let i = 0; i < N; i++) {
    const r = mulberry32(i * 7919 + 13);
    const x0 = r() * (W + slant);
    const speed = 0.9 + r() * 1.3;
    const len = H * (0.03 + r() * 0.05);
    const phase = r();
    const y = (((time * speed + phase) % 1.15) - 0.075) * H;
    const x = x0 - (y / H) * slant * 0.4;
    ctx.globalAlpha = 0.25 + r() * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - slant * 0.06, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnow(ctx: CanvasRenderingContext2D, W: number, H: number, time: number): void {
  const N = 110;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < N; i++) {
    const r = mulberry32(i * 104729 + 7);
    const x0 = r() * W;
    const speed = 0.05 + r() * 0.12;
    const sway = Math.sin(time * (0.8 + r() * 1.2) + r() * 6.28) * W * 0.02;
    const phase = r();
    const y = ((time * speed + phase) % 1.1 - 0.05) * H;
    const rad = (1 + r() * 2.2) * (W / 900);
    ctx.globalAlpha = 0.35 + r() * 0.45;
    ctx.beginPath();
    ctx.arc(x0 + sway, y, rad, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, W: number, H: number, time: number): void {
  const frame = Math.floor(time * 24);
  const r = mulberry32(frame * 2654435761 % 2147483647 || 1);
  ctx.save();
  const N = 380;
  const s = Math.max(1, W / 700);
  for (let i = 0; i < N; i++) {
    const v = r() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},0.05)`;
    ctx.fillRect(r() * W, r() * H, s, s);
  }
  ctx.restore();
}

export function drawAIOverlays(
  ctx: CanvasRenderingContext2D,
  ai: AiEffect | null,
  W: number, H: number,
  time: number,
): void {
  if (!ai) return;
  for (const o of ai.overlays as OverlayId[]) {
    if (o === 'rain') drawRain(ctx, W, H, time);
    else if (o === 'snow') drawSnow(ctx, W, H, time);
    else if (o === 'film-grain') drawFilmGrain(ctx, W, H, time);
    else if (o === 'letterbox') {
      ctx.save();
      ctx.fillStyle = '#000';
      const bar = H * 0.085;
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      ctx.restore();
    } else if (o === 'vignette') {
      ctx.save();
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else if (o === 'light-leak') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createLinearGradient(W, 0, W * 0.4, H * 0.6);
      g.addColorStop(0, 'rgba(255,110,60,0.28)');
      g.addColorStop(0.5, 'rgba(255,170,90,0.1)');
      g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

// ─── Full frame render ────────────────────────────────────────────────────
/**
 * Render one complete frame: base media + strokes + text + stickers + AI overlays.
 * `time` = video source seconds (drives entrance animations + particles).
 * Omit `time` for photos (everything visible, static overlays).
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  srcW: number, srcH: number,
  p: Pipeline,
  W: number, H: number,
  time?: number,
): void {
  const filterStr = buildFilterString(p.filter, p.adjust, p.aiEffect);
  drawBase(ctx, src as never, srcW, srcH, p.transform, filterStr, W, H);
  drawStrokes(ctx, p.strokes, W, H);
  for (const t of p.textLayers) drawTextLayer(ctx, t, W, H, time);
  for (const s of p.stickers) drawStickerInstance(ctx, s, W, H, time);
  drawAIOverlays(ctx, p.aiEffect, W, H, time ?? 0);
}
