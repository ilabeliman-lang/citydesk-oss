# Retire the hidden Leaflet map (NDU-6)

Plan only — no code changes in this document. Every claim cites file:line in
`citydesk` main (`f9bd574`).

## 1. What still uses Leaflet

Two files, both under `src/world/`, import Leaflet (and its CSS):

| File | Lines | Status |
|---|---|---|
| `src/world/WorldMap.tsx` | 1093 lines | **LIVE** — lazily mounted by the `/map` route (`src/routes/map.tsx:11-12`) |
| `src/world/StreetPlay.tsx` | 321 lines | **DEAD** — never imported anywhere (`grep -rn "StreetPlay" src/` matches only the file itself) |

### WorldMap.tsx — every Leaflet touchpoint

| Kind | Location | What it does |
|---|---|---|
| CSS import | `src/world/WorldMap.tsx:2` | `import "leaflet/dist/leaflet.css"` |
| Typed refs | `src/world/WorldMap.tsx:62-67` | `Map`, `TileLayer` ×2 (streets + satellite), `Marker` (you), `LayerGroup` ×2 (others, places) |
| Map init | `src/world/WorldMap.tsx:140-151` | `L.map(el, { zoomControl: false, attributionControl: true }).setView([FALLBACK.lat, FALLBACK.lng], 16)` |
| Layer groups | `src/world/WorldMap.tsx:147-148` | `L.layerGroup().addTo(map)` for others + places |
| Zoom sync | `src/world/WorldMap.tsx:163-172` | `map.on("zoomend", …)` / `map.off("zoomend", …)` |
| Streets/sat toggle | `src/world/WorldMap.tsx:174-179` | `map.removeLayer(satRef.current)` / `removeLayer(streetsRef.current)` |
| Your-avatar marker | `src/world/WorldMap.tsx:242-252+` | `L.divIcon({ iconSize: [44,44], iconAnchor: [22,22], … })` (avatar `<img>` or orange dot) |
| Others markers | `src/world/WorldMap.tsx:364-374+` | per-person `L.divIcon` in `othersRef` layer group |
| Places markers | `src/world/WorldMap.tsx:442-452+` | per-place `L.divIcon` (Verse / verified / ring / kind labels) |

### StreetPlay.tsx — every Leaflet touchpoint (dead code, remove wholesale)

| Kind | Location | What it does |
|---|---|---|
| CSS import | `src/world/StreetPlay.tsx:3` | `import "leaflet/dist/leaflet.css"` |
| Typed refs | `src/world/StreetPlay.tsx:29-32` | `Map`, `Marker`, `LayerGroup` ×2 |
| Map init + tiles | `src/world/StreetPlay.tsx:51-57` | `L.map(…).setView(…, 17)`, `L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution, maxZoom: 19 })` |
| You marker | `src/world/StreetPlay.tsx:58-65` | orange `L.divIcon` marker at FALLBACK |
| Re-init effects | `src/world/StreetPlay.tsx:96`, `:182` | further `void import("leaflet")` blocks (walk/drive re-positioning) |

## 2. What MapLibre already covers

The primary world map is MapLibre, not Leaflet:

- Dependency: `package.json:85` — `"maplibre-gl": "^5.6.1"` (already installed; pinned per NDU-5).
- Main map: `src/world/CityBuildings.tsx:199` — `Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])` with style `https://tiles.openfreemap.org/styles/liberty` (`src/world/CityBuildings.tsx:445`) — streets, labels, and 3D buildings in true meters.
- Markers: `new ml.Marker({ element, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map)` — used for the player (`:470`), trip stops (`:538-543`), places (`:650`), presence dots (`:660`), goal pins (`:748`). This is the direct MapLibre equivalent of Leaflet's `L.marker` + `L.divIcon` (element-based DOM markers, same pattern).
- Layers/groups: MapLibre has no LayerGroup; grouping is done with per-purpose marker arrays and `map.remove()` (`src/world/CityBuildings.tsx` marker tracking via `track(...)`), or GeoJSON sources + layers (`TRIP_SOURCE_ID`, `:678-681`).
- Zoom events: MapLibre's `map.on("zoomend", …)` / `map.off(...)` is API-identical to Leaflet's (`:163-172` needs no logic change).
- Tile layers: MapLibre style JSON replaces Leaflet `L.tileLayer` — the Liberty style already renders streets; a satellite toggle would need a second style or a raster source, which WorldMap's sat mode has no equivalent for yet (see §4).

## 3. Exact code to remove

### 3a. StreetPlay.tsx (dead code — delete the file)

```
git rm src/world/StreetPlay.tsx
```

Verify first: `grep -rn "StreetPlay" src/` must return nothing outside the file.

### 3b. WorldMap.tsx (the live /map route)

Remove, in order:

1. Line 2 — `import "leaflet/dist/leaflet.css";`
2. Lines 62-67 — all six `useRef<import("leaflet").…>` declarations.
3. Lines 140-151 — the `void import("leaflet")` map-init effect (replace with the MapLibre init from `CityBuildings.tsx:199-…` if the /map route is kept; see §4 decision).
4. Lines 163-172 — zoom-sync effect: **keep the logic**, swap `map.on/off("zoomend")` to MapLibre's identical API.
5. Lines 174-179 — streets/sat toggle: delete (the style swap replaces it) or convert to a MapLibre `setStyle` toggle.
6. Lines 242-252+ (you), 364-374+ (others), 442-452+ (places) — the three `void import("leaflet")` marker effects: replace `L.divIcon` with `new ml.Marker({ element, anchor: "bottom" })` exactly as `CityBuildings.tsx:470` does.

**Alternative (recommended):** if the /map route exists only as a legacy Leaflet view and CityBuildings already covers the same ground, delete `src/routes/map.tsx` + `src/world/WorldMap.tsx` together and let MapLibre's main world be the only map. Confirm with Sun which route /map should keep.

### 3c. package.json lines to drop

```
"@types/leaflet": "^1.9.22",   (package.json:69)
"leaflet": "^1.9.4",           (package.json:82)
```

After both files are gone: `npm uninstall leaflet @types/leaflet` (regenerates
package-lock.json; commit the lockfile too).

## 4. Leaflet usage with NO MapLibre equivalent yet

- **Satellite tile mode** (`src/world/WorldMap.tsx:64`, `:174-179`): the Liberty
  style is streets-only. A satellite toggle needs either a second style URL or a
  MapLibre raster source + layer. Not present anywhere in the codebase today —
  decide (drop the feature, or add a raster source) before removing the toggle.
- **OSM attribution** (`src/world/StreetPlay.tsx:53`): OpenStreetMap attribution
  must be preserved wherever OSM tiles or OSM data are used — Liberty/OpenFreeMap
  carries its own attribution, but verify the attribution control still shows
  OSM after the swap.

## 5. Suggested order

1. Delete `src/world/StreetPlay.tsx` (dead, zero risk) — verify with grep first.
2. Decide the /map route's fate with Sun (§3b alternative).
3. Port or delete `src/world/WorldMap.tsx` per that decision.
4. `npm uninstall leaflet @types/leaflet`, commit package.json + lockfile.
5. Gates: `npm run typecheck` (no new errors), `npm test`, and a manual check of
   the /map route (or its removal) plus the main MapLibre world.
