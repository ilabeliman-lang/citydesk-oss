/**
 * NDU-AI safe ingest #1: browser ONNX sessions (lazy). Nothing here is imported by the map's first paint:
 * onnxruntime-web (wasm) and the model files load the first time someone picks a photo.
 *
 * - Runtime: onnxruntime-web (MIT), wasm backend, self-hosted .wasm (bundled by Vite), single-threaded unless
 *   the page is cross-origin isolated.
 * - Models are fetched once, checked against the pinned SHA-256, and cached in the Cache API.
 *   NSFW model: VITE_INGEST_NSFW_MODEL_URL can point at a self-hosted copy (must be the same bytes).
 */
import { FACE_MODEL, NSFW_MODEL } from "@/lib/ingest/vision";

type Ort = typeof import("onnxruntime-web/wasm");
type Session = import("onnxruntime-web/wasm").InferenceSession;

let ortPromise: Promise<Ort> | null = null;
const sessions = new Map<string, Promise<Session>>();
const CACHE = "ndu-ingest-models-v1";

export function loadOrt(): Promise<Ort> {
  ortPromise ??= (async () => {
    const [ort, wasm] = await Promise.all([
      import("onnxruntime-web/wasm"),
      import("onnxruntime-web/ort-wasm-simd-threaded.wasm?url"),
    ]);
    ort.env.wasm.wasmPaths = { wasm: wasm.default };
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency || 1)
      : 1;
    ort.env.logLevel = "error";
    return ort;
  })();
  ortPromise.catch(() => (ortPromise = null));
  return ortPromise;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export type Progress = (loaded: number, total: number) => void;

/** Fetch (or read from cache) a model file and verify it byte for byte. */
export async function fetchModel(
  url: string,
  sha256: string,
  total: number,
  onProgress?: Progress,
): Promise<Uint8Array> {
  const cache = typeof caches !== "undefined" ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(url);
  let buf: ArrayBuffer;
  if (hit) {
    buf = await hit.arrayBuffer();
    onProgress?.(total, total);
  } else {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`);
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    buf = out.buffer;
  }
  if (hex(await crypto.subtle.digest("SHA-256", buf)) !== sha256) {
    await cache?.delete(url);
    throw new Error("model file did not match its pinned hash");
  }
  if (!hit)
    await cache
      ?.put(
        url,
        new Response(buf.slice(0), { headers: { "Content-Type": "application/octet-stream" } }),
      )
      .catch(() => undefined);
  return new Uint8Array(buf);
}

function session(
  key: string,
  url: string,
  sha256: string,
  total: number,
  onProgress?: Progress,
): Promise<Session> {
  let s = sessions.get(key);
  if (!s) {
    s = (async () => {
      const [ort, bytes] = await Promise.all([
        loadOrt(),
        fetchModel(url, sha256, total, onProgress),
      ]);
      return ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
        logSeverityLevel: 3,
      });
    })();
    s.catch(() => sessions.delete(key));
    sessions.set(key, s);
  }
  return s;
}

const nsfwUrl = () =>
  (import.meta.env.VITE_INGEST_NSFW_MODEL_URL as string | undefined)?.trim() || NSFW_MODEL.url;

export const nsfwSession = (onProgress?: Progress) =>
  session("nsfw", nsfwUrl(), NSFW_MODEL.sha256, NSFW_MODEL.bytes, onProgress);
export const faceSession = (onProgress?: Progress) =>
  session("face", FACE_MODEL.url, FACE_MODEL.sha256, FACE_MODEL.bytes, onProgress);

/** Run one float32 input through a session and hand back the named outputs. */
export async function run(
  sess: Session,
  input: Float32Array,
  dims: number[],
): Promise<Record<string, Float32Array>> {
  const ort = await loadOrt();
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", input, dims) });
  const res: Record<string, Float32Array> = {};
  for (const name of sess.outputNames) res[name] = out[name].data as Float32Array;
  return res;
}
