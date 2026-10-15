/** NDU realism 02 T3: relief gating (PLAN §5.7). Pure. */

export type Relief = { range: number; p90slope: number };

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

/** heights (m) and optional slopes (deg) sampled over the ~1.2 km window around the view. NaN-safe. */
export function reliefScore(heights: ArrayLike<number>, slopes: ArrayLike<number> = []): Relief {
  const h = Array.from(heights).filter(Number.isFinite).sort((a, b) => a - b);
  const s = Array.from(slopes).filter(Number.isFinite).sort((a, b) => a - b);
  return { range: pct(h, 0.95) - pct(h, 0.05), p90slope: pct(s, 0.9) };
}

/**
 * Should 3D terrain be on?  Tier A: on unless flat (R < 4 m and S < 2°); back on above R > 6 m.
 * Tier B ("lite"): only when R ≥ 12 m or S ≥ 4° and fps ≥ 40 (stay on down to R ≥ 9 / S ≥ 3, fps ≥ 35).
 * Tier C: never.
 */
export function shouldTerrain(tier: string, score: Relief, fps: number, prev: boolean): boolean {
  const { range: r, p90slope: s } = score;
  if (tier === "A") return prev ? !(r < 4 && s < 2) : r > 6 || s >= 2;
  if (tier === "B") return prev ? (r >= 9 || s >= 3) && fps >= 35 : (r >= 12 || s >= 4) && fps >= 40;
  return false;
}
