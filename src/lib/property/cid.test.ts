import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentId } from "./cid.ts";

describe("content id", () => {
  it("matches the raw sha2-256 id of empty bytes", async () => {
    assert.equal(
      await contentId(new Uint8Array()),
      "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    );
  });
});
