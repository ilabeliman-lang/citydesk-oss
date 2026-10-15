// NDU-FP (FPXR-06): 1€ filter (Casiez et al. 2012) for gyro look. Pure.
export type OneEuroOpts = { minCutoff: number; beta: number; dCutoff: number };
const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  private o: OneEuroOpts;
  constructor(o: OneEuroOpts = { minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 }) {
    this.o = o;
  }
  reset() {
    this.x = null;
    this.dx = 0;
  }
  filter(x: number, tSec: number): number {
    if (this.x === null) {
      this.x = x;
      this.t = tSec;
      return x;
    }
    const dt = Math.max(1e-4, tSec - this.t);
    this.t = tSec;
    const d = (x - this.x) / dt;
    this.dx += alpha(this.o.dCutoff, dt) * (d - this.dx);
    const cutoff = this.o.minCutoff + this.o.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}
/** Unwrap an angle stream (deg) so the filter never sees a ±180 jump. */
export function unwrapDeg(prev: number | null, next: number): number {
  if (prev === null) return next;
  let d = next - prev;
  d -= 360 * Math.round(d / 360);
  return prev + d;
}
