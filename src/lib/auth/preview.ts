/**
 * Shared LIVE-PREVIEW OAuth client (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL, which can't be pre-registered per app. The broker instead exposes ONE
 * shared "preview" client that accepts any
 * `https://*.grok-sandbox.com/api/auth/oauth2/callback/*`
 * (broker: `app-builder-deployer/auth/src/preview-oauth.ts`).
 *
 * Values come from env (never hard-code secrets in the tree):
 * `GROK_PREVIEW_CLIENT_ID` / `GROK_PREVIEW_CLIENT_SECRET`, or the
 * deployer-injected `GROK_AUTH_CLIENT_ID` / `GROK_AUTH_CLIENT_SECRET` overrides
 * in `server.ts`. The broker stores only the secret's `base64url(SHA-256)` hash.
 * Preview-only, low-privilege, `*.grok-sandbox.com` — rotate by regenerating
 * the broker env and this env together.
 */
function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const PREVIEW_CLIENT_ID =
  env("GROK_PREVIEW_CLIENT_ID") ?? env("GROK_AUTH_CLIENT_ID") ?? "grok_preview";

/** Empty when unset so OSS clones and CI never ship a baked secret. */
export const PREVIEW_CLIENT_SECRET =
  env("GROK_PREVIEW_CLIENT_SECRET") ?? env("GROK_AUTH_CLIENT_SECRET") ?? "";

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
