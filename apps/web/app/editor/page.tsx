// /editor — photo & video editor route.
// ?assetId=…&kind=photo|video → loads the asset, guards auth, hosts the editor.
'use client';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button, EmptyState, LoadingScreen, Spinner } from '@/components/ui';
import {
  IconCheck, IconChevronLeft, IconCrop, IconFilter, IconMic, IconMusic, IconPen,
  IconRefresh, IconScissors, IconSmile, IconSparkles, IconSpeaker, IconTemplate,
  IconText, IconWand, IconX, IconZap,
} from '@/lib/icons';
import PhotoEditor, { type EditorHandle } from '@/components/editor/PhotoEditor';
import VideoEditor, { type VideoEditorHandle } from '@/components/editor/VideoEditor';
import DestinationSheet from '@/components/editor/DestinationSheet';
import {
  AdjustPanel, AiPanel, DrawPanel, FiltersPanel, MusicPanel, MusicPickerSheet,
  PanelHeader, SegmentsPanel, SpeedPanel, StickerPanel, TextPanel, TransformPanel,
  TrimPanel, VoicePanel, VolumePanel, type Patch,
} from '@/components/editor/panels';
import { defaultPipeline, uid } from '@/components/editor/types';
import type { CropRect, DrawTool, MusicTrack, Pipeline } from '@/components/editor/types';
import type { MediaAsset } from '@sigma-snap/shared';

type PhotoTool = 'filters' | 'adjust' | 'transform' | 'text' | 'stickers' | 'draw' | 'music' | 'ai';
type VideoTool = PhotoTool | 'trim' | 'segments' | 'speed' | 'reverse' | 'voice' | 'volume';

const PHOTO_TOOLS: Array<{ id: PhotoTool; label: string; icon: React.ReactNode }> = [
  { id: 'filters', label: 'Filters', icon: <IconFilter size={20} /> },
  { id: 'adjust', label: 'Adjust', icon: <IconSparkles size={20} /> },
  { id: 'transform', label: 'Crop', icon: <IconCrop size={20} /> },
  { id: 'text', label: 'Text', icon: <IconText size={20} /> },
  { id: 'stickers', label: 'Stickers', icon: <IconSmile size={20} /> },
  { id: 'draw', label: 'Draw', icon: <IconPen size={20} /> },
  { id: 'music', label: 'Music', icon: <IconMusic size={20} /> },
  { id: 'ai', label: 'AI FX', icon: <IconWand size={20} /> },
];
const VIDEO_TOOLS: Array<{ id: VideoTool; label: string; icon: React.ReactNode }> = [
  ...(PHOTO_TOOLS as Array<{ id: VideoTool; label: string; icon: React.ReactNode }>),
  { id: 'trim', label: 'Trim', icon: <IconScissors size={20} /> },
  { id: 'segments', label: 'Split', icon: <IconTemplate size={20} /> },
  { id: 'speed', label: 'Speed', icon: <IconZap size={20} /> },
  { id: 'reverse', label: 'Reverse', icon: <IconRefresh size={20} /> },
  { id: 'voice', label: 'Voice', icon: <IconMic size={20} /> },
  { id: 'volume', label: 'Volume', icon: <IconSpeaker size={20} /> },
];

const TOOL_TITLES: Record<string, string> = {
  filters: 'Filters', adjust: 'Adjust', transform: 'Crop & rotate', text: 'Text',
  stickers: 'Stickers', draw: 'Draw', music: 'Music', ai: 'AI effect',
  trim: 'Trim', segments: 'Segments', speed: 'Speed', reverse: 'Reverse',
  voice: 'Voiceover', volume: 'Volume',
};

export default function EditorRoute() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);
  if (loading || !user) return <LoadingScreen label="Opening editor…" />;
  return (
    <Suspense fallback={<LoadingScreen label="Opening editor…" />}>
      <EditorInner />
    </Suspense>
  );
}

function EditorInner() {
  const params = useSearchParams();
  const router = useRouter();
  const assetId = params.get('assetId');
  const kindParam = params.get('kind');
  const kind: 'photo' | 'video' | null = kindParam === 'photo' ? 'photo' : kindParam === 'video' ? 'video' : null;
  const isVideo = kind === 'video';

  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [assetErr, setAssetErr] = useState('');
  const [assetLoading, setAssetLoading] = useState(true);

  const [pipeline, setPipeline] = useState<Pipeline>(() => defaultPipeline());
  const patch: Patch = useCallback((part) => setPipeline((prev) => ({ ...prev, ...part })), []);

  const [tool, setTool] = useState<string>('filters');
  const [cropMode, setCropMode] = useState(false);
  const [aspect, setAspect] = useState(0);
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [selTextId, setSelTextId] = useState<string | null>(null);
  const [selStickerId, setSelStickerId] = useState<string | null>(null);
  const [sourceEl, setSourceEl] = useState<{ el: HTMLImageElement | HTMLVideoElement; w: number; h: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [musicOpen, setMusicOpen] = useState(false);

  const [exporting, setExporting] = useState<{ progress: number } | null>(null);
  const [exportErr, setExportErr] = useState('');
  const [exportedAsset, setExportedAsset] = useState<MediaAsset | null>(null);
  const [destOpen, setDestOpen] = useState(false);

  const editorRef = useRef<EditorHandle | VideoEditorHandle | null>(null);

  // ── load asset ──
  useEffect(() => {
    if (!assetId || !kind) { setAssetLoading(false); return; }
    let cancelled = false;
    setAssetLoading(true);
    setAssetErr('');
    api.getAsset(assetId)
      .then((a) => {
        if (cancelled) return;
        const want = kind === 'photo' ? 'PHOTO' : 'VIDEO';
        if (a.kind !== want) {
          setAssetErr(`This asset is a ${a.kind.toLowerCase()}, not a ${kind}.`);
        } else if (!a.url) {
          setAssetErr('This asset has no playable URL.');
        } else {
          setAsset(a);
        }
      })
      .catch((e) => { if (!cancelled) setAssetErr(e instanceof Error ? e.message : 'Could not load asset'); })
      .finally(() => { if (!cancelled) setAssetLoading(false); });
    return () => { cancelled = true; };
  }, [assetId, kind]);

  const onDuration = useCallback((d: number) => {
    setDuration(d);
    setPipeline((prev) =>
      prev.trimOut === 0 && d > 0
        ? { ...prev, trimIn: 0, trimOut: d, segments: [{ id: uid(), start: 0, end: d }] }
        : prev,
    );
  }, []);

  const onTime = useCallback((t: number) => setCurrentTime(t), []);
  const onSourceReady = useCallback((el: HTMLImageElement | HTMLVideoElement, w: number, h: number) => {
    setSourceEl({ el, w, h });
  }, []);

  const onCropChange = useCallback((c: CropRect) => {
    setPipeline((prev) => ({ ...prev, transform: { ...prev.transform, crop: c } }));
  }, []);

  const onPickMusic = useCallback((m: MusicTrack) => {
    setPipeline((prev) => ({ ...prev, music: m }));
  }, []);

  // ── export ──
  const doExport = async () => {
    const h = editorRef.current;
    if (!h || exporting) return;
    setExportErr('');
    setExporting({ progress: 0 });
    // warm up the audio engine inside the user gesture
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      if (ac.state === 'suspended') await ac.resume();
      await ac.close();
    } catch { /* export will surface audio issues honestly */ }
    try {
      const out = await h.exportAndUpload((p) => setExporting({ progress: p }));
      setExportedAsset(out);
      setDestOpen(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setExportErr('Export cancelled.');
      } else {
        setExportErr(e instanceof Error ? e.message : 'Export failed');
      }
    } finally {
      setExporting(null);
    }
  };

  const cancelExport = () => {
    (editorRef.current as VideoEditorHandle | null)?.cancelExport?.();
  };

  // ── invalid entry ──
  if (!assetId || !kind) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          title="Nothing to edit"
          hint="Open the editor from the camera right after capturing a photo or video."
          action={<Link href="/camera"><Button>Open camera</Button></Link>}
        />
      </div>
    );
  }

  const tools = isVideo ? VIDEO_TOOLS : PHOTO_TOOLS;

  return (
    <div className="px-4 pb-4 pt-4">
      {/* top bar */}
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => router.back()} className="rounded-full bg-white/5 p-2.5" aria-label="Back">
          <IconChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold">Editor</h1>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isVideo ? 'bg-cy/15 text-cy' : 'bg-vio/15 text-vio'}`}>
            {isVideo ? 'VIDEO' : 'PHOTO'}
          </span>
        </div>
        <Button onClick={doExport} disabled={exporting !== null || assetLoading || !!assetErr || !asset}
          className="!px-4 !py-2 text-xs flex items-center gap-1.5">
          {exporting ? <Spinner size={14} /> : <IconCheck size={14} />} Export
        </Button>
      </div>

      {assetLoading && <LoadingScreen label="Loading media…" />}
      {!assetLoading && assetErr && (
        <EmptyState title="Can't open this in the editor" hint={assetErr}
          action={<Link href="/camera"><Button>Open camera</Button></Link>} />
      )}
      {!assetLoading && !assetErr && asset && (
        <>
          {isVideo ? (
            <VideoEditor
              ref={editorRef as React.Ref<VideoEditorHandle>}
              assetUrl={asset.url}
              pipeline={pipeline} patch={patch}
              activeTool={tool} cropMode={cropMode} aspect={aspect} onAspectCrop={onCropChange}
              drawTool={drawTool}
              selTextId={selTextId} setSelTextId={setSelTextId}
              selStickerId={selStickerId} setSelStickerId={setSelStickerId}
              onSourceReady={onSourceReady} onDuration={onDuration} onTime={onTime}
            />
          ) : (
            <PhotoEditor
              ref={editorRef as React.Ref<EditorHandle>}
              assetUrl={asset.url}
              pipeline={pipeline} patch={patch}
              activeTool={tool} cropMode={cropMode} aspect={aspect} onAspectCrop={onCropChange}
              drawTool={drawTool}
              selTextId={selTextId} setSelTextId={setSelTextId}
              selStickerId={selStickerId} setSelStickerId={setSelStickerId}
              onSourceReady={onSourceReady}
            />
          )}

          {exportErr && (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-danger/40 bg-danger/10 px-3 py-2">
              <p className="text-xs text-danger">{exportErr}</p>
              <button onClick={() => setExportErr('')} aria-label="Dismiss"><IconX size={14} className="text-danger" /></button>
            </div>
          )}

          {/* tool rail */}
          <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
            {tools.map((t) => (
              <button key={t.id} onClick={() => { setTool(t.id); setCropMode(t.id === 'transform' ? cropMode : false); }}
                className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl py-2.5 transition ${tool === t.id ? 'bg-vio/15 text-vio' : 'text-dim hover:text-ink'}`}>
                {t.icon}
                <span className="text-[10px] font-semibold">{t.label}</span>
              </button>
            ))}
          </div>

          {/* panel */}
          <div className="mt-2 rounded-3xl border border-line bg-panel p-4">
            {tool !== 'reverse' && <PanelHeader title={TOOL_TITLES[tool] ?? tool} onBack={() => setTool(isVideo ? 'trim' : 'filters')} />}
            {tool === 'filters' && <FiltersPanel p={pipeline} patch={patch} source={sourceEl} />}
            {tool === 'adjust' && <AdjustPanel p={pipeline} patch={patch} />}
            {tool === 'transform' && (
              <TransformPanel p={pipeline} patch={patch} cropMode={cropMode} setCropMode={setCropMode} aspect={aspect} setAspect={setAspect} />
            )}
            {tool === 'text' && <TextPanel p={pipeline} patch={patch} isVideo={isVideo} duration={duration} selId={selTextId} setSelId={setSelTextId} />}
            {tool === 'stickers' && <StickerPanel p={pipeline} patch={patch} />}
            {tool === 'draw' && <DrawPanel p={pipeline} patch={patch} tool={drawTool} setTool={setDrawTool} />}
            {tool === 'music' && <MusicPanel p={pipeline} patch={patch} openPicker={() => setMusicOpen(true)} />}
            {tool === 'ai' && <AiPanel p={pipeline} patch={patch} />}
            {isVideo && tool === 'trim' && <TrimPanel p={pipeline} patch={patch} duration={duration} />}
            {isVideo && tool === 'segments' && (
              <SegmentsPanel p={pipeline} patch={patch} duration={duration}
                onSplit={() => (editorRef.current as VideoEditorHandle | null)?.splitAtPlayhead()} />
            )}
            {isVideo && tool === 'speed' && <SpeedPanel p={pipeline} patch={patch} />}
            {isVideo && tool === 'reverse' && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="rounded-2xl bg-white/5 p-4"><IconRefresh size={26} className="text-dim" /></div>
                <p className="text-sm font-bold">Reverse isn’t supported for this clip</p>
                <p className="max-w-xs text-xs text-dim">
                  True reverse needs every frame decoded and re-encoded in opposite order, which this editor doesn’t do.
                  Your video is unchanged — nothing was faked.
                </p>
                <Button variant="ghost" onClick={() => setTool('trim')}>Back to tools</Button>
              </div>
            )}
            {isVideo && tool === 'voice' && <VoicePanel p={pipeline} patch={patch} currentTime={currentTime} />}
            {isVideo && tool === 'volume' && <VolumePanel p={pipeline} patch={patch} />}
          </div>
        </>
      )}

      {/* music picker */}
      <MusicPickerSheet open={musicOpen} onClose={() => setMusicOpen(false)} onPick={onPickMusic} />

      {/* destination */}
      {exportedAsset && (
        <DestinationSheet
          open={destOpen}
          onClose={() => setDestOpen(false)}
          asset={exportedAsset}
          kind={isVideo ? 'VIDEO' : 'PHOTO'}
          musicId={pipeline.music?.soundId ?? null}
        />
      )}

      {/* export progress overlay */}
      {exporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl border border-line bg-panel p-6 text-center">
            <Spinner size={28} />
            <p className="mt-3 text-sm font-bold">Exporting… {Math.round(exporting.progress * 100)}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-vio to-cy transition-all"
                style={{ width: `${exporting.progress * 100}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-dim">
              {isVideo ? 'Keep this tab open while frames are recorded.' : 'Rendering your photo…'}
            </p>
            {isVideo && (
              <Button variant="ghost" className="mt-4 !py-2 text-xs" onClick={cancelExport}>Cancel export</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
