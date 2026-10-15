import test from "node:test";
import assert from "node:assert";
import { summarizeBoard, emptySummary } from "./receptionSummary.ts";

test("summarizeBoard counts tasks + affirmations and drops secrets", () => {
  const s = summarizeBoard({
    creedVersion: "abc",
    tasks: [
      { status: "open" },
      { status: "in_progress", claim: { agentId: "a" } },
      { status: "blocked", kind: "blocked-on-sun" },
    ],
    agents: [
      {
        id: "a",
        registered: true,
        affirmed: { current: true },
        claims: ["x"],
        token: "rag_SECRET",
      },
      { id: "b" },
    ],
    briefs: [{ kind: "general" }, { kind: "private", tokenHash: "h" }],
    ledger: [{ did: "secret note" }],
  });
  assert.equal(s.tasks.total, 3);
  assert.equal(s.tasks.open, 1);
  assert.equal(s.tasks.claimed, 1);
  assert.equal(s.tasks.blockedOnSun, 1);
  assert.deepEqual(
    s.agents.map((a) => [a.id, a.affirmed, a.verified]),
    [
      ["a", true, true],
      ["b", false, false],
    ],
  );
  assert.equal(s.briefs.private, 1);
  const j = JSON.stringify(s);
  assert.ok(!j.includes("rag_") && !j.includes("secret note") && !j.includes("tokenHash"));
});
test("emptySummary is safe", () => {
  assert.equal(emptySummary("x").ok, false);
});

// NDU-UPG audit follow-up: the flag module (receptionEnabled) had no test.
test("receptionEnabled: default on, off via env or ?reception=0", async () => {
  const { receptionEnabled } = await import("./receptionSummary.ts");
  assert.equal(receptionEnabled(""), true); // default on
  assert.equal(receptionEnabled("?reception=0"), false);
  assert.equal(receptionEnabled("?x=1&reception=0"), false);
  assert.equal(receptionEnabled("?reception=1"), true); // explicit on stays on
});
