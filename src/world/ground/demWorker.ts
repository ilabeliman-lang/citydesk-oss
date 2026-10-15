/// <reference lib="webworker" />
import { decodeTile } from "./terrarium.ts";

/** NDU realism 02 T2: fetch + decode one Terrarium PNG off the main thread; the buffer is transferred. */
self.onmessage = async (ev: MessageEvent<{ key: string; url: string }>) => {
  const { key, url } = ev.data;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0);
    const h = decodeTile(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width);
    (self as unknown as Worker).postMessage({ key, h }, [h.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ key, error: (err as Error).message });
  }
};
