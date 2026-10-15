# Plan: monorepo scaffold — tools/generate-all + studio

- **Ticket:** heavy-a2 (Batch A, governed by `docs/adr/ADR-engine-extract.md`)
- **Date:** 2026-10-12
- **Acceptance:** Plan only (+ self-contained generator skeleton, no src/ changes)
- **Deliverables:** this plan + `tools/generate-all.mjs` skeleton + `tools/README.md`

## Current repo layout (verified on main)

- `package.json:2` — name `app-builder-workspace`, **already a workspace-style
  name**, but there is **no `workspaces` field and no pnpm-workspace.yaml /
  turbo.json / nx.json** — it is a single-package app today (`"private": true`
  at `:3`, `"type": "module"` at `:5`).
- Scripts run through a wrapper: `package.json:10` `dev` is
  `node scripts/with-app-env.mjs vite dev ...` — every script prefixes
  `scripts/with-app-env.mjs` (the env-injection wrapper). Any generator must
  respect that convention.
- Code lives flat under `src/` (`src/world/*` = the extract targets,
  `src/lib/*` = app libs, `src/routes/*` = TanStack routes). There is no
  `packages/` directory today.
- The ADR (`ADR-engine-extract.md:30-34`) already chose **Option A: seven
  packages + example**, with the boundaries, dependency rules, and migration
  order fixed at `:63-122`.

## The nine extract targets (from the ADR)

The ADR names seven engine packages; Batch A's "all 9" adds the two non-engine
extracts from the same batch:

| # | Package | Source (ADR) | Layer |
|---|---|---|---|
| 1 | `@citydesk/math` | `src/world/trip.ts:16-60` | deps: none |
| 2 | `@citydesk/world-core` | frame loop out of `CityBuildings.tsx`/`scanLayer.ts` | deps: math |
| 3 | `@citydesk/collision` | `src/world/realism/collide.ts:3-20` | deps: math |
| 4 | `@citydesk/terrain` | `src/world/ground/*` (feat/terrain-ground) | deps: math |
| 5 | `@citydesk/props-lighting` | `props/*` + `lighting.ts` (feat/realism-03) | deps: math, world-core |
| 6 | `@citydesk/avatar` | `src/world/life/*` | deps: math, collision, terrain |
| 7 | `@citydesk/xr` | `src/world/xr/matrix.ts:5-15` | deps: math, world-core |
| 8 | `@citydesk/ingest` | `src/lib/ingest/*` (heavy-a5 plan) | deps: none (pure) |
| 9 | `@citydesk/canvas` | `src/world/kids/*` drawing core (heavy-a6 plan) | deps: none (pure) |

`packages/examples/bare` is the acceptance proof (ADR `:117`), not an extract.

## Proposed directory shape

```
citydesk-impl-docs/            (repo root — becomes the workspace root)
├── package.json              add "workspaces": ["packages/*"]
├── tools/
│   ├── generate-all.mjs      the generator (skeleton added)
│   └── README.md             how to run it
├── packages/
│   ├── math/  world-core/  collision/  terrain/
│   ├── props-lighting/  avatar/  xr/  ingest/  canvas/
│   │     └── each: package.json, tsconfig.json, src/, *.test.ts
│   └── examples/bare/        boots terrain+avatar+prop, no React
├── src/                      the CityDesk app (imports the packages)
└── scripts/with-app-env.mjs  unchanged — env wrapper
```

Shared tooling lives in `tools/` (not a package): the generator, plus the
future dependency-lint rule the ADR calls for (`ADR:78` "a lint rule later").

## Generator contract (`tools/generate-all`)

`node tools/generate-all.mjs <package-name>` produces a ready package
skeleton, self-contained, touching nothing outside `packages/<name>/`:

- `packages/<name>/package.json` — name `@citydesk/<name>`, `"private": true`
  until leasable, `"type": "module"`, `exports` with `types` + `import`, a
  `test` script (`node --experimental-strip-types --test`), and
  `devDependencies` matching the app's TS/vite versions.
- `packages/<name>/tsconfig.json` — extends the root tsconfig, `rootDir: src`,
  `declaration: true`, `outDir: dist`.
- `packages/<name>/src/index.ts` — the single public entry (re-exports).
- `packages/<name>/README.md` — boundary + deps, pre-filled from the ADR table.

The generator is idempotent: it refuses to overwrite an existing package unless
`--force`. It validates the name against the ADR's nine, so a typo can't create
a tenth.

## How `studio` composes the extracts

"studio" is the app's role in the monorepo: the root `package.json` (today
`app-builder-workspace`) is the studio — it depends on the workspace packages
via `"@citydesk/*": "workspace:*"` and `src/` imports them by package name
instead of relative paths. No new "studio" package; the root already is one.
The bare example (`packages/examples/bare`) proves the packages work without
React — it is the acceptance gate for Batch A.

## Migration order (per the ADR, smallest blast radius first)

1. `math` (pure, zero deps) — scaffold + move `trip.ts` helpers.
2. `xr` (tiny, self-contained).
3. `collision` (pure + existing `collide.test.ts`).
4. `world-core` (extract the frame loop; defines the clock/layer API).
5. `terrain` — **after** `feat/terrain-ground` merges (GO on
   `docs/audits/terrain-ground.md`).
6. `props-lighting` — **after** `feat/realism-03-props-lighting` merges.
7. `avatar` (depends on 1,3,4,5 — last of the engine).
8. `ingest` (heavy-a5 — low coupling, can land any time after the scaffold).
9. `canvas` (heavy-a6 — pure drawing core).
10. `examples/bare` — the acceptance proof.

Each extract is its own branch off this scaffold (heavy-a3..a8 already are),
gated by `typecheck` + the moved tests passing; the app swaps the file import
for the package import in the same PR.

## What was added (skeleton, self-contained)

- `tools/generate-all.mjs` — the generator described above. Creates files only
  under `packages/<name>/`; **no existing src/ or config touched**.
- `tools/README.md` — usage + the ADR's nine-package table.

The root `package.json` was **not** modified (adding `workspaces` is the one
line the first extract PR adds, together with the first `workspace:*` dep — so
the scaffold stays inert until an extract lands). typecheck stays 0.

## Risks

- **Workspace activation (low):** adding `"workspaces"` changes npm install
  semantics; do it in the first extract PR, verified by a clean
  `npm install` + `npm run typecheck`, not in this scaffold.
- **Env wrapper (low):** scripts must keep the `scripts/with-app-env.mjs`
  prefix (`package.json:10`); the generator's `test` script intentionally does
  not need it (pure tests), but a future `build` would.
- **Version drift (low):** package tsconfig extends the root; a root TS bump
  propagates — desired, but note it in each package README.
