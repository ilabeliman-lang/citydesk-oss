// NDU-UPG inspect (#04): wires the gesture, picker, store and verbs onto the live map (lazy chunk).
import { setInspectHighlight } from "@/world/realism";
import { tappableBuildingLayers } from "@/world/realism/layers";
import { lifePickAt, lifePlayerSpot } from "@/world/life/hooks";
import { canHail, calculateFare, interactProp } from "@/world/life/ride";
import { tapBuzz } from "@/world/bubbles/mode";
import { bindHotkeys } from "@/world/hud/hotkeys";
import { addToBag } from "@/world/bag";
import type { ScanMap } from "@/world/scanLayer";
import type { EnterSpot } from "@/world/empty-state/footprint";
import { holdMs } from "./flag.ts";
import { createPressTracker } from "./gesture.ts";
import { buildingTarget, osmIdOf, pickAt, pickBuilding, type HitFeature, type PickMap, type Pt } from "./pick.ts";
import { buildingProfile, placeProfile, propProfile, vehicleProfile, walkerProfile } from "./profile.ts";
import { inspectStore } from "./store.ts";
import { fetchTags } from "./tags.ts";
import { offersFor, type AffordCtx } from "./affordances.ts";
import type { InspectTarget, ObjectProfile, PropRecordLike, Verb, VerbOffer } from "./types.ts";

type MapLike = PickMap & {
  getCanvasContainer(): HTMLElement;
  getCanvas(): HTMLCanvasElement;
  on(t: string, fn: (ev?: { originalEvent?: unknown }) => void): void;
  off(t: string, fn: (ev?: { originalEvent?: unknown }) => void): void;
};

export type InspectRuntime = {
  swallowClick(): boolean;
  openBuilding(hit: unknown, event: { point: Pt }): void;
  openTarget(target: InspectTarget): void;
  offers(profile: ObjectProfile): VerbOffer[];
  runVerb(verb: Verb): string;
};

let live: InspectRuntime | null = null;
/** The mounted runtime (null when the flag is off or the map is gone). */
export const inspectRuntime = () => live;

/** Feature 03 (props) can register its `pickProp(point)` here; until then props are not long-pressable. */
let propPicker: ((p: Pt) => PropRecordLike | null) | null = null;
export function setPropPicker(fn: ((p: Pt) => PropRecordLike | null) | null) {
  propPicker = fn;
}

const M_LAT = 110_540;
const metres = (a: [number, number], b: { lat: number; lng: number } | null) =>
  b ? Math.hypot((a[1] - b.lat) * M_LAT, (a[0] - b.lng) * 111_320 * Math.cos((b.lat * Math.PI) / 180)) : 10;

function kidsMode(): boolean {
  try {
    return document.documentElement.dataset.nduKids === "1" || location.pathname.startsWith("/kids");
  } catch {
    return false;
  }
}

const lngLatOf = (t: InspectTarget): [number, number] | null => ("lngLat" in t ? t.lngLat : null);

export function mountInspect(map: MapLike, opts: { scans: () => ScanMap | null; enter: (spot: EnterSpot) => void }): () => void {
  let stopped: Record<string, boolean> = {};
  const highlight = (id: number | null) => setInspectHighlight(map, id);
  inspectStore.setHooks({ clearHighlight: () => highlight(null) });

  const profileFor = (t: InspectTarget): ObjectProfile | null => {
    switch (t.kind) {
      case "building":
        return buildingProfile({ feature: t.feature, lngLat: t.lngLat, bearing: t.bearing });
      case "vehicle":
        return vehicleProfile(t.vkind, t.agentId, Boolean(stopped[t.agentId]));
      case "walker":
        return walkerProfile(t.agentId);
      case "place":
        return placeProfile({ placeId: t.placeId, name: t.name, category: t.category, kind: t.category });
      case "prop":
        return propProfile(t.record?.kind ?? t.propType, t.record ?? null);
      default:
        return null; // scans: not pickable until the scan raycast (T20) lands
    }
  };

  const openTarget = (t: InspectTarget) => {
    tapBuzz();
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    inspectStore.open(t, ctrl, profileFor(t));
    const seq = inspectStore.get().seq;
    if (t.kind === "building") {
      highlight(t.osmId);
      if (t.osmId)
        void fetchTags(t.osmId, t.lngLat[1], t.lngLat[0], ctrl?.signal)
          .then((r) => {
            if ("error" in r) {
              if (r.error !== "off") inspectStore.setProfile(inspectStore.get().profile, "More details unavailable right now", seq);
              return;
            }
            inspectStore.setProfile(buildingProfile({ feature: t.feature, tags: r.tags, lngLat: t.lngLat, bearing: t.bearing, cellStats: r.stats }), null, seq);
          })
          .catch(() => undefined);
    } else highlight(null);
  };

  const scansAdapter = () => {
    const s = opts.scans();
    return s ? { isPlacing: () => s.isPlacing() } : null;
  };

  const openAt = (p: Pt) => {
    const prop = propPicker?.(p) ?? null;
    const life = lifePickAt(p);
    if (life?.kind === "vehicle") stopped[life.agentId] = Boolean(life.stopped);
    const t = life ? pickAt(map, p, { scans: scansAdapter(), lifePickAt: () => life }) : prop ? ({ kind: "prop", propType: prop.kind as never, osmNodeId: prop.osmId, lngLat: [prop.lng, prop.lat], record: prop } as InspectTarget) : pickAt(map, p, { scans: scansAdapter() });
    if (t) openTarget(t);
    else inspectStore.close();
  };

  const tracker = createPressTracker({
    holdMs: holdMs(),
    onPreview: (p) => {
      if (opts.scans()?.isPlacing()) return;
      const hit = pickBuilding(map, p, tappableBuildingLayers(map));
      if (hit) highlight(osmIdOf(hit));
    },
    onCancel: () => {
      if (inspectStore.get().sheet === "closed") highlight(null);
    },
    onLongPress: openAt,
  });
  const detach = tracker.attach(map.getCanvasContainer() as never, map);
  // a plain tap on the map (not the long-press's trailing click) closes the card
  const onMapClick = () => {
    if (!tracker.swallowClick() && inspectStore.get().sheet !== "closed") inspectStore.close();
  };
  map.on("click", onMapClick);

  const unbindKeys = bindHotkeys({
    onInspect: () => {
      const c = map.getCanvas();
      openAt({ x: c.clientWidth / 2, y: c.clientHeight / 2 });
    },
  });

  const ctxFor = (_p: ObjectProfile): AffordCtx => {
    const t = inspectStore.get().target;
    const at = t ? lngLatOf(t) : null;
    return {
      distanceM: at ? metres(at, lifePlayerSpot()) : 10,
      isOwner: t?.kind === "scan",
      propertyReady: false, // T22/T23 (property link) not wired on this branch
      consented: false,
      kids: kidsMode(),
      vehicleStopped: t?.kind === "vehicle" ? Boolean(stopped[t.agentId]) : false,
      itemCount: 0,
    };
  };

  const runVerb = (verb: Verb): string => {
    const { target: t, profile: p } = inspectStore.get();
    if (!t || !p) return "";
    const offer = offersFor(p, ctxFor(p)).find((o) => o.verb === verb);
    if (!offer) return "";
    if (!offer.enabled) return offer.reason ?? "Not possible right now";
    switch (verb) {
      case "enter": {
        if (t.kind === "building") {
          opts.enter({ name: p.title, lat: t.lngLat[1], lng: t.lngLat[0], feature: t.feature, bearing: t.bearing });
          inspectStore.close();
          return `Entering ${p.title}`;
        }
        if (t.kind === "place") {
          opts.enter({ name: t.name, lat: t.lngLat[1], lng: t.lngLat[0], placeId: t.placeId, kind: t.category, bearing: map.getBearing() });
          inspectStore.close();
          return `Going into ${t.name}`;
        }
        return "";
      }
      case "sit":
        return p.category === "bench" || p.className === "prop:bench" ? interactProp("bench", 0).message : `You sit on the ${p.title.toLowerCase()}.`;
      case "use":
        if (p.category === "standpipe") return interactProp("standpipe", 0).message;
        if (p.category === "food_stall") return interactProp("stall", 0).message;
        return `You use the ${p.title.toLowerCase()}.`;
      case "wait":
        return "You wait at the stop. Buses here are simulated.";
      case "ride": {
        if (t.kind !== "vehicle") return "";
        const d = metres(t.lngLat, lifePlayerSpot());
        if (!canHail(0, d)) return `Walk closer to hail it (${Math.round(d)} m away)`;
        return `Hailed. Fare from about ₦${calculateFare(t.vkind, 1000)} per km (simulated).`;
      }
      case "talk":
        return "👋 You wave. They wave back.";
      case "pick_up":
        return addToBag(p.title) ? `${p.title} is in your bag.` : "Your bag is full (12 things).";
      case "view_on_osm":
        if (p.osmUrl) window.open(p.osmUrl, "_blank", "noopener,noreferrer");
        return "Opened OpenStreetMap";
      case "look_through":
        return "You can see through the glass.";
      default:
        return "";
    }
  };

  live = {
    swallowClick: () => tracker.swallowClick(),
    openBuilding: (hit, event) => openTarget(buildingTarget(map, hit as HitFeature, event.point)),
    openTarget,
    offers: (p) => offersFor(p, ctxFor(p)),
    runVerb,
  };

  return () => {
    detach();
    map.off("click", onMapClick);
    unbindKeys();
    inspectStore.close();
    inspectStore.setHooks({ clearHighlight: undefined });
    stopped = {};
    live = null;
  };
}

/** Long-press on a DOM marker (place board, person sprite) opens its card; the trailing click is eaten. */
export function attachMarkerInspect(el: HTMLElement, target: Extract<InspectTarget, { kind: "place" }>): () => void {
  const tr = createPressTracker({
    holdMs: holdMs(),
    onLongPress: () => live?.openTarget(target),
  });
  const detach = tr.attach(el as never, null);
  const eat = (e: Event) => {
    if (tr.swallowClick()) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const stopDown = (e: Event) => e.stopPropagation();
  el.addEventListener("click", eat, true);
  el.addEventListener("contextmenu", stopDown);
  return () => {
    detach();
    el.removeEventListener("click", eat, true);
    el.removeEventListener("contextmenu", stopDown);
  };
}
