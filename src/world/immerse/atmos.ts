import type { Tier } from "@/world/perf/tier";
import type { Sun } from "@/world/realism/sun";
import type { IMap, Disposer } from "./mapTypes";
import { dropBudget, HAZE_RGB, rainSlant, type Fx } from "./weather";

/**
 * NDU-UPG immerse atmosphere overlays (DOM/2D only: no second WebGL context, bible "one context"):
 *   #302 #310 #316 rain streaks in a 2D canvas over the map (Tier A 2000, B 600, C off), slanted by
 *        the wind relative to the camera bearing, small splashes near the camera on Tier A
 *   #314 #338 no particles under reduced motion, battery saver or data saver (the bubble icon shows rain)
 *   fog veil: horizon-weighted haze whose density follows visibility/humidity (#343), warm for Harmattan/vog
 *   #115-lite #116 sky band at high pitch: soft drifting clouds by cover, stars on clear nights
 *   #305 lightning flash in storms (none under reduced motion) + `ndu:thunder` event for the soundscape
 *   #150 rainbow after rain when the sun is low (< 42°) behind the camera — a quiet promise sign
 *   #344 storms darken the UI glass slightly (data-ndu-wx on <html>)
 * Pointer-events none everywhere; the rAF loop only runs while it is actually raining and visible.
 */

const CSS = `
.ndu-atmos{position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden}
.ndu-fog,.ndu-dim{position:absolute;inset:0;transition:opacity 2.5s ease,background 2.5s ease}
.ndu-dim{background:#1c2434;opacity:0}
.ndu-skyband{position:absolute;left:0;right:0;top:0;transition:opacity 2s ease,height .4s ease}
.ndu-cloud{position:absolute;border-radius:50%;filter:blur(18px);background:var(--c);opacity:.9;animation:ndu-drift var(--d) linear infinite}
@keyframes ndu-drift{from{transform:translateX(-30vw)}to{transform:translateX(130vw)}}
.ndu-stars{position:absolute;inset:0;background-image:radial-gradient(1px 1px at 12% 22%,#fff 50%,transparent),radial-gradient(1px 1px at 33% 64%,#fff 50%,transparent),radial-gradient(1.5px 1.5px at 58% 18%,#fff 50%,transparent),radial-gradient(1px 1px at 77% 48%,#fff 50%,transparent),radial-gradient(1px 1px at 88% 12%,#fff 50%,transparent),radial-gradient(1.5px 1.5px at 22% 80%,#fff 50%,transparent),radial-gradient(1px 1px at 46% 40%,#fff 50%,transparent),radial-gradient(1px 1px at 66% 78%,#fff 50%,transparent);animation:ndu-twinkle 5s ease-in-out infinite alternate;transition:opacity 2s}
@keyframes ndu-twinkle{from{filter:brightness(.7)}to{filter:brightness(1.2)}}
.ndu-rainbow{position:absolute;left:50%;bottom:-40%;width:150%;aspect-ratio:1;transform:translateX(-50%);border-radius:50%;
 background:radial-gradient(circle,transparent 61%,rgba(148,0,211,.55) 62%,rgba(75,0,130,.5) 63%,rgba(0,90,255,.5) 64.5%,rgba(0,200,80,.5) 66%,rgba(255,240,0,.5) 67.5%,rgba(255,127,0,.5) 69%,rgba(255,0,0,.45) 70.5%,transparent 72%);transition:opacity 4s;mix-blend-mode:screen}
.ndu-flash{position:absolute;inset:0;background:#eef2ff;opacity:0}
.ndu-rain{position:absolute;inset:0;width:100%;height:100%}
html[data-ndu-wx="storm"] .bg-surface\\/95{background-color:color-mix(in srgb,var(--color-surface,#2a221b) 86%,#17142a)}
@media (prefers-reduced-motion: reduce){.ndu-cloud,.ndu-stars{animation:none}.ndu-fog,.ndu-skyband,.ndu-rainbow{transition:none}}
`;

type Drop = { x: number; y: number; l: number; v: number };

export type Atmos = {
  dispose: Disposer;
  setFx: (fx: Fx, sun: Sun, particles: boolean) => void;
  setTier: (t: Tier) => void;
};

export function attachAtmos(map: IMap, tier: Tier, reducedMotion: boolean): Atmos {
  const host = map.getContainer();
  const root = document.createElement("div");
  root.className = "ndu-atmos";
  root.setAttribute("aria-hidden", "true");
  root.dataset.nduImmerse = "atmos";
  const style = document.createElement("style");
  style.textContent = CSS;
  const band = document.createElement("div");
  band.className = "ndu-skyband";
  const stars = document.createElement("div");
  stars.className = "ndu-stars";
  stars.style.opacity = "0";
  const rainbow = document.createElement("div");
  rainbow.className = "ndu-rainbow";
  rainbow.style.opacity = "0";
  band.append(stars, rainbow);
  const clouds: HTMLDivElement[] = [];
  for (let i = 0; i < 5; i += 1) {
    const c = document.createElement("div");
    c.className = "ndu-cloud";
    c.style.cssText = `top:${8 + ((i * 37) % 60)}%;left:0;width:${28 + ((i * 13) % 22)}vw;height:${16 + ((i * 7) % 14)}%;--d:${90 + i * 23}s;animation-delay:-${i * 31}s`;
    band.append(c);
    clouds.push(c);
  }
  const dim = document.createElement("div");
  dim.className = "ndu-dim";
  const fog = document.createElement("div");
  fog.className = "ndu-fog";
  fog.style.opacity = "0";
  const canvas = document.createElement("canvas");
  canvas.className = "ndu-rain";
  const flash = document.createElement("div");
  flash.className = "ndu-flash";
  root.append(style, dim, band, fog, canvas, flash);
  host.append(root);

  let curTier = tier;
  let fx: Fx | null = null;
  let sun: Sun | null = null;
  let particles = true;
  let drops: Drop[] = [];
  let frame = 0;
  let w = 0;
  let h = 0;
  const ctx = canvas.getContext("2d");

  const resize = () => {
    const ratio = curTier === "A" ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    w = host.clientWidth;
    h = host.clientHeight;
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(host);

  const spawn = (d: Drop, top: boolean) => {
    d.x = Math.random() * (w + 80) - 40;
    d.y = top ? -Math.random() * 60 : Math.random() * h;
    d.l = 9 + Math.random() * 14;
    d.v = 620 + Math.random() * 420;
  };
  let last = 0;
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    if (!ctx || !fx) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const slant = rainSlant(fx, map.getBearing());
    const pitch = map.getPitch();
    const stretch = 1 + pitch / 120; // tilted camera: longer streaks
    ctx.clearRect(0, 0, w, h);
    // light streaks read on dark night maps; blue-grey ones on the bright daytime basemap
    ctx.strokeStyle = sun && sun.altitude < -4 ? "rgba(185,200,230,.5)" : "rgba(80,100,130,.6)";
    ctx.lineWidth = curTier === "A" ? 1.2 : 1;
    ctx.beginPath();
    for (const d of drops) {
      d.y += d.v * dt;
      d.x += d.v * dt * slant;
      if (d.y > h + 20 || d.x < -60 || d.x > w + 60) spawn(d, true);
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.l * slant * stretch, d.y - d.l * stretch);
    }
    ctx.stroke();
    if (curTier === "A") {
      // #316 splashes near the camera (lower half of the screen)
      ctx.strokeStyle = sun && sun.altitude < -4 ? "rgba(225,235,248,.35)" : "rgba(110,130,155,.4)";
      ctx.beginPath();
      const n = Math.round(40 * fx.rain);
      for (let i = 0; i < n; i += 1) {
        const x = Math.random() * w;
        const y = h * 0.55 + Math.random() * h * 0.45;
        const r = 1.5 + Math.random() * 2.5;
        ctx.moveTo(x + r, y);
        ctx.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  };
  const stopRain = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    ctx?.clearRect(0, 0, w, h);
  };
  const syncRain = () => {
    const want =
      fx && particles && document.visibilityState === "visible"
        ? dropBudget(curTier, fx, { reducedMotion })
        : 0;
    if (!want) {
      drops = [];
      return stopRain();
    }
    while (drops.length < want) {
      const d = { x: 0, y: 0, l: 0, v: 0 };
      spawn(d, false);
      drops.push(d);
    }
    drops.length = want;
    if (!frame) frame = requestAnimationFrame(loop);
  };

  // ── sky band + fog follow the camera pitch ──
  const layout = () => {
    if (!fx) return;
    const pitch = map.getPitch();
    const sky = Math.max(0, Math.min(1, (pitch - 45) / 25)); // 0 below 45°, 1 at 70°
    band.style.height = `${Math.round(18 + sky * 22)}%`;
    band.style.opacity = String(sky);
    const night = sun ? Math.max(0, Math.min(1, -(sun.altitude + 4) / 8)) : 0;
    const [r, g, b] = fx.haze ? HAZE_RGB : night > 0.5 ? [70, 78, 104] : [222, 228, 234];
    const f = fx.fog;
    const top = Math.min(0.92, f * (0.55 + 0.4 * sky));
    fog.style.background = `linear-gradient(180deg,rgba(${r},${g},${b},${top}) 0%,rgba(${r},${g},${b},${f * 0.45}) 45%,rgba(${r},${g},${b},${f * 0.25}) 100%)`;
    fog.style.opacity = f > 0.02 ? "1" : "0";
    // overcast / rain: the flat basemap is not lit by setLight, so dim it a touch to match (#304)
    dim.style.opacity = String(
      Math.round(
        Math.min(0.28, fx.cloud * 0.08 + fx.rain * 0.12 + (fx.storm ? 0.06 : 0)) *
          (1 - night * 0.6) *
          100,
      ) / 100,
    );
    const cloudCol = fx.storm
      ? "rgba(70,70,92,.85)"
      : night > 0.5
        ? "rgba(90,96,120,.6)"
        : "rgba(255,255,255,.75)";
    clouds.forEach((c, i) => {
      c.style.setProperty("--c", cloudCol);
      c.style.display = i < Math.round(fx!.cloud * 5) ? "" : "none";
    });
    stars.style.opacity = String(night > 0.6 && fx.cloud < 0.6 ? (1 - fx.cloud) * 0.9 : 0);
    // #150 rainbow: after rain, sun 0..42° and roughly behind the camera
    let bow = 0;
    if (fx.afterRain && sun && sun.altitude > 0 && sun.altitude < 42) {
      const away = Math.abs(((((map.getBearing() - (sun.azimuth + 180)) % 360) + 540) % 360) - 180);
      if (away < 60) bow = 0.55 * (1 - away / 60);
    }
    rainbow.style.opacity = String(bow);
  };
  let raf = 0;
  const onPitch = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      layout();
    });
  };
  map.on("pitch", onPitch);
  map.on("rotate", onPitch);

  // ── lightning (#305) ──
  let bolt = 0;
  const scheduleBolt = () => {
    window.clearTimeout(bolt);
    if (!fx?.storm) return;
    bolt = window.setTimeout(
      () => {
        if (document.visibilityState === "visible" && fx?.storm) {
          if (!reducedMotion) window.dispatchEvent(new CustomEvent("ndu:lightning")); // NDU-UPG props: lamps/hemisphere pop
          if (!reducedMotion)
            flash.animate(
              [
                { opacity: 0 },
                { opacity: 0.55 },
                { opacity: 0.1 },
                { opacity: 0.4 },
                { opacity: 0 },
              ],
              { duration: 420, easing: "ease-out" },
            );
          const distanceKm = 1 + Math.random() * 6;
          window.setTimeout(
            () => window.dispatchEvent(new CustomEvent("ndu:thunder", { detail: { distanceKm } })),
            distanceKm * 340 * 0.9,
          );
        }
        scheduleBolt();
      },
      7000 + Math.random() * 14000,
    );
  };

  const onVis = () => syncRain();
  document.addEventListener("visibilitychange", onVis);

  return {
    setFx: (next, s, p) => {
      const stormChanged = next.storm !== fx?.storm;
      fx = next;
      sun = s;
      particles = p;
      document.documentElement.dataset.nduWx = next.kind;
      layout();
      syncRain();
      if (stormChanged) scheduleBolt();
    },
    setTier: (t) => {
      curTier = t;
      resize();
      syncRain();
    },
    dispose: () => {
      stopRain();
      cancelAnimationFrame(raf);
      window.clearTimeout(bolt);
      ro?.disconnect();
      map.off("pitch", onPitch);
      map.off("rotate", onPitch);
      document.removeEventListener("visibilitychange", onVis);
      delete document.documentElement.dataset.nduWx;
      root.remove();
    },
  };
}
