# Feature 04 (inspect any object): build report

Branch `feat/object-inspect` in worktree `$CITYDESK_HOME-wt-04`, based on `origin/main` 42de1e4. Pushed to GitHub, not merged, no live restart.

## Commits
- 6c66407 feat(inspect): P0 T1-T8 foundations + T9 gesture, T10 cell stats, T12 picker/store
- 8cace00 feat(inspect): T10 inspectTags server fn + T11 inspect highlight and material tint
- a8b9775 feat(inspect): T13 sheet UI, T14 CityBuildings wiring, T15 life inspector, T16 place boards, T18 verbs
- (this commit) feat(inspect): T21 migration 0019 + PGLite test, T19 docs

## Tests
- `npm run test:inspect`: 78/78 pass (flag branches, materials, 23 date cases, vehicle dims vs the life models, profiles, uniqueness, affordances, gesture with a fake clock, picker priority/tolerance/dedupe, store, privacy allow-list, server tag cache, rate limit).
- `tests/property/inspect.integration.test.ts`: 4/4 pass (migration applies, checks reject bad values, cascade on delete, FK). `item-cap.pglite` is still 2/2.
- Regression: render, props, proceduralKit, buildings, heights, sun, property-ui, perf, presence.privacy, life, crowd, hud: 155/155 pass.
- `npm run typecheck`: 0 errors.
- `npm test`: the same 14 known failures in `scripts/*.test.mjs`, 0 new.

## Deviations from the plan (and why)
- Branch name is `feat/object-inspect`, as the operator asked (the plan said `feat/inspect-properties`). This is a separate worktree, not the live tree.
- The migration is **0019** because 0017_units and 0018_dispatch are in flight from other agents.
- `getPhysicalMaterial` lives in `render/physicalMaterials.ts`, and `materials.ts` only gains a one-line cache clear. Prop physics live in `inspect/propPhysics.ts` instead of `propsCatalogue.ts`. Both changes avoid merge conflicts with feature 03, which edits both of those files.
- Keke length is 2.62 m, not 2.10 m. That's the drawn model including the front cab (a real Bajaj RE is about 2.6 m), and the test checks against the model.
- Cell stats are served with the tag answer (`inspectTags`) instead of being added to `CellAnswer`. That keeps `buildingsForCell`, which feature 01 also edits, untouched.
- Building heights come from realism `h/b/lv` props directly, which is the same contract 01's footprint fix uses, so the two don't conflict.
- Person sprites (real users) are not inspectable, for privacy. Only place boards are.

## Not done (left for a follow-up)
- T17: material patterns on Tier A, and the `inspectPatterns` degrade rung.
- T19: bundle numbers. `vite build` on main already fails (AddressDesk server import), so there's nothing to measure yet.
- T20: scan raycast (`three-mesh-bvh`). Scans aren't pickable yet.
- T22/T23: property server fns and the link-record UI. `link_record` stays disabled with a reason. Minting is off.
- T24: i18n strings, kids card polish, and a perf soak.
- The bubble card's secondary "Inspect" button (T15). A long-press on a walker or vehicle already opens the inspect card.
- Browser QA: not run, because a live restart isn't allowed. Try it once the branch is live with `/map?inspect=1` (right-click or long-press a building, or press `i`) and `?inspect-tap=1`.

## Confirmations
No pm2 process was restarted. No unrelated service, cloudflared or tunnel was touched. No keys were created or read. Minting is off and everything is devnet only. `app.env` is unchanged. The live tree and the other worktrees were untouched (read-only `git show`/`git diff` only).
