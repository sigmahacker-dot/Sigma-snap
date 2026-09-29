// Video editing workspace: canvas compositor over a <video> element,
// transport + trim/scrub timeline, segments, and the export handoff.
'use client';
import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';
import { IconPause, IconPlay } from '@/lib/icons';
import type { CropRect, DrawTool, Pipeline, Segment, StickerInstance } from './types';
import type { Patch } from './panels';
import { uid } from './types';
import { renderFrame, rotatedDims } from './pipeline';
import { exportDims, exportVideoBlob } from './video-export';
import { CropOverlay, DraggableSticker, DraggableText, DrawingLayer, centeredAspectCrop, useContainerSize } from './overlay-items';
import type { EditorHandle } from './PhotoEditor';
import type { MediaAsset } from '@sigma-snap/shared';

export interface VideoEditorHandle extends EditorHandle {
  splitAtPlayhead: () => boolean;
  getTime: () => number;
  cancelExport: () => void;
}

interface Props {
  assetUrl: string;
  pipeline: Pipeline;
  patch: Patch;
  activeTool: string;
  cropMode: boolean;
  aspect: number;
  onAspectCrop: (c: CropRect) => void;
  drawTool: DrawTool;
  selTextId: string | null;
  setSelTextId: (id: string | null) => void;
  selStickerId: string | null;
  setSelStickerId: (id: string | null) => void;
  onSourceReady: (el: HTMLVideoElement, w: number, h: number) => void;
  onDuration: (d: number) => void;
  onTime: (t: number) => void;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const VideoEditor = forwardRef<VideoEditorHandle, Props>(function VideoEditor(
  { assetUrl, pipeline, patch, activeTool, cropMode, aspect, onAspectCrop, drawTool,
    selTextId, setSelTextId, selStickerId, setSelStickerId, onSourceReady, onDuration, onTime },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const exportingRef = useRef(false);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [wrapRef, wrapSize] = useContainerSize<HTMLDivElement>();
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const pipelineRef = useRef(pipeline);
  pipelineRef.current = pipeline;

  // duration mirror (reported to parent via onDuration for panels)
  const [dur, setDur] = useState(0);

  // canvas export dims
  const dims = vw && vh ? exportDims(vw, vh, pipeline.transform) : { w: 0, h: 0 };
  const W = dims.w, H = dims.h;

  // ── load video ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setReady(false); setLoadErr('');
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    const onMeta = () => {
      setVw(v.videoWidth); setVh(v.videoHeight);
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      setDur(d);
      onDuration(d);
      onSourceReady(v, v.videoWidth, v.videoHeight);
      setReady(true);
    };
    const onErr = () => setLoadErr('Could not load this video. It may have been deleted or blocked by CORS.');
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('error', onErr);
    v.src = assetUrl;
    v.load();
    return () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onErr); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetUrl]);

  // keep canvas sized
  useEffect(() => {
    const c = canvasRef.current;
    if (c && W && H) { c.width = W; c.height = H; }
  }, [W, H]);

  // master volume + speed follow pipeline
  useEffect(() => {
    const v = videoRef.current;
    if (v) { v.volume = pipeline.masterVolume; if (!exportingRef.current) v.playbackRate = pipeline.speed; }
  }, [pipeline.masterVolume, pipeline.speed]);

  // refit crop rect when the aspect preset changes
  useEffect(() => {
    const t = pipeline.transform;
    if (!cropMode || !t.crop || !aspect || !vw || !vh) return;
    const rd = rotatedDims(vw, vh, t);
    onAspectCrop(centeredAspectCrop(aspect, rd.w, rd.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  // ── music preview element ──
  useEffect(() => {
    const m = pipeline.music;
    if (!m) { musicRef.current?.pause(); musicRef.current = null; return; }
    if (!musicRef.current || musicRef.current.src !== m.url) {
      musicRef.current?.pause();
      const a = new Audio();
      a.crossOrigin = 'anonymous';
      a.src = m.url;
      a.loop = true;
      musicRef.current = a;
    }
    musicRef.current.volume = m.volume;
  }, [pipeline.music]);

  const segsSorted = useCallback((): Segment[] => {
    const p = pipelineRef.current;
    return [...p.segments]
      .map((s) => ({ ...s, start: Math.max(p.trimIn, s.start), end: Math.min(p.trimOut, s.end) }))
      .filter((s) => s.end - s.start > 0.03)
      .sort((a, b) => a.start - b.start);
  }, []);

  const syncMusic = useCallback((play: boolean) => {
    const a = musicRef.current;
    const v = videoRef.current;
    const m = pipelineRef.current.music;
    if (!a || !v || !m) return;
    if (play) {
      a.currentTime = Math.max(0, (v.currentTime - pipelineRef.current.trimIn + m.startOffset) % Math.max(1, m.durationSec));
      void a.play().catch(() => undefined);
    } else {
      a.pause();
    }
  }, []);

  // ── preview render loop ──
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || exportingRef.current || !ready) return;
      if (v.readyState < 2) return;
      const ctx = c.getContext('2d');
      if (!ctx || !W || !H) return;
      renderFrame(ctx, v, vw, vh, pipelineRef.current, W, H, v.currentTime);
      if (playheadRef.current && dur > 0) {
        playheadRef.current.style.left = `${Math.min(100, Math.max(0, (v.currentTime / dur) * 100))}%`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, vw, vh, W, H, dur]);

  // ── segment-following playback ──
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || exportingRef.current) return;
    const p = pipelineRef.current;
    const t = v.currentTime;
    setTime(t);
    onTime(t);
    if (v.paused) return;
    const segs = segsSorted();
    if (segs.length === 0) return;
    let seg = segs.find((s) => t >= s.start - 0.05 && t < s.end);
    if (!seg) {
      // drifted outside (e.g. trim changed) — snap to first segment
      v.currentTime = segs[0].start;
      return;
    }
    if (t >= seg.end - 0.09) {
      const i = segs.indexOf(seg);
      v.currentTime = segs[(i + 1) % segs.length].start;
    }
  }, [onTime, segsSorted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.addEventListener('timeupdate', onTimeUpdate);
    const onPlay = () => setPlaying(true);
    const onPause = () => { setPlaying(false); syncMusic(false); };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [onTimeUpdate, syncMusic]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !ready || exportingRef.current) return;
    if (v.paused) {
      const p = pipelineRef.current;
      if (v.currentTime < p.trimIn || v.currentTime >= p.trimOut) {
        const segs = segsSorted();
        v.currentTime = segs.length ? segs[0].start : p.trimIn;
      }
      void v.play().then(() => syncMusic(true)).catch(() => undefined);
    } else {
      v.pause();
    }
  }, [ready, segsSorted, syncMusic]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !ready) return;
    const p = pipelineRef.current;
    v.currentTime = Math.min(p.trimOut - 0.05, Math.max(p.trimIn, t));
    setTime(v.currentTime);
    onTime(v.currentTime);
    if (!v.paused) syncMusic(true);
  }, [ready, onTime, syncMusic]);

  // ── split ──
  const splitAtPlayhead = useCallback((): boolean => {
    const v = videoRef.current;
    if (!v) return false;
    const t = v.currentTime;
    const p = pipelineRef.current;
    const idx = p.segments.findIndex((s) => t > s.start + 0.3 && t < s.end - 0.3);
    if (idx < 0) return false;
    const s = p.segments[idx];
    const a: Segment = { id: uid(), start: s.start, end: t };
    const b: Segment = { id: uid(), start: t, end: s.end };
    const next = [...p.segments];
    next.splice(idx, 1, a, b);
    patch({ segments: next });
    return true;
  }, [patch]);

  // ── export ──
  useImperativeHandle(ref, () => ({
    exportAndUpload: async (onProgress) => {
      const c = canvasRef.current;
      const v = videoRef.current;
      if (!c || !v || !ready) throw new Error('Video not ready');
      exportingRef.current = true;
      v.pause();
      syncMusic(false);
      abortRef.current = new AbortController();
      try {
        onProgress(0.02);
        const blob = await exportVideoBlob({
          srcUrl: assetUrl,
          pipeline: pipelineRef.current,
          canvas: c,
          onProgress: (p) => onProgress(0.02 + p * 0.88),
          signal: abortRef.current.signal,
        });
        const file = new File([blob], `sigma-edit-${Date.now()}.webm`, { type: blob.type || 'video/webm' });
        const asset: MediaAsset = await api.uploadFile('VIDEO', file, (p) => onProgress(0.9 + p * 0.1));
        onProgress(1);
        return asset;
      } finally {
        exportingRef.current = false;
      }
    },
    splitAtPlayhead,
    getTime: () => videoRef.current?.currentTime ?? 0,
    cancelExport: () => abortRef.current?.abort(),
  }), [assetUrl, ready, splitAtPlayhead, syncMusic]);

  const updSticker = (id: string, part: Partial<StickerInstance>) =>
    patch({ stickers: pipeline.stickers.map((s) => (s.id === id ? { ...s, ...part } : s)) });

  const drawing = activeTool === 'draw';
  const cropping = cropMode && !!pipeline.transform.crop;
  const d = dur;

  return (
    <div className="relative">
      <video ref={videoRef} playsInline preload="auto" className="hidden" />
      {!ready && !loadErr && (
        <div className="flex aspect-[9/16] items-center justify-center rounded-3xl bg-panel"><Spinner /></div>
      )}
      {loadErr && <p className="rounded-3xl bg-panel p-8 text-center text-sm text-danger">{loadErr}</p>}
      {ready && W > 0 && (
        <>
          <div ref={wrapRef} className="relative overflow-hidden rounded-3xl bg-black"
            style={{ aspectRatio: `${W} / ${H}` }}
            onPointerDown={() => { setSelTextId(null); setSelStickerId(null); }}>
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {!cropping && !drawing && pipeline.textLayers.map((l) => {
              if (time < l.appearAt || time > l.appearTo) return null;
              return (
                <DraggableText key={l.id} layer={l} dispW={wrapSize.w || 300}
                  selected={selTextId === l.id}
                  onSelect={() => { setSelTextId(l.id); setSelStickerId(null); }}
                  onMove={(x, y) => patch({ textLayers: pipeline.textLayers.map((t) => (t.id === l.id ? { ...t, x, y } : t)) })} />
              );
            })}
            {!cropping && !drawing && pipeline.stickers.map((s) => (
              <DraggableSticker key={s.id} st={s} dispW={wrapSize.w || 300}
                selected={selStickerId === s.id}
                onSelect={() => { setSelStickerId(s.id); setSelTextId(null); }}
                onMove={(x, y) => updSticker(s.id, { x, y })}
                onScale={(sc) => updSticker(s.id, { scale: sc })}
                onRotate={(r) => updSticker(s.id, { rotation: r })}
                onDelete={() => { patch({ stickers: pipeline.stickers.filter((x) => x.id !== s.id) }); setSelStickerId(null); }} />
            ))}
            {cropping && pipeline.transform.crop && (
              <CropOverlay crop={pipeline.transform.crop} aspect={aspect} onChange={onAspectCrop} />
            )}
            <DrawingLayer tool={drawTool} strokes={pipeline.strokes}
              onStrokes={(s) => patch({ strokes: s })}
              dispW={wrapSize.w || 300} dispH={wrapSize.h || 300} active={drawing} />
            {/* transport overlay */}
            {!drawing && !cropping && (
              <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}
                className="absolute bottom-3 right-3 z-20 rounded-full bg-black/60 p-3 text-white backdrop-blur">
                {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
              </button>
            )}
          </div>
          {/* timeline */}
          <div className="mt-3 select-none">
            <Timeline
              duration={d} trimIn={pipeline.trimIn} trimOut={pipeline.trimOut}
              segments={pipeline.segments} voiceAt={pipeline.voiceovers.map((v) => v.atSec)}
              playheadRef={playheadRef}
              onSeek={seek}
              onTrim={(nin, nout) => {
                const segs: Segment[] = [{ id: uid(), start: nin, end: nout }];
                patch({ trimIn: nin, trimOut: nout, segments: segs, transitions: {} });
              }}
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-dim">
              <span>{fmt(time)}</span>
              <span>{fmt(d)} · {pipeline.speed}x · {pipeline.segments.length} seg</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default VideoEditor;

// ─── Timeline ──────────────────────────────────────────────────────────────
function Timeline({ duration, trimIn, trimOut, segments, voiceAt, playheadRef, onSeek, onTrim }:
  { duration: number; trimIn: number; trimOut: number; segments: Segment[];
    voiceAt: number[]; playheadRef: React.RefObject<HTMLDivElement>;
    onSeek: (t: number) => void;
    onTrim: (nin: number, nout: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { kind: 'seek' | 'in' | 'out'; startX: number; origIn: number; origOut: number }>(null);

  if (duration <= 0) return <div className="h-12 rounded-2xl bg-panel" />;

  const frac = (t: number) => (t / duration) * 100;
  const tAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };

  const down = (kind: 'seek' | 'in' | 'out') => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (kind === 'seek') onSeek(tAt(e.clientX));
    drag.current = { kind, startX: e.clientX, origIn: trimIn, origOut: trimOut };
  };
  const move = (e: React.PointerEvent) => {
    const dg = drag.current;
    if (!dg) return;
    if (dg.kind === 'seek') { onSeek(tAt(e.clientX)); return; }
    const r = trackRef.current!.getBoundingClientRect();
    const dt = ((e.clientX - dg.startX) / r.width) * duration;
    if (dg.kind === 'in') {
      onTrim(Math.min(dg.origIn + dt, dg.origOut - 0.5), dg.origOut);
    } else {
      onTrim(dg.origIn, Math.max(dg.origOut + dt, dg.origIn + 0.5));
    }
  };
  const up = () => { drag.current = null; };

  return (
    <div ref={trackRef}
      className="relative h-12 touch-none rounded-2xl bg-panel"
      onPointerDown={down('seek')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {/* full duration base */}
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/10" />
      {/* trim region */}
      <div className="absolute top-1/2 h-6 -translate-y-1/2 rounded-lg bg-vio/30 ring-1 ring-vio"
        style={{ left: `${frac(trimIn)}%`, width: `${frac(trimOut - trimIn)}%` }}>
        {segments.map((s) => (
          <div key={s.id} className="absolute top-0 h-full border-x border-white/50 bg-white/10 first:rounded-l-lg last:rounded-r-lg"
            style={{ left: `${((s.start - trimIn) / (trimOut - trimIn)) * 100}%`, width: `${((s.end - s.start) / (trimOut - trimIn)) * 100}%` }} />
        ))}
      </div>
      {/* voiceover markers */}
      {voiceAt.map((t, i) => (
        <div key={i} className="absolute top-1 h-2 w-2 rounded-full bg-gold" style={{ left: `calc(${frac(t)}% - 4px)` }} title="voiceover" />
      ))}
      {/* trim handles */}
      <div className="absolute top-1/2 z-10 h-10 w-5 -translate-y-1/2 cursor-ew-resize rounded-md bg-vio shadow-glow"
        style={{ left: `calc(${frac(trimIn)}% - 10px)` }}
        onPointerDown={down('in')} />
      <div className="absolute top-1/2 z-10 h-10 w-5 -translate-y-1/2 cursor-ew-resize rounded-md bg-vio shadow-glow"
        style={{ left: `calc(${frac(trimOut)}% - 10px)` }}
        onPointerDown={down('out')} />
      {/* playhead */}
      <div ref={playheadRef} className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-white shadow" style={{ left: '0%' }} />
    </div>
  );
}
