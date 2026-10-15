# src/routes/api

Server-only API routes for CityDesk, declared as TanStack Start file routes (`createFileRoute` with `server.handlers`) that proxy HTTP requests into server-side world modules. The folder currently hosts endpoints for scan intake/delivery and the NDU-AI assistant gateway, keeping all server-only imports (`*.server.ts`) out of client components.

- `scans.ts` — defines the `/api/scans` route whose `POST` handler forwards the incoming request to `receiveScan` from `@/world/scan-store.server`.
- `assistant.ts` — defines the `/api/assistant` route with a `GET` handler that reports whether the assistant gateway is enabled (`gatewayConfig()` from `@/world/assistant/gateway.server`) and a `POST` handler that rejects bodies over 4096 bytes, parses JSON, and proxies the request to `proxyAssistant` using the client IP (from CF-connecting/x-forwarded-for/x-real-ip headers) as the client key.
- `scans.$id.ts` — defines the `/api/scans/$id` route whose `GET` handler calls `sendScan` from `@/world/scan-store.server` with the `id` param and the request (which carries `?raw`/Range headers), per NDU-UPG #356/#368.
