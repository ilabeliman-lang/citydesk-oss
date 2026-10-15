import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Armchair, Box, Building2, Compass, Crown, Droplet, Globe, Layers, Lock, Package, Pill, RotateCcw, Ruler, ShoppingBag, Sparkles, Upload, User, Users, UtensilsCrossed, X } from "lucide-react";
import { useSim } from "@/game/useSim";
import { shapeFromSpot, type EnterSpot } from "@/world/empty-state/footprint";
import {
  blankOverride,
  clearOverride,
  getOverride,
  ITEM_LABEL,
  MAX_GLB_BYTES,
  onOverridesChanged,
  ROOFS,
  saveOverride,
  WALLS,
  type ItemKind,
  type OwnerOverride,
  type OwnerTag,
  type Visibility,
} from "@/world/empty-state/ownerOverrides";
import type { IsoHandle } from "@/world/empty-state/isoScene";
import { Orbit } from "@/world/orbit/orbitCore"; // NDU-UPG drag360
// NDU-UPG drag360: same numbers as isoScene (kept here so the three.js chunk stays lazy).
const ISO_PITCH = 54.74;
const PITCH_LIM = { min: 2, max: 80 };
import "@/world/empty-state/emboss.css";

/**
 * The isometric empty state shown inside the existing "You stepped inside this building" card.
 * Default: the tapped building as an empty shell (real footprint, height, floors, map bearing), or
 * an empty plinth/slot for small things. If the owner customised it, their version shows instead.
 */

function usePrefersReduced() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return reduced;
}

const KIND_ICON: Record<string, typeof Package> = {
  eat: UtensilsCrossed,
  shift: ShoppingBag,
  rest: Armchair,
  wash: Droplet,
  care: Pill,
};

const TAGS: { id: OwnerTag; label: string; icon: ReactNode }[] = [
  { id: "personal", label: "Personal", icon: <User size={14} /> },
  { id: "family", label: "Family", icon: <Users size={14} /> },
  { id: "community", label: "Community", icon: <Globe size={14} /> },
];
const VIS: { id: Visibility; label: string; icon: ReactNode }[] = [
  { id: "private", label: "Private", icon: <Lock size={14} /> },
  { id: "family", label: "Family", icon: <Users size={14} /> },
  { id: "public", label: "Public", icon: <Globe size={14} /> },
];

function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`ndu-es-chip inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] leading-none ${className}`}>{children}</span>;
}

export function InsideView({ spot, userId }: { spot: EnterSpot; userId: string | null }) {
  const shape = useMemo(() => shapeFromSpot(spot), [spot]);
  const snap = useSim();
  const adult = snap.phase === "play";
  const canEdit = Boolean(userId) && adult;
  const reduced = usePrefersReduced();

  const [stored, setStored] = useState<OwnerOverride | null>(null);
  useEffect(() => {
    const load = () => setStored(getOverride(shape.key));
    load();
    return onOverridesChanged(load);
  }, [shape.key]);
  // Private by default: a private override only shows to whoever made it on this device.
  const ownerView = stored && (stored.visibility !== "private" || !stored.ownerId || stored.ownerId === userId) ? stored : null;
  const [draft, setDraft] = useState<OwnerOverride | null>(null);
  const shown = draft ?? ownerView;
  // Only visual fields rebuild the 3D scene (typing a name must not re-mount WebGL each keystroke).
  const sceneKey = shown ? JSON.stringify([shown.wall, shown.roof, shown.levels, shown.items, shown.glb?.length ?? 0]) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sceneOwner = useMemo(() => shown, [sceneKey]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<IsoHandle | null>(null);
  const mountedOnce = useRef(false);
  const yawRef = useRef(0);
  const pitchRef = useRef(ISO_PITCH); // NDU-UPG drag360
  const [yawOff, setYawOff] = useState(0);
  const [tilted, setTilted] = useState(false); // NDU-UPG drag360
  const [noGl, setNoGl] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let handle: IsoHandle | null = null;
    void import("@/world/empty-state/isoScene")
      .then(({ mountIso }) => {
        if (dead) return;
        try {
          handle = mountIso(canvas, shape, sceneOwner, { animate: !reduced && !mountedOnce.current });
          mountedOnce.current = true;
          handle.setView(shape.bearing + yawRef.current, pitchRef.current); // NDU-UPG drag360
          handleRef.current = handle;
          setNoGl(false);
        } catch {
          setNoGl(true);
        }
      })
      .catch(() => setNoGl(true));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => handleRef.current?.resize()) : null;
    ro?.observe(canvas);
    return () => {
      dead = true;
      ro?.disconnect();
      handle?.dispose();
      handleRef.current = null;
    };
  }, [shape, sceneOwner, reduced]);

  // NDU-UPG drag360: drag sideways to orbit 360°, up/down to tilt; glides after release (not with reduced motion).
  const turn = (deg: number, pitch = pitchRef.current) => {
    yawRef.current = deg;
    pitchRef.current = pitch;
    setYawOff(Math.round(deg));
    setTilted(Math.abs(pitch - ISO_PITCH) > 1);
    handleRef.current?.setView(shape.bearing + deg, pitch);
  };
  const orbitRef = useRef<Orbit | null>(null);
  const orbitRaf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(orbitRaf.current), []);
  const getOrbit = () => {
    if (!orbitRef.current) orbitRef.current = new Orbit({ yawPerPx: 0.6, pitchPerPx: 0.35 });
    orbitRef.current.reduced = reduced;
    return orbitRef.current;
  };
  const runOrbit = () => {
    const o = getOrbit();
    if (o.reduced) {
      turn(o.view.yaw, o.view.pitch);
      return;
    }
    if (orbitRaf.current) return;
    let last = 0;
    const tick = (now: number) => {
      orbitRaf.current = 0;
      const more = o.step(last ? (now - last) / 1000 : 1 / 60, PITCH_LIM);
      last = now;
      turn(o.view.yaw, o.view.pitch);
      if (more || o.dragging) orbitRaf.current = requestAnimationFrame(tick);
    };
    orbitRaf.current = requestAnimationFrame(tick);
  };
  const resetOrbit = () => {
    cancelAnimationFrame(orbitRaf.current);
    orbitRaf.current = 0;
    getOrbit().halt();
    turn(0, ISO_PITCH);
  };

  function startEdit(base?: Partial<OwnerOverride>) {
    if (!canEdit) return;
    setDraft({ ...(stored ?? blankOverride(shape.key, userId)), ownerId: userId, ...base });
  }

  function pickGlb(file: File | undefined) {
    if (!file) return;
    if (!/\.glb$/i.test(file.name)) return setNote("Pick a .glb file.");
    if (file.size > MAX_GLB_BYTES) return setNote("That scan is too big for this phone preview (1.5 MB max). Use the Scan desk for big scans.");
    const reader = new FileReader();
    reader.onload = () => {
      startEdit({ glb: String(reader.result), glbName: file.name });
      setNote("Scan added. Save to keep it.");
    };
    reader.onerror = () => setNote("Could not read that file.");
    reader.readAsDataURL(file);
  }

  const isBuilding = shape.type === "building";
  const levels = isBuilding ? (shown?.levels ?? shape.levels) : 0;
  const height = isBuilding ? (shown?.levels ? shown.levels * 3 : shape.maxH - shape.minH) : 0;
  const state = shown ? "owner" : shape.type;

  return (
    <div className="mt-3 space-y-3" data-ndu-empty-state={state} data-ndu-shape-key={shape.key}>
      <div className="ndu-es-well relative overflow-hidden rounded-3xl">
        <canvas
          ref={canvasRef}
          className="block h-60 w-full touch-none select-none"
          aria-label={isBuilding ? `Isometric view of ${shape.name}, ${levels} floors` : `Empty slot for ${shape.name}`}
          role="img"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            getOrbit().down(e.clientX, e.clientY, e.timeStamp, { yaw: yawRef.current, pitch: pitchRef.current });
          }}
          onPointerMove={(e) => {
            const o = getOrbit();
            if (!o.dragging) return;
            o.move(e.clientX, e.clientY, e.timeStamp, PITCH_LIM);
            runOrbit();
          }}
          onPointerUp={(e) => {
            const o = getOrbit();
            if (!o.dragging) return;
            o.up(e.timeStamp);
            runOrbit();
          }}
          onPointerCancel={(e) => {
            const o = getOrbit();
            if (!o.dragging) return;
            o.up(e.timeStamp);
            runOrbit();
          }}
        />
        {noGl ? <p className="text-muted absolute inset-0 grid place-items-center p-6 text-center text-sm">The 3D view needs WebGL. The details below still apply.</p> : null}
        <div className="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-1.5">
          {shown ? (
            <Chip className="ndu-es-glow text-accent">
              <Crown size={13} /> Owner&apos;s version
            </Chip>
          ) : isBuilding ? (
            <Chip>
              <Building2 size={13} /> Empty building
            </Chip>
          ) : (
            <Chip>
              <Box size={13} /> Empty slot
            </Chip>
          )}
          {shown ? (
            <Chip>
              {VIS.find((v) => v.id === shown.visibility)?.icon} {VIS.find((v) => v.id === shown.visibility)?.label}
            </Chip>
          ) : null}
        </div>
        <div
          className="ndu-es-chip pointer-events-none absolute top-2 right-2 grid h-10 w-10 place-items-center rounded-full"
          title="North"
          aria-hidden
        >
          <div style={{ transform: `rotate(${-(shape.bearing + yawOff)}deg)` }} className="flex flex-col items-center leading-none">
            <span className="text-accent text-[10px] font-bold">N</span>
            <Compass size={16} />
          </div>
        </div>
        <div className="absolute right-2 bottom-2 flex gap-1.5">
          {yawOff !== 0 || tilted ? (
            <button type="button" className="ndu-es-push flex min-h-9 items-center gap-1 rounded-full px-3 text-xs" onClick={resetOrbit}>
              <RotateCcw size={14} /> Match map
            </button>
          ) : null}
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1.5">
          {isBuilding ? (
            <>
              <Chip>
                <Ruler size={13} /> {Math.round(shape.size.w)}×{Math.round(shape.size.d)} m
              </Chip>
              <Chip>
                <Layers size={13} /> {levels} {levels === 1 ? "floor" : "floors"} · {Math.round(height)} m
              </Chip>
            </>
          ) : (
            <Chip>
              {(() => {
                const Icon = KIND_ICON[shape.kind] ?? Package;
                return <Icon size={13} aria-hidden />;
              })()}{" "}
              {shape.name}
            </Chip>
          )}
        </div>
      </div>

      <div className="ndu-es-chip rounded-2xl px-3 py-2 text-sm">
        {shown ? (
          <p>
            <span className="font-medium">{shown.name || shape.name}</span> is laid out by its owner
            {shown.items.length ? ` · ${shown.items.map((i) => ITEM_LABEL[i]).join(", ")}` : ""}
            {shown.glbName ? ` · scan: ${shown.glbName}` : ""}. Saved on this phone only.
          </p>
        ) : isBuilding ? (
          <p>
            Nothing inside yet. This is the empty shell: the same footprint, height and floors as the block on the map.
            <span className="text-muted block text-xs">
              {shape.heightSource === "osm"
                ? "Height from OpenStreetMap."
                : shape.heightSource === "levels"
                  ? "Height from the floor count on OpenStreetMap."
                  : "The map has no height here, so it shows as 2 floors."}{" "}
              Drag to look around: sideways to circle it, up and down to tilt.
            </span>
          </p>
        ) : (
          <p>An empty slot. Whoever runs this {shape.name.toLowerCase()} can put their stall, tap or sign here.</p>
        )}
      </div>

      {draft ? (
        <OwnerEditor
          draft={draft}
          isBuilding={isBuilding}
          mapLevels={isBuilding ? shape.levels : 1}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => {
            if (saveOverride(draft)) {
              setNote("Saved on this phone. Private unless you chose otherwise.");
              setDraft(null);
            } else setNote("This phone's storage is full or blocked, so it was not saved.");
          }}
          onReset={() => {
            clearOverride(shape.key);
            setDraft(null);
            setNote("Back to the empty default.");
          }}
        />
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            className={`ndu-es-push flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm ${canEdit ? "is-hot" : ""}`}
            disabled={!canEdit}
            onClick={() => startEdit()}
          >
            <Sparkles size={16} /> {stored ? "Edit layout" : "Customize"}
          </button>
          <button
            type="button"
            className="ndu-es-push flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm"
            disabled={!canEdit}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={16} /> Add scan
          </button>
          <input ref={fileRef} type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={(e) => pickGlb(e.target.files?.[0])} />
        </div>
      )}
      {!canEdit && !draft ? (
        <p className="text-muted text-center text-xs">
          {!userId ? "Sign in to customize. It stays private to you." : "Confirm you are 18 or older first."}
        </p>
      ) : null}
      {note ? <p className="text-muted text-center text-xs">{note}</p> : null}
    </div>
  );
}

function OwnerEditor({
  draft,
  isBuilding,
  mapLevels,
  onChange,
  onCancel,
  onSave,
  onReset,
}: {
  draft: OwnerOverride;
  isBuilding: boolean;
  mapLevels: number;
  onChange: (next: OwnerOverride) => void;
  onCancel: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const set = (patch: Partial<OwnerOverride>) => onChange({ ...draft, ...patch });
  const levels = draft.levels ?? mapLevels;
  const toggle = (item: ItemKind) =>
    set({ items: draft.items.includes(item) ? draft.items.filter((i) => i !== item) : [...draft.items, item].slice(0, 12) });
  return (
    <div className="ndu-es-chip space-y-3 rounded-2xl p-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg">Lay it out</p>
        <button type="button" className="ndu-es-push grid h-9 w-9 place-items-center rounded-full" aria-label="Cancel" onClick={onCancel}>
          <X size={16} />
        </button>
      </div>
      <input
        value={draft.name ?? ""}
        onChange={(e) => set({ name: e.target.value.slice(0, 60) })}
        placeholder="Name it (optional)"
        className="bg-bg min-h-11 w-full rounded-xl px-3 text-sm"
      />
      <Row label={isBuilding ? "Walls" : "Thing"}>
        {WALLS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={draft.wall === c} className="ndu-es-swatch h-8 w-8 rounded-full" style={{ background: c }} onClick={() => set({ wall: c })} />
        ))}
      </Row>
      <Row label={isBuilding ? "Roof" : "Plinth"}>
        {ROOFS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={draft.roof === c} className="ndu-es-swatch h-8 w-8 rounded-full" style={{ background: c }} onClick={() => set({ roof: c })} />
        ))}
      </Row>
      {isBuilding ? (
        <Row label="Floors">
          <button type="button" className="ndu-es-push h-9 w-9 rounded-full" onClick={() => set({ levels: Math.max(1, levels - 1) })}>
            −
          </button>
          <span className="min-w-8 text-center text-sm tabular-nums">{levels}</span>
          <button type="button" className="ndu-es-push h-9 w-9 rounded-full" onClick={() => set({ levels: Math.min(60, levels + 1) })}>
            +
          </button>
          {draft.levels !== undefined ? (
            <button type="button" className="text-muted text-xs underline" onClick={() => set({ levels: undefined })}>
              Map height
            </button>
          ) : null}
        </Row>
      ) : null}
      <Row label="Inside">
        {(Object.keys(ITEM_LABEL) as ItemKind[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={draft.items.includes(item)}
            className={`ndu-es-push min-h-9 rounded-full px-3 text-xs ${draft.items.includes(item) ? "is-hot" : ""}`}
            onClick={() => toggle(item)}
          >
            {ITEM_LABEL[item]}
          </button>
        ))}
      </Row>
      <Row label="Tag">
        {TAGS.map((t) => (
          <button key={t.id} type="button" aria-pressed={draft.tag === t.id} className={`ndu-es-push flex min-h-9 items-center gap-1 rounded-full px-3 text-xs ${draft.tag === t.id ? "is-hot" : ""}`} onClick={() => set({ tag: t.id })}>
            {t.icon} {t.label}
          </button>
        ))}
      </Row>
      <Row label="Who sees it">
        {VIS.map((v) => (
          <button key={v.id} type="button" aria-pressed={draft.visibility === v.id} className={`ndu-es-push flex min-h-9 items-center gap-1 rounded-full px-3 text-xs ${draft.visibility === v.id ? "is-hot" : ""}`} onClick={() => set({ visibility: v.id })}>
            {v.icon} {v.label}
          </button>
        ))}
      </Row>
      <p className="text-muted text-xs">Saved on this phone only for now. Nothing is sent to the server.</p>
      <div className="flex gap-2">
        <button type="button" className="ndu-es-push min-h-11 flex-1 rounded-full text-sm" onClick={onReset}>
          Reset to empty
        </button>
        <button type="button" className="ndu-es-push is-hot min-h-11 flex-1 rounded-full text-sm font-medium" onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted text-[11px] tracking-wide uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
