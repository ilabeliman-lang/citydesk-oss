# src/lib

Shared library code used across the CityDesk app: a server-only database access layer, environment helpers, and global UI plumbing. It centralizes the pieces many routes and components need so they stay consistent and testable.

Files:

- `db.ts` — exports a server-only `getSql()` SQL client (plus `getPglite()`, `ensureDbReady()`, the `pgliteSql` helper and the `Sql`/`DbSource` types) that uses Neon via `pg` when `DATABASE_URL` is set and falls back to an embedded PGLite instance otherwise, auto-applying `migrations/*.sql` and normalizing row types (int8, date, interval) identically on both backends.
- `env.server.ts` — server-only environment helpers: `env(key)` reads a trimmed `process.env` value (whitespace-only counts as unset) and `isWorkspacePreview()` reports whether the app is running in the sandbox preview rather than a deployed app by the presence/absence of `GROK_PROJECT_ID`.
- `error-component.tsx` — exports `AppErrorComponent`, the TanStack Router root error boundary that renders a centered "Something went wrong" screen (alert icon, heading, and the error message or a generic fallback string) when a route or the app crashes.
