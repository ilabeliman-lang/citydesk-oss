import { createServerFn } from "@tanstack/react-start";

export type GoogleSpot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
};

/** NDU-UPG 904: this map is not a Google map. Never fetch or paint Google places. */
export const nearbyGoogle = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Location required");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async (): Promise<{ ok: boolean; reason: string; places: GoogleSpot[] }> => {
    return { ok: false, reason: "Google places are not shown on this map", places: [] };
  });

export type PinCheck =
  | { matched: false; reason: "no_key" | "no_match" | "not_on_this_map" }
  | { matched: true; placeId: string; name: string; lat: number; lng: number };

/** Listings stay where the owner stood. Coordinates are never replaced with a Google pin. */
export async function lookupPin(_name: string, _lat: number, _lng: number): Promise<PinCheck> {
  return { matched: false, reason: "not_on_this_map" };
}
