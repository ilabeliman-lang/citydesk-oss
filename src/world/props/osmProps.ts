import { createServerFn } from "@tanstack/react-start";
import { OVERPASS_URL, overpassInit } from "@/world/overpass";
import { cellOf } from "@/world/realism/osmBuildings";
import { zoneFor } from "@/world/realism/sun";
import { createPropsService, type OverpassBody, type PropsAnswer } from "./osmPropsCore.ts";

/**
 * NDU-UPG props: server function — real-size OSM street furniture for the viewed ~330 m cell
 * (same cell keys as realism buildings). Data © OpenStreetMap contributors (ODbL).
 * NOTE: uses OVERPASS_URL + overpassInit (main has no `overpassFetch` mirror helper yet; that file is
 * mid-edit by another agent in the live tree, so it is not touched here).
 */

// QA only: point props at a local Overpass replay (e.g. NDU_PROPS_OVERPASS_URL=http://127.0.0.1:5299). No secrets.
const PROPS_OVERPASS_URL = (typeof process !== "undefined" && process.env.NDU_PROPS_OVERPASS_URL) || OVERPASS_URL;

const service = createPropsService({
  fetchOverpass: async (query): Promise<OverpassBody | null> => {
    try {
      const res = await fetch(PROPS_OVERPASS_URL, { ...overpassInit(query), signal: AbortSignal.timeout(28_000) });
      if (!res.ok) {
        console.info(`[props] overpass HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as OverpassBody;
    } catch (err) {
      console.info(`[props] overpass failed: ${(err as Error).message}`);
      return null;
    }
  },
  unlitRoads: false, // PLAN §13 default: never invent lamps on unlit roads
});

export async function propsForCell(lat: number, lng: number): Promise<PropsAnswer> {
  const cell = cellOf(lat, lng);
  return service.propsForCell(cell, zoneFor(lat, lng));
}

export const propsStats = () => service.stats();

export const osmProps = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -85 || lat > 85) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<PropsAnswer> => propsForCell(data.lat, data.lng));
