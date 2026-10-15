import { useEffect, useState } from "react";

const KEY = "ndu-bag";

function readBag(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function CarRoom({ onLeave, onDrive }: { onLeave: () => void; onDrive: () => void }) {
  const [boot, setBoot] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    setItems(readBag());
  }, [boot]);

  function honk() {
    const ctx = new AudioContext();
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    tone.frequency.value = 440;
    gain.gain.value = 0.08;
    tone.connect(gain);
    gain.connect(ctx.destination);
    tone.start();
    window.setTimeout(() => {
      tone.stop();
      void ctx.close();
    }, 180);
  }

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface w-full max-w-md rounded-3xl p-4">
        <h2 className="font-display text-2xl">Your car</h2>
        <p className="text-muted mt-1 text-sm">You are in the seat. The street is outside the glass.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" className="bg-bg min-h-16 rounded-2xl text-sm" onClick={honk}>
            Honk
          </button>
          <button type="button" className="bg-bg min-h-16 rounded-2xl text-sm" onClick={() => setBoot((open) => !open)}>
            Boot
          </button>
          <button type="button" className="bg-accent text-bg min-h-16 rounded-2xl text-sm" onClick={onDrive}>
            Drive
          </button>
        </div>
        {boot ? (
          <ul className="mt-3 space-y-2">
            {items.length ? null : <li className="text-muted text-sm">The boot is empty. Put things in the bag first.</li>}
            {items.map((item, index) => (
              <li key={`${item}-${index}`} className="bg-bg rounded-2xl px-3 py-2 text-sm">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="bg-bg mt-4 min-h-11 w-full rounded-full text-sm" onClick={onLeave}>
          Get out
        </button>
      </div>
    </div>
  );
}
