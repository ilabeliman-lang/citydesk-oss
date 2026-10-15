import { useEffect, useRef, useState, type PointerEvent } from "react";

type Piece = { id: string; kind: "audio" | "tattoo"; label: string; mint: "not_minted" };

const KEY = "ndu-j2cs";

function readPieces(): Piece[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (row): row is Piece =>
        Boolean(row && (row.kind === "audio" || row.kind === "tattoo") && typeof row.label === "string" && row.mint === "not_minted"),
    );
  } catch {
    return [];
  }
}

export function J2csRoom({ onLeave }: { onLeave: () => void }) {
  const [opted, setOpted] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState("");
  const drawRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const rec = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    setPieces(readPieces());
  }, []);

  function keep(kind: Piece["kind"], label: string) {
    const next = [{ id: `${kind}-${Date.now()}`, kind, label, mint: "not_minted" as const }, ...readPieces()].slice(0, 12);
    localStorage.setItem(KEY, JSON.stringify(next));
    setPieces(next);
    setNote("Kept on this phone. Not minted.");
  }

  async function toggleRec() {
    if (recording && rec.current) {
      rec.current.stop();
      setRecording(false);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    rec.current = recorder;
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      keep("audio", "Recording");
    };
    recorder.start();
    setRecording(true);
  }

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = drawRef.current;
    if (!canvas || !drawing.current) return;
    const box = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f6efe2";
    ctx.beginPath();
    ctx.arc(event.clientX - box.left, event.clientY - box.top, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface w-full max-w-md rounded-3xl p-4">
        <h2 className="font-display text-2xl">J2CS</h2>
        <p className="text-muted mt-1 text-sm">Open 24 hours. You are the owner of this room. The basement club is coming soon. It is not open.</p>
        <p className="text-muted mt-1 text-sm">Floors on paper: street studio, offices, condos. This is not a tower taller than any real building, and the floors are not built.</p>
        <p className="text-muted mt-1 text-sm">A J2CS tag is on the street you are standing on. That is not a leased room in every city.</p>
        {opted ? null : (
          <button type="button" className="bg-accent text-bg mt-4 min-h-11 w-full rounded-full text-sm" onClick={() => setOpted(true)}>
            Opt in
          </button>
        )}
        {opted ? (
          <div className="mt-4 space-y-3">
            <button type="button" className="bg-bg min-h-11 w-full rounded-full text-sm" onClick={() => void toggleRec().catch(() => setNote("The microphone was blocked."))}>
              {recording ? "Stop and keep" : "Record"}
            </button>
            <canvas
              ref={drawRef}
              width={320}
              height={160}
              className="bg-bg w-full touch-none rounded-2xl"
              onPointerDown={(event) => {
                drawing.current = true;
                paint(event);
              }}
              onPointerMove={paint}
              onPointerUp={() => {
                drawing.current = false;
              }}
            />
            <button type="button" className="bg-bg min-h-11 w-full rounded-full text-sm" onClick={() => keep("tattoo", "Tattoo")}>
              Keep tattoo
            </button>
            <p className="text-muted text-sm">Mint is not on. A kept piece is only a file on this phone.</p>
          </div>
        ) : null}
        <ul className="mt-3 space-y-2">
          {pieces.map((piece) => (
            <li key={piece.id} className="bg-bg rounded-2xl px-3 py-2 text-sm">
              {piece.label} · not minted
            </li>
          ))}
        </ul>
        {note ? <p className="text-muted mt-2 text-sm">{note}</p> : null}
        <button type="button" className="bg-bg mt-4 min-h-11 w-full rounded-full text-sm" onClick={onLeave}>
          Back to the street
        </button>
      </div>
    </div>
  );
}
