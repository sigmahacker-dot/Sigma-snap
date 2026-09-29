// @sigma-snap/lens-sdk — LensEngine.
//
// Owns an output <canvas>, runs a requestAnimationFrame loop, draws each
// camera frame cover-fit, runs face detection throttled to ~8fps, then hands
// the active lens a clean source frame plus face boxes in OUTPUT-canvas
// coordinates (mirrored when the front camera is mirrored).
import type { FaceBox, LensDefinition } from './types';
import { HeuristicFaceDetector } from './detector';
import type { FaceDetector } from './types';

/** Detection runs at most this often — ML detectors are expensive. */
const DETECT_INTERVAL_MS = 125; // ≈ 8 fps

/** Cover-fit draw of a video/canvas source into a 2d context of size dw×dh. */
function drawCover(
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

function lerpBox(a: FaceBox, b: FaceBox, k: number): FaceBox {
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    w: a.w + (b.w - a.w) * k,
    h: a.h + (b.h - a.h) * k,
    confidence: b.confidence,
  };
}

export class LensEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Clean cover-fit copy of the current video frame; handed to lenses for sampling. */
  private readonly frame: HTMLCanvasElement;
  private readonly frameCtx: CanvasRenderingContext2D;

  private detector: FaceDetector = new HeuristicFaceDetector();
  private lens: LensDefinition | null = null;
  private video: HTMLVideoElement | null = null;

  private rafId = 0;
  private running = false;
  private mirrored = false;

  private faces: FaceBox[] = []; // smoothed, in video coordinates
  private lastDetectAt = 0;
  private detectInFlight = false;
  private t0 = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[lens-sdk] LensEngine needs a canvas with 2d context support');
    this.canvas = canvas;
    this.ctx = ctx;
    this.frame = document.createElement('canvas');
    const fctx = this.frame.getContext('2d');
    if (!fctx) throw new Error('[lens-sdk] offscreen frame canvas unavailable');
    this.frameCtx = fctx;
  }

  /** Swap the face detector (e.g. plug in MediaPipe/TF.js). */
  setDetector(detector: FaceDetector): void {
    if (!detector || typeof detector.detect !== 'function') {
      throw new Error('[lens-sdk] setDetector() needs a FaceDetector with detect(video)');
    }
    this.detector = detector;
    this.faces = [];
    this.lastDetectAt = 0;
  }

  getDetector(): FaceDetector {
    return this.detector;
  }

  /** Set (or clear, with null) the active lens. */
  setLens(lens: LensDefinition | null): void {
    this.lens = lens;
  }

  getLens(): LensDefinition | null {
    return this.lens;
  }

  /** Mirror the preview horizontally (front camera). Overlays stay aligned. */
  setMirrored(mirrored: boolean): void {
    this.mirrored = mirrored;
  }

  isMirrored(): boolean {
    return this.mirrored;
  }

  /** Start the render loop on a playing <video>. Safe to call twice. */
  start(video: HTMLVideoElement): void {
    if (this.running && this.video === video) return;
    this.stop();
    this.video = video;
    this.running = true;
    this.t0 = performance.now();
    this.lastDetectAt = 0;
    const tick = (now: number): void => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      this.renderFrame(now);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Stop the loop. The last frame stays on the canvas. */
  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.video = null;
    this.detectInFlight = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Capture the current moment as a fresh canvas: video frame cover-fit +
   * active lens composited. Always unmirrored (sensor truth), even when the
   * preview is mirrored. Returns null when no video frame is available.
   */
  capturePhoto(): HTMLCanvasElement | null {
    const video = this.video;
    if (!video || video.videoWidth === 0) return null;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (W === 0 || H === 0) return null;

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const octx = out.getContext('2d');
    if (!octx) return null;

    const src = document.createElement('canvas');
    src.width = W;
    src.height = H;
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    drawCover(sctx, video, video.videoWidth, video.videoHeight, W, H);

    octx.drawImage(src, 0, 0);
    const t = (performance.now() - this.t0) / 1000;
    // Unmirrored capture: faces in output coords == video coords mapped to W×H.
    const faces = this.faces.map((f) => this.videoBoxToOutput(f, W, H, video));
    this.lens?.apply(octx, src, faces, t);
    return out;
  }

  // ── internals ──────────────────────────────────────────────────────

  private renderFrame(now: number): void {
    const video = this.video;
    if (!video) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (W === 0 || H === 0 || video.videoWidth === 0) return;

    if (this.frame.width !== W || this.frame.height !== H) {
      this.frame.width = W;
      this.frame.height = H;
    }
    drawCover(this.frameCtx, video, video.videoWidth, video.videoHeight, W, H);

    // Throttled detection (~8fps), never overlapping.
    if (now - this.lastDetectAt >= DETECT_INTERVAL_MS && !this.detectInFlight) {
      this.lastDetectAt = now;
      this.detectInFlight = true;
      this.detector
        .detect(video)
        .then((found) => {
          this.detectInFlight = false;
          this.faces = this.smoothFaces(found);
        })
        .catch(() => {
          this.detectInFlight = false;
        });
    }

    const ctx = this.ctx;
    ctx.save();
    if (this.mirrored) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.frame, 0, 0);
    const t = (now - this.t0) / 1000;
    // Lenses work in output-canvas coordinates: map video-space boxes
    // through the same cover-fit, then mirror when the preview is mirrored.
    const mapped = this.faces.map((f) => this.videoBoxToOutput(f, W, H, video));
    const outFaces = this.mirrored
      ? mapped.map((f) => ({ ...f, x: W - f.x - f.w }))
      : mapped;
    try {
      this.lens?.apply(ctx, this.frame, outFaces, t);
    } catch {
      // A throwing lens must never kill the camera loop.
    }
    ctx.restore();
  }

  /** Ease detected boxes toward the new reading so accessories don't jitter. */
  private smoothFaces(next: FaceBox[]): FaceBox[] {
    if (next.length === 0) {
      // Coast on the last known boxes with decaying confidence.
      return this.faces
        .map((f) => ({ ...f, confidence: f.confidence - 0.12 }))
        .filter((f) => f.confidence > 0.05);
    }
    return next.map((b, i) => {
      const prev = this.faces[i];
      return prev ? lerpBox(prev, b, 0.45) : { ...b };
    });
  }

  /** Map a video-space box to output-canvas space (cover-fit). */
  private videoBoxToOutput(f: FaceBox, W: number, H: number, video: HTMLVideoElement): FaceBox {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    const ox = (W - vw * scale) / 2;
    const oy = (H - vh * scale) / 2;
    return {
      x: ox + f.x * scale,
      y: oy + f.y * scale,
      w: f.w * scale,
      h: f.h * scale,
      confidence: f.confidence,
    };
  }
}
