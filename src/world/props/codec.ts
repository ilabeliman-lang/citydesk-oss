import { KIND_CODES, type CellPayload, type PropRecord } from "./types.ts";
import { projAt } from "./geo.ts";

/**
 * NDU-UPG props: columnar cell codec (PLAN §4.2). Positions/sizes are origin-relative decimetres,
 * yaw in whole degrees; rare fields (tree/lamp/tags) go to `extra` keyed by row. Pure, alias-free.
 * flags bits: 0 inferred · 1 lit · 2 shelter · 3 backrest · 4–6 variant · 7 lowConfidence · 8–9 osmType(n=0,w=1,x=2)
 */

export const CODEC_V = 1 as const;

export function encodeCell(
  records: PropRecord[],
  cell: string,
  origin: [number, number],
  meta: { fetchedAt: number; osmBase: string | null },
): CellPayload {
  const proj = projAt(origin[0], origin[1]);
  const p: CellPayload = {
    v: CODEC_V, cell, origin, fetchedAt: meta.fetchedAt, osmBase: meta.osmBase,
    counts: { osm: 0, inferred: 0 },
    k: [], a: [], arch: [], x: [], y: [], h: [], w: [], d: [], yaw: [], flags: [], id: [], extra: {},
  };
  const archIdx = new Map<string, number>();
  records.forEach((r, i) => {
    const [x, y] = proj.toXY(r.lng, r.lat);
    let ai = archIdx.get(r.archetype);
    if (ai == null) {
      ai = p.arch.length;
      p.arch.push(r.archetype);
      archIdx.set(r.archetype, ai);
    }
    p.k.push(KIND_CODES.indexOf(r.kind));
    p.a.push(ai);
    p.x.push(Math.round(x * 10));
    p.y.push(Math.round(y * 10));
    p.h.push(Math.round(r.heightM * 10));
    p.w.push(Math.round(r.widthM * 10));
    p.d.push(Math.round(r.depthM * 10));
    p.yaw.push(Math.round(r.yawDeg) % 360);
    const t = r.osmType === "n" ? 0 : r.osmType === "w" ? 1 : 2;
    p.flags.push((r.src === "inferred" ? 1 : 0) | (r.lit ? 2 : 0) | (r.shelter ? 4 : 0) | (r.backrest ? 8 : 0) | ((r.variant & 7) << 4) | (r.lowConfidence ? 128 : 0) | (t << 8));
    p.id.push(r.osmId);
    if (r.src === "inferred") p.counts.inferred += 1;
    else p.counts.osm += 1;
    const ex: Partial<PropRecord> = {};
    if (r.tree) ex.tree = r.tree;
    if (r.lamp) ex.lamp = r.lamp;
    if (r.tags) ex.tags = r.tags;
    if (Object.keys(ex).length) p.extra[i] = ex;
  });
  return p;
}

export function decodeCell(p: CellPayload): PropRecord[] {
  if (!p || p.v !== CODEC_V) throw new Error(`props codec: unsupported payload version ${p?.v}`);
  const proj = projAt(p.origin[0], p.origin[1]);
  const out: PropRecord[] = [];
  for (let i = 0; i < p.k.length; i += 1) {
    const [lng, lat] = proj.toLL(p.x[i] / 10, p.y[i] / 10);
    const f = p.flags[i];
    const t = (f >> 8) & 3;
    const r: PropRecord = {
      kind: KIND_CODES[p.k[i]],
      archetype: p.arch[p.a[i]],
      osmId: p.id[i],
      osmType: t === 0 ? "n" : t === 1 ? "w" : "x",
      lng, lat,
      heightM: p.h[i] / 10,
      widthM: p.w[i] / 10,
      depthM: p.d[i] / 10,
      yawDeg: p.yaw[i],
      src: f & 1 ? "inferred" : "osm",
      variant: (f >> 4) & 7,
    };
    if (f & 2) r.lit = true;
    if (f & 4) r.shelter = true;
    if (f & 8) r.backrest = true;
    if (f & 128) r.lowConfidence = true;
    const ex = p.extra[i];
    if (ex) Object.assign(r, ex);
    out.push(r);
  }
  return out;
}
