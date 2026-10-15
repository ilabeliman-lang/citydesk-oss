import { getTier, onTier } from "@/world/perf/tier";
import { getRealism, subscribeRealism } from "@/world/realism/state";
import { reducedMotion } from "@/world/realism/settings";
import { attachAtmos, type Atmos } from "./atmos";
import { attachGround, type Ground } from "./ground";
import { safe, type IMap } from "./mapTypes";
import { getImmerse, particlesAllowed, setPlace, startImmerse, subscribeImmerse } from "./store";
import { TILES, attachTerrain } from "./terrain";
import { groundAllowed, groundOn } from "@/world/ground/flag";

/**
 * NDU-UPG immerse: terrain, water, ground, weather and atmosphere for the 3D city map.
 * Mounted once from CityBuildings after the style loads (own lazy chunk, like realism). Reads the
 * device tier from perf's getTier()/onTier() and the sun/place from realism's state — nothing is
 * duplicated. The player's "Effects" switch (#350) tears everything down live and can bring it back.
 * Returns a dispose function.
 */
export function mountImmerse(input: unknown): () => void {
  const map = input as IMap;
  const reduced = reducedMotion();
  startImmerse();
  let tier = getTier().tier;
  let terrain: ReturnType<typeof attachTerrain> | null = null;
  let ground: Ground | null = null;
  let atmos: Atmos | null = null;
  // NDU realism 02: terrain + ground clamping (own lazy chunk; nothing loads with the flag off)
  let groundOff: (() => void) | null = null;
  let groundJob = 0;

  const up = () => {
    if (!terrain) terrain = attachTerrain(map, tier);
    if (!groundOff && !groundJob && groundAllowed() && groundOn()) {
      const job = ++groundJob;
      void import("@/world/ground")
        .then((m) => {
          if (job !== groundJob || groundOff) return;
          groundOff = m.mountGround(map, tier, TILES[0]);
        })
        .catch(() => {
          if (job === groundJob) groundJob = 0;
        });
    }
    if (!ground) ground = attachGround(map, tier, reduced);
    if (!atmos) atmos = attachAtmos(map, tier, reduced);
  };
  const down = () => {
    groundJob = 0;
    safe(() => groundOff?.());
    groundOff = null;
    safe(() => terrain?.dispose());
    safe(() => ground?.dispose());
    safe(() => atmos?.dispose());
    terrain = null;
    ground = null;
    atmos = null;
  };
  let lastFx = "";
  const sync = (force = false) => {
    const s = getImmerse();
    if (!s.enabled) return down();
    up();
    const r = getRealism();
    const key = `${JSON.stringify(s.fx)}|${Math.round(r.sun.altitude)}|${particlesAllowed(s)}`;
    if (!force && key === lastFx) return;
    lastFx = key;
    ground?.setFx(s.fx);
    atmos?.setFx(s.fx, r.sun, particlesAllowed(s));
  };
  sync(true);
  const onMoveEnd = () => {
    const c = map.getCenter();
    setPlace(c.lat, c.lng);
  };
  onMoveEnd();
  map.on("moveend", onMoveEnd);
  const offStore = subscribeImmerse(() => sync());
  const offSun = subscribeRealism(() => sync());
  const offTier = onTier((st) => {
    tier = st.tier;
    terrain?.setTier(tier);
    ground?.setTier(tier);
    atmos?.setTier(tier);
  });
  if (import.meta.env.DEV)
    (window as Window & { __nduImmerse?: unknown }).__nduImmerse = { map, state: getImmerse };
  return () => {
    offStore();
    offSun();
    offTier();
    map.off("moveend", onMoveEnd);
    down();
  };
}

export { groundElevation, groundSample } from "./terrain";
