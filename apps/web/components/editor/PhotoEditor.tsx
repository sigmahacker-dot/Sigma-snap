// Photo editing workspace: canvas preview, interactive overlays, JPEG export.
'use client';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';
import type { CropRect, DrawTool, Pipeline, StickerInstance } from './types';
import type { Patch } from './panels';
import { outputDims, renderFrame, rotatedDims } from './pipeline';
import { CropOverlay, DraggableSticker, DraggableText, DrawingLayer, centeredAspectCrop, useContainerSize } from './overlay-items';
import type { MediaAsset } from '@sigma-snap/shared';

export interface EditorHandle {
  exportAndUpload: (onProgress: (p: number) => void) => Promise<MediaAsset>;
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
  onSourceReady: (el: HTMLImageElement, w: number, h: number) => void;
}

const MAX_DIM = 2048;

const PhotoEditor = forwardRef<EditorHandle, Props>(function PhotoEditor(
  { assetUrl, pipeline, patch, activeTool, cropMode, aspect, onAspectCrop, drawTool,
    selTextId, setSelTextId, selStickerId, setSelStickerId, onSourceReady },
  ref,
) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wrapRef, wrapSize] = useContainerSize<HTMLDivElement>();

  // load image
  useEffect(() => {
    setLoadErr('');
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => { setImg(im); onSourceReady(im, im.naturalWidth, im.naturalHeight); };
    im.onerror = () => setLoadErr('Could not load this photo. It may have been deleted or blocked by CORS.');
    im.src = assetUrl;
    return () => { im.onload = null; im.onerror = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetUrl]);

  // canvas size from transform
  const dims = img ? outputDims(img.naturalWidth, img.naturalHeight, pipeline.transform) : { w: 0, h: 0 };
  const scale = dims.w && dims.h ? Math.min(1, MAX_DIM / Math.max(dims.w, dims.h)) : 1;
  const W = Math.max(2, Math.round(dims.w * scale));
  const H = Math.max(2, Math.round(dims.h * scale));

  // render
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    renderFrame(ctx, img, img.naturalWidth, img.naturalHeight, pipeline, W, H);
  }, [img, pipeline, W, H]);

  // refit crop rect when the aspect preset changes
  useEffect(() => {
    const t = pipeline.transform;
    if (!cropMode || !t.crop || !aspect || !img) return;
    const rd = rotatedDims(img.naturalWidth, img.naturalHeight, t);
    onAspectCrop(centeredAspectCrop(aspect, rd.w, rd.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  useImperativeHandle(ref, () => ({
    exportAndUpload: async (onProgress) => {
      const c = canvasRef.current;
      if (!c || !img) throw new Error('Photo not ready');
      onProgress(0.1);
      // re-render at full export resolution to be certain
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      renderFrame(ctx, img, img.naturalWidth, img.naturalHeight, pipeline, W, H);
      onProgress(0.5);
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('JPEG encoding failed');
      onProgress(0.75);
      const file = new File([blob], `sigma-edit-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const asset = await api.uploadFile('PHOTO', file, (p) => onProgress(0.75 + p * 0.25));
      onProgress(1);
      return asset;
    },
  }), [img, pipeline, W, H]);

  const drawing = activeTool === 'draw';
  const cropping = cropMode && !!pipeline.transform.crop;

  const updSticker = (id: string, part: Partial<StickerInstance>) =>
    patch({ stickers: pipeline.stickers.map((s) => (s.id === id ? { ...s, ...part } : s)) });

  return (
    <div className="relative">
      {!img && !loadErr && (
        <div className="flex aspect-[4/5] items-center justify-center rounded-3xl bg-panel"><Spinner /></div>
      )}
      {loadErr && <p className="rounded-3xl bg-panel p-8 text-center text-sm text-danger">{loadErr}</p>}
      {img && (
        <div ref={wrapRef} className="relative overflow-hidden rounded-3xl bg-black"
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerDown={() => { setSelTextId(null); setSelStickerId(null); }}>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ width: '100%', height: '100%' }} />
          {/* text overlays */}
          {!cropping && !drawing && pipeline.textLayers.map((l) => (
            <DraggableText key={l.id} layer={l} dispW={wrapSize.w || 300}
              selected={selTextId === l.id}
              onSelect={() => { setSelTextId(l.id); setSelStickerId(null); }}
              onMove={(x, y) => patch({ textLayers: pipeline.textLayers.map((t) => (t.id === l.id ? { ...t, x, y } : t)) })} />
          ))}
          {/* sticker overlays */}
          {!cropping && !drawing && pipeline.stickers.map((s) => (
            <DraggableSticker key={s.id} st={s} dispW={wrapSize.w || 300}
              selected={selStickerId === s.id}
              onSelect={() => { setSelStickerId(s.id); setSelTextId(null); }}
              onMove={(x, y) => updSticker(s.id, { x, y })}
              onScale={(sc) => updSticker(s.id, { scale: sc })}
              onRotate={(r) => updSticker(s.id, { rotation: r })}
              onDelete={() => { patch({ stickers: pipeline.stickers.filter((x) => x.id !== s.id) }); setSelStickerId(null); }} />
          ))}
          {/* crop overlay */}
          {cropping && pipeline.transform.crop && (
            <CropOverlay crop={pipeline.transform.crop} aspect={aspect}
              onChange={(c) => onAspectCrop(c)} />
          )}
          {/* drawing */}
          <DrawingLayer tool={drawTool} strokes={pipeline.strokes}
            onStrokes={(s) => patch({ strokes: s })}
            dispW={wrapSize.w || 300} dispH={wrapSize.h || 300} active={drawing} />
        </div>
      )}
    </div>
  );
});

export default PhotoEditor;
