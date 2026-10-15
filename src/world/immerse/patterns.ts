/**
 * NDU-UPG immerse #106 #112 #129: procedural textures drawn in code (no downloads, no licences).
 * Each is a tiny RGBA tile (≤ 64×64 = 16 KB), well under the 64 KB budget.
 */
type Img = { width: number; height: number; data: Uint8Array };

/** Deterministic hash noise so tiles look the same every load. */
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/** Water ripples: soft light streaks (two variants cross-fade for shimmer). */
export function ripple(variant: number): Img {
  const w = 64;
  const data = new Uint8Array(w * w * 4);
  for (let y = 0; y < w; y += 1)
    for (let x = 0; x < w; x += 1) {
      const p = (x / w) * Math.PI * 2;
      const q = (y / w) * Math.PI * 2;
      const v =
        Math.sin(p * 2 + Math.sin(q * 3 + variant * 2.1) * 1.2 + variant) *
        Math.sin(q * 4 + variant * 1.3);
      const a = Math.max(0, v - 0.55) * 2.2; // only crests
      const i = (y * w + x) * 4;
      data.set([235, 245, 255, Math.round(Math.min(1, a) * 150)], i);
    }
  return { width: w, height: w, data };
}

/** Speckle ground texture: grass / sand / laterite (#112). */
export function speckle(kind: "grass" | "sand" | "laterite" | "wood" | "wetland"): Img {
  const w = 32;
  const data = new Uint8Array(w * w * 4);
  const r = rand(kind === "grass" ? 7 : kind === "sand" ? 13 : kind === "wood" ? 17 : kind === "wetland" ? 19 : 29);
  const tone: Record<string, [number, number, number][]> = {
    grass: [
      [86, 130, 62],
      [120, 160, 80],
      [70, 108, 52],
    ],
    sand: [
      [214, 192, 150],
      [236, 220, 184],
      [196, 172, 128],
    ],
    laterite: [
      [168, 92, 52],
      [190, 112, 66],
      [142, 76, 44],
    ],
    wood: [
      [38, 68, 34],
      [54, 88, 42],
      [30, 56, 28],
    ],
    wetland: [
      [70, 102, 72],
      [86, 114, 80],
      [58, 88, 64],
    ],
  };
  for (let i = 0; i < w * w; i += 1) {
    const n = r();
    if (n < 0.55) continue; // transparent: the style's fill shows through
    const c = tone[kind][Math.floor(r() * 3)];
    data.set([c[0], c[1], c[2], Math.round(60 + r() * 90)], i * 4);
  }
  return { width: w, height: w, data };
}

/** Soft cloud-shadow noise (#129) as a PNG data URL (needs a DOM canvas; null if unavailable). */
export function cloudShadowUrl(seed = 3): string | null {
  try {
    const n = 128;
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const r = rand(seed);
    ctx.clearRect(0, 0, n, n);
    for (let i = 0; i < 26; i += 1) {
      const x = r() * n;
      const y = r() * n;
      const rad = 10 + r() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(20,24,40,0.55)");
      g.addColorStop(1, "rgba(20,24,40,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}
