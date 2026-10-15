# Collide: avatar collision and walking in through real doors (NDU-UPG collide)

Plan: `~/handoff/realism/01-collision-doors/` (PLAN.md, RESEARCH.md, IMPLEMENT_PROMPT.md).

## Flags
- `?collide=1|0` (persists in localStorage `ndu.collide.v1`), kill switch localStorage `ndu.collide.off=1` (wins),
  env `VITE_NDU_COLLIDE=on|off`. **Default off everywhere** (the live server is `vite dev`, so the "dev default on" from the prompt was not applied).
- Sub-flags: `?collide-debug=1` (red edge lines, `__nduCollide.place`), `?collide-camera=0`, `?collide-dyn=0` (reserved).
- Flag off: `bus.ts` publishers return at once and `CityBuildings` never imports the `@/world/collide` chunk; the legacy `step()` branches run.

## Data flow
realism `redraw()` / `scanNow()` / `loadCell()` → `bus.publishBuildings / publishTileFootprints / publishEntrances`;
`CityBuildings.loadRoads.apply()` → `publishRoadNet`. The lazy chunk (`index.ts mountCollide`) subscribes, rebuilds a
`CollisionWorld` (600 m window, Tier C 400 m) in idle time, infers doors (tagged OSM `entrance`/`door` nodes first,
then deterministic synthetic doors facing the nearest road), and draws `ndu-doors-3d` / `ndu-doors-dot`.

## Modules (pure unless noted)
`flag` `bus` `types` `enu` `geom` `grid` `world` `move` (slideMove, tickStuck, magnetise) `eject` `doors` `trigger`
`route` (grid A*, needsDetour) `camera` (occlusion probe) · DOM/MapLibre: `layers`, `index`.

## QA hooks
`window.__nduCollide = { stats, world, probe(lat, lng), place(lat, lng) }` (`place` dispatches `ndu-collide-place`; dev or debug only).

## Constants
R 0.30 m, skin 0.01, substep R/2, 4 depenetration passes, headroom 2.2 m, grid 6 m, door near 2.5 m, walk-in 0.35 s, cooldown 1.5 s.

## Known limits / not done yet
- Camera occlusion: `camera.ts probeCamera` + `handle.camera()` exist and are tested, but `follow.ts` boom pull-in and the
  `ndu-ghost-buildings` layer are not wired (CD-COL-13 integration).
- Workverse spawn-at-door / walk-out (CD-COL-12 scene part) not wired: the scene renders only the flagship layout today.
- Passages (`tunnel=building_passage`) not opened yet; dynamic obstacles (CD-COL-14) not started.
- Fixture is synthetic (Overpass was unreachable on 2026-10-10); re-capture a real cell with one request when possible.
- `scripts/collide-smoke.mjs` (Playwright) not written; browser QA not run.
