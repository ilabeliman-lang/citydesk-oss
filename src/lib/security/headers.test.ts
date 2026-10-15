// NDU-UPG u-081: CSP strictness tests. The CSP is the document-level policy that
// stops XSS from executing — these assertions freeze its guarantees.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, parseCsp, securityHeaders, CONNECT_ORIGINS } from "./headers.ts";

test("no unsafe-eval anywhere in the policy", () => {
  const csp = buildCsp();
  assert.ok(!csp.includes("unsafe-eval"), "unsafe-eval must never appear");
});

test("script-src allows the router bootstrap and still bans eval", () => {
  const script = parseCsp(buildCsp())["script-src"];
  assert.deepEqual(script, ["'self'", "'unsafe-inline'"]);
  assert.ok(!script.includes("'strict-dynamic'"));
});

test("default-src is 'self'", () => {
  assert.deepEqual(parseCsp(buildCsp())["default-src"], ["'self'"]);
});

test("frame-ancestors is 'none' (clickjacking)", () => {
  assert.deepEqual(parseCsp(buildCsp())["frame-ancestors"], ["'none'"]);
  assert.deepEqual(parseCsp(buildCsp())["frame-src"], ["'none'"]);
});

test("object-src and base-uri are locked down", () => {
  assert.deepEqual(parseCsp(buildCsp())["object-src"], ["'none'"]);
  assert.deepEqual(parseCsp(buildCsp())["base-uri"], ["'self'"]);
});

test("connect-src is an explicit origin list (no bare *)", () => {
  const connect = parseCsp(buildCsp())["connect-src"];
  assert.ok(!connect.includes("*"), "no wildcard in connect-src");
  assert.ok(connect.includes("'self'"));
  // every non-self entry is a full https origin (scheme + host)
  for (const o of connect) {
    if (o === "'self'") continue;
    assert.match(o, /^https:\/\/[a-z0-9.-]+$/, `bad connect origin: ${o}`);
  }
});

test("connect-src covers every external host the app fetches", () => {
  const connect = parseCsp(buildCsp())["connect-src"];
  for (const origin of CONNECT_ORIGINS) {
    assert.ok(connect.includes(origin), `connect-src missing ${origin}`);
  }
});

test("dev build adds the HMR websocket to connect-src", () => {
  const dev = parseCsp(buildCsp(true))["connect-src"];
  assert.ok(dev.includes("ws:") && dev.includes("wss:"));
  const prod = parseCsp(buildCsp(false))["connect-src"];
  assert.ok(!prod.includes("ws:"), "prod must not allow ws:");
});

test("img-src allows data: and blob: (avatars, scan thumbnails)", () => {
  const img = parseCsp(buildCsp())["img-src"];
  assert.ok(img.includes("data:") && img.includes("blob:"));
});

test("style-src keeps unsafe-inline (MapLibre injects inline styles)", () => {
  const style = parseCsp(buildCsp())["style-src"];
  assert.ok(style.includes("'unsafe-inline'"), "MapLibre runtime styles require it");
  assert.ok(style.includes("'self'"));
});

test("securityHeaders includes CSP + the companion headers", () => {
  const h = securityHeaders();
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.match(h["Referrer-Policy"], /strict-origin/);
  assert.ok(h["Content-Security-Policy"].includes("default-src 'self'"));
  assert.ok(h["Permissions-Policy"].includes("camera=()"));
});

// NDU-UPG CSP v2: nonce mode drops 'unsafe-inline' for scripts.
import { buildCsp as buildCsp2, makeNonce, parseCsp as parseCsp2 } from "./headers.ts";
import { test as test2 } from "node:test";
import assert2 from "node:assert/strict";
test2("nonce CSP: script-src is self + nonce, no unsafe-inline/eval; bad nonce falls back", () => {
  const n = makeNonce();
  const s = parseCsp2(buildCsp2(false, n))["script-src"];
  assert2.deepEqual(s, ["'self'", `'nonce-${n}'`]);
  assert2.ok(!buildCsp2(false, "x'; script-src *").includes("script-src *"));
  assert2.notEqual(makeNonce(), n);
});
