# Audit: feat/realism-03-props-lighting — GO

- **Verdict:** GO
- **Date:** 2026-10-11 (post go-live merge; branch now merged into main,
  carrying the inferProps speed-test fix)
- **Scope:** `src/world/props/*` (propsLayer, lighting, infer, flag, catalogue,
  proceduralKit, codec, dimensions, geo, parse, osmProps), the fixtures.
- **Method:** read-only review of the merged code on main.

## Summary

Real-size OSM street furniture (lamps, trees, parked cars, benches, bins) with
night-glow halos, LOD tiers, and deterministic procedural inference. The
engineering is strong: instanced meshes with per-tier caps, a deterministic PRNG
(same input → same output, tested), a priority-capped output, and the halo
face-camera helper is unit-tested. The one pre-merge failure (the inferProps
speed test flaking under load) was fixed on the branch before merge — the
implementation was never the problem.

## Security

- No secrets, no keys, no network beyond the already-audited Overpass path
  (shared with realism). `props/flag.ts` reads only `VITE_NDU_PROPS`.
- `infer.ts` is pure: no DOM, no fetch, no storage. The procedural kit generates
  geometry in code (nothing copied — the coloring/kit headers say so).
- No injection surface: props come from OSM tags through the existing
  sanitised parse path.

## Correctness

**GOOD**
- `lighting.ts:89` — `haloFacing(pitch, bearing)` returns the Euler that turns a
  +Z quad toward the camera; pitch 0 = face-up. Tested (`haloFacing.test.ts`,
  6/6) including the regression that halos re-face every frame the camera moves
  (the last commit on the branch fixed edge-on/invisible halos).
- `infer.ts` — deterministic: `mulberry32` seeded by stable ids, `hashSeed` for
  variants; the "is deterministic" test asserts deepEqual across runs.
- `infer.ts` — the cap/priority logic (§7.2: lamps > signals > trees > benches
  > kit) keeps the highest-value props when over `maxProps`. Correct.
- `infer.ts` — dedupe within 0.5 m per bucket, with the multi-head-signal
  exception. Correct.
- The speed guard (wave-3, `infer.test.ts`): best-of-5 < 250 ms — the algorithm
  runs 2.8-10 ms idle; the 50 ms single-sample guard flaked at studio load ~10.
  191/191 stable across three runs. The fix was test-side, honestly documented.

**NOTES**
- `propsLayer.ts` — instanced meshes with `MAX_LIGHTS`/tier caps
  (`TIER_LOD.A.caps.*`). If a cell exceeds a cap, extras are dropped by priority
  (not rendered) — acceptable, matches the §7.2 design.
- `dimensions.ts` / `geo.ts` — pure helpers, unit-tested.

## Performance

- InstancedMesh throughout (`propsLayer.ts:123-130`) — draw calls bounded by
  tier caps, not prop count. This is the right design for street furniture.
- LOD by tier (`TIER_LOD`) — fewer props on weak devices.
- `infer.ts` runs once per cell (cached with the cell), not per frame.
- **Note (future, not blocking):** distance-LOD for props/crowd is its own
  queued task (upg-u-061); the current tier system is a reasonable first cut.

## Missing tests

- Comprehensive already: infer (191), codec, dimensions, flag, geo, lighting,
  lod, osmProps, parse, proceduralKit, props, weatherFx, haloFacing — all pass.
- **Missing (minor):** a test that the tier caps actually drop lower-priority
  props when exceeded (the cap logic is in propsLayer, harder to unit-test
  without a renderer — the infer-side cap IS tested, the layer-side drop is
  not). Low priority.

## Files reviewed

| Area | Files | Verdict |
|---|---|---|
| night lighting | lighting.ts, haloFacing.test.ts | GO (regression-tested) |
| inference | infer.ts, infer.test.ts | GO (deterministic, fast) |
| rendering | propsLayer.ts (instanced, tiered) | GO |
| flag | flag.ts (off/beta/on) | GO |
| catalogue/kit | propsCatalogue.ts, proceduralKit.ts, codec.ts, dimensions.ts, geo.ts, parse.ts, osmProps.ts | GO |

## Recommendation

GO for production. No security issues, no correctness bugs found, performance
design (instancing + LOD + tier caps) is sound, and test coverage is
comprehensive. The pre-merge speed-test flake was correctly fixed test-side
before merge. Nothing blocks shipping this feature with the flag on.
