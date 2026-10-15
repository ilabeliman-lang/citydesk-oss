import { useCallback, useEffect, useRef, useState } from "react";
import { Footprints, MapPin, Mic, Search, X } from "lucide-react";
import { Bubble } from "@/world/bubbles/Bubble";
import { tapBuzz } from "@/world/bubbles/mode";
import { canWalk, flyToHit, mapCenter, walkToHit } from "./mapHandle";
import "./search.css";
import { autoSmart, pickEmbedModel } from "./models";
import type { Place } from "@/world/places";
import type { Hit } from "./engine";

/**
 * NDU-AI search: the "Where to?" bubble. Tapping it unfolds an embossed search card (typed search,
 * results, and a mic). The search engine and the speech model load only when the card opens or the
 * mic is tapped — never with the map.
 */
export function SearchBubble({ places = [] }: { places?: Place[] }) {
  const [open, setOpen] = useState(false);
  const [went, setWent] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const close = useCallback(() => setOpen(false), []);
  // "/" opens search on a keyboard (not while typing somewhere else).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || open || t?.closest("input,textarea,[contenteditable=true]")) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    if (!went) return;
    const id = window.setTimeout(() => setWent(null), 9000);
    return () => window.clearTimeout(id);
  }, [went]);
  const fly = useCallback((hit: { lat: number; lng: number; name: string }) => {
    if (flyToHit(hit)) setWent(hit);
  }, []);
  return (
    <div className="ndu-search">
      <Bubble size="sm" label={open ? "Close search" : "Search places, streets and buildings"} aria-expanded={open} aria-keyshortcuts="/" onClick={() => setOpen((v) => !v)}>
        <Search aria-hidden="true" />
      </Bubble>
      {open ? <SearchCard center={mapCenter} places={places} onFly={fly} onClose={close} /> : null}
      {went && !open ? (
        <div className="ndu-search__went" role="status">
          <MapPin aria-hidden="true" />
          <span className="ndu-search__went-name">{went.name}</span>
          {canWalk() ? (
            <button
              type="button"
              className="ndu-search__walk"
              onClick={() => {
                tapBuzz();
                void walkToHit(went);
                setWent(null);
              }}
            >
              <Footprints aria-hidden="true" /> Walk there
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type Phase = "idle" | "listening" | "hearing" | "blocked";

function SearchCard({
  center,
  places,
  onFly,
  onClose,
}: {
  center: () => { lat: number; lng: number } | null;
  places: Place[];
  onFly: (hit: { lat: number; lng: number; name: string }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState("Loading search…");
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState(0);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const stopRec = useRef<(() => void) | null>(null);
  const engine = useRef<typeof import("./engine") | null>(null);
  const index = useRef<import("./engine").SearchIndex | null>(null);
  const vecs = useRef<Map<string, Float32Array>>(new Map());
  const docs = useRef<import("./docs").SearchDoc[]>([]);
  const seen = useRef("");
  const lastQuery = useRef("");
  const qvecs = useRef<Map<string, Float32Array>>(new Map());
  const [ready, setReady] = useState(0);
  const [smart, setSmart] = useState(() => autoSmart());

  useEffect(() => {
    input.current?.focus();
    let dead = false;
    void import("./engine").then((mod) => {
      if (dead) return;
      engine.current = mod;
      setNote("Type or tap the mic. Or tap a street on the map to go there.");
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => {
      dead = true;
      stopRec.current?.();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, { capture: true });
    };
  }, [onClose]);

  // Gather what's around the view (streets, places, buildings, listings, public scans) and index it.
  // Each source is indexed as soon as it arrives, so a slow Overpass answer never blocks search.
  const placesRef = useRef(places);
  placesRef.current = places;
  useEffect(() => {
    let dead = false;
    const parts = new Map<string, import("./privacy").RawRecord[]>();
    const own = new Set<string>();
    const rebuild = async () => {
      const [docsMod, engineMod] = await Promise.all([import("./docs"), engine.current ?? import("./engine")]);
      if (dead) return;
      const raw = [...parts.values()].flat();
      for (const place of placesRef.current) raw.push({ ...place, source: "place", origin: place.source === "ring" ? "ring" : "osm" });
      const built = docsMod.buildDocs(raw, { ownScanIds: own });
      docs.current = built;
      index.current = new engineMod.SearchIndex(built);
      setReady((n) => n + 1);
      void embedDocs(built);
    };
    const part = <T,>(name: string, job: Promise<T>, toRaw: (v: T) => import("./privacy").RawRecord[]) =>
      job
        .then((v) => {
          if (dead) return;
          parts.set(name, toRaw(v));
          void rebuild();
        })
        .catch(() => undefined);
    const run = () => {
      const here = center();
      if (!here) return;
      const key = `${here.lat.toFixed(3)},${here.lng.toFixed(3)}`;
      if (key === seen.current) return;
      seen.current = key;
      parts.clear();
      void rebuild(); // the map's own places are searchable straight away
      const at = { data: { lat: here.lat, lng: here.lng } };
      part("streets", import("@/world/life/streets").then((m) => m.lifeStreets(at)), (life) => [
        ...life.roads.filter((r) => r.name).map((r) => ({ source: "street" as const, name: r.name, cls: r.cls, pts: r.pts })),
        ...life.pois.map((p) => ({ source: "poi" as const, ...p })),
      ]);
      part("corpus", import("./corpus").then((m) => m.searchCorpus(at)), (rows) => rows);
      part("mine", import("@/world/scans").then((m) => m.listMyScans()), (mine) => {
        own.clear();
        const out: import("./privacy").RawRecord[] = [];
        for (const scan of mine) {
          if (!scan.pose) continue;
          own.add(scan.id);
          out.push({ source: "scan", id: scan.id, name: scan.name, visibility: "private", status: scan.status ?? "stored", lat: scan.pose.lat, lng: scan.pose.lng });
        }
        return out;
      });
    };
    run();
    const again = window.setInterval(run, 20_000);
    return () => {
      dead = true;
      window.clearInterval(again);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Embed documents in the background once the model is in (vectors stay in memory for this visit;
  // the model files stay in the browser cache).
  async function embedDocs(list: import("./docs").SearchDoc[]) {
    try {
      const mod = await import("./embed");
      if (!mod.embedReady()) return;
      const { embedText } = await import("./docs");
      const missing = list.filter((d) => !vecs.current.has(d.id));
      for (let i = 0; i < missing.length; i += 64) {
        const slice = missing.slice(i, i + 64);
        const vectors = await mod.embed(slice.map(embedText), "passage");
        slice.forEach((d, j) => vecs.current.set(d.id, vectors[j]));
        if (lastQuery.current) rank(lastQuery.current); // results sharpen as meanings arrive
      }
    } catch {
      // lexical search keeps working without embeddings
    }
  }

  function rank(q: string) {
    if (!index.current) return;
    const found = index.current.search(q, { here: center(), qvec: qvecs.current.get(q) ?? null, vecs: vecs.current });
    setHits(found);
    setActive((n) => Math.min(n, Math.max(0, found.length - 1)));
    if (!found.length) setNote("Nothing nearby matches that.");
    else setNote((cur) => (cur.startsWith("Nothing") ? "" : cur));
  }

  // Lexical results show at once; the meaning-based score joins when the model is ready.
  async function runQuery(q: string) {
    const trimmed = q.trim();
    lastQuery.current = trimmed;
    if (!trimmed) return;
    if (!index.current) {
      setNote("Looking around this area…");
      return;
    }
    rank(trimmed);
    if (!smart) return;
    try {
      const mod = await import("./embed");
      if (!mod.embedReady()) setNote(`Getting smarter search ready (${mod.EMBED.mb} MB, once; stays on this phone)…`);
      await mod.loadEmbedder((r) => setNote(`Getting smarter search ready… ${Math.round(r * 100)}%`));
      if (!qvecs.current.has(trimmed)) qvecs.current.set(trimmed, (await mod.embed([trimmed], "query"))[0]);
      setNote((cur) => (cur.startsWith("Getting") ? "" : cur));
      if (lastQuery.current === trimmed) rank(trimmed);
      void embedDocs(docs.current);
    } catch {
      setSmart(false);
      setNote("Smart search is unavailable here; showing word matches.");
    }
  }

  useEffect(() => {
    if (!query.trim()) {
      lastQuery.current = "";
      setHits([]);
      return;
    }
    const id = window.setTimeout(() => void runQuery(query), 260);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ready, smart]);

  function choose(hit: Hit) {
    onFly({ lat: hit.doc.lat, lng: hit.doc.lng, name: hit.doc.title });
    onClose();
  }

  async function mic() {
    if (phase === "listening") {
      stopRec.current?.();
      return;
    }
    setPhase("listening");
    setNote("Listening… tap the mic again when you're done. Audio stays on this phone.");
    const { recordClip } = await import("./audio");
    const rec = recordClip(setLevel);
    stopRec.current = rec.stop;
    const clip = await rec.done;
    stopRec.current = null;
    setLevel(0);
    if (!clip || clip.seconds < 0.4) {
      setPhase(clip ? "idle" : "blocked");
      setNote(clip ? "Didn't catch that. Try again." : "The microphone is blocked in the browser settings.");
      return;
    }
    setPhase("hearing");
    try {
      const mod = await import("./voice");
      setNote(mod.voiceReady() ? "Hearing that…" : "Loading speech recognition (once, stays on this phone)…");
      await mod.loadVoice((r) => setNote(`Loading speech recognition… ${Math.round(r * 100)}%`));
      const text = await mod.transcribe(clip.samples);
      setPhase("idle");
      if (!text) {
        setNote("Didn't catch any words. Try again.");
        return;
      }
      setQuery(text);
      setNote("");
    } catch {
      setPhase("idle");
      setNote("Speech recognition couldn't start. You can still type.");
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((n) => Math.min(hits.length - 1, n + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((n) => Math.max(0, n - 1));
    } else if (e.key === "Enter" && hits[active]) choose(hits[active]);
  }

  const micLabel = phase === "listening" ? "Stop and search what I said" : phase === "hearing" ? "Hearing what you said" : "Search by voice. Audio stays on this phone.";

  return (
    <div ref={box} className="ndu-search__card" role="dialog" aria-label="Search Ndu">
      <div className="ndu-search__row">
        <Search aria-hidden="true" />
        <input
          ref={input}
          className="ndu-search__input"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="ndu-search-list"
          aria-activedescendant={hits[active] ? `ndu-hit-${active}` : undefined}
          placeholder="Where to? Try “chemist near the market”"
          value={query}
          maxLength={160}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="button" className={`ndu-search__mic${phase === "listening" ? " is-on" : ""}`} aria-label={micLabel} aria-pressed={phase === "listening"} disabled={phase === "hearing"} onClick={() => void mic()}>
          <Mic aria-hidden="true" />
          {phase === "listening" ? <span className="ndu-search__pulse" style={{ transform: `scale(${1 + level})` }} aria-hidden="true" /> : null}
        </button>
        <button type="button" className="ndu-search__x" aria-label="Close search" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      {phase === "listening" ? (
        <p className="ndu-search__live" role="status">
          <span className="ndu-search__dot" aria-hidden="true" /> Recording on this phone. Nothing is sent anywhere.
        </p>
      ) : null}
      {note ? (
        <p className="ndu-search__note" role="status">
          {note}
        </p>
      ) : null}
      {!smart && query.trim() ? (
        <button type="button" className="ndu-search__chip" onClick={() => setSmart(true)}>
          ✨ Smarter results ({EMBED_MB} MB once, stays on this phone)
        </button>
      ) : null}
      {hits.length ? (
        <ul id="ndu-search-list" className="ndu-search__list" role="listbox" aria-label="Search results">
          {hits.map((hit, i) => (
            <li key={hit.doc.id} id={`ndu-hit-${i}`} role="option" aria-selected={i === active}>
              <button type="button" className={`ndu-search__hit${i === active ? " is-on" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => choose(hit)}>
                <span className="ndu-search__kind">{KIND[hit.doc.kind]}</span>
                <span className="ndu-search__title">{hit.doc.title}</span>
                <span className="ndu-search__sub">
                  {hit.doc.sub}
                  {hit.reasons.length ? ` · ${hit.reasons[0]}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const EMBED_MB = pickEmbedModel().mb;

const KIND: Record<string, string> = { place: "Place", street: "Street", building: "Building", listing: "On Ndu", scan: "Scan", poi: "Place" };
