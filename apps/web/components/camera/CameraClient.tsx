'use client';
// SIGMA SNAP — camera home screen (client-only; loaded via next/dynamic with
// ssr:false because the lens SDK touches the DOM at import time).
// Real capture pipeline: getUserMedia → LensEngine (canvas) → photo stills
// or MediaRecorder video → api.uploadFile → editor.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { sounds } from '@/lib/sounds';
import { LensEngine, HeuristicFaceDetector } from '@sigma-snap/lens-sdk';
import { useMergedLenses } from '@/lib/managed-lenses';
import { withPortrait } from './portraitLens';
import LensCarousel from './LensCarousel';
import { BottomSheet, Button, Spinner, Badge } from '@/components/ui';
import {
  IconFlash, IconTorch, IconTimer, IconGrid, IconSwitchCam, IconSettings,
  IconX, IconLock, IconCheck, IconCamera, IconSparkles,
} from '@/lib/icons';
import { PLANS } from '@sigma-snap/shared';
import type { LensDefinition } from '@sigma-snap/shared';

type Mode = 'PHOTO' | 'VIDEO' | 'PORTRAIT' | 'SLOW-MO' | 'TIMELAPSE';
type CamPhase = 'starting' | 'ready' | 'error';
type Facing = 'user' | 'environment';
type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number; kind: 'photo' | 'video' }
  | { phase: 'error'; message: string };

const MODES: Mode[] = ['PHOTO', 'VIDEO', 'PORTRAIT', 'SLOW-MO', 'TIMELAPSE'];
const REC_LIMIT = 60; // seconds
const MIME_CHAIN = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
const RES_PRESETS = [
  { label: '1080p', w: 1920, h: 1080 },
  { label: '720p', w: 1280, h: 720 },
  { label: '480p', w: 854, h: 480 },
];
const FPS_OPTIONS = [24, 30, 60];

interface ExtCaps extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CHAIN.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

function mapCamError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera access was denied. Allow camera access in your browser settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No camera was found on this device.';
  if (name === 'NotReadableError')
    return 'The camera is busy or unavailable. Close other apps using it and try again.';
  if ((err as Error)?.message === 'UNSUPPORTED')
    return 'This browser does not support camera access.';
  return 'Could not start the camera. Please try again.';
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Draw `src` cover-cropped into `dst`. */
function drawCover(dst: CanvasRenderingContext2D, src: HTMLCanvasElement, dw: number, dh: number) {
  const sr = src.width / Math.max(1, src.height);
  const dr = dw / dh;
  let sw: number, sh: number, sx: number, sy: number;
  if (sr > dr) { sh = src.height; sw = sh * dr; sx = (src.width - sw) / 2; sy = 0; }
  else { sw = src.width; sh = sw / dr; sx = 0; sy = (src.height - sh) / 2; }
  dst.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
}

function TopBtn({ active, onClick, label, badge, children }: {
  active?: boolean; onClick: () => void; label: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!!active}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition active:scale-95 ${
        active ? 'bg-vio text-white shadow-glow' : 'bg-black/45 text-white/90 hover:bg-black/60'
      }`}
    >
      {children}
      {badge && (
        <span className="absolute -right-1 -top-1 rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold leading-none text-void">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function CameraClient() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const lenses = useMergedLenses();
  const [camPhase, setCamPhase] = useState<CamPhase>('starting');
  const [camError, setCamError] = useState('');
  const [facing, setFacing] = useState<Facing>('user');
  const [mode, setMode] = useState<Mode>('PHOTO');
  const [lensId, setLensId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [timerSecs, setTimerSecs] = useState<0 | 3 | 10>(0);
  const [grid, setGrid] = useState(false);
  const [guides, setGuides] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [focusRing, setFocusRing] = useState<{ fx: number; fy: number; k: number } | null>(null);
  const [flashBurst, setFlashBurst] = useState(false);
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const [banner, setBanner] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeLens, setUpgradeLens] = useState<LensDefinition | null>(null);
  const [res, setRes] = useState<{ label: string; w: number; h: number } | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [capsMax, setCapsMax] = useState({ w: 1920, h: 1080, fps: 30 });

  // refs (mirrors for async callbacks)
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LensEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const audioRef = useRef<MediaStream | null>(null);
  const tlCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const facingRef = useRef<Facing>('user');
  const modeRef = useRef<Mode>('PHOTO');
  const lensRef = useRef<LensDefinition | null>(null);
  const flashRef = useRef(false);
  const torchRef = useRef(false);
  const torchSupportedRef = useRef(false);
  const zoomRef = useRef(1);
  const zoomRangeRef = useRef<{ min: number; max: number } | null>(null);
  const recordingRef = useRef(false);
  const camPhaseRef = useRef<CamPhase>('starting');
  const uploadRef = useRef<UploadState>({ phase: 'idle' });
  const resRef = useRef<{ label: string; w: number; h: number } | null>(null);
  const fpsRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recMimeRef = useRef('');
  const recStartRef = useRef(0);
  const recTimerRef = useRef(0);
  const tlTimerRef = useRef(0);
  const holdTimerRef = useRef(0);
  const heldRecordingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const focusTimerRef = useRef(0);
  const bannerTimerRef = useRef(0);
  const countdownTimerRef = useRef(0);
  const pointersRef = useRef(new Map<number, { sx: number; sy: number; x: number; y: number; t: number }>());
  const pinchRef = useRef<{ d: number; z: number } | null>(null);
  const pendingUploadRef = useRef<{ kind: 'PHOTO' | 'VIDEO'; file: File } | null>(null);
  const unmountedRef = useRef(false);

  const setUploadState = (u: UploadState) => { uploadRef.current = u; setUpload(u); };

  const showBanner = useCallback((msg: string) => {
    setBanner(msg);
    window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setBanner(null), 3200);
  }, []);

  /** Push the selected lens (wrapped in the portrait pass when in PORTRAIT mode) to the engine. */
  const applyLensToEngine = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const sel = lensRef.current;
    eng.setLens(modeRef.current === 'PORTRAIT' ? withPortrait(sel) : sel);
  }, []);

  // ── camera lifecycle ────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  const applySettings = useCallback(async (track: MediaStreamTrack) => {
    const r = resRef.current;
    const f = fpsRef.current;
    try {
      await track.applyConstraints({
        ...(r ? { width: { ideal: r.w }, height: { ideal: r.h } } : {}),
        ...(f ? { frameRate: { ideal: f } } : {}),
      });
    } catch { /* keep device defaults */ }
  }, []);

  const startCamera = useCallback(async (facingMode: Facing) => {
    camPhaseRef.current = 'starting';
    setCamPhase('starting');
    setCamError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('UNSUPPORTED');
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (unmountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error('Preview not ready');
      video.srcObject = stream;
      video.muted = true;
      await video.play().catch(() => undefined);
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No video track');
      trackRef.current = track;
      const caps = track.getCapabilities() as ExtCaps;
      torchSupportedRef.current = !!caps.torch;
      zoomRangeRef.current = caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max } : null;
      setTorchSupported(!!caps.torch);
      setZoomCap(zoomRangeRef.current);
      setCapsMax({
        w: caps.width?.max ?? 1920,
        h: caps.height?.max ?? 1080,
        fps: caps.frameRate?.max ?? 30,
      });
      // Size the engine canvas to the sensor frame; the SDK cover-fits into it.
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      if (!engineRef.current) {
        const eng = new LensEngine(canvas);
        eng.setDetector(new HeuristicFaceDetector());
        engineRef.current = eng;
      }
      const eng = engineRef.current;
      eng.setMirrored(facingMode === 'user');
      eng.setLens(modeRef.current === 'PORTRAIT' ? withPortrait(lensRef.current) : lensRef.current);
      eng.start(video);
      await applySettings(track);
      camPhaseRef.current = 'ready';
      setCamPhase('ready');
    } catch (err) {
      camPhaseRef.current = 'error';
      setCamPhase('error');
      setCamError(mapCamError(err));
      sounds.error();
    }
  }, [applySettings, stopStream]);

  // auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  // start camera once signed in; full cleanup on unmount
  useEffect(() => {
    if (authLoading || !user) return;
    unmountedRef.current = false;
    void startCamera(facingRef.current);
    return () => {
      unmountedRef.current = true;
      window.clearInterval(recTimerRef.current);
      window.clearInterval(tlTimerRef.current);
      window.clearTimeout(holdTimerRef.current);
      window.clearTimeout(focusTimerRef.current);
      window.clearTimeout(bannerTimerRef.current);
      window.clearInterval(countdownTimerRef.current);
      try { if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop(); } catch { /* noop */ }
      engineRef.current?.stop();
      audioRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [authLoading, user, startCamera]);

  // pause the render loop when the tab is hidden; keep the stream alive
  useEffect(() => {
    const onVis = () => {
      const eng = engineRef.current;
      const video = videoRef.current;
      if (!eng || !video) return;
      if (document.hidden) eng.stop();
      else if (camPhaseRef.current === 'ready' && streamRef.current) {
        video.play().catch(() => undefined);
        eng.start(video);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ── controls ────────────────────────────────────────────────────────
  const switchCamera = useCallback(() => {
    if (recordingRef.current) return;
    const next: Facing = facingRef.current === 'user' ? 'environment' : 'user';
    facingRef.current = next;
    setFacing(next);
    torchRef.current = false;
    setTorch(false);
    zoomRef.current = 1;
    setZoom(1);
    sounds.whoosh();
    void startCamera(next);
  }, [startCamera]);

  const changeMode = useCallback((m: Mode) => {
    if (m === modeRef.current) return;
    if (recordingRef.current) return;
    modeRef.current = m;
    setMode(m);
    applyLensToEngine();
    sounds.tap();
  }, [applyLensToEngine]);

  const selectLens = useCallback((l: LensDefinition | null) => {
    lensRef.current = l;
    setLensId(l?.id ?? null);
    applyLensToEngine();
    sounds.whoosh();
  }, [applyLensToEngine]);

  const applyZoom = useCallback((z: number) => {
    const track = trackRef.current;
    const zr = zoomRangeRef.current;
    if (track && zr) {
      const c = Math.min(zr.max, Math.max(zr.min, z));
      track.applyConstraints({ advanced: [{ zoom: c } as unknown as MediaTrackConstraintSet] }).catch(() => undefined);
      zoomRef.current = c;
      setZoom(c);
    } else {
      const c = Math.min(4, Math.max(1, z));
      zoomRef.current = c;
      setZoom(c);
    }
  }, []);

  const cycleZoom = useCallback(() => {
    const steps = [1, 2, 4];
    const cur = zoomRef.current;
    const next = steps.find((s) => s > cur + 0.05) ?? 1;
    applyZoom(next);
    sounds.tap();
  }, [applyZoom]);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track || facingRef.current !== 'environment' || !torchSupportedRef.current) {
      showBanner('Torch needs the rear camera.');
      return;
    }
    const next = !torchRef.current;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      torchRef.current = next;
      setTorch(next);
      sounds.tap();
    } catch {
      showBanner('Torch is not available on this camera.');
    }
  }, [showBanner]);

  const cycleTimer = useCallback(() => {
    setTimerSecs((t) => (t === 0 ? 3 : t === 3 ? 10 : 0));
    sounds.tap();
  }, []);

  const focusAt = useCallback(async (fx: number, fy: number) => {
    setFocusRing({ fx, fy, k: Date.now() });
    window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => setFocusRing(null), 1100);
    sounds.focus();
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' } as unknown as MediaTrackConstraintSet] });
    } catch { /* not supported — ring still shows */ }
  }, []);

  // preview gestures: tap-to-focus + pinch-to-zoom
  const onPreviewDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, t: Date.now() });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoomRef.current };
    }
  };
  const onPreviewMove = (e: React.PointerEvent) => {
    const p = pointersRef.current.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (pointersRef.current.size === 2 && pinchRef.current && pinchRef.current.d > 0) {
      const [a, b] = [...pointersRef.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      applyZoom(pinchRef.current.z * (d / pinchRef.current.d));
    }
  };
  const onPreviewUp = (e: React.PointerEvent) => {
    const p = pointersRef.current.get(e.pointerId);
    const wasSingle = pointersRef.current.size === 1;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (wasSingle && p) {
      const dt = Date.now() - p.t;
      const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
      if (dt < 350 && moved < 14) {
        const rect = previewWrapRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0) void focusAt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      }
    }
  };

  // ── uploads ─────────────────────────────────────────────────────────
  const uploadPhoto = useCallback(async (file: File) => {
    pendingUploadRef.current = { kind: 'PHOTO', file };
    setUploadState({ phase: 'uploading', progress: 0, kind: 'photo' });
    try {
      const asset = await api.uploadFile('PHOTO', file, (p) =>
        setUploadState({ phase: 'uploading', progress: p, kind: 'photo' }),
      );
      router.push(`/editor?assetId=${asset.id}&kind=photo`);
    } catch (e) {
      setUploadState({
        phase: 'error',
        message: e instanceof ApiException ? e.message : 'Upload failed. Check your connection and retry.',
      });
      sounds.error();
    }
  }, [router]);

  const uploadVideo = useCallback(async (file: File) => {
    pendingUploadRef.current = { kind: 'VIDEO', file };
    setUploadState({ phase: 'uploading', progress: 0, kind: 'video' });
    try {
      const asset = await api.uploadFile('VIDEO', file, (p) =>
        setUploadState({ phase: 'uploading', progress: p, kind: 'video' }),
      );
      const extra = modeRef.current === 'SLOW-MO' ? '&playbackRate=0.5' : '';
      router.push(`/editor?assetId=${asset.id}&kind=video${extra}`);
    } catch (e) {
      setUploadState({
        phase: 'error',
        message: e instanceof ApiException ? e.message : 'Upload failed. Check your connection and retry.',
      });
      sounds.error();
    }
  }, [router]);

  const retryUpload = useCallback(() => {
    const p = pendingUploadRef.current;
    if (!p) { setUploadState({ phase: 'idle' }); return; }
    if (p.kind === 'PHOTO') void uploadPhoto(p.file);
    else void uploadVideo(p.file);
  }, [uploadPhoto, uploadVideo]);

  // ── photo capture ───────────────────────────────────────────────────
  const fireFlashBurst = useCallback(async () => {
    setFlashBurst(true);
    window.setTimeout(() => setFlashBurst(false), 220);
    const track = trackRef.current;
    if (!track || !torchSupportedRef.current) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: true } as unknown as MediaTrackConstraintSet] });
      window.setTimeout(() => {
        if (!torchRef.current) {
          track.applyConstraints({ advanced: [{ torch: false } as unknown as MediaTrackConstraintSet] }).catch(() => undefined);
        }
      }, 300);
    } catch { /* torch burst unsupported */ }
  }, []);

  const captureNow = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || camPhaseRef.current !== 'ready' || uploadRef.current.phase !== 'idle') return;
    try {
      if (flashRef.current) await fireFlashBurst();
      sounds.shutter();
      const shot = eng.capturePhoto();
      if (!shot) throw new Error('capture failed');
      const blob = await new Promise<Blob | null>((res) => shot.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('capture failed');
      const file = new File([blob], `sigma-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadPhoto(file);
    } catch {
      showBanner('Could not capture the photo.');
      sounds.error();
    }
  }, [fireFlashBurst, showBanner, uploadPhoto]);

  const takePhoto = useCallback(() => {
    if (countdown !== null || camPhaseRef.current !== 'ready' || uploadRef.current.phase !== 'idle') return;
    if (timerSecs === 0) { void captureNow(); return; }
    let n = timerSecs;
    setCountdown(n);
    sounds.tap();
    window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(countdownTimerRef.current);
        setCountdown(null);
        void captureNow();
      } else {
        setCountdown(n);
        sounds.tap();
      }
    }, 1000);
  }, [captureNow, countdown, timerSecs]);

  // ── video recording ─────────────────────────────────────────────────
  const finalizeVideo = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: recMimeRef.current || 'video/webm' });
    chunksRef.current = [];
    recorderRef.current?.stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    recorderRef.current = null;
    audioRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    audioRef.current = null;
    if (blob.size === 0) { showBanner('Recording was empty.'); return; }
    const ext = (recMimeRef.current || '').includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `sigma-${Date.now()}.${ext}`, { type: blob.type || 'video/webm' });
    await uploadVideo(file);
  }, [showBanner, uploadVideo]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    window.clearInterval(recTimerRef.current);
    window.clearInterval(tlTimerRef.current);
    recordingRef.current = false;
    setRecording(false);
    sounds.recStop();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop(); // onstop → finalizeVideo
    } else {
      await finalizeVideo();
    }
  }, [finalizeVideo]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current || camPhaseRef.current !== 'ready' || uploadRef.current.phase !== 'idle') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mode = modeRef.current;
    try {
      let srcCanvas = canvas;
      if (mode === 'TIMELAPSE') {
        if (!tlCanvasRef.current) {
          tlCanvasRef.current = document.createElement('canvas');
          tlCanvasRef.current.width = 1280;
          tlCanvasRef.current.height = 720;
        }
        const tl = tlCanvasRef.current;
        const tctx = tl.getContext('2d');
        if (tctx) {
          drawCover(tctx, canvas, tl.width, tl.height);
          window.clearInterval(tlTimerRef.current);
          tlTimerRef.current = window.setInterval(() => {
            const c2 = tl.getContext('2d');
            if (c2) drawCover(c2, canvas, tl.width, tl.height);
          }, 2000);
        }
        srcCanvas = tl;
      }
      const vStream = srcCanvas.captureStream(30);
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      audioRef.current = audio;
      const stream = new MediaStream([...vStream.getVideoTracks(), ...(audio ? audio.getAudioTracks() : [])]);
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
      recMimeRef.current = rec.mimeType || mime;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => { void finalizeVideo(); };
      rec.start(250);
      recorderRef.current = rec;
      recordingRef.current = true;
      setRecording(true);
      setRecSecs(0);
      recStartRef.current = Date.now();
      sounds.recStart();
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - recStartRef.current) / 1000);
        setRecSecs(s);
        if (s >= REC_LIMIT) void stopRecording();
      }, 500);
    } catch {
      window.clearInterval(tlTimerRef.current);
      showBanner('Could not start recording.');
      sounds.error();
    }
  }, [finalizeVideo, showBanner, stopRecording]);

  // shutter: tap = capture / toggle rec; hold = record while held (video modes)
  const onShutterDown = (e: React.PointerEvent) => {
    const isPhoto = modeRef.current === 'PHOTO' || modeRef.current === 'PORTRAIT';
    if (isPhoto) return;
    e.preventDefault();
    suppressClickRef.current = false;
    heldRecordingRef.current = false;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      heldRecordingRef.current = true;
      void startRecording();
    }, 450);
  };
  const onShutterUp = () => {
    window.clearTimeout(holdTimerRef.current);
    if (heldRecordingRef.current) {
      heldRecordingRef.current = false;
      suppressClickRef.current = true;
      void stopRecording();
    }
  };
  const onShutterClick = () => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    const isPhoto = modeRef.current === 'PHOTO' || modeRef.current === 'PORTRAIT';
    if (isPhoto) { takePhoto(); return; }
    if (recordingRef.current) void stopRecording();
    else void startRecording();
  };

  // keep flash ref in sync
  useEffect(() => { flashRef.current = flash; }, [flash]);

  // settings sheet actions
  const chooseRes = useCallback(async (p: { label: string; w: number; h: number } | null) => {
    resRef.current = p;
    setRes(p);
    const track = trackRef.current;
    if (track) {
      try {
        await track.applyConstraints(
          p ? { width: { ideal: p.w }, height: { ideal: p.h } } : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        );
      } catch { /* keep current */ }
    }
    sounds.tap();
  }, []);
  const chooseFps = useCallback(async (f: number | null) => {
    fpsRef.current = f;
    setFps(f);
    const track = trackRef.current;
    if (track) {
      try {
        await track.applyConstraints(f ? { frameRate: { ideal: f } } : { frameRate: { ideal: 30 } });
      } catch { /* keep current */ }
    }
    sounds.tap();
  }, []);

  const isPhotoMode = mode === 'PHOTO' || mode === 'PORTRAIT';
  const digitalZoom = zoomCap ? 1 : zoom;

  if (authLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black">
        <Spinner size={30} />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="relative h-dvh w-full select-none overflow-hidden bg-black">
      <style>{`
        @keyframes focusring { 0% { transform: translate(-50%,-50%) scale(1.5); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(-50%,-50%) scale(0.8); opacity: 0; } }
        @keyframes countpop { 0% { transform: scale(1.6); opacity: 0; } 25% { opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      {/* preview */}
      <div
        ref={previewWrapRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPreviewDown}
        onPointerMove={onPreviewMove}
        onPointerUp={onPreviewUp}
        onPointerCancel={onPreviewUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <video ref={videoRef} playsInline muted className="hidden" />
        <canvas
          ref={canvasRef}
          className="media-cover"
          style={digitalZoom > 1 ? { transform: `scale(${digitalZoom})` } : undefined}
        />

        {grid && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/15" />
            ))}
          </div>
        )}
        {guides && (
          <div className="pointer-events-none absolute inset-[7%] rounded-2xl border-2 border-dashed border-cy/60">
            <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute left-1/2 top-0 h-full w-px bg-cy/60" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-cy/60" />
            </div>
          </div>
        )}
        {focusRing && (
          <div
            key={focusRing.k}
            className="pointer-events-none absolute z-10"
            style={{ left: `${focusRing.fx * 100}%`, top: `${focusRing.fy * 100}%` }}
          >
            <div className="h-16 w-16 animate-[focusring_1.1s_ease-out_forwards] rounded-xl border-2 border-gold" />
          </div>
        )}
        {flashBurst && <div className="pointer-events-none absolute inset-0 z-20 bg-white" />}
        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <span key={countdown} className="animate-[countpop_0.9s_ease-out] text-8xl font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* top bar */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
      >
        <div className="flex gap-2">
          <TopBtn active={flash} onClick={() => { setFlash((f) => !f); sounds.tap(); }} label="Flash">
            <IconFlash size={19} />
          </TopBtn>
          <TopBtn onClick={cycleTimer} label="Self timer" badge={timerSecs > 0 ? `${timerSecs}s` : undefined}>
            <IconTimer size={19} />
          </TopBtn>
          <TopBtn active={grid} onClick={() => { setGrid((g) => !g); sounds.tap(); }} label="Grid">
            <IconGrid size={19} />
          </TopBtn>
        </div>
        <div className="flex gap-2">
          <TopBtn active={guides} onClick={() => { setGuides((g) => !g); sounds.tap(); }} label="Safe-area guides">
            <IconCamera size={19} />
          </TopBtn>
          <TopBtn active={torch} onClick={() => void toggleTorch()} label="Torch">
            <IconTorch size={19} />
          </TopBtn>
          <TopBtn onClick={switchCamera} label="Switch camera">
            <IconSwitchCam size={19} />
          </TopBtn>
          <TopBtn onClick={() => { setSettingsOpen(true); sounds.tap(); }} label="Camera settings">
            <IconSettings size={19} />
          </TopBtn>
        </div>
      </div>

      {/* recording indicator */}
      {recording && (
        <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-4 py-2 backdrop-blur">
          <span className="rec-dot h-2.5 w-2.5 rounded-full bg-danger" />
          <span className="text-sm font-bold tabular-nums text-white">{fmtTime(recSecs)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
            {mode === 'TIMELAPSE' ? 'Timelapse' : mode === 'SLOW-MO' ? 'Slow-mo' : 'Rec'}
          </span>
        </div>
      )}

      {/* transient banner */}
      {banner && (
        <div className="absolute left-1/2 top-28 z-10 -translate-x-1/2 animate-fade-up">
          <p className="whitespace-nowrap rounded-full bg-danger/90 px-4 py-2 text-xs font-semibold text-white shadow-card">
            {banner}
          </p>
        </div>
      )}

      {/* bottom controls */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5"
        style={{ paddingBottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      >
        <div className="no-scrollbar flex items-center justify-center gap-6 overflow-x-auto px-6">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => changeMode(m)}
              className={`flex shrink-0 flex-col items-center gap-1 text-[11px] font-bold tracking-widest transition ${
                mode === m ? 'text-gold' : 'text-white/55 hover:text-white/85'
              }`}
            >
              {m}
              <span className={`h-1 w-1 rounded-full ${mode === m ? 'bg-gold' : 'bg-transparent'}`} />
            </button>
          ))}
        </div>

        <LensCarousel
          lenses={lenses}
          activeId={lensId}
          onSelect={selectLens}
          onPremium={(l) => { setUpgradeLens(l); sounds.tap(); }}
        />

        <div className="flex items-center justify-between px-8">
          <button
            onClick={cycleZoom}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-xs font-bold text-white backdrop-blur transition active:scale-95"
            aria-label="Zoom"
          >
            {zoom.toFixed(1)}x
          </button>

          <button
            onPointerDown={onShutterDown}
            onPointerUp={onShutterUp}
            onPointerLeave={onShutterUp}
            onPointerCancel={onShutterUp}
            onClick={onShutterClick}
            onContextMenu={(e) => e.preventDefault()}
            disabled={camPhase !== 'ready' || upload.phase === 'uploading'}
            aria-label={isPhotoMode ? 'Take photo' : recording ? 'Stop recording' : 'Record video'}
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white/90 bg-black/20 backdrop-blur transition active:scale-95 disabled:opacity-40"
          >
            <span
              className={`block transition-all ${
                isPhotoMode
                  ? 'h-14 w-14 rounded-full bg-white'
                  : recording
                    ? 'rec-dot h-12 w-12 rounded-full bg-danger'
                    : 'h-14 w-14 rounded-full bg-danger'
              }`}
            />
          </button>

          <div className="flex h-11 w-11 items-center justify-center">
            {lensId ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-vio/80 text-white" title="Lens active">
                <IconSparkles size={16} />
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                {mode === 'TIMELAPSE' ? '2s' : mode === 'SLOW-MO' ? '½×' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* camera starting / error */}
      {camPhase === 'starting' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black">
          <Spinner size={34} />
          <p className="text-sm text-dim">Starting camera…</p>
        </div>
      )}
      {camPhase === 'error' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-void px-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-panel2 text-dim">
            <IconCamera size={30} />
          </span>
          <p className="font-bold text-ink">Camera unavailable</p>
          <p className="max-w-xs text-sm text-dim">{camError}</p>
          <Button onClick={() => void startCamera(facingRef.current)}>Try again</Button>
        </div>
      )}

      {/* upload overlay */}
      {upload.phase !== 'idle' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 px-10 backdrop-blur-sm">
          {upload.phase === 'uploading' ? (
            <>
              <Spinner size={34} />
              <p className="text-sm font-semibold text-ink">Uploading {upload.kind}…</p>
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-vio to-cy transition-all duration-200"
                  style={{ width: `${Math.round(upload.progress * 100)}%` }}
                />
              </div>
              <p className="text-xs tabular-nums text-dim">{Math.round(upload.progress * 100)}%</p>
            </>
          ) : (
            <>
              <p className="font-bold text-danger">Upload failed</p>
              <p className="max-w-xs text-center text-sm text-dim">{upload.message}</p>
              <div className="flex gap-3">
                <Button onClick={retryUpload}>Retry</Button>
                <Button variant="ghost" onClick={() => setUploadState({ phase: 'idle' })}>Discard</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* settings sheet */}
      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Camera settings">
        <div className="flex flex-col gap-6 pb-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-dim">Resolution</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => void chooseRes(null)}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition ${res === null ? 'bg-vio/15 text-ink' : 'bg-panel2 text-dim hover:text-ink'}`}
              >
                Auto {res === null && <IconCheck size={16} className="text-vio" />}
              </button>
              {RES_PRESETS.filter((p) => p.w <= capsMax.w && p.h <= capsMax.h).map((p) => (
                <button
                  key={p.label}
                  onClick={() => void chooseRes(p)}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition ${res?.label === p.label ? 'bg-vio/15 text-ink' : 'bg-panel2 text-dim hover:text-ink'}`}
                >
                  {p.label} ({p.w}×{p.h})
                  {res?.label === p.label && <IconCheck size={16} className="text-vio" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-dim">Frame rate</p>
            <div className="flex gap-2">
              <button
                onClick={() => void chooseFps(null)}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${fps === null ? 'bg-vio/15 text-ink' : 'bg-panel2 text-dim hover:text-ink'}`}
              >
                Auto
              </button>
              {FPS_OPTIONS.filter((f) => f <= capsMax.fps).map((f) => (
                <button
                  key={f}
                  onClick={() => void chooseFps(f)}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${fps === f ? 'bg-vio/15 text-ink' : 'bg-panel2 text-dim hover:text-ink'}`}
                >
                  {f} fps
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-panel2 px-4 py-3">
            <span className="text-sm text-dim">Torch supported</span>
            <Badge tone={torchSupported ? 'cy' : 'danger'}>{torchSupported ? 'Yes' : 'No'}</Badge>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-panel2 px-4 py-3">
            <span className="text-sm text-dim">Optical zoom</span>
            <Badge tone={zoomCap ? 'cy' : 'danger'}>
              {zoomCap ? `${zoomCap.min.toFixed(1)}–${zoomCap.max.toFixed(1)}x` : 'No'}
            </Badge>
          </div>
        </div>
      </BottomSheet>

      {/* premium lens upgrade sheet */}
      <BottomSheet open={upgradeLens !== null} onClose={() => setUpgradeLens(null)} title="Premium lens">
        {upgradeLens && (
          <div className="flex flex-col items-center gap-4 pb-2 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold">
              <IconLock size={24} />
            </span>
            <div>
              <p className="font-bold text-ink">{upgradeLens.name}</p>
              <p className="mt-1 text-sm text-dim">{upgradeLens.description}</p>
            </div>
            <div className="w-full rounded-2xl bg-panel2 p-4 text-left">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gold">Sigma Pro</p>
              <ul className="flex flex-col gap-1.5 text-sm text-dim">
                {PLANS.PRO.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <IconCheck size={14} className="shrink-0 text-cy" /> {perk}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="ghost" onClick={() => setUpgradeLens(null)} className="flex items-center gap-2">
              <IconX size={15} /> Maybe later
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
