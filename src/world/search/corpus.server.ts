/**
 * NDU-AI search corpus (server side). Gathers the public, searchable things around a spot:
 * tagged OSM buildings (from the realism cell cache), open + declared business listings, and
 * PUBLIC placed scans. Only public columns are selected; everything then passes the privacy filter,
 * so owner ids, contact details and unpublished claims never leave the server. No new tables.
 */
import { getSql } from "@/lib/db";
import { buildingsForCell } from "@/world/realism/osmBuildings";
import { publicRecord, type RawRecord } from "./privacy.ts";

const TTL = 60_000;
const cache = new Map<string, { at: number; job: Promise<RawRecord[]> }>();

function centroid(ring: number[][]): [number, number] {
  let x = 0;
  let y = 0;
  const n = Math.max(1, ring.length - 1);
  for (let i = 0; i < n; i += 1) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

async function buildings(lat: number, lng: number): Promise<RawRecord[]> {
  const cell = await buildingsForCell(lat, lng).catch(() => null);
  if (!cell || !cell.ok) return [];
  const out: RawRecord[] = [];
  for (const f of cell.data.features) {
    const p = f.properties;
    if (p.part) continue; // building:part pieces repeat their outline
    const named = !!p.name;
    if (!named && p.h < 15 && (!p.kind || p.kind === "yes" || p.kind === "house" || p.kind === "residential")) continue;
    const [x, y] = centroid(f.geometry.coordinates[0] ?? []);
    out.push({ source: "building", osm: p.osm, name: p.name, kind: p.kind, h: Math.round(p.h * 10) / 10, lv: p.lv, lat: y, lng: x });
  }
  // named first, then tallest; keep the payload small
  out.sort((a, b) => Number(!!b.name) - Number(!!a.name) || Number(b.h) - Number(a.h));
  return out.slice(0, 320);
}

async function listings(lat: number, lng: number): Promise<RawRecord[]> {
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; category: string; offer: string; lat: number; lng: number; verified: boolean }>`
      select id, name, category, offer, lat, lng, verified from businesses
      where open = true and declared = true and abs(lat - ${lat}) < 0.03 and abs(lng - ${lng}) < 0.03
      order by verified desc, updated_at desc limit 80`;
    return rows.map((r) => ({ source: "listing" as const, id: r.id, name: r.name, category: r.category, offer: r.offer, lat: Number(r.lat), lng: Number(r.lng), verified: !!r.verified, open: true, declared: true }));
  } catch {
    return [];
  }
}

async function publicScans(lat: number, lng: number): Promise<RawRecord[]> {
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; lat: number; lng: number; status: string | null }>`
      select id, name, lat, lng, status from scan_assets
      where visibility = 'public' and lat is not null and lng is not null
        and abs(lat - ${lat}) < 0.03 and abs(lng - ${lng}) < 0.03
      order by placed_at desc nulls last limit 40`;
    return rows.map((r) => ({ source: "scan" as const, id: r.id, name: r.name, lat: Number(r.lat), lng: Number(r.lng), status: r.status ?? "stored", visibility: "public" }));
  } catch {
    return [];
  }
}

export function searchCorpusFor(lat: number, lng: number): Promise<RawRecord[]> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.job;
  const job = Promise.all([buildings(lat, lng), listings(lat, lng), publicScans(lat, lng)]).then((parts) =>
    parts
      .flat()
      .map((r) => publicRecord(r))
      .flatMap((v) => (v.ok ? [v.record as RawRecord] : [])),
  );
  cache.set(key, { at: Date.now(), job });
  if (cache.size > 80) cache.delete(cache.keys().next().value as string);
  return job;
}
