import { useEffect, useState } from "react";
import { REGISTRY_URL, registryLink, registryMe, registryNearby, registryUnlink, type RegistryMe } from "@/world/registry";

type Near = { id: number; label: string; kind: string; icon: string; verified: boolean; lat: number; lng: number };

/** "Places & Claims": the City Desk Map Registry for the signed-in user, via the server-side Spaces bridge. */
export function PlacesPanel({ at, onClose, onGo }: { at: { lat: number; lng: number }; onClose: () => void; onGo: (p: { id: string; name: string; lat: number; lng: number }) => void }) {
  const [me, setMe] = useState<RegistryMe | null>(null);
  const [near, setNear] = useState<Near[]>([]);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => {
    void registryMe().then(setMe).catch(() => setMe({ ok: false, linked: false, error: "Registry is unreachable right now." }));
    void registryNearby({ data: at }).then((rows) => setNear(rows as Near[])).catch(() => setNear([]));
  };
  useEffect(load, [at.lat, at.lng]);
  async function link() {
    setMsg("");
    try {
      const r = await registryLink({ data: { code } });
      setMsg(r.ok ? `Linked to Spaces as ${r.handle}.` : r.error || "Could not link.");
      if (r.ok) load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not link.");
    }
  }
  return (
    <div className="absolute inset-x-0 bottom-0 z-[700] flex justify-center p-3">
      <div className="bg-surface text-fg max-h-[75vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="font-display text-xl">Places &amp; Claims</p>
          <button type="button" className="bg-bg min-h-10 rounded-full px-3 text-sm" onClick={onClose}>Close</button>
        </div>
        {!me ? <p className="text-muted text-sm">Loading…</p> : null}
        {me && !me.linked ? (
          <div className="space-y-2">
            <p className="text-muted text-sm">{me.error || "Link your Spaces account to see your trips, claims and verified places here. On the registry page, tap “Get City Desk link code”, then enter it below."}</p>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="8-character code" maxLength={8} className="bg-bg min-h-10 flex-1 rounded-full px-3 text-sm uppercase" />
              <button type="button" className="bg-accent text-bg min-h-10 rounded-full px-3 text-sm" onClick={() => void link()}>Link</button>
            </div>
          </div>
        ) : null}
        {me?.linked ? (
          <div className="space-y-2 text-sm">
            <p>Linked to Spaces as <b>{me.handle}</b>. <button type="button" className="text-muted underline" onClick={() => void registryUnlink().then(load)}>Unlink</button></p>
            <p className="font-medium">My places</p>
            {me.owned?.length ? me.owned.map((p) => (
              <button key={p.id} type="button" className="bg-bg block min-h-10 w-full rounded-full px-3 text-left" onClick={() => onGo({ id: `reg-${p.id}`, name: p.label, lat: p.lat, lng: p.lng })}>✅ {p.label} · {p.kind}</button>
            )) : <p className="text-muted">No verified places yet.</p>}
            <p className="font-medium">My claims</p>
            {me.claims?.length ? me.claims.map((c) => <p key={c.id} className="text-muted">#{c.id} {c.label} · {c.status}</p>) : <p className="text-muted">No claims.</p>}
            <p className="font-medium">My trips</p>
            {me.trips?.length ? me.trips.map((t) => <p key={t.id} className="text-muted">{t.title} · {t.mode} · {t.status} ({t.current_stop + 1}/{t.n_stops})</p>) : <p className="text-muted">No trips. Plan one on the registry page; your avatar moves along it here.</p>}
          </div>
        ) : null}
        {msg ? <p className="text-sm">{msg}</p> : null}
        <div className="space-y-1">
          <p className="text-sm font-medium">Registry places nearby</p>
          {near.length ? near.slice(0, 12).map((p) => (
            <button key={p.id} type="button" className="bg-bg block min-h-9 w-full truncate rounded-full px-3 text-left text-sm" onClick={() => onGo({ id: `reg-${p.id}`, name: p.label, lat: p.lat, lng: p.lng })}>
              {p.icon} {p.label}{p.verified ? " · verified" : ""}
            </button>
          )) : <p className="text-muted text-sm">No registry places imported around here yet.</p>}
          <p className="text-muted text-xs">Labels © OpenStreetMap contributors (ODbL) or owner-verified. Google Places is off.</p>
        </div>
        <a href={REGISTRY_URL} target="_blank" rel="noreferrer" className="bg-accent text-bg grid min-h-11 w-full place-items-center rounded-full text-sm font-medium">
          Open the registry: claim a place, plan a trip
        </a>
        <p className="text-muted text-xs">The registry opens in the office (office login + Spaces login).</p>
      </div>
    </div>
  );
}
