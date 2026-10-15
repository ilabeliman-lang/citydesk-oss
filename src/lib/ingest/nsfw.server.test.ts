import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

// Runs only where the operator has put the pinned model on disk (never downloads in CI).
const model = process.env.INGEST_NSFW_MODEL_PATH?.trim();

describe(
  "server NSFW re-check on CPU (#1, opt-in)",
  { skip: !model && "INGEST_NSFW_MODEL_PATH not set" },
  () => {
    it("loads the pinned model through onnxruntime-web (wasm) and passes an ordinary picture", async () => {
      const { nsfwCheckServer } = await import("./nsfw.server.ts");
      const img = await sharp({
        create: { width: 640, height: 480, channels: 3, background: { r: 90, g: 140, b: 200 } },
      })
        .composite([
          {
            input: Buffer.from(
              '<svg width="640" height="480"><rect x="80" y="200" width="480" height="200" fill="#6b4f2a"/><circle cx="500" cy="90" r="50" fill="#ffd34d"/></svg>',
            ),
          },
        ])
        .jpeg()
        .toBuffer();
      const v = await nsfwCheckServer(img);
      assert.ok(v);
      assert.equal(v.verdict, "ok");
      assert.ok(v.pNsfw >= 0 && v.pNsfw <= 1);
    });
  },
);
