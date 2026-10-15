/**
 * NDU-AI safe ingest #1/#2, browser side: everything that happens to a photo before it leaves the phone.
 *   1. read what metadata it carries (for the "removed" chips), 2. decode with EXIF orientation applied,
 *   3. NSFW gate + face detection on-device (lazy ONNX), 4. pHash, 5. on "Use photo": pixelate the faces the
 *   person chose and any licence-plate band, re-encode through a canvas (browsers write no EXIF), byte-strip
 *   again, fit the size budget.
 * The server repeats the strip and does the authoritative dedupe, so a modified client gains nothing.
 */
import { csamCheck } from "@/lib/ingest/csam";
import { clientFlags, type IngestFlags } from "@/lib/ingest/flags";
import { stripImageMetadata, type MetaKind } from "@/lib/ingest/imageMeta";
import { phashRgba } from "@/lib/ingest/phash";
import {
  coverCrop,
  decodeFaces,
  faceInput,
  FACE_MODEL,
  gateDecision,
  NSFW_MODEL,
  nsfwInput,
  nsfwVerdict,
  padBox,
  pixelate,
  type Box,
  type GateOutcome,
  type NsfwVerdict,
} from "@/lib/ingest/vision";
import { faceSession, nsfwSession, run, type Progress } from "./models";
import { plateBoxes } from "./plates";
import { blurBox } from "@/lib/plates/region";

export const MAX_SIDE = 2048;

export type Inspection = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  removed: MetaKind[];
  faces: Box[];
  nsfw: NsfwVerdict | null;
  gate: GateOutcome;
  phash: string;
  flags: IngestFlags;
};

export function ingestFlagsHere(): IngestFlags {
  if (typeof window === "undefined") return clientFlags("");
  let store: Storage | null = null;
  try {
    store = window.localStorage;
  } catch {
    store = null;
  }
  return clientFlags(window.location.search, store);
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const ctx2d = (c: HTMLCanvasElement) => {
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) throw new Error("This phone can't edit photos here.");
  return x;
};

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

function pixelsAt(
  src: HTMLCanvasElement,
  w: number,
  h: number,
  crop?: { sx: number; sy: number; sw: number; sh: number },
): Uint8ClampedArray {
  const c = canvas(w, h);
  const x = ctx2d(c);
  x.imageSmoothingQuality = "high";
  if (crop) x.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
  else x.drawImage(src, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data;
}

const saveData = () =>
  Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

export type Stage = { stage: "reading" | "model" | "checking"; loaded?: number; total?: number };

export async function inspectPhoto(
  file: File,
  onStage?: (s: Stage) => void,
  flags = ingestFlagsHere(),
): Promise<Inspection> {
  onStage?.({ stage: "reading" });
  const raw = new Uint8Array(await file.arrayBuffer());
  // Unavailable means no vendor list, so the photo continues. Any other status refuses it. No network.
  if (csamCheck(raw).status !== "unavailable") {
    throw new Error("This photo can't be used.");
  }
  let removed: MetaKind[] = [];
  if (flags.stripMeta) {
    try {
      removed = stripImageMetadata(raw).removed;
    } catch {
      removed = [];
    }
  }
  const img = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const c = canvas(img.width * scale, img.height * scale);
  ctx2d(c).drawImage(img, 0, 0, c.width, c.height);
  if ("close" in img && typeof img.close === "function") img.close();

  const progress: Progress = (loaded, total) => onStage?.({ stage: "model", loaded, total });
  let nsfw: NsfwVerdict | null = null;
  let modelFailed = false;
  let faces: Box[] = [];
  const jobs: Promise<void>[] = [];
  if (flags.nsfwGate) {
    jobs.push(
      (async () => {
        if (saveData()) throw new Error("data saver on");
        const s = await nsfwSession(progress);
        onStage?.({ stage: "checking" });
        const px = pixelsAt(
          c,
          NSFW_MODEL.size,
          NSFW_MODEL.size,
          coverCrop(c.width, c.height, NSFW_MODEL.size, NSFW_MODEL.size),
        );
        const out = await run(s, nsfwInput(px), [1, 3, NSFW_MODEL.size, NSFW_MODEL.size]);
        nsfw = nsfwVerdict(Object.values(out)[0]);
      })().catch(() => {
        modelFailed = true;
      }),
    );
  }
  if (flags.faceBlur) {
    jobs.push(
      (async () => {
        const s = await faceSession();
        const px = pixelsAt(c, FACE_MODEL.width, FACE_MODEL.height);
        const out = await run(s, faceInput(px), [1, 3, FACE_MODEL.height, FACE_MODEL.width]);
        faces = decodeFaces(out.scores, out.boxes, c.width, c.height).map((b) =>
          padBox(b, c.width, c.height),
        );
      })().catch(() => {
        faces = [];
      }),
    );
  }
  await Promise.all(jobs);
  const small = Math.min(1, 256 / Math.max(c.width, c.height));
  const hw = Math.max(1, Math.round(c.width * small));
  const hh = Math.max(1, Math.round(c.height * small));
  const phash = phashRgba(pixelsAt(c, hw, hh), hw, hh);
  return {
    canvas: c,
    width: c.width,
    height: c.height,
    removed,
    faces,
    nsfw,
    gate: gateDecision(nsfw, { nsfwGate: flags.nsfwGate, modelFailed }),
    phash,
    flags,
  };
}

const toBlob = (c: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't save the photo."))),
      "image/jpeg",
      quality,
    ),
  );

/**
 * The bytes that may leave the phone: chosen faces and licence-plate bands pixelated, re-encoded as JPEG
 * (no EXIF), metadata stripped again, shrunk until it fits `maxBytes` when given.
 */
export async function finishPhoto(
  ins: Inspection,
  blur: Box[],
  opts: { maxBytes?: number; maxSide?: number } = {},
): Promise<Blob> {
  if (!ins.gate.allow) throw new Error(ins.gate.reason ?? "This photo can't be used.");
  const work = canvas(ins.width, ins.height);
  const x = ctx2d(work);
  x.drawImage(ins.canvas, 0, 0);
  // NDU-UPG 901 — mosaic plate bands with the same pixelate helper. A miss must not block the photo.
  try {
    const data = x.getImageData(0, 0, work.width, work.height);
    let plates: { x: number; y: number; w: number; h: number }[] = [];
    try {
      plates = plateBoxes(work.width, work.height, data.data);
    } catch {
      plates = [];
    }
    if (blur.length || plates.length) {
      for (const b of blur) pixelate(data.data, work.width, work.height, b);
      for (const p of plates) {
        const box = blurBox(p.x, p.y, p.w, p.h);
        pixelate(data.data, work.width, work.height, { ...box, score: 1 });
      }
      x.putImageData(data, 0, 0);
    }
  } catch {
    if (blur.length) {
      const data = x.getImageData(0, 0, work.width, work.height);
      for (const b of blur) pixelate(data.data, work.width, work.height, b);
      x.putImageData(data, 0, 0);
    }
  }
  let side = Math.min(opts.maxSide ?? MAX_SIDE, Math.max(work.width, work.height));
  let quality = 0.88;
  for (let tries = 0; tries < 12; tries += 1) {
    const s = side / Math.max(work.width, work.height);
    const out = canvas(work.width * s, work.height * s);
    const ox = ctx2d(out);
    ox.imageSmoothingQuality = "high";
    ox.drawImage(work, 0, 0, out.width, out.height);
    const blob = await toBlob(out, quality);
    if (!opts.maxBytes || blob.size <= opts.maxBytes || side <= 160) {
      const clean = stripImageMetadata(new Uint8Array(await blob.arrayBuffer())).bytes;
      if (csamCheck(clean).status !== "unavailable") {
        throw new Error("This photo can't be used.");
      }
      return new Blob([clean.slice().buffer as ArrayBuffer], { type: "image/jpeg" });
    }
    if (quality > 0.6) quality -= 0.12;
    else side = Math.round(side * 0.75);
  }
  throw new Error("That photo is too large for this phone.");
}
