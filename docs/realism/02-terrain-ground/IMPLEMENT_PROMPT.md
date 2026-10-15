# IMPLEMENTATION PROMPT: CityDesk "Real terrain and ground clamping" (feature 02)

You are a senior TypeScript / WebGL engineer working **on the CityDesk repository** at
`$CITYDESK_HOME` on Lightning studio **the primary host**.
Stack: TanStack Start + React 19 + Vite 8, MapLibre GL JS **5.6.1** (npm, lazy chunk), three.js **0.186.1** custom layers sharing MapLibre's WebGL context, Postgres (migrations in `migrations/*.sql`, applied by `scripts/migrate.mjs` on server start).
Read `PLAN.md` (same folder as this file: `/workspace/neura/realism/02-terrain-ground/PLAN.md` on the operator box; a copy should be placed at `docs/realism/02-terrain-ground/PLAN.md` in your branch) before you start. It holds the reasons and the algorithms. This file holds the **what and in what order**.

---

## 0. Hard rules (non-negotiable)

1. **Back up before editing.** Before your first edit of any existing file, copy it to `~/citydesk-backups/ground-<YYYYMMDD-HHMM>/<same relative path>` (create the folder; never inside `src/`, because the repo already has stray `*.bak.*` files there and we don't add more). Also save `git status --porcelain` and `git diff` to that folder.
2. **Work on a git branch.** `git switch -c feat/ground-clamp`. The working tree has **11 uncommitted files from other agents** (`src/world/{WorldMap.tsx, overpass.ts, places.ts, paths.ts, carto.ts, agents/AgentBoard.tsx}`, `src/routeTree.gen.ts`, `public/statehouse/live.json`, screenshots). **Do not commit, revert, stash-drop or reformat them.** Commit only the files you create or edit for this feature, using `git add <explicit paths>` (never `git add -A` or `git add .`). `paths.ts` is one of the uncommitted files. Change it in one small, clearly separated hunk (ticket T9), and commit it only with `git add -p` so that only your hunk goes in. Never `reset --hard`, force-push or rebase pushed commits. **Do not push** unless the operator asks.
3. **Don't touch unrelated services or cloudflared.** Never use the default `~/.pm2` daemon (it runs unrelated services). Don't run any `pm2` command without `PM2_HOME=$CITYDESK_OPS/.pm2`. Don't start, stop, edit or reconfigure anything under `$CITYDESK_OPS/cloudflared/`, the `citydesk-tunnel` app, or `run-tunnel.sh`. Don't edit `$CITYDESK_OPS/ecosystem.config.cjs`.
4. **Devnet only, no private keys.** This feature needs no wallet, chain or key. Don't read, print, copy or create any keypair, `PROPERTY_KEK`, `.env` secret or token. Don't change `neura.devnet.json` or any Solana config. Leave `app.env` alone, except optionally adding `VITE_NDU_GROUND=off` if the operator asks for a rollback.
5. **Typecheck and test before every restart and every commit:**
   - `npm run typecheck` must show **0 errors**.
   - `node --experimental-strip-types --test src/world/ground/ground.test.ts` (new script `npm run test:ground`)
   - `npm run test:immerse && npm run test:life && npm run test:realism`
   - `node --experimental-strip-types --test src/world/orbit/orbit.test.ts src/world/orbit/view.test.ts src/world/perf/perf.test.ts src/world/placement/placement.test.ts src/world/crowd/crowd.test.ts src/world/traffic/traffic.test.ts src/world/props/props.test.ts src/world/buildings/buildings.test.ts`
   - `npm test`. **14 failures are pre-existing** (in `scripts/grok-pwa-plugin.test.mjs`, `scripts/check-auth-invariant.test.mjs`, `scripts/browser-smoke-verdict.test.mjs`, and a few others). The count must not go up. Don't fix them in this branch.
6. **Restart only the citydesk pm2 process**, and only when needed (Vite dev HMR usually picks up changes; restart after adding the migration or if HMR is stuck):
   `PM2_HOME=$CITYDESK_OPS/.pm2 pm2 restart citydesk`
   Then check: `PM2_HOME=$CITYDESK_OPS/.pm2 pm2 status`, `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/` returns 200, and `tail -n 50 $CITYDESK_OPS/logs/citydesk.err.log` shows no new errors. Never restart `citydesk-db-backup` or `citydesk-tunnel`.
7. **The live dev server serves real users.** Write each new file completely before anything imports it. Keep the feature flag default **off** until ticket T12. One logical edit per save. A half-written file crashes HMR (see the PARSE_ERROR history in `citydesk.err.log`).
8. **No new runtime dependencies** unless a ticket says so. (None do. Decode PNGs with `createImageBitmap` + `OffscreenCanvas`.) No new binary files in git. Fixtures are JSON or base64.
9. **Keep the entry bundle clean.** `src/world/ground/**` (except `flag.ts` and `hooks.ts`) must only load through dynamic `import()` from `immerse/index.ts`, `life/index.ts` or `scanLayer.ts`. Check with `node scripts/with-app-env.mjs npx vite build && node scripts/perf-budget.mjs`, where three.js must not be in the entry and entry gz < 1.2 MB.
10. **Reversible.** With `?ground=0` (or the flag off) the map must behave exactly as before. Every ticket's acceptance includes "flag off = no behaviour change".

---

## 1. Context you must know (verified in the code)

- `src/world/immerse/terrain.ts`: Terrarium DEM from `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. On Tier A it adds `raster-dem` `ndu-dem` (maxzoom 14) and calls `setTerrain({source, exaggeration: 1})`. Tier B is hillshade only (`ndu-dem-hs`, maxzoom 12). Tier C has none. After 6 DEM errors it goes flat silently. `groundElevation()` (line ~112) returns `queryTerrainElevation ?? 0` and is **never called anywhere**.
- In MapLibre 5.6.1 (installed), `queryTerrainElevation` returns `null` with no terrain, and **0 while a DEM tile is loading** (a flat empty DEM). DOM `Marker`s are already positioned at terrain height. Their default `opacityWhenCovered` is 0.2. `fill-extrusion` buildings are lifted by the DEM at their **centroid** (base sunk 10 m when base = 0). The camera has `setCenterElevation`, `setCenterClampedToGround`, and `CameraOptions.elevation`.
- `src/world/scanLayer.ts:142-151` `matrixFor` uses `lib.MercatorCoordinate.fromLngLat([lng,lat], 0)`, so **scans are at sea level and buried on Tier A hills**.
- `src/world/life/lifeLayer.ts:16-21` `mercatorAt` has `z: 0`. Instances use `dummy.position.set(rx, 0, -ry)` (lines ~103 and ~127), and the shadows match. So **the whole crowd and traffic is at sea level** on Tier A.
- `src/world/life/sim.ts` `Agent {rx, ry, rh, fade, leaving, placed}`. `place()` smooths x/y/heading.
- `src/world/life/graph.ts` `Edge`, `Graph`, `along()`, `projector()`. Steps get `vmax 0.7`.
- `src/world/life/tiles.ts:60` drops `brunnel === "tunnel"`, `indoor` and `level`. Bridges are kept but carry no flag.
- `src/world/life/parse.ts` Overpass parser (`out tags geom`).
- `src/world/paths.ts` (the avatar's walk net, **uncommitted, other agents edit it**): `Way {points,name,kind}`. `fetchWays` keeps only `highway`/`name`.
- `src/world/CityBuildings.tsx`: player marker at ~line 464. `placeRaw` ~492. `fit()` ~767 (px per metre per sprite). `map.on("load")` ~794 mounts perf, scans (gated), realism, life and immerse (lazy). `step()` ~889.
- `src/world/orbit/follow.ts` (follow camera, `jumpTo` ~line 250) and `orbit/streetCam.ts` (pure rig maths, tested in `orbit/orbit.test.ts`).
- `src/world/scans.ts:18` `ScanPose {lng,lat,rotation,scale}`. The update SQL is ~line 150. `COLS` is ~107, and `scan-schema.server.ts:28` builds the column list (a "merge guard"). The table is `scan_assets` (`migrations/0009_scan_assets.sql`). The last migration is `0017_units.sql`.
- Flag pattern to copy: `src/world/immerse/flag.ts`.
- Test style: `node:test` + `node:assert/strict`, alias-free relative imports with `.ts` extensions (see `src/world/immerse/immerse.test.ts`, `src/world/life/life.test.ts`).
- Dev handles pattern: `window.__nduLife`, `window.__nduImmerse`, `window.__nduFollow`.
- The Liberty style (`https://tiles.openfreemap.org/styles/liberty`) has layers `bridge_*` (20) and `tunnel_*` (20) on source `openmaptiles`. The `transportation` source-layer carries `brunnel` and `layer`.

---

## 2. Tickets (do them in order; each ends green: typecheck + tests)

### T0: Prep (branch, backup, flag, skeleton)  ·  0.5 d
**Do**
- Back up (rule 1), create the branch (rule 2), and copy `PLAN.md`, `RESEARCH.md` and this file into `docs/realism/02-terrain-ground/`.
- Create `src/world/ground/flag.ts`: `GROUND_KEY = "ndu.ground"`, `groundAllowed()` (false when `VITE_NDU_GROUND === "off"`, `?ground=0|off`, or `!immerseAllowed()`), `groundOn()` (soft switch: `?ground=1` sets localStorage "1", and `?ground=0` sets "0"; default **false** until T12). No imports except `@/world/immerse/flag`.
- Create `src/world/ground/types.ts` with the types from PLAN §4.1.
- Create `src/world/ground/hooks.ts` (static, tiny, no three.js, no DOM-heavy code), modelled on `life/hooks.ts`: `setGroundHandle(h | null)`, `groundHandle()`, `onPlayerSpot(spot)` (no-op when there's no handle).
- In `package.json` add the script `"test:ground": "node --experimental-strip-types --test src/world/ground/ground.test.ts"`.
- In `src/world/immerse/terrain.ts`, `export` the constants `TILES`, `DEM`, `DEM_HS`, `ATTRIBUTION` (no behaviour change).
**Acceptance**: `tsc` 0 errors. The app loads with `?ground=1` and `?ground=0` with no visible change. `git diff --stat` shows only your files.

### T1: Pure DEM maths: `src/world/ground/terrarium.ts`  ·  0.4 d
**Do**: `decodeTerrarium(r,g,b)`, `decodeMapbox(r,g,b)`, `decodeTile(rgba: Uint8ClampedArray, size, enc) → Float32Array`, `lngLatToTilePx(lng, lat, z, size)`, `tilePxToLngLat`, `metresPerPixel(lat, z, size)`, `sampleBilinear(tile, px, py)` (pixel centres at +0.5, clamped edges), `normalAt(tile, px, py, mpp) → {nx,ny,nz,slopeDeg}`, `minMax(h)`. Pure, alias-free, `.ts` imports only.
**Tests** (in the new `src/world/ground/ground.test.ts`): joerd example `rgb(137,219,68) → 2523.265625`; Mapbox `rgb(1,150,136) → 407.2`; tile and pixel round-trip for Honolulu (21.3069, −157.8583), Lagos (6.4541, 3.3947) and Port Harcourt (4.8156, 7.0498) within 1e-9; synthetic ramp and saddle bilinear within 1e-6; a 10% ramp gives slope 5.71° ± 0.01.
**Acceptance**: ≥ 12 asserts green.

### T2: Height cache: `src/world/ground/heightCache.ts` + `demWorker.ts`  ·  0.5 d
**Do**: an LRU of `DemTile` keyed `z/x/y`, with the cap from tier (A 40, flagship-mobile 24, B 16). `ensure(tiles[])` fetches with `fetch(url, {mode:"cors"})` → `createImageBitmap` → `OffscreenCanvas.getContext("2d").getImageData` in a module worker (`new Worker(new URL("./demWorker.ts", import.meta.url), { type: "module" })`). Fall back to the main thread when there are no workers. Transfer the `Float32Array` buffers. `version` increments when tiles land. Use `subscribe(fn)`. Track in-flight de-dupe and a failure bench (like `overpass.ts`: 3 failures then a 2 min cool-down). The URL template comes from `TILES[0]` in `immerse/terrain.ts`, z14. `dispose()` terminates the worker and frees memory. The pure parts (LRU, tile cover for a radius) are exported and tested.
**Tests**: LRU eviction order; `tilesCovering(lng, lat, radiusM, z)` gives 1 tile for 100 m in the middle of a tile and 4 at a corner; the bench logic.
**Acceptance**: tests green; no import of three.js.

### T3: Provider + anchor rule: `src/world/ground/provider.ts`, `relief.ts`, `index.ts`  ·  0.6 d
**Do**
- `createProvider(map, tier)` returns `GroundProvider { mode(), version, heightAt(lng,lat): HeightSample, anchorAt(lng,lat): HeightSample, clusterZ(anchor, pts), normalAt, subscribe, dispose }`, as in PLAN §3.1 and §5.2. It handles: `mode` `off` / `flat` / `terrain3d` (terrain3d iff `map.getTerrain()` is truthy); "drawn = 0 but DEM says |h| > 1 m means not loaded, keep last anchor"; easing τ = 0.25 s, snap if > 30 m or reduced motion; exaggeration factor from `map.getTerrain()`.
- `relief.ts` (pure): `reliefScore(heights) → {range, p90slope}`, `shouldTerrain(tier, score, fps, prev)` with hysteresis (PLAN §5.7). Not wired to terrain yet (that's T11).
- `index.ts`: `mountGround(map, tier)` creates the provider, prefetches on `moveend` (life radius 420 m plus scans within 1.5 km), sets the static `hooks.ts` handle, exposes `window.__nduGround` in DEV (`mode, version, heightAt, anchorAt, stats()`), and returns a disposer.
- Wire it: `src/world/immerse/index.ts` `up()`, after `attachTerrain`, calls `if (groundAllowed() && groundOn()) void import("@/world/ground").then(m => ground = m.mountGround(map, tier))`. `down()` disposes it, and `onTier` forwards it. `attachTerrain` in `terrain.ts` dispatches `window.dispatchEvent(new CustomEvent("ndu-ground", {detail:{terrain:boolean}}))` in `apply`, `removeAll` and the dead path. `groundElevation()` keeps its signature but uses the handle when present (`groundHandle()?.anchorAt(...).h ?? old behaviour`). Add `groundSample()` that returns `HeightSample`.
- `src/world/immerse/mapTypes.ts`: add optional `isSourceLoaded?`, `setCenterElevation?`, `setCenterClampedToGround?`, `querySourceFeatures?`.
**Tests**: anchor rule (drawn 0 with DEM 40 keeps last anchor; easing converges within 1 cm in 1.2 s of simulated dt; snap > 30 m); relief gating and hysteresis; `clusterZ` deltas.
**Acceptance**: with `?tier=A&ground=1` in the browser console, `__nduGround.heightAt(-157.8464, 21.3155).h` is within 0.5 m of `__nduImmerse.map.queryTerrainElevation([-157.8464, 21.3155])` once tiles are loaded. With `ground=0` nothing loads (check the Network tab for no worker).

### T4: Scans on the ground: `src/world/scanLayer.ts`  ·  0.6 d
**Do**
- `matrixFor(pose, baseZ = 0)` uses `fromLngLat([lng,lat], baseZ)`. `Shown` gets `baseZ` and `targetZ`.
- After `load()`, compute footprint corners from `size` × `scale` rotated by `rotation`. With a ground handle in `terrain3d`: base = `anchorAt(centre).h` (centroid convention). If the corner DEM spread is > 0.5 m, base = min(corners) and add a **plinth** mesh (a `BoxGeometry` 1×1×1 scaled to the footprint, from min to centre height, dark `MeshStandardMaterial` `#2b2622`, `polygonOffset`) to that scan's scene. Ease `baseZ → targetZ` in `render` (τ 0.25 s), and call `map.triggerRepaint()` while easing.
- Subscribe to the provider: re-target every shown entry on version or mode change. `moveDraft` and `tap` re-clamp immediately (no easing while dragging).
- Flag off or mode `flat` gives exactly today's matrix (z 0, no plinth).
**Tests** (pure helper `scanBase(cornersZ, centreZ, mode, alt)` in `src/world/ground/pose.ts`): spread < 0.5 m gives the centre; > 0.5 m gives the min plus plinth height; `relative` and `absolute` modes.
**Acceptance**: on Tier A at a hilly spot, a placed GLB stands on the drawn ground (QA: `__nduGround.stats().scans[i].err ≤ 0.1`). It doesn't pop when tiles load. Flag off is unchanged.

### T5: Graph heights: `src/world/life/graph.ts` + `src/world/ground/profile.ts` (ground part)  ·  0.5 d
**Do**
- `Edge` gets `deck: DeckKind` (default `"ground"`), `layer: number` (default 0), and `zs?: Float32Array`. `Graph` gets `nodeZ?: Float32Array` and `zVersion?: number`. `buildGraph` fills the defaults (no behaviour change).
- `profile.ts` (pure): `bakeGraph(g, sample: (lng,lat)=>HeightSample, toLL)` sets `nodeZ`, plus `zs` every ≤ 10 m for edges > 12 m, plus a σ = 8 m Gaussian smoothing pass along connected `ground` edges. It doesn't touch `steps` or deck edges, and keeps abutment nodes. `alongZ(g, e, s)` is a lerp.
- Export `alongZ` from `graph.ts`, or keep it in `profile.ts` and import it into `sim.ts` (alias-free, `.ts` extensions, because `life.test.ts` runs under strip-types).
**Tests**: bake on a 3-edge synthetic graph over a ramp sampler; smoothing removes a 4 m single-node spike on a flat street (residual < 0.5 m) but keeps a real 10 m slope (≥ 9.5 m); NaN-safe.
**Acceptance**: `npm run test:life` green, plus new asserts in `ground.test.ts`.

### T6: Sim + life layer clamped: `life/sim.ts`, `life/lifeLayer.ts`, `life/index.ts`, `ground/pose.ts`  ·  0.9 d
**Do**
- `sim.ts`: `Agent` gets `rz = 0`, `pitch = 0`, `roll = 0`. `place(a, p, h, k, z = 0)` smooths `rz` with `k`. Walkers get `z = g.nodeZ ? alongZ(...) : 0`. Vehicles get `pose.ts vehiclePose(g, e, s, lane, dims)`, which returns `{z, pitch, roll}` from 4 contacts (PLAN §5.5; dims from `traffic/types.ts VEHICLE_DIMENSIONS`; `danfo` and `keke` map directly; `car`/`bus` too), clamped to ±14° and smoothed (τ 0.2 s). Degrade ladder rung ≥ 3 (from `getQuality().step`) uses the centre contact only.
- `lifeLayer.ts`: let `z0 = sim.g.nodeZ ? anchor z at (lng0, lat0) : 0` (provider `anchorAt`, read through a `frame()` field `FrameInfo.z0`). Base translation uses `at.z = z0 × metre` (or `mercatorAt` gains an `alt` parameter: `z: alt * metre`). Instances use `dummy.position.set(rx, rz − z0_dem, −ry)`, where the cluster rule is `rz` minus the DEM at origin. Keep the maths in `provider.clusterZ` semantics. Vehicles use `dummy.rotation.set(pitch, π − rh, roll, "YXZ")`. Shadows go at `y + 0.03`, tilted to the ground normal (vehicles reuse pitch/roll; walkers get the normal from `normalAt` every 0.5 s, cached per agent).
- `index.ts`: subscribe to the ground handle. On version or mode change, call `bakeGraph(sim.g, …)` (debounced 300 ms) and `map.triggerRepaint()`. `FrameInfo` gets `z0`. `anchorOf()` (tap picking and bubble card) uses the ground point lifted by the agent's height. When the probe exists (T10), use `probe.projectAlt`; until then, `map.project` already returns the terrain-height point, which is correct for ground agents.
- Flag off or flat: `nodeZ` stays undefined, so every z is 0 (bit-identical to today).
**Tests**: `vehiclePose` on a 10% grade gives pitch 5.71° ± 0.1, roll 0 on a symmetric camber, and the clamp; `place()` z smoothing; `life.test.ts` still green.
**Acceptance**: `?tier=A&ground=1` at Punchbowl (21.3155, −157.8464), z 18, pitch 60: walkers and cars are visible on the slope, not inside it. The QA p95 foot error is ≤ 0.15 m (T13 script). Draw calls stay 7. Tier B and C are unchanged.

### T7: Avatar and markers on slopes: `CityBuildings.tsx`  ·  0.2 d
**Do**: create the player marker with `opacityWhenCovered: 0.85` (line ~464) and the neighbour markers with `0.5` (~654). In `placeRaw` (~492-498), call `onPlayerSpot(spot)` from `@/world/ground/hooks` (a static tiny file). This is a no-op until T10.
**Acceptance**: on a Tier A slope the YOU figure doesn't fade to 20% while walking uphill. No other change.

### T8: Bridge, tunnel and steps tags through the street data: `life/parse.ts`, `life/tiles.ts`  ·  0.4 d
**Do**: add `deck?`, `layer?`, `incline?`, `stepCount?` to `LRoad` and `LWalk`. `parseStreets` reads `bridge` (any value except `no` → `"bridge"`), `tunnel` (`building_passage` → `"passage"`; `yes|culvert|…` → `"tunnel"`), `layer` (int, clamp −5…5), `incline`, and `step_count`. `streetsFromTiles` reads `p.brunnel` (`bridge` → `"bridge"`, `ford` → ground; tunnel is still dropped) and `p.layer`. `buildGraph` copies `deck` and `layer` onto edges, and onto sidewalk walk edges of bridge roads too.
**Tests** (extend `life/life.test.ts`): Overpass elements with `bridge=yes, layer=1`, `tunnel=building_passage`, and `highway=steps, incline=up, step_count=20` map correctly. A mock `TileMap` feature with `brunnel:"bridge", layer:2` gives a bridge road.
**Acceptance**: `npm run test:life` green; no runtime behaviour change yet.

### T9: Avatar net tags: `src/world/paths.ts` (one hunk, uncommitted file!)  ·  0.2 d
**Do**: `Way` gets an optional `deck?: DeckKind; layer?: number` (import the type from `@/world/ground/types`). In `fetchWays` (and `openPaths` if it's still used), copy them from `tags`. `buildGraph` (in `paths.ts`) adds `deck?: DeckKind[]` parallel to `kind`. `readWard`/`writeWard` keep working with old cached wards (optional fields).
**Acceptance**: `tsc` 0 errors. Commit with `git add -p src/world/paths.ts`, so only your hunk goes in. Mention it in the commit message.

### T10: Profile solver, deck ribbons, avatar deck offset, deck camera  ·  1.5 d
**Do**
- `profile.ts`: `solveDecks(g, sample, opts)` per PLAN §5.4, covering bridges (abutments, crossings with clearance road 5.0 / footway 2.6 / water 0.8 m, `≥ dem + 0.5`, grade ≤ 6% road / 8% foot / 12% boardwalk, approach ramps on `embankment` or `layer ≥ 1` ground edges, `ele` constraints, layer ordering), tunnels (≤ dem − 3 m), and steps (step_count × 0.17 m fallback). It is deterministic, has ≤ 20 relaxation passes, and is chunkable (`budgetMs`). It is called from `bakeGraph` after the ground bake.
- Water polygons for the clearance check come from `querySourceFeatures(openmaptiles, {sourceLayer:"water"})`, cached per bake.
- **Deck ribbons** (Tier A, `terrain3d` only, ≤ 250 m from the focus): one `InstancedMesh` of unit quads (or a single merged `BufferGeometry` rebuilt on bake) in the life layer scene. The width comes from `roadWidth(cls, lanes)` (`graph.ts`), with a colour from the style road colour (`#e9e3d8`-ish) and a low rail line. That's +1 draw call. After the first frame the deck renders, hide the style layers whose id starts with `bridge_` (`setLayoutProperty(id, "visibility", "none")`). Restore them on dispose, mode change, tier change and error.
- **Probe**: `src/world/ground/probe.ts` adds a no-draw custom layer `ndu-ground-probe` (renderingMode `3d`) that stores `args.defaultProjectionData.mainMatrix` each frame, and exports `projectAlt(lng, lat, altM) → {x, y} | null` (canvas CSS px) using `MercatorCoordinate`-equivalent maths (reuse `mercatorAt` from `lifeLayer.ts` with an alt param, or the passed `ml.MercatorCoordinate`).
- **Avatar on decks**: `hooks.onPlayerSpot(spot)` makes the handle find the nearest avatar-net segment (the `paths.ts` net is passed in via `setPlayerNet(net)` from `CityBuildings.loadRoads apply()`). If it's `bridge`, compute `deckZ` and set `player.setOffset([0, dy])` with `dy = projectAlt(deckZ).y − map.project(ll).y` (eased; reset to `[0,0]` off-deck). If it's `tunnel`, set the marker opacity to 0.35 and the plate text to "In tunnel". Do the per-frame update in the existing `step()` through the hook (no new rAF).
- **Deck camera**: in `orbit/follow.ts`, when `groundHandle()?.playerDeckZ()` is a number, call `map.setCenterClampedToGround?.(false)` once and pass `elevation: deckZ` in the follow `jumpTo` (~line 250). Restore clamping when it's null.
**Tests**: all PLAN §8.1 profile cases (a)–(f).
**Acceptance**: QA at an H-1 viaduct spot (pick one with `__nduLife.streetView()` near Kapālama, or any `bridge_*` feature in view). Deck walkers and cars are ≥ 4 m above the DEM under them. The draped bridge lines are hidden only while decks draw. Walking the avatar over the bridge keeps it on the deck, with the camera riding along. `?ground=0` is unchanged.

### T11: Scan altitude persistence + Tier B relief gating  ·  1.0 d
**Do**
- `migrations/0018_scan_ground.sql` (PLAN §4.5, `add column if not exists`, with a header comment in the style of 0009).
- `src/world/scans.ts`: `ScanPose` gets `altMode?: AltMode; alt?: number`. `Row` gets `alt_mode`, `alt_m`, `ground_m`. `toAsset` maps them. The `setScanPose` validator checks `alt ∈ [−50, 500]` and the `altMode` enum. Update the SQL `set … alt_mode = $5, alt_m = $6`, keeping the parameter order safe. `COLS` and `scan-schema.server.ts` include the columns only when they exist (follow the existing 0011 merge-guard pattern).
- `src/world/ScanDesk.tsx`: a "Height" row near rotation and scale, with buttons −1, −0.1, +0.1, +1 m and a mode select (Ground / Relative / Absolute). It goes through the existing `adjust()` and `writePose` and undo history. `scanLayer.ts` uses `pose.altMode`/`pose.alt`.
- Relief gating: `terrain.ts` `apply()` asks the ground handle `shouldTerrain()` (via `relief.ts` + cached DEM). On Tier A, a flat place keeps `setTerrain(null)` (mode flat), with hysteresis. On Tier B, only when allowed **and** the probe fps ≥ 40, add `setTerrain({source: DEM_HS, exaggeration: 1})` (the maxzoom-12 source already loaded). If the degrade ladder steps within 20 s, revert to flat for the session.
**Acceptance**: after `PM2_HOME=$CITYDESK_OPS/.pm2 pm2 restart citydesk`, `_migrations` lists 0018. Old scans render unchanged (alt 0, ground). Nudging +0.3 m persists across a reload. Lagos Island at `?tier=A&ground=1` shows mode flat. Punchbowl at `?tier=B&ground=1` shows terrain3d and soak ≥ 30 fps.

### T12: Flag default on (Tier A), HUD, docs  ·  0.5 d
**Do**: `groundOn()` defaults to true when `getTier().tier === "A"`, or when Tier B relief gating allows it. The player can still turn it off with `?ground=0` or the localStorage "0". Add a dev row in `src/world/perf/hud.ts` (`?perf`): mode, tiles, bake ms, deck count, and max foot error over the last second. Update the docs: new `src/world/ground/GROUND.md` (files, switches, licences, QA); `src/world/immerse/IMMERSE.md` (ground row + `?ground`); `src/world/life/LIFE.md` (z, pitch/roll, decks); `src/world/render/ORDER.md` (deck ribbons in slot 4, `bridge_*` hidden on Tier A); `docs/perf/PERF_BUDGETS.md` (ground budget lines from PLAN §6).
**Acceptance**: all docs updated; `perf-budget.mjs` passes (no entry growth).

### T13: QA script + perf log  ·  0.6 d
**Do**: `scripts/ground-qa.mjs` (Playwright, already a devDependency; read-only against `http://127.0.0.1:8080`) runs the PLAN §8.3 scenarios (Punchbowl Tier A with ground on and off, a bridge spot, Lagos flat gate, Tier B Punchbowl). It reads `window.__nduGround.stats()` and `window.__nduLife.sim()`, prints JSON metrics (p50/p95 foot error, vehicle contact error, scan error, max pop per frame, fps), and writes screenshots to `/tmp/ground-qa/` (not committed). Run `scripts/perf-measure.mjs --soak 60` for `?tier=A&ground=1` and `?tier=B&ground=1` against `ground=0`.
**Acceptance**: every PLAN §2.3 metric is met and pasted into the final summary (and the PR body, if the operator asks for a PR).

---

## 3. Files: create and edit (complete list)

**Create**
- `src/world/ground/{flag.ts, types.ts, hooks.ts, terrarium.ts, heightCache.ts, demWorker.ts, provider.ts, relief.ts, profile.ts, pose.ts, probe.ts, index.ts, ground.test.ts, GROUND.md}`
- `src/world/ground/fixtures/{punchbowl.json, lagos-flat.json, ph-river.json, bridge-overpass.json}` (small JSON, < 30 kB total)
- `migrations/0018_scan_ground.sql`
- `scripts/ground-qa.mjs`
- `docs/realism/02-terrain-ground/{PLAN.md, RESEARCH.md, IMPLEMENT_PROMPT.md}` (copies)

**Edit**
- `src/world/immerse/{terrain.ts, index.ts, mapTypes.ts, IMMERSE.md}`
- `src/world/scanLayer.ts`, `src/world/scans.ts`, `src/world/scan-schema.server.ts`, `src/world/ScanDesk.tsx`
- `src/world/life/{graph.ts, sim.ts, lifeLayer.ts, index.ts, parse.ts, tiles.ts, life.test.ts, LIFE.md}`
- `src/world/paths.ts` (one hunk; `git add -p`)
- `src/world/CityBuildings.tsx` (marker options + one hook call)
- `src/world/orbit/follow.ts`, `src/world/orbit/streetCam.ts` (+ `orbit.test.ts` for the eye-clip helper `eyeClear(eyeAlt, groundAlt) → lift`)
- `src/world/perf/hud.ts`, `src/world/render/ORDER.md`, `docs/perf/PERF_BUDGETS.md`
- `src/world/crowd/types.ts`, `src/world/traffic/types.ts` (optional `altM?`, types only)
- `package.json` (the `test:ground` script only)

**Don't edit**: anything under `src/lib/property/**`, `src/world/property*`, the Solana or neura files, `$CITYDESK_OPS/**` (except reading logs), cloudflared files, `routeTree.gen.ts` (generated), or any of the other uncommitted files.

---

## 4. Commit plan
One commit per ticket, using the message prefix `feat(ground): T<n> …`, with `git add` on explicit paths only. Before each commit, run rule 5's commands and paste the pass/fail counts into the commit body. Don't push. At the end, print `git log --oneline main..feat/ground-clamp` and `git diff --stat main..feat/ground-clamp`.

## 5. Definition of done
- Flag off is byte-for-byte today's behaviour, and flag on meets every PLAN §2.3 metric (QA JSON attached).
- `tsc` shows 0 errors. `test:ground` has ≥ 40 asserts green. The world suites are green, and the `npm test` failure count is still the pre-existing 14.
- No three.js or ground code in the entry chunk. The degrade ladder doesn't step in the 60 s soak.
- Only the `citydesk` pm2 app was restarted (with `PM2_HOME=$CITYDESK_OPS/.pm2`). The unrelated services, cloudflared and tunnel were untouched. No keys were read. Everything stays devnet.
- The final report lists: branch, commits, files changed, test counts, QA metrics, the backup folder path, and any follow-ups (licence decisions from PLAN §12).
