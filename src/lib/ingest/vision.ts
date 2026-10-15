/**
 * NDU-AI safe ingest #1: pure pre/post-processing for the on-device photo models (isomorphic, no deps).
 * The ONNX sessions live in src/world/ingest/models.ts (browser, lazy) and src/lib/ingest/nsfw.server.ts
 * (Node CPU, opt-in); both feed tensors built here so the two sides agree byte for byte.
 *
 * Models (both permissive, commercial use allowed — see docs/ingest/SAFE_INGEST.md):
 *  - NSFW: Marqo/nsfw-image-detection-384 (ViT-tiny, 5.7M params, Apache-2.0), ONNX export pinned by
 *    commit + SHA-256. Input 1x3x384x384, (x/255-0.5)/0.5, logits [NSFW, SFW].
 *  - Faces: UltraFace version-RFB-320 (Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB, MIT), self-hosted
 *    under /models/ingest. Input 1x3x240x320, (x-127)/128; outputs scores [1,N,2] and boxes [1,N,4] (0..1 corners).
 */
export const NSFW_MODEL = {
  id: "Marqo/nsfw-image-detection-384",
  licence: "Apache-2.0",
  url: "https://huggingface.co/Marqo/nsfw-image-detection-384/resolve/b2d8f0c3abe6e05062288460ecf58e42ea690e84/onnx/model.onnx",
  sha256: "7b81155313d894bba3a3b9bace059a6da2a0c509d10cea43fcb0b3c5a4edd26d",
  bytes: 22527617,
  size: 384,
  labels: ["NSFW", "SFW"] as const,
} as const;

export const FACE_MODEL = {
  id: "UltraFace version-RFB-320",
  licence: "MIT",
  url: "/models/ingest/ultraface320.onnx",
  sha256: "34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017",
  bytes: 1270727,
  width: 320,
  height: 240,
} as const;

/** Thresholds on P(NSFW). Only clear cases are blocked; borderline is allowed with a soft note. */
export const NSFW_BLOCK = 0.85;
export const NSFW_BORDERLINE = 0.5;
export const FACE_MIN_SCORE = 0.7;
export const FACE_IOU = 0.3;

export type Box = { x: number; y: number; w: number; h: number; score: number };
export type NsfwVerdict = { pNsfw: number; verdict: "ok" | "borderline" | "block" };

/** RGBA pixels (already resized to w x h) -> planar float32 CHW, (v * scale - mean) / std per channel. */
export function toChw(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  mean: number,
  std: number,
  scale = 1,
): Float32Array {
  const plane = w * h;
  const out = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i += 1, p += 4) {
    out[i] = (rgba[p] * scale - mean) / std;
    out[plane + i] = (rgba[p + 1] * scale - mean) / std;
    out[2 * plane + i] = (rgba[p + 2] * scale - mean) / std;
  }
  return out;
}

export const nsfwInput = (rgba384: Uint8Array | Uint8ClampedArray) =>
  toChw(rgba384, NSFW_MODEL.size, NSFW_MODEL.size, 0.5, 0.5, 1 / 255);
export const faceInput = (rgba320x240: Uint8Array | Uint8ClampedArray) =>
  toChw(rgba320x240, FACE_MODEL.width, FACE_MODEL.height, 127, 128, 1);

export function softmax(logits: ArrayLike<number>): number[] {
  const m = Math.max(...Array.from(logits));
  const e = Array.from(logits, (v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function nsfwVerdict(logits: ArrayLike<number>): NsfwVerdict {
  const pNsfw = softmax(logits)[0];
  return {
    pNsfw,
    verdict: pNsfw >= NSFW_BLOCK ? "block" : pNsfw >= NSFW_BORDERLINE ? "borderline" : "ok",
  };
}

/** "Cover" crop rectangle (centre) for squeezing a w x h photo into a tw x th model input without distortion. */
export function coverCrop(
  w: number,
  h: number,
  tw: number,
  th: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const s = Math.max(tw / w, th / h);
  const sw = tw / s;
  const sh = th / s;
  return { sx: (w - sw) / 2, sy: (h - sh) / 2, sw, sh };
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function nms(boxes: Box[], threshold = FACE_IOU): Box[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: Box[] = [];
  for (const b of sorted) if (keep.every((k) => iou(k, b) <= threshold)) keep.push(b);
  return keep;
}

/**
 * UltraFace outputs -> face boxes in source-image pixels. The model saw the whole photo stretched to 320x240
 * (it is trained that way), so normalised corners map straight back to the original size.
 */
export function decodeFaces(
  scores: ArrayLike<number>,
  boxes: ArrayLike<number>,
  imgW: number,
  imgH: number,
  minScore = FACE_MIN_SCORE,
): Box[] {
  const n = Math.floor(scores.length / 2);
  const found: Box[] = [];
  for (let i = 0; i < n; i += 1) {
    const score = scores[i * 2 + 1];
    if (score < minScore) continue;
    const x1 = Math.max(0, Math.min(1, boxes[i * 4])) * imgW;
    const y1 = Math.max(0, Math.min(1, boxes[i * 4 + 1])) * imgH;
    const x2 = Math.max(0, Math.min(1, boxes[i * 4 + 2])) * imgW;
    const y2 = Math.max(0, Math.min(1, boxes[i * 4 + 3])) * imgH;
    if (x2 - x1 < 2 || y2 - y1 < 2) continue;
    found.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score });
  }
  return nms(found);
}

/** Grow a face box (hair, ears, chin) and clamp it to the image. */
export function padBox(b: Box, imgW: number, imgH: number, grow = 0.35): Box {
  const dx = b.w * grow;
  const dy = b.h * grow;
  const x = Math.max(0, Math.floor(b.x - dx));
  const y = Math.max(0, Math.floor(b.y - dy));
  const x2 = Math.min(imgW, Math.ceil(b.x + b.w + dx));
  const y2 = Math.min(imgH, Math.ceil(b.y + b.h + dy));
  return { x, y, w: x2 - x, h: y2 - y, score: b.score };
}

/**
 * Irreversible mosaic inside a box, in place on RGBA pixels: each cell becomes its average colour, with
 * cells sized so a face is at most `cells` blocks across (8 by default — no features survive).
 */
export function pixelate(
  rgba: Uint8Array | Uint8ClampedArray,
  imgW: number,
  imgH: number,
  box: Box,
  cells = 8,
): void {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(imgW, Math.ceil(box.x + box.w));
  const y1 = Math.min(imgH, Math.ceil(box.y + box.h));
  const cell = Math.max(2, Math.ceil(Math.max(x1 - x0, y1 - y0) / cells));
  for (let cy = y0; cy < y1; cy += cell) {
    for (let cx = x0; cx < x1; cx += cell) {
      const ex = Math.min(x1, cx + cell);
      const ey = Math.min(y1, cy + cell);
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = cy; y < ey; y += 1) {
        for (let x = cx; x < ex; x += 1) {
          const p = (y * imgW + x) * 4;
          r += rgba[p];
          g += rgba[p + 1];
          b += rgba[p + 2];
          n += 1;
        }
      }
      r = Math.round(r / n);
      g = Math.round(g / n);
      b = Math.round(b / n);
      for (let y = cy; y < ey; y += 1) {
        for (let x = cx; x < ex; x += 1) {
          const p = (y * imgW + x) * 4;
          rgba[p] = r;
          rgba[p + 1] = g;
          rgba[p + 2] = b;
        }
      }
    }
  }
}

export type GateOutcome = {
  allow: boolean;
  reason: string | null;
  note: string | null;
};

/** One place that turns model results + flags into the yes/no shown on the phone. */
export function gateDecision(
  nsfw: NsfwVerdict | null,
  opts: { nsfwGate: boolean; modelFailed?: boolean },
): GateOutcome {
  if (!opts.nsfwGate) return { allow: true, reason: null, note: null };
  if (!nsfw) {
    return {
      allow: true,
      reason: null,
      note: opts.modelFailed
        ? "The safety check couldn't run on this phone, so this photo may be reviewed."
        : null,
    };
  }
  if (nsfw.verdict === "block")
    return {
      allow: false,
      reason: "This photo looks like adult content, so it can't be used here. Pick another photo.",
      note: null,
    };
  if (nsfw.verdict === "borderline")
    return {
      allow: true,
      reason: null,
      note: "If this photo shows a person, check it's appropriate before using it.",
    };
  return { allow: true, reason: null, note: null };
}
