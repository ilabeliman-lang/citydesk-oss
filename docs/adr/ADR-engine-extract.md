# ADR: CityDesk real-world engine package split

- **Status:** Proposed
- **Decision:** **Proposed**, pending Sun (Wei)
- **Date:** 2026-10-11
- **Tickets:** heavy-a1 (this ADR) → heavy-a2 (scaffold) → heavy-a3..a8 (extracts) → heavy-a9 (bare example) → heavy-a10 (audit). Batch A of `handoff/HEAVY_BATCHES.md`.
- **Related:** `handoff/HEAVY_BATCHES.md` (Batch A); every file:line below is citydesk main (`f9bd574`).

## Context

`src/world/` has grown into a mix of engine code (pure math, collision,
terrain sampling, prop spawning, avatar rigs, XR helpers) and application code
(React components, routes, server fns, auth). Today the engine half can only be
reused by copying files out of the app. Batch A asks: split the engine into
reusable packages so a bare canvas — no React, no CityDesk routes — can boot
terrain + avatar + one prop.

What actually exists today (verified on main):

- **Pure math/geo:** `src/world/trip.ts:16` `metersBetween`, `:26` `cumulative`, `:33` `splitAt`, `:76` `clock` — dependency-free functions over `Pt` points.
- **Collision:** `src/world/realism/collide.ts:3` `Disc`, `:6` `slideMeters`, `:20` `blocksBuilding` — pure functions + OSM-tag reading.
- **Terrain/ground:** on branch `feat/terrain-ground` (worktree `citydesk-wt-02`): `src/world/ground/heightCache.ts`, `pose.ts`, `demWorker.ts`, `hooks.ts` — height sampling + bridge clamping. Not on main yet.
- **Props/lighting:** `src/world/props/proceduralKit.ts`, `propsCatalogue.ts` (main); the lighting/halo side lives on `feat/realism-03-props-lighting` (`citydesk-wt-03/src/world/props/lighting.ts`).
- **Avatar-ish:** `src/world/life/scale.ts` (`lifeScales`, `walkerScale`, `vehicleScale`), `src/world/life/sim.ts`, `src/world/life/ride.ts` — per-kind scaling + walk/ride simulation, exported via `src/world/life/index.ts:47-48`.
- **XR:** `src/world/xr/matrix.ts:5` `XrDeviceName`, `:15` `deviceMatrix` — a small device-capability table.
- **Scene/clocks/layers:** no standalone module; the frame loop is embedded in React components (`src/world/CityBuildings.tsx`, `src/world/scanLayer.ts` use `requestAnimationFrame`).

## Options

### A. Seven packages + example (recommended)

`@citydesk/math`, `@citydesk/world-core`, `@citydesk/collision`,
`@citydesk/terrain`, `@citydesk/props-lighting`, `@citydesk/avatar`,
`@citydesk/xr`, plus `packages/examples/bare`.

- Pros: each package has one reason to change; the bare example proves the
  engine works without React; CityDesk becomes a thin adapter; testable in
  isolation (most of the code is already pure and unit-tested — `collide.test.ts`,
  `heights.test.ts`, `matrix.test.ts`).
- Cons: workspace + build-tooling overhead; some files straddle the boundary
  (e.g. `life/index.ts` mixes scaling with DOM binding via `mountLife`, `:56`);
  terrain and props-lighting are still on unmerged branches, so their extracts
  wait for those merges.

### B. One `@citydesk/engine` package

Everything engine-ish in a single package.

- Pros: no boundary debates, one version to bump.
- Cons: re-creates today's monolith inside a package; the bare example would
  still pull in collision and props when it only wants terrain; the boundary
  problems Batch A exists to solve come back.

### C. Copy-paste per app (status quo)

Keep everything in `src/world/`; apps copy files.

- Pros: zero setup.
- Cons: the exact problem Batch A describes; divergent copies drift.

## Decision

**Proposed: A.** Split into seven packages with a dependency-strict layering,
extracted smallest-first. Nothing moves until Sun accepts.

### Package boundaries (what each owns — with the real code it would take)

1. **`@citydesk/math`** — pure geo/scalar math. Takes `metersBetween`,
   `cumulative`, `splitAt` (`src/world/trip.ts:16-60`) and similar helpers.
   Depends on nothing. **Does not** import React, the DOM, or OSM tag shapes.
2. **`@citydesk/world-core`** — scene graph types, clocks, layers. Today this is
   the thinnest package: the frame-loop code embedded in
   `src/world/CityBuildings.tsx` and `src/world/scanLayer.ts` gets extracted
   into a renderer-agnostic clock/layer API. No React.
3. **`@citydesk/collision`** — AABB/disc collision + building blockers:
   `Disc`, `slideMeters`, `blocksBuilding` (`src/world/realism/collide.ts:3-20`),
   with fixtures from `collide.test.ts`. Depends on math only.
4. **`@citydesk/terrain`** — height sampling + bridge clamp API, from the
   `feat/terrain-ground` branch (`src/world/ground/heightCache.ts`, `pose.ts`).
   Depends on math. **Blocked on that branch merging** (extract after GO on
   `docs/audits/terrain-ground.md`).
5. **`@citydesk/props-lighting`** — prop spawning + night halo:
   `proceduralKit.ts`, `propsCatalogue.ts` (main) + `lighting.ts` /
   halo-facing behaviour (`feat/realism-03-props-lighting`). Depends on math,
   world-core. **Blocked on that branch merging.**
6. **`@citydesk/avatar`** — avatar controller hooks + per-kind scales:
   `lifeScales`, `walkerScale`, `vehicleScale` (`src/world/life/scale.ts:47`),
   walk/ride sim (`sim.ts`, `ride.ts`). Depends on math, collision (walkers
   collide), terrain (feet on ground). The DOM-binding half of `life/index.ts`
   (`mountLife`, `:56`) **stays in CityDesk** — the package exposes the sim, the
   app wires it to a map.
7. **`@citydesk/xr`** — WebXR helper + device matrix: `XrDeviceRow`,
   `deviceMatrix` (`src/world/xr/matrix.ts:5-15`). Depends on nothing (or
   world-core types at most).

### Dependency rules (enforced by each package's imports + a lint rule later)

- Allowed edges: `math ← everything`; `collision → math`; `terrain → math`;
  `props-lighting → math, world-core`; `avatar → math, collision, terrain`;
  `xr → math, world-core`; `world-core → math`.
- **Must NOT cross:** no package imports React, `@tanstack/*`, `src/routes`,
  server-only modules, or `process.env` (config comes in as arguments). No
  package imports another app's domain (no property, auth, or Neura code in the
  engine). `world-core` must not depend on any renderer — three.js/Maplibre
  adapters live in the app or in a separate adapter package.

### Migration order (smallest blast radius first)

1. `@citydesk/math` (pure, zero deps — `trip.ts` helpers move first).
2. `@citydesk/xr` (tiny, self-contained — `matrix.ts`).
3. `@citydesk/collision` (pure + existing tests: `collide.test.ts`).
4. `@citydesk/world-core` (extract the frame loop; defines the clock/layer API
   the rest build on).
5. `@citydesk/terrain` — **after** `feat/terrain-ground` merges.
6. `@citydesk/props-lighting` — **after** `feat/realism-03-props-lighting` merges.
7. `@citydesk/avatar` (depends on 1, 3, 4, 5 — extract last of the engine).
8. `packages/examples/bare` — boots terrain + avatar + one prop with no React;
   this is the acceptance proof for Batch A.

Each extract (heavy-a3..a8) is its own branch off heavy-a2's scaffold, gated by
`typecheck` + the moved tests passing; CityDesk imports the package instead of
the file in the same PR.

## Consequences

- CityDesk's `src/world/` shrinks to app adapters; the engine is reusable by
  the bare example and future apps (e.g. the AR scanning vision).
- Tests move with their code (`collide.test.ts`, `heights.test.ts`,
  `matrix.test.ts`) and keep running inside each package.
- The terrain and props-lighting extracts are gated on branch merges — the ADR
  sequence assumes `feat/terrain-ground` and `feat/realism-03-props-lighting`
  land (each needs its audit GO first).
- Files that straddle engine/app (`life/index.ts`'s `mountLife`) get split at
  the seam; if a clean split proves impossible, that piece stays in the app and
  the package exposes only the sim.
- Workspace tooling (heavy-a2) must exist before any extract; `pnpm-workspace.yaml`
  or npm workspaces — decide in heavy-a2, not here.
- Rejected: single `@citydesk/engine` (re-creates the monolith), copy-paste
  (status quo, defeats the batch).

## Open questions for Sun

- pnpm workspaces vs npm workspaces for the scaffold (heavy-a2).
- Publish scope: private-only for now, or OSS-prep later (Batch B touches this).
- Whether the bare example targets three.js or a 2D canvas first (affects what
  `world-core`'s clock API must abstract).
