import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { ScanMap } from "@/world/scanLayer";
import { requestScans } from "@/world/perf/scanGate"; // NDU-UPG 504
import { OPEN_SCANS_EVENT } from "@/world/assistant/bridgeStore"; // NDU-AI assistant
import { ScanHelp, ScanStatusChip } from "@/world/ScanStatusChip"; // NDU-UPG #352 #375
import {
  DRAWN_FORMATS,
  downloadRawScan,
  drawFormat,
  retryScan,
  scanOnMap,
  listMyScans,
  placeScan,
  SCAN_ACCEPT,
  SCAN_FORMATS,
  SCAN_MAX_BYTES,
  uploadScan,
  type ScanAsset,
  type ScanFormat,
  type ScanPose,
} from "@/world/scans";
import { snap } from "@/world/placement/snap"; // NDU-UPG placement
import { push as pushUndo, undo as popUndo } from "@/world/placement/undo"; // NDU-UPG placement
import { clampPose, normalizeRotation, offsetMetres } from "@/world/placement/nudge"; // NDU-UPG placement
import { rotateStep } from "@/world/placement/gizmo"; // NDU-UPG placement

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;

/** Import a 3D scan, preview it on the map, then Place it. Private to its owner. */
export function ScanDesk({
  ready,
  mapRef,
}: {
  ready: boolean;
  mapRef: MutableRefObject<ScanMap | null>;
}) {
  const user = useCurrentUser();
  const userId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [scans, setScans] = useState<ScanAsset[]>([]);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [placing, setPlacing] = useState<{ scan: ScanAsset; pose: ScanPose } | null>(null);
  const [size, setSize] = useState<[number, number, number] | null>(null);
  const [saving, setSaving] = useState(false);
  // NDU-UPG placement: the desk owns the undo stack; nudge fields stay local until Apply.
  const history = useRef<ScanPose[]>([]);
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const echoing = useRef(false);
  const dragArm = useRef(true);
  const sliderArm = useRef(false);
  const dragIdle = useRef(0);
  const [undoCount, setUndoCount] = useState(0);
  const [eastM, setEastM] = useState("0");
  const [northM, setNorthM] = useState("0");
  const [degrees, setDegrees] = useState("");
  // NDU-AI assistant: the guide bot opens this panel only after the player tapped "Yes, open scans".
  useEffect(() => {
    const onOpen = () => {
      requestScans();
      setOpen(true);
    };
    window.addEventListener(OPEN_SCANS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SCANS_EVENT, onOpen);
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const scansRef = useRef<ScanAsset[]>([]); // NDU-UPG #352: last list, for status flips
  scansRef.current = scans;

  const draw = (list: ScanAsset[]) =>
    mapRef.current?.show(
      // NDU-UPG #351/#353: converted scans draw as GLB; rejected ones stay off the map
      list.flatMap((s) =>
        s.pose && scanOnMap(s)
          ? [{ id: s.id, name: s.name, format: drawFormat(s), pose: s.pose }]
          : [],
      ),
    );

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      setScans([]);
      mapRef.current?.show([]);
      return;
    }
    let live = true;
    listMyScans()
      .then((list) => {
        if (!live) return;
        setScans(list);
        draw(list);
      })
      .catch(() => {
        if (live) setNote("Could not load your scans.");
      });
    return () => {
      live = false;
    };
    // draw only reads the map ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  // NDU-UPG #352: refresh while any scan is queued/converting; redraw when one turns ready
  const busy = scans.some((s) => s.status === "queued" || s.status === "converting");
  useEffect(() => {
    if (!busy || !userId) return;
    const timer = window.setInterval(() => {
      listMyScans()
        .then((list) => {
          const flipped = new Set(
            list
              .filter((s) => scansRef.current.find((c) => c.id === s.id)?.status !== s.status)
              .map((s) => s.id),
          );
          setScans(list);
          if (!flipped.size || placing) return;
          // drop + re-add the flipped ones so their pin turns into the drawn model
          draw(list.filter((s) => !flipped.has(s.id)));
          draw(list);
        })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, userId, placing]);

  const retry = async (scan: ScanAsset) => {
    try {
      await retryScan({ data: { id: scan.id } });
      setScans((cur) =>
        cur.map((s) => (s.id === scan.id ? { ...s, status: "queued", statusReason: null } : s)),
      );
    } catch {
      setNote("Could not retry. Try again.");
    }
  };

  const noteHistory = () => setUndoCount(history.current.length);

  const resetHistory = () => {
    history.current = [];
    noteHistory();
    setEastM("0");
    setNorthM("0");
    setDegrees("");
  };

  const writePose = (pose: ScanPose) => {
    const cur = placingRef.current;
    if (!cur) return;
    const next = clampPose(pose);
    const updated = { ...cur, pose: next };
    echoing.current = true;
    placingRef.current = updated;
    setPlacing(updated);
    mapRef.current?.adjust(next);
    echoing.current = false;
  };

  const remember = (pose: ScanPose) => {
    pushUndo(history.current, pose); // NDU-UPG placement
    noteHistory();
  };

  const commitPose = (pose: ScanPose, mode: "step" | "live") => {
    const cur = placingRef.current;
    if (!cur) return;
    const next = clampPose(pose);
    const same =
      next.lng === cur.pose.lng &&
      next.lat === cur.pose.lat &&
      next.rotation === cur.pose.rotation &&
      next.scale === cur.pose.scale;
    if (same) return;
    if (mode === "step" || sliderArm.current) {
      remember(cur.pose);
      sliderArm.current = false;
    }
    writePose(next);
  };

  const startPlace = (scan: ScanAsset) => {
    const map = mapRef.current;
    if (!map) return;
    const pose = clampPose(scan.pose ?? { ...map.center(), rotation: 0, scale: 1 });
    setSize(null);
    resetHistory();
    const session = { scan, pose };
    placingRef.current = session;
    setPlacing(session);
    echoing.current = true;
    map.place(
      { id: scan.id, name: scan.name, format: drawFormat(scan), pose }, // NDU-UPG #351
      (next) => {
        const cur = placingRef.current;
        if (!cur) return;
        if (echoing.current) {
          const synced = clampPose(next);
          const updated = { ...cur, pose: synced };
          placingRef.current = updated;
          setPlacing(updated);
          return;
        }
        // NDU-UPG placement: one snapshot per pin drag, not one per move event.
        if (dragArm.current) {
          pushUndo(history.current, cur.pose);
          setUndoCount(history.current.length);
          dragArm.current = false;
        }
        const synced = clampPose(next);
        const updated = { ...cur, pose: synced };
        placingRef.current = updated;
        setPlacing(updated);
        window.clearTimeout(dragIdle.current);
        dragIdle.current = window.setTimeout(() => {
          dragArm.current = true;
        }, 300);
      },
      setSize,
    );
    echoing.current = false;
    dragArm.current = true;
    if (scan.pose) map.focus(scan.pose);
  };

  const stopPlace = () => {
    window.clearTimeout(dragIdle.current);
    mapRef.current?.finish();
    placingRef.current = null;
    setPlacing(null);
    setSize(null);
    resetHistory();
    draw(scans);
  };

  const adjust = (change: Partial<ScanPose>, mode: "step" | "live" = "step") => {
    const cur = placingRef.current;
    if (!cur) return;
    commitPose({ ...cur.pose, ...change }, mode);
  };

  const pick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() as ScanFormat;
    if (!SCAN_FORMATS.includes(ext)) {
      setNote(`Use a ${SCAN_ACCEPT.replaceAll(",", ", ")} file.`);
      return;
    }
    if (file.size > SCAN_MAX_BYTES) {
      setNote(`That file is ${mb(file.size)}. Scans are limited to ${mb(SCAN_MAX_BYTES)}.`);
      return;
    }
    setNote("");
    setProgress(0);
    try {
      const scan = await uploadScan(file, setProgress);
      const list = [scan, ...scans];
      setScans(list);
      setNote(
        scan.format === "usdz"
          ? "Uploaded. Converting it to 3D now; place it meanwhile." // NDU-UPG #351
          : DRAWN_FORMATS.includes(scan.format)
            ? "Uploaded. Now put it on the map."
            : "Uploaded. This kind is kept and pinned, not drawn yet.",
      );
      startPlace(scan);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  };

  const save = async () => {
    if (!placing) return;
    setSaving(true);
    try {
      // NDU-UPG placement: the ghost stays local until Place. Nothing is written before this.
      const saved = await placeScan({
        data: { id: placing.scan.id, pose: clampPose(placing.pose) },
      });
      const list = scans.map((s) => (s.id === saved.id ? saved : s));
      setScans(list);
      window.clearTimeout(dragIdle.current);
      mapRef.current?.finish();
      placingRef.current = null;
      setPlacing(null);
      setSize(null);
      resetHistory();
      draw(list);
      setNote(`Placed ${saved.name}. Only you can see it.`);
    } catch {
      setNote("Could not save the spot. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const undoPlace = () => {
    const prev = popUndo(history.current); // NDU-UPG placement
    noteHistory();
    if (!prev) return;
    writePose(prev);
  };

  const applyNudge = () => {
    const cur = placingRef.current;
    if (!cur) return;
    const east = Number(eastM);
    const north = Number(northM);
    const eastOk = Number.isFinite(east) ? east : 0;
    const northOk = Number.isFinite(north) ? north : 0;
    const heading = degrees.trim() === "" ? null : Number(degrees);
    if (eastOk === 0 && northOk === 0 && (heading === null || !Number.isFinite(heading))) return;
    let pose = offsetMetres(cur.pose, eastOk, northOk); // NDU-UPG placement
    if (heading !== null && Number.isFinite(heading)) pose = { ...pose, rotation: heading };
    commitPose(pose, "step");
    setEastM("0");
    setNorthM("0");
    setDegrees("");
  };

  const snapToView = () => {
    const cur = placingRef.current;
    const centre = mapRef.current?.center();
    if (!cur || !centre) return;
    // NDU-UPG placement: view centre; no longest-edge bearing, so the yaw stays.
    commitPose(snap({ lng: centre.lng, lat: centre.lat }, undefined, cur.pose), "step");
  };

  const undoRef = useRef(undoPlace);
  undoRef.current = undoPlace;
  const placingActive = placing !== null;
  // NDU-UPG placement: Ctrl+Z, and a two-finger tap (pinch still belongs to the map).
  useEffect(() => {
    if (!placingActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || !(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      undoRef.current();
    };
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let sawTwo = false;
    let started = 0;
    let onControl = false;
    const down = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.("button, input, textarea, select, a, label")) onControl = true;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        sawTwo = true;
        moved = 0;
        started = e.timeStamp || performance.now();
      }
      if (pts.size > 2) sawTwo = false;
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      moved = Math.max(moved, Math.hypot(e.clientX - p.x, e.clientY - p.y));
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      dragArm.current = true;
      const now = e.timeStamp || performance.now();
      if (pts.size === 0 && !onControl && sawTwo && moved < 18 && now - started < 400) {
        undoRef.current();
      }
      if (pts.size === 0) {
        sawTwo = false;
        onControl = false;
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.clearTimeout(dragIdle.current);
    };
  }, [placingActive]);

  const close = () => {
    if (placing) stopPlace();
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="bg-surface grid h-11 w-11 place-items-center rounded-full shadow"
        aria-label="Scans"
        title="Scans"
        onClick={() => {
          requestScans();
          /* NDU-UPG 504: load three.js now */ setOpen(true);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 8V5h3M16 5h3v3M20 16v3h-3M8 19H5v-3" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    );
  }

  return (
    <div className="bg-surface/95 max-h-[60dvh] w-[min(17rem,calc(100vw-1.5rem))] space-y-2 overflow-y-auto rounded-2xl px-3 py-2 text-xs shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">My scans</p>
        <button type="button" className="bg-bg min-h-8 rounded-full px-3" onClick={close}>
          Close
        </button>
      </div>
      {!userId ? (
        <p className="text-muted">
          Sign in to import a 3D scan of your room or building. Scans stay private to you.
        </p>
      ) : placing ? (
        <div className="space-y-2">
          {/* NDU-UPG placement: ghost preview. The map pin updates live; Place is the only save. */}
          <p>
            Preview of <span className="font-medium">{placing.scan.name}</span>. Drag the pin or tap
            the map. Nothing is saved until you press Place.
          </p>
          <p className="text-muted">
            lng {placing.pose.lng.toFixed(6)} · lat {placing.pose.lat.toFixed(6)} ·{" "}
            {normalizeRotation(placing.pose.rotation).toFixed(1)}° · {placing.pose.scale.toFixed(2)}
            ×
          </p>
          {size ? (
            <p className="text-muted">
              Model is {(size[0] * placing.pose.scale).toFixed(1)} ×{" "}
              {(size[2] * placing.pose.scale).toFixed(1)} m,{" "}
              {(size[1] * placing.pose.scale).toFixed(1)} m tall.
            </p>
          ) : null}
          <div className="space-y-1">
            <span>Twist: {normalizeRotation(placing.pose.rotation).toFixed(0)}°</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Twist left"
                className="bg-bg min-h-[44px] min-w-[44px] rounded-full"
                onClick={() => adjust({ rotation: placing.pose.rotation + rotateStep(-15) })}
              >
                ↺
              </button>
              <input
                type="range"
                aria-label="Twist to rotate"
                min={0}
                max={360}
                step={1}
                value={normalizeRotation(placing.pose.rotation)}
                onPointerDown={() => {
                  sliderArm.current = true;
                }}
                onChange={(e) => adjust({ rotation: Number(e.target.value) }, "live")}
                className="min-h-[44px] w-full"
              />
              <button
                type="button"
                aria-label="Twist right"
                className="bg-bg min-h-[44px] min-w-[44px] rounded-full"
                onClick={() => adjust({ rotation: placing.pose.rotation + rotateStep(15) })}
              >
                ↻
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <span>Size: {placing.pose.scale.toFixed(2)}×</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Smaller"
                className="bg-bg min-h-[44px] min-w-[44px] rounded-full"
                onClick={() => adjust({ scale: placing.pose.scale / 1.1 })}
              >
                −
              </button>
              <input
                type="range"
                aria-label="Scale"
                min={-2}
                max={2}
                step={0.01}
                value={Math.min(2, Math.max(-2, Math.log10(placing.pose.scale)))}
                onPointerDown={() => {
                  sliderArm.current = true;
                }}
                onChange={(e) => adjust({ scale: 10 ** Number(e.target.value) }, "live")}
                className="min-h-[44px] w-full"
              />
              <button
                type="button"
                aria-label="Larger"
                className="bg-bg min-h-[44px] min-w-[44px] rounded-full"
                onClick={() => adjust({ scale: placing.pose.scale * 1.1 })}
              >
                +
              </button>
            </div>
          </div>
          {/* NDU-UPG placement: metres offset and heading degrees. */}
          <form
            className="space-y-1"
            onSubmit={(e) => {
              e.preventDefault();
              applyNudge();
            }}
          >
            <p className="font-medium">Fine-tune</p>
            <label className="flex items-center justify-between gap-2">
              East m
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={eastM}
                onChange={(e) => setEastM(e.target.value)}
                className="bg-bg min-h-[44px] w-28 rounded-lg px-2"
                aria-label="East metres"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              North m
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={northM}
                onChange={(e) => setNorthM(e.target.value)}
                className="bg-bg min-h-[44px] w-28 rounded-lg px-2"
                aria-label="North metres"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              Degrees
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={degrees}
                placeholder={normalizeRotation(placing.pose.rotation).toFixed(1)}
                onChange={(e) => setDegrees(e.target.value)}
                className="bg-bg min-h-[44px] w-28 rounded-lg px-2"
                aria-label="Heading degrees"
              />
            </label>
            <p className="text-muted">
              East and north are metres from here. Degrees sets the heading.
            </p>
            <button type="submit" className="bg-bg min-h-[44px] w-full rounded-full">
              Apply nudge
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={undoCount === 0}
              title="Ctrl+Z"
              className="bg-bg min-h-[44px] min-w-[44px] flex-1 rounded-full disabled:opacity-40"
              onClick={undoPlace}
            >
              Undo
            </button>
            <button
              type="button"
              className="bg-bg min-h-[44px] min-w-[44px] flex-1 rounded-full"
              onClick={snapToView}
            >
              Snap
            </button>
            <button
              type="button"
              className="bg-bg min-h-[44px] min-w-[44px] flex-1 rounded-full"
              onClick={() => adjust({ scale: 1 })}
            >
              Real size
            </button>
          </div>
          <button
            type="button"
            className="bg-bg min-h-[44px] w-full rounded-full"
            onClick={stopPlace}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="bg-accent text-bg min-h-[44px] w-full rounded-full disabled:opacity-60"
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Place"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted">
            Add a scan from Polycam, Scaniverse, Luma or RoomPlan. GLB, glTF and USDZ show in 3D;
            PLY, SPZ and SPLAT are kept and pinned. Up to {mb(SCAN_MAX_BYTES)}. Private to you.
          </p>
          <ScanHelp />
          <input
            ref={fileRef}
            type="file"
            accept={SCAN_ACCEPT}
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={progress !== null || !ready}
            className="bg-accent text-bg min-h-9 w-full rounded-full disabled:opacity-60"
            onClick={() => fileRef.current?.click()}
          >
            {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Upload a scan"}
          </button>
          {scans.length ? (
            <ul className="space-y-1.5">
              {scans.map((scan) => (
                <li key={scan.id} className="bg-bg flex items-center gap-2 rounded-xl px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{scan.name}</p>
                    <p className="text-muted">
                      {scan.format.toUpperCase()} · {mb(scan.bytes)} ·{" "}
                      {scan.pose ? "on the map" : "not placed"}
                    </p>
                    <ScanStatusChip
                      scan={scan}
                      onRetry={() => void retry(scan)}
                      onRaw={() =>
                        void downloadRawScan(scan).catch((e: Error) => setNote(e.message))
                      }
                    />
                  </div>
                  {scan.pose ? (
                    <button
                      type="button"
                      className="bg-surface min-h-8 shrink-0 rounded-full px-2"
                      onClick={() => scan.pose && mapRef.current?.focus(scan.pose)}
                    >
                      Go
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="bg-surface min-h-8 shrink-0 rounded-full px-2"
                    onClick={() => startPlace(scan)}
                  >
                    {scan.pose ? "Move" : "Place"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No scans yet.</p>
          )}
        </div>
      )}
      {note ? <p className="text-muted">{note}</p> : null}
    </div>
  );
}
