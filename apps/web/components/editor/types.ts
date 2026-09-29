// Shared types for the SIGMA SNAP photo/video editor.
import type { AiLanguage } from '@sigma-snap/shared';
export type { AiLanguage };

// ─── Filters ──────────────────────────────────────────────────────────────
export type FilterId = 'none' | 'vivid' | 'noir' | 'warm' | 'cool' | 'sepia' | 'fade';

export const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'noir', label: 'Noir' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'fade', label: 'Fade' },
];

// ─── Adjust + transform ───────────────────────────────────────────────────
export interface Adjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
}

export interface CropRect {
  x: number; y: number; w: number; h: number; // normalized 0..1, in post-rotation image space
}

export interface TransformState {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  crop: CropRect | null;
}

export const ASPECTS = [
  { id: 'free', label: 'Free', ratio: 0 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
] as const;

// ─── Text layers ──────────────────────────────────────────────────────────
export type TextAnim = 'none' | 'fade' | 'slide' | 'pop';
export type FontId = 'system' | 'serif' | 'mono' | 'rounded' | 'condensed' | 'hand';

export const FONTS: Array<{ id: FontId; label: string; stack: string }> = [
  { id: 'system', label: 'System', stack: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif` },
  { id: 'serif', label: 'Serif', stack: `Georgia, 'Times New Roman', serif` },
  { id: 'mono', label: 'Mono', stack: `'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace` },
  { id: 'rounded', label: 'Rounded', stack: `'SF Pro Rounded', 'Trebuchet MS', 'Comic Sans MS', sans-serif` },
  { id: 'condensed', label: 'Narrow', stack: `'Arial Narrow', 'Helvetica Neue', sans-serif` },
  { id: 'hand', label: 'Hand', stack: `'Segoe Print', 'Bradley Hand', 'Chalkboard SE', cursive` },
];

export interface TextLayer {
  id: string;
  text: string;
  x: number; y: number; // normalized 0..1 in output space
  size: number; // px at 1080p reference
  color: string;
  align: CanvasTextAlign;
  fontId: FontId;
  bold: boolean;
  stroke: boolean;
  strokeColor: string;
  shadow: boolean;
  glow: boolean;
  rotation: number; // degrees
  anim: TextAnim;
  appearAt: number; // seconds (video source time)
  appearTo: number; // seconds (video source time)
}

export const TEXT_COLORS = ['#ffffff', '#000000', '#7C5CFF', '#38E1FF', '#FFC44D', '#FF5470', '#4ADE80', '#FF8A3D'];

// ─── Stickers ─────────────────────────────────────────────────────────────
export type StickerId =
  | 'star' | 'heart' | 'bolt' | 'crown' | 'flower' | 'diamond'
  | 'moon' | 'sparkle' | 'ring' | 'triangle' | 'hex' | 'burst';

export interface StickerInstance {
  id: string;
  stickerId: StickerId;
  x: number; y: number; // normalized 0..1 in output space
  scale: number; // 1 = base size
  rotation: number; // degrees
}

// ─── Drawing ──────────────────────────────────────────────────────────────
export type DrawTool = 'pen' | 'marker' | 'eraser';

export interface DrawStroke {
  id: string;
  tool: DrawTool;
  color: string;
  width: number; // px at 1080p reference
  opacity: number; // 0..1
  points: Array<{ x: number; y: number }>; // normalized 0..1 in output space
}

// ─── Music / voiceover / volume ───────────────────────────────────────────
export interface MusicTrack {
  soundId: string;
  title: string;
  artist?: string | null;
  url: string;
  durationSec: number;
  startOffset: number; // where in the track to begin
  volume: number; // 0..1
  fadeIn: boolean;
  fadeOut: boolean;
}

export interface Voiceover {
  id: string;
  blob: Blob;
  url: string;
  atSec: number; // video source time where it starts
  volume: number; // 0..1
  durationSec: number;
}

// ─── Video timeline ───────────────────────────────────────────────────────
export interface Segment {
  id: string;
  start: number; // source seconds
  end: number; // source seconds
}

export type TransitionKind = 'none' | 'fade' | 'crossfade';

// ─── AI effect ────────────────────────────────────────────────────────────
export type OverlayId = 'rain' | 'snow' | 'letterbox' | 'film-grain' | 'light-leak' | 'vignette';

export const KNOWN_OVERLAYS: OverlayId[] = ['rain', 'snow', 'letterbox', 'film-grain', 'light-leak', 'vignette'];

export interface AiEffect {
  prompt: string;
  language: AiLanguage;
  filter: FilterId | null;
  colorGrade: string; // css filter fragment (sanitized)
  overlays: OverlayId[];
}

export const AI_LANGUAGES: Array<{ id: AiLanguage; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'ur', label: 'اردو' },
  { id: 'roman-ur', label: 'Roman Urdu' },
  { id: 'ar', label: 'العربية' },
  { id: 'hi', label: 'हिन्दी' },
];

// ─── Full pipeline state ──────────────────────────────────────────────────
export interface Pipeline {
  filter: FilterId;
  adjust: Adjust;
  transform: TransformState;
  textLayers: TextLayer[];
  stickers: StickerInstance[];
  strokes: DrawStroke[];
  music: MusicTrack | null;
  voiceovers: Voiceover[];
  masterVolume: number; // 0..1 original audio
  // video-only
  trimIn: number;
  trimOut: number;
  speed: 0.5 | 1 | 2;
  segments: Segment[];
  transitions: Record<string, TransitionKind>; // keyed by boundary id `${segA.id}>${segB.id}`
  aiEffect: AiEffect | null;
}

export function defaultPipeline(videoDuration = 0): Pipeline {
  return {
    filter: 'none',
    adjust: { brightness: 0, contrast: 0, saturation: 0 },
    transform: { rotation: 0, flipH: false, flipV: false, crop: null },
    textLayers: [],
    stickers: [],
    strokes: [],
    music: null,
    voiceovers: [],
    masterVolume: 1,
    trimIn: 0,
    trimOut: videoDuration,
    speed: 1,
    segments: videoDuration > 0 ? [{ id: uid(), start: 0, end: videoDuration }] : [],
    transitions: {},
    aiEffect: null,
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function boundaryId(a: string, b: string): string {
  return `${a}>${b}`;
}
