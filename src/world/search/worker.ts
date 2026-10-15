/**
 * NDU-AI search: the page side of the model worker. The worker (and transformers.js +
 * onnxruntime-web inside it) is created only on the first call, i.e. when search is used or the
 * mic is tapped. Nothing here is imported by the map's static graph (lazy.test.ts).
 */
let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; progress?: (r: number) => void }>();

function get(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module", name: "ndu-search-models" });
  worker.onmessage = (e: MessageEvent<Record<string, unknown> & { id: number }>) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    if (typeof e.data.progress === "number" && e.data.ok === undefined) {
      w.progress?.(e.data.progress);
      return;
    }
    waiting.delete(e.data.id);
    if (e.data.ok) w.resolve(e.data);
    else w.reject(new Error(String(e.data.error ?? "model failed")));
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.reject(new Error("model worker failed"));
    waiting.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function call(msg: Record<string, unknown>, progress?: (r: number) => void, transfer: Transferable[] = []): Promise<Record<string, unknown>> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, progress });
    get().postMessage({ ...msg, id }, transfer);
  });
}
