import { COMING_SOON } from "@/world/comingSoon";

export function ComingSoonSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-[720] grid place-items-end bg-black/40 p-3 sm:place-items-center">
      <div className="ndu-es-card max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-surface p-4 text-fg" role="dialog" aria-labelledby="coming-soon-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="coming-soon-title" className="font-display text-2xl">Coming soon</h2>
          <button type="button" className="min-h-11 rounded-full px-3 text-sm" onClick={onClose}>Close</button>
        </div>
        <p className="text-muted mb-3 text-xs">These are waiting on a decision or a cost. They are not on this map yet.</p>
        <ul className="space-y-3">
          {COMING_SOON.map((item) => (
            <li key={item.id} className="border-t border-white/10 pt-3">
              <p className="text-sm font-medium">{item.title} <span className="text-accent text-xs">Coming soon</span></p>
              <p className="text-muted text-xs">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
