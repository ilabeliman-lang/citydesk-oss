# NDU / CityDesk — what the markdown asked for, and what is in the tree

Checked 2026-10-08 against the plan markdown (`NDU_1000_UPGRADES.md`, `NDU_AIML_UPGRADES.md`, `NDU_CONTINUE_PLAN.md`, `NDU_DESIGNER_AGENT_PLAN.md`, `NEURA_LAPTOP_COMPUTE_DRAFT.md`) and the code on this branch. This is the best tree: GitHub `main` plus the two finished AI tracks. No new migration. Minting stays OFF. GreenFunds stays out.

## Shipped (in this tree)

| Markdown ask | Where it landed |
| --- | --- |
| ADR, Bubblegum freeze note, devnet indexer spike (NDU-2 docs) | PR #1. Signing is still Wei's decision. Mint flag stays OFF. |
| Property QA, migration 0010 dry run, CI | PR #2 |
| Isometric empty building / object / owner override | PR #3 |
| USDZ to GLB, validate, optimise, status chips | PR #4 |
| Lazy three.js, device tiers, perf budgets | PR #5 |
| Real sun, tag heights, sRGB/ACES, GL state | PR #6 |
| Embossed bubble HUD | PR #7, phones default to bubbles in PR #14 |
| Live street + property build, claim 500 fix, item-cap lock | PRs #8–#10 |
| 360° drag, compass, N reset | PR #11 |
| Weather, terrain, water, sound | PR #12 |
| Walkers, kekes, buses, cars at street scale | PR #13 |
| Street rules on the map | PR #15 |
| Sessions for users and admins (migration 0012) | PR #16. Already applied on the live database. |
| Kids room, parent gate, no migration | PR #17 |
| Follow camera, one-tap recenter, true-scale crowd | PR #18 |
| Guide bot Ada: allowlisted map tools, moderation gate, local memory. Off in production builds. | PR #19 |
| Safe ingest: on-device NSFW gate, face mosaic, EXIF/GPS strip, pHash dedupe, scam/impersonation notes, scan unit cleanup | This merge (was draft PR #20). Items AIML #3, #9, #13, #19. |
| Semantic and voice place search on the map pill. Default on. `?search=0` turns it off. On-device index, not pgvector. | This merge (was draft PR #21). Items AIML #5 and #16, without a hosted model. |
| Inspect (#04): long-press / right-click / `i` to inspect buildings, vehicles, walkers, place boards (real height, floors, footprint, material, age, allow-listed OSM tags, verbs). Flag `VITE_NDU_INSPECT`, server `INSPECT_ENABLED`, off in prod until the operator enables it. Migration 0019 (own items only, not applied). | Branch `feat/object-inspect` (not merged). |

## Still plans (not in this merge)

These are written up and were not implemented, because they need a GPU, a paid API, a database change, or a decision that is still open.

- Photo to GLB (TripoSR / SpaR3D), metric depth, VLM room labels, Gaussian splats, facade generation, nightly mesh batch. GPU or a new model server.
- pgvector semantic search, Llama-Guard as a required model, city-director NPC planner, streaming TTS, LitServe router. The guide bot has a rules gate and an optional guard-model hook only.
- Placement gizmo, verification-card UI, item picker, consent sheet, dispute flow. Server pieces for property exist. Mint stays off until NDU-2 is decided.
- Hiram designer agent, Neura laptop compute sharing, walk-to-earn. Drafts only. Walk-to-earn must not pay, mint, or run a referral scheme until Wei decides.
- Ward PMTiles, licence-plate blur, CSAM hashing provider, 18+ server gate, Google/Cesium tiles. Not started, or blocked on purpose.
- OneLove tie-ins are allowed later (18+). GreenFunds is declined and is not in this tree.

## Checks

`npm run test:ingest` and `npm run test:search` pass on Node 22. No file under `migrations/` changed in this merge.
