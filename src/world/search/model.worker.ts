/// <reference lib="webworker" />
/**
 * NDU-AI search model worker: runs the embedding model and Whisper off the main thread so the 3D
 * map keeps its frame rate. Spawned only when search/voice needs it. Audio arrives here as samples
 * from the page and is transcribed locally; nothing is posted to any server.
 */
import { env, pipeline } from "@huggingface/transformers";
import MJS from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import WASM from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

env.allowLocalModels = false;
env.useBrowserCache = true;
// NDU-AI search: point onnxruntime at the wasm shipped with the app instead of a third-party CDN.
// (transformers.js shares this `wasm` object with its onnxruntime-web instance.)
const ortWasm = (env.backends.onnx as { wasm?: { wasmPaths?: unknown } }).wasm;
if (ortWasm) ortWasm.wasmPaths = { mjs: new URL(MJS, self.location.href).href, wasm: new URL(WASM, self.location.href).href };

type Req =
  | { id: number; op: "embed"; model: string; texts: string[] }
  | { id: number; op: "asr"; model: string; audio: Float32Array }
  | { id: number; op: "load"; task: "embed" | "asr"; model: string };

type Fn = (input: unknown, opts?: Record<string, unknown>) => Promise<unknown>;
const loaded = new Map<string, Promise<Fn>>();

function load(task: "embed" | "asr", model: string, id: number): Promise<Fn> {
  const key = `${task}:${model}`;
  let job = loaded.get(key);
  if (!job) {
    const progress_callback = (p: { status?: string; progress?: number; file?: string }) => {
      if (p?.status === "progress" && typeof p.progress === "number") self.postMessage({ id, progress: p.progress / 100, file: p.file });
    };
    job = (task === "embed"
      ? pipeline("feature-extraction", model, { dtype: "q8", device: "wasm", progress_callback })
      : pipeline("automatic-speech-recognition", model, { dtype: "q8", device: "wasm", progress_callback })) as unknown as Promise<Fn>;
    job.catch(() => loaded.delete(key));
    loaded.set(key, job);
  }
  return job;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    if (req.op === "load") {
      await load(req.task, req.model, req.id);
      self.postMessage({ id: req.id, ok: true });
    } else if (req.op === "embed") {
      const fn = await load("embed", req.model, req.id);
      const out = (await fn(req.texts, { pooling: "mean", normalize: true })) as { data: Float32Array; dims: number[] };
      const dim = out.dims[out.dims.length - 1];
      const vectors: Float32Array[] = [];
      for (let i = 0; i < req.texts.length; i += 1) vectors.push(out.data.slice(i * dim, (i + 1) * dim));
      self.postMessage({ id: req.id, ok: true, vectors });
    } else if (req.op === "asr") {
      const fn = await load("asr", req.model, req.id);
      const out = (await fn(req.audio, { language: "en", task: "transcribe", return_timestamps: false })) as { text?: string };
      self.postMessage({ id: req.id, ok: true, text: (out.text ?? "").replace(/\s+/g, " ").trim() });
    }
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
