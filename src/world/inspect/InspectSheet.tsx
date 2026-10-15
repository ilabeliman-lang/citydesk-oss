// NDU-UPG inspect (#04): the inspect card. Mobile bottom sheet (peek → full), desktop side card.
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatField } from "./profile";
import { inspectStore } from "./store";
import { inspectRuntime } from "./runtime";
import type { Field, PropertySet, VerbOffer } from "./types";
import "./inspect.css";

const ORDER: PropertySet["id"][] = ["identity", "size", "material", "age", "access", "yours", "source"];
const LABEL: Record<string, string> = {
  name: "Name", type: "Type", height: "Height", base: "Starts at", floors: "Floors", footprint: "Footprint", gfa: "Floor area", volume: "Volume",
  walls: "Walls", roof: "Roof", colour: "Colour", roof_shape: "Roof shape", built: "Built", use: "Use", access: "Access", hours: "Opening hours",
  wheelchair: "Wheelchair", operator: "Operator", street: "Address", quality: "Data quality", layer: "Source", osm_id: "OSM id", dims: "Size (w × h × l)",
  mass: "Weight", seats: "Seats", body: "Material", plate: "Plate", category: "Category", source: "Source", offer: "Offer", format: "Format", status: "Status",
  pin: "Pinned", tris: "Triangles",
};

function Row({ k, f }: { k: string; f: Field<unknown> }) {
  const text = formatField(f);
  const [value, src] = text.split(" · ");
  return (
    <div className="ndu-insp-row">
      <dt>{LABEL[k] ?? k.replace(/_/g, " ")}</dt>
      <dd>
        {value}
        {src ? <span className="ndu-insp-src"> · {src}</span> : null}
      </dd>
    </div>
  );
}

export default function InspectSheet() {
  const state = useSyncExternalStore(inspectStore.subscribe, inspectStore.get, inspectStore.get);
  const { profile, sheet, note } = state;
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [said, setSaid] = useState("");
  const [filter, setFilter] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const full = sheet === "full";
  const offers: VerbOffer[] = useMemo(() => (profile ? (inspectRuntime()?.offers(profile) ?? []) : []), [profile]);

  useEffect(() => {
    setSaid("");
    setFilter("");
    root.current?.focus();
  }, [profile?.key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        inspectStore.close();
        (document.querySelector(".maplibregl-canvas") as HTMLElement | null)?.focus?.();
      } else if (e.key === "Enter" && !full && document.activeElement === root.current) inspectStore.expand();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  if (!profile) return null;
  const verbs = full ? offers : offers.filter((o) => o.enabled).slice(0, 2);
  const sets = ORDER.map((id) => profile.sets.find((s) => s.id === id)).filter((s): s is PropertySet => Boolean(s && Object.keys(s.fields).length));
  const tags = Object.entries(profile.tags ?? {}).filter(([k, v]) => !filter || `${k}=${v}`.toLowerCase().includes(filter.toLowerCase()));
  const run = (v: VerbOffer) => {
    const msg = inspectRuntime()?.runVerb(v.verb) ?? "";
    if (msg) setSaid(msg);
  };

  return (
    <div ref={root} className={`ndu-insp ${full ? "is-full" : "is-peek"}`} role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1} data-inspect-sheet="">
      <p className="ndu-insp-sr" aria-live="polite">
        Inspecting {profile.title}
      </p>
      <button type="button" className="ndu-insp-grab" aria-label={full ? "Show less" : "Show more"} onClick={() => (full ? inspectStore.collapse() : inspectStore.expand())} />
      <header className="ndu-insp-head">
        <div>
          <h2 id={titleId}>{profile.title}</h2>
          <p className="ndu-insp-sub">{profile.subtitle}</p>
        </div>
        {profile.quality ? (
          <span className="ndu-insp-chip" style={{ borderColor: profile.quality.color, color: profile.quality.color }}>
            {profile.quality.label}
          </span>
        ) : null}
        <button type="button" className="ndu-insp-x" aria-label="Close" onClick={() => inspectStore.close()}>
          ×
        </button>
      </header>
      <ul className="ndu-insp-facts">
        {profile.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {profile.unique[0] ? <p className="ndu-insp-unique">★ {full ? profile.unique.join(" · ") : profile.unique[0]}</p> : null}
      {note ? <p className="ndu-insp-note">{note}</p> : null}
      {said ? (
        <p className="ndu-insp-said" role="status">
          {said}
        </p>
      ) : null}
      <div className="ndu-insp-verbs">
        {verbs.map((v) => (
          <button key={v.verb} type="button" className="ndu-insp-verb" disabled={!v.enabled} onClick={() => run(v)} title={v.reason}>
            {v.label}
            {full && !v.enabled && v.reason ? <span className="ndu-insp-why">{v.reason}</span> : null}
          </button>
        ))}
        {!full ? (
          <button type="button" className="ndu-insp-verb is-ghost" onClick={() => inspectStore.expand()}>
            More
          </button>
        ) : null}
      </div>
      {full ? (
        <div className="ndu-insp-body">
          {sets.map((s) => (
            <section key={s.id} aria-label={s.title}>
              <h3>{s.title}</h3>
              <dl>
                {Object.entries(s.fields).map(([k, f]) => (
                  <Row key={k} k={k} f={f} />
                ))}
              </dl>
            </section>
          ))}
          {profile.tags && Object.keys(profile.tags).length ? (
            <section aria-label="All OSM tags">
              <h3>
                <button type="button" className="ndu-insp-toggle" aria-expanded={tagsOpen} onClick={() => setTagsOpen((o) => !o)}>
                  All OSM tags ({Object.keys(profile.tags).length})
                </button>
              </h3>
              {tagsOpen ? (
                <>
                  <input className="ndu-insp-filter" aria-label="Filter tags" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
                  <dl className="ndu-insp-tags">
                    {tags.map(([k, v]) => (
                      <div className="ndu-insp-row" key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
      {profile.attribution || profile.osmUrl ? (
        <footer className="ndu-insp-foot">
          {profile.attribution ? <span>{profile.attribution}</span> : null}
          {profile.osmUrl ? (
            <a href={profile.osmUrl} target="_blank" rel="noopener noreferrer">
              Open on OpenStreetMap
            </a>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
