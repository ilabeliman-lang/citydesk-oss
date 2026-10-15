/**
 * NDU-UPG u-081: the document-level Content-Security-Policy and companion
 * security headers. Pure string builders so they can be unit-tested without a
 * server (see securityHeaders.test.ts).
 *
 * Design:
 *  strict-dynamic ignores unsafe-inline, so the TanStack bootstrap never ran and the map stayed blank. 
 *  - No 'unsafe-eval' and no 'unsafe-inline' for scripts. The app is a Vite SPA
 *    whose scripts are same-origin hashed assets, so 'self' is the strongest safe
 *    script-src. A nonce was considered but Vite's build emits static asset URLs
 *    and the TanStack Start hydration injects inline bootstraps; a nonce would
 *    require an HTML transform that rewrites every inline script. 'self' with
 *    'strict-dynamic' is the pragmatic strict option here.
 *  - style-src keeps 'unsafe-inline': MapLibre and React both inject inline
 *    styles at runtime; blocking them breaks the map. This is the standard
 *    accepted trade-off (CSS injection is far lower risk than script injection).
 *  - connect-src lists the exact origins the app fetches: self, the four Overpass
 *    mirrors, the OSM tile host, and (dev only) the Vite HMR websocket.
 *  - img-src allows data: and blob: (avatars, scan thumbnails, MapLibre sprites).
 *  - frame-ancestors 'none' (clickjacking), base-uri 'self', object-src 'none',
 *    form-action 'self'.
 */

/** Hosts the app actually fetches from, beyond same-origin (grep-verified). */
export const CONNECT_ORIGINS: readonly string[] = [
  "https://overpass-api.de",
  "https://overpass.kumi.systems",
  "https://overpass.private.coffee",
  "https://tile.openstreetmap.org",
  "https://maps.mail.ru",
  "https://tiles.openfreemap.org", // the map's preconnect host (__root.tsx)
  "https://server.arcgisonline.com", // keyless satellite ground (Esri World Imagery)
];

export const NONCE_RE = /^[A-Za-z0-9+/_-]{16,64}={0,2}$/;

/** A fresh base64 nonce (server only; 16 random bytes). */
export function makeNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

/** Build the CSP directive string. `dev` adds the Vite HMR websocket to connect-src. */
export function buildCsp(dev = false, nonce?: string): string {
  // NDU-UPG CSP v2: with a per-request nonce, inline scripts need it (no 'unsafe-inline').
  // Without one (client re-render of the head) the meta is ignored by browsers anyway.
  const script = nonce && NONCE_RE.test(nonce) ? `script-src 'self' 'nonce-${nonce}'` : "script-src 'self' 'unsafe-inline'";
  const connect = ["'self'", ...CONNECT_ORIGINS];
  if (dev) connect.push("ws:", "wss:");
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://server.arcgisonline.com",
    "font-src 'self' data:",
    "connect-src " + connect.join(" "),
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Parse a CSP string into { directive: value[] }. */
export function parseCsp(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [name, ...rest] = part.split(/\s+/);
    out[name] = rest;
  }
  return out;
}

/** All security headers for an HTML document response. */
export function securityHeaders(dev = false): Record<string, string> {
  return {
    "Content-Security-Policy": buildCsp(dev),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}
