import { useEffect, useState } from "react";
import { earnVouchers, payVouchers, shareMeal } from "@/game/sim";
import { ReportButton } from "@/world/moderation/ReportButton"; // NDU-UPG 909
import { getBot, isPartner, takeMeal, togglePartner } from "@/world/robotLife";
import { boardRide, RIDE_COST, seatsLeft } from "@/world/transit";

export function RobotCard({ id, onClose }: { id: string; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handle = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(handle);
  }, []);
  const bot = getBot(id);
  if (!bot) return null;
  const partner = isPartner(id);
  return (
    <div className="bg-bg/80 fixed inset-0 z-[640] grid place-items-end p-3 sm:place-items-center" data-tick={tick}>
      <div className="bg-surface w-full max-w-md rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <img src={bot.face} alt="" className="size-16 rounded-2xl object-cover" />
          <div>
            <h2 className="font-display text-2xl">{bot.name}</h2>
            <p className="text-muted text-sm">{bot.phase === "charge" ? "Charging" : bot.job} · kit {bot.kit} · known {bot.known}</p>
          </div>
        </div>
        <p className="mt-3 text-sm">{bot.note}</p>
        <p className="text-muted mt-1 text-sm">
          Pay {bot.purse} game vouchers. Meals set aside {bot.meals}. Energy {Math.round(bot.energy)}.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="bg-accent text-bg min-h-11 flex-1 rounded-full text-sm"
            onClick={() => {
              togglePartner(id);
              setTick((n) => n + 1);
            }}
          >
            {partner ? "Partnered" : "Partner"}
          </button>
          <button
            type="button"
            className="bg-bg min-h-11 flex-1 rounded-full text-sm disabled:opacity-50"
            disabled={!partner || bot.meals < 1}
            onClick={() => {
              if (takeMeal(id)) shareMeal(bot.name);
              setTick((n) => n + 1);
            }}
          >
            Share a meal
          </button>
        </div>
        {bot.vehicle && bot.nextStop ? (
          <button
            type="button"
            className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm"
            onClick={() => {
              if (!bot.nextStop || !bot.vehicle) return;
              if (seatsLeft(bot.vehicle) < 1) return;
              if (!payVouchers("Ride", RIDE_COST)) return;
              if (!boardRide(bot.vehicle, bot.nextStop)) {
                earnVouchers("Ride back", RIDE_COST);
                return;
              }
              onClose();
            }}
          >
            Ride to the next stop · {RIDE_COST}
          </button>
        ) : null}
        {/* NDU-UPG 909 */}
        <ReportButton targetId={id} onBlocked={onClose} />
        <button type="button" className="bg-bg mt-2 min-h-11 w-full rounded-full text-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
