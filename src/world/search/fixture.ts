/**
 * NDU-AI search golden fixture: a small made-up neighbourhood laid out like a Port Harcourt street
 * block (names are generic; positions in degrees around 4.8156, 7.0498). Used by search.test.ts.
 */
import type { RawRecord } from "./privacy.ts";

const O = { lat: 4.8156, lng: 7.0498 };
const at = (dLatM: number, dLngM: number) => ({ lat: O.lat + dLatM / 110540, lng: O.lng + dLngM / (110540 * Math.cos((O.lat * Math.PI) / 180)) });
const line = (a: [number, number], b: [number, number]): [number, number][] => {
  const p = at(a[0], a[1]);
  const q = at(b[0], b[1]);
  return [0, 0.25, 0.5, 0.75, 1].map((t) => [p.lng + (q.lng - p.lng) * t, p.lat + (q.lat - p.lat) * t]);
};

export const FIXTURE: RawRecord[] = [
  // streets (street graph labels)
  { source: "street", name: "Ikwerre Road", cls: "primary", pts: line([-600, 0], [600, 0]) },
  { source: "street", name: "Okija Street", cls: "residential", pts: line([60, 120], [60, 420]) },
  { source: "street", name: "Emeka Close", cls: "residential", pts: line([-900, -900], [-900, -700]) },
  { source: "street", name: "Aba Road", cls: "trunk", pts: line([900, -600], [900, 600]) },
  { source: "street", name: "Market Lane", cls: "tertiary", pts: line([-300, 200], [-300, 500]) },
  // POIs
  { source: "poi", kind: "market", name: "Mile One Market", ...at(120, 250) },
  { source: "poi", kind: "bus", name: "", ...at(5, 30) },
  { source: "poi", kind: "church", name: "St. Mary's Catholic Church", ...at(-450, -300) },
  { source: "poi", kind: "signal", name: "", ...at(0, 0) },
  // buildings (tagged OSM, resolved heights)
  { source: "building", osm: 101, h: 62, lv: 18, kind: "office", name: "Delta Towers", ...at(90, 300) },
  { source: "building", osm: 102, h: 9, lv: 3, kind: "residential", name: "", ...at(-880, -800) },
  { source: "building", osm: 103, h: 34, lv: 10, kind: "hotel", name: "Presidential Hotel", ...at(880, 400) },
  { source: "building", osm: 104, h: 6, lv: 2, kind: "school", name: "Rumuola Primary School", ...at(-200, 600) },
  // places (OSM, from the map)
  { source: "place", id: "9001", name: "Garden City Pharmacy", kind: "care", offer: "OpenStreetMap · pharmacy", ...at(-20, -150) },
  { source: "place", id: "9002", name: "Mama Ngozi Buka", kind: "eat", offer: "OpenStreetMap · restaurant", ...at(40, 380) },
  { source: "place", id: "9003", name: "Total Filling Station", kind: "shift", offer: "OpenStreetMap · fuel", ...at(880, 0) },
  { source: "place", id: "9004", name: "Sweet Crust Bakery", kind: "eat", offer: "OpenStreetMap · bakery", ...at(-310, 350) },
  { source: "place", id: "9005", name: "Central Mosque", kind: "rest", offer: "OpenStreetMap · place_of_worship mosque", ...at(-600, 500) },
  // business listings (businesses table, public columns + things that must be filtered)
  { source: "listing", id: "b1", name: "Chidi Barbershop", category: "service", offer: "Fresh cuts. Call 0803 123 4567 or chidi@example.com", open: true, declared: true, ownerId: "user_secret_1", verified: false, ...at(70, 200) },
  { source: "listing", id: "b2", name: "Hidden Draft Shop", category: "shop", offer: "not open", open: false, declared: true, ownerId: "user_secret_2", ...at(0, 50) },
  { source: "listing", id: "b3", name: "Undeclared Kiosk", category: "shop", offer: "x", open: true, declared: false, ...at(0, 60) },
  // scans
  { source: "scan", id: "s1", name: "red_keke_model.glb", visibility: "public", status: "ready", ...at(30, 100) },
  { source: "scan", id: "s2", name: "my_bedroom_scan.glb", visibility: "private", status: "ready", ...at(30, 110) },
  { source: "scan", id: "s3", name: "family_parlour.glb", visibility: "family", status: "ready", ...at(30, 120) },
  // property claims (never indexed unless published as a community listing)
  { source: "property", recordRef: "aa11", title: "Generator claim", claimStatus: "draft", scope: "personal", ...at(10, 10) },
  { source: "property", recordRef: "bb22", title: "Pending TV claim", claimStatus: "pending_mint", scope: "family", ...at(10, 20) },
];

export const ORIGIN = O;
