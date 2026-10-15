import { useEffect, useState, useSyncExternalStore } from "react";
import { getRealism, subscribeRealism } from "@/world/realism/state";
import { clockLabel, localMinutes } from "@/world/realism/sun";
import {
  getImmerse,
  previewHour,
  setEnabled,
  setOverride,
  setSaver,
  setSound,
  setVolume,
  startImmerse,
  subscribeImmerse,
} from "./store";
import { KIND_LABEL, kindFromCode, OVERRIDES, type Kind } from "./weather";
import type { Soundscape } from "./sound";
import { Bubble } from "@/world/bubbles/Bubble"; // NDU-UPG bubbles system (PR #7)
import { useBubbleMode } from "@/world/bubbles/mode";

/**
 * NDU-UPG immerse #308 #311 #330 #336 #338 #342 #350 + soundscape: ONE embossed bubble on the map
 * (weather icon + temperature). Tap → card with the forecast strip (tap an hour to preview it on the
 * map + dial), manual weather for demos, the sound bubble (off by default) + volume, battery saver,
 * the Effects switch, and the Open-Meteo credit. CSS-drawn icons (no emoji, no assets).
 */

const CSS = `
.ndu-wx-btn{position:relative;display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;border-radius:999px;border:1px solid rgba(255,255,255,.14);
 background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(0,0,0,.18)),var(--color-surface,#2a221b);color:inherit;font:600 13px/1 sans-serif;
 box-shadow:0 4px 0 rgba(0,0,0,.38),0 8px 18px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.18);transition:transform .12s,box-shadow .12s}
.ndu-wx-btn:active{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.12)}
.ndu-wx-btn:focus-visible,.ndu-wx-chip:focus-visible,.ndu-wx-snd:focus-visible,.ndu-wx-hr:focus-visible{outline:2px solid #f0c14a;outline-offset:2px}
.ndu-wx-dot{position:absolute;top:4px;right:6px;width:8px;height:8px;border-radius:99px;background:#7ee08a;box-shadow:0 0 6px #7ee08a}
.ndu-wx-card{margin-top:8px;width:min(17rem,calc(100vw - 6rem));max-height:min(56vh,30rem);overflow:auto;padding:12px;border-radius:18px;background:var(--color-surface,#2a221b);
 box-shadow:0 5px 0 rgba(0,0,0,.4),0 14px 28px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.14);animation:ndu-wx-in .18s ease-out;font-size:12px}
@keyframes ndu-wx-in{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
.ndu-wx-row{display:flex;flex-wrap:wrap;gap:6px}
.ndu-wx-chip{min-height:36px;padding:0 10px;border-radius:999px;border:0;font:600 12px sans-serif;color:inherit;background:rgba(255,255,255,.08);
 box-shadow:0 3px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12);transition:transform .1s}
.ndu-wx-chip:active,.ndu-wx-hr:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.35)}
.ndu-wx-chip[aria-pressed="true"],.ndu-wx-hr[aria-pressed="true"]{background:#e8843a;color:#1a1511}
.ndu-wx-hours{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:thin}
.ndu-wx-hr{flex:0 0 auto;display:grid;justify-items:center;gap:3px;min-width:46px;min-height:64px;padding:6px 4px;border-radius:14px;border:0;color:inherit;font:600 11px sans-serif;
 background:rgba(255,255,255,.07);box-shadow:0 3px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.1)}
.ndu-wx-snd{position:relative;display:grid;place-items:center;width:56px;height:56px;border-radius:999px;border:0;color:#1a1511;flex:0 0 auto;
 background:radial-gradient(circle at 35% 30%,#ffd9a8,#e8843a 60%,#b45a1c);box-shadow:0 5px 0 #6e3510,0 10px 18px rgba(0,0,0,.4),inset 0 2px 2px rgba(255,255,255,.5);transition:transform .12s,box-shadow .12s}
.ndu-wx-snd[aria-pressed="false"]{background:radial-gradient(circle at 35% 30%,#6b625a,#3b342e 65%,#221d19);color:#f6efe2;box-shadow:0 5px 0 #0d0b09,0 10px 18px rgba(0,0,0,.4),inset 0 2px 2px rgba(255,255,255,.18)}
.ndu-wx-snd:active{transform:translateY(4px);box-shadow:0 1px 0 #0d0b09,inset 0 2px 2px rgba(255,255,255,.2)}
.ndu-wx-snd[aria-pressed="true"]::after{content:"";position:absolute;inset:-6px;border-radius:999px;border:2px solid rgba(232,132,58,.6);animation:ndu-wx-ring 1.6s ease-out infinite}
@keyframes ndu-wx-ring{from{transform:scale(.9);opacity:1}to{transform:scale(1.25);opacity:0}}
.ndu-wx-range{width:100%;accent-color:#e8843a;min-height:28px}
.ndu-wx-sw{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px}
.ndu-wx-sw input{width:40px;height:22px;accent-color:#e8843a}
.ndu-wx-h{margin:10px 0 6px;font:700 11px sans-serif;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
/* CSS weather icon */
.ndu-ico{position:relative;display:inline-block;width:var(--s,22px);height:var(--s,22px);flex:0 0 auto}
.ndu-ico i{position:absolute;display:block}
.ndu-ico .sun{inset:14%;border-radius:99px;background:radial-gradient(circle at 35% 35%,#fff3b0,#f6c445 60%,#e0962a);box-shadow:0 0 8px rgba(246,196,69,.8)}
.ndu-ico .moon{inset:16%;border-radius:99px;background:radial-gradient(circle at 70% 30%,transparent 38%,#dfe6ff 40%,#b8c4f0 70%)}
.ndu-ico .cloud{left:6%;right:4%;bottom:16%;height:44%;border-radius:99px;background:var(--cc,#eef1f6);box-shadow:inset 0 -2px 3px rgba(0,0,0,.25)}
.ndu-ico .cloud::before{content:"";position:absolute;left:22%;bottom:40%;width:48%;height:110%;border-radius:99px;background:inherit}
.ndu-ico.part .sun{inset:auto;top:4%;right:6%;width:55%;height:55%}
.ndu-ico .drop{bottom:-6%;width:2px;height:28%;border-radius:2px;background:#8fc4ff;animation:ndu-ico-drop .9s linear infinite}
@keyframes ndu-ico-drop{from{transform:translateY(-3px);opacity:0}40%{opacity:1}to{transform:translateY(4px);opacity:0}}
.ndu-ico .bolt{left:44%;bottom:-8%;width:30%;height:42%;background:#ffd84a;clip-path:polygon(40% 0,100% 0,55% 45%,85% 45%,20% 100%,38% 55%,10% 55%)}
.ndu-ico .fogl{left:4%;right:4%;height:12%;border-radius:4px;background:#d8dde6;opacity:.85}
@media (prefers-reduced-motion: reduce){.ndu-wx-btn,.ndu-wx-chip{transition:none}.ndu-wx-card{animation:none}.ndu-ico .drop,.ndu-wx-snd::after{animation:none!important}}
`;

const US_ZONE = /^(Pacific\/Honolulu|America\/)/;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function WxIcon({ kind, night, size = 22 }: { kind: Kind; night: boolean; size?: number }) {
  const orb = night ? <i className="moon" /> : <i className="sun" />;
  const cloudy = kind !== "clear";
  const dark =
    kind === "storm" ? "#8d8fa6" : kind === "rain" || kind === "drizzle" ? "#c9d0db" : "#eef1f6";
  return (
    <span
      className={`ndu-ico${kind === "partly" || kind === "haze" ? " part" : ""}`}
      style={{ ["--s" as string]: `${size}px`, ["--cc" as string]: dark }}
      aria-hidden
    >
      {kind === "clear" || kind === "partly" || kind === "haze" ? orb : null}
      {kind === "fog" ? (
        <>
          <i className="fogl" style={{ top: "30%" }} />
          <i className="fogl" style={{ top: "52%" }} />
          <i className="fogl" style={{ top: "74%" }} />
        </>
      ) : cloudy && kind !== "haze" ? (
        <i className="cloud" />
      ) : null}
      {kind === "haze" ? (
        <i className="fogl" style={{ top: "70%", background: "#d9b68a" }} />
      ) : null}
      {kind === "rain" || kind === "drizzle" || kind === "storm"
        ? [22, 46, 70]
            .slice(0, kind === "drizzle" ? 2 : 3)
            .map((x, i) => (
              <i
                key={x}
                className="drop"
                style={{ left: `${x}%`, animationDelay: `${i * 0.3}s` }}
              />
            ))
        : null}
      {kind === "storm" ? <i className="bolt" /> : null}
    </span>
  );
}

let scape: Soundscape | null = null;

function syncSound() {
  const s = getImmerse();
  const r = getRealism();
  if (!scape) return;
  scape.setVolume(s.volume);
  scape.update(
    s.enabled ? s.fx : { ...s.fx, rain: 0, wind: 6, fog: 0 },
    r.sun.altitude,
    r.zone,
    r.at,
  );
}

export default function ImmerseBubble() {
  const st = useSyncExternalStore(subscribeImmerse, getImmerse, getImmerse);
  const sun = useSyncExternalStore(subscribeRealism, getRealism, getRealism);
  const bubbles = useBubbleMode();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => startImmerse(), []);
  useEffect(() => syncSound(), [st, sun]);
  useEffect(
    () => () => {
      void scape?.stop();
      scape = null;
    },
    [],
  );

  const toggleSound = async () => {
    navigator.vibrate?.(8);
    if (busy) return;
    setBusy(true);
    try {
      if (scape) {
        const s = scape;
        scape = null;
        setSound(false);
        await s.stop();
      } else {
        const { Soundscape: S } = await import("./sound");
        scape = new S();
        await scape.start(getImmerse().volume);
        setSound(true);
        syncSound();
      }
    } catch {
      scape = null;
      setSound(false);
    } finally {
      setBusy(false);
    }
  };

  const live = st.live;
  const night = sun.sun.altitude < -4;
  const us = US_ZONE.test(sun.zone);
  const temp = live
    ? st.previewMs != null
      ? (live.hours.find((h) => Math.abs(h.t * 1000 - (st.previewMs ?? 0)) < 1800_000)?.temp ??
        live.temp)
      : live.temp
    : null;
  const tLabel =
    temp == null ? "--" : us ? `${Math.round((temp * 9) / 5 + 32)}°` : `${Math.round(temp)}°`;
  const kind = st.fx.kind;
  const label = `${KIND_LABEL[kind]}${st.override ? " (demo)" : st.previewMs != null ? " (forecast)" : ""}`;
  const now = Date.now();
  const hours = (live?.hours ?? []).filter((h) => h.t * 1000 > now - 30 * 60_000).slice(0, 12);

  return (
    <div data-ndu-immerse="bubble">
      <style>{CSS}</style>
      {bubbles ? (
        <Bubble
          size="sm"
          label={`Weather: ${label}, ${tLabel}${st.sound ? ", sound on" : ""}. ${open ? "Close" : "Open"} weather and sound`}
          aria-expanded={open}
          badge={tLabel}
          onClick={() => setOpen((v) => !v)}
        >
          <WxIcon kind={kind} night={night} />
          {st.sound ? (
            <span className="ndu-wx-dot" style={{ top: "auto", bottom: 2, right: 2 }} aria-hidden />
          ) : null}
        </Bubble>
      ) : (
        <button
          type="button"
          className="ndu-wx-btn"
          aria-expanded={open}
          aria-label={`Weather: ${label}, ${tLabel}${st.sound ? ", sound on" : ""}. ${open ? "Close" : "Open"} weather and sound`}
          onClick={() => {
            navigator.vibrate?.(8);
            setOpen((v) => !v);
          }}
        >
          <WxIcon kind={kind} night={night} />
          {st.sound ? <span className="ndu-wx-dot" aria-hidden /> : null}
        </button>
      )}
      {open ? (
        <div className="ndu-wx-card" role="group" aria-label="Weather and sound">
          <div className="flex items-center gap-2">
            <WxIcon kind={kind} night={night} size={34} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {label} ·{" "}
                {temp == null
                  ? "--"
                  : `${Math.round(temp)}°C / ${Math.round((temp * 9) / 5 + 32)}°F`}
              </p>
              <p className="opacity-75">
                {live
                  ? `Wind ${Math.round(live.wind)} km/h ${COMPASS[Math.round(live.windDir / 45) % 8]} · Humidity ${Math.round(live.humidity)}% · Cloud ${Math.round(live.cloud)}%`
                  : st.status === "offline"
                    ? "Weather is offline, showing clear skies."
                    : "Getting the local weather…"}
              </p>
            </div>
          </div>

          {hours.length ? (
            <>
              <p className="ndu-wx-h">Next hours · tap to preview</p>
              <div className="ndu-wx-hours">
                <button
                  type="button"
                  className="ndu-wx-hr"
                  aria-pressed={st.previewMs == null && !st.override}
                  onClick={() => previewHour(null)}
                >
                  <span>Now</span>
                  <WxIcon kind={live ? kindFromCode(live.code) : "clear"} night={night} size={18} />
                  <span>
                    {live ? `${Math.round(us ? (live.temp * 9) / 5 + 32 : live.temp)}°` : ""}
                  </span>
                </button>
                {hours.map((h) => {
                  const mins = localMinutes(new Date(h.t * 1000), sun.zone);
                  const hNight = mins < 6 * 60 || mins > 19 * 60;
                  return (
                    <button
                      key={h.t}
                      type="button"
                      className="ndu-wx-hr"
                      aria-pressed={st.previewMs === h.t * 1000}
                      aria-label={`${clockLabel(mins)}: ${KIND_LABEL[kindFromCode(h.code)]}, ${Math.round(h.temp)}°C, ${Math.round(h.pop)}% chance of rain`}
                      onClick={() => previewHour(h.t * 1000)}
                    >
                      <span>{clockLabel(mins).replace(":00", "")}</span>
                      <WxIcon kind={kindFromCode(h.code)} night={hNight} size={18} />
                      <span>{Math.round(us ? (h.temp * 9) / 5 + 32 : h.temp)}°</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          <p className="ndu-wx-h">Sound</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="ndu-wx-snd"
              aria-pressed={st.sound}
              aria-label={st.sound ? "Turn city sound off" : "Turn city sound on"}
              disabled={busy}
              onClick={() => void toggleSound()}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                {st.sound ? (
                  <path
                    d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M16 9l5 6M21 9l-5 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="opacity-80">
                {st.sound
                  ? "City, rain, wind, birds and night, following the weather and time."
                  : "Ambient city sound is off."}
              </p>
              <input
                className="ndu-wx-range"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(st.volume * 100)}
                aria-label="Sound volume"
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
              />
            </div>
          </div>

          <p className="ndu-wx-h">Weather on the map</p>
          <div className="ndu-wx-row">
            <button
              type="button"
              className="ndu-wx-chip"
              aria-pressed={!st.override}
              onClick={() => setOverride(null)}
            >
              Live
            </button>
            {OVERRIDES.map((k) => (
              <button
                key={k}
                type="button"
                className="ndu-wx-chip"
                aria-pressed={st.override === k}
                onClick={() => setOverride(k)}
              >
                {k === "haze" ? "Haze" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <label className="ndu-wx-sw">
            <span>Battery saver (no rain drops){st.saverAuto ? " · low battery" : ""}</span>
            <input
              type="checkbox"
              checked={st.saver}
              onChange={(e) => setSaver(e.target.checked)}
            />
          </label>
          <label className="ndu-wx-sw">
            <span>Weather, water and hills effects</span>
            <input
              type="checkbox"
              checked={st.enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </label>
          <p className="mt-2 text-[11px] opacity-70">
            Weather from{" "}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Open-Meteo
            </a>{" "}
            (CC BY 4.0), updated every 15 min. Not an official forecast. Sounds are generated on
            your phone.
          </p>
        </div>
      ) : null}
    </div>
  );
}
