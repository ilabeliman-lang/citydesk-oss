/**
 * NDU-UPG kids: coloring pad. Original procedural line art (drawn in code, nothing copied) and a
 * scanline flood fill. floodFill is pure (unit tested); the draw functions only take a 2D context.
 */
export const PAD = 320;
export const PALETTE = [
  "#f25f5c",
  "#ffb84d",
  "#ffe066",
  "#7bd389",
  "#4fb3e8",
  "#9b7be8",
  "#f49ac1",
  "#a0704a",
] as const;
export type PictureId = "home" | "garden";
export const PICTURES: { id: PictureId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "garden", label: "Garden" },
];

const LINE = "#2b2118";

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.stroke();
}

/** Paper + outlines for one picture, at PAD x PAD. */
export function drawLineArt(ctx: CanvasRenderingContext2D, id: PictureId) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAD, PAD);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeRect(4, 4, PAD - 8, PAD - 8);
  if (id === "home") {
    // ground
    ctx.beginPath();
    ctx.moveTo(4, 250);
    ctx.quadraticCurveTo(160, 228, 316, 250);
    ctx.stroke();
    // house
    ctx.strokeRect(70, 150, 120, 90);
    ctx.beginPath();
    ctx.moveTo(58, 152);
    ctx.lineTo(130, 92);
    ctx.lineTo(202, 152);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeRect(112, 190, 34, 50); // door
    ctx.strokeRect(80, 166, 26, 26); // window
    ctx.strokeRect(156, 166, 26, 26);
    circle(ctx, 140, 216, 2.5);
    // sun
    circle(ctx, 262, 58, 26);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(262 + Math.cos(a) * 34, 58 + Math.sin(a) * 34);
      ctx.lineTo(262 + Math.cos(a) * 46, 58 + Math.sin(a) * 46);
      ctx.stroke();
    }
    // tree
    ctx.strokeRect(244, 188, 18, 52);
    circle(ctx, 253, 160, 32);
    // heart cloud
    ctx.beginPath();
    ctx.moveTo(60, 70);
    ctx.bezierCurveTo(60, 50, 30, 45, 30, 66);
    ctx.bezierCurveTo(30, 80, 50, 92, 60, 102);
    ctx.bezierCurveTo(70, 92, 90, 80, 90, 66);
    ctx.bezierCurveTo(90, 45, 60, 50, 60, 70);
    ctx.stroke();
  } else {
    // rainbow
    for (const r of [120, 100, 80]) {
      ctx.beginPath();
      ctx.arc(160, 170, r, Math.PI, 0);
      ctx.stroke();
    }
    // hill
    ctx.beginPath();
    ctx.moveTo(4, 236);
    ctx.quadraticCurveTo(110, 196, 316, 240);
    ctx.stroke();
    // flower
    ctx.beginPath();
    ctx.moveTo(110, 300);
    ctx.lineTo(110, 236);
    ctx.stroke();
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      circle(ctx, 110 + Math.cos(a) * 22, 200 + Math.sin(a) * 22, 15);
    }
    circle(ctx, 110, 200, 13);
    ellipse(ctx, 94, 270, 16, 7, -0.5);
    ellipse(ctx, 126, 262, 16, 7, 0.5);
    // butterfly
    ellipse(ctx, 222, 268, 16, 22, -0.4);
    ellipse(ctx, 258, 268, 16, 22, 0.4);
    ellipse(ctx, 240, 270, 4, 18);
    // cloud
    ctx.beginPath();
    ctx.moveTo(40, 70);
    ctx.arc(60, 60, 20, Math.PI * 0.8, Math.PI * 1.75);
    ctx.arc(88, 52, 22, Math.PI * 1.15, Math.PI * 1.95);
    ctx.arc(110, 68, 16, Math.PI * 1.4, Math.PI * 0.4);
    ctx.lineTo(48, 84);
    ctx.arc(46, 72, 13, Math.PI * 0.5, Math.PI * 1.3);
    ctx.stroke();
    circle(ctx, 268, 46, 20); // little sun
  }
  ctx.restore();
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const isLine = (d: Uint8ClampedArray, i: number) => lum(d, i) < 110;

/**
 * Fill the region under (sx, sy) with rgb, stopping at dark outline pixels. Returns pixels painted.
 * A one-pixel grow pass then soaks up the anti-aliased halo next to the outline.
 */
export function floodFill(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  rgb: [number, number, number],
): number {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return 0;
  const seed = (y0 * w + x0) * 4;
  if (isLine(data, seed)) return 0;
  const sr = data[seed];
  const sg = data[seed + 1];
  const sb = data[seed + 2];
  if (sr === rgb[0] && sg === rgb[1] && sb === rgb[2]) return 0;
  const same = (i: number) =>
    Math.abs(data[i] - sr) + Math.abs(data[i + 1] - sg) + Math.abs(data[i + 2] - sb) < 60 &&
    !isLine(data, i);
  const mask = new Uint8Array(w * h);
  const stack: number[] = [x0, y0];
  let painted = 0;
  while (stack.length) {
    const y = stack.pop() as number;
    let x = stack.pop() as number;
    while (x >= 0 && !mask[y * w + x] && same((y * w + x) * 4)) x -= 1;
    x += 1;
    let up = false;
    let down = false;
    while (x < w && !mask[y * w + x] && same((y * w + x) * 4)) {
      mask[y * w + x] = 1;
      painted += 1;
      if (y > 0) {
        const ok = !mask[(y - 1) * w + x] && same(((y - 1) * w + x) * 4);
        if (ok && !up) stack.push(x, y - 1);
        up = ok;
      }
      if (y < h - 1) {
        const ok = !mask[(y + 1) * w + x] && same(((y + 1) * w + x) * 4);
        if (ok && !down) stack.push(x, y + 1);
        down = ok;
      }
      x += 1;
    }
  }
  // grow one pixel into lighter anti-aliased edge pixels (never into the outline itself)
  const grow: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      if (mask[p]) continue;
      const i = p * 4;
      if (lum(data, i) < 150) continue;
      if (
        (x > 0 && mask[p - 1]) ||
        (x < w - 1 && mask[p + 1]) ||
        (y > 0 && mask[p - w]) ||
        (y < h - 1 && mask[p + w])
      )
        grow.push(p);
    }
  }
  for (const p of grow) mask[p] = 2;
  for (let p = 0; p < mask.length; p += 1) {
    if (!mask[p]) continue;
    const i = p * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return painted + grow.length;
}
