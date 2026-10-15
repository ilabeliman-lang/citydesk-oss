import assert from "node:assert/strict";
import { adaReply } from "./mock.ts";

const noted = adaReply("street");
assert.deepEqual(noted, { model: "mock", text: "Noted." });

const edge = adaReply("a".repeat(200));
assert.equal(edge.model, "mock");
assert.equal(edge.text, "Noted.");

const long = adaReply("a".repeat(201));
assert.deepEqual(long, {
  model: "mock",
  text: "I can help with the street. Ask a shorter question.",
});

const empty = adaReply("");
assert.equal(empty.model, "mock");
assert.equal(empty.text, "Noted.");

console.log(noted.model);
