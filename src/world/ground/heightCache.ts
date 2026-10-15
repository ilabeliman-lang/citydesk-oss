import { decodeTile, lngLatToTilePx, metresPerPixel, minMax, normalAt, sampleBilinear } from "./terrarium.ts";
import type { DemTile, Normal } from "./types.ts";

/**
 * NDU realism 02 T2: CPU DEM cache (PLAN §4.6, §5.2). LRU of z14 Terrarium tiles, decoded in a
 * module worker (main-thread fallback). The pure parts (LRU, tile cover, bench) are unit tested.
 */

export const DEM_Z = 14;
export const TILE_SIZE = 256;

export class Lru<V> {
  private m = new Map<string, V>();
  cap: number;
  constructor(cap: number) {
    this.cap = cap;
  }
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  peek(k: string) {
    return this.m.get(k);
  }
  set(k: string, v: V): string[] {
    this.m.delete(k);
    this.m.set(k, v);
    const out: string[] = [];
    while (this.m.size > this.cap) {
      const old = this.m.keys().next().value as string;
      this.m.delete(old);
      out.push(old);
    }
    return out;
  }
  has(k: string) {
    return this.m.has(k);
  }
  get size() {
    return this.m.size;
  }
  keys() {
    return [...this.m.keys()];
  }
  clear() {
    this.m.clear();
  }
}

export type TileId = { z: number; x: number; y: number };
export const tileKey = (t: TileId) => `${t.z}/${t.x}/${t.y}`;

/** Tiles at zoom z that cover a circle of radiusM metres around a spot. */
export function tilesCovering(lng: number, lat: number, radiusM: number, z = DEM_Z, size = TILE_SIZE): TileId[] {
  const c = lngLatToTilePx(lng, lat, z, size);
  const r = radiusM / metresPerPixel(lat, z, size);
  const n = 2 ** z;
  const x0 = Math.floor((c.x - r) / size);
  const x1 = Math.floor((c.x + r) / size);
  const y0 = Math.max(0, Math.floor((c.y - r) / size));
  const y1 = Math.min(n - 1, Math.floor((c.y + r) / size));
  const out: TileId[] = [];
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) out.push({ z, x: ((x % n) + n) % n, y });
  return out;
}

/** 3 failures in a row → cool down for 2 min (like overpass.ts). */
export class Bench {
  fails = 0;
  until = 0;
  private max: number;
  private coolMs: number;
  constructor(max = 3, coolMs = 120_000) {
    this.max = max;
    this.coolMs = coolMs;
  }
  benched(now: number) {
    return now < this.until;
  }
  fail(now: number) {
    this.fails += 1;
    if (this.fails >= this.max) {
      this.until = now + this.coolMs;
      this.fails = 0;
    }
  }
  ok() {
    this.fails = 0;
  }
}

export const capForTier = (tier: string, mobile = false) => (tier === "A" ? (mobile ? 24 : 40) : tier === "B" ? 16 : 0);

type Decoded = { key: string; h: Float32Array } | { key: string; error: string };

export class HeightCache {
  version = 0;
  private lru: Lru<DemTile>;
  private inflight = new Set<string>();
  private bench = new Bench();
  private subs = new Set<() => void>();
  private worker: Worker | null = null;
  private waiting = new Map<string, (d: Decoded) => void>();
  failures = 0;
  private dead = false;
  private template: string;

  constructor(template: string, cap: number) {
    this.template = template;
    this.lru = new Lru<DemTile>(Math.max(1, cap));
    try {
      if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
        this.worker = new Worker(new URL("./demWorker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (ev: MessageEvent<Decoded>) => {
          const cb = this.waiting.get(ev.data.key);
          this.waiting.delete(ev.data.key);
          cb?.(ev.data);
        };
        this.worker.onerror = () => {
          this.worker?.terminate();
          this.worker = null;
        };
      }
    } catch {
      this.worker = null;
    }
  }

  get tiles() {
    return this.lru.size;
  }
  get pending() {
    return this.inflight.size;
  }

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  tile(t: TileId): DemTile | undefined {
    return this.lru.peek(tileKey(t));
  }

  url(t: TileId) {
    return this.template.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));
  }

  ensure(tiles: TileId[]) {
    if (this.dead) return;
    const now = Date.now();
    if (this.bench.benched(now)) return;
    for (const t of tiles) {
      const key = tileKey(t);
      if (this.lru.has(key) || this.inflight.has(key)) continue;
      this.inflight.add(key);
      void this.fetchOne(t, key);
    }
  }

  private async decodeMain(url: string): Promise<Float32Array> {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const bmp = await createImageBitmap(await res.blob());
    let data: Uint8ClampedArray;
    if (typeof OffscreenCanvas !== "undefined") {
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(bmp, 0, 0);
      data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    } else {
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(bmp, 0, 0);
      data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    }
    return decodeTile(data, bmp.width);
  }

  private decode(url: string, key: string): Promise<Float32Array> {
    const w = this.worker;
    if (!w) return this.decodeMain(url);
    return new Promise((resolve, reject) => {
      this.waiting.set(key, (d) => ("h" in d ? resolve(d.h) : reject(new Error(d.error))));
      w.postMessage({ key, url });
    }).then(
      (h) => h as Float32Array,
      () => this.decodeMain(url),
    );
  }

  private async fetchOne(t: TileId, key: string) {
    try {
      const h = await this.decode(this.url(t), key);
      if (this.dead) return;
      const size = Math.round(Math.sqrt(h.length));
      const { min, max } = minMax(h);
      this.lru.set(key, { ...t, size, h, min, max });
      this.bench.ok();
      this.version += 1;
      for (const fn of this.subs) fn();
    } catch {
      this.failures += 1;
      this.bench.fail(Date.now());
    } finally {
      this.inflight.delete(key);
    }
  }

  /** DEM height at a spot, or null when its tile isn't cached. */
  sample(lng: number, lat: number): number | null {
    const p = lngLatToTilePx(lng, lat, DEM_Z, TILE_SIZE);
    const t = this.lru.peek(`${DEM_Z}/${p.tx}/${p.ty}`);
    return t ? sampleBilinear(t, p.px, p.py) : null;
  }

  normal(lng: number, lat: number): Normal | null {
    const p = lngLatToTilePx(lng, lat, DEM_Z, TILE_SIZE);
    const t = this.lru.peek(`${DEM_Z}/${p.tx}/${p.ty}`);
    return t ? normalAt(t, p.px, p.py, metresPerPixel(lat, DEM_Z, t.size)) : null;
  }

  dispose() {
    this.dead = true;
    this.worker?.terminate();
    this.worker = null;
    this.waiting.clear();
    this.lru.clear();
    this.subs.clear();
  }
}
