/** NDU-UPG collide: uniform edge grid in CSR typed arrays (two passes: count, fill). */
export type EdgeInput = { ax: number; ay: number; bx: number; by: number; collider: number };

export class EdgeGrid {
  readonly cell: number;
  readonly ax: Float32Array;
  readonly ay: Float32Array;
  readonly bx: Float32Array;
  readonly by: Float32Array;
  readonly collider: Int32Array;
  readonly count: number;
  private x0 = 0;
  private y0 = 0;
  private nx = 1;
  private ny = 1;
  private cellStart: Int32Array;
  private cellCount: Int32Array;
  private items: Int32Array;
  private stamps: Uint32Array;
  private stamp = 0;
  private skip: Uint8Array;

  constructor(edges: EdgeInput[], cell = 6, inflate = 0.31) {
    this.cell = cell;
    const n = edges.length;
    this.count = n;
    this.ax = new Float32Array(n);
    this.ay = new Float32Array(n);
    this.bx = new Float32Array(n);
    this.by = new Float32Array(n);
    this.collider = new Int32Array(n);
    this.stamps = new Uint32Array(n);
    this.skip = new Uint8Array(n);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const e = edges[i];
      this.ax[i] = e.ax;
      this.ay[i] = e.ay;
      this.bx[i] = e.bx;
      this.by[i] = e.by;
      this.collider[i] = e.collider;
      x0 = Math.min(x0, e.ax, e.bx);
      y0 = Math.min(y0, e.ay, e.by);
      x1 = Math.max(x1, e.ax, e.bx);
      y1 = Math.max(y1, e.ay, e.by);
    }
    if (!n) {
      x0 = y0 = 0;
      x1 = y1 = 1;
    }
    this.x0 = x0 - inflate - cell;
    this.y0 = y0 - inflate - cell;
    this.nx = Math.max(1, Math.ceil((x1 - this.x0 + inflate + cell) / cell));
    this.ny = Math.max(1, Math.ceil((y1 - this.y0 + inflate + cell) / cell));
    const cells = this.nx * this.ny;
    this.cellCount = new Int32Array(cells);
    this.cellStart = new Int32Array(cells);
    const span = (i: number, visit: (c: number) => void) => {
      const cx0 = this.cx(Math.min(this.ax[i], this.bx[i]) - inflate);
      const cx1 = this.cx(Math.max(this.ax[i], this.bx[i]) + inflate);
      const cy0 = this.cy(Math.min(this.ay[i], this.by[i]) - inflate);
      const cy1 = this.cy(Math.max(this.ay[i], this.by[i]) + inflate);
      for (let y = cy0; y <= cy1; y += 1) for (let x = cx0; x <= cx1; x += 1) visit(y * this.nx + x);
    };
    for (let i = 0; i < n; i += 1) span(i, (c) => (this.cellCount[c] += 1));
    let total = 0;
    for (let c = 0; c < cells; c += 1) {
      this.cellStart[c] = total;
      total += this.cellCount[c];
    }
    this.items = new Int32Array(total);
    const fill = new Int32Array(cells);
    for (let i = 0; i < n; i += 1)
      span(i, (c) => {
        this.items[this.cellStart[c] + fill[c]] = i;
        fill[c] += 1;
      });
  }

  private cx(x: number): number {
    const v = Math.floor((x - this.x0) / this.cell);
    return v < 0 ? 0 : v >= this.nx ? this.nx - 1 : v;
  }
  private cy(y: number): number {
    const v = Math.floor((y - this.y0) / this.cell);
    return v < 0 ? 0 : v >= this.ny ? this.ny - 1 : v;
  }

  skipEdges(set: Set<number>): void {
    this.skip.fill(0);
    for (const i of set) if (i >= 0 && i < this.count) this.skip[i] = 1;
  }

  /** Visit each edge whose cells overlap the circle bbox, once (stamp dedupe, no allocation). */
  near(x: number, y: number, r: number, visit: (edge: number) => void): void {
    if (!this.count) return;
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.stamps.fill(0);
      this.stamp = 1;
    }
    const s = this.stamp;
    const cx0 = this.cx(x - r);
    const cx1 = this.cx(x + r);
    const cy0 = this.cy(y - r);
    const cy1 = this.cy(y + r);
    for (let cy = cy0; cy <= cy1; cy += 1)
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const c = cy * this.nx + cx;
        const st = this.cellStart[c];
        const en = st + this.cellCount[c];
        for (let k = st; k < en; k += 1) {
          const e = this.items[k];
          if (this.stamps[e] === s || this.skip[e]) continue;
          this.stamps[e] = s;
          visit(e);
        }
      }
  }

  /** Visit cells along a segment (DDA), each edge once; for camera rays and tunnelling checks. */
  segment(ax: number, ay: number, bx: number, by: number, visit: (edge: number) => void): void {
    if (!this.count) return;
    this.stamp = (this.stamp + 1) >>> 0 || 1;
    const s = this.stamp;
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const mx = this.cx(ax + (bx - ax) * t);
      const my = this.cy(ay + (by - ay) * t);
      for (let cy = Math.max(0, my - 1); cy <= Math.min(this.ny - 1, my + 1); cy += 1)
        for (let cx = Math.max(0, mx - 1); cx <= Math.min(this.nx - 1, mx + 1); cx += 1) {
          const c = cy * this.nx + cx;
          const st = this.cellStart[c];
          const en = st + this.cellCount[c];
          for (let k = st; k < en; k += 1) {
            const e = this.items[k];
            if (this.stamps[e] === s || this.skip[e]) continue;
            this.stamps[e] = s;
            visit(e);
          }
        }
    }
  }
}
