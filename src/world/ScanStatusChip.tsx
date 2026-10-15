import { AlertTriangle, Box, CheckCircle2, ChevronRight, Clock, Download, Hash, Loader2, Ruler, RotateCcw, Triangle } from "lucide-react";
import type { ScanAsset, ScanStatus } from "@/world/scans";
import "./scan-pipeline.css";

/**
 * NDU-UPG #352 #383 #389 #391: a scan row's pipeline state as an embossed chip
 * (stored -> queued -> converting -> ready | failed + reason), budget-coloured facts,
 * Retry and the owner's original download (#356).
 */
const LABEL: Record<ScanStatus, string> = {
  stored: "Stored",
  queued: "Queued",
  converting: "Converting",
  ready: "Ready in 3D",
  failed: "Not drawn",
};

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function tone(value: number, budget: number): "ok" | "warn" | "over" {
  return value <= budget * 0.5 ? "ok" : value <= budget ? "warn" : "over";
}

export function ScanStatusChip({ scan, onRetry, onRaw }: { scan: ScanAsset; onRetry: () => void; onRaw: () => void }) {
  const status: ScanStatus = scan.status ?? "stored";
  const Icon = status === "ready" ? CheckCircle2 : status === "failed" ? AlertTriangle : status === "stored" ? Box : status === "queued" ? Clock : Loader2;
  const busy = status === "queued" || status === "converting";
  const stats = scan.stats;
  return (
    <div className="mt-1" data-scan-status={status}>
      <span className={`ndu-chip ndu-chip--${status}`} role="status" aria-live="polite" aria-label={`Scan status: ${LABEL[status]}`}>
        <Icon aria-hidden />
        {LABEL[status]}
        {status === "converting" && scan.format === "usdz" ? " USDZ → GLB" : null}
      </span>
      {busy ? (
        <span className={`ndu-chip-bar ${status === "queued" ? "ndu-chip-bar--queued" : ""}`} aria-hidden>
          <i />
        </span>
      ) : null}
      {status === "queued" && scan.statusReason ? <p className="text-muted mt-1">{scan.statusReason}</p> : null}
      {status === "ready" && stats ? (
        <div className="ndu-badges" aria-label="Model facts">
          <span className={`ndu-badge ndu-badge--${tone(stats.after.tris, stats.budget)}`} title={`Budget for a ${stats.preset}: ${stats.budget.toLocaleString()} triangles`}>
            <Triangle aria-hidden />
            {stats.after.tris.toLocaleString()} tris{stats.simplified ? " (simplified)" : ""}
          </span>
          <span className={`ndu-badge ndu-badge--${tone(stats.after.bytes, 16 * 1048576)}`} title="Original → optimised size">
            {kb(stats.before.bytes)} → {kb(stats.after.bytes)}
          </span>
          <span className="ndu-badge" title="Real-world size after unit fixes (width × depth × height)">
            <Ruler aria-hidden />
            {stats.size[0].toFixed(1)}×{stats.size[2].toFixed(1)}×{stats.size[1].toFixed(1)} m
          </span>
          <span className="ndu-badge" title="Materials · textures">
            {stats.after.materials} mat · {stats.after.textures} tex
          </span>
          {scan.sha256 ? (
            <span className="ndu-badge" title={`sha256 of your original: ${scan.sha256}`}>
              <Hash aria-hidden />
              {scan.sha256.slice(0, 8)}
            </span>
          ) : null}
        </div>
      ) : null}
      {status === "failed" ? (
        <div className="ndu-scan-error" role="alert">
          <p>{scan.statusReason || "This file could not be prepared for the map."}</p>
          <div className="mt-1.5 flex gap-2">
            <button type="button" className="ndu-push" onClick={onRetry} aria-label={`Try ${scan.name} again`}>
              <RotateCcw aria-hidden />
              Retry
            </button>
            <button type="button" className="ndu-push" onClick={onRaw} aria-label={`Download the original ${scan.name}`}>
              <Download aria-hidden />
              Original
            </button>
          </div>
        </div>
      ) : status === "ready" ? (
        <button type="button" className="ndu-push mt-1.5" onClick={onRaw} aria-label={`Download the original ${scan.name}`}>
          <Download aria-hidden />
          Original
        </button>
      ) : null}
    </div>
  );
}

/** NDU-UPG #375 #376: which export settings work, per scanning app. */
export function ScanHelp() {
  return (
    <details className="ndu-help bg-bg rounded-xl px-2">
      <summary>
        <ChevronRight aria-hidden />
        Which export settings work?
      </summary>
      <ul className="text-muted list-disc space-y-1 pb-2 pl-4">
        <li>Polycam: Export → GLB (Medium or Full). Rooms: “Room” mode, GLB.</li>
        <li>Scaniverse: Share → Export model → GLB, or USDZ. Splats: SPZ/PLY are stored and pinned.</li>
        <li>RealityScan / Luma: GLB. Luma splats: PLY (pinned for now).</li>
        <li>iPhone RoomPlan &amp; Object Capture: USDZ. We convert it to GLB for the map.</li>
        <li>Keep it in metres, Y-up. We fix Z-up and centimetres for USDZ, centre it on the floor, and shrink big scans.</li>
      </ul>
    </details>
  );
}
