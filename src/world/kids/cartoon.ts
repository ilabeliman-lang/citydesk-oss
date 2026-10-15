/**
 * NDU-UPG kids: the TV show. "Pip and Puff" is an original looping cartoon drawn in code for this app
 * (a round sunny friend called Pip bouncing over hills, and Puff the little cloud who rains, then makes
 * a rainbow). No characters, music or footage from any real show, and no streaming.
 */
const TAU = Math.PI * 2;
export const LOOP_S = 14;

function face(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sleepy: boolean) {
  ctx.fillStyle = "#2b2118";
  ctx.strokeStyle = "#2b2118";
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.lineCap = "round";
  if (sleepy) {
    for (const dx of [-0.35, 0.35]) {
      ctx.beginPath();
      ctx.arc(x + dx * r, y - 0.1 * r, r * 0.16, 0, Math.PI);
      ctx.stroke();
    }
  } else {
    for (const dx of [-0.35, 0.35]) {
      ctx.beginPath();
      ctx.arc(x + dx * r, y - 0.15 * r, r * 0.11, 0, TAU);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.arc(x, y + 0.12 * r, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,120,120,0.45)";
  for (const dx of [-0.6, 0.6]) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + 0.15 * r, r * 0.14, 0, TAU);
    ctx.fill();
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x - s * 0.6, y, s * 0.5, 0, TAU);
  ctx.arc(x, y - s * 0.3, s * 0.65, 0, TAU);
  ctx.arc(x + s * 0.6, y, s * 0.5, 0, TAU);
  ctx.rect(x - s * 0.6, y - s * 0.1, s * 1.2, s * 0.6);
  ctx.fill();
}

/** Draw one frame at time t (seconds). night = the bedtime "goodnight" episode. */
export function drawCartoon(
  ctx: CanvasRenderingContext2D,
  t: number,
  w: number,
  h: number,
  night = false,
) {
  const p = (t % LOOP_S) / LOOP_S;
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (night) {
    sky.addColorStop(0, "#141c3d");
    sky.addColorStop(1, "#2c3a6b");
  } else {
    sky.addColorStop(0, "#7ec8f2");
    sky.addColorStop(1, "#d6f0ff");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  if (night) {
    for (let i = 0; i < 24; i += 1) {
      const sx = (i * 73) % w;
      const sy = (i * 37) % (h * 0.6);
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.fillStyle = `rgba(255,248,220,${0.3 + tw * 0.7})`;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.fillStyle = "#fff4c8";
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.22, h * 0.11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#2c3a6b";
    ctx.beginPath();
    ctx.arc(w * 0.83, h * 0.19, h * 0.1, 0, TAU);
    ctx.fill();
  }
  // rolling hills (scroll)
  const scroll = night ? 0 : (t * 18) % w;
  for (const [base, amp, col, speed] of [
    [0.72, 0.06, night ? "#24405a" : "#8fd694", 0.5],
    [0.82, 0.05, night ? "#1d3448" : "#5cbf6a", 1],
  ] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = h * base + Math.sin(((x + scroll * speed) / w) * TAU * 1.5) * h * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }
  const r = h * 0.12;
  if (night) {
    // Pip asleep on the hill, Zz floating
    const px = w * 0.4;
    const py = h * 0.7 - r + Math.sin(t * 1.2) * 1.5;
    ctx.fillStyle = "#ffd84a";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
    face(ctx, px, py, r, true);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `${Math.round(r * 0.7)}px sans-serif`;
    const z = (t * 0.6) % 1;
    ctx.globalAlpha = 1 - z;
    ctx.fillText("z", px + r * (1 + z), py - r * (1 + z * 2));
    ctx.globalAlpha = 1;
    return;
  }
  // Puff the cloud drifts in, rains (0.3-0.55), then a rainbow (0.55-0.9)
  const cx = w * (0.15 + 0.6 * Math.min(1, p / 0.3));
  const cy = h * 0.22 + Math.sin(t * 1.5) * 3;
  if (p > 0.55 && p < 0.95) {
    const a = Math.min(1, (p - 0.55) / 0.08) * Math.min(1, (0.95 - p) / 0.08);
    const cols = ["#ff6b6b", "#ffb84d", "#ffe066", "#7bd389", "#4fb3e8", "#9b7be8"];
    ctx.globalAlpha = a * 0.8;
    ctx.lineWidth = h * 0.035;
    cols.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.85, h * (0.6 - i * 0.035), Math.PI, 0);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  if (p > 0.3 && p < 0.55) {
    ctx.strokeStyle = "#4fa3e0";
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i += 1) {
      const dx = cx - h * 0.12 + ((i * 17) % Math.round(h * 0.24));
      const dy = cy + h * 0.1 + ((t * 90 + i * 23) % (h * 0.4));
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx - 1, dy + 6);
      ctx.stroke();
    }
  }
  cloud(ctx, cx, cy, h * 0.12, "#ffffff");
  face(ctx, cx, cy - h * 0.02, h * 0.09, false);
  // Pip bounces along; a happy big jump under the rainbow
  const px = w * (0.2 + 0.25 * Math.sin(p * TAU));
  const hop = Math.abs(Math.sin(t * 3.2)) * h * (p > 0.6 && p < 0.9 ? 0.22 : 0.1);
  const ground = h * 0.74 + Math.sin(((px + scroll) / w) * TAU * 1.5) * h * 0.05;
  const squash = hop < 2 ? 0.85 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(px, ground, r * 0.9, r * 0.25, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(px, ground - r - hop);
  ctx.scale(1 / squash, squash);
  ctx.fillStyle = "#ffd84a";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#f2a93b";
  ctx.lineWidth = 2;
  ctx.stroke();
  face(ctx, 0, 0, r, false);
  ctx.restore();
}
