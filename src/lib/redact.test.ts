// NDU-UPG u-088: PII redaction snapshot test.
import test from "node:test";
import assert from "node:assert/strict";
import { redact, redactArgs } from "./redact.ts";

test("redact replaces PII-shaped substrings", () => {
  assert.equal(redact("mail me at ada@example.com now"), "mail me at [email] now");
  assert.equal(redact("call +44 7700 900123"), "call [phone]");
  assert.equal(redact("card 4111 1111 1111 1111"), "card [card]");
  assert.equal(redact("iban GB82 WEST 1234 5698 7654 32"), "iban [iban]");
  assert.equal(redact("ssn 123-45-6789"), "ssn [ssn]");
  assert.equal(redact("at 51.5226, -0.1265"), "at [coords]");
  assert.equal(redact("from 192.168.1.42"), "from [ip]");
  assert.equal(redact("token rag_AbCdEf123456 extra"), "token [key] extra");
  assert.equal(redact("Bearer sk-abc123def456"), "[key]");
});

test("redact leaves clean text untouched", () => {
  const clean = "bootstrap failed: connection refused on port 5436";
  assert.equal(redact(clean), clean);
  assert.equal(redact("user signed in"), "user signed in");
});

test("redact handles non-strings and errors", () => {
  assert.equal(redact(42), "42");
  assert.equal(redact(null), "");
  assert.equal(redact(undefined), "");
  assert.equal(redact(new Error("failed for ada@example.com")), "Error: failed for [email]");
});

test("redactArgs redacts every argument", () => {
  const out = redactArgs(["contact ada@example.com", { email: "x@y.com" }, 7, new Error("ip 10.0.0.1")]);
  assert.equal(out[0], "contact [email]");
  assert.ok(String(out[1]).includes("[email]"));
  assert.equal(out[2], 7);
  assert.ok(String(out[3]).includes("[ip]"));
});
