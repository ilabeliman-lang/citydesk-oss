import { useEffect, useMemo, useState } from "react";
import { META_LABEL } from "@/lib/ingest/imageMeta";
import type { Box } from "@/lib/ingest/vision";
import { tapBuzz } from "@/world/bubbles/mode";
import { finishPhoto, inspectPhoto, type Inspection, type Stage } from "./safePhoto";
import "@/world/bubbles/bubbles.css";
import "./ingest.css";

export type SafePhotoSummary = {
  removed: string[];
  facesBlurred: number;
  phash: string;
  note: string | null;
};

type Props = {
  file: File;
  /** Size budget for the finished JPEG (e.g. the room card keeps photos on the phone, so it's small). */
  maxBytes?: number;
  maxSide?: number;
  onDone: (photo: Blob, summary: SafePhotoSummary) => void;
  onCancel: () => void;
};

/**
 * NDU-AI safe ingest #1/#2: the embossed "checking your photo" sheet. Shows what metadata comes off, blocks clear
 * adult content, and offers a blur for every face it finds (all on by default; tap a face to keep it sharp).
 * Lazy-loaded: nothing here (or onnxruntime) is in the map's first download.
 */
export default function SafePhotoSheet({ file, maxBytes, maxSide, onDone, onCancel }: Props) {
  const [stage, setStage] = useState<Stage>({ stage: "reading" });
  const [ins, setIns] = useState<Inspection | null>(null);
  const [err, setErr] = useState("");
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (ins ? ins.canvas.toDataURL("image/jpeg", 0.7) : ""), [ins]);

  useEffect(() => {
    let live = true;
    setIns(null);
    setErr("");
    setKeep(new Set());
    setBusy(false);
    setStage({ stage: "reading" });
    inspectPhoto(file, (s) => live && setStage(s))
      .then((r) => live && setIns(r))
      .catch(
        (e: unknown) =>
          live && setErr(e instanceof Error ? e.message : "That photo can't be opened."),
      );
    return () => {
      live = false;
    };
  }, [file]);

  const blur: Box[] = ins ? ins.faces.filter((_, i) => !keep.has(i)) : [];

  async function use() {
    if (!ins) return;
    tapBuzz();
    setBusy(true);
    try {
      const blob = await finishPhoto(ins, blur, { maxBytes, maxSide });
      onDone(blob, {
        removed: ins.removed.map((k) => META_LABEL[k]),
        facesBlurred: blur.length,
        phash: ins.phash,
        note: ins.gate.note,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the photo.");
      setBusy(false);
    }
  }

  const pct =
    stage.stage === "model" && stage.total
      ? Math.min(100, Math.round(((stage.loaded ?? 0) / stage.total) * 100))
      : null;
  const blocked = ins && !ins.gate.allow;

  return (
    <div
      className="ndu-ingest-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Checking your photo"
    >
      <div className={`ndu-ingest-sheet${blocked ? " is-blocked" : ""}`}>
        <div className="ndu-ingest-head">
          <span
            className={`ndu-bub ndu-bub--sm ndu-ingest-orb${ins ? "" : " is-busy"}`}
            aria-hidden="true"
          >
            {blocked ? "✕" : ins ? "✓" : "◌"}
          </span>
          <div>
            <h2 className="font-display text-xl">
              {blocked ? "Pick another photo" : ins ? "Photo checked" : "Checking your photo"}
            </h2>
            <p className="text-muted text-xs">
              Checked on this phone. Nothing is sent until you tap Use photo.
            </p>
          </div>
        </div>

        {!ins && !err ? (
          <div className="ndu-ingest-wait">
            <p className="text-sm">
              {stage.stage === "model"
                ? "Getting the safety check ready (first time only)…"
                : stage.stage === "checking"
                  ? "Looking at the photo…"
                  : "Opening the photo…"}
            </p>
            {pct !== null ? (
              <div className="ndu-ingest-bar" aria-label={`${pct}%`}>
                <span style={{ width: `${pct}%` }} />
              </div>
            ) : (
              <div className="ndu-ingest-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>
        ) : null}

        {ins ? (
          <>
            <div
              className="ndu-ingest-frame"
              style={{ aspectRatio: `${ins.width} / ${ins.height}` }}
            >
              <img src={preview} alt="Your photo" className={blocked ? "is-hidden" : ""} />
              {!blocked
                ? ins.faces.map((f, i) => {
                    const kept = keep.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`ndu-ingest-face${kept ? " is-kept" : ""}`}
                        style={{
                          left: `${(f.x / ins.width) * 100}%`,
                          top: `${(f.y / ins.height) * 100}%`,
                          width: `${(f.w / ins.width) * 100}%`,
                          height: `${(f.h / ins.height) * 100}%`,
                          animationDelay: `${i * 70}ms`,
                        }}
                        aria-pressed={!kept}
                        aria-label={
                          kept
                            ? `Face ${i + 1} stays sharp. Tap to blur`
                            : `Face ${i + 1} will be blurred. Tap to keep it sharp`
                        }
                        onClick={() => {
                          tapBuzz();
                          setKeep((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          });
                        }}
                      />
                    );
                  })
                : null}
            </div>
            <ul className="ndu-ingest-chips">
              {blocked ? <li className="ndu-ingest-chip is-bad">{ins.gate.reason}</li> : null}
              {!blocked && ins.removed.length ? (
                <li className="ndu-ingest-chip is-good">
                  Removed: {[...new Set(ins.removed.map((k) => META_LABEL[k]))].join(", ")}
                </li>
              ) : null}
              {!blocked && !ins.removed.length && ins.flags.stripMeta ? (
                <li className="ndu-ingest-chip is-good">No hidden location or camera details</li>
              ) : null}
              {!blocked && ins.faces.length ? (
                <li className="ndu-ingest-chip">
                  {blur.length
                    ? `${blur.length} face${blur.length === 1 ? "" : "s"} will be blurred`
                    : "No faces blurred"}{" "}
                  · tap a face to change
                </li>
              ) : null}
              {ins.gate.note ? <li className="ndu-ingest-chip is-warn">{ins.gate.note}</li> : null}
            </ul>
          </>
        ) : null}

        {err ? <p className="ndu-ingest-chip is-bad mt-3">{err}</p> : null}

        <div className="ndu-ingest-actions">
          <button type="button" className="ndu-ingest-btn" onClick={onCancel}>
            Pick another
          </button>
          {!blocked ? (
            <button
              type="button"
              className="ndu-ingest-btn is-primary"
              disabled={!ins || busy || Boolean(err)}
              onClick={() => void use()}
            >
              {busy ? "Saving…" : "Use photo"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
