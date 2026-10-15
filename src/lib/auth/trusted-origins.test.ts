// NDU-UPG u-086: trustedOrigins freeze test — a matrix of inputs → expected
// origin list. If the trusted-origins construction changes, this fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrustedOrigins } from "./trusted-origins.ts";

const PREVIEW = ["preview.grok-sandbox.com", "other.grok-sandbox.com"];
const LOCAL = ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"];

test("explicit baseURL: base + local + extras, no preview wildcards", () => {
  assert.deepEqual(
    buildTrustedOrigins("https://ndu.example.com", PREVIEW, ["https://custom.example.com"]),
    ["https://ndu.example.com", ...LOCAL, "https://custom.example.com"],
  );
  // no extras
  assert.deepEqual(buildTrustedOrigins("https://ndu.example.com", PREVIEW, []), [
    "https://ndu.example.com",
    ...LOCAL,
  ]);
});

test("dynamic baseURL: extras + host wildcards + full-origin wildcards + local", () => {
  assert.deepEqual(buildTrustedOrigins(undefined, PREVIEW, ["https://custom.example.com"]), [
    "https://custom.example.com",
    ...PREVIEW,
    "https://preview.grok-sandbox.com",
    "http://preview.grok-sandbox.com",
    "https://other.grok-sandbox.com",
    "http://other.grok-sandbox.com",
    ...LOCAL,
  ]);
  // no extras: starts straight with the host wildcards
  assert.deepEqual(buildTrustedOrigins(undefined, PREVIEW, []), [
    ...PREVIEW,
    "https://preview.grok-sandbox.com",
    "http://preview.grok-sandbox.com",
    "https://other.grok-sandbox.com",
    "http://other.grok-sandbox.com",
    ...LOCAL,
  ]);
});

test("loopback hosts are always trusted (email/password works locally)", () => {
  for (const base of [undefined, "https://ndu.example.com"]) {
    const origins = buildTrustedOrigins(base, PREVIEW, []);
    assert.ok(origins.includes("http://localhost:8080"));
    assert.ok(origins.includes("http://127.0.0.1:8080"));
    assert.ok(origins.includes("http://[::1]:8080"));
  }
});

test("empty string baseURL is treated as dynamic (falsy)", () => {
  // an empty BETTER_AUTH_URL must fall through to the dynamic branch
  const dyn = buildTrustedOrigins("", PREVIEW, []);
  assert.ok(dyn.includes("preview.grok-sandbox.com"));
  assert.ok(!dyn.includes(""));
});
