// @sigma-snap/lens-sdk — bundled original lenses.
// To add a lens: drop a file in this folder exporting a LensDefinition,
// then import + append it to ALL_LENSES below. Core engine code never changes.
import type { LensDefinition } from '../types';

export { neonContour } from './neon-contour';
export { velvetGlow } from './velvet-glow';
export { wobbleFace } from './wobble-face';
export { foxSpirit } from './fox-spirit';
export { celShade } from './cel-shade';
export { aquaRipple } from './aqua-ripple';
export { starlightBokeh } from './starlight-bokeh';
export { prismRain } from './prism-rain';
export { noirLetterbox } from './noir-letterbox';
export { emberStorm } from './ember-storm';
export { galaxyDust } from './galaxy-dust';
export { gloomPulse } from './gloom-pulse';
export { thermalWave } from './thermal-wave';
export { inkSketch } from './ink-sketch';
export { auroraWash } from './aurora-wash';
export { glitchStatic } from './glitch-static';

import { neonContour } from './neon-contour';
import { velvetGlow } from './velvet-glow';
import { wobbleFace } from './wobble-face';
import { foxSpirit } from './fox-spirit';
import { celShade } from './cel-shade';
import { aquaRipple } from './aqua-ripple';
import { starlightBokeh } from './starlight-bokeh';
import { prismRain } from './prism-rain';
import { noirLetterbox } from './noir-letterbox';
import { emberStorm } from './ember-storm';
import { galaxyDust } from './galaxy-dust';
import { gloomPulse } from './gloom-pulse';
import { thermalWave } from './thermal-wave';
import { inkSketch } from './ink-sketch';
import { auroraWash } from './aurora-wash';
import { glitchStatic } from './glitch-static';

/** Every bundled lens, in carousel order. */
export const ALL_LENSES: LensDefinition[] = [
  neonContour,    // FACE_EFFECTS   ★ premium
  velvetGlow,     // BEAUTY
  wobbleFace,     // FUNNY
  foxSpirit,      // ANIMALS
  celShade,       // CARTOON
  inkSketch,      // CARTOON
  aquaRipple,     // DISTORTION
  starlightBokeh, // BACKGROUND
  auroraWash,     // ENVIRONMENT
  prismRain,      // WEATHER        ★ premium
  galaxyDust,     // TRENDING
  thermalWave,    // TRENDING
  glitchStatic,   // TRENDING
  noirLetterbox,  // CINEMATIC
  emberStorm,     // SEASONAL       ★ premium
  gloomPulse,     // HORROR         ★ premium
];
