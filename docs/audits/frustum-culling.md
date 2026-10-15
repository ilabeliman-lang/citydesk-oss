# Audit: upg-u-066 — Buildings frustum culling — AUDIT (read-only)

- **Task:** 'Buildings frustum culling audit' — acceptance: 'Offscreen skipped'.
- **Branch:** feat/impl-upg-u-066 (worktree `citydesk-impl-upg-u-066`, based on citydesk main).
- **Scope (read-only):** `src/world/CityBuildings.tsx`, `src/world/realism/*`,
  `src/world/perf/*`, `src/world/shadows/*`, `src/world/collide/*`,
  `src/world/props/lod.ts`, `src/world/inspect/*` (usage sites).
- **Verdict:** offscreen buildings ARE skipped by MapLibre's renderer, but the
  app re-submits the whole loaded cell set on every cell change and applies no
  viewport filter of its own. One app layer (`building-3d`, the basemap tile
  layer) does get a distance filter — only on the degrade path, not the
  app's own `ndu-real-buildings` layer.

## Where buildings come from

Two independent building layers feed the same pixels:

1. **Basemap vector tiles** — style `https://tiles.openfreemap.org/styles/liberty`,
   layers `building-3d` and `building` (`CityBuildings.tsx:482` for the style,
   `realism/layers.ts:8` and `CityBuildings.tsx:685,947` for the layer ids).
   Data arrives as vector tiles; the app never sets it.
2. **App-added GeoJSON source** — `ndu-real-buildings-src` with layers
   `ndu-real-buildings` / `ndu-real-roofs` (`realism/index.ts:63,148-176`,
   ids in `realism/layers.ts:2-3`). Data is built from Overpass per grid cell
   (~330 m + margin: `realism/osmBuildings.ts:13-14,20-24,36`), cached client
   side in an LRU of **MAX_CELLS = 4 cells** (`realism/index.ts:65,358,360`),
   plus a network-free fallback re-derived from the basemap tiles
   (`realism/index.ts:294-317`, ~1 km radius filter at `realism/index.ts:278,
   301-304`).

The app does **not** hide offscreen tile buildings wholesale; it only hides the
tile twins of buildings it redraws with real heights, by id
(`realism/index.ts:334-338`).

## Current behaviour: is anything viewport-filtered?

| Layer / data | Set by | Viewport/frustum filter today |
|---|---|---|
| `building-3d`, `building` (tile) | MapLibre vector tiles | Automatic per-tile render culling (below). App only sets the covered-id hide filter (`realism/index.ts:337-338`) and a *distance* filter on the degrade ladder (`perf/mapPerf.ts:30,117-139`). |
| `ndu-real-buildings`, `ndu-real-roofs` (GeoJSON) | `realism/index.ts:148-176` | **No viewport filter.** `setData` in `redraw()` submits the union of all cached cells + tile fallback (`realism/index.ts:319-339`). The only filter set on these layers is height/tier based (`realism/index.ts:170` REAL_ROOFS at mount, `:248` re-applied on day/night change). |
| Ground shadows (`ndu-ground-shadows`) | `shadows/buildings.ts:86-111`, set in `realism/index.ts:331-332` | Computed for **every drawn feature**, capped at 400 ellipses (`shadows/buildings.ts:7,93`). No viewport filter. |
| Collision footprints | `publishBuildings(drawn)` (`realism/index.ts:333`), `publishTileFootprints` (`:313`) | Cell-wide by design (collision needs approach space) — not a rendering concern. |

Trigger for the full re-submit: `moveend` → 700 ms settle → `loadCell()` +
`scanTiles()` (`realism/index.ts:372-383`); every new cell calls `redraw()`
(`realism/index.ts:361` via `loadCell` → `scanTiles` → `scanNow`, and
`:316`), which rebuilds the **entire** FeatureCollection across all up-to-4
cells and `setData`s it (`realism/index.ts:329`).

## What MapLibre does automatically (no app work)

- **Vector-tile sources** (`building-3d`/`building`): MapLibre only requests,
  parses and draws tiles intersecting the viewport; features inside a fetched
  tile are clipped to the screen in the shader. Offscreen buildings in
  never-fetched tiles are genuinely skipped — memory and GPU alike. (Standard
  mapbox/maplibre-gl vector rendering; no app code involved —
  `CityBuildings.tsx:479-494` constructs the map with the stock style.)
- **GeoJSON sources** (`ndu-real-buildings-src`): MapLibre also tiles GeoJSON
  client-side (geojson-vt) and renders only the tiles intersecting the
  viewport, so offscreen buildings are not *drawn*. The whole cell payload is
  still parsed and re-tiled on every `setData` (`realism/index.ts:329`), i.e.
  the cost is CPU/worker + shadow regeneration (`realism/index.ts:331-333`),
  not fill rate.

So: **acceptance "offscreen skipped" holds at the draw level today**, for both
source types. What the app loses is (a) the re-tiling/upload cost of the
whole cell union on each cell change, (b) shadow + collide recomputation over
all cached cells, and (c) any explicit viewport filter on its own layer.

## App-level precedent that already exists (recommendation basis)

- `perf/mapPerf.ts:117-139` — `setExtrusion` adds
  `["<=", ["distance", {Point at map centre}], limit]` to `building-3d`'s
  filter, re-centred on `moveend` after moving > limit/3
  (`perf/mapPerf.ts:142-145`), with a JSON round-trip check that falls back to
  the unfiltered layer if MapLibre rejects the expression
  (`perf/mapPerf.ts:134-137`). This is exactly the "viewport-bounds filter on
  the building source" pattern — it just isn't applied to
  `ndu-real-buildings`/`ndu-real-roofs`.
- `realism/index.ts:301-304` — the tile fallback already filters footprints to
  a ~1 km disc around the centre before adding them to the drawn set.
- `perf/scanGate.ts:14,30-58` — viewport-proximity gating of an expensive
  subsystem (three.js scans) by `moveend` distance; same trigger pattern the
  realism layer already uses (`realism/index.ts:372-381`).
- `props/lod.ts:43-103` — the three.js props layer does explicit
  view-cone + distance culling on the CPU, the opposite end of the spectrum
  from the MapLibre layers.
- Query-based visibility already used for taps: `queryRenderedFeatures` with
  `tappableBuildingLayers(map)` (`CityBuildings.tsx:961,1024`) and
  `realism/layers.ts:6-14` — so a rendered-feature visibility query is a
  supported, already-used API.

## Recommendations (read-only; not implemented in this branch)

1. **Distance filter on `ndu-real-buildings` / `ndu-real-roofs`** — mirror
   `perf/mapPerf.ts:130-132`: on `moveend` (reuse the existing settle timer at
   `realism/index.ts:372-380`) apply
   `["<=", ["distance", {Point: map.getCenter()}], R]` (R ~ 700–1000 m, beyond
   the ~330 m cell so at least the current + neighbour cells stay) via
   `setFilter` on the two layers created at `realism/index.ts:151-176`.
   Cheapest correct "offscreen skipped" for the app layer; keeps the covered-id
   hide filter logic at `realism/index.ts:337-338` untouched.
2. **Only submit visible-cell features in `redraw()`** — filter the merged
   `drawn` array (`realism/index.ts:319-328`) to features whose first ring is
   within the same radius before `setData` (`realism/index.ts:329`), reusing
   the `near()` predicate shape from `realism/index.ts:301-304`. This also
   shrinks the shadow pass (`realism/index.ts:331-332`) and
   `publishBuildings` (`:333`). Careful: collide needs approach space — keep
   the collision publication wider than the render filter (e.g. publish all
   drawn features, render a subset), or gate collide on the wider radius.
3. **`queryRenderedFeatures`-based visibility (only if a true viewport answer
   is needed)** — `map.queryRenderedFeatures(undefined, { layers: [...] })`
   returns features intersecting the *current* viewport (the API is already
   used at `CityBuildings.tsx:685,947,961,1024`); could drive marker/board
   culling (`paintBoards`, `CityBuildings.tsx:674-705`, already capped at 20
   each) or per-feature state. Not recommended for the extrusion layers
   themselves — options 1–2 are cheaper and continuous.
4. **Keep `minzoom` gates** — `REAL_BUILDINGS` `minzoom: 14`
   (`realism/index.ts:155`) and `loadCell`'s `map.getZoom() < 14.5` early-out
   (`realism/index.ts:341`) already skip far-zoom work; don't regress them when
   adding a filter.

## Notes / not done

- Read-only audit: **no rendering code changed**; only this doc was added.
- The automatic-culling claims for MapLibre vector tiles and GeoJSON sources
  are based on documented MapLibre/maplibre-gl rendering behaviour, not a
  measured in-browser experiment — no dev server was started (port 8080 is
  live) and no runtime measurement was taken.
- Line numbers are as of this branch's checkout of `citydesk` main
  (post go-live merge).
