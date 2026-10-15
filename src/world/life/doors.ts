/** Doors the street last loaded. The walk reads this so a mapped entrance is not a wall. */

type Spot = { lng: number; lat: number };
let doors: Spot[] = [];

export function setDoors(list: Spot[]) {
  doors = list.filter((d) => Number.isFinite(d.lng) && Number.isFinite(d.lat)).slice(0, 80);
}

export function doorWithin(lng: number, lat: number, metres = 4): boolean {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  const cos = Math.cos((lat * Math.PI) / 180) || 1;
  return doors.some((d) => {
    const east = (d.lng - lng) * 111320 * cos;
    const north = (d.lat - lat) * 111320;
    return Math.hypot(east, north) <= metres;
  });
}
