# Plan: canvas -> standalone npm library

- **Ticket:** heavy-a6 (Batch A, governed by `docs/adr/ADR-engine-extract.md`)
- **Date:** 2026-10-12
- **Acceptance:** Plan only — no code migrated.
- **Gate:** doc exists with file:line evidence; `npm run typecheck` stays 0; no `src/` changes.

## Naming note (verified)

"Canvas" here is not one subsystem — the app draws on `CanvasRenderingContext2D`
and `CanvasTexture` in about a dozen places. The **reusable, dependency-free 2D
drawing core** is concentrated in `src/world/kids/` and a few procedural
renderers. That core is the library. Anything importing `three` or React stays
in the app.

## The canvas surface today (file:line verified)

**Pure / reusable (the library):**
- `src/world/kids/coloring.ts` — `PAD` (`:5`), `PALETTE` (`:6` 8-colour set),
  `PictureId`/`PICTURES` (`:16-17`), `drawLineArt(ctx, id)` (`:43` — original
  procedural line art, nothing copied), `hexToRgb(hex)` (`:132`), and
  `floodFill(...)` (`:144`) which the header marks "pure (unit tested)".
  Every function takes a `CanvasRenderingContext2D` — no DOM, no React.
- `src/world/kids/cartoon.ts` — `LOOP_S` (`:7`), `drawCartoon(ctx, t, w, h,
  night)` (`:49`) — the animated scene painter, also context-only.
- `src/world/immerse/patterns.ts` — header "procedural textures drawn in code
  (no downloads, no licences)"; each is a ≤64×64 RGBA tile. Pure pixel work.
- `src/world/workverse/terminalScreen.ts` — renders agent status/telemetry to a
  `CanvasTexture`; the drawing half is pure, the data feed is app.
- `src/world/perf/hud.ts` — the perf HUD painter; pure draw, app data.

**App coupling (stays):**
- `src/world/kids/FlatRoom.tsx:23-30` — the React host: `useRef` +
  `useEffect` + `setInterval`, calls `drawCartoon` (`:28`). React lifecycle is
  app concern; the library only paints.
- `src/world/kids/KidsRoom.tsx` — the room shell (React).
- `src/world/kids/scene.ts:1-4` — imports `three` and `./blocks`/`./sound`;
  this is the 3D scene, NOT part of the 2D canvas library (three-coupled).
- `src/world/address/portrait.ts` — photo-on-your-figure; localStorage + size
  cap (`MAX = 140_000`), app-specific storage, out of scope.

## Library boundary + package name

```
@citydesk/canvas            (the package — zero runtime deps)
  src/
    coloring.ts   drawLineArt, floodFill, hexToRgb, PALETTE, PICTURES
    cartoon.ts    drawCartoon, LOOP_S
    patterns.ts   procedural RGBA tiles
    primitives.ts (new) thin helpers: line/ellipse/roundRect over a 2D ctx
    index.ts      public surface
```

Consumers pass their own `CanvasRenderingContext2D` (browser) or an offscreen
canvas obtained from `OffscreenCanvas` (worker/Node with a canvas shim). The
library never touches `document`, React, or `three`.

## Public API a consumer imports

```ts
import {
  // coloring pad
  PALETTE, PICTURES, drawLineArt, floodFill, hexToRgb,
  // animated scene
  drawCartoon, LOOP_S,
  // procedural textures
  patterns,
} from "@citydesk/canvas";

// pure headless example (no DOM): render line art to any 2D context
drawLineArt(ctx, "home");
const filled = floodFill(data, w, h, 10, 10, [242, 95, 92, 255]);
```

`floodFill` and `drawLineArt` are already exercised in kid-room tests; those
move with the code unchanged.

## npm packaging plan

- **Entry points (package.json `exports`):**
  - `.` → `src/index.ts` (types + ESM) — the whole library.
  - `./coloring`, `./cartoon` — subpath entries so a consumer can tree-shake
    to just the pad or just the scene.
- **Types:** `"types"` alongside each export; the source is TS-first, so build
  emits `.d.ts` via `tsc --emitDeclarationOnly` (or ship `.ts` and let the
  consumer's bundler compile — decide at extract time; the app's current
  `--experimental-strip-types` test path means raw-TS shipping is viable).
- **Build:** `tsc -p tsconfig.build.json` → `dist/` for a publishable artifact;
  no bundler needed (the code has zero deps, so ESM output is sufficient).
- **Zero runtime dependencies** — this is the selling point and matches the
  ADR's "testable in isolation" goal. No `three`, no React in the dependency
  graph.
- **Test:** `node --experimental-strip-types --test` on the moved `*.test.ts`.

## What makes it "leasable" as a lib

A third party can `npm i @citydesk/canvas` and drive a coloring pad, an
animated 2D scene, or procedural textures with their own canvas — no CityDesk
runtime, no React, no three. That self-containment is exactly the property the
leasing model (heavy-a8) requires: the artifact has value on its own.

## Migration steps + risks

1. Create `packages/canvas/` per heavy-a2's generator; move `coloring.ts`,
   `cartoon.ts`, the pure half of `patterns.ts` / `terminalScreen.ts` / `hud.ts`.
2. Add `primitives.ts` (only if a shared helper is duplicated — do not invent
   API that isn't used).
3. App imports switch from `@/world/kids/coloring` to `@citydesk/canvas`;
   `FlatRoom.tsx` keeps its React host and now imports `drawCartoon` from the
   package.
4. Move the tests; they are pure and pass unchanged.

**Risks:**
- **three-coupled neighbours (low):** `kids/scene.ts` imports three — keep it
  in the app; the library is 2D-only. Do not let `scene.ts` drag three into the
  package.
- **`CanvasTexture` (low):** `terminalScreen.ts` builds a THREE `CanvasTexture`;
  only its pixel-painting half moves. Split the file, don't move it whole.
- **OffscreenCanvas in Node tests (low):** `floodFill`/`hexToRgb`/`drawLineArt`
  operate on arrays/contexts and already run headless; a canvas shim is only
  needed if a test wants a real raster.

## Verdict

Feasible as a low-risk pure-module extract of `src/world/kids/` (the drawing
core) plus the procedural-texture painters. Recommended sequencing: after
heavy-a2 (scaffold) and alongside heavy-a5 (ingest) — both are zero-dep pure
extracts. No live code touched by this plan.
