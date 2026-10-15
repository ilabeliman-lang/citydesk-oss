# Plan: L4 Extract — engine → `engine/`

- **Ticket:** heavy-a3 (`handoff/HEAVY_BATCHES.md` Batch A, per `docs/adr/ADR-engine-extract.md:6`)
- **Status:** **PLAN ONLY** — no code moved, no `src/` change. Gate is the doc + a clean typecheck.
- **ADR:** `docs/adr/ADR-engine-extract.md` (Decision **A**, seven packages, `:63`).
- **Baseline:** worktree `hv-heavy-a3`, branch `feat/impl-heavy-a3`, HEAD `7a2f818` (= `main`). `feat/impl-heavy-a2` is at the same commit and contains **no `packages/` directory and no workspace config** — the heavy-a2 scaffold has not landed, so every path below is written against `engine/` inside the repo root, not against a workspace package manager.

> **Blocker to raise with Sun before heavy-a4 executes:** the ADR assumes heavy-a2's
> `pnpm-workspace.yaml` / npm-workspaces scaffold exists (`docs/adr/ADR-engine-extract.md:136-137`
> — "Workspace tooling (heavy-a2) must exist before any extract"). It does not exist on this
> branch. The migration below therefore plans `engine/` as a plain directory tree inside the
> existing repo (single `tsconfig.json`, single `vite.config.ts`), which needs **no** workspace
> tooling and satisfies the same dependency-strict layering. If Sun prefers real packages, the
> steps in §5 need the workspace root first.

---

## 1. What the engine surface actually is today

Verified by reading the tree at `7a2f818`. `src/world/` holds 465 `.ts`/`.tsx` files; the engine
half is concentrated in 16 directories. Purity below means: no `react`, no `three`, no
`maplibre-gl`, no `document`/`window`, no `createServerFn`.

| Directory | Files | Engine? | Why (file:line) |
|---|---|---|---|
| `src/world/xr/` | 2 | **all engine** | `src/world/xr/matrix.ts:2` "Pure data — this module never starts a WebXR session"; zero imports. |
| `src/world/realism/collide.ts` | 1 | **engine** | `src/world/realism/collide.ts:3` `Disc`, `:6` `slideMeters`, `:20` `blocksBuilding`; zero imports. |
| `src/world/render/` (3 of 6) | 3 | **engine** | `src/world/render/lod.ts:13` `lodBand`/`:20` `lodScale`; `src/world/render/lifecycle.ts:8` `WebGlLifecycleManager`, `:62` `RENDER_ORDER_CONTRACT`, `:71` `verifyLayerOrder`; `src/world/render/materialCatalog.ts:28` `MATERIALS`, `:69` `fromOsm` — all zero-import pure. |
| `src/world/ground/` (8 of 11) | 8 | **engine** | `src/world/ground/terrarium.ts:1` type-only import; `src/world/ground/heightCache.ts:100` `HeightCache`; `src/world/ground/pose.ts:6` `VEHICLE_BOX`, `:12` `contactPose`, `:59` `scanBase`, `:73` `footprintCorners`. |
| `src/world/props/` (11 of 22) | 11 | **engine** | `src/world/props/geo.ts` (94 lines, zero imports); `src/world/props/dimensions.ts:1` type-only; `src/world/props/lighting.ts:1` one local import; `src/world/props/proceduralKit.ts:1` `import * as THREE from "three"` — the one renderer-coupled engine file. |
| `src/world/life/` (12 of 18) | 12 | **engine** | `src/world/life/scale.ts:4-12` `walkerScale`/`vehicleScale`/`lifeScales`; `src/world/life/sim.ts:87` `StreetSim`; `src/world/life/ride.ts:6-102`. `sim.ts:2-3` imports `../ground/profile.ts` + `../ground/pose.ts`. |
| `src/world/collide/` (13 of 17) | 13 | **engine** | `src/world/collide/world.ts:1-4` local-only imports; `src/world/collide/geom.ts:1`, `src/world/collide/move.ts:1-3`, `src/world/collide/route.ts:1-3`, `src/world/collide/enu.ts:1`, `src/world/collide/types.ts` (zero imports). |
| `src/world/atmosphere/` (2 of 5) | 2 | **engine** | `src/world/atmosphere/wind.ts:27` `windVector`, `:44` `sway`; `src/world/atmosphere/skyGradient.ts` (zero imports). `weatherEngine.ts:7` imports `./skyGradient.ts` and stays. |
| `src/world/shadows/cast.ts` | 1 | **engine** | `src/world/shadows/cast.ts:3` `LightVector`, `:21` `groundShadow`; zero imports. |
| `src/world/trip.ts` (partial) | 1 | **engine + app** | `src/world/trip.ts:16` `metersBetween`, `:26` `cumulative`, `:33` `splitAt`, `:76` `clock`, `:81` `distanceLabel` are pure, **but** `src/world/trip.ts:1-2` imports `@/world/carto` (a `createServerFn`, `src/world/carto.ts:1,14`) and `@/world/paths` (`src/world/paths.ts:1`). The ADR's claim that these are "dependency-free functions" (`docs/adr/ADR-engine-extract.md:20`) is **wrong for this tree** — see §4 risk R1. |
| `src/world/realism/` (rest) | 8 | **app-side** | `src/world/realism/index.ts:1-11` imports `../inspect/flag.ts:7`, `../render/materialCatalog.ts:8`, `../shadows/mount.ts:10`, `@/world/collide/bus:11`, and `src/world/realism/osmBuildings.ts:1` is a `createServerFn`. Pure parts (`heights.ts`, `sun.ts`, `suncalc.ts`, `material.ts`, `buildingsData.ts`, `inspect.ts`, `parking.ts`, `layers.ts`) are candidates but sit behind the app mount. |
| `src/world/placement/`, `src/world/audio/`, `src/world/traffic/`, `src/world/crowd/`, `src/world/buildings/`, `src/world/empty-state/`, `src/world/orbit/`, `src/world/fp/`, `src/world/immerse/`, `src/world/workverse/`, `src/world/kids/` | ~40 | **mixed** | See §2 "left out". |
| `src/world/*.tsx` (23 files), `src/world/paths.ts`, `carto.ts`, `overpass.ts`, `presence.ts`, `property*.ts`, `neura*.ts`, `registry.ts`, `assistant/`, `search/`, `inspect/`, `net/`, `office/`, `address/`, `agents/`, `mapdata/` | ~300 | **app** | `src/world/paths.ts:1` and 30 other files import `createServerFn` from `@tanstack/react-start`; `src/world/registry.ts:3` imports `@/lib/auth/middleware`. |

---

## 2. Module boundary — what moves, what stays

### 2a. MOVES into `engine/` (56 source files + 28 tests/fixtures)

Naming follows the ADR's seven packages (`docs/adr/ADR-engine-extract.md:66-94`); each becomes a
subdirectory of `engine/` so the repo's single `tsconfig.json:24-28` `@/*` alias keeps working.

**`engine/math/` (7)** — depends on nothing.
```
src/world/trip.ts              (split: pure half only — see §4 R1)
src/world/placement/nudge.ts   (61 lines, zero imports: METRES_PER_DEG_LAT:6, clampPose:38, offsetMetres:52)
src/world/realism/suncalc.ts   (133 lines, zero imports)
src/world/props/geo.ts         (94 lines, zero imports: projAt, bearingOf, norm360)
src/world/collide/enu.ts       (21 lines, type-only import: toXY/toLL frame)
src/world/shadows/cast.ts      (38 lines, zero imports)
src/world/atmosphere/wind.ts   (56 lines, zero imports)
```

**`engine/xr/` (1)** — depends on nothing.
```
src/world/xr/matrix.ts         (XrDeviceName:5, XrDeviceRow:9, deviceMatrix:15)
```

**`engine/collision/` (14)** — depends on `math`.
```
src/world/realism/collide.ts   (Disc:3, slideMeters:6, blocksBuilding:20)
src/world/collide/types.ts     (zero imports — Collider/Door/Vec/Frame)
src/world/collide/geom.ts      (closestOnSegment, segIntersect, pointInCollider, ringArea)
src/world/collide/enu.ts       → engine/math (already listed)
src/world/collide/grid.ts      (EdgeGrid)
src/world/collide/world.ts     (CollisionWorld, isBlocking)
src/world/collide/move.ts      (slideMove, magnetise, tickStuck)
src/world/collide/route.ts     (gridAStar, needsDetour)
src/world/collide/eject.ts     (ejectPoint)
src/world/collide/trigger.ts   (armAuto, tickTrigger)
src/world/collide/doors.ts     (bestDoor, synthDoors, mergeDoors)
src/world/collide/camera.ts    (probeCamera)
src/world/collide/bus.ts       (publish* / on* event bus; imports only ./flag.ts)
src/world/collide/flag.ts      (DOM-guarded, localStorage-backed — see §4 R2)
src/world/collide/testutil.ts  (test fixture builder; imports ../realism/buildingsData.ts — see §4 R3)
```

**`engine/world-core/` (3)** — depends on `math`.
```
src/world/render/lifecycle.ts     (WebGlLifecycleManager:8, RENDER_ORDER_CONTRACT:62, verifyLayerOrder:71)
src/world/render/lod.ts           (lodBand:13, lodScale:20)
src/world/render/materialCatalog.ts (MATERIALS:28, fromOsm:69, tintFor:106)
```
`src/world/render/materials.ts` and `physicalMaterials.ts` **stay** — both are three.js-bound
(`src/world/render/materials.ts:1` `import * as THREE from "three"`), which the ADR forbids in
`world-core` (`docs/adr/ADR-engine-extract.md:104-105`: "must not depend on any renderer").

**`engine/terrain/` (8)** — depends on `math`.
```
src/world/ground/terrarium.ts  (decodeTile, lngLatToTilePx, metresPerPixel)
src/world/ground/heightCache.ts (HeightCache:100, tilesCovering:58, capForTier:96)
src/world/ground/pose.ts       (VEHICLE_BOX:6, contactPose:12, scanBase:59, footprintCorners:73)
src/world/ground/profile.ts    (bakeGraph, alongZ)
src/world/ground/provider.ts   (createProvider)
src/world/ground/types.ts      (zero imports)
src/world/ground/relief.ts     (reliefScore:12, shouldTerrain:23)
src/world/ground/demWorker.ts  (webworker; `/// <reference lib="webworker" />:1`)
```
`src/world/ground/index.ts` (`mountGround:21`) and `src/world/ground/hooks.ts` **stay** — they are
the MapLibre/DOM mount seam (`src/world/ground/index.ts:13-19` `HostMap` with `getCenter`,
`triggerRepaint`). `src/world/ground/flag.ts` **stays** (`src/world/ground/flag.ts:1` imports
`@/world/immerse/flag`, reads `window.location`/`localStorage`).

**`engine/props-lighting/` (11)** — depends on `math`, `world-core`.
```
src/world/props/types.ts        (PropKind:6, PropRecord:53)
src/world/props/dimensions.ts   (KIND_DEFAULTS, hashSeed, kelvinFor, treeSize)
src/world/props/geo.ts          → engine/math (already listed)
src/world/props/codec.ts        (encodeCell/decodeCell)
src/world/props/parse.ts        (parseProps, propsQuery)
src/world/props/infer.ts        (inferProps)
src/world/props/lod.ts          (lod banding by PropKind)
src/world/props/lighting.ts     (lampsOnFactor:28, kelvinToRgb:36, haloScale:57)
src/world/props/weatherFx.ts    (propFx; imports ../atmosphere/weatherEngine.ts:1)
src/world/props/osmPropsCore.ts (pure core; the server fn wrapper osmProps.ts:1 stays)
src/world/props/proceduralKit.ts (674 lines; THREE-bound at :1 — see §4 R4)
src/world/props/propsCatalogue.ts (200 lines, zero imports)
```

**`engine/avatar/` (12)** — depends on `math`, `collision`, `terrain`.
```
src/world/life/scale.ts       (walkerScale:4, vehicleScale:5, lifeScales:8, STREET_TILT:7, GREET_M:10, PERSONAL_M:12)
src/world/life/sim.ts         (StreetSim:87, talkLine:522, greetReply:541, vehicleLabel:565)
src/world/life/ride.ts        (RidePhase:6, canHail:49, calculateFare:58, createTicket:69, interactProp:102)
src/world/life/graph.ts       (buildGraph, projector, hashSeed)
src/world/life/parse.ts       (parseStreets, Deck/LRoad/LWalk types)
src/world/life/density.ts     (lifeTargets, regionOf, weekdayIn)
src/world/life/tiles.ts       (streetsFromTiles:50, roadNameNear:189)
src/world/life/roadWidths.ts  (applyRoadWidths)
src/world/life/lamps.ts       (lampHalo)
src/world/life/bodies.ts      (setLifeBodies registry)
src/world/life/doors.ts       (setDoors)
src/world/life/models.ts      (walkerCloth:39, walkerSkin:50, vehicleGeometry:74 — THREE-bound at :1, see §4 R4)
```
`src/world/life/index.ts` **stays** in the app, exactly as the ADR requires
(`docs/adr/ADR-engine-extract.md:90-91`: "The DOM-binding half of `life/index.ts` (`mountLife`)
**stays in CityDesk**"). `mountLife` is at `src/world/life/index.ts:58` (ADR says `:56` — off by
two on this tree). Also staying: `src/world/life/lifeLayer.ts` (`:40` reads
`document.documentElement.dataset.nduTier`), `src/world/life/card.ts` (`:1` imports
`@/world/bubbles/mode`), `src/world/life/hooks.ts` (`:1` imports `@/world/perf/tier`),
`src/world/life/streets.ts` (`:1` `createServerFn`).

### 2b. STAYS in `src/world/` (app)

Routes and UI: all 23 `src/world/*.tsx` files (`CityBuildings.tsx`, `WorldMap.tsx`, `ScanDesk.tsx`,
the whole `workverse/`, `kids/`, `office/`, `bubbles/`, `assistant/`, `search/`, `inspect/`,
`property-ui/`, `address/`, `ingest/`, `empty-state/*.tsx`, `moderation/`, `groups/` React files).
Server: `paths.ts`, `carto.ts`, `overpass.ts`, `roads.ts`, `places.ts`, `nodes.ts`, `scans.ts`,
`transit.ts` (pure but app-domain), `presence*.ts`, `property*.ts`, `neura*.ts`, `registry.ts`,
`admin.ts`, `businesses.ts`, `scan-*.server.ts`, `registryBridge.server.ts`, `property-routes.server.ts`,
and every `*.server.ts`.
Mount seams: `life/index.ts`, `ground/index.ts`, `ground/hooks.ts`, `ground/flag.ts`, `props/index.ts`,
`props/propsLayer.ts`, `props/osmProps.ts`, `props/flag.ts`, `realism/index.ts`, `realism/scanLook.ts`,
`realism/osmBuildings.ts`, `collide/index.ts`, `collide/layers.ts`, `orbit/follow.ts`, `fp/controller.ts`,
`immerse/*`, `perf/tier.ts`, `perf/degrade.ts`, `perf/mapPerf.ts`.
Renderer-bound: `render/materials.ts`, `render/physicalMaterials.ts`, `scanLayer.ts`, `life/models.ts`,
`props/proceduralKit.ts`, `empty-state/isoScene.ts`, `kids/scene.ts`, `workverse/terminalScreen.ts`.

### 2c. Deliberately LEFT OUT of heavy-a3..a8 (needs a decision, not covered by the ADR)

These are engine-shaped and pure, but the ADR's seven packages have no home for them. They are
**not** in the 56 moves above and should be a heavy-a9+ batch or an explicit Sun call:

- `src/world/traffic/` — `idm.ts:31` `calculateIdmAcceleration`, `simTraffic.ts:33` `TrafficSimulator`, `yield.ts:18` `shouldHold`, `dimensions.ts` (all pure, 481 lines).
- `src/world/crowd/` — `boids.ts:39` `computeSteeringForces`, `entrances.ts:5` `nearestDoor` (pure, 412 lines).
- `src/world/buildings/` — `heightResolver.ts:214` `resolveBuildingHeight`, `roofTypes.ts:64/106` (pure, 1151 lines).
- `src/world/atmosphere/weatherEngine.ts` — 386 lines, pure apart from `skyGradient.ts:7`.
- `src/world/fp/` pure half — `rig.ts`, `gait.ts`, `frame.ts`, `oneEuro.ts`, `comfort.ts`, `limits.ts`, `lookMixer.ts`.
- `src/world/audio/footsteps.ts`, `audio/spatial.ts` — pure except `spatial.ts:16` `AudioContext`.
- `src/world/orbit/orbitCore.ts` — 134 lines, pure except `:130` a `window.matchMedia` guard.
- `src/world/empty-state/footprint.ts` — 247 lines pure, but `:1` imports `../buildings/facade.ts`.
- `src/world/workverse/` pure half — `nav.ts`, `layout.ts`, `behavior.ts`, `palette.ts`, `archetypes.ts`, `toyFigure.ts`, `receptionSummary.ts`.
- `src/world/inspect/` pure half — `propPhysics.ts`, `dates.ts`, `vehicleSpecs.ts`, `affordances.ts`, `unique.ts`.
- `src/world/placement/snap.ts`, `gizmo.ts`, `undo.ts`; `src/world/office/floors.ts`, `panes.ts`, `roster.ts`.

---

## 3. Public API surface `engine/` would export

One `index.ts` per subdirectory; the barrel is the only thing an app may import from.

```
engine/math/index.ts
  metersBetween(a: Pt, b: Pt): number            // trip.ts:16
  cumulative(points: Pt[]): number[]             // trip.ts:26
  splitAt(points, cum, d): {done,left,at}        // trip.ts:33
  clock(seconds): string                         // trip.ts:76
  distanceLabel(meters): string                  // trip.ts:81
  type Pt = { lat: number; lng: number }         // re-homed from paths.ts:4 (see §4 R1)
  clampLngLat / clampScale / normalizeRotation / offsetMetres / METRES_PER_DEG_LAT   // nudge.ts:6,16,21,28,52
  projAt / bearingOf / norm360 / nearestOnLine / pointInRing / ringArea             // props/geo.ts
  toXY / toLL / makeFrame + type Frame, Vec                                        // collide/enu.ts
  groundShadow(foot, light): GroundShadow + LightVector/Footprint/GroundShadow     // cast.ts:3,5,7,21
  windVector / streetWind / sway + WindMetresPerSecond / SwayMetres                // wind.ts:6,9,27,36,40,44
  getPosition / getTimes / getMoonPosition / getMoonFraction                        // suncalc.ts

engine/xr/index.ts
  type XrDeviceName = "phone" | "headset" | "glasses"  // matrix.ts:5
  type XrDeviceRow / XrDeviceStatus                    // matrix.ts:7,9
  deviceMatrix(): readonly XrDeviceRow[]               // matrix.ts:15

engine/collision/index.ts
  Disc / slideMeters / blocksBuilding                  // realism/collide.ts:3,6,20
  type Collider, Door, EntranceNode, Vec, Frame, CollideOptions, MoveResult, DoorSpot
  class CollisionWorld + isBlocking                    // collide/world.ts
  slideMove / magnetise / newResult / tickStuck        // collide/move.ts
  ejectPoint                                           // collide/eject.ts
  gridAStar / needsDetour                              // collide/route.ts
  armAuto / newTrigger / startCooldown / tickTrigger / probeCamera
  bestDoor / doorsFromEntrances / mergeDoors / synthDoors
  EdgeGrid                                             // collide/grid.ts
  closestOnSegment / segIntersect / pointInCollider / rdp / ringArea / ensureOrientation
  publishBuildings / publishEntrances / publishTileFootprints / onCollideData   // collide/bus.ts
  collideEnabled / collideSubFlag / resetCollideFlag  // collide/flag.ts  (⚠ app-owned config, §4 R2)

engine/world-core/index.ts
  type ContextState = "healthy" | "restoring" | "degraded_2d"   // lifecycle.ts:6
  class WebGlLifecycleManager                                     // lifecycle.ts:8
  RENDER_ORDER_CONTRACT / verifyLayerOrder                        // lifecycle.ts:62,71
  type LodBand / lodBand(metres) / lodScale(metres)               // lod.ts:10,13,20
  type MaterialKey / MaterialSpec / MATERIALS / OSM_MATERIAL / fromOsm / toSrgbHex / mixHex / lumHex / tintFor
                                                                  // materialCatalog.ts:5,12,28,56,69,82,94,100,106

engine/terrain/index.ts
  DEM_Z / TILE_SIZE / tileKey / type TileId / tilesCovering / capForTier / class HeightCache / class Lru / class Bench
                                                                  // heightCache.ts:9,10,55,58,72,96,100,12
  decodeTile / lngLatToTilePx / metresPerPixel / minMax / normalAt / sampleBilinear  // terrarium.ts
  VEHICLE_BOX / MAX_TILT / contactPose / vehiclePose / ease / PLINTH_SPREAD_M / scanBase / footprintCorners
                                                                  // pose.ts:6,8,12,29,50,52,59,73
  bakeGraph / alongZ                                              // profile.ts
  createProvider + type GroundMap                                 // provider.ts:1
  type GroundHandle / GroundStats / Spot / DemTile / Normal / AltMode / GroundMode / HeightSample  // types.ts
  reliefScore / shouldTerrain + type Relief                       // relief.ts:3,12,23
  type DemWorkerMessage (the demWorker.ts module itself)

engine/props-lighting/index.ts
  type PropKind / PropRecord / CrownShape / LeafType / CellPayload / OsmEl / RoadWay / AreaPoly / CellBox
                                                                  // types.ts:6,53
  parseProps / propsQuery / DRIVABLE / WALKABLE / KIND_DEFAULTS / clampFor / hashSeed / kelvinFor /
  lampHeightForRoad / parseDirection / parseHeight / roadWidthFor / treeSize / rand01   // dimensions.ts, parse.ts
  encodeCell / decodeCell + KIND_CODES                             // codec.ts
  inferProps + type BuildingRings                                  // infer.ts
  lod banding helpers                                              // lod.ts
  staggerDeg / lampThreshold / lampsOnFactor / kelvinToRgb / poolRadius / haloScale / haloStretch / haloFacing
                                                                  // lighting.ts:18,23,28,36,52,57
  propFx                                                           // weatherFx.ts
  ARCHETYPES / archetype(id) / create*Geometry (lamp, pole, standpipe, stall, bench, busStop, palm)
                                                                  // proceduralKit.ts:73,82,90,100,116,126,136,243,672
  propsCatalogue entries                                           // propsCatalogue.ts

engine/avatar/index.ts
  walkerScale / vehicleScale / lifeScales / STREET_TILT / GREET_M / PERSONAL_M   // scale.ts:4,5,8,7,10,12
  class StreetSim + type Walker / Vehicle / Agent / Role / SimOptions             // sim.ts:87,33,50,15,85
  talkLine / greetReply / ROLE_LABEL / vehicleLabel                               // sim.ts:522,541,555,565
  type RidePhase / VehicleRideKind / RideTicket / PropKind / PropInteractionResult
  canHail / calculateFare / createTicket / stepRideProgress / interactProp /
  MAX_HAIL_SPEED_MPS / MAX_HAIL_DISTANCE_M / STALL_VOUCHER_COST / FARE_BASE / FARE_PER_KM
                                                                  // ride.ts:6,8,10,18,20,27,28,30,32,39,49,58,69,86,102
  buildGraph / projector / hashSeed / type Edge, Graph, XY, Streets, Deck, LRoad, LWalk, Vertical
  lifeTargets / regionOf / weekdayIn / poiPull                    // density.ts
  streetsFromTiles / roadNameNear / type TileMap                  // tiles.ts:14,50,189
  applyRoadWidths / type WidthMap                                 // roadWidths.ts
  lampHalo / setDoors / setLifeBodies                             // lamps.ts, doors.ts, bodies.ts
  walkerCloth / walkerSkin / vehicleGeometry / gaitMaterial / plainMaterial  // models.ts:39,50,74,119,146  (⚠ three.js, §4 R4)
```

**Explicitly NOT exported by any package** (ADR `docs/adr/ADR-engine-extract.md:101-105`): React
components, `@tanstack/*`, `src/routes`, `*.server.ts`, `process.env`, `maplibre-gl`, `three`.

---

## 4. Dependency inversion required

### 4a. What `engine/` must not import (the inversion list)

| # | Forbidden import | Where it happens today | Inversion |
|---|---|---|---|
| 1 | `createServerFn` / `@tanstack/react-start` | 31 files in `src/world`, incl. `src/world/trip.ts:1-2` (via `carto.ts`/`paths.ts`), `src/world/props/osmProps.ts:1`, `src/world/realism/osmBuildings.ts:1`, `src/world/life/streets.ts:1` | Split each file at the seam: the pure core (`osmPropsCore.ts`, `paths.ts:69-285`, `carto.ts:26` `cartoRoute`) moves to the package; the `createServerFn` wrapper stays in `src/world/` and calls the package. |
| 2 | Feature flags reading `localStorage` / `import.meta.env` / `window.location` | `src/world/collide/flag.ts:12-18` (`g.localStorage`, `import.meta.env`), `src/world/props/flag.ts:16-21`, `src/world/ground/flag.ts:16-45` | Flags **stay in the app**. The package takes `enabled: boolean` / `tier: "A"\|"B"\|"C"` as an argument. `collideEnabled` is currently imported by `collide/bus.ts:1`, so `bus.ts` must accept the flag value rather than read it. |
| 3 | Device/quality detection (`document`, `window`, `navigator`, `matchMedia`) | `src/world/perf/tier.ts:58,67,78,100`, `src/world/perf/degrade.ts:108,115,126`, `src/world/realism/settings.ts:10,33,34`, `src/world/ground/index.ts:22-23`, `src/world/life/index.ts:63`, `src/world/props/index.ts:81` | `tier`, `quality`, `dpr`, `reducedMotion`, `mobile` are passed **in** at every package entry point. Nothing in `engine/` calls `matchMedia`, reads `navigator.userAgent`, or touches `document.documentElement.dataset`. |
| 4 | `maplibre-gl` | `src/world/collide/index.ts:1`, `src/world/collide/layers.ts:1`, `src/world/scanLayer.ts:1`, `src/world/CityBuildings.tsx:10` | The `mount*` functions and `*Layer` modules stay in the app. The package exposes pure GeoJSON/ENU output; the app turns it into map layers. |
| 5 | `three` | `src/world/render/materials.ts:1`, `src/world/props/proceduralKit.ts:1`, `src/world/life/models.ts:1`, `src/world/realism/scanLook.ts:1`, `src/world/scanLayer.ts:1`, `src/world/empty-state/isoScene.ts:1` | ADR `:104-105` says `world-core` must be renderer-free — satisfied (`materials.ts` stays). For `proceduralKit.ts` and `models.ts` see R4. |
| 6 | App stores / buses | `src/world/props/index.ts:3-5` (`realism/state`, `immerse/store`, `realism/osmBuildings`), `src/world/life/index.ts:1-3` (`perf/tier`, `perf/degrade`, `realism/state`), `src/world/workverse/store.ts:1-2` (`zustand`, `@/studio/council`) | All these imports are in the **staying** `index.ts` mount files, so no inversion is needed for them — but this is exactly why those files cannot move. The package API takes plain data (`WeatherState`, `FxLike`, `SunLike` already exist at `src/world/props/lighting.ts:11-16`). |
| 7 | App domain types | `src/world/realism/buildingsData.ts:4` imports `../inspect/dates.ts`; `src/world/realism/index.ts:7` imports `../inspect/flag.ts` | `buildingsData.ts` is a **left-out** file, not a move, so this edge never enters a package. If Sun later pulls it in, `parseStartDate` must move to `math` or be injected. |

### 4b. Allowed dependency edges (ADR `docs/adr/ADR-engine-extract.md:96-100`), re-stated for this tree

```
math        ← (nothing)
xr          ← (nothing)
collision   → math
terrain     → math
world-core  → math
props-lighting → math, world-core
avatar      → math, collision, terrain
```
Two edges in the current code violate this and must be cut or the layering relaxed:
`src/world/ground/profile.ts:1` imports `../life/graph.ts` — **terrain → avatar**, backwards.
`src/world/props/weatherFx.ts:1` imports `../atmosphere/weatherEngine.ts` — props-lighting →
atmosphere, an undeclared package. Fix: `alongZ`/`bakeGraph` take a `Graph`/`Edge` type that
`math` owns (or `terrain` re-declares structurally); `weatherEngine.ts` moves into
`props-lighting` or into `math`.

---

## 5. Step-by-step migration (per the ADR order, `docs/adr/ADR-engine-extract.md:107-118`)

Each step is its own branch off this plan, gated by `npm run typecheck` staying 0 and the moved
tests passing. No step touches the live tree.

**Step 0 — decision (blocking, Sun).** Workspace scaffold vs. plain `engine/` directory
(`docs/adr/ADR-engine-extract.md:136-137`). This plan assumes plain `engine/`; nothing below needs
`pnpm`/npm workspaces, a second `tsconfig.json`, or a second `vite.config.ts`.

**Step 1 — `engine/math/`.**
1. `mkdir -p engine/math`; `git mv` the 7 files (§2a), rewriting `src/world/trip.ts` first: delete
   `trip.ts:1-2` (the `carto`/`paths` imports) and `planTrip:60-74` — those stay in `src/world/trip.ts`
   as an app module re-exporting from the package.
2. `Pt` is currently declared at `src/world/paths.ts:4` and imported by `src/world/trip.ts:2` and
   `src/world/CityBuildings.tsx:3`. Declare `Pt` in `engine/math` and have `paths.ts` re-export it
   (`export type { Pt } from "@/engine/math"`) so all 30+ existing importers keep compiling.
3. Create `engine/math/index.ts` (the barrel in §3).
4. Import rewrites: inside `engine/math`, `@/world/x` → relative. Outside, `@/world/trip` etc. →
   `@/engine/math`. The `@/*` alias already resolves both (`tsconfig.json:24-28`, and Vite honours
   it via `vite.config.ts:160` `resolve: { tsconfigPaths: true }`).
5. Move tests: none of the 7 has a dedicated test file today — add `engine/math/trip.test.ts`
   porting the `metersBetween`/`splitAt` assertions if any exist elsewhere; `nudge` is covered by
   `src/world/placement/placement.test.ts:4`.
6. Gate: `flock /tmp/impl-gate.lock bash -c 'npm run typecheck'` → 0.

**Step 2 — `engine/xr/`.** `git mv src/world/xr/matrix.ts engine/xr/`; move
`src/world/xr/matrix.test.ts` with it (it asserts `matrix.ts` contains no
`requestSession|navigator.xr` at `src/world/xr/matrix.test.ts:23`, which is exactly the purity
contract). `src/world/xr/xr.test.ts:2` is an empty placeholder — leave it in `src/world/`.
Barrel + gate. **Note:** nothing in `src/` imports `matrix.ts` today, so this is a zero-blast-radius
move.

**Step 3 — `engine/collision/`.** 14 files + 5 tests + 1 fixture
(`src/world/collide/fixtures/ph-cell.json`). Before moving, cut the two app edges:
`src/world/collide/flag.ts` either moves with an injected `enabled` (preferred) or stays in
`src/world/` and `bus.ts:1` takes it as a parameter. Rewrite
`src/world/collide/testutil.ts:1` and `src/world/collide/collide.test.ts:9-10`
(`../realism/buildingsData.ts`, `../workverse/nav.ts`) to the new relative paths. Update
`src/world/CityBuildings.tsx:42-43`, `src/world/WorldMap.tsx`, `src/world/realism/index.ts:11`
to `@/engine/collision`. Gate: typecheck + `npm run test:collide`.

**Step 4 — `engine/world-core/`.** 3 files + 2 tests. `render.test.ts:78` imports `three` for the
`materials.ts` half — split that test: the `lifecycle.ts`/`materialCatalog.ts` assertions move,
the `materials.ts` assertions stay. `src/world/life/index.ts:9` (`render/lod`) →
`@/engine/world-core`. Gate: typecheck.

**Step 5 — `engine/terrain/`.** 8 files + `src/world/ground/ground.test.ts`. Cut
`src/world/ground/profile.ts:1` (`../life/graph.ts`). `src/world/ground/index.ts:1` imports
`capForTier`/`tilesCovering` and `src/world/scanLayer.ts:15` imports `footprintCorners`/`scanBase` —
both rewrite to `@/engine/terrain`. `heightCache.ts:166-181` uses `fetch`/`createImageBitmap`/
`document.createElement` — this is a **browser** API, not app code, so it stays in the package but
must be documented as "runs in a browser or worker only" (see R5). Gate: typecheck +
`npm run test:ground`.

**Step 6 — `engine/props-lighting/`.** 11 files + 10 tests. `weatherFx.ts:1` → move
`weatherEngine.ts` in too (making it 12) or move `weatherFx.ts` out. `osmProps.ts:1` (the
`createServerFn`) stays and imports `osmPropsCore` from the package. `props/index.ts:1-11` and
`props/propsLayer.ts:2-6` rewrite to `@/engine/props-lighting`. Gate: typecheck + `npm run test:props`.

**Step 7 — `engine/avatar/`.** 12 files + 5 tests. `sim.ts:2-3` → `@/engine/terrain`;
`life/models.ts:1` and `proceduralKit.ts:1` keep their `three` import (see R4 — the ADR's ban is
on `world-core`, and these are avatar/props packages, so this needs Sun's explicit sign-off).
`life/index.ts:9-21` rewrites to `@/engine/avatar` + `@/engine/terrain` + `@/engine/world-core`.
Gate: typecheck + `npm run test:life`.

**Step 8 — boundary lint.** `eslint.config.mjs` has **no** `no-restricted-imports`/boundaries rule
today (verified — the ADR's "a lint rule later", `docs/adr/ADR-engine-extract.md:96`, does not
exist). Add a flat-config `no-restricted-imports` entry denying `react`, `@tanstack/*`,
`maplibre-gl`, `three`, and `@/world/*` inside `engine/**`, plus a `scripts/check-engine-boundary.mjs`
in the style of `scripts/check-flags.mjs:24-46`. Without this the layering decays silently.

**Step 9 — `engine/` bare example** (heavy-a9, out of scope here). Per
`docs/adr/ADR-engine-extract.md:118`, boots terrain + avatar + one prop with no React. Note it
cannot boot `heightCache` in plain Node because of `createImageBitmap`/`document` (`heightCache.ts:166-181`) — the example needs a canvas shim or the decode step injected.

---

## 6. Risks

**R1 — `trip.ts` is not pure, contrary to the ADR.** The ADR states
(`docs/adr/ADR-engine-extract.md:20`) that `metersBetween`/`cumulative`/`splitAt`/`clock` are
"dependency-free functions over `Pt` points". On this tree `src/world/trip.ts:1-2` imports
`@/world/carto` (a `createServerFn` at `src/world/carto.ts:1,14`) and `@/world/paths`
(`createServerFn` at `src/world/paths.ts:1`), and `Pt` itself is declared at `src/world/paths.ts:4`.
Moving `trip.ts` wholesale into `engine/math` would pull `@tanstack/react-start` into the engine —
exactly what `docs/adr/ADR-engine-extract.md:101-102` forbids. **Mitigation:** split the file;
`planTrip:60-74` stays in the app.

**R2 — flags are DOM/env state living inside otherwise-pure modules.**
`src/world/collide/flag.ts:12-18` reads `globalThis.localStorage` and `import.meta.env`;
`src/world/props/flag.ts:16-21` reads `import.meta.env`. `collide/bus.ts:1` imports the flag, so
moving `bus.ts` without moving `flag.ts` creates a package → app import. **Mitigation:** inject the
flag value; keep the flag modules in `src/world/`.

**R3 — test-only cross-package imports.**
`src/world/collide/testutil.ts:1` imports `../realism/buildingsData.ts`, and
`src/world/collide/collide.test.ts:9-10` imports both `../realism/buildingsData.ts` and
`../workverse/nav.ts`. `realism/buildingsData.ts` is a left-out file and `workverse/nav.ts` is
app-domain, so `engine/collision`'s tests would import app code — a boundary violation in the test
graph even though runtime is clean. **Mitigation:** move `toBuildings`/`toEntrances` into
`engine/math` (they are pure, `src/world/realism/buildingsData.ts:18,99`) and inline the two
`nav.ts` helpers the test uses (`boundsFor:31`, `isWalkable:36`) as local test constants.

**R4 — three.js is baked into two engine packages.** `src/world/props/proceduralKit.ts:1` and
`src/world/life/models.ts:1` both `import * as THREE from "three"` and export
`THREE.BufferGeometry` (`proceduralKit.ts:73`, `models.ts:39,50,74`). The ADR bans renderers from
`world-core` (`:104-105`) but is silent on `props-lighting` and `avatar`. Consequence: those two
packages cannot be consumed by a non-three app, and the bare example becomes a three.js example —
which is one of the ADR's own open questions (`docs/adr/ADR-engine-extract.md:145-146`).
**Mitigation:** either Sun accepts three as a declared dep of those two packages, or the geometry
builders move behind a `GeometryFactory` port and the three implementations stay in the app.
**Flag for Sun.**

**R5 — DOM/browser APIs inside `engine/terrain`.** `src/world/ground/heightCache.ts:166-181` calls
`fetch`, `createImageBitmap`, and `document.createElement("canvas")`; `demWorker.ts:5-18` uses
`self.onmessage` and `OffscreenCanvas`. These are browser APIs, not app coupling, so the ADR's
"no DOM" rule does not literally forbid them — but it does mean `engine/terrain` cannot run in
Node, which breaks the "unit-tested in isolation" claim
(`docs/adr/ADR-engine-extract.md:38`). **Mitigation:** inject a `fetchTile(url): Promise<ImageData>`
port; keep the canvas decode in a browser-only adapter. **Flag for Sun.**

**R6 — circular dependencies at the package level.** Two backwards edges exist today:
`src/world/ground/profile.ts:1` → `../life/graph.ts` (terrain → avatar, against
`docs/adr/ADR-engine-extract.md:99`), and `src/world/props/weatherFx.ts:1` →
`../atmosphere/weatherEngine.ts` (an undeclared package edge). Within `src/world` these are
tolerated because everything is one module graph; as packages they become import cycles or
undeclared deps. **Mitigation:** hoist `Graph`/`Edge` into `math`; move `weatherEngine.ts` into
`props-lighting` (or `math`).

**R7 — no boundary enforcement exists.** `eslint.config.mjs` has no `no-restricted-imports` and no
workspace/dep-cruiser config. The ADR's layering (`:96-105`) is currently advisory only. Seven
packages with no lint gate will drift within one batch. **Mitigation:** Step 8, before any extract
lands, not after.

**R8 — heavy-a2 scaffold is missing.** `feat/impl-heavy-a2` is at the same commit as this branch
(`7a2f818`) with no `packages/` tree and `package.json` has no `workspaces` field. The ADR's
migration order assumes it exists (`docs/adr/ADR-engine-extract.md:120-122`). This plan sidesteps
it by using `engine/` inside the existing build, but Sun must confirm that is acceptable.

**R9 — `mountLife` seam is load-bearing.** `src/world/life/index.ts:58` `mountLife` reads
`lifeEnabled`, `matchMedia`, `perf/tier`, `perf/degrade`, `realism/state`, `ground/hooks`,
`ground/profile`, `render/lod`, `atmosphere/wind` and drives a `requestAnimationFrame` loop
(`src/world/CityBuildings.tsx:1046,1218`). Splitting it as the ADR describes
(`docs/adr/ADR-engine-extract.md:133-135`) is feasible but the sim→render wiring
(`StreetSim` → layer → `mercatorAt` at `src/world/life/lifeLayer.ts:18`) is entangled with
`propsLayer.ts:5-6`. Budget a real seam-extraction step, not a copy.

**R10 — 28 test files move with the code** and each package needs its own `node --test` invocation.
The repo runs tests via `node --experimental-strip-types --test <paths>` with per-area npm scripts
(`package.json`: `test:collide`, `test:props`, `test:life`, `test:ground`, `test:xr`,
`test:realism`, `test:fp`). Those scripts hard-code `src/world/...` globs and must be repointed, or
a `test:engine` script added. `vitest` is **not** a dependency (verified in `package.json`), so no
runner change is needed.

---

## 7. Gate

| Check | Result |
|---|---|
| Plan doc exists with file:line evidence | ✅ this file, `docs/plans/engine-extract.md` |
| `src/` unchanged | ✅ zero `src/` files touched |
| `flock /tmp/impl-gate.lock bash -c 'npm run typecheck'` | ✅ exit 0, no output (`node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit`) |
| Files moved | 0 (plan only) |
