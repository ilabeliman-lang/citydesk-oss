import type { Tier } from "@/world/perf/tier";
import { puddleOpacity } from "@/world/atmosphere/puddles";
import { firstLayer, safe, vectorSource, type Disposer, type IMap } from "./mapTypes";
import { cloudShadowUrl, ripple, speckle } from "./patterns";
import type { Fx } from "./weather";
import { setStreetWind } from "@/world/atmosphere/wind";
import { lotFullness } from "@/world/realism/parking";
import { shownMinutes, subscribeRealism } from "@/world/realism/state";

/**
 * NDU-UPG immerse ground + water:
 *   #106 water shimmer (two procedural ripple patterns cross-fading; animated on Tier A, static on B)
 *   #108 shoreline foam line (pulsing on Tier A)
 *   #110 drainage gutters along minor/service roads (z16+, line-gap = the road's own width)
 *   #112 ground textures for grass / sand at z16+ (procedural 32 px tiles)
 *   #113 laterite colour for unpaved roads
 *   #303 wet ground: one dark fill under the buildings, strength = wetness
 *   #129 #339 cloud shadows: a geo-anchored soft-noise image drifting with the wind (Tier A; static on B)
 * Everything uses MapLibre paint transitions for smoothness: at most one paint call per ~1.5 s.
 */

const IDS = {
  waterA: "ndu-water-a",
  waterB: "ndu-water-b",
  foam: "ndu-foam",
  gutterMinor: "ndu-gutter-minor",
  gutterService: "ndu-gutter-service",
  unpaved: "ndu-unpaved",
  grass: "ndu-tex-grass",
  park: "ndu-tex-park",
  sand: "ndu-tex-sand",
  wood: "ndu-tex-wood",
  wetland: "ndu-tex-wetland",
  farm: "ndu-tex-farm",
  canal: "ndu-canal",
  deck: "ndu-bridge-deck",
  parking: "ndu-parking",
  wet: "ndu-wet",
  clouds: "ndu-cloud-shadow",
};
const WET_SRC = "ndu-wet-src";
const CLOUD_SRC = "ndu-cloud-src";
const IMAGES = {
  rippleA: "ndu-ripple-a",
  rippleB: "ndu-ripple-b",
  grass: "ndu-grass",
  sand: "ndu-sand",
  wood: "ndu-wood",
  wetland: "ndu-wetland",
};
const WORLD = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-180, -85],
        [180, -85],
        [180, 85],
        [-180, 85],
        [-180, -85],
      ],
    ],
  },
};
const NOT_TUNNEL = ["!=", ["get", "brunnel"], "tunnel"];
const LINES = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];

export type Ground = { dispose: Disposer; setFx: (fx: Fx) => void; setTier: (t: Tier) => void };

export function attachGround(map: IMap, tier: Tier, reducedMotion: boolean): Ground {
  const src = vectorSource(map);
  const offs: Disposer[] = [];
  let fx: Fx | null = null;
  let curTier = tier;
  const add = (layer: Record<string, unknown>, before?: string) =>
    safe(() => !map.getLayer(layer.id as string) && map.addLayer(layer, before));
  const img = (id: string, data: ReturnType<typeof ripple>) =>
    safe(() => !map.hasImage(id) && map.addImage(id, data, { pixelRatio: 2 }));

  // ── water (#106 #108) ──
  const afterWater = firstLayer(map, [
    "landcover_sand",
    "aeroway_fill",
    "tunnel_motorway_link_casing",
    "building",
  ]);
  if (tier !== "C" && map.getLayer("water")) {
    img(IMAGES.rippleA, ripple(0));
    img(IMAGES.rippleB, ripple(1));
    const shimmer = (id: string, pattern: string, o: number) =>
      add(
        {
          id,
          type: "fill",
          source: src,
          "source-layer": "water",
          minzoom: 12,
          filter: NOT_TUNNEL,
          paint: {
            "fill-pattern": pattern,
            "fill-opacity": o,
            "fill-opacity-transition": { duration: 1400, delay: 0 },
          },
        },
        afterWater,
      );
    shimmer(IDS.waterA, IMAGES.rippleA, 0.55);
    shimmer(IDS.waterB, IMAGES.rippleB, 0);
    add(
      {
        id: IDS.foam,
        type: "line",
        source: src,
        "source-layer": "water",
        minzoom: 13,
        filter: NOT_TUNNEL,
        layout: { "line-join": "round" },
        paint: {
          "line-color": "#f4fbff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.6, 16, 2.2, 19, 5],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 18, 3],
          "line-opacity": 0.55,
          "line-opacity-transition": { duration: 1800, delay: 0 },
        },
      },
      afterWater,
    );
  }

  // ── ground textures (#112) ──
  if (tier !== "C") {
    img(IMAGES.grass, speckle("grass"));
    img(IMAGES.sand, speckle("sand"));
    img(IMAGES.wood, speckle("wood"));
    img(IMAGES.wetland, speckle("wetland"));
    const fade = ["interpolate", ["linear"], ["zoom"], 15.5, 0, 16.5, 0.6];
    const tex = (id: string, layer: string, filter: unknown, pattern: string, after: string) =>
      add(
        {
          id,
          type: "fill",
          source: src,
          "source-layer": layer,
          minzoom: 15.5,
          ...(filter ? { filter } : {}),
          paint: { "fill-pattern": pattern, "fill-opacity": fade },
        },
        firstLayer(map, [after, "water"]),
      );
    tex(IDS.grass, "landcover", ["==", ["get", "class"], "grass"], IMAGES.grass, "landcover_ice");
    tex(IDS.farm, "landcover", ["==", ["get", "class"], "farmland"], IMAGES.grass, "landcover_ice");
    tex(IDS.wood, "landcover", ["==", ["get", "class"], "wood"], IMAGES.wood, "landcover_ice");
    tex(IDS.wetland, "landcover", ["==", ["get", "class"], "wetland"], IMAGES.wetland, "landcover_ice");
    tex(IDS.park, "park", null, IMAGES.grass, "park_outline");
    tex(IDS.sand, "landcover", ["==", ["get", "class"], "sand"], IMAGES.sand, "aeroway_fill");
  }

  // ── roads: laterite unpaved (#113) + gutters (#110) ──
  const roadTop = firstLayer(map, [
    "road_one_way_arrow",
    "bridge_motorway_link_casing",
    "building",
  ]);
  const minorWidth = safeGet(map, "road_minor", "line-width") ?? [
    "interpolate",
    ["exponential", 1.2],
    ["zoom"],
    13.5,
    0,
    14,
    2.5,
    20,
    18,
  ];
  const serviceWidth = safeGet(map, "road_service_track", "line-width") ?? [
    "interpolate",
    ["exponential", 1.2],
    ["zoom"],
    15.5,
    0,
    16,
    2,
    20,
    7.5,
  ];
  const notBridge = ["match", ["get", "brunnel"], ["bridge", "tunnel"], false, true];
  const underBridge = firstLayer(map, [
    "bridge_motorway_link_casing",
    "bridge_motorway_casing",
    "bridge_trunk_primary_casing",
    "bridge_secondary_tertiary_casing",
    "bridge_minor_casing",
    "building",
  ]);
  add(
    {
      id: IDS.canal,
      type: "line",
      source: src,
      "source-layer": "waterway",
      minzoom: 11,
      filter: [
        "all",
        LINES,
        ["match", ["get", "class"], ["river", "stream", "canal"], true, false],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#3e7c8c",
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 15, 2.4, 18, 7],
        "line-opacity": 0.9,
      },
    },
    underBridge,
  );
  add(
    {
      id: IDS.deck,
      type: "line",
      source: src,
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["all", LINES, ["==", ["get", "brunnel"], "bridge"]],
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": "#4a433c",
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 10, 19, 22],
        "line-opacity": 0.85,
      },
    },
    underBridge,
  );
  add(
    {
      id: IDS.parking,
      type: "fill",
      source: src,
      "source-layer": "landuse",
      minzoom: 14,
      filter: ["==", ["get", "class"], "parking"],
      paint: { "fill-color": "#2c3328", "fill-opacity": lotFullness(shownMinutes()) },
    },
    firstLayer(map, ["building", "water"]),
  );
  add(
    {
      id: IDS.unpaved,
      type: "line",
      source: src,
      "source-layer": "transportation",
      minzoom: 13,
      filter: [
        "all",
        LINES,
        notBridge,
        ["==", ["get", "surface"], "unpaved"],
        ["match", ["get", "class"], ["minor", "service", "track", "tertiary", "path"], true, false],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#b8693e", "line-width": minorWidth, "line-opacity": 0.85 },
    },
    roadTop,
  );
  if (tier !== "C") {
    const gutter = (id: string, cls: string[], width: unknown) =>
      add(
        {
          id,
          type: "line",
          source: src,
          "source-layer": "transportation",
          minzoom: 16,
          filter: [
            "all",
            LINES,
            notBridge,
            ["!=", ["get", "surface"], "unpaved"],
            ["match", ["get", "class"], cls, true, false],
          ],
          layout: { "line-join": "round" },
          paint: {
            "line-color": "#3a332c",
            "line-width": ["interpolate", ["linear"], ["zoom"], 16, 0.6, 19, 1.6],
            "line-gap-width": width,
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0, 16.6, 0.5],
          },
        },
        roadTop,
      );
    gutter(IDS.gutterMinor, ["minor"], minorWidth);
    gutter(IDS.gutterService, ["service"], serviceWidth);
  }

  // ── wet ground (#303) ──
  safe(() => {
    map.addSource(WET_SRC, { type: "geojson", data: WORLD });
    add(
      {
        id: IDS.wet,
        type: "fill",
        source: WET_SRC,
        paint: {
          "fill-color": "#1d2a38",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 2500, delay: 0 },
        },
      },
      firstLayer(map, ["building", "building-3d"]),
    );
  });

  // ── cloud shadows (#129 #339) ──
  let cloudCenter: [number, number] | null = null;
  let drift = [0, 0];
  const SPAN = 0.03; // ~3 km square around the view
  const coords = () => {
    if (!cloudCenter) return null;
    const [x, y] = [cloudCenter[0] + drift[0], cloudCenter[1] + drift[1]];
    return [
      [x - SPAN, y + SPAN],
      [x + SPAN, y + SPAN],
      [x + SPAN, y - SPAN],
      [x - SPAN, y - SPAN],
    ];
  };
  const cloudUrl = tier !== "C" ? cloudShadowUrl() : null;
  const ensureClouds = () => {
    if (!cloudUrl || curTier === "C" || map.getSource(CLOUD_SRC)) return;
    const c = map.getCenter();
    cloudCenter = [c.lng, c.lat];
    drift = [0, 0];
    safe(() => {
      map.addSource(CLOUD_SRC, { type: "image", url: cloudUrl, coordinates: coords() });
      add(
        {
          id: IDS.clouds,
          type: "raster",
          source: CLOUD_SRC,
          minzoom: 13,
          paint: {
            "raster-opacity": 0,
            "raster-fade-duration": 0,
            "raster-opacity-transition": { duration: 3000, delay: 0 },
          },
        },
        firstLayer(map, ["building", "building-3d"]),
      );
    });
  };
  const onMoveEnd = () => {
    if (!cloudCenter) return;
    const c = map.getCenter();
    const [x, y] = [cloudCenter[0] + drift[0], cloudCenter[1] + drift[1]];
    if (Math.abs(c.lng - x) > SPAN * 0.5 || Math.abs(c.lat - y) > SPAN * 0.5) {
      cloudCenter = [c.lng, c.lat];
      drift = [0, 0];
      safe(() => map.getSource(CLOUD_SRC)?.setCoordinates?.(coords() as number[][]));
    }
  };
  map.on("moveend", onMoveEnd);
  offs.push(() => map.off("moveend", onMoveEnd));

  // ── animation tick: ~1 paint call per 1.5 s, Tier A only, never under reduced motion ──
  let phase = 0;
  const tick = window.setInterval(() => {
    if (document.visibilityState !== "visible" || map.isMoving()) return;
    phase += 1;
    const animate = curTier === "A" && !reducedMotion;
    if (animate && map.getLayer(IDS.waterA)) {
      const a = phase % 2 === 0;
      safe(() => {
        map.setPaintProperty(IDS.waterA, "fill-opacity", a ? 0.6 : 0.15);
        map.setPaintProperty(IDS.waterB, "fill-opacity", a ? 0.15 : 0.6);
        map.setPaintProperty(IDS.foam, "line-opacity", a ? 0.65 : 0.35);
      });
    }
    // clouds drift with the wind (km/h → degrees per 1.5 s, sped up ×60 so it reads on screen)
    if (animate && fx && cloudCenter && map.getLayer(IDS.clouds) && fx.cloud > 0.15) {
      const to = ((fx.windDir + 180) * Math.PI) / 180;
      const step = ((fx.wind / 3600) * 1.5 * 60) / 111;
      drift = [drift[0] + Math.sin(to) * step, drift[1] + Math.cos(to) * step];
      if (Math.abs(drift[0]) > SPAN * 0.6 || Math.abs(drift[1]) > SPAN * 0.6) drift = [0, 0];
      safe(() => map.getSource(CLOUD_SRC)?.setCoordinates?.(coords() as number[][]));
    }
  }, 1500);
  offs.push(() => window.clearInterval(tick));

  const setFx = (next: Fx) => {
    fx = next;
    safe(
      () =>
        map.getLayer(IDS.wet) &&
        map.setPaintProperty(IDS.wet, "fill-opacity", puddleOpacity(next.wet)),
    );
    // shadows read best in broken cloud; full overcast = no distinct shadows
    const shadow = next.cloud > 0.15 ? Math.sin(Math.PI * Math.min(1, next.cloud)) * 0.45 : 0;
    if (shadow > 0.02) ensureClouds();
    safe(
      () =>
        map.getLayer(IDS.clouds) &&
        map.setPaintProperty(IDS.clouds, "raster-opacity", Math.round(shadow * 100) / 100),
    );
    // wet water is darker and calmer-looking
    safe(
      () =>
        map.getLayer(IDS.foam) &&
        map.setPaintProperty(IDS.foam, "line-color", next.storm ? "#dfe8f0" : "#f4fbff"),
    );
    safe(() => map.getLayer(IDS.parking) && map.setPaintProperty(IDS.parking, "fill-opacity", lotFullness(shownMinutes())));
    setStreetWind(next.wind, next.windDir);
  };

  const removeAll = () =>
    safe(() => {
      for (const id of Object.values(IDS)) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of [WET_SRC, CLOUD_SRC]) if (map.getSource(id)) map.removeSource(id);
      for (const id of Object.values(IMAGES)) if (map.hasImage(id)) map.removeImage(id);
    });

  offs.push(subscribeRealism(() => {
    safe(() => map.getLayer(IDS.parking) && map.setPaintProperty(IDS.parking, "fill-opacity", lotFullness(shownMinutes())));
  }));

  return {
    setFx,
    setTier: (t) => {
      curTier = t;
      if (t === "C")
        safe(() => {
          for (const id of [
            IDS.waterA,
            IDS.waterB,
            IDS.foam,
            IDS.grass,
            IDS.park,
            IDS.sand,
            IDS.wood,
            IDS.wetland,
            IDS.farm,
            IDS.canal,
            IDS.gutterMinor,
            IDS.gutterService,
            IDS.clouds,
          ])
            if (map.getLayer(id)) map.removeLayer(id);
          if (map.getSource(CLOUD_SRC)) map.removeSource(CLOUD_SRC);
        });
    },
    dispose: () => {
      offs.splice(0).forEach((off) => safe(off));
      removeAll();
    },
  };
}

function safeGet(map: IMap, layer: string, prop: string): unknown {
  try {
    return map.getLayer(layer) ? (map.getPaintProperty(layer, prop) ?? null) : null;
  } catch {
    return null;
  }
}
