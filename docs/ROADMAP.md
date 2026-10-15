# CityDesk Roadmap (phased, for contributors)

Sources: maintainer handoff `REMAINING_UPGRADES_2026-10-14`, `CITYDESK_WAY_FORWARD_2026-10-14`,
`UPGRADE_STATUS`, research drafts (compute, P2P rewards, token vault). Status legend:
**done** · **in progress** · **open**. "Done" means merged on main with tests; nothing here is
called production ready. Every new feature ships behind a flag that defaults off.

Hard limits for every phase: devnet only · no private keys anywhere · user signs every tx ·
receive-only · minting off by default · everything behind login.

## Phase 0: Foundations and open-source readiness
| Item | Status | Acceptance check |
|---|---|---|
| Auth (Better Auth + sessions, sign-in gate), login on every route | done | `npm run check:auth` passes; unauthenticated `/map` redirects |
| Migrations 0001-0022, PGLite fallback | done | `npm run db:migrate` reports up to date on fresh PGLite and Postgres 16 |
| CI (unit, typecheck, phone e2e, perf budget) | done | CI green on main |
| OSS scaffold: LICENSE, README, SECURITY, .env.example, templates | in progress | this PR merged after maintainer sign-off |
| Secret scan in CI (gitleaks) | in progress | job fails on a planted fake key |
| Move preview OAuth client secret out of source (env only) and rotate | open | gitleaks clean on tree; old secret revoked |
| Test baseline: fix/quarantine 14 old script + 3 orbit failures | open | `npm test` green, CI green |
| Health check script, restore-tested backups | open | restore into scratch DB shows same table counts |

## Phase 1: Walkable street-level city (core world)
| Item | Status | Acceptance check |
|---|---|---|
| 3D buildings, map data (Overpass, CARTO), satellite | done | map renders at 390x844, 0 console errors |
| Eye-height follow camera, heading-up, one-tap recenter | done | fp/orbit tests pass; recenter returns to avatar |
| People at real scale, tap-to-interact, walking, boarding vehicles | done | life/crowd tests pass |
| 360 drag, immersion batch, bubbles dock (embossed UI) | done | immerse tests pass; dock renders collapsed/open |
| Realism: sun, heights, terrain/ground, collision doors | in progress | realism/ground/collide tests; built branches merged behind flags |
| Retire hidden Leaflet (NDU-6) | in progress | perf budget passes, map unchanged |
| Rendering, terrain/water/sky, props, traffic, weather (upgrade cats 5.1-5.7) | in progress | per-item test + perf budget |
| Ward PMTiles, CPU-only, $0 | open | tiles load offline; no paid service |

## Phase 2: Places, people and social safety
| Item | Status | Acceptance check |
|---|---|---|
| Businesses, listings, bookings, yard, presence | done | presence privacy test passes |
| AI assistant, search (hybrid, voice), TTS | done | assistant/search tests pass |
| Kids interactive room mode | in progress | kids tests; age gate respected |
| Report / block / mute + admin moderation queue (u0909) | open | two accounts: report lands in admin queue |
| Family/Community groups sheet (NDU-22) | in progress | two-account invite works |
| Two-account e2e on CI (NDU-40) | in progress | green at 390x844 |
| Accessibility and localisation (5.12) | in progress | axe clean on /map; locale switch works |
| AI NPCs and city director (5.16) | in progress | director pace tests pass |

## Phase 3: Scans, rooms and property desk
| Item | Status | Acceptance check |
|---|---|---|
| Scan import pipeline, scan chips, safe ingest (faces, scam hints) | done | `npm run test:ingest` passes |
| Item picker (max 3 per scan, pin on model) (NDU-20) | in progress | picker test; 4th item rejected |
| Consent copy + versioning (NDU-4) | in progress | consent version stored per record |
| Plate blur at ingest (NDU-36), PII redact (NDU-39) | in progress | fixture photos come out blurred; redact tests |
| Encrypted placement column (NDU-12) | open | new migration; no plaintext lng/lat remains |
| Crypto-shred delete UI (NDU-37) | in progress | deleted record leaves no readable evidence |
| Serial HMAC wired into records (NDU-23) | in progress | serial verifies; tamper fails |
| Disputes, challenge and settlement screens (NDU-34/35) | in progress | disputes tests pass |
| Placement, anchoring and editing (5.9) | in progress | placement tests |

## Phase 4: Verification records (devnet only, user signs)
| Item | Status | Acceptance check |
|---|---|---|
| Devnet record anchor (user-signed Memo tx), mainnet guard | done | guard rejects mainnet cluster/RPC/genesis; no server key |
| Verification card UI (NDU-30), receipt (NDU-28) | in progress | card shows record + devnet tx; tests pass |
| Indexer reconcile, Postgres as source of truth (NDU-29) | in progress | reconcile test on devnet fixture |
| Compressed mint / collection (NDU-24/26/27) | open (flag off) | maintainer decision required; devnet only; no server key |

## Phase 5: AR, AI/ML and glasses (stretch)
| Item | Status | Acceptance check |
|---|---|---|
| WebXR / AR session helper (NDU-42, 5.13) | in progress | xr tests; graceful fallback on iOS |
| Photo/video to 3D, on-device perception (5.14/5.15) | open | CPU or free path only; no paid GPU |
| Designer-agent build-request pipeline (5.17) | open | spec only until approved |

## Phase 6: Community value (research only; nothing ships without maintainer decision)
| Item | Status | Acceptance check |
|---|---|---|
| Points/voucher prototype (street value) | open | flag off; no transfer of value |
| P2P task rewards, laptop compute rental, walk-to-earn, token vault | open (research drafts) | no payouts, no trading, no custody; decision logged first |

Out of scope: mainnet, live minting, spending/trading features, autonomous posting or sends.
