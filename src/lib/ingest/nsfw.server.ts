/**
 * NDU-AI safe ingest #1: OPTIONAL server re-check of the NSFW model on CPU (flag `INGEST_NSFW_SERVER`, OFF).
 * Uses onnxruntime-web's Node build (pure wasm, no native addon, no GPU) and a model file the operator puts
 * on disk (`INGEST_NSFW_MODEL_PATH`); the server never downloads anything by itself. The file must match the
 * pinned SHA-256. If it's missing, the check is skipped (logged once) rather than blocking uploads.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NSFW_MODEL, nsfwInput, nsfwVerdict, type NsfwVerdict } from "./vision.ts";

type Session = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>;
  inputNames: readonly string[];
  outputNames: readonly string[];
};
const g = globalThis as typeof globalThis & {
  __nduNsfwSession__?: Promise<Session | null>;
  __nduNsfwWarned__?: boolean;
};

async function session(): Promise<Session | null> {
  g.__nduNsfwSession__ ??= (async () => {
    const file = process.env.INGEST_NSFW_MODEL_PATH?.trim();
    if (!file) {
      if (!g.__nduNsfwWarned__)
        console.warn(
          "[ingest] INGEST_NSFW_SERVER is on but INGEST_NSFW_MODEL_PATH is not set; skipping the server re-check",
        );
      g.__nduNsfwWarned__ = true;
      return null;
    }
    const bytes = await readFile(file);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== NSFW_MODEL.sha256)
      throw new Error("INGEST_NSFW_MODEL_PATH does not match the pinned NSFW model");
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = "error";
    return (await ort.InferenceSession.create(new Uint8Array(bytes), {
      logSeverityLevel: 3,
    })) as unknown as Session;
  })();
  return g.__nduNsfwSession__;
}

export async function nsfwCheckServer(image: Uint8Array): Promise<NsfwVerdict | null> {
  const s = await session();
  if (!s) return null;
  const sharp = (await import("sharp")).default;
  const ort = await import("onnxruntime-web");
  const px = await sharp(image)
    .rotate()
    .removeAlpha()
    .resize(NSFW_MODEL.size, NSFW_MODEL.size, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const out = await s.run({
    [s.inputNames[0]]: new ort.Tensor("float32", nsfwInput(px), [
      1,
      3,
      NSFW_MODEL.size,
      NSFW_MODEL.size,
    ]),
  });
  return nsfwVerdict(out[s.outputNames[0]].data);
}
