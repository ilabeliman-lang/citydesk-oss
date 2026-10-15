/**
 * Plate blur region. Pure numbers.
 * Does not read pixels, open images, or use the network.
 */

export type BlurBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Grow a rectangle by 10 percent on each side, then clamp it at 0.
 * A side that would cross 0 is cut there; the opposite edge stays put.
 */
export function blurBox(x: number, y: number, w: number, h: number): BlurBox {
  const left = x - w * 0.1;
  const top = y - h * 0.1;
  const width = w * 1.2;
  const height = h * 1.2;
  const nx = Math.max(0, left);
  const ny = Math.max(0, top);
  return {
    x: nx,
    y: ny,
    w: Math.max(0, width - (nx - left)),
    h: Math.max(0, height - (ny - top)),
  };
}
