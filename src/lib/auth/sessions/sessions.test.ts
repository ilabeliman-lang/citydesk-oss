// NDU-UPG sessions: pure unit tests (config, expiry rules, UA / IP / place helpers).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readSessionConfig, sessionEndReason } from "./config.ts";
import { parseUserAgent, placeFromHeaders, truncateIp } from "./device.ts";

const DAY = 86_400_000;

describe("session config", () => {
  it("defaults: 7 day idle, 30 day absolute, no admins", () => {
    const c = readSessionConfig({});
    assert.equal(c.idleSec, 7 * 86_400);
    assert.equal(c.absoluteSec, 30 * 86_400);
    assert.equal(c.updateAgeSec, 86_400);
    assert.equal(c.adminEmails.size + c.adminIds.size, 0);
  });
  it("reads env, clamps, and never lets absolute be shorter than idle", () => {
    const c = readSessionConfig({ NDU_SESSION_IDLE_DAYS: "10", NDU_SESSION_ABSOLUTE_DAYS: "2", NDU_ADMIN_EMAILS: " Wei@Example.com, b@x.io ", NDU_ADMIN_USER_IDS: "u1,u2" });
    assert.equal(c.idleSec, 10 * 86_400);
    assert.equal(c.absoluteSec, 10 * 86_400);
    assert.ok(c.adminEmails.has("wei@example.com"));
    assert.ok(c.adminIds.has("u2"));
    assert.equal(readSessionConfig({ NDU_SESSION_IDLE_DAYS: "nope" }).idleSec, 7 * 86_400);
  });
});

describe("sessionEndReason", () => {
  const cfg = { idleSec: 7 * 86_400, absoluteSec: 30 * 86_400 };
  const now = Date.UTC(2026, 9, 8);
  it("fresh session is fine", () => {
    assert.equal(sessionEndReason({ createdAt: new Date(now - DAY), expiresAt: new Date(now + 6 * DAY), lastSeenAt: new Date(now - 60_000) }, now, cfg), null);
  });
  it("idle after 7 days without use", () => {
    assert.equal(sessionEndReason({ createdAt: new Date(now - 9 * DAY), expiresAt: new Date(now + DAY), lastSeenAt: new Date(now - 7 * DAY - 1) }, now, cfg), "idle");
  });
  it("absolute after 30 days even when active", () => {
    assert.equal(sessionEndReason({ createdAt: new Date(now - 30 * DAY), expiresAt: new Date(now + 6 * DAY), lastSeenAt: new Date(now) }, now, cfg), "absolute");
  });
  it("expired when Better Auth's sliding expiry passed", () => {
    assert.equal(sessionEndReason({ createdAt: new Date(now - DAY), expiresAt: new Date(now - 1) }, now, cfg), "expired");
  });
});

describe("device helpers", () => {
  it("parses common user agents", () => {
    const iphone = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1");
    assert.deepEqual([iphone.label, iphone.kind], ["Safari on iPhone", "phone"]);
    const win = parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0");
    assert.deepEqual([win.label, win.kind], ["Edge on Windows", "desktop"]);
    const droid = parseUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36");
    assert.deepEqual([droid.label, droid.kind], ["Chrome on Android", "phone"]);
    assert.equal(parseUserAgent("").kind, "unknown");
  });
  it("keeps only the network part of an IP", () => {
    assert.equal(truncateIp("203.0.113.77"), "203.0.113.0/24");
    assert.equal(truncateIp("203.0.113.77, 10.0.0.1"), "203.0.113.0/24");
    assert.equal(truncateIp("::ffff:198.51.100.9"), "198.51.100.0/24");
    assert.equal(truncateIp("2001:db8:85a3:8d3:1319:8a2e:370:7348"), "2001:db8:85a3::/48");
    assert.equal(truncateIp(""), null);
    assert.equal(truncateIp("not-an-ip"), null);
  });
  it("coarse place from Cloudflare headers only", () => {
    const h = new Headers({ "cf-ipcity": "Port%20Harcourt", "cf-region": "Rivers", "cf-ipcountry": "NG" });
    assert.equal(placeFromHeaders(h), "Port Harcourt, Rivers, NG");
    assert.equal(placeFromHeaders(new Headers({ "cf-ipcountry": "US" })), "US");
    assert.equal(placeFromHeaders(new Headers({ "cf-ipcountry": "XX" })), null);
    assert.equal(placeFromHeaders(new Headers()), null);
  });
});
