import { createServerFn } from "@tanstack/react-start";
import type { WireRecord } from "./privacy.ts";

/** NDU-AI search: public searchable records around a spot (buildings, listings, public scans). */
export const searchCorpus = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -85 || lat > 85) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    // snap to ~110 m so nearby searchers share one cached answer
    return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
  })
  .handler(async ({ data }): Promise<WireRecord[]> => {
    const { searchCorpusFor } = await import("./corpus.server.ts");
    return (await searchCorpusFor(data.lat, data.lng)) as WireRecord[];
  });
