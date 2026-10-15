import { useEffect, useState, useSyncExternalStore } from "react";
import { getRealism, setTimeOverride, shownMinutes, subscribeRealism } from "./state.ts";
import { clockLabel, presets } from "./sun.ts";

/**
 * NDU-UPG #7: time-of-day scrubber. An embossed push button showing the viewed place's clock
 * (sun/moon icon); tap to open a dial with a sky-gradient slider and Sunrise · Noon · Golden ·
 * Sunset · Night presets. "Live" follows the real local time of the place. Persists (localStorage).
 */

const CSS = `
.ndu-sun-btn{display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;border-radius:999px;border:1px solid rgba(255,255,255,.14);
 background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(0,0,0,.18)),var(--color-surface,#2a221b);color:inherit;font:600 13px/1 sans-serif;
 box-shadow:0 4px 0 rgba(0,0,0,.38),0 8px 18px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.18);transition:transform .12s,box-shadow .12s}
.ndu-sun-btn:active{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.12)}
.ndu-sun-btn:focus-visible,.ndu-sun-chip:focus-visible,.ndu-sun-range:focus-visible{outline:2px solid #f0c14a;outline-offset:2px}
.ndu-sun-ico{width:22px;height:22px;border-radius:999px;display:grid;place-items:center;box-shadow:inset 0 -2px 3px rgba(0,0,0,.35),0 0 10px var(--glow)}
.ndu-sun-live{font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:999px;background:#e8843a;color:#1a1511}
.ndu-sun-card{margin-top:8px;width:min(15rem,calc(100vw - 6rem));padding:12px;border-radius:18px;background:var(--color-surface,#2a221b);
 box-shadow:0 5px 0 rgba(0,0,0,.4),0 14px 28px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.14);animation:ndu-sun-in .18s ease-out}
@keyframes ndu-sun-in{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
.ndu-sun-range{width:100%;height:28px;-webkit-appearance:none;appearance:none;background:transparent;margin:4px 0 8px}
.ndu-sun-range::-webkit-slider-runnable-track{height:12px;border-radius:999px;background:var(--track);box-shadow:inset 0 2px 4px rgba(0,0,0,.45)}
.ndu-sun-range::-moz-range-track{height:12px;border-radius:999px;background:var(--track);box-shadow:inset 0 2px 4px rgba(0,0,0,.45)}
.ndu-sun-range::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;margin-top:-8px;border-radius:999px;background:#f6efe2;border:3px solid #e8843a;box-shadow:0 3px 0 rgba(0,0,0,.4)}
.ndu-sun-range::-moz-range-thumb{width:24px;height:24px;border-radius:999px;background:#f6efe2;border:3px solid #e8843a;box-shadow:0 3px 0 rgba(0,0,0,.4)}
.ndu-sun-chips{display:flex;flex-wrap:wrap;gap:6px}
.ndu-sun-chip{min-height:36px;padding:0 10px;border-radius:999px;border:0;font:600 12px sans-serif;color:inherit;background:rgba(255,255,255,.08);
 box-shadow:0 3px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12);transition:transform .1s}
.ndu-sun-chip:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.35)}
.ndu-sun-chip[aria-pressed="true"]{background:#e8843a;color:#1a1511}
@media (prefers-reduced-motion: reduce){.ndu-sun-btn,.ndu-sun-chip{transition:none}.ndu-sun-card{animation:none}}
`;

function icon(alt: number) {
  // CSS-drawn orbs (no emoji: some Android fonts render them as boxes)
  if (alt > 10) return { bg: "radial-gradient(circle at 35% 35%,#fff3b0,#f6c445 60%,#e0962a)", glow: "rgba(246,196,69,.8)" };
  if (alt > -4) return { bg: "radial-gradient(circle at 35% 35%,#ffd2a0,#f39a52 60%,#c4582a)", glow: "rgba(243,154,82,.8)" };
  return { bg: "radial-gradient(circle at 70% 30%,#3c4a7a 38%,#dfe6ff 40%,#b8c4f0 70%)", glow: "rgba(120,150,230,.6)" };
}

export function TimeDial() {
  const st = useSyncExternalStore(subscribeRealism, getRealism, getRealism);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []); // the clock differs between server and phone: render it after mount
  if (!ready) return null;
  const minutes = shownMinutes(st);
  const live = st.override == null;
  const ico = icon(st.sun.altitude);
  const p = presets(st.at, st.lat, st.lng, st.zone);
  const pct = (m: number) => `${((m / 1440) * 100).toFixed(1)}%`;
  const track = `linear-gradient(90deg,#141a33 0%,#141a33 ${pct(p.sunrise - 60)},#f39a52 ${pct(p.sunrise)},#8cc6ee ${pct(p.sunrise + 120)},#8cc6ee ${pct(p.sunset - 120)},#f39a52 ${pct(p.sunset)},#141a33 ${pct(p.sunset + 60)},#141a33 100%)`;
  const chips: [string, number | null][] = [
    ["Live", null],
    ["Sunrise", p.sunrise],
    ["Noon", p.noon],
    ["Golden", p.golden],
    ["Sunset", p.sunset],
    ["Night", p.night],
  ];
  return (
    <div data-ndu-sun="1">
      <style>{CSS}</style>
      <button
        type="button"
        className="ndu-sun-btn"
        aria-expanded={open}
        aria-label={`Time of day ${clockLabel(minutes)}${live ? ", live" : ""}. ${open ? "Close" : "Open"} the sun dial`}
        onClick={() => {
          navigator.vibrate?.(8);
          setOpen((v) => !v);
        }}
      >
        <span className="ndu-sun-ico" style={{ background: ico.bg, ["--glow" as string]: ico.glow }} aria-hidden />
      </button>
      {open ? (
        <div className="ndu-sun-card" role="group" aria-label="Sun dial">
          <p className="mb-1 text-sm font-medium tabular-nums">{clockLabel(minutes)}{live ? " · Live" : ""}</p>
          <input
            className="ndu-sun-range"
            type="range"
            min={0}
            max={1435}
            step={5}
            value={minutes}
            style={{ ["--track" as string]: track }}
            aria-label="Time of day"
            aria-valuetext={clockLabel(minutes)}
            onChange={(e) => setTimeOverride(Number(e.target.value))}
          />
          <div className="ndu-sun-chips">
            {chips.map(([label, value]) => (
              <button
                key={label}
                type="button"
                className="ndu-sun-chip"
                aria-pressed={value == null ? live : !live && Math.abs(minutes - value) < 5}
                onClick={() => {
                  navigator.vibrate?.(6);
                  setTimeOverride(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-muted mt-2 text-[11px]">Sun at {Math.round(st.sun.altitude)}° · {st.zone.replace("_", " ")}</p>
        </div>
      ) : null}
    </div>
  );
}
