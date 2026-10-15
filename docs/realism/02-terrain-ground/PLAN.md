# 02 · Real terrain and elevation, with everything clamped to the ground: plan

CityDesk / NDU · prepared Oct 10, 2026 (HST) · status: **plan only, no code changed**
Repo: `$CITYDESK_HOME` (studio `the primary host`), `main` = `42de1e4`, with 11 files uncommitted and live.
Companion files: `RESEARCH.md` (78 references) and `IMPLEMENT_PROMPT.md` (tickets for a coding agent).
Audit inputs: `/workspace/neura/CITYDESK_AUDIT_AND_REALISM_GAPS.md`, Part B ("Terrain" row) and prioritised gap #2.

---

## 0. TL;DR

The audit sized this as "S, 1–2 days: call `groundElevation()` everywhere". Reading the code shows that is about a third of the job:

1. **On Tier A today, the three.js layers are buried.** `scanLayer.ts:143` builds every scan matrix with `MercatorCoordinate.fromLngLat(…, 0)`. `life/lifeLayer.ts:16-21` (`mercatorAt` with `z: 0`) and `:103/:127` (`dummy.position.set(x, 0, -y)`) put every walker, car, keke, bus and blob shadow at **sea level**. MapLibre draws 3D terrain on Tier A (`immerse/terrain.ts:86`), and these layers share its depth buffer, so anything on ground higher than ~2 m (most of Honolulu inland, Punchbowl, Manoa, parts of Port Harcourt) is drawn **inside the hill**. You either can't see it or it pokes out as floating heads. Flat coastal Lagos hides the bug.
2. **DOM markers are already fine on Tier A.** MapLibre 5.6.1 places markers at the terrain height (`locationToScreenPoint(ll, terrain)`). That covers the YOU avatar (`CityBuildings.tsx:464`), the Tier C walker sprites (`:531`), shop boards and neighbours (`:644`, `:654`). Their only terrain problems are (a) `opacityWhenCovered` defaults to 0.2, so slopes can fade the avatar, and (b) **bridges**: a marker is pinned to the DEM, which is the valley floor under the bridge.
3. **`groundElevation()` is never called.** A grep for `groundElevation|queryTerrainElevation` finds only its definition (`immerse/terrain.ts:112`) and re-export (`immerse/index.ts:77`). It also returns `0` both for "no terrain" (Tier B/C → `null`) and for "DEM tile still loading", so callers can't tell sea level from unknown.
4. **Tier B and C are flat by design** (`terrain.ts:88`, "#119 Tier B: flat"). On a flat map, z=0 is correct for everything, so nothing floats there today. The realism gain on Tier B is to **add terrain only where the place is actually hilly** (relief gating), and to keep the flat path for flat cities and weak phones.
5. **Bridges, tunnels and stairs are the real work.** The basemap tiles already tell us which roads are bridges (`brunnel`, `layer` in OpenMapTiles `transportation`), but `life/tiles.ts:60` only drops tunnels and `paths.ts` (`fetchWays`) drops all tags except `highway`/`name`. On terrain, a bridge is draped onto the river bed, so we need our own deck heights (a profile solver) and, on Tier A, our own deck ribbons.

**Recommended approach:** a new pure `src/world/ground/` module (DEM decode, height cache, graph baking, profile solver, slope pose). Each subsystem asks it for heights using the rule **"anchor to what MapLibre draws, shape from our DEM"**. Everything ships behind a flag `ndu.ground` / `VITE_NDU_GROUND` in five phases. The MVP (phases 0–2) is about 4 dev-days; everything including bridges, Tier B relief gating and QA is about **10–12 dev-days**.

---

## 1. Ground truth: what exists today (verified file:line)

| Area | File:line | Today | Problem on terrain |
|---|---|---|---|
| DEM source and terrain | `src/world/immerse/terrain.ts:16-22, 39-93` | AWS Terrarium tiles. Tier A: `raster-dem` maxzoom 14 + `setTerrain({exaggeration:1})` + hillshade. Tier B: hillshade only (maxzoom 12). Tier C: none. After 6 errors it silently goes flat (#130). | Fine. Needs exported constants, a terrain on/off event, and relief gating. |
| Ground query | `src/world/immerse/terrain.ts:112-118` (`groundElevation`) | `map.queryTerrainElevation() ?? 0` | Never called. Can't tell unknown from 0. Depends on which tiles are loaded. |
| Map typing | `src/world/immerse/mapTypes.ts:14-18` | `setTerrain/getTerrain/queryTerrainElevation` optional | Missing `isSourceLoaded`, `setCenterElevation`, `setCenterClampedToGround`. |
| Scans (GLB) | `src/world/scanLayer.ts:142-151` (`matrixFor`), `:154-178` (`load`), `:305-325` (render) | Base re-centred to `-box.min.y` (`:165`) and translated to `fromLngLat(ll, 0)` | **Buried on Tier A.** No footprint-aware clamp on slopes and no re-clamp on DEM arrival. |
| Scan pose model | `src/world/scans.ts:18` (`ScanPose {lng,lat,rotation,scale}`), `:150` (update SQL), `migrations/0009_scan_assets.sql:14-17` | No altitude fields | Can't store "on a balcony / on the roof / offset +0.3 m". |
| Street life layer | `src/world/life/lifeLayer.ts:16-21` (`mercatorAt` z 0), `:103`, `:113-115`, `:127`, `:136-138`, `:175-178` | One custom layer, 7 draw calls, instanced at y=0 around graph origin | **Buried on Tier A.** Vehicles never pitch or roll. Shadows aren't on the slope. |
| Sim | `src/world/life/sim.ts:15-25` (`Agent rx/ry/rh`), `place()` ≈`:451-456`, walkers ≈`:395-401`, vehicles ≈`:432-435` | 2D (x east, y north) | No z, pitch or roll. |
| Graph | `src/world/life/graph.ts:15-48` (`Edge`, `Graph`), `along()` `:192-195`, steps vmax `:130` | 2D | No node heights, deck or layer. |
| Street data | `src/world/life/tiles.ts:56-75` (`p.brunnel==="tunnel"` dropped at `:60`), `life/parse.ts:131-158` (Overpass) | Bridges kept but flat | Bridge tags (`brunnel`, `layer`, `bridge`) are thrown away. |
| Avatar graph | `src/world/paths.ts:5` (`Way {points,name,kind}`), `fetchWays` ≈`:377-399` | Overpass `out geom` includes tags, but only `highway`/`name` are kept | Avatar walking a bridge or tunnel is pinned to the DEM. |
| Avatar + sprites | `src/world/CityBuildings.tsx:217` (`HUMAN_M`), `:454-464` (sized markers + player), `:492-498` (`placeRaw`), `:767-792` (`fit()`), `:889-981` (`step`) | DOM markers, sized per frame in metres via `map.project` | On terrain: correct, except bridge decks and `opacityWhenCovered`. `fit()` already measures px per metre at terrain height. |
| Follow camera | `src/world/orbit/follow.ts:56-268`, `orbit/streetCam.ts:16-73` | Rig maths assumes flat ground. MapLibre clamps the centre to terrain (default `centerClampedToGround`). | On a deck, the camera centre clamps to the valley under it. On steep uphill the eye can clip (MapLibre's `_elevateCameraIfInsideTerrain` helps). |
| Buildings | MapLibre `building-3d` + `realism/index.ts:116-138` (own `fill-extrusion` with `h`/`b`); `realism/heights.ts` `PLINTH_M = 0` | On terrain MapLibre lifts each footprint by the DEM at its centroid and sinks the base 10 m | OK. Our scans must use the same centroid convention so they sit level with neighbours. |
| Props | `src/world/props/propsCatalogue.ts`, `proceduralKit.ts` | Catalogue only; **no runtime renderer** (only tests and `perf/degradeLadder.ts` import them) | Provide `placeOnGround()` now so the props layer (gap #3) is born clamped. |
| Crowd / traffic libs | `src/world/crowd/boids.ts`, `crowd/types.ts`, `traffic/simTraffic.ts`, `traffic/types.ts` | Lat/lng-only libraries, **not wired at runtime**. The live crowd and traffic is `life/sim.ts`. | Add optional `altM` to their state types for API parity. No runtime work. |
| Perf | `src/world/perf/tier.ts`, `perfBudgets.ts:28-50` (A 80 draws / 200k tris / 60 fps; B 40 / 80k / 30; C 20 / 20k / 30), `docs/perf/PERF_BUDGETS.md` (memory < 250 MB, entry JS < 1.2 MB gz, three.js not in entry) | | The new module must stay out of the entry chunk and inside these budgets. |
| Render order | `src/world/render/ORDER.md` | basemap → roads → 3D buildings → three.js layers → labels → DOM | Bridge-deck ribbons go in the three.js slot. Hidden `bridge_*` style layers are reversible. |

Installed MapLibre facts (from `node_modules/maplibre-gl/dist`, see the end of RESEARCH.md): `queryTerrainElevation` gives `null` with no terrain and a flat 0 while a DEM tile loads. Terrain mesh is 128 per render tile. Fill-extrusion uses the centroid DEM, with the base lowered 10 m. Default marker `opacityWhenCovered` is 0.2. `setCenterElevation` and `setCenterClampedToGround` exist.

---

## 2. Goals, non-goals, success metrics

### 2.1 Goals
- **G1. Nothing floats and nothing sinks.** On any tier, the avatar, walkers, vehicles, blob shadows, scans and (future) props sit on the surface MapLibre actually draws, within tolerance.
- **G2. Real-world elevation.** Heights come from real DEM data (Terrarium; 3DEP in the US, SRTM elsewhere), with exaggeration 1, in metres. We keep a path to higher-resolution sources (Oahu 0.5 m lidar, NASADEM, Mapterhorn) as config, not code.
- **G3. Slopes read correctly.** Vehicles pitch and roll with the road. Walkers stay upright but their feet follow the slope. Shadows lie on the slope.
- **G4. Multi-level ways.** Bridges carry agents and the avatar at deck height, not the valley floor. Tunnels hide or ghost what is inside. Steps rise smoothly between landings.
- **G5. Stable.** No pop when DEM tiles arrive (eased re-clamp). Heights don't depend on camera zoom. Unknown means "keep the last good value", never 0.
- **G6. Cheap.** No extra draw calls on Tier B/C. Per frame, ground lookups are a lerp on pre-baked graph heights. The DEM cache is capped by memory budget.
- **G7. Reversible.** One flag turns it all off (`?ground=0`) and returns to today's behaviour byte for byte.

### 2.2 Non-goals (this feature)
- Physics collision with buildings (audit gap #1, separate plan). We only expose the same heightfield for it.
- Photoreal Google/Cesium tiles (gap #11, licence-blocked). We define the "clamp to max(terrain, tiles)" rule for later.
- Indoor multi-floor navigation (`level=*`). This stays excluded, as `tiles.ts:60` already does.
- Terrain editing or flattening the DEM under roads in the GPU mesh. We correct agent heights only, not MapLibre's mesh.

### 2.3 Success metrics (measured with the QA harness in §8)

| Metric | Tier A target | Tier B target (relief-gated terrain on) | Tier B/C flat |
|---|---|---|---|
| Foot to drawn-ground error, avatar and walkers within 150 m of camera (p95) | ≤ 0.15 m | ≤ 0.30 m | 0 (z = 0) |
| Vehicle wheel-contact error (p95) | ≤ 0.20 m | ≤ 0.35 m | 0 |
| Scan base to ground at footprint centroid | ≤ 0.10 m (+ user offset) | ≤ 0.25 m | 0 |
| Visible "pop" when a DEM tile lands (max per-frame vertical jump) | ≤ 0.05 m per frame (eased over 250 ms) | same | n/a |
| Bridge deck agents: height above draped valley (Honolulu H-1 viaducts, Lagos Third Mainland) | deck ± 0.5 m of the abutment-interpolated profile | same | n/a |
| Added CPU per frame (life + scans + avatar) | ≤ 0.6 ms desktop | ≤ 1.0 ms mid Android | ≤ 0.05 ms |
| Added draw calls | ≤ +2 (deck ribbons) | ≤ +1 | 0 |
| Added memory (DEM cache + baked graph) | ≤ 12 MB | ≤ 5 MB | ≤ 0.5 MB |
| Added entry JS | 0 bytes (all lazy) | 0 | 0 |
| Fps regression in `perf-measure.mjs --soak 60` | ≤ 2 fps | ≤ 1 fps; degrade ladder rung unchanged | none |
| Tests | New `ground.test.ts` ≥ 40 asserts green; `tsc --noEmit` 0 errors; existing world suites green | | |

---

## 3. Architecture

```
                    ┌────────────────────────── src/world/ground/ (new, own lazy chunk) ──────────────────────────┐
 AWS Terrarium  ──► │ heightCache.ts  (fetch → createImageBitmap → OffscreenCanvas → decode, LRU, version++)      │
 (same URLs as      │      ▲  pure: terrarium.ts (decode, tile maths, bilinear, normal, min/max)                  │
  immerse/terrain)  │      │                                                                                       │
                    │ provider.ts  GroundProvider { heightAt, normalAt, anchorAt, mode(), version, subscribe }    │
 MapLibre map  ───► │      • mode "terrain3d"  (Tier A, or Tier B relief-gated): anchor = map.queryTerrainElevation │
 (terrain events)   │      • mode "flat"       (Tier B/C, flag off): every height = 0 (today's behaviour)          │
                    │ profile.ts  (pure) bake node/edge heights; bridge/tunnel/steps solver; grade + clearance   │
                    │ pose.ts     (pure) vehicle pitch/roll from 4 contacts; walker foot height; easing          │
                    │ relief.ts   (pure) relief/roughness score → should this place get 3D terrain?               │
                    │ probe.ts    tiny no-draw custom layer caching mainMatrix → projectAlt(lng,lat,alt) for DOM  │
                    │ flag.ts     ?ground=0|1, localStorage ndu.ground, VITE_NDU_GROUND                           │
                    └──────────────────────────────────────────────────────────────────────────────────────────────┘
        consumers:  immerse/terrain.ts (gating + events) · scanLayer.ts (matrix altitude, footprint clamp)
                    life/{graph,sim,lifeLayer,index,tiles,parse}.ts (baked z, pitch/roll, decks)
                    CityBuildings.tsx (avatar deck offset, marker opacity) · orbit/follow.ts (deck camera)
                    paths.ts (bridge/tunnel tags on the avatar net) · props/ (placeOnGround for gap #3)
```

### 3.1 The rule: anchor to what is drawn, shape from the DEM
Two height sources disagree in small, predictable ways:
- **Drawn ground** (`map.queryTerrainElevation`). It is exactly what the user sees, but it is 0 while a tile loads, depends on the loaded zoom, and is `null` on flat tiers.
- **DEM ground** (our CPU cache at a fixed z14, or z15+ where we self-host). It is deterministic, works off-screen and in workers, and has a real "not loaded" state.

Each **cluster** (the life layer around its graph origin, each scan, the avatar) gets an **anchor** from drawn ground at one point. Everything inside the cluster is offset by **DEM deltas** from that point: `z_i = anchor + (dem(p_i) − dem(p_anchor))`. While the drawn tile is still flat (returns 0 at a point where the DEM says 40 m), the anchor is 0 and the deltas keep relative shape, so the cluster sits correctly on the temporarily flat terrain. When the tile lands, the anchor moves to 40 and we ease it over 250 ms. This is the Cesium "most detailed sample against rendered sample" split (RESEARCH #39–42) and the GTA `found` flag (#51) combined.

### 3.2 Modes
| Mode | When | Heights |
|---|---|---|
| `off` | flag off, `?ground=0`, `?immerse=0`, or the immerse Effects switch off | Today's behaviour exactly (z = 0, markers untouched) |
| `flat` | Tier C; Tier B where relief gating says "flat"; terrain dead after 6 errors (#130) | z = 0 for everything; graph heights not baked (saves CPU) |
| `terrain3d` | Tier A (terrain on), or Tier B where relief gating allows "terrain-lite" (Phase 4) | anchor + DEM deltas; decks; pitch and roll |

The provider emits `ndu-ground` (a CustomEvent, the same pattern as `ndu-stand` in `CityBuildings.tsx:957`) whenever the mode or DEM version changes. Consumers re-bake.

---

## 4. Data model

### 4.1 Client types (new `src/world/ground/types.ts`)
```ts
export type GroundMode = "off" | "flat" | "terrain3d";
export type Encoding = "terrarium" | "mapbox";
export type HeightSample = { h: number; ok: boolean; src: "map" | "dem" | "flat" | "last" };
/** Cesium-style vocabulary (RESEARCH #38). */
export type AltMode = "ground" | "relative" | "absolute";
export type DemTile = { z: number; x: number; y: number; size: number; h: Float32Array; min: number; max: number };
export type DeckKind = "ground" | "bridge" | "tunnel" | "steps" | "passage";
/** Per-edge vertical info baked onto life/graph.ts edges and paths.ts segments. */
export type EdgeZ = { deck: DeckKind; layer: number; za: number; zb: number; zs?: Float32Array; stepM?: number };
```

### 4.2 Graph additions (`life/graph.ts`)
- `Graph.nodeZ?: Float32Array`: DEM height per node (m above sea level), from the cache. NaN means unknown.
- `Edge.deck: DeckKind` (default `"ground"`), `Edge.layer: number` (default 0), `Edge.zs?: Float32Array` (heights every ≤ 10 m along long edges, or the solved deck profile).
- `Graph.zVersion: number`: the DEM version used for the bake. Re-bake when the provider version moves (debounced 300 ms).
- `along()` stays 2D. A new `alongZ(g, e, s): number` lerps `zs` (or `nodeZ[a] → nodeZ[b]`).

### 4.3 Sim additions (`life/sim.ts`)
- `Agent.rz` (smoothed rendered height, m), `Agent.pitch`, `Agent.roll` (radians; walkers keep 0).
- `place()` gains a `z` argument and smooths it with the same `k` as x/y, so vertical motion is as smooth as horizontal.

### 4.4 Street data
- `life/parse.ts` `LRoad` and `LWalk` gain optional `deck?: DeckKind`, `layer?: number`, `incline?: string`, `stepCount?: number`, `ele?: [number|null, number|null]`. `parseStreets` reads `bridge`, `tunnel`, `layer`, `incline`, `step_count`, `covered`. `streetsQuery` (`parse.ts:161-170`) already uses `out tags geom`, so no query change is needed.
- `life/tiles.ts` reads `p.brunnel` (`bridge` → deck "bridge", `tunnel` → still dropped for the crowd, `ford` → ground) and `p.layer`.
- `paths.ts` `Way` gains optional `deck?: DeckKind; layer?: number` from the Overpass tags it already receives (`fetchWays`). `Net` gains `deck?: DeckKind[]` per segment, parallel to `kind` (`buildGraph` at `paths.ts:77-118`).

### 4.5 Scans (Postgres, migration `0018_scan_ground.sql`, additive and idempotent)
```sql
alter table scan_assets add column if not exists alt_mode text not null default 'ground'
  check (alt_mode in ('ground', 'relative', 'absolute'));
alter table scan_assets add column if not exists alt_m double precision not null default 0;   -- offset (ground/relative) or MSL metres (absolute)
alter table scan_assets add column if not exists ground_m double precision;                   -- last DEM ground at placement (analytics/QA only, never used for render)
```
- `ScanPose` (`scans.ts:18`) gains optional `altMode?: AltMode; alt?: number`. `toAsset` maps them. `setScanPose` validates `alt` in [-50, 500] and `altMode` in the enum. `scan-schema.server.ts:28` and `scans.ts:107` `COLS` gain the columns, keeping the existing "merge guard" so a DB without 0018 still works.
- Default `ground` + `alt 0` means old rows render exactly as the new clamped default.
- The migration is picked up by `scripts/migrate.mjs`, which `run-citydesk.sh` already runs on start.

### 4.6 Caches
- **DEM cache:** LRU of `DemTile` keyed `z/x/y`. Each 256² tile is a Float32Array of 256 KB. Caps: Tier A 40 tiles (≈ 10 MB), Tier B 16 (≈ 4 MB), flat 0. The browser HTTP cache already has the PNGs (MapLibre requested the same URLs), so re-fetches are usually free.
- **No server cache needed.** Optionally (P4) add a static self-hosted PMTiles DEM for the demo wards under `public/dem/` or a CDN. That isn't Postgres data, so it isn't in the DB.

---

## 5. Algorithms

### 5.1 DEM decode and sampling (`terrarium.ts`, pure)
- Decode: `h = R*256 + G + B/256 − 32768` (Terrarium) or `−10000 + (R*65536 + G*256 + B)*0.1` (Mapbox), checked by round-trip tests against the joerd example `rgb(137,219,68) → 2523.265625`.
- Tile maths: Web-Mercator `lng/lat → (x, y)` at zoom `z` in tile pixels (same formula as `lifeLayer.ts:mercatorAt`, scaled by `2^z · 256`).
- **Bilinear** sample with clamped edges. Pixel centres are at +0.5, matching MapLibre `getDEMElevation`. Neighbour tiles are used for edge pixels when cached, otherwise clamp.
- Normal: central differences over ±1 px, with metres per pixel `= 40075016.686·cos(lat) / (256·2^z)`. Gives slope degrees and aspect.
- Per-tile `min/max` for relief gating and quick rejects.
- Zoom choice: z14 by default, the same as the Tier A `raster-dem` maxzoom (`terrain.ts:88`), so DEM and drawn ground use the **same pixels**. The z15 Terrarium tiles exist on AWS, but MapLibre wouldn't draw them unless we raise maxzoom. Keep them aligned.

### 5.2 Provider and anchoring (`provider.ts`)
```
heightAt(lng,lat): HeightSample      // DEM; ok=false if tile not cached → returns last value for this cell, src "last"
anchorAt(lng,lat): HeightSample      // terrain3d: map.queryTerrainElevation; flat/off: {h:0, ok:true, src:"flat"}
clusterZ(anchorLL, pts[]): Float32Array  // anchor + (dem(p) − dem(anchor)); NaN-safe
```
- "Drawn tile loaded" is detected as `queryTerrainElevation(p) === 0 && dem(p).ok && |dem(p)| > 1` → treat the drawn value as not loaded, and keep the previous anchor (or the DEM value if there's no previous one and the DEM tile is old enough that MapLibre will have it soon). Cross-check with `map.isSourceLoaded("ndu-dem")` when available.
- **Eased re-anchor:** `anchor += (target − anchor)·(1 − e^(−dt/0.25 s))`, with a snap if |Δ| > 30 m (teleport or relocation).
- Exaggeration: read `map.getTerrain()?.exaggeration ?? 1` and multiply DEM heights by it. We keep 1, but guard anyway.
- Fetch triggers: on `moveend` (same cadence as `immerse/index.ts:174-179`), prefetch DEM tiles covering the life focus radius (`life/index.ts:99-101`, up to 420 m) plus every placed scan within 1.5 km (the `scanGate` radius). That is usually 1–4 z14 tiles per city view.
- Worker: decode in a `new Worker(new URL("./demWorker.ts", import.meta.url), {type:"module"})`. Fallback to the main thread with `OffscreenCanvas` or a 2D canvas. Decoding one 256² tile on the main thread costs about 2–4 ms on a mid phone, so the worker matters on Tier B.

### 5.3 Graph baking (`profile.ts`, pure)
For every node: `nodeZ[n] = dem(node)`. For every edge longer than 12 m: `zs` holds samples every ≤ 10 m. Then a **light smoothing pass along connected ground edges** (1D Gaussian, σ = 8 m, preserving endpoints at bridge abutments). This removes the SRTM/DSM "roof bumps" (RESEARCH #8, #12) that would otherwise make walkers bob on flat streets in dense wards. Smoothing only touches `ground` edges, never steps. Cost: about 1.5k nodes × 1 sample plus about 3k edge samples, which is < 2 ms per bake. It runs only on graph build and on DEM version change.

Per frame, `alongZ()` is one lerp per agent: 72 walkers + 40 vehicles × 1 lerp each, which is negligible.

### 5.4 Bridges, tunnels, steps (the vertical profile solver)
Input: connected chains of edges with the same `deck` and way id, plus their non-deck neighbours.

**Bridges** (`deck = bridge`, also `bridge=viaduct|boardwalk`):
1. Find the abutments: the first and last chain nodes that touch a `ground` edge. Their heights come from the (smoothed) DEM, `z0` and `z1`.
2. Initial deck: a linear interpolation between `z0` and `z1` along the arc length.
3. Constraints at **crossings** under the deck. A crossing is a `ground` edge or waterway whose 2D segment intersects a deck segment, with a lower `layer`. Required clearance: road or rail 5.0 m, footway 2.6 m, water 0.8 m (configurable). Also `deck ≥ dem + 0.5 m` everywhere along the span (never under the valley surface).
4. Grade limit: |dz/ds| ≤ 6% for roads, 8% for footways, 12% for `boardwalk`. If the constraints force a raise, extend a ramp onto the adjacent ground edges marked `embankment=yes`, or `layer ≥ 1` without `bridge` (approaches). Otherwise spread the raise across the span with a smooth max (an iterative "relax to constraints" loop of ≤ 20 passes; deterministic and pure).
5. `ele` tags on nodes (RESEARCH #71) are hard constraints when present.
6. Output: `zs` per deck edge, `deck = bridge`.

**Tunnels** (`tunnel=yes`, not `building_passage`/`culvert`): the profile is a linear interpolation between the portals, clamped to `≤ dem − 3 m` mid-span. The crowd already skips tunnels (`tiles.ts:60`). For the avatar net (`paths.ts`), mark the segments `deck = tunnel`. When the avatar is in one, set the YOU marker to "ghost" (`opacity 0.35`, a "In tunnel" plate) and leave the camera at the portal elevation. `tunnel=building_passage` → `deck = passage` → treat it as ground.

**Steps** (`highway=steps`): `nodeZ` from the DEM at both ends. If |Δz| < `step_count × 0.12 m` (the DEM is too coarse to see the flight), use `Δz = step_count × 0.17 m`, with the sign from `incline` (`up` = rising along the way direction). Keep the `pace(kind)` slow-down (`paths.ts:430-431`) and the `vmax 0.7` for steps (`graph.ts:130`). Render as a smooth ramp. Visible step-by-step bobbing is a Phase 5 nicety.

**Fords** (`brunnel = ford`): ground.

**Indoor and `level`:** stay excluded (`tiles.ts:60`).

### 5.5 Vehicle pitch and roll, walker feet (`pose.ts`, pure)
- Vehicles: sample `alongZ` at front and rear axle (±0.35·len along the edge, crossing edge joints with `nextDrive` lookahead when needed) and at left and right wheel track (±width/2 laterally, using `dem` deltas). Then `pitch = atan2(zf − zr, wheelbase)` and `roll = atan2(zl − zr, track)`, both clamped to ±14°, and smoothed with τ = 0.2 s. `rz` = mean of the four contacts. Dimensions come from `traffic/types.ts VEHICLE_DIMENSIONS` (car 4.5×1.8, keke 2.6×1.3, bus 10.5×2.5, danfo 5.2×2.0).
- Walkers: `rz = alongZ`, upright (no pitch). On slopes > 8°, lean the torso 30% of the slope via the existing gait shader? No: keep it upright, the way AAA crowds do it (RESEARCH #53). Feet stay planted because the bilinear surface is smooth at the 1.75 m scale.
- Blob shadows (`lifeLayer.ts:113-115, 136-138`): place them at `rz + 0.03 m`, oriented to the ground normal from `normalAt`. Stretch them along the sun vector (realism palette) later.

### 5.6 Scans on slopes (`scanLayer.ts`)
- Footprint: after `load()` we know `size [x,y,z]` (`scanLayer.ts:164-172`). Sample the DEM at the 4 rotated, scaled footprint corners and at the centre.
- `alt_mode = ground` (default): base z = `anchorAt(centre) + alt` (the centroid convention, the same as MapLibre's buildings, so a scanned shed sits level with the house next to it). If the corner spread is > 0.5 m, drop the base to `min(corners)` and show a **plinth** (a thin dark box from min to centre height, scaled to the footprint, in the scan scene) so no corner floats. This mirrors `realism/heights.ts` `PLINTH_M` intent (#89).
- `relative`: `anchorAt(centre) + alt` with no plinth (for balconies or roofs; the user nudges `alt`).
- `absolute`: `alt` is metres above sea level (survey-grade placement).
- The matrix becomes `fromLngLat([lng,lat], baseZ)` (RESEARCH #22, #23). Re-run `matrixFor` for every shown entry when the provider version changes, and once per second while any anchor is still easing.
- Draft placement: the `ScanDesk` height nudge (± 0.1 m, ± 1 m) goes through the existing `adjust()` path and `writePose`. Show "Ground +0.3 m" in the size note.

### 5.7 Relief gating and DSM hygiene (`relief.ts`)
- Relief score for a 1.2 km window around the view centre: `R = p95(h) − p5(h)` and roughness `S = p90(slope°)` from cached tiles.
- Tier A: terrain always on (today), but if `R < 4 m && S < 2°` (flat Lagos Island), **keep 3D terrain off** and use the `flat` mode. This saves GPU, avoids SRTM roof bumps lifting whole blocks, and changes nothing visually. Hysteresis: turn back on above `R > 6 m`.
- Tier B (Phase 4): `terrain3d` "lite" only if `R ≥ 12 m || S ≥ 4°` **and** the fps probe is ≥ 40. Use a DEM `maxzoom 12` (the hillshade source already loaded, `terrain.ts:44-52`), so it's zero extra network.
- Tier C: never.

### 5.8 Avatar on decks and the DOM probe (`probe.ts`)
MapLibre markers can't take an altitude. For the YOU marker (and later the shop boards) on a `bridge` segment:
1. `probe.ts` adds a no-draw custom layer `ndu-ground-probe` (renderingMode `3d`, `render` only copies `defaultProjectionData.mainMatrix` into a Float64Array).
2. `projectAlt(lng, lat, alt)` uses `MercatorCoordinate.fromLngLat(ll, alt)` and that matrix to get a clip position, then screen pixels.
3. Offset = `projectAlt(deckZ) − map.project(ll)` (the ground point the marker is already at). Apply `marker.setOffset([0, dy])`, eased.
4. The camera: while on a deck, `map.setCenterClampedToGround(false)` and pass `elevation: deckZ` in the follow `jumpTo` (`follow.ts:250`). Restore clamping when back on ground.
5. `fit()` (`CityBuildings.tsx:767-792`) keeps measuring px per metre at the marker's own ground point. On a deck that slightly over-estimates size (the deck is closer to the camera), which is acceptable. Optionally measure at the probe position.

### 5.9 Marker coverage (`CityBuildings.tsx:464`)
Create the player marker with `opacityWhenCovered: 0.85`, and neighbours with 0.5. On slopes the depth test at the anchor pixel can flag the avatar as covered by its own hillside. Only Tier A is affected.

### 5.10 Camera on slopes (`orbit/streetCam.ts`, `follow.ts`)
No rig change is needed, because MapLibre clamps the centre to terrain and `_elevateCameraIfInsideTerrain` protects the eye. Add a check: if `queryTerrainElevation(eye footprint) > eyeAlt − 1.5`, raise the rig eye for that frame (cap +8 m) to avoid clipping when walking down into a valley with a hill behind. This is pure maths in `streetCam.ts` with a unit test.

---

## 6. Performance budgets

| Item | Desktop Tier A | Flagship phone Tier A | Mid phone Tier B (terrain-lite) | Tier B flat / C |
|---|---|---|---|---|
| DEM tiles resident | ≤ 40 (10 MB) | ≤ 24 (6 MB) | ≤ 16 (4 MB) | 0 |
| Tile decode | worker, ≤ 3 ms each, ≤ 4 per `moveend` | worker | worker, ≤ 2 per `moveend` | none |
| Graph bake | ≤ 3 ms on build / version | ≤ 5 ms | ≤ 8 ms, chunked across frames | skipped |
| Per-frame life (72 W + 40 V) | ≤ 0.25 ms (lerps + 4-contact vehicles) | ≤ 0.4 ms | ≤ 0.6 ms (28 W + 20 V) | 0 |
| Per-frame scans | ≤ 0.05 ms (matrix only on change) | same | same | 0 |
| Avatar probe | ≤ 0.05 ms (one projection) | same | same | 0 |
| Profile solver | ≤ 4 ms per graph, on build only | ≤ 6 ms | ≤ 10 ms, chunked | skipped |
| Draw calls added | +1 deck ribbons, +1 scan plinths (instanced) | +2 | +1 (decks only within 250 m) | 0 |
| Triangles added | ≤ 6k (decks + railings) | ≤ 4k | ≤ 2k | 0 |
| JS chunk | `ground` lazy chunk ≤ 12 kB gz, loaded with `life` or `scanLayer`, never in entry (`perf-budget.mjs` gate) | | | |

All within `perfBudgets.ts:28-50` (A 80 draw calls / 200k tris; B 40 / 80k) with the current 7 life draw calls plus scans. The degrade ladder (`perf/ladder.ts`, `degrade.ts`) gets **no new rung**. Instead, the "skinned count" rung halving the crowd also halves vehicle 4-contact sampling (it uses the centre contact only at rung ≥ 3).

---

## 7. Edge cases

1. **DEM tile not loaded (drawn).** `queryTerrainElevation` returns 0. Handled by the §3.1 anchor rule plus easing, never trusting 0 when the DEM says otherwise.
2. **DEM tile not loaded (CPU).** `ok=false`. Use the last value for that 10 m cell, otherwise the graph mean, otherwise 0 in flat mode only.
3. **Terrain source dies** (#130, 6 errors → `removeAll`). The provider gets `mode = flat`. Every consumer re-bakes to z=0 in one frame (the snap is acceptable since terrain also vanished).
4. **Tier change at runtime** (`onTier`: ladder or memory watchdog → Tier C). Switch to flat mode and free the DEM cache.
5. **Effects off** (`immerse` bubble, `ndu.immerse.off`). Terrain is removed (`immerse/index.ts:164`), so ground mode is flat.
6. **Teleport or relocation** (GPS fix, saved spot, trip arrival, `follow.ts` `TELEPORT_M = 40`). Snap the anchors with no easing. Prefetch DEM at the destination before `jumpTo` when possible.
7. **Sea and bathymetry.** Terrarium has negative heights offshore (ETOPO1). Clamp agent and scan ground to `max(h, 0)` over water polygons. Boats are out of scope, and the wharf is an `man_made=pier`, treated as ground or a bridge.
8. **Cliffs and retaining walls.** A 30 m DEM smooths a 6 m wall into a 30 m ramp. Agents on the walk graph follow the graph. Free-walk avatar off the graph uses the walkable-angle rule (≤ 35°, RESEARCH #56, #58). Steeper means stop and slide along it.
9. **DSM roof bumps** (SRTM, Copernicus). Use graph smoothing (§5.3) plus relief gating (§5.7). Never use Copernicus/FABDEM without a licence review.
10. **Bridges without crossings** (over a dry gully). Linear abutment profile plus `≥ dem + 0.5 m`.
11. **Bridges whose ends are clipped by the tile buffer** (`tiles.ts` stitching). If one abutment is missing, use the DEM at the clipped end plus `layer × 5 m` as a weak prior, and mark it "approximate" in the dev HUD.
12. **Long viaducts** (Lagos Third Mainland Bridge, ~11.8 km). The chain extends beyond the 520 m tile window. Use the in-window ends plus a crossing clearance over water (0.8 m) and `≥ dem + 0.5`. Visually fine at street scale.
13. **Stacked interchanges** (`layer` −1…+3). Sort by `layer`. The upper deck must clear the lower deck's profile by ≥ 5 m at crossings. Solve lower layers first.
14. **Tunnels under hills.** Hide crowd agents (already). The avatar is a ghost. The camera stays above ground.
15. **`tunnel=building_passage` and `covered=yes`.** These are ground. Don't hide.
16. **Steps with no `incline` tag.** Use the DEM sign, and if |Δz| < 0.3 m use `step_count`. If there's no `step_count`, leave it flat.
17. **Antimeridian and polar latitudes.** CityDesk cities are at 6–21° N. Still clamp `lat` to ±85° in the tile maths (`scans.ts` already validates −85…85).
18. **Exaggeration ≠ 1** (a future "dramatic" toggle). Multiply DEM by `exaggeration`, and keep building and scan heights unexaggerated above their base.
19. **Scans over steep ground** (corner spread > 3 m). The plinth would be ugly, so warn in the ScanDesk ("Steep spot: base adjusted") and suggest `relative` mode.
20. **Scans with arbitrary origins** (a model whose `box.min.y` is a stray vertex). Optional: use the 2nd percentile of vertex heights instead of `box.min.y` (`scanLayer.ts:165`) via a three-mesh-bvh-free percentile pass over position attributes. Cheap and done once per load.
21. **Draft scan dragged across a hill.** Re-clamp on every `moveDraft` (`scanLayer.ts:253-264`) using the CPU DEM (no easing while dragging).
22. **Avatar on a deck edge then free-walks off** (`CityBuildings.tsx:972-979` off-net path). Leave the deck. If the deck-to-ground drop is > 1.5 m, block that step (no walking off bridges) until the collision plan lands.
23. **Saved spot inside a tunnel or on a deck.** On relocate (`:591-599`), snap the pose (`snapPose`). If it's a deck segment, use the deck z.
24. **Reduced motion.** No easing animations; snap anchors (as `follow.ts` already does for camera).
25. **Headless QA with SwiftShader** (Tier C forced). Test Tier A with `?tier=A`. Terrain renders slowly but correctly, and the metrics read from `window.__nduGround`.
26. **CORS or blocked S3** (corporate networks). The terrain already fails silently. The CPU cache shares the URLs, so the same fallback happens: flat mode. Add the EU mirror and Mapterhorn as optional fallbacks (config only).
27. **Precision.** Mercator altitude units at 21° N are ≈ 2.7e-8 per metre. Matrices are composed in float64 on the CPU (three.js Matrix4) with a local origin per cluster, so no z-fighting. Shadows sit at +3 cm with `depthWrite:false` (already so).

---

## 8. Testing strategy

### 8.1 Unit tests (node `--experimental-strip-types`, no DOM; new `src/world/ground/ground.test.ts`, script `test:ground`)
- Terrarium and Mapbox decode round-trips (joerd example, 0 m, −10 m, 8848 m).
- Tile maths: known lng/lat → z14 tile and pixel (Honolulu Aloha Tower, Lagos CMS, PH Garden City), both directions within 1e-9.
- Bilinear sampling on a synthetic ramp and saddle tile, so values match the analytic surface within 1e-6. Edge clamping is correct.
- Normal and slope on a 10% synthetic ramp give 5.71°.
- Anchor rule: drawn 0 + DEM 40 → keep last anchor. Easing converges in 1 s within 1 cm. Snap when > 30 m.
- Graph bake: `nodeZ` length, NaN handling, smoothing keeps abutments, and smoothing doesn't touch steps.
- Profile solver: (a) a flat bridge over a 10 m valley stays linear between abutments; (b) a bridge over a road gets ≥ 5 m clearance at the crossing and grade ≤ 6%; (c) an `ele` constraint is honoured; (d) a two-layer interchange: upper clears lower by ≥ 5 m; (e) a tunnel ≤ dem − 3 m; (f) steps with step_count 20 and incline up give Δz = 3.4 m.
- Pose: a car on a 10% grade gives pitch 5.71° ± 0.1, roll 0 on a symmetric road, and the ±14° clamp.
- Relief gating: a flat Lagos-like synthetic tile gives flat mode. A Honolulu-like tile (0→120 m in 1 km) gives terrain. Hysteresis works.
- Flag parsing: `?ground=0|1`, localStorage, and the VITE env, in the same shape as `immerse/flag.ts`.
- Scan pose: alt validation bounds; `toAsset` maps nulls to the defaults.
- `streetCam.ts` eye-clip helper (extend `orbit/orbit.test.ts`).
- Life additions: extend `life/life.test.ts` for `parseStreets` reading `bridge/tunnel/layer/incline/step_count`, `streetsFromTiles` reading `brunnel/layer` (mock `TileMap`), `alongZ` lerp, and `place()` smoothing z.

### 8.2 Golden data tests
- `src/world/ground/fixtures/`: three tiny 16×16 Terrarium PNGs encoded as base64 JSON arrays (no binary files): Punchbowl slope, Lagos flat, PH riverbank. Plus one Overpass JSON snippet with a real bridge (H-1 over Nuʻuanu Stream) and steps. Fixtures stay under 30 kB total.

### 8.3 Browser QA (Playwright already in devDependencies; `scripts/browser-smoke.mjs` pattern)
- A dev handle `window.__nduGround = { mode, version, heightAt, anchorAt, stats(), probe(ll) }`, dev only, like `__nduLife` (`life/index.ts:359-406`).
- `scripts/ground-qa.mjs` (new, read-only against the running dev server):
  - `?tier=A&ground=1` at Honolulu Punchbowl (21.3155, −157.8464), z 18, pitch 60. For 20 walkers and 10 vehicles, compare `rz` against `map.queryTerrainElevation` at their spot. Assert p95 ≤ 0.15 m.
  - Same spot with `ground=0` gives the baseline (documents the "buried" bug: p95 error ≈ local elevation).
  - Bridge spot (H-1 viaduct near Kapālama). Deck agents are ≥ 4 m above the DEM.
  - Lagos Island: mode is flat (relief gate), with no terrain source after gating.
  - Screenshots before and after into `/tmp/ground-qa/` (not committed).
- `perf-measure.mjs --soak 60` with `?tier=A&ground=1` and `?tier=B&ground=1`. The fps delta stays within §2.3. The degrade ladder doesn't step.

### 8.4 Manual checks
- Phone (Tier B real device): walk Punchbowl with Effects on and off; toggle `?ground=0/1`.
- Place a scan on a slope: no floating corners, plinth visible, nudge ± works, persists after reload.
- Hail a ride over a bridge (`transit.ts` `takeRide` → first-person camera): the camera rides the deck.

### 8.5 Regression gates (must stay green)
`npm run typecheck`, `npm run test:immerse`, `test:life`, `test:realism`, `test:search`, `test:kids`, and the direct node runs of `src/world/{orbit,perf,crowd,traffic,props,buildings,placement}/*.test.ts`. The 14 known script-test failures (`grok-pwa-plugin`, `check-auth-invariant`, `browser-smoke-verdict`) are pre-existing. Don't count them, and don't "fix" them in this branch.

---

## 9. Phased rollout behind the feature flag

Flag `src/world/ground/flag.ts` (a copy of the `immerse/flag.ts` shape):
- Hard switch: `VITE_NDU_GROUND=off` or `?ground=0` means nothing loads.
- Soft switch: `localStorage["ndu.ground"] = "1" | "0"`. Default **off** in P0–P2 (dev opt-in with `?ground=1`), **on for Tier A** in P3, and on for relief-gated Tier B in P4.
- `ground` also requires `immerseAllowed()` and Effects on, because terrain lives there.

| Phase | Scope | Exit criteria | Effort |
|---|---|---|---|
| **P0 Prep** | Branch `feat/ground-clamp` from current `main` (don't touch the 11 uncommitted live files except through their own edits). Back up the files to be edited. Add the flag, types and an empty provider (mode always `off`). Export `TILES`, `DEM`, `DEM_HS` from `immerse/terrain.ts`. Add `ndu-ground` events from `attachTerrain` (terrain on/off). | `tsc` 0 errors; flag off means a byte-identical render | 0.5 d |
| **P1 Core** | `terrarium.ts`, `heightCache.ts` (+ worker), `provider.ts`, `relief.ts`, `pose.ts`, `profile.ts` (ground smoothing only), `ground.test.ts` (≥ 30 asserts), `GROUND.md`. Fix `groundElevation()` to return a `HeightSample` via the provider (keep the old signature as a deprecated wrapper). | Unit tests green; `__nduGround.heightAt` matches `queryTerrainElevation` within 0.1 m at 10 Honolulu points (Tier A) | 1.5 d |
| **P2 Clamp (MVP)** | `scanLayer.ts` altitude, footprint clamp, re-clamp on version. `life/graph.ts` nodeZ/zs, `sim.ts` rz/pitch/roll, `lifeLayer.ts` altitude origin + instance y + vehicle pitch/roll + sloped shadows, `life/index.ts` wiring + `anchorOf` with height. Player marker `opacityWhenCovered`. | QA p95 targets met on Tier A at Punchbowl. No perf regression. Flag default still off. | 2 d |
| **P3 Multi-level** | Tags through `parse.ts`, `tiles.ts` and `paths.ts`. Profile solver for bridges, tunnels and steps. Deck ribbons (instanced, in the life layer scene, ≤ 250 m) and hiding the style `bridge_*` layers on Tier A while decks are drawn (restore on dispose). `probe.ts` + avatar deck offset + follow camera elevation. Migration 0018 + `ScanPose` alt + ScanDesk "height" nudge. **Flag default on for Tier A.** | Bridge QA passes; tunnel ghosting works; scan alt persists | 3 d |
| **P4 Tier B + data** | Relief-gated Tier B terrain-lite (maxzoom 12), with Tier A flat-gating for flat cities. Optional data upgrade: build script `scripts/dem/build-tiles.md` (doc only) for Oahu lidar → Terrarium z17 PMTiles (rio-rgbify + pmtiles), plus config for Mapterhorn or the EU mirror. Licence note for Wei (Copernicus, FABDEM, Open-Meteo-style decision). | Tier B soak ≥ 30 fps on the mid-Android profile with terrain-lite at Punchbowl. Lagos gated flat. | 1.5–2 d |
| **P5 Polish + rollout** | Eye-clip camera helper, eased re-anchor tuning, dev HUD row in `perf/hud.ts` (mode, tiles, bake ms, max error), docs (`IMMERSE.md`, `LIFE.md`, `ORDER.md`, `PERF_BUDGETS.md`), ground-qa script, final perf measurement log. | All §2.3 metrics recorded in the PR body | 1.5 d |

**Total: ≈ 10–11.5 dev-days** for one agent (MVP P0–P2 ≈ 4 d).
Rollback at any phase: set `localStorage ndu.ground=0`, use `?ground=0`, or ship `VITE_NDU_GROUND=off` in `$CITYDESK_OPS/app.env` and restart the `citydesk` pm2 app only.

---

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Live repo has 11 uncommitted files edited by other agents (`paths.ts`, `places.ts`, `WorldMap.tsx`…) | High | Merge conflicts or lost work | Branch from the current working tree only after a `git stash list`/`git diff` snapshot backup. Touch `paths.ts` in one small hunk (`Way` tags) in P3. Coordinate through `AGENTS.md`. Never `reset --hard`. |
| Vite dev server is live (pm2 runs `vite dev`): half-saved files crash HMR (seen in `citydesk.err.log`) | High | Visible errors for users | Write new files fully before importing them. Edit one file per save. Keep the flag default off until P3. Run `tsc` before every restart. |
| MapLibre internals (flat-DEM-while-loading, 10 m base offset) change in a minor upgrade | Medium | Small offsets | Pinned to `^5.6.1`. The provider only uses public APIs (`queryTerrainElevation`, `isSourceLoaded`, `setCenterElevation`). A unit test documents the assumptions, and the QA script measures the real error. |
| SRTM/DSM noise in Lagos and PH makes walkers bob | Medium | Looks cheap | Graph smoothing σ 8 m plus relief gating. Evaluate NASADEM (CC0) self-hosting in P4. |
| AWS tile bucket throttling or CORS | Low | Falls back to flat | Shared HTTP cache with MapLibre. EU mirror plus Mapterhorn config. Silent flat fallback (existing #130 behaviour). |
| Bridge profiles wrong where OSM is poorly tagged (missing `bridge`, `layer`) | Medium | Agents dip into rivers | Clearance-over-water constraint (needs water polygons; read `water` source-layer via `querySourceFeatures`). Dev HUD flags "approximate" bridges. Default to draped (today's behaviour) when unsure. |
| Hiding `bridge_*` style layers hides real roads when our decks fail to draw | Low | Missing roads | Only hide after the deck mesh actually rendered one frame. Restore on dispose, tier change and error. Only on Tier A. |
| Perf on Tier B with terrain-lite | Medium | fps < 30 | Relief gate plus fps probe ≥ 40 required. Auto-revert to flat if the ladder steps within 20 s. |
| Licence: Copernicus/FABDEM/Google cannot be used commercially as-is | Medium | Legal | Only AWS Terrarium (open, attributed) by default. Others are dev-only behind config, with a decision for Wei (§12). |
| Scope creep into collision (audit gap #1) | Medium | Delay | The heightfield API is shared, but collision is out of scope here. |

---

## 11. Integration with existing modules (file by file)

- `src/world/immerse/terrain.ts`: export `TILES`, `DEM`, `DEM_HS`, `ATTRIBUTION`. `attachTerrain` dispatches `ndu-ground` `{terrain: boolean}` on apply/removeAll/dead. Add `setGate(flat: boolean)` (relief gating) so `apply("A")` can skip `setTerrain` in flat places. `groundElevation()` delegates to the provider, and there's a new `groundSample()` that returns `HeightSample`.
- `src/world/immerse/index.ts`: after `attachTerrain`, if `groundAllowed()`, lazy-import `@/world/ground` and `mountGround(map, tier)`. Dispose in `down()`. Forward `onTier`.
- `src/world/immerse/mapTypes.ts`: add optional `isSourceLoaded`, `setCenterElevation`, `setCenterClampedToGround`, `querySourceFeatures`.
- `src/world/scanLayer.ts`: `matrixFor(pose, baseZ)`. The `Shown` entry gets `baseZ` and `target`. Subscribe to the provider. Add plinth geometry to the per-scan scene (`load()`, after `rigScene`). `tap()` and `moveDraft()` clamp with the CPU DEM.
- `src/world/scans.ts`, `src/world/scan-schema.server.ts`, `migrations/0018_scan_ground.sql`: alt fields (P3).
- `src/world/ScanDesk.tsx`: a "Height" row (−1 / −0.1 / +0.1 / +1 m, plus mode select) near the rotation and scale controls (≈ `:458-513`).
- `src/world/life/parse.ts`, `tiles.ts`: deck and layer tags. `graph.ts`: `nodeZ`, `zs`, `deck`, `layer`, `alongZ`. `sim.ts`: `rz`, `pitch`, `roll` in `place()`. `lifeLayer.ts`: origin altitude, `dummy.position.y`, rotation order `YXZ` for vehicles (heading, then pitch, then roll), sloped shadows, deck ribbons mesh. `index.ts`: subscribe to the provider, re-bake, and `anchorOf()` lifts the ground point by the agent's z (via `probe.projectAlt` when terrain3d) so tap picking stays accurate on hills.
- `src/world/paths.ts`: `Way.deck`, `Way.layer` from tags in `fetchWays`/`openPaths`. `Net.deck`. This is the one small hunk in an uncommitted file, so coordinate.
- `src/world/CityBuildings.tsx`: player marker `opacityWhenCovered`. After the map `load` (`:794-844`) the ground provider is mounted by immerse (no new import here except the type-only `ProbeHandle` and a lazy hook). `placeRaw` (`:492-498`) calls `groundHooks.onPlayer(spot, deck)`, a tiny static hooks file like `life/hooks.ts` (no three.js, no ground chunk), which applies the deck offset when present.
- `src/world/orbit/follow.ts`, `streetCam.ts`: elevation-aware `jumpTo` while on a deck. Eye-clip helper.
- `src/world/props/propsCatalogue.ts`, `proceduralKit.ts`: add a pure `placeOnGround(spec, ll, provider)` helper in `ground/` and document it for gap #3.
- `src/world/crowd/types.ts`, `traffic/types.ts`: add optional `altM?: number` to `WalkerAgent.pos` / `VehicleState` (API parity, tests only).
- `src/world/perf/hud.ts`: dev row. `perf/perfBudgets.ts`: no change (budgets hold).
- Docs: `src/world/immerse/IMMERSE.md` (ground section), `src/world/life/LIFE.md` (z, decks), `src/world/render/ORDER.md` (deck ribbons in slot 4, hidden `bridge_*` on Tier A), `docs/perf/PERF_BUDGETS.md` (ground line), new `src/world/ground/GROUND.md`.

---

## 12. Open decisions for Wei
1. **Data licence:** stay on AWS Terrarium only (default), or approve NASADEM (CC0) / Oahu lidar self-hosted tiles for Honolulu? (Copernicus GLO-30 and FABDEM need legal review and are not recommended for commercial launch.)
2. **Tier B terrain-lite:** ship it relief-gated (recommended), or keep Tier B always flat?
3. **Bridge rendering:** draw our own deck ribbons on Tier A and hide the draped style bridges (recommended), or accept draped bridges and only lift the agents?
4. **Scan altitude UI:** expose the "Height" nudge to all owners, or keep it dev-only until the placement gizmo (NDU-12) lands?

## 13. Effort summary
- MVP (nothing buried on Tier A; scans and street life clamped): **≈ 4 dev-days** (P0–P2).
- Full feature (bridges, tunnels, steps, avatar decks, scan altitude, Tier B relief gating, QA and docs): **≈ 10–11.5 dev-days**, about 2 calendar weeks for one agent with review.
- Optional data upgrade (Oahu 0.5 m lidar tiles, NASADEM mirror): **+1.5–2 days**, plus the licence decision.
