# Audit: feat/terrain-ground — GO-WITH-FIXES

- **Verdict:** GO-WITH-FIXES
- **Date:** 2026-10-11 (post go-live merge; branch now merged into main)
- **Scope:** `src/world/ground/*` (flag, heightCache, hooks, pose, profile,
  provider, relief, terrarium, demWorker), `src/world/immerse/terrain.ts` wiring,
  `src/world/life/*` vertical-Z integration, `src/world/scanLayer.ts` baseZ.
- **Method:** read-only review of the merged code on main.

## Summary

Terrain + ground clamping with a DEM worker, a height cache, and per-frame Z
integration into the crowd sim and scan placement. The merge (which I performed)
kept both the live-side behaviour and the terrain additions in every conflicted
file. The design is clean: the flag gates everything, the worker is off the main
thread, and the sim degrades to flat when terrain is off. Issues are about
failure modes and one real correctness bug in the fallback.

## Security

**GOOD**
- `ground/flag.ts:21` — hard off via `VITE_NDU_GROUND=off`, `?ground=0|off`, or
  immerse off; default OFF (`GROUND.md`, flag docs). No fetch happens with the
  flag off (chunk-level, verified in CityBuildings wiring).
- `ground/demWorker.ts` — DEM fetched in a worker; no credentials, no keys.
- `ground/provider.ts` — provider selection is config-driven; no secrets in the
  path.

**NOTES**
- `ground/hooks.ts` — the DEM provider URL is read from env/config. If a
  third-party DEM tile provider is used, confirm its usage policy (rate limits,
  attribution). Not a code issue.

## Correctness

**ISSUE 1 (height fallback can place objects at the wrong height) — fix**
- `immerse/terrain.ts` (merged) — `groundSample`/`groundZ` in `life/index.ts`
  fall back to `{ z0: 0, dem0: 0 }` when the ground handle is absent or mode is
  not `terrain3d` (`life/index.ts` groundZ). The scan `matrixFor`
  (`scanLayer.ts:156`) falls back to `map.queryTerrainElevation?.()` then 0.
  These fallbacks are correct *when terrain is off*, but if terrain is ON and the
  DEM tile hasn't loaded yet, `queryTerrainElevation` returns undefined and the
  object silently sits at 0 while the map renders terrain — a visible pop when
  the tile arrives. **Fix:** gate placement on `groundReady` (or re-run
  `matrixFor` when the ground handle's first sample lands) so scan objects wait
  for the first DEM sample instead of placing at 0. This matches the existing
  "scans within 1.5 m win" patience in the picker — same idea, applied to Z.

**ISSUE 2 (worker error path is silent) — low**
- `ground/demWorker.ts` — if the worker throws (bad tile, network), the promise
  rejects; callers must catch. Verify every `await demHeight(...)` site has a
  `.catch`/try — the ones I read (`heightCache.ts`) do. If a new call site is
  added later without a catch, it fails the frame. **Fix:** make `demHeight`
  return `{ ok: false }` instead of rejecting (fail-soft), so callers can't
  forget.

**GOOD**
- `life/index.ts` (merged) — `groundCentreOnly = getQuality().step >= 3` on low
  tiers: the crowd only clamps its centre on high quality, so the sim stays
  cheap on weak devices. Correct degradation.
- `life/parse.ts` + `life/tiles.ts` (merged) — vertical tags (`deck`, `layer`,
  `incline`, `stepCount`) parsed via `verticalOf`/`tileVertical`; the merge kept
  both the bridge-deck special case and the general Vertical type. No
  double-counting (verified: `tileVertical` is a superset, the extra spread is
  idempotent for the same keys).
- `ground/heightCache.ts` — cache keyed by cell; `pose.ts` snapshots are pure.

## Performance

- DEM in a worker — main thread stays free (the acceptance "Main <16ms" for
  overpass is a different task; this one is worker-isolated by design).
- `groundZ()` is called per frame in `life/index.ts` but only does work when
  `sim.g.nodeZ && gh.mode() === "terrain3d"` — early-outs to `{z0:0,dem0:0}`
  otherwise. Cheap.
- Height cache prevents re-fetching tiles; confirm eviction policy exists for
  long pan sessions (not verified — worth a look).

## Missing tests

- `ground/ground.test.ts` exists (18/18 pass per the pre-merge gate run).
- **Missing:** a test for the Issue-1 pop: "scan placed before first DEM sample
  waits for it" — hard to unit-test without a map mock, but the placement gate
  (`groundReady`) should have one.
- **Missing:** a worker-failure test (rejected tile → `{ok:false}` path) — easy
  once Issue 2 is fixed (fail-soft makes it testable).

## Files reviewed

| Area | Files | Verdict |
|---|---|---|
| flag | ground/flag.ts | GO |
| height sampling | ground/heightCache.ts, pose.ts, profile.ts | GO |
| DEM fetch | ground/demWorker.ts, provider.ts, terrarium.ts | GO after Issue 2 |
| sim integration | life/index.ts (groundZ, groundCentreOnly) | GO after Issue 1 |
| scan integration | scanLayer.ts (matrixFor baseZ) | GO after Issue 1 |
| parsing | life/parse.ts, life/tiles.ts | GO |

## Recommendation

Fix Issue 1 (gate scan Z-placement on the first DEM sample — prevents the
visible pop) and Issue 2 (fail-soft DEM errors). Both are small. The flag
default-off, worker isolation, and quality degradation are all correct. GO for
production once the two fixes land; the terrain feature itself is sound.
