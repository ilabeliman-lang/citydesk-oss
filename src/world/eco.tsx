import { useEffect, useState } from "react";
import { getBots, getYard, helpYard, purseLog, type Bot, type Yard } from "@/world/robotLife";

export function EcoRoom({ onLeave }: { onLeave: () => void }) {
  const [yard, setYard] = useState<Yard>(getYard());
  const [bots, setBots] = useState<Bot[]>(getBots());
  const [lines, setLines] = useState<string[]>(purseLog());
  useEffect(() => {
    const id = window.setInterval(() => {
      setYard({ ...getYard() });
      setBots(getBots().map((bot) => ({ ...bot })));
      setLines(purseLog());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="bg-bg/80 absolute inset-0 z-[600] grid place-items-end p-3 sm:place-items-center">
      <div className="bg-surface w-full max-w-md rounded-3xl p-4">
        <h2 className="font-display text-2xl">Yard</h2>
        <p className="text-muted mt-1 text-sm">Ada sweeps. Eko feeds power. Gba tends the green. Nuru repairs. Sade guides. They charge when they run low, and the yard slips until they work again.</p>
        <ul className="mt-3 space-y-2">
          {(
            [
              ["Power", yard.power],
              ["Clean", yard.clean],
              ["Green", yard.green],
            ] as const
          ).map(([label, value]) => (
            <li key={label} className="bg-bg rounded-2xl px-3 py-2 text-sm">
              {label} · {Math.round(value)}
            </li>
          ))}
        </ul>
        <h3 className="font-display mt-4 text-lg">Crew</h3>
        <p className="text-muted text-xs">All seven work on the same beat. Nobody waits for the others to finish.</p>
        <ul className="mt-3 space-y-2">
          {bots.map((bot) => (
            <li key={bot.id} className="text-sm">
              {bot.name} · {bot.phase === "charge" ? "charging" : bot.job} · kit {bot.kit} · {bot.purse} pay · {bot.meals} meals
              <span className="text-muted block text-xs">{bot.note}</span>
            </li>
          ))}
        </ul>
        {lines.length ? (
          <>
            <h3 className="font-display mt-4 text-lg">Last purse lines</h3>
            <ul className="mt-2 space-y-1">
              {lines.map((line, index) => (
                <li key={index} className="text-muted text-xs">
                  {line}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <button
          type="button"
          className="bg-accent text-bg mt-4 min-h-11 w-full rounded-full text-sm"
          onClick={() => {
            helpYard();
            setYard({ ...getYard() });
          }}
        >
          Help them
        </button>
        <button type="button" className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm" onClick={onLeave}>
          Back to the street
        </button>
      </div>
    </div>
  );
}
