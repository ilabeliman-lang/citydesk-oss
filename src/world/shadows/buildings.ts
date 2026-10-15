/** Ground-shadow ellipses for building footprints. Pure GeoJSON — no map. */

import { groundShadow, type LightVector } from "./cast.ts";
import type { BuildingFeature } from "../realism/buildingsData.ts";

const METRES = 111320;
const MAX_FEATURES = 400;
const ELLIPSE_POINTS = 8;

export type BuildingShadowFeature = {
  type: "Feature";
  properties: { opacity: number };
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
};

export type BuildingShadowCollection = {
  type: "FeatureCollection";
  features: BuildingShadowFeature[];
};

type HeightProps = { render_height?: unknown; h?: unknown };

/** Prefer a tagged render height, then `h`, otherwise a low storey. */
function heightMetres(properties: BuildingFeature["properties"] | undefined): number {
  const bag = properties as HeightProps | undefined;
  const render = Number(bag?.render_height);
  if (Number.isFinite(render) && render > 0) return render;
  const h = Number(bag?.h);
  if (Number.isFinite(h) && h > 0) return h;
  return 8;
}

/** Centroid plus east/north extent of the outer ring, in metres. */
function footprint(ring: number[][]): { lng: number; lat: number; width: number; depth: number } | null {
  const closed =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const n = closed ? ring.length - 1 : ring.length;
  if (n < 3) return null;
  let lng = 0;
  let lat = 0;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const x = Number(ring[i][0]);
    const y = Number(ring[i][1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    lng += x;
    lat += y;
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }
  lng /= n;
  lat /= n;
  const cos = Math.cos((lat * Math.PI) / 180);
  const width = (maxLng - minLng) * METRES * (cos > 1e-6 ? cos : 1e-6);
  const depth = (maxLat - minLat) * METRES;
  return { lng, lat, width, depth };
}

/** Eight points around the shadow ellipse, closed for GeoJSON. */
function ellipseRing(
  lng: number,
  lat: number,
  east: number,
  north: number,
  rx: number,
  ry: number,
): [number, number][] {
  const cos = Math.cos((lat * Math.PI) / 180);
  const lngScale = METRES * (cos > 1e-6 ? cos : 1e-6);
  const ring: [number, number][] = [];
  for (let i = 0; i < ELLIPSE_POINTS; i += 1) {
    const angle = (i / ELLIPSE_POINTS) * Math.PI * 2;
    const e = east + Math.cos(angle) * rx;
    const no = north + Math.sin(angle) * ry;
    ring.push([lng + e / lngScale, lat + no / METRES]);
  }
  ring.push(ring[0]);
  return ring;
}

export function buildingShadows(
  features: readonly BuildingFeature[],
  light: LightVector,
): BuildingShadowCollection {
  const out: BuildingShadowFeature[] = [];
  const list = Array.isArray(features) ? features : [];
  for (const feature of list) {
    if (out.length >= MAX_FEATURES) break;
    const ring = feature?.geometry?.type === "Polygon" ? feature.geometry.coordinates?.[0] : undefined;
    if (!ring) continue;
    const foot = footprint(ring);
    if (!foot) continue;
    const shadow = groundShadow(
      { width: foot.width, depth: foot.depth, height: heightMetres(feature.properties) },
      light,
    );
    out.push({
      type: "Feature",
      properties: { opacity: shadow.opacity },
      geometry: {
        type: "Polygon",
        coordinates: [ellipseRing(foot.lng, foot.lat, shadow.east, shadow.north, shadow.rx, shadow.ry)],
      },
    });
  }
  return { type: "FeatureCollection", features: out };
}
