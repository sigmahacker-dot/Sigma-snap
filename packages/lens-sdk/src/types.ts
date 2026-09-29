// @sigma-snap/lens-sdk — public type surface.
// FaceBox / LensDefinition / LensCategory are owned by @sigma-snap/shared;
// they are re-exported here so lens authors only need this package.
import type { FaceBox, LensCategory, LensDefinition } from '@sigma-snap/shared';

export type { FaceBox, LensCategory, LensDefinition };

/**
 * Pluggable face detector.
 *
 * The SDK ships with {@link HeuristicFaceDetector} (an honest center-weighted
 * fallback) but any real detector — MediaPipe, TF.js, on-device ML — can be
 * plugged in via `engine.setDetector()` without touching core code.
 *
 * Coordinates are in **video pixel space**: (0,0) is the top-left of the
 * video frame, matching `HTMLVideoElement.videoWidth/videoHeight`.
 */
export interface FaceDetector {
  /** Human-readable detector name, e.g. 'mediapipe-tasks' or 'heuristic-fallback'. */
  readonly name: string;
  /** Return the faces visible in the current video frame. */
  detect(video: HTMLVideoElement): Promise<FaceBox[]>;
}
