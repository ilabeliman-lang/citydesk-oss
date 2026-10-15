# CityDesk Architecture

## Stack
- **Frontend:** React + TanStack Router (`src/routes`, file-based; `routeTree.gen.ts`), Vite, MapLibre GL for the 3D city, custom embossed UI (`src/world/bubbles`, `OverlayDock.tsx`, `styles.css`).
- **Server:** TanStack Start server functions and API routes (`src/routes/api`), middleware in `server/middleware`.
- **Auth:** Better Auth with a session plugin (`src/lib/auth`), sign-in gate on all app routes, admin list in DB.
- **DB:** Postgres 16 in production, PGLite fallback for dev/tests (`src/lib/db*`), SQL migrations in `migrations/` run by `scripts/migrate.mjs`.
- **Chain:** `src/lib/solana/wallet.ts` builds unsigned devnet transactions for the user's wallet; mainnet guard checks cluster, RPC and genesis. No server key.

## Source map
| Path | Responsibility |
|---|---|
| `src/world/WorldMap.tsx`, `CityBuildings.tsx` | map boot, buildings, camera |
| `src/world/{fp,orbit,immerse,dragTurn}` | first-person / follow camera, 360 drag |
| `src/world/{life,crowd,figures.ts,traffic,transit.ts,car.tsx}` | people, vehicles, boarding |
| `src/world/{realism,ground,render,atmosphere,shadows,props,collide}` | visual realism |
| `src/world/{assistant,search,tts,director,agents}` | AI assistant, search, NPC director |
| `src/world/{scans.ts,scanLayer.ts,ScanDesk.tsx,scan-*.server.ts}` | scan import, storage, placement |
| `src/world/{property*,verify,disputes,picker,placement}` | property desk, records, disputes |
| `src/world/{moderation,privacy,kids,gates,ada}` | safety, age gates, kids mode |
| `src/lib/{ingest,redact.ts,plates,security}` | safe ingest, PII redact, headers/CSP |
| `scripts/` | migrate, smoke/e2e, perf, scan pipeline |
| `tests/` | integration tests (sessions, property) |

## Data flow
1. Browser loads `/map` behind the sign-in gate; map tiles/vectors come from open data sources.
2. User actions call server functions; server validates (zod), checks session, writes Postgres.
3. Scans upload to local storage, pass the safe-ingest pipeline (face/plate/scam checks), then are placed.
4. Property records are encrypted with a KEK from env; serials are HMAC'd.
5. To anchor a record, the server returns an **unsigned devnet** Memo tx; the user's wallet signs and sends.

## Feature flags
All risky features are env flags defaulting off (`PROPERTY_*`, `VITE_NDU_*`, `SCAN_PIPELINE`, `INSPECT_ENABLED`). See `.env.example` and `npm run check:flags`.

## Decisions
See `docs/adr/`. Licence: MIT, per `docs/adr/ADR-licence.md`.
