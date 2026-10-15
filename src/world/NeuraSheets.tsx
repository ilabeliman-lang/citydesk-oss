/**
 * NEURA wallet (Solana devnet) + NeuraNet Compute desk sheets.
 * Lazy-loaded from WorldMap's "More" panel, inside <SignedIn>. Client-only.
 *
 * This is a REAL-crypto area kept apart from the game: game vouchers never convert
 * to or from any token. Devnet test tokens only — no mainnet, no real funds.
 * The user approves every signature and every transfer in their own wallet.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { NEURA_NET, explorerAddress, explorerTx, shortAddress } from "@/config/neura";
import {
  connectWallet,
  disconnectWallet,
  getSession,
  onWalletsChanged,
  setSession,
  signDevnetTransaction,
  signText,
  solanaWallets,
  subscribeSession,
  type StdWallet,
} from "@/lib/solana/wallet";
import {
  buildHireTransfer,
  cancelHire,
  createHireIntent,
  getComputeDesk,
  getMyWallet,
  getNeuraSetup,
  getWalletNonce,
  linkWallet,
  listMyHires,
  prepareDispatcherJob,
  queueDispatcherJob,
  recheckHire,
  signHireIntent,
  submitHireTransfer,
  unlinkWallet,
  type PublicHire,
} from "@/world/neura";
import { listComputeNodes, offerComputeNode, type PublicNode } from "@/world/nodes";
import { AgentBoard } from "@/world/agents/AgentBoard";

type Setup = Awaited<ReturnType<typeof getNeuraSetup>>;
type MyWallet = Awaited<ReturnType<typeof getMyWallet>>;
type Desk = Awaited<ReturnType<typeof getComputeDesk>>;

function useWalletSession() {
  return useSyncExternalStore(subscribeSession, getSession, () => null);
}

function useWallets(): StdWallet[] {
  const [list, setList] = useState<StdWallet[]>([]);
  useEffect(() => {
    const sync = () => setList(solanaWallets());
    sync();
    return onWalletsChanged(sync);
  }, []);
  return list;
}

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(msg)) return "You declined in the wallet. Nothing was signed.";
  return msg.slice(0, 200) || "Something went wrong.";
}

function Shell({ title, tag, onClose, children }: { title: string; tag: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-bg/80 absolute inset-0 z-[650] grid place-items-end p-3 sm:place-items-center">
      <div className="max-h-[88dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border-2 border-[#5b8def] bg-[#0f1726] p-4 text-[#e8eefc]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-[#8fb0ff]">{tag}</p>
            <h2 className="font-display text-2xl leading-tight">{title}</h2>
          </div>
          <button type="button" className="min-h-11 rounded-xl bg-[#1c2740] px-3 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="rounded-xl bg-[#1c2740] px-3 py-2 text-xs text-[#b9c8ea]">
          Solana <b>devnet</b> only — test tokens with no value, never mainnet. This is separate from game vouchers; nothing in
          the game converts to or from it. You approve every signature and transfer in your own wallet. Ndu never asks for your
          seed phrase or private key.
        </p>
        {children}
      </div>
    </div>
  );
}

const btn = "min-h-11 w-full rounded-full bg-[#1c2740] px-3 text-sm disabled:opacity-50";
const btnMain = "min-h-11 w-full rounded-full bg-[#5b8def] px-3 text-sm font-medium text-[#0f1726] disabled:opacity-50";

// ── wallet connect + link ─────────────────────────────────────────────────

function ConnectBlock({ linked, onLinked }: { linked: string | null; onLinked: () => void }) {
  const wallets = useWallets();
  const session = useWalletSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function connect(w: StdWallet) {
    setBusy(true);
    setMsg("");
    try {
      const account = await connectWallet(w);
      setSession({ wallet: w, account });
    } catch (e) {
      setMsg(errText(e));
    }
    setBusy(false);
  }

  async function prove() {
    if (!session) return;
    setBusy(true);
    setMsg("");
    try {
      const { nonce, message } = await getWalletNonce({ data: { address: session.account.address } });
      const signature = await signText(session.wallet, session.account, message);
      const res = await linkWallet({ data: { address: session.account.address, nonce, signature } });
      setMsg(res.ok ? "Wallet linked to your Ndu account." : res.reason);
      if (res.ok) onLinked();
    } catch (e) {
      setMsg(errText(e));
    }
    setBusy(false);
  }

  if (!session) {
    return (
      <div className="space-y-2">
        {wallets.length ? (
          wallets.map((w) => (
            <button key={w.name} type="button" className={btnMain} disabled={busy} onClick={() => void connect(w)}>
              Connect {w.name}
            </button>
          ))
        ) : (
          <p className="text-sm text-[#b9c8ea]">
            No Solana wallet found in this browser. Install Phantom, then in Phantom turn on <b>Settings → Developer
            settings → Testnet mode</b> (Solana devnet) and reload.
          </p>
        )}
        {msg ? <p className="text-sm">{msg}</p> : null}
      </div>
    );
  }

  const same = linked === session.account.address;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        Connected: <b>{session.wallet.name}</b> · <span className="font-mono">{shortAddress(session.account.address)}</span>
      </p>
      {same ? (
        <p className="text-xs text-[#8fb0ff]">This wallet is linked and verified.</p>
      ) : (
        <button type="button" className={btnMain} disabled={busy} onClick={() => void prove()}>
          {linked ? "Switch link to this wallet · sign (no gas)" : "Sign to prove it's yours · no transaction, no gas"}
        </button>
      )}
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={() => {
          void disconnectWallet(session.wallet);
          setSession(null);
        }}
      >
        Disconnect wallet
      </button>
      {msg ? <p className="text-sm">{msg}</p> : null}
    </div>
  );
}

export function WalletSheet({ onClose }: { onClose: () => void }) {
  const [mine, setMine] = useState<MyWallet | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    void getMyWallet()
      .then(setMine)
      .catch(() => setErr("Could not load your wallet link."));
  }, []);
  useEffect(load, [load]);

  return (
    <Shell title="Wallet" tag="REAL TOKEN AREA · SOLANA DEVNET" onClose={onClose}>
      <ConnectBlock linked={mine?.linked ? mine.address : null} onLinked={load} />
      {mine?.linked ? (
        <div className="space-y-2 rounded-xl bg-[#1c2740] p-3 text-sm">
          <p>
            Linked wallet:{" "}
            <a className="font-mono underline" href={explorerAddress(mine.address)} target="_blank" rel="noreferrer">
              {shortAddress(mine.address)}
            </a>
          </p>
          {mine.rpcOk ? (
            <ul className="space-y-1 text-xs text-[#b9c8ea]">
              <li>SOL (devnet, for fees): {mine.sol ?? "?"}</li>
              {mine.tokens.map((t) => (
                <li key={t.symbol}>
                  {t.label}: {t.amount}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs">Devnet RPC didn't answer. Balances will show when it's back.</p>
          )}
          <p className="text-xs text-[#b9c8ea]">
            Need test tokens? Devnet SOL:{" "}
            <a className="underline" href={NEURA_NET.faucets.sol} target="_blank" rel="noreferrer">
              faucet.solana.com
            </a>{" "}
            · devnet USDC:{" "}
            <a className="underline" href={NEURA_NET.faucets.usdc} target="_blank" rel="noreferrer">
              faucet.circle.com
            </a>{" "}
            (pick Solana Devnet).
          </p>
          <p className="text-xs text-[#b9c8ea]">
            Linking makes this Ndu account associable with the wallet's public on-chain history.
          </p>
          <button
            type="button"
            className={btn}
            onClick={() => {
              void unlinkWallet().then(load);
            }}
          >
            Unlink wallet
          </button>
        </div>
      ) : null}
      {err ? <p className="text-sm">{err}</p> : null}
    </Shell>
  );
}

// ── Compute desk ────────────────────────────────────────────────────────────

const STATUS: Record<string, string> = {
  intent: "Waiting for your intent signature",
  signed: "Intent signed · transfer not sent",
  paid_devnet: "Paid on devnet",
  cancelled: "Cancelled",
};

export function ComputeSheet({ onClose, onOpenWallet }: { onClose: () => void; onOpenWallet: () => void }) {
  const session = useWalletSession();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [mine, setMine] = useState<MyWallet | null>(null);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [hires, setHires] = useState<PublicHire[]>([]);
  const [token, setToken] = useState<"usdc" | "neura">("usdc");
  const [active, setActive] = useState<PublicHire | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    void Promise.all([getNeuraSetup(), getMyWallet(), getComputeDesk(), listMyHires()])
      .then(([s, w, d, h]) => {
        setSetup(s);
        setMine(w);
        setDesk(d);
        setHires(h);
      })
      .catch(() => setMsg("Could not load the Compute desk."));
  }, []);
  useEffect(load, [load]);

  const linked = mine?.linked ? mine.address : null;
  const walletReady = Boolean(session && linked && session.account.address === linked);
  const tokenLabel = setup?.tokens.find((t) => t.key === token)?.symbol ?? "USDC";

  async function run(step: () => Promise<void>) {
    setBusy(true);
    setMsg("");
    try {
      await step();
    } catch (e) {
      setMsg(errText(e));
    }
    setBusy(false);
    void listMyHires().then(setHires).catch(() => undefined);
  }

  const hire = (offerId: string) =>
    run(async () => {
      const res = await createHireIntent({ data: { offerId, token } });
      if (!res.ok) return setMsg(res.reason);
      setActive(res.hire);
    });

  const signIntent = (h: PublicHire) =>
    run(async () => {
      if (!session) return setMsg("Connect your linked wallet first.");
      const signature = await signText(session.wallet, session.account, h.intentMessage);
      const res = await signHireIntent({ data: { id: h.id, signature } });
      if (!res.ok) return setMsg(res.reason);
      setActive(res.hire);
      setMsg("Intent signed. No money moved.");
    });

  const pay = (h: PublicHire) =>
    run(async () => {
      if (!session) return setMsg("Connect your linked wallet first.");
      const built = await buildHireTransfer({ data: { id: h.id } });
      if (!built.ok) return setMsg(built.reason);
      setMsg("Review the devnet transfer in your wallet…");
      const signedTx = await signDevnetTransaction(session.wallet, session.account, built.tx);
      setMsg("Sending your signed transfer to devnet…");
      const res = await submitHireTransfer({ data: { id: h.id, signedTx } });
      setActive(res.hire ?? null);
      setMsg(res.ok ? "Paid on devnet (test tokens)." : res.reason);
    });

  const queueJob = (h: PublicHire) =>
    run(async () => {
      if (!session) return setMsg("Connect your linked wallet first.");
      const prep = await prepareDispatcherJob({ data: { id: h.id } });
      if (!prep.ok) return setMsg(prep.reason);
      const signature = await signText(session.wallet, session.account, prep.message);
      const res = await queueDispatcherJob({ data: { id: h.id, signature } });
      setMsg(res.ok ? `Queued on NeuraNet as job #${res.jobId} (off-chain).` : res.reason);
    });

  return (
    <Shell title="Compute desk" tag="NEURANET · SOLANA DEVNET DEMO" onClose={onClose}>
      {desk ? (
        <div
          className={`rounded-xl px-3 py-2 text-xs ${desk.source === "mock" ? "bg-[#4a2a10] text-[#ffd7a8]" : "bg-[#12351f] text-[#b8f0c8]"}`}
        >
          {desk.sourceNote}
        </div>
      ) : (
        <p className="text-sm">Loading the desk…</p>
      )}
      {desk ? (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-[#1c2740] p-2">
            <p className="text-lg font-semibold">{desk.stats.gpusEnabled}/{desk.stats.gpus}</p>
            <p className="text-[#b9c8ea]">GPU nodes on</p>
          </div>
          <div className="rounded-xl bg-[#1c2740] p-2">
            <p className="text-lg font-semibold">{desk.stats.agents}</p>
            <p className="text-[#b9c8ea]">agents</p>
          </div>
          <div className="rounded-xl bg-[#1c2740] p-2">
            <p className="text-lg font-semibold">{(desk.stats.feeBps / 100).toFixed(1)}%</p>
            <p className="text-[#b9c8ea]">fee (planned)</p>
          </div>
        </div>
      ) : null}

      <NodeBoard />
      <AgentBoard />

      {!linked ? (
        <div className="space-y-2 rounded-xl bg-[#1c2740] p-3 text-sm">
          <p>Link a Solana wallet to hire. It's one signature, no gas.</p>
          <button type="button" className={btnMain} onClick={onOpenWallet}>
            Open wallet
          </button>
        </div>
      ) : !walletReady ? (
        <div className="space-y-2 rounded-xl bg-[#1c2740] p-3 text-sm">
          <p>
            Your linked wallet is <span className="font-mono">{shortAddress(linked)}</span>. Connect it in this browser to sign.
          </p>
          <ConnectBlock linked={linked} onLinked={load} />
        </div>
      ) : null}

      {setup && setup.tokens.length > 1 ? (
        <div className="flex gap-2">
          {setup.tokens.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`min-h-10 flex-1 rounded-full text-xs ${token === t.key ? "bg-[#5b8def] text-[#0f1726]" : "bg-[#1c2740]"}`}
              onClick={() => setToken(t.key === "neura" ? "neura" : "usdc")}
            >
              Pay in {t.label}
            </button>
          ))}
        </div>
      ) : null}
      {setup && !setup.payee ? (
        <p className="rounded-xl bg-[#4a2a10] px-3 py-2 text-xs text-[#ffd7a8]">
          No devnet payee is set yet, so hires stop after the signed intent. The devnet transfer step turns on once a devnet
          payee address is configured.
        </p>
      ) : null}

      {active && active.status !== "paid_devnet" && active.status !== "cancelled" ? (
        <HireSteps
          hire={active}
          busy={busy}
          canSign={walletReady}
          payeeSet={Boolean(setup?.payee)}
          onSign={() => void signIntent(active)}
          onPay={() => void pay(active)}
          onCancel={() =>
            void run(async () => {
              await cancelHire({ data: { id: active.id } });
              setActive(null);
            })
          }
        />
      ) : null}
      {msg ? <p className="text-sm">{msg}</p> : null}

      {desk ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-widest text-[#8fb0ff]">GPU RENTAL & JOBS</p>
          {desk.catalog.map((c) => (
            <Offer key={c.id} name={c.name} detail={c.detail} price={`${c.price} ${tokenLabel}`} disabled={busy || !linked} onHire={() => void hire(c.id)} />
          ))}
          <p className="pt-1 text-xs font-semibold tracking-widest text-[#8fb0ff]">
            AGENTS {desk.source === "mock" ? "(MOCK)" : "(DISPATCHER)"}
          </p>
          {desk.agents.length ? (
            desk.agents.map((a) => (
              <Offer
                key={a.id}
                name={a.name}
                detail={`${a.discipline ? `${a.discipline} · ` : ""}${a.description}`}
                price={`${a.price} ${tokenLabel}/call`}
                disabled={busy || !linked}
                onHire={() => void hire(a.id)}
              />
            ))
          ) : (
            <p className="text-xs text-[#b9c8ea]">No agents listed on the dispatcher yet.</p>
          )}
        </div>
      ) : null}

      {hires.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-widest text-[#8fb0ff]">YOUR HIRES</p>
          {hires.map((h) => (
            <div key={h.id} className="space-y-1 rounded-xl bg-[#1c2740] p-3 text-xs">
              <p className="text-sm">{h.offerName}</p>
              <p className="text-[#b9c8ea]">
                {h.amount} {h.token.toUpperCase()} (devnet) · {STATUS[h.status] ?? h.status}
              </p>
              {h.note ? <p className="text-[#b9c8ea]">{h.note}</p> : null}
              {h.dispatcherJobId ? (
                <p className="text-[#b8f0c8]">
                  NeuraNet job #{h.dispatcherJobId} · {h.dispatcherStatus ?? "status unavailable"}
                </p>
              ) : null}
              {h.txSignature ? (
                <a className="underline" href={explorerTx(h.txSignature)} target="_blank" rel="noreferrer">
                  View on Solana Explorer (devnet)
                </a>
              ) : null}
              <div className="flex gap-2">
                {h.status === "intent" || h.status === "signed" ? (
                  <button type="button" className="min-h-9 rounded-full bg-[#2a3a5e] px-3" onClick={() => setActive(h)}>
                    Continue
                  </button>
                ) : null}
                {h.status === "paid_devnet" && !h.dispatcherJobId && setup?.dispatcherConfigured ? (
                  <button
                    type="button"
                    className="min-h-9 rounded-full bg-[#5b8def] px-3 text-[#0f1726] disabled:opacity-50"
                    disabled={busy || !walletReady}
                    onClick={() => void queueJob(h)}
                  >
                    Queue on NeuraNet · sign (no gas)
                  </button>
                ) : null}
                {h.txSignature && h.status !== "paid_devnet" ? (
                  <button
                    type="button"
                    className="min-h-9 rounded-full bg-[#2a3a5e] px-3"
                    onClick={() =>
                      void run(async () => {
                        const r = await recheckHire({ data: { id: h.id } });
                        setMsg(r.ok ? "Confirmed on devnet." : r.reason);
                      })
                    }
                  >
                    Re-check devnet
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Shell>
  );
}

function Offer({ name, detail, price, disabled, onHire }: { name: string; detail: string; price: string; disabled: boolean; onHire: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[#1c2740] p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{name}</p>
        <p className="text-xs text-[#b9c8ea]">{detail}</p>
        <p className="text-xs text-[#8fb0ff]">{price} · devnet test token</p>
      </div>
      <button type="button" className="min-h-10 shrink-0 rounded-full bg-[#5b8def] px-4 text-sm text-[#0f1726] disabled:opacity-50" disabled={disabled} onClick={onHire}>
        Hire
      </button>
    </div>
  );
}

function HireSteps({
  hire,
  busy,
  canSign,
  payeeSet,
  onSign,
  onPay,
  onCancel,
}: {
  hire: PublicHire;
  busy: boolean;
  canSign: boolean;
  payeeSet: boolean;
  onSign: () => void;
  onPay: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-[#5b8def] p-3 text-sm">
      <p className="font-medium">
        Hire: {hire.offerName} · {hire.amount} {hire.token.toUpperCase()} (devnet)
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-[#b9c8ea]">
        <li className={hire.intentSigned ? "line-through" : ""}>Sign the hire intent in your wallet (a message — no gas, nothing moves).</li>
        <li>Review and approve the devnet transfer in your wallet. Ndu sends it to devnet only after you sign.</li>
      </ol>
      {!hire.intentSigned ? (
        <button type="button" className={btnMain} disabled={busy || !canSign} onClick={onSign}>
          1 · Sign hire intent (no gas)
        </button>
      ) : (
        <button type="button" className={btnMain} disabled={busy || !canSign || !payeeSet} onClick={onPay}>
          2 · Approve devnet transfer in wallet
        </button>
      )}
      <button type="button" className={btn} disabled={busy} onClick={onCancel}>
        Cancel this hire
      </button>
    </div>
  );
}

function NodeBoard() {
  const [nodes, setNodes] = useState<PublicNode[]>([]);
  const [label, setLabel] = useState("");
  const [vram, setVram] = useState("8");
  const [note, setNote] = useState<string | null>(null);
  const load = () => { void listComputeNodes().then((r) => setNodes(r.nodes)).catch(() => undefined); };
  useEffect(load, []);
  return (
    <div className="space-y-2 rounded-xl bg-[#1c2740] p-3 text-sm">
      <p className="font-medium">Offer this machine</p>
      <p className="text-xs text-[#b9c8ea]">Devnet listing only. City Desk cannot see your laptop. A listing does not pay you. A hire is still a transfer you sign yourself. Mainnet is off.</p>
      <ul className="space-y-1 text-xs">
        {nodes.length === 0 ? <li>No machines offered yet.</li> : null}
        {nodes.map((n) => <li key={n.id}>{n.label} · {n.kind}{n.vramGb ? ` · ${n.vramGb} GB` : ""}</li>)}
      </ul>
      <div className="flex gap-2">
        <input aria-label="Machine name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" className="h-9 min-w-0 flex-1 rounded-full bg-black/30 px-3" />
        <input aria-label="Memory in gigabytes" value={vram} onChange={(e) => setVram(e.target.value)} className="h-9 w-16 rounded-full bg-black/30 px-2 text-center" />
        <button type="button" className="h-9 rounded-full bg-[#5b8def] px-3 text-[#0b1220]" onClick={() => {
          void offerComputeNode({ data: { label, kind: "gpu", vramGb: Number(vram) || 0 } }).then((r) => {
            setNote(r.ok ? "Listed on devnet. No payment was sent." : r.reason);
            if (r.ok) { setLabel(""); load(); }
          }).catch((e) => setNote(errText(e)));
        }}>Offer</button>
      </div>
      {note ? <p className="text-xs">{note}</p> : null}
    </div>
  );
}
