// @sigma-snap/lens-sdk — HeuristicFaceDetector.
//
// HONEST FALLBACK: this detector does NOT find real faces. It keeps a
// center-weighted box (where a selfie face usually is) and gently nudges it
// toward the centroid of frame-to-frame motion, so effects still feel alive
// when no ML detector is plugged in. Confidence stays modest on purpose.
//
// Plug a real detector any time: `engine.setDetector(myMediaPipeDetector)` —
// anything implementing the FaceDetector interface works, no core changes.
import type { FaceBox } from './types';
import type { FaceDetector } from './types';

const SAMPLE_W = 96;
const DIFF_THRESHOLD = 18; // luminance delta that counts as "motion"
const MIN_MOTION_RATIO = 0.008; // changed-pixel ratio needed to trust motion

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class HeuristicFaceDetector implements FaceDetector {
  readonly name = 'heuristic-fallback';

  private probe: HTMLCanvasElement | null = null; // lazy: document unavailable during SSR
  private probeCtx: CanvasRenderingContext2D | null = null;
  private prevLuma: Uint8ClampedArray | null = null;
  private box: FaceBox | null = null;

  async detect(video: HTMLVideoElement): Promise<FaceBox[]> {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) {
      return this.box ? [{ ...this.box }] : [];
    }

    const sw = SAMPLE_W;
    const sh = Math.max(1, Math.round((SAMPLE_W * vh) / vw));
    if (!this.probe) this.probe = document.createElement('canvas');
    if (this.probe.width !== sw || this.probe.height !== sh) {
      this.probe.width = sw;
      this.probe.height = sh;
      this.prevLuma = null;
    }
    if (!this.probeCtx) {
      this.probeCtx = this.probe.getContext('2d', { willReadFrequently: true });
      if (!this.probeCtx) return this.box ? [{ ...this.box }] : [];
    }
    const pctx = this.probeCtx;
    pctx.drawImage(video, 0, 0, sw, sh);

    let frame: ImageData;
    try {
      frame = pctx.getImageData(0, 0, sw, sh);
    } catch {
      return this.box ? [{ ...this.box }] : [];
    }

    const n = sw * sh;
    const luma = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      luma[i] = (frame.data[o] * 0.299 + frame.data[o + 1] * 0.587 + frame.data[o + 2] * 0.114) | 0;
    }

    // Frame differencing → motion centroid (in sample space).
    let changed = 0;
    let sumX = 0;
    let sumY = 0;
    if (this.prevLuma && this.prevLuma.length === n) {
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = y * sw + x;
          if (Math.abs(luma[i] - this.prevLuma[i]) > DIFF_THRESHOLD) {
            changed++;
            sumX += x;
            sumY += y;
          }
        }
      }
    }
    this.prevLuma = luma;

    const sx = vw / sw; // sample → video scale
    const sy = vh / sh;
    const size = Math.min(vw, vh) * 0.52;

    // Center-weighted default: selfie faces sit slightly above frame center.
    const cx = vw / 2 - size / 2;
    const cy = vh * 0.44 - size / 2;
    let target: FaceBox = {
      x: clamp(cx, 0, vw - size),
      y: clamp(cy, 0, vh - size),
      w: size,
      h: size,
      confidence: 0.35,
    };

    const motionRatio = changed / n;
    if (motionRatio > MIN_MOTION_RATIO && changed > 0) {
      const mx = (sumX / changed) * sx;
      const my = (sumY / changed) * sy;
      const motionBox: FaceBox = {
        x: clamp(mx - size / 2, 0, vw - size),
        y: clamp(my - size / 2, 0, vh - size),
        w: size,
        h: size,
        confidence: 0.55,
      };
      // Nudge the default toward motion, never fully trusting it.
      const k = clamp(motionRatio * 6, 0, 0.65);
      target = {
        x: target.x + (motionBox.x - target.x) * k,
        y: target.y + (motionBox.y - target.y) * k,
        w: size,
        h: size,
        confidence: target.confidence + (motionBox.confidence - target.confidence) * k,
      };
    }

    // Ease the live box toward the target so accessories don't jitter.
    if (!this.box) {
      this.box = { ...target };
    } else {
      const e = 0.35;
      this.box = {
        x: this.box.x + (target.x - this.box.x) * e,
        y: this.box.y + (target.y - this.box.y) * e,
        w: this.box.w + (target.w - this.box.w) * e,
        h: this.box.h + (target.h - this.box.h) * e,
        confidence: target.confidence,
      };
    }
    return [{ ...this.box }];  }
}
