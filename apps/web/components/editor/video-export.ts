// Video export engine: canvas.captureStream(30) + MediaRecorder, with a real
// WebAudio mix (original audio + music + voiceovers) and segment concatenation
// with transitions. What you preview is what gets recorded — the same
// renderFrame() path draws every exported frame.
import type { Pipeline, Segment, TransitionKind } from './types';
import { boundaryId } from './types';
import { outputDims, renderFrame } from './pipeline';

const CROSSFADE_SEC = 0.5; // export-time seconds
const FADE_SEC = 0.4;

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const c of candidates) {
    try {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
    } catch { /* ignore */ }
  }
  return '';
}

function waitEvent(el: HTMLElement, name: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { el.removeEventListener(name, done); reject(new Error(`timed out waiting for ${name}`)); }, timeoutMs);
    const done = () => { clearTimeout(t); resolve(); };
    el.addEventListener(name, done, { once: true });
  });
}

async function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(v.currentTime - t) < 0.04) return;
  const p = waitEvent(v, 'seeked', 8000);
  v.currentTime = Math.max(0, t);
  await p;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Resolve on the first of the named events (or reject on timeout); cleans up all listeners. */
function waitEither(el: HTMLElement, names: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const done = (name: string) => (ev: Event) => {
      clearTimeout(t);
      for (const n of names) el.removeEventListener(n, handlers[n]);
      if (name === 'error') reject(new Error('media load error'));
      else resolve(name);
    };
    const handlers: Record<string, (ev: Event) => void> = {};
    for (const n of names) { handlers[n] = done(n); el.addEventListener(n, handlers[n], { once: true }); }
    const t = setTimeout(() => {
      for (const n of names) el.removeEventListener(n, handlers[n]);
      reject(new Error(`timed out waiting for ${names.join('/')}`));
    }, timeoutMs);
  });
}

export interface VideoExportOpts {
  srcUrl: string;
  pipeline: Pipeline;
  canvas: HTMLCanvasElement; // already sized to export dims
  onProgress: (p: number) => void;
  signal?: AbortSignal;
}

/**
 * Records the edited video and returns the encoded Blob.
 * Throws on failure (caller surfaces an honest message).
 */
export async function exportVideoBlob(opts: VideoExportOpts): Promise<Blob> {
  const { srcUrl, pipeline, canvas, onProgress, signal } = opts;
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error('This browser cannot record video (MediaRecorder unavailable).');

  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  };

  // ── export media element (separate from the preview element) ──
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.preload = 'auto';
  v.playsInline = true;
  v.src = srcUrl;
  await waitEvent(v, 'loadedmetadata', 20000);
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) throw new Error('Could not read video dimensions.');

  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // ── audio graph ──
  let ac: AudioContext | null = null;
  try {
    ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac.state === 'suspended') await ac.resume();
  } catch {
    throw new Error('Audio engine unavailable in this browser — export needs WebAudio.');
  }
  const actx = ac;
  const dest = actx.createMediaStreamDestination();

  // original audio → master gain → mix
  const vSrc = actx.createMediaElementSource(v);
  const vGain = actx.createGain();
  vGain.gain.value = pipeline.masterVolume;
  vSrc.connect(vGain);
  vGain.connect(dest);

  // music element → gain (with fade automation) → mix
  let musicEl: HTMLAudioElement | null = null;
  if (pipeline.music) {
    musicEl = new Audio();
    musicEl.crossOrigin = 'anonymous';
    musicEl.loop = true;
    musicEl.src = pipeline.music.url;
    // wait for metadata or a definitive error (not just the timeout)
    try { await waitEither(musicEl, ['loadedmetadata', 'error'], 15000); }
    catch { /* play anyway; a broken track just yields silence */ }
    const mSrc = actx.createMediaElementSource(musicEl);
    const mGain = actx.createGain();
    mGain.gain.value = 0.0001;
    mSrc.connect(mGain);
    mGain.connect(dest);
    (musicEl as unknown as { _gain: GainNode })._gain = mGain;
  }

  // voiceovers → decode to buffers for sample-accurate scheduling.
  // Kick off immediately so decoding overlaps with video startup.
  const voPromise: Promise<Array<{ buffer: AudioBuffer; atSec: number; volume: number }>> =
    Promise.all(pipeline.voiceovers.map(async (vo) => {
      const ab = await (await fetch(vo.url)).arrayBuffer();
      const buf = await actx.decodeAudioData(ab);
      return { buffer: buf, atSec: vo.atSec, volume: vo.volume };
    })).catch(() => [] as Array<{ buffer: AudioBuffer; atSec: number; volume: number }>);

  // ── timeline ──
  const segs: Segment[] = pipeline.segments
    .map((s) => ({
      ...s,
      start: Math.max(pipeline.trimIn, s.start),
      end: Math.min(pipeline.trimOut, s.end),
    }))
    .filter((s) => s.end - s.start > 0.05)
    .sort((a, b) => a.start - b.start);
  if (segs.length === 0) segs.push({ id: 'full', start: pipeline.trimIn, end: pipeline.trimOut });

  const transOf = (i: number): TransitionKind =>
    i <= 0 ? 'none' : (pipeline.transitions[boundaryId(segs[i - 1].id, segs[i].id)] ?? 'none');

  const speed = pipeline.speed;
  const srcTotal = segs.reduce((a, s) => a + (s.end - s.start), 0);
  const fadeDips = segs.slice(0, -1).filter((_, i) => transOf(i + 1) === 'fade').length * FADE_SEC;
  const exportTotal = srcTotal / speed + fadeDips;
  if (exportTotal <= 0.05) throw new Error('Nothing to export — the trimmed range is empty.');

  // ── recorder ──
  const capStream = canvas.captureStream(30);
  const vTracks = capStream.getVideoTracks();
  if (vTracks.length === 0) throw new Error('Could not capture canvas frames.');
  const mixed = new MediaStream([...vTracks, ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(mixed, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  const stopped = new Promise<void>((resolve, reject) => {
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => resolve();
    rec.onerror = () => reject(new Error('Recording failed mid-export.'));
  });

  const still = document.createElement('canvas');
  still.width = W; still.height = H;
  const stillCtx = still.getContext('2d');

  const drawLive = (t: number) => renderFrame(ctx, v, vw, vh, pipeline, W, H, t);

  /** play() guarded against transient autoplay-policy rejections */
  const playVideo = async () => {
    try {
      await v.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        // Transient activation may have lapsed while media was preparing —
        // one retry usually succeeds since everything is cached by now.
        await new Promise((r) => setTimeout(r, 400));
        checkAbort();
        await v.play().catch(() => {
          throw new Error('The browser blocked video playback for export. Please tap Export again.');
        });
      } else {
        throw new Error('Video playback failed during export.');
      }
    }
  };

  const cleanup = () => {
    try { v.pause(); } catch { /* noop */ }
    try { musicEl?.pause(); } catch { /* noop */ }
    try { vSrc.disconnect(); vGain.disconnect(); } catch { /* noop */ }
    void actx.close().catch(() => undefined);
  };

  try {
    rec.start(500);
    const t0 = actx.currentTime + 0.15;

    // music: start + fade automation across the whole export
    if (musicEl && pipeline.music) {
      const m = pipeline.music;
      const gain = (musicEl as unknown as { _gain: GainNode })._gain;
      try {
        const dur = Number.isFinite(musicEl.duration) && musicEl.duration > 0 ? musicEl.duration : m.durationSec;
        musicEl.currentTime = dur > 0 ? m.startOffset % dur : 0;
      } catch { /* noop */ }
      gain.gain.setValueAtTime(0.0001, t0);
      if (m.fadeIn) {
        gain.gain.linearRampToValueAtTime(Math.max(0.0001, m.volume), t0 + Math.min(1.5, exportTotal / 2));
      } else {
        gain.gain.setValueAtTime(Math.max(0.0001, m.volume), t0);
      }
      if (m.fadeOut && exportTotal > 1.5) {
        gain.gain.setValueAtTime(Math.max(0.0001, m.volume), t0 + exportTotal - 1.5);
        gain.gain.linearRampToValueAtTime(0.0001, t0 + exportTotal);
      }
      await musicEl.play().catch(() => undefined);
    }

    let elapsed = 0; // export-time seconds completed
    let voDecodedCache: Array<{ buffer: AudioBuffer; atSec: number; volume: number }> = [];

    for (let i = 0; i < segs.length; i++) {
      checkAbort();
      const seg = segs[i];
      const trans = transOf(i);
      const segSrcLen = seg.end - seg.start;

      await seekTo(v, seg.start);
      v.playbackRate = speed;
      await playVideo();

      // schedule voiceovers inside this segment (buffers decoded in parallel earlier)
      if (i === 0) voDecodedCache = await voPromise;
      const voDecoded = voDecodedCache;
      for (const vo of voDecoded) {
        if (vo.atSec >= seg.start && vo.atSec < seg.end) {
          const src = actx.createBufferSource();
          src.buffer = vo.buffer;
          const g = actx.createGain();
          g.gain.value = Math.max(0.0001, vo.volume);
          src.connect(g); g.connect(dest);
          src.start(t0 + elapsed + (vo.atSec - seg.start) / speed);
        }
      }

      const segPerfStart = performance.now();
      let lastT = seg.start;

      for (;;) {
        checkAbort();
        const t = v.currentTime;
        lastT = t;
        const e = (performance.now() - segPerfStart) / 1000; // export-time into segment

        if (trans === 'crossfade' && stillCtx && e < CROSSFADE_SEC) {
          const p = Math.min(1, e / CROSSFADE_SEC);
          drawLive(t);
          ctx.save();
          ctx.globalAlpha = 1 - p;
          ctx.drawImage(still, 0, 0);
          ctx.restore();
        } else if (trans === 'fade' && e < FADE_SEC) {
          const p = Math.min(1, e / FADE_SEC);
          drawLive(t);
          ctx.save();
          ctx.fillStyle = '#000';
          ctx.globalAlpha = 1 - p;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        } else {
          drawLive(t);
        }

        onProgress(Math.min(0.99, (elapsed + Math.min(segSrcLen, Math.max(0, t - seg.start)) / speed) / exportTotal));

        if (t >= seg.end - 0.06 || v.ended) break;
        await nextFrame();
      }

      v.pause();
      const outTrans = i < segs.length - 1 ? transOf(i + 1) : 'none';

      if (outTrans === 'crossfade' && stillCtx) {
        // hold the last frame for the blend into the next segment
        stillCtx.drawImage(canvas, 0, 0);
      } else if (outTrans === 'fade') {
        // dip to black (adds FADE_SEC to the timeline)
        drawLive(lastT);
        const dipStart = performance.now();
        for (;;) {
          checkAbort();
          const p = (performance.now() - dipStart) / 1000 / FADE_SEC;
          if (p >= 1) break;
          drawLive(lastT);
          ctx.save();
          ctx.fillStyle = '#000';
          ctx.globalAlpha = Math.min(1, p);
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
          await nextFrame();
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        elapsed += FADE_SEC;
      }

      elapsed += segSrcLen / speed;
    }

    onProgress(1);
    rec.stop();
    await stopped;
    cleanup();
    return new Blob(chunks, { type: mimeType.split(';')[0] });
  } catch (err) {
    try { rec.state !== 'inactive' && rec.stop(); } catch { /* noop */ }
    cleanup();
    throw err;
  }
}

/** Export canvas dimensions for a video source + transform (capped at 1080p). */
export function exportDims(srcW: number, srcH: number, t: Pipeline['transform']): { w: number; h: number } {
  const d = outputDims(srcW, srcH, t);
  const s = Math.min(1, 1920 / Math.max(d.w, d.h));
  return { w: Math.max(2, Math.round(d.w * s)), h: Math.max(2, Math.round(d.h * s)) };
}
