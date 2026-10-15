// NDU-UPG placement: drag and rotate gizmo. Screen pixels in, east/north metres out.

/** Rotate-handle snap. A 20° step becomes 15°. */
export const ROTATE_STEP_DEG = 15;

export type DragDelta = {
  /** Metres east. Positive pointer x is east. */
  east: number;
  /** Metres north. Positive pointer y is down the screen, which is south. */
  north: number;
  /** Straight-line length of this drag, in metres. */
  metres: number;
};

/**
 * Pointer drag to metres at the current map scale.
 * A 10 px drag at 0.5 m/px is 5 metres. Pass the result to `offsetMetres`.
 */
export function dragDelta(dxPx: number, dyPx: number, metresPerPx: number): DragDelta {
  const scale = Number.isFinite(metresPerPx) ? metresPerPx : 0;
  const dx = Number.isFinite(dxPx) ? dxPx : 0;
  const dy = Number.isFinite(dyPx) ? dyPx : 0;
  const east = dx * scale || 0;
  const north = -dy * scale || 0;
  return { east, north, metres: Math.hypot(east, north) || 0 };
}

/**
 * Nearest 15° step. 20° becomes 15°.
 * The sign is kept, so a backward twist stays backward. The caller normalises a stored heading.
 */
export function rotateStep(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const steps = degrees / ROTATE_STEP_DEG;
  const snapped = Math.sign(steps) * Math.round(Math.abs(steps)) * ROTATE_STEP_DEG;
  return snapped || 0;
}
