/**
 * NDU-AI search models: ids, sizes and licences in one place (all commercial-use friendly, all run
 * on the phone through onnxruntime-web wasm; nothing calls a paid or remote inference API).
 * Plain, dependency-free, alias-free (lazy.test.ts reads it).
 */
export type EmbedModel = { id: string; dim: number; mb: number; licence: string; query: string; passage: string };

export const EMBED_MODELS: Record<"small" | "multi", EmbedModel> = {
  // Default: English, 34 MB int8. BAAI/bge-small-en-v1.5 (MIT); ONNX by Xenova (MIT).
  small: { id: "Xenova/bge-small-en-v1.5", dim: 384, mb: 34, licence: "MIT", query: "Represent this sentence for searching relevant passages: ", passage: "" },
  // Opt-in (?search_model=multi): 100+ languages, 118 MB int8. intfloat/multilingual-e5-small (MIT).
  multi: { id: "Xenova/multilingual-e5-small", dim: 384, mb: 118, licence: "MIT", query: "query: ", passage: "passage: " },
};

// Whisper tiny, int8 encoder (10 MB) + merged decoder (31 MB). openai/whisper-tiny weights Apache-2.0
// (code MIT); ONNX by Xenova (Apache-2.0).
export const VOICE_MODEL = { id: "Xenova/whisper-tiny", mb: 41, licence: "Apache-2.0" };

export function pickEmbedModel(): EmbedModel {
  try {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("search_model") === "multi") return EMBED_MODELS.multi;
  } catch {
    // default below
  }
  return EMBED_MODELS.small;
}

type NetInfo = { saveData?: boolean; effectiveType?: string };

/** Download the embedding model on its own only on a good connection and a phone with memory to spare. */
export function autoSmart(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: NetInfo }).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /(^|-)(2g|3g)$/.test(conn.effectiveType)) return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === "number" && mem < 3) return false;
  return true;
}
