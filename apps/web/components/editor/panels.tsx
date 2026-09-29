// Editor tool panels — every control performs a real pipeline operation.
'use client';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Input, TextArea, BottomSheet, Toggle, Spinner, Badge } from '@/components/ui';
import {
  IconChevronLeft, IconMic, IconMusic, IconPause, IconPlay,
  IconPlus, IconRefresh, IconScissors, IconSearch, IconTrash, IconWand, IconX,
} from '@/lib/icons';
import { STICKERS, StickerThumb } from './stickers';
import { drawBase } from './pipeline';
import type {
  AiEffect, AiLanguage, DrawTool, FilterId, FontId, MusicTrack, Pipeline,
  Segment, StickerId, TextAnim, TextLayer, TransitionKind, Voiceover,
} from './types';
import { AI_LANGUAGES, FILTERS, FONTS, KNOWN_OVERLAYS, TEXT_COLORS, boundaryId, uid } from './types';

export type Patch = (part: Partial<Pipeline>) => void;

function Slider({ label, value, min, max, step = 1, onChange, format }:
  { label: string; value: number; min: number; max: number; step?: number;
    onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-dim">{label}</span>
        <span className="font-semibold text-ink">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-vio" />
    </label>
  );
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Filters (with live canvas previews) ───────────────────────────────────
export function FiltersPanel({ p, patch, source }:
  { p: Pipeline; patch: Patch; source: { el: HTMLImageElement | HTMLVideoElement; w: number; h: number } | null }) {
  const refs = useRef<Record<string, HTMLCanvasElement | null>>({});
  useEffect(() => {
    if (!source) return;
    for (const f of FILTERS) {
      const c = refs.current[f.id];
      if (!c) continue;
      const W = 120, H = 120;
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      const preset: Record<FilterId, string> = {
        none: '', vivid: 'saturate(1.4) contrast(1.12)', noir: 'grayscale(1) contrast(1.22)',
        warm: 'sepia(0.32) saturate(1.25)', cool: 'saturate(1.12) hue-rotate(14deg)',
        sepia: 'sepia(0.85)', fade: 'contrast(0.86) brightness(1.08) saturate(0.68)',
      };
      const { el, w, h } = source;
      // centered square thumbnail
      const side = Math.min(w, h);
      const crop = { x: (w - side) / (2 * w), y: (h - side) / (2 * h), w: side / w, h: side / h };
      drawBase(ctx, el as never, w, h,
        { rotation: 0, flipH: false, flipV: false, crop },
        preset[f.id], W, H);
    }
  }, [source]);
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {FILTERS.map((f) => (
        <button key={f.id} onClick={() => patch({ filter: f.id })}
          className={`flex shrink-0 flex-col items-center gap-1.5 ${p.filter === f.id ? 'text-vio' : 'text-dim'}`}>
          <canvas ref={(c) => { refs.current[f.id] = c; }}
            className={`h-16 w-16 rounded-2xl object-cover ${p.filter === f.id ? 'ring-2 ring-vio' : 'ring-1 ring-line'}`} />
          <span className="text-[11px] font-medium">{f.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Adjust ────────────────────────────────────────────────────────────────
export function AdjustPanel({ p, patch }: { p: Pipeline; patch: Patch }) {
  const a = p.adjust;
  return (
    <div className="grid gap-4">
      <Slider label="Brightness" value={a.brightness} min={-100} max={100} onChange={(v) => patch({ adjust: { ...a, brightness: v } })} />
      <Slider label="Contrast" value={a.contrast} min={-100} max={100} onChange={(v) => patch({ adjust: { ...a, contrast: v } })} />
      <Slider label="Saturation" value={a.saturation} min={-100} max={100} onChange={(v) => patch({ adjust: { ...a, saturation: v } })} />
      <Button variant="ghost" className="!py-2 text-xs"
        onClick={() => patch({ adjust: { brightness: 0, contrast: 0, saturation: 0 } })}>Reset adjustments</Button>
    </div>
  );
}

// ─── Transform ────────────────────────────────────────────────────────────
export function TransformPanel({ p, patch, cropMode, setCropMode, aspect, setAspect }:
  { p: Pipeline; patch: Patch; cropMode: boolean; setCropMode: (v: boolean) => void;
    aspect: number; setAspect: (v: number) => void }) {
  const t = p.transform;
  const rot = () => patch({ transform: { ...t, rotation: ((t.rotation + 90) % 360) as 0 | 90 | 180 | 270 } });
  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1 !py-2 text-xs" onClick={rot}>
          <IconRefresh size={15} className="mr-1 inline" /> Rotate 90°
        </Button>
        <Button variant={t.flipH ? 'primary' : 'ghost'} className="flex-1 !py-2 text-xs"
          onClick={() => patch({ transform: { ...t, flipH: !t.flipH } })}>Flip H</Button>
        <Button variant={t.flipV ? 'primary' : 'ghost'} className="flex-1 !py-2 text-xs"
          onClick={() => patch({ transform: { ...t, flipV: !t.flipV } })}>Flip V</Button>
      </div>
      <Toggle label="Crop mode (drag corners on canvas)" checked={cropMode} onChange={(v) => {
        setCropMode(v);
        if (v && !t.crop) {
          // start crop at a centered 4:5-ish box
          patch({ transform: { ...t, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } } });
        }
      }} />
      {cropMode && (
        <div className="flex gap-2">
          {[{ l: 'Free', v: 0 }, { l: '1:1', v: 1 }, { l: '4:5', v: 4 / 5 }, { l: '9:16', v: 9 / 16 }].map((a) => (
            <button key={a.l} onClick={() => setAspect(a.v)}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold ${aspect === a.v ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>{a.l}</button>
          ))}
        </div>
      )}
      {(t.crop || t.rotation !== 0 || t.flipH || t.flipV) && (
        <Button variant="ghost" className="!py-2 text-xs"
          onClick={() => { patch({ transform: { rotation: 0, flipH: false, flipV: false, crop: null } }); setCropMode(false); }}>
          Reset transform
        </Button>
      )}
    </div>
  );
}

// ─── Text ──────────────────────────────────────────────────────────────────
export function TextPanel({ p, patch, isVideo, duration, selId, setSelId }:
  { p: Pipeline; patch: Patch; isVideo: boolean; duration: number;
    selId: string | null; setSelId: (id: string | null) => void }) {
  const sel = p.textLayers.find((l) => l.id === selId) ?? null;
  const upd = (id: string, part: Partial<TextLayer>) =>
    patch({ textLayers: p.textLayers.map((l) => (l.id === id ? { ...l, ...part } : l)) });

  const add = () => {
    const layer: TextLayer = {
      id: uid(), text: 'Your text', x: 0.5, y: 0.5, size: 64, color: '#ffffff',
      align: 'center', fontId: 'system', bold: true, stroke: true, strokeColor: '#000000',
      shadow: true, glow: false, rotation: 0, anim: 'fade', appearAt: 0, appearTo: duration || 0,
    };
    patch({ textLayers: [...p.textLayers, layer] });
    setSelId(layer.id);
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button onClick={add} className="flex shrink-0 items-center gap-1 rounded-xl bg-vio/15 px-3 py-2 text-xs font-bold text-vio">
          <IconPlus size={14} /> Add text
        </button>
        {p.textLayers.map((l, i) => (
          <button key={l.id} onClick={() => setSelId(l.id)}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${selId === l.id ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>
            {l.text.slice(0, 10) || `Text ${i + 1}`}
          </button>
        ))}
      </div>
      {!sel && <p className="text-xs text-dim">Tap “Add text”, then drag it on the canvas to position.</p>}
      {sel && (
        <div className="grid gap-3 rounded-2xl border border-line bg-panel2 p-3">
          <div className="flex items-start gap-2">
            <TextArea rows={2} value={sel.text} onChange={(e) => upd(sel.id, { text: e.target.value })}
              placeholder="Type something…" className="!py-2" />
            <button onClick={() => {
              patch({ textLayers: p.textLayers.filter((l) => l.id !== sel.id) });
              setSelId(null);
            }} className="rounded-xl bg-danger/15 p-2.5 text-danger" aria-label="Delete text">
              <IconTrash size={16} />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FONTS.map((f) => (
              <button key={f.id} onClick={() => upd(sel.id, { fontId: f.id as FontId })}
                style={{ fontFamily: f.stack }}
                className={`shrink-0 rounded-xl px-3 py-2 text-sm ${sel.fontId === f.id ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button key={c} onClick={() => upd(sel.id, { color: c })} aria-label={`color ${c}`}
                className={`h-8 w-8 rounded-full ${sel.color === c ? 'ring-2 ring-white' : 'ring-1 ring-line'}`}
                style={{ background: c }} />
            ))}
          </div>
          <Slider label="Size" value={sel.size} min={24} max={160} onChange={(v) => upd(sel.id, { size: v })} />
          <Slider label="Rotation" value={sel.rotation} min={-180} max={180} onChange={(v) => upd(sel.id, { rotation: v })} format={(v) => `${v}°`} />
          <div className="flex gap-2">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} onClick={() => upd(sel.id, { align: a })}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize ${sel.align === a ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>{a}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Bold" checked={sel.bold} onChange={(v) => upd(sel.id, { bold: v })} />
            <Toggle label="Outline" checked={sel.stroke} onChange={(v) => upd(sel.id, { stroke: v })} />
            <Toggle label="Shadow" checked={sel.shadow} onChange={(v) => upd(sel.id, { shadow: v })} />
            <Toggle label="Glow" checked={sel.glow} onChange={(v) => upd(sel.id, { glow: v })} />
          </div>
          <div>
            <p className="mb-1 text-xs text-dim">Entrance animation</p>
            <div className="flex gap-2">
              {(['none', 'fade', 'slide', 'pop'] as TextAnim[]).map((a) => (
                <button key={a} onClick={() => upd(sel.id, { anim: a })}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize ${sel.anim === a ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>{a}</button>
              ))}
            </div>
          </div>
          {isVideo && duration > 0 && (
            <>
              <Slider label="Appears at" value={sel.appearAt} min={0} max={duration} step={0.1}
                onChange={(v) => upd(sel.id, { appearAt: Math.min(v, sel.appearTo) })} format={fmtTime} />
              <Slider label="Disappears at" value={sel.appearTo} min={0} max={duration} step={0.1}
                onChange={(v) => upd(sel.id, { appearTo: Math.max(v, sel.appearAt) })} format={fmtTime} />
            </>
          )}
          <p className="text-[11px] text-dim">Drag the text directly on the canvas to move it.</p>
        </div>
      )}
    </div>
  );
}

// ─── Stickers ──────────────────────────────────────────────────────────────
export function StickerPanel({ p, patch }: { p: Pipeline; patch: Patch }) {
  const add = (stickerId: StickerId) =>
    patch({ stickers: [...p.stickers, { id: uid(), stickerId, x: 0.5, y: 0.5, scale: 1, rotation: 0 }] });
  return (
    <div>
      <div className="grid grid-cols-6 gap-2">
        {STICKERS.map((s) => (
          <button key={s.id} onClick={() => add(s.id)}
            className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 p-2 hover:bg-white/10 active:scale-95">
            <StickerThumb id={s.id} size={40} />
            <span className="text-[10px] text-dim">{s.label}</span>
          </button>
        ))}
      </div>
      {p.stickers.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-panel2 px-3 py-2">
          <span className="text-xs text-dim">{p.stickers.length} sticker{p.stickers.length > 1 ? 's' : ''} on canvas — drag to move, pinch handles in selection</span>
          <button onClick={() => patch({ stickers: [] })} className="flex items-center gap-1 text-xs font-semibold text-danger">
            <IconTrash size={13} /> Clear
          </button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-dim">Tap a placed sticker to select it, then use the on-canvas handles to scale / rotate, or delete it.</p>
    </div>
  );
}

// ─── Drawing ──────────────────────────────────────────────────────────────
const DRAW_COLORS = ['#ffffff', '#000000', '#7C5CFF', '#38E1FF', '#FFC44D', '#FF5470', '#4ADE80'];

export function DrawPanel({ p, patch, tool, setTool }:
  { p: Pipeline; patch: Patch; tool: DrawTool; setTool: (t: DrawTool) => void }) {
  const [color, setColor] = useState('#7C5CFF');
  const [width, setWidth] = useState(14);
  const [opacity, setOpacity] = useState(1);
  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        {([['pen', 'Pen'], ['marker', 'Marker'], ['eraser', 'Eraser']] as Array<[DrawTool, string]>).map(([t, label]) => (
          <button key={t} onClick={() => setTool(t)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold ${tool === t ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>{label}</button>
        ))}
      </div>
      {tool !== 'eraser' && (
        <div className="flex gap-1.5">
          {DRAW_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`draw color ${c}`}
              className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-white' : 'ring-1 ring-line'}`}
              style={{ background: c }} />
          ))}
        </div>
      )}
      <Slider label="Brush size" value={width} min={4} max={60} onChange={setWidth} />
      {tool === 'pen' && <Slider label="Opacity" value={Math.round(opacity * 100)} min={10} max={100}
        onChange={(v) => setOpacity(v / 100)} format={(v) => `${v}%`} />}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1 !py-2 text-xs" onClick={() => patch({ strokes: p.strokes.slice(0, -1) })}
          disabled={p.strokes.length === 0}>Undo stroke</Button>
        <Button variant="ghost" className="flex-1 !py-2 text-xs" onClick={() => patch({ strokes: [] })}
          disabled={p.strokes.length === 0}>Clear all</Button>
      </div>
      <p className="text-[11px] text-dim">Draw directly on the canvas with your finger. Strokes are baked into the export.</p>
      {/* hidden carrier so Photo/Video editors can read current brush settings */}
      <span data-draw-color={color} data-draw-width={width} data-draw-opacity={opacity} className="hidden" id="draw-brush" />
    </div>
  );
}

/** Read current brush settings chosen in DrawPanel. */
export function readBrush(): { color: string; width: number; opacity: number } {
  if (typeof document === 'undefined') return { color: '#7C5CFF', width: 14, opacity: 1 };
  const el = document.getElementById('draw-brush');
  if (!el) return { color: '#7C5CFF', width: 14, opacity: 1 };
  return {
    color: el.dataset.drawColor ?? '#7C5CFF',
    width: Number(el.dataset.drawWidth ?? 14),
    opacity: Number(el.dataset.drawOpacity ?? 1),
  };
}

// ─── Music ─────────────────────────────────────────────────────────────────
export function MusicPanel({ p, patch, openPicker }:
  { p: Pipeline; patch: Patch; openPicker: () => void }) {
  const m = p.music;
  if (!m) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="rounded-2xl bg-white/5 p-4"><IconMusic size={26} className="text-dim" /></div>
        <p className="text-sm text-dim">Add a soundtrack from the sound library.</p>
        <Button onClick={openPicker}>Choose music</Button>
      </div>
    );
  }
  const upd = (part: Partial<MusicTrack>) => patch({ music: { ...m, ...part } });
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-line bg-panel2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{m.title}</p>
          <p className="truncate text-xs text-dim">{m.artist ?? 'Sound library'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="!px-3 !py-2 text-xs" onClick={openPicker}>Change</Button>
          <button onClick={() => patch({ music: null })} className="rounded-xl bg-danger/15 p-2 text-danger" aria-label="Remove music">
            <IconTrash size={15} />
          </button>
        </div>
      </div>
      <Slider label="Start offset in track" value={m.startOffset} min={0} max={Math.max(0, m.durationSec - 1)} step={0.5}
        onChange={(v) => upd({ startOffset: v })} format={fmtTime} />
      <Slider label="Volume" value={Math.round(m.volume * 100)} min={0} max={100}
        onChange={(v) => upd({ volume: v / 100 })} format={(v) => `${v}%`} />
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Fade in" checked={m.fadeIn} onChange={(v) => upd({ fadeIn: v })} />
        <Toggle label="Fade out" checked={m.fadeOut} onChange={(v) => upd({ fadeOut: v })} />
      </div>
      <p className="text-[11px] text-dim">Mixed live in preview and baked into the export with gain automation.</p>
    </div>
  );
}

export function MusicPickerSheet({ open, onClose, onPick }:
  { open: boolean; onClose: () => void; onPick: (m: MusicTrack) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Array<{ id: string; title: string; artist?: string | null; durationSec?: number | null; url?: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = async (query: string) => {
    setLoading(true); setErr('');
    try {
      const res = await api.sounds(query || undefined);
      setItems(res.data ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load sounds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setQ('');
    void load('');
    return () => { audioRef.current?.pause(); setPreviewId(null); };
  }, [open ]);

  useEffect(() => {
    const t = setTimeout(() => { if (open) void load(q); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q ]);

  const togglePreview = (id: string, url: string | null | undefined) => {
    if (!url) return;
    if (previewId === id) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    void audioRef.current.play();
    setPreviewId(id);
    audioRef.current.onended = () => setPreviewId(null);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Choose music">
      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-line bg-panel2 px-3">
        <IconSearch size={16} className="text-dim" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sounds…"
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-dim/70" />
      </div>
      {loading && <div className="flex justify-center py-8"><Spinner /></div>}
      {err && <p className="py-4 text-center text-sm text-danger">{err}</p>}
      {!loading && !err && items.length === 0 && (
        <p className="py-8 text-center text-sm text-dim">No sounds found. The library only lists original or user-uploaded audio.</p>
      )}
      <div className="grid gap-2 pb-4">
        {items.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel2 px-3 py-2.5">
            <button onClick={() => togglePreview(s.id, s.url)}
              disabled={!s.url}
              className="rounded-full bg-vio/15 p-2.5 text-vio disabled:opacity-30" aria-label="Preview">
              {previewId === s.id ? <IconPause size={15} /> : <IconPlay size={15} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{s.title}</p>
              <p className="truncate text-xs text-dim">
                {s.artist ?? 'Unknown artist'}{s.durationSec ? ` · ${fmtTime(s.durationSec)}` : ''}{!s.url ? ' · no audio file' : ''}
              </p>
            </div>
            <button
              disabled={!s.url}
              onClick={() => {
                onPick({
                  soundId: s.id, title: s.title, artist: s.artist, url: s.url as string,
                  durationSec: s.durationSec ?? 30, startOffset: 0, volume: 0.7, fadeIn: true, fadeOut: true,
                });
                onClose();
              }}
              className="rounded-xl bg-vio px-3.5 py-2 text-xs font-bold text-white disabled:opacity-30">
              Use
            </button>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

// ─── Voiceover ─────────────────────────────────────────────────────────────
export function VoicePanel({ p, patch, currentTime }:
  { p: Pipeline; patch: Patch; currentTime: number }) {
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        const url = URL.createObjectURL(blob);
        const a = document.createElement('audio');
        a.src = url;
        a.onloadedmetadata = () => {
          const vo: Voiceover = {
            id: uid(), blob, url, atSec: currentTime, volume: 1,
            durationSec: Number.isFinite(a.duration) ? a.duration : 0,
          };
          patch({ voiceovers: [...p.voiceovers, vo] });
        };
      };
      rec.start();
      setRecording(true);
    } catch {
      setErr('Microphone unavailable — check browser permission.');
    }
  };
  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  return (
    <div className="grid gap-3">
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex items-center gap-3">
        {!recording ? (
          <Button onClick={start} className="flex items-center gap-2">
            <IconMic size={16} /> Record voiceover
          </Button>
        ) : (
          <Button variant="danger" onClick={stop} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-rec-blink rounded-full bg-white" /> Stop recording
          </Button>
        )}
        <p className="text-xs text-dim">Placed at playhead {fmtTime(currentTime)}</p>
      </div>
      {p.voiceovers.length === 0 && (
        <p className="text-xs text-dim">No voiceovers yet. Recordings are mixed into the export at the playhead position where you start them.</p>
      )}
      {p.voiceovers.map((v) => (
        <VoiceRow key={v.id} v={v}
          onVolume={(vol) => patch({ voiceovers: p.voiceovers.map((x) => (x.id === v.id ? { ...x, volume: vol } : x)) })}
          onDelete={() => {
            URL.revokeObjectURL(v.url);
            patch({ voiceovers: p.voiceovers.filter((x) => x.id !== v.id) });
          }} />
      ))}
    </div>
  );
}

function VoiceRow({ v, onVolume, onDelete }: { v: Voiceover; onVolume: (n: number) => void; onDelete: () => void }) {
  const [playing, setPlaying] = useState(false);
  const aRef = useRef<HTMLAudioElement | null>(null);
  const toggle = () => {
    if (!aRef.current) aRef.current = new Audio(v.url);
    if (playing) { aRef.current.pause(); setPlaying(false); }
    else { void aRef.current.play(); setPlaying(true); aRef.current.onended = () => setPlaying(false); }
  };
  return (
    <div className="rounded-2xl border border-line bg-panel2 p-3">
      <div className="flex items-center gap-2">
        <button onClick={toggle} className="rounded-full bg-vio/15 p-2 text-vio" aria-label="Play voiceover">
          {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
        </button>
        <div className="flex-1">
          <p className="text-xs font-semibold">Voiceover · at {fmtTime(v.atSec)}{v.durationSec ? ` · ${fmtTime(v.durationSec)}` : ''}</p>
          <input type="range" min={0} max={100} value={Math.round(v.volume * 100)}
            onChange={(e) => onVolume(Number(e.target.value) / 100)} className="w-full accent-vio" />
        </div>
        <button onClick={onDelete} className="rounded-xl bg-danger/15 p-2 text-danger" aria-label="Delete voiceover">
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Volume / speed / trim ─────────────────────────────────────────────────
export function VolumePanel({ p, patch }: { p: Pipeline; patch: Patch }) {
  return (
    <div className="grid gap-3">
      <Slider label="Original audio volume" value={Math.round(p.masterVolume * 100)} min={0} max={100}
        onChange={(v) => patch({ masterVolume: v / 100 })} format={(v) => `${v}%`} />
      <p className="text-[11px] text-dim">Applies to the clip’s own sound in preview and in the export mix.</p>
    </div>
  );
}

export function SpeedPanel({ p, patch }: { p: Pipeline; patch: Patch }) {
  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        {([0.5, 1, 2] as const).map((s) => (
          <button key={s} onClick={() => patch({ speed: s })}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold ${p.speed === s ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>
            {s}x
          </button>
        ))}
      </div>
      <p className="text-[11px] text-dim">Speed is applied with playbackRate during export — the output duration changes accordingly.</p>
    </div>
  );
}

export function TrimPanel({ p, patch, duration }: { p: Pipeline; patch: Patch; duration: number }) {
  const setIn = (v: number) => {
    const nv = Math.min(v, p.trimOut - 0.5);
    patch({ trimIn: Math.max(0, nv), segments: [{ id: uid(), start: Math.max(0, nv), end: p.trimOut }] });
  };
  const setOut = (v: number) => {
    const nv = Math.max(v, p.trimIn + 0.5);
    patch({ trimOut: Math.min(duration, nv), segments: [{ id: uid(), start: p.trimIn, end: Math.min(duration, nv) }] });
  };
  return (
    <div className="grid gap-3">
      <Slider label="Trim start" value={p.trimIn} min={0} max={duration} step={0.1} onChange={setIn} format={fmtTime} />
      <Slider label="Trim end" value={p.trimOut} min={0} max={duration} step={0.1} onChange={setOut} format={fmtTime} />
      <p className="text-xs text-dim">Export length: <span className="font-bold text-ink">{fmtTime(Math.max(0, (p.trimOut - p.trimIn) / p.speed))}</span> at {p.speed}x</p>
      <Button variant="ghost" className="!py-2 text-xs"
        onClick={() => patch({ trimIn: 0, trimOut: duration, segments: [{ id: uid(), start: 0, end: duration }] })}>
        Reset trim
      </Button>
    </div>
  );
}

// ─── Segments (split / transitions) ────────────────────────────────────────
export function SegmentsPanel({ p, patch, onSplit, duration }:
  { p: Pipeline; patch: Patch; onSplit: () => void; duration: number }) {
  const segs: Segment[] = p.segments;
  const setTransition = (a: Segment, b: Segment, kind: TransitionKind) =>
    patch({ transitions: { ...p.transitions, [boundaryId(a.id, b.id)]: kind } });
  const removeSeg = (id: string) => {
    if (segs.length <= 1) return;
    const next = segs.filter((s) => s.id !== id);
    // merge gap: extend previous segment to cover removed one
    const idx = segs.findIndex((s) => s.id === id);
    if (idx > 0) next[idx - 1] = { ...next[idx - 1], end: segs[idx].end };
    else if (next.length > 0) next[0] = { ...next[0], start: segs[idx].start };
    patch({ segments: next });
  };
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-dim">{segs.length} segment{segs.length > 1 ? 's' : ''} · export concatenates them in order</p>
        <div className="flex gap-2">
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={onSplit}>
            <IconScissors size={13} className="mr-1 inline" /> Split at playhead
          </Button>
          {segs.length > 1 && (
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs"
              onClick={() => patch({ segments: [{ id: uid(), start: p.trimIn, end: p.trimOut }], transitions: {} })}>
              Reset
            </Button>
          )}
        </div>
      </div>
      {segs.map((s, i) => (
        <div key={s.id}>
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel2 px-3 py-2">
            <Badge tone="cy">{i + 1}</Badge>
            <span className="flex-1 text-xs font-semibold">{fmtTime(s.start)} → {fmtTime(s.end)}</span>
            <span className="text-[11px] text-dim">{fmtTime((s.end - s.start) / p.speed)} out</span>
            {segs.length > 1 && (
              <button onClick={() => removeSeg(s.id)} className="rounded-lg bg-danger/15 p-1.5 text-danger" aria-label="Remove segment">
                <IconX size={13} />
              </button>
            )}
          </div>
          {i < segs.length - 1 && (
            <div className="flex items-center gap-2 py-1.5 pl-6">
              <span className="text-[11px] text-dim">Transition</span>
              {(['none', 'fade', 'crossfade'] as TransitionKind[]).map((k) => (
                <button key={k}
                  onClick={() => setTransition(s, segs[i + 1], k)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize ${(p.transitions[boundaryId(s.id, segs[i + 1].id)] ?? 'none') === k ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>
                  {k === 'crossfade' ? 'crossfade' : k}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {duration <= 0 && <p className="text-xs text-dim">Video metadata still loading…</p>}
    </div>
  );
}

// ─── AI effect ─────────────────────────────────────────────────────────────
export function AiPanel({ p, patch }: { p: Pipeline; patch: Patch }) {
  const [prompt, setPrompt] = useState(p.aiEffect?.prompt ?? '');
  const [lang, setLang] = useState<AiLanguage>(p.aiEffect?.language ?? 'en');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const apply = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true); setErr('');
    try {
      const res = await api.aiEffect(prompt.trim(), lang);
      const pipe = res.pipeline ?? {};
      const filter: FilterId | null = FILTERS.some((f) => f.id === pipe.filter) ? pipe.filter : null;
      const overlays = Array.isArray(pipe.overlays)
        ? pipe.overlays.filter((o: unknown): o is AiEffect['overlays'][number] => KNOWN_OVERLAYS.includes(o as never))
        : [];
      const effect: AiEffect = {
        prompt: prompt.trim(), language: lang, filter,
        colorGrade: typeof pipe.colorGrade === 'string' ? pipe.colorGrade : '',
        overlays,
      };
      patch({ aiEffect: effect });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI effect failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 rounded-2xl border border-vio/40 bg-vio/10 px-3 py-2">
        <IconWand size={16} className="shrink-0 text-vio" />
        <p className="text-xs text-dim">Describe a look — e.g. “cinematic rainy night”. The AI returns a real pipeline (filter + overlays + color grade) applied live.</p>
      </div>
      <TextArea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder="Make my video look like a cinematic rainy night…" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {AI_LANGUAGES.map((l) => (
          <button key={l.id} onClick={() => setLang(l.id)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${lang === l.id ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>{l.label}</button>
        ))}
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <Button onClick={apply} disabled={loading || !prompt.trim()} className="flex items-center justify-center gap-2">
        {loading ? <Spinner size={16} /> : <IconWand size={15} />} Apply AI effect
      </Button>
      {p.aiEffect && (
        <div className="rounded-2xl border border-line bg-panel2 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold">Active effect</p>
            <button onClick={() => patch({ aiEffect: null })} className="flex items-center gap-1 text-xs font-semibold text-danger">
              <IconTrash size={12} /> Remove
            </button>
          </div>
          <p className="mt-1 text-xs text-dim">“{p.aiEffect.prompt}”</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.aiEffect.filter && <Badge tone="vio">filter: {p.aiEffect.filter}</Badge>}
            {p.aiEffect.colorGrade && <Badge tone="cy">color grade</Badge>}
            {p.aiEffect.overlays.map((o) => <Badge key={o} tone="gold">{o}</Badge>)}
            {(!p.aiEffect.filter && !p.aiEffect.colorGrade && p.aiEffect.overlays.length === 0) && (
              <span className="text-[11px] text-dim">No visual changes in this pipeline.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Back chevron helper ───────────────────────────────────────────────────
export function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <button onClick={onBack} className="rounded-full bg-white/5 p-1.5" aria-label="Back to tools">
        <IconChevronLeft size={16} />
      </button>
      <h3 className="text-sm font-bold">{title}</h3>
    </div>
  );
}
