/** People and cars the street sim is drawing. The walk reads this so you don't pass through them. */

export type LifeBody = { lng: number; lat: number; r: number };

let bodies: LifeBody[] = [];

export function setLifeBodies(list: LifeBody[]) {
  bodies = list
    .filter((b) => Number.isFinite(b.lng) && Number.isFinite(b.lat) && Number.isFinite(b.r) && b.r > 0)
    .slice(0, 48);
}

export function lifeBodies(): LifeBody[] {
  return bodies;
}
