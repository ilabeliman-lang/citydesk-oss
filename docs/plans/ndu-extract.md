# Extract plan: NDU → standalone package (`@citydesk/realism`)

- **Status:** Plan only (heavy-a4). No code moved; no `src/` touched by this ticket.
- **Scope:** the New Dawn Universe realism subsystem — `src/world/realism/*`, the
  NDU feature gates (`VITE_NDU_*`, `NDU_*` env, `?flag=0|1` URL switches,
  localStorage opt-outs), and the `ndu-*` layer/source ids the realism pass
  owns.
- **Prerequisite reading:** `docs/adr/ADR-engine-extract.md` (Option A, seven
  packages), `docs/golive/leaflet-retire.md` (Leaflet retirement — see §4),
  `docs/golive/flags.md` (the full flag table), `docs/audits/realism-03-props-lighting.md`
  (GO-WITH-FIXES on props/lighting).
- Every `file:line` below is verified in this worktree at branch `feat/impl-heavy-a4`
  (base `citydesk-impl-docs` main, `7a2f818`).

## 1. The NDU boundary: what is in, what is out

### 1.1 NDU-core (moves into the package)

`src/world/realism/` is 1,932 lines across 20 files; the core is pure or
near-pure and has no CityDesk-domain coupling:

| Module | Lines | Role | Purity |
|---|---|---|---|
| `realism/sun.ts` | 183 | sun position, palettes, `mapLight` (MapLibre light object), zone math, `presets`, `clockLabel` | pure (math + `Intl`) |
| `realism/suncalc.ts` | 133 | vendored SunCalc port (sun/moon positions) | pure; BSD-2 vendored (header `:1-4`) |
| `realism/heights.ts` | 133 | OSM tag → height resolution (`resolveHeight`, `parseLength`, `parseLevels`, `roofAllowance`) | pure |
| `realism/buildingsData.ts` | 224 | Overpass elements → `BuildingFeature` / `BuildingCollection`; `toBuildings`, `toEntrances`, `coveredIds`, `fromTileFeatures`, `cellStats` | pure |
| `realism/material.ts` | 20 | material → fallback wall colour | pure |
| `realism/collide.ts` | 25 | `Disc`, `slideMeters`, `blocksBuilding` | pure ("No map." `:1`) |
| `realism/parking.ts` | 7 | `lotFullness(minutes)` | pure |
| `realism/inspect.ts` | 13 | `inspectLine(tags)` | pure |
| `realism/layers.ts` | 15 | layer/source id constants `REAL_BUILDINGS`/`REAL_ROOFS` (`:2-3`), `tappableBuildingLayers(map)` (`:6`) | pure, dependency-free (per `:1`) |
| `realism/state.ts` | 97 | the shared sun/place store (`getRealism`, `subscribeRealism`, `refreshRealism`, `setTimeOverride`, `shownMinutes`, `setPaletteFilter`) | reads localStorage (`:22` `"ndu.sun.v1"`); no CityDesk deps |
| `realism/settings.ts` | 36 | `RenderSettings` from device tier + matchMedia (`:31-36`) | **coupling:** imports `getTier` from `@/world/perf/tier` (`:5`) |

Tests that move with the core: `realism/collide.test.ts`, `heights.test.ts`,
`material.test.ts`, `parking.test.ts`, `inspect.test.ts`, `sun.test.ts` — all
node-test, no DOM fixture beyond `state` (which none of them touch).

Renderer-facing modules that also move, with a renderer adapter seam:

| Module | Lines | Role | Coupling |
|---|---|---|---|
| `realism/index.ts` | 476 | `mountRealism(map)` (`:121`) + `setInspectHighlight` (`:109`) — MapLibre source/layer setup, sun→light/sky, per-cell OSM buildings, hover, WebGL-loss card | **coupling:** imports `../shadows/buildings.ts` (`:5`), `../inspect/flag.ts` (`:7`), `../render/materialCatalog.ts` (`:8`), `../collide/bus` (`:11`); uses `document`/`window` (`:255`, `:266`), `import.meta.env.DEV` (`:133`) |
| `realism/scanLook.ts` | 106 | three.js side of the realism pass: `applyRendererLook`, `prepareModel`, `rigScene`, `syncScanLook` | **coupling:** `three` (`:1`), imports `./settings.ts` (`:2`), `./state.ts` (`:3`) |
| `realism/osmBuildings.ts` | 108 | `cellOf`, `buildingsForCell`, `overpassJob` (cached, serialised, back-off) + `osmBuildings` server fn | **coupling:** `createServerFn` from `@tanstack/react-start` (`:1`), `@/world/overpass` (`:2`), `../inspect/tagCache.ts` (`:4`) |
| `realism/TimeDial.tsx` | 113 | React time-of-day scrubber | **app-side** (React UI; stays in CityDesk or moves to a `@citydesk/realism-ui` later — see §2) |

### 1.2 NDU surface that is NOT `realism/` but is gated by NDU flags

The flag system spans more than `src/world/realism/`; the package boundary
must account for each gate:

| Gate | Defined at | Default | Owner after extract |
|---|---|---|---|
| `VITE_NDU_INSPECT`, `VITE_NDU_INSPECT_TAP` | `src/world/inspect/flag.ts:50`, `:56` | dev on, prod off | **stays in app** (inspect is a CityDesk feature; `realism/index.ts:192` reads `inspectAllowed()` today — becomes a config arg) |
| `VITE_NDU_COLLIDE` | `src/world/collide/flag.ts:17` | off | stays in app; realism publishes to the collide bus (`realism/index.ts:313`, `:333`, `:359`) — becomes an injected callback |
| `VITE_NDU_IMMERSE` | `src/world/immerse/flag.ts:11` | on | stays in app |
| `VITE_NDU_GROUND` | `src/world/ground/flag.ts:21` | off | stays in app |
| `VITE_NDU_PROPS` | `src/world/props/flag.ts:18` | off | stays in app |
| `VITE_NDU_ASSISTANT` | `src/world/assistant/flag.ts:11` | off | stays in app |
| `VITE_NDU_FP` | `src/world/fp/flag.ts:112` | dev | stays in app |
| `VITE_NDU_RECEPTION` | `src/world/workverse/receptionSummary.ts:86` | on | stays in app |
| `NDU_PROPS_OVERPASS_URL` | `src/world/props/osmProps.ts:15` | `OVERPASS_URL` | stays in app (QA replay) |
| `NDU_SESSION_*`, `NDU_ADMIN_*`, `NDU_SIGNIN_RATE_PER_MIN`, `NDU_AUDIT_RETENTION_DAYS` | `src/lib/auth/sessions/config.ts:44-53` | — | **not NDU-world at all** — auth/session policy; out of scope |

The core split rule: **pure realism + renderer adapters move; feature gates,
server fns, and CityDesk-domain consumers stay.** The package receives config,
never env.

### 1.3 Citydesk-app coupling inside `realism/` (the seams to cut)

1. **Server fn** — `realism/osmBuildings.ts:100` `createServerFn(...)` is a
   TanStack Start construct. Split: the package exports the *pure cache*
   (`buildingsForCell`, `overpassJob`, `cellOf`, `CellAnswer`); the app keeps a
   thin `createServerFn` wrapper that calls it.
2. **inspect flag** — `realism/index.ts:7` imports `../inspect/flag.ts` and
   calls `inspectAllowed()` at `:192`. Becomes a `RenderConfig.inspectOn`
   argument; the `realism` package stops knowing about inspect.
3. **material catalog** — `realism/index.ts:8` imports `MATERIALS, tintFor` from
   `../render/materialCatalog.ts` (pure data, per its header) and
   `realism/buildingsData.ts:3` imports `fromOsm` from the same file. The
   catalog is pure and moves *into* the realism package (it exists for the
   inspect/realism tint).
4. **shadows** — `realism/index.ts:5` imports `buildingShadows` from
   `../shadows/buildings.ts`, which itself types off
   `realism/buildingsData.ts` (`shadows/buildings.ts:4`) — a cycle. Split: the
   pure `shadows/cast.ts` (`groundShadow`, `LightVector`, `Footprint`) moves
   into the package; the MapLibre mount (`shadows/mount.ts`, `addGroundShadows`
   used at `realism/index.ts:150`) becomes a consumer-side adapter.
5. **collide bus** — `realism/index.ts:11` imports `publishBuildings`,
   `publishEntrances`, `publishTileFootprints` from `@/world/collide/bus`.
   Becomes an injected `publish?: { buildings, entrances, tiles }` hook;
   `collide/bus.ts` stays in the app.
6. **perf tier** — `realism/settings.ts:5` imports `getTier` from
   `@/world/perf/tier`. `deviceTier()` becomes an injected provider (the ADR's
   "config comes in as arguments" rule, `ADR-engine-extract.md:102`).
7. **inspect tag cache** — `realism/osmBuildings.ts:4` imports
   `rememberCellTags` from `../inspect/tagCache.ts`, which imports *back* from
   `realism/heights.ts` (`inspect/tagCache.ts:4-5`). Becomes an injected
   `onCellFetched?` hook.
8. **React UI** — `realism/TimeDial.tsx` (React) stays in the app or a later
   `@citydesk/realism-ui`; it already depends only on `state.ts`/`sun.ts`
   (`TimeDial.tsx:2-3`), so the split is clean.

### 1.4 Consumers of realism (the import-rewrite surface)

Verified by grep for `realism` imports across `src/` — 24 consumer files:

- **App entry:** `CityBuildings.tsx:22-26` (TimeDial, layers, collide, inspectLine),
  `:884-887` lazy `import("@/world/realism")` → `mountRealism(map)`.
- **Other NDU wings** (each imports only core pieces): `scanLayer.ts:12`
  (`scanLook` fns), `life/index.ts:3` + `life/lifeLayer.ts:2-3`,
  `props/index.ts:3-4` + `props/propsLayer.ts:3-4` + `props/osmProps.ts:3-4`,
  `immerse/index.ts:2-3`, `immerse/store.ts:6-7`, `immerse/ground.ts:7-8`,
  `immerse/ImmerseBubble.tsx:2-3`, `immerse/atmos.ts:2`, `immerse/weather.ts:1`.
- **Inspect:** `inspect/runtime.ts:2-3`, `inspect/pick.ts:3`,
  `inspect/profile.ts:4,10`, `inspect/tagCache.ts:4-5`, `inspect/tags.ts:2`,
  `inspect/tags.server.ts:4-5`, `inspect/unique.ts:3`.
- **Collide tests/fixtures:** `collide/collide.test.ts:9`,
  `collide/testutil.ts:2`, `collide/doors.test.ts:7`.
- **Search server:** `search/corpus.server.ts:8` (`buildingsForCell`).
- **FP controller:** `fp/controller.ts:13` (`tappableBuildingLayers`).
- **Assistant:** `assistant/executor.ts:7` (`REAL_BUILDINGS`, `REAL_ROOFS`).

None of these consumers touch CityDesk domain concepts through realism —
realism is already a leaf-ish module; the coupling is **infrastructure**
(tanstack, perf, inspect flag, collide bus), which is why the seams in §1.3
are all injectable hooks rather than rewrites.

## 2. The standalone package: public API

Package: `@citydesk/realism` (subpath exports), placed in the heavy-a2
workspace scaffold. Layout mirrors today's files, with the seams cut:

```
packages/realism/
  package.json          # subpath exports: ".", "./layers", "./server", "./scan", "./react" (later)
  tsconfig.json
  src/
    sun.ts              # from realism/sun.ts (verbatim)
    suncalc.ts          # from realism/suncalc.ts (verbatim, keep BSD header)
    heights.ts          # from realism/heights.ts
    buildingsData.ts    # from realism/buildingsData.ts (now imports local material)
    material.ts         # from realism/material.ts
    materialCatalog.ts  # from render/materialCatalog.ts (moves in — pure data)
    collide.ts          # from realism/collide.ts
    parking.ts
    inspect.ts
    state.ts            # realism/state.ts; localStorage read stays, guarded (already SSR-safe :51)
    settings.ts         # deviceTier() now reads an injected TierProvider
    index.ts            # mountRealism(map, config) + setInspectHighlight
    scanLook.ts         # three.js adapter (peer dep "three")
    osmBuildings.ts     # cellOf/buildingsForCell/overpassJob — createServerFn REMOVED
    layers.ts
    adapters/           # new, thin: shadows-cast (from shadows/cast.ts)
  test/                 # the 6 realism tests + materialCatalog consumers
```

### 2.1 Root export (`@citydesk/realism`)

```ts
// sun / light
export { sunAt, sunVector, keyLight, palette, mapLight, hex, LIGHT,
         zoneFor, zoneOffset, localMinutes, atLocalMinutes, presets, clockLabel,
         compass } from "./sun";
export type { Sun, Palette } from "./sun";
export { getPosition, getTimes, getMoonPosition, getMoonFraction } from "./suncalc"; // vendored

// building data
export { toBuildings, toEntrances, coveredIds, fromTileFeatures, cellStats, inside,
         buildingsForCell, cellOf, overpassJob } from "./buildingsData|osmBuildings";
export type { BuildingFeature, BuildingCollection, BuildingProps, EntranceNode,
              OverpassEl, TileBuilding, TileLanduse, CellStats, CellAnswer } from "./buildingsData";

// heights / materials
export { resolveHeight, parseLength, parseLevels, roofAllowance, LEVEL_M, PLINTH_M, MAX_M } from "./heights";
export type { Tags, Resolved, HeightSource } from "./heights";
export { materialColour } from "./material";
export { MATERIALS, tintFor, fromOsm } from "./materialCatalog";
export type { MaterialKey } from "./materialCatalog";

// collision (mirrors ADR's @citydesk/collision surface — see §5 risk 1)
export { slideMeters, blocksBuilding } from "./collide";
export type { Disc } from "./collide";

// state + render config
export { getRealism, subscribeRealism, refreshRealism, setTimeOverride,
         shownMinutes, setPaletteFilter } from "./state";
export type { RealismState } from "./state";
export { renderSettings, reducedMotion, deviceTier } from "./settings";
export type { RenderSettings, Tier } from "./settings";

// mount
export { mountRealism, setInspectHighlight } from "./index";
export type { RealismMap, RealismMountConfig } from "./index"; // map = the RMap structural type at realism/index.ts:34-60
```

### 2.2 Subpath exports

- `@citydesk/realism/layers` — `REAL_BUILDINGS`, `REAL_ROOFS`,
  `tappableBuildingLayers` (today `realism/layers.ts:2-6`; eagerly imported by
  `CityBuildings.tsx:23`, `fp/controller.ts:13`, `inspect/runtime.ts:3`,
  `inspect/pick.ts:3`, `assistant/executor.ts:7` — must stay tiny/dependency-free,
  per its own comment `realism/layers.ts:1`).
- `@citydesk/realism/scan` — `applyRendererLook`, `prepareModel`, `rigScene`,
  `syncScanLook` (peer dependency `three`; the app's `scanLayer.ts:12` and
  `lifeLayer.ts:2` import this).
- `@citydesk/realism/server` — `buildingsForCell`, `cellOf`, `overpassJob`,
  `CellAnswer`. Node-safe: no `createServerFn`, no `window`. The app's server
  fn (`realism/osmBuildings.ts:100-108`) becomes a 10-line wrapper in
  `src/world/` that imports this subpath.
- `@citydesk/realism/react` (optional, later) — `TimeDial`, extracted from
  `realism/TimeDial.tsx` unchanged (it already depends only on `state.ts`/`sun.ts`).

### 2.3 Config object (what replaces the env reads)

```ts
type RealismMountConfig = {
  tier?: "A" | "B" | "C";          // replaces getTier() from perf/tier (settings.ts:5)
  inspectOn?: boolean;             // replaces inspectAllowed() (index.ts:7,:192)
  tierProvider?: () => Tier;       // live tier, optional
  publish?: {                      // replaces collide/bus imports (index.ts:11)
    buildings?: (f: BuildingFeature[]) => void;   // publishBuildings
    entrances?: (cell: string, e: EntranceNode[]) => void; // publishEntrances
    tiles?: (b: TileBuilding[]) => void;          // publishTileFootprints
  };
  onCellFetched?: (cell: string, els: OverpassEl[]) => void; // replaces rememberCellTags (osmBuildings.ts:4)
  shadowsMount?: (map: RealismMap, fc: BuildingCollection, layer: string) => void; // replaces addGroundShadows import (index.ts:150)
  dev?: boolean;                   // replaces import.meta.env.DEV (index.ts:133,:314,:362,:446)
};
```

Mount signature becomes
`mountRealism(map, config?) : () => void` — defaults reproduce today's behaviour
when the app passes nothing (default tier `"A"`, `inspectOn: false`,
`dev: false`), so a bare-canvas consumer can boot the realism pass with zero
config.

## 3. NDU flags & gates → package config

The `VITE_NDU_*` family are **build-time** flags (`import.meta.env.VITE_*`,
baked at build — see `docs/golive/flags.md:8-10`), while `?flag=0|1` URL
switches and `ndu.*` localStorage keys are **runtime player switches**
(`docs/golive/flags.md:24-27`). The package cannot read either — ADR rule:
"no package imports ... `process.env` (config comes in as arguments)"
(`ADR-engine-extract.md:102`).

Translation table:

| Today | Mechanism | After extract |
|---|---|---|
| Tier gating (`settings.ts:5` `getTier()`) | app perf module | `config.tier` / `config.tierProvider` |
| Inspect material tints (`index.ts:192` `inspectAllowed()`) | `VITE_NDU_INSPECT` + `?inspect=` + localStorage | `config.inspectOn` (app reads its own flag module, passes the boolean) |
| Roof/window/hover effects (`index.ts:163`, `:231-232`, `:394`) | derived from tier inside `renderSettings()` | stays derived inside `renderSettings(tier)` — same behaviour, tier now injected |
| Collide publication (`index.ts:313,333,359`) | eager bus, flag in `collide/flag.ts` | `config.publish` hooks; the app's bus keeps its flag gating — realism just doesn't publish when no hook is given |
| Inspect tag caching (`osmBuildings.ts:4`) | side-effect import | `config.onCellFetched` |
| Ground shadows (`index.ts:150`) | direct import of `shadows/mount.ts` | `config.shadowsMount` |
| DEV logging (`index.ts:133,314,362,446`) | `import.meta.env.DEV` | `config.dev` |
| Sun override persistence (`state.ts:22-32,79-83`) | localStorage `ndu.sun.v1` | stays in package, already SSR-guarded (`state.ts:51`); storage access wrapped in try/catch (`:79-83`) |
| Overpass URL (`osmBuildings.ts:2` via `@/world/overpass:6`) | module constant | becomes a `buildingsForCell` options param (`{ overpassUrl, init? }`) defaulting to the same URL; `NDU_PROPS_OVERPASS_URL` QA override stays an app concern |

All the *player* switches (`?inspect=0`, `?immerse=0`, `ndu.inspect.off=1`,
`ndu.ground`, `ndu.collide.v1`, …) live in flag modules that stay in the app —
the package exposes behaviour, the app decides whether behaviour is on.

## 4. Relationship to the Leaflet retirement (`leaflet-retire.md`)

**The extract neither subsumes nor is subsumed by the Leaflet retirement —
they are orthogonal, and the extract PRECEDES it in the safe order.**

- `leaflet-retire.md` targets two files, `src/world/WorldMap.tsx` (live, via
  `src/routes/map.tsx:11-12`) and `src/world/StreetPlay.tsx` (dead —
  `leaflet-retire.md:13`). Neither imports anything from `src/world/realism/`
  (verified: zero `realism` references in either file; the realism module has
  zero `leaflet` references either).
- The realism subsystem's renderer is **MapLibre**, not Leaflet: realism owns
  `ndu-real-buildings` / `ndu-real-roofs` layers on the MapLibre style
  (`realism/layers.ts:2-3`, mounted at `realism/index.ts:151-176`). Leaflet's
  retirement does not change one line of realism.
- Ordering: doing the NDU extract first is strictly safer because it removes
  the `realism → shadows → realism` cycle (`realism/index.ts:5` ↔
  `shadows/buildings.ts:4`) and the app-side infra imports before anyone
  deletes files in `src/world/`; the Leaflet work is then a two-file delete
  (`leaflet-retire.md:52-71`) plus a dependency drop with a smaller blast
  radius. Conversely, retiring Leaflet first changes nothing the extract needs.
- Overlap risk is nil today, but note: if the `/map` route is deleted per
  `leaflet-retire.md:71` (recommended alternative), `tappableBuildingLayers`
  consumers shrink by one (`fp/controller.ts:13` is the other) — no realism
  change required.

## 5. Migration steps + risks

### 5.1 Steps (each gated by `typecheck` + moved tests, per `ADR-engine-extract.md:120-122`)

1. **Create the package skeleton** in the heavy-a2 workspace (no source yet —
   empty `@citydesk/realism` with tsconfig + subpath exports).
2. **Move the pure core verbatim**: `suncalc.ts`, `sun.ts`, `heights.ts`,
   `material.ts`, `parking.ts`, `inspect.ts`, `collide.ts`,
   `buildingsData.ts`, `materialCatalog.ts` (from `render/`), plus the six
   tests. Fix imports (`../render/materialCatalog` → `./materialCatalog`).
   Gate: typecheck + 6 test files green inside the package.
3. **Move `state.ts` + `layers.ts`** (dependency-free already). Gate same.
4. **Move `settings.ts`** with `deviceTier` switched to an injected
   `TierProvider`; update `scanLook.ts` import.
5. **Move `osmBuildings.ts` minus the server fn**: delete
   `createServerFn` (`:100-108`), parameterise the Overpass URL, replace the
   `rememberCellTags` side-effect with the `onCellFetched` hook. Add a
   server-fn wrapper back in `src/world/realism/` (or a new
   `src/world/realism.server.ts`) that calls `@citydesk/realism/server`;
   `search/corpus.server.ts:8` switches to the package.
6. **Move `scanLook.ts`** with `three` as a peer dependency; app's
   `scanLayer.ts:12`, `lifeLayer.ts:2`, `propsLayer.ts:3` import
   `@citydesk/realism/scan`.
7. **Move `index.ts` (`mountRealism`)** with the §2.3 config: inject tier,
   inspect boolean, publish hooks, shadows mount, dev flag. Split the
   MapLibre `RMap` structural type (`index.ts:34-60`) into the exported
   `RealismMap` type so other renderers can adapt. App's
   `CityBuildings.tsx:884-887` calls `mountRealism(map, appConfig)` where
   `appConfig` wires the app's own flag modules and collide bus.
8. **Move `shadows/cast.ts`** into the package (pure); keep
   `shadows/mount.ts` + `shadows/buildings.ts` in the app, importing the
   package's types — breaks the cycle at its weak edge.
9. **Delete `src/world/realism/`** file-by-file as each consumer's import is
   rewritten; `TimeDial.tsx` moves last (or to a later `realism-ui` package).
10. **Gates:** `npm run typecheck` (0 errors), the moved tests, plus a manual
    smoke of the main MapLibre world (sun/light changes, building heights,
    hover highlight) and `?inspect=1` (material tints must still work via the
    injected `inspectOn`).

### 5.2 Risks

1. **`collide.ts` is claimed by ADR package #3.** `ADR-engine-extract.md:76-77`
   assigns `Disc`/`slideMeters`/`blocksBuilding` to `@citydesk/collision`,
   citing `src/world/realism/collide.ts:3-20` — the very file this extract
   covers. Today `CityBuildings.tsx:24` imports it directly *from*
   `realism/collide.ts`, and `src/world/collide/` (app bus + flag, created
   after the ADR) has no pure-math module of its own. **Decision needed:**
   move the pure functions to `@citydesk/collision` (per ADR) and have realism
   depend on it, or keep them in `@citydesk/realism` and drop that slice of
   `@citydesk/collision`. Default recommendation: keep them in realism
   (matches today's import surface; collision then only holds the app-side
   bus + flag); Sun to confirm, since this touches the ADR's boundary table.
2. **The `realism ↔ shadows ↔ inspect` import cycle.** Today
   `realism/index.ts:5 → shadows/buildings.ts:4 → realism/buildingsData.ts`,
   and `inspect/tagCache.ts ↔ realism/heights.ts`. TS tolerates it; a package
   boundary with clean dep rules may not (ADR: "no package imports another
   app's domain", `ADR-engine-extract.md:103`). Mitigation: move `cast.ts` +
   types into realism (step 8); inject `rememberCellTags` (step 5). Risk if
   left: duplicate type definitions drifting apart.
3. **`materialCatalog.ts` ownership.** It is pure data used by both realism
   and inspect (`inspect/profile.ts`, `inspect/tagCache.ts`). Moving it into
   realism makes inspect depend on the realism package — acceptable (inspect is
   a consumer, `ADR-engine-extract.md:127`), but the package's public API grows
   a data surface it doesn't own conceptually. Alternative: a tiny shared
   `@citydesk/materials` package; defer to Sun.
4. **`state.ts`'s localStorage and the minute timer** (`state.ts:22-32`,
   `index.ts:266` `setInterval`) keep the package browser-bound. The pure
   half (sun math, state shape) is already separable; the persistence and
   timer are optional behaviours, not blockers — a node consumer simply never
   calls `setTimeOverride` and mounts without the timer.
5. **Vendored `suncalc.ts`** (BSD-2, header `suncalc.ts:1-4`) must carry its
   license into the package `LICENSE`/header — mechanical, but easy to forget.
6. **Lazy-chunk behaviour.** Realism is loaded as its own Vite chunk
   (`CityBuildings.tsx:884`, chunk names visible in
   `perf/buildSizes.json:491` `realism-*.js`). A workspace package with
   subpath exports preserves this only if the app keeps the dynamic
   `import("@citydesk/realism")` at the same call site — verify the chunk
   still splits after the move, or the map's first paint regresses.
7. **Merge-order dependency.** The ADR gates `props-lighting` and `terrain`
   extracts on branch merges (`ADR-engine-extract.md:80-85`); realism imports
   *from* those consumers but they do not import from realism's pure core, so
   the realism extract itself is **not** blocked — it can run in parallel with
   the other extracts, in any order relative to them.
8. **Scope creep to `NDU_*` auth env.** `src/lib/auth/sessions/config.ts:44-53`
   uses the `NDU_` prefix but is session policy, not the realism subsystem —
   explicitly out of this extract (documented so a later reader doesn't
   "helpfully" drag it in).

## 6. Acceptance

This ticket (heavy-a4) is **plan only**: this document exists with file:line
evidence, `typecheck` stays 0, and no `src/` file was modified. The extract
itself is a later ticket (per ADR sequence, one of heavy-a3..a8's spirit) and
starts with step 1 of §5.1.
