// @sigma-snap/lens-sdk — public entry point.
//
// Framework-agnostic AR lens engine for SIGMA SNAP:
//   import { LensEngine, registry, ALL_LENSES } from '@sigma-snap/lens-sdk';
//
//   const engine = new LensEngine(canvas);
//   engine.setLens(registry.get('neon-contour') ?? null);
//   engine.start(videoEl);          // rAF loop: cover-fit video + lens
//   const photo = engine.capturePhoto(); // fresh canvas, lens composited
//
// All bundled lenses are original procedural canvas-2D effects (no copied
// filters, no image assets). Face detection is pluggable:
//   engine.setDetector(new MyMediaPipeDetector()) // implements FaceDetector
// The bundled HeuristicFaceDetector is an honest center-weighted fallback.

export type { FaceBox, LensCategory, LensDefinition, FaceDetector } from './types';

export { LensRegistry } from './registry';
export { LensEngine } from './engine';
export { HeuristicFaceDetector } from './detector';

export { ALL_LENSES } from './lenses';
export {
  neonContour,
  velvetGlow,
  wobbleFace,
  foxSpirit,
  celShade,
  aquaRipple,
  starlightBokeh,
  prismRain,
  noirLetterbox,
  emberStorm,
  galaxyDust,
  gloomPulse,
  thermalWave,
  inkSketch,
  auroraWash,
  glitchStatic,
} from './lenses';

import { LensRegistry } from './registry';
import { ALL_LENSES } from './lenses';

/** Shared registry, pre-populated with every bundled lens. */
export const registry: LensRegistry = new LensRegistry();
for (const lens of ALL_LENSES) {
  registry.register(lens);
}
