# Ground (realism 02): terrain + ground clamping

Plan: `docs/realism/02-terrain-ground/PLAN.md`. Flag **off by default**.

## Switches
- On: `?ground=1` (remembered in localStorage `ndu.ground=1`). Off: `?ground=0` (stores `0`), `VITE_NDU_GROUND=off`, `?immerse=0`.
- Only does anything where 3D terrain is drawn (Tier A today). Tier B/C and flat places stay mode `flat` (z = 0).

## Files
- `flag.ts`, `hooks.ts`, `types.ts`: tiny/static (CityBuildings, terrain.ts, scanLayer, life use them).
- `terrarium.ts`: decode, tile maths, bilinear, normals (pure).
- `heightCache.ts` + `demWorker.ts`: z14 Terrarium LRU (A 40 / mobile 24 / B 16), worker decode, 3-fail bench.
- `provider.ts`: anchor to drawn ground (`queryTerrainElevation`), shape from DEM deltas, easing τ 0.25 s, snap > 30 m.
- `relief.ts`: relief score + `shouldTerrain` hysteresis (not wired yet: T11).
- `profile.ts`: `bakeGraph` (node heights, ≤ 10 m edge samples, median + Gaussian σ 8 m, bridge/tunnel relaxation lite), `alongZ`.
- `pose.ts`: vehicle 4-contact pitch/roll, `scanBase` + plinth, footprint corners.
- `index.ts`: `mountGround` (lazy chunk from `immerse/index.ts`), prefetch on moveend, `window.__nduGround` in DEV.

## Consumers
- `scanLayer.ts`: scans stand on the drawn ground; plinth when footprint spread > 0.5 m.
- `life/*`: walkers and vehicles get `rz`, vehicles pitch/roll; cluster rule `z0` (drawn at origin) + `rz − dem0`.
- `CityBuildings.tsx`: YOU marker `opacityWhenCovered 0.85`, neighbours 0.5 (flag only); `onPlayerSpot` hook (no-op until decks).

## QA (dev console)
`/map?tier=A&ground=1`, then `__nduGround.stats()`, `__nduGround.heightAt(-157.8464, 21.3155)` vs
`__nduImmerse.map.queryTerrainElevation([-157.8464, 21.3155])`.

## Licences
DEM: Mapzen/Tilezen Terrarium on AWS Open Data (SRTM, USGS, ETOPO1); attribution already on the hillshade source.
