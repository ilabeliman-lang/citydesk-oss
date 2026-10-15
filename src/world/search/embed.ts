/**
 * NDU-AI search embeddings (page side). Loads the embedding model in the model worker on demand,
 * then embeds queries and documents into unit vectors (cosine = dot product). Weights come from
 * the public Hugging Face CDN once and stay in this browser's cache. See models.ts for licences.
 */
import { pickEmbedModel } from "./models";
import { call } from "./worker";

const model = pickEmbedModel();
let ready = false;
let loading: Promise<void> | null = null;

export const EMBED = model;

export function embedReady(): boolean {
  return ready;
}

export function loadEmbedder(onProgress?: (ratio: number) => void): Promise<void> {
  if (ready) return Promise.resolve();
  loading ??= call({ op: "load", task: "embed", model: model.id }, onProgress).then(
    () => {
      ready = true;
    },
    (err) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

export async function embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
  await loadEmbedder();
  const prefix = kind === "query" ? model.query : model.passage;
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 32) {
    const res = await call({ op: "embed", model: model.id, texts: texts.slice(i, i + 32).map((t) => prefix + t) });
    out.push(...(res.vectors as Float32Array[]));
  }
  return out;
}
