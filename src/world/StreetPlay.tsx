import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import "leaflet/dist/leaflet.css";
import { bindInput, readMove, setStick } from "@/game/input";
import { liveAct } from "@/game/sim";
import { listOpenBusinesses } from "@/world/businesses";
import { kindLabel, streetPlaces, type Place } from "@/world/places";
import { listNearby, type Neighbor } from "@/world/presence";
import { streetRoads, type Road } from "@/world/roads";
import { YardSheet } from "@/world/yard";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { streetPlayOn } from "@/world/streetplay/flag"; // NDU-UPG u-169: default-off gate

const FALLBACK = { lat: 4.8156, lng: 7.0498 };

type Spot = { lat: number; lng: number };

function along(road: Road, t: number): Spot {
  const pts = road.points;
  const seg = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
  const local = t * (pts.length - 1) - seg;
  const a = pts[seg];
  const b = pts[seg + 1];
  return { lat: a.lat + (b.lat - a.lat) * local, lng: a.lng + (b.lng - a.lng) * local };
}

export function StreetPlay() {
  const user = useCurrentUser();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const youRef = useRef<import("leaflet").Marker | null>(null);
  const carsRef = useRef<import("leaflet").LayerGroup | null>(null);
  const roadsLayer = useRef<import("leaflet").LayerGroup | null>(null);
  const pos = useRef<Spot>(FALLBACK);
  const drive = useRef(false);
  const roadsRef = useRef<Road[]>([]);
  const cars = useRef<{ road: number; t: number; pace: number }[]>([]);
  const [mode, setMode] = useState<"walk" | "drive">("walk");
  const [note, setNote] = useState("Loading the real streets");
  const [places, setPlaces] = useState<Place[]>([]);
  const [people, setPeople] = useState<Neighbor[]>([]);
  const [yard, setYard] = useState<string | null>(null);
  const [spawn, setSpawn] = useState<Spot | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => bindInput(window), []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    void import("leaflet").then((L) => {
      if (dead || mapRef.current) return;
      const map = L.map(el, { zoomControl: false, attributionControl: true }).setView([FALLBACK.lat, FALLBACK.lng], 17);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      carsRef.current = L.layerGroup().addTo(map);
      const icon = L.divIcon({
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        html: `<div style="width:36px;height:36px;border-radius:999px;background:#e8843a;border:2px solid #1a1511"></div>`,
      });
      youRef.current = L.marker([FALLBACK.lat, FALLBACK.lng], { icon, zIndexOffset: 800 }).addTo(map);
      mapRef.current = map;
      setReady(true);
      setSpawn(FALLBACK);
      navigator.geolocation?.getCurrentPosition(
        (fix) => {
          const next = { lat: fix.coords.latitude, lng: fix.coords.longitude };
          pos.current = next;
          setSpawn(next);
          youRef.current?.setLatLng([next.lat, next.lng]);
          map.setView([next.lat, next.lng], 17);
        },
        () => setNote("Port Harcourt, until location is on"),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
    return () => {
      dead = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !spawn) return;
    let stop = false;
    const here = spawn;
    void streetRoads({ data: here }).then((roads) => {
      if (stop) return;
      roadsRef.current = roads;
      cars.current = roads.slice(0, 5).map((_, index) => ({ road: index % roads.length, t: index / 5, pace: 0.02 + index * 0.008 }));
      void import("leaflet").then((L) => {
        const map = mapRef.current;
        if (!map || stop) return;
        if (!roadsLayer.current) roadsLayer.current = L.layerGroup().addTo(map);
        roadsLayer.current.clearLayers();
        for (const road of roads) {
          L.polyline(road.points.map((point) => [point.lat, point.lng] as [number, number]), {
            color: "#1a1511",
            weight: 3,
            opacity: 0.35,
          }).addTo(roadsLayer.current);
        }
      });
      setNote(roads[0]?.id === "north" ? "Local streets. The road service did not answer." : "Real roads. Walk or drive.");
    });
    void Promise.all([
      streetPlaces({ data: here }).catch(() => []),
      listOpenBusinesses({ data: here }).catch(() => []),
    ]).then(([osm, ring]) => {
      if (stop) return;
      const opened = ring.map((place) => ({
        id: place.id,
        name: place.name,
        kind: place.kind,
        lat: place.lat,
        lng: place.lng,
        source: "ring" as const,
        offer: place.offer,
        verified: place.verified,
        category: place.category,
      }));
      setPlaces([...opened, ...osm.map((place) => ({ ...place, source: "osm" as const }))].slice(0, 16));
    });
    return () => {
      stop = true;
    };
  }, [ready, spawn]);

  useEffect(() => {
    if (!ready || !user) return;
    let stop = false;
    const pull = () => {
      void listNearby({ data: pos.current })
        .then((rows) => {
          if (!stop) setPeople(rows);
        })
        .catch(() => {
          if (!stop) setPeople([]);
        });
    };
    pull();
    const id = window.setInterval(pull, 12000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [ready, user]);

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const move = readMove();
      const speed = (drive.current ? 16 : 1.6) * dt;
      const lat = pos.current.lat + (move.y * speed) / 111320;
      const lng = pos.current.lng + (move.x * speed) / (111320 * Math.cos((pos.current.lat * Math.PI) / 180));
      pos.current = { lat, lng };
      youRef.current?.setLatLng([lat, lng]);
      if (move.x || move.y) mapRef.current?.panTo([lat, lng], { animate: false });
      const roads = roadsRef.current;
      if (roads.length && carsRef.current) {
        cars.current = cars.current.map((car) => ({ ...car, t: (car.t + car.pace * dt) % 1 }));
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const id = window.setInterval(() => {
      void import("leaflet").then((L) => {
        const group = carsRef.current;
        const roads = roadsRef.current;
        if (stop || !group || !roads.length) return;
        group.clearLayers();
        for (const car of cars.current) {
          const road = roads[car.road % roads.length];
          if (!road) continue;
          const at = along(road, car.t);
          const icon = L.divIcon({
            className: "",
            iconSize: [28, 16],
            iconAnchor: [14, 8],
            html: `<div style="width:28px;height:16px;border-radius:4px;background:#2c241c;border:1px solid #f6efe2"></div>`,
          });
          L.marker([at.lat, at.lng], { icon }).addTo(group);
        }
        for (const person of people) {
          const icon = L.divIcon({
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            html: `<div style="width:28px;height:28px;border-radius:999px;background:#f6efe2;border:2px solid #1a1511"></div>`,
          });
          L.marker([person.lat, person.lng], { icon }).bindTooltip(person.displayName, { direction: "top" }).addTo(group);
        }
        for (const place of places) {
          const icon = L.divIcon({
            className: "",
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            html: `<div style="width:36px;height:36px;border-radius:999px;background:#f6efe2;border:2px solid #1a1511;display:grid;place-items:center;font:600 10px sans-serif">${place.source === "ring" ? "Ndu" : "Pin"}</div>`,
          });
          L.marker([place.lat, place.lng], { icon })
            .bindTooltip(place.name, { direction: "top" })
            .on("click", () => {
              if (place.id.startsWith("ring-")) setYard(place.id);
              else liveAct(place.kind, place.name);
            })
            .addTo(group);
        }
      });
    }, 400);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [ready, people, places]);

  function nearest() {
    let best: Place | null = null;
    let bestD = 80;
    for (const place of places) {
      const dLat = (place.lat - pos.current.lat) * 111320;
      const dLng = (place.lng - pos.current.lng) * 111320 * Math.cos((pos.current.lat * Math.PI) / 180);
      const d = Math.hypot(dLat, dLng);
      if (d < bestD) {
        best = place;
        bestD = d;
      }
    }
    return best;
  }

  return (
    <main className="bg-bg relative h-dvh w-full">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col items-center gap-2 p-3">
        <div className="bg-surface/95 pointer-events-auto flex w-full max-w-3xl items-center gap-2 rounded-full px-3 py-2 shadow-lg">
          <p className="font-display text-xl leading-none">Block</p>
          <p className="text-muted min-w-0 flex-1 truncate text-sm">{note}</p>
          <button
            type="button"
            className="bg-bg min-h-10 rounded-full px-3 text-sm"
            onClick={() => {
              drive.current = !drive.current;
              setMode(drive.current ? "drive" : "walk");
            }}
          >
            {mode === "drive" ? "Driving" : "Walking"}
          </button>
          <Link to="/" className="bg-bg grid min-h-10 place-items-center rounded-full px-3 text-sm">
            Map
          </Link>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex items-end justify-between p-3">
        <Stick />
        <div className="pointer-events-auto w-48 space-y-2">
          <button
            type="button"
            className="bg-accent text-bg min-h-11 w-full rounded-full text-sm"
            onClick={() => {
              const place = nearest();
              if (!place) {
                setNote("Nothing close enough.");
                return;
              }
              if (place.id.startsWith("ring-")) setYard(place.id);
              else {
                liveAct(place.kind, place.name);
                setNote(kindLabel(place.kind));
              }
            }}
          >
            Use what is near
          </button>
          <p className="text-muted text-xs">WASD or the stick. This is the real map, drawn light so a phone can hold it. Not a film render.</p>
        </div>
      </div>
      {yard ? <YardSheet businessId={yard} userId={user?.id ?? null} onClose={() => setYard(null)} /> : null}
    </main>
  );
}

function Stick() {
  const pad = useRef<HTMLDivElement>(null);
  function set(clientX: number, clientY: number) {
    const rect = pad.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const y = -((clientY - (rect.top + rect.height / 2)) / (rect.height / 2));
    const m = Math.hypot(x, y) || 1;
    setStick(Math.max(-1, Math.min(1, x / m)), Math.max(-1, Math.min(1, y / m)));
  }
  return (
    <div
      ref={pad}
      className="bg-surface/80 pointer-events-auto h-28 w-28 touch-none rounded-full border border-black/20"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        set(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) set(event.clientX, event.clientY);
      }}
      onPointerUp={() => setStick(0, 0)}
    />
  );
}

/**
 * NDU-UPG u-169: the guarded mount. Default OFF — StreetPlay is the retired
 * Leaflet street sim (docs/golive/leaflet-retire). Any mount point should use
 * this wrapper, not <StreetPlay/> directly, so the flag gate is never bypassed.
 * Returns null unless the streetplay flag is explicitly on.
 */
export function StreetPlayMount(): ReactElement | null {
  if (!streetPlayOn()) return null;
  return <StreetPlay />;
}
