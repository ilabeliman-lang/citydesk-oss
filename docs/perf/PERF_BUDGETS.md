# NDU perf budgets, tiers and degrade ladder (perf track, branch `upg/perf-tiering`)

Items: #501–#504 (P0), #507–#509, #515, #524, #528, #537, #539, #541, #549, #550 (P1; some partial, see PR).

## Budgets (bible 02, mobile)
| Budget | Gate |
|---|---|
| Entry JS gzip < 1.2 MB (soft warning at 300 kB) | `scripts/perf-budget.mjs` (CI: `.github/workflows/perf-budget.yml`) |
| three.js not in the entry or first-map chunks | `scripts/perf-budget.mjs` |
| First map paint < 4 s on mid Android 4G | `scripts/perf-measure.mjs --budget` (manual/weekly; needs a running server) |
| Memory < 250 MB | `perf-measure.mjs --budget`, plus the runtime watchdog (Tier C above 250 MB JS heap) |
| Tier B ≥ 30 fps | degrade ladder at runtime; `perf-measure.mjs --soak 60` |

## Tiers (`src/world/perf/tier.ts`)
Decided once per session from the GPU renderer string, `deviceMemory`, `hardwareConcurrency`, mobile, Save-Data,
then lowered (never raised) by a 2 s fps probe after the map settles.
- **A**: desktop, or flagship phone (Adreno 7xx+, Apple A15+/M, Mali-G7xx+, ≥ 6 GB). The map is unchanged.
- **B**: other phones (iPhone Safari reports "Apple GPU" → B), data saver, < 4 GB, probe < 45 fps. Pixel ratio ≤ 2, tile cache 160 tiles / 3 zoom levels, no expired-tile refresh.
- **C**: no WebGL, software GL (SwiftShader/llvmpipe), ≤ 2 GB, ≤ 2 cores, weak GPU, probe < 20 fps. Pixel ratio ≤ 1.5, max pitch 60°, extrusions within 400 m, raster/hillshade layers hidden, blur off, tile cache 96.
- QA override: `?tier=A|B|C`. `?perf` shows the HUD. `?perf-sim-fps=15` feeds fake fps to the ladder.

## Degrade ladder (`ladder.ts`, `degrade.ts`)
The bible's order, one rung per 5 s under 30 fps: **SSAO → bloom → extrusion distance → skinned count**, and
**Tier C if fps < 20 for 10 s**. Names, ticks and the phone UI are never touched. Sticky for the session.
An automatic Tier C shows a "Light map on · Full map" chip; "Full map" is the player's opt-back (no auto Tier C again that session).
SSAO/bloom/skinned are published flags (`getQuality()`) for the Three-drawn features that do not exist yet. The extrusion rung caps the
MapLibre `building-3d` layer with a `distance` filter, re-centred only after moving a third of the radius.

## Startup waterfall (#541)
HTML (SSR) → entry JS `index-*` (135 kB gz) → route chunk → `WorldMap` (28.6 kB gz, was 166 kB with three.js) + leaflet (43 kB gz, hidden legacy map)
→ MapLibre JS/CSS → style JSON + glyphs + vector tiles (tiles.openfreemap.org, preconnected) → first map paint (`ndu:map-load` mark)
→ Overpass roads (dns-prefetched) → avatar sprites → **only if a placed scan is within 1.5 km or Scans is opened:** scanLayer + three.js (140 kB gz).

## How to measure
```
node scripts/with-app-env.mjs npx vite build
node scripts/perf-budget.mjs --json perf.json [--baseline base.json --md diff.md]
node scripts/perf-measure.mjs --url http://127.0.0.1:8084/ --runs 3 --profile 4g --query tier=A --json m.json
node scripts/perf-measure.mjs --url http://127.0.0.1:8084/ --query "tier=B&perf-sim-fps=15" --expect-tier-c
```
`4g` profile = Lighthouse mobile (4x CPU, 150 ms RTT, 1.6/0.75 Mbps, 390x844 @3x). Headless Chrome renders WebGL with SwiftShader,
so absolute paint times are far slower than a phone; compare before/after on the same box and prefer the byte counts.

## Measurements log (#522)
See the PR body for the 2026-10-08 baseline vs branch numbers.
