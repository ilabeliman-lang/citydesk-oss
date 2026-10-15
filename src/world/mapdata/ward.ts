/**
 * Ward cells on a 0.01 degree grid.
 * The tile id is "{latIndex}:{lngIndex}". Each index is floor(degrees / 0.01),
 * so 480:700 is the cell that starts at latitude 4.80 and longitude 7.00.
 *
 * Built-in note: this does not replace Overpass.
 * No request is made from here. A baked archive would be a later step.
 */

/** This index does not replace Overpass. */
export const WARD_NOTE = "This does not replace Overpass.";

const STEP = 0.01;

/** Floor to a 0.01 degree step. Binary noise just under a boundary stays on that boundary. */
function cellIndex(degrees: number): number {
  return Math.floor(Math.round(degrees / STEP * 1e6) / 1e6);
}

/** Tile id of the 0.01 degree cell that contains this point. */
export function wardCell(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("ward cell needs finite lat and lng");
  }
  return `${cellIndex(lat)}:${cellIndex(lng)}`;
}
