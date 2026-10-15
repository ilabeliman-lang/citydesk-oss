/**
 * NDU-AI safe ingest: feature flags (isomorphic, dependency-free).
 *
 * Defaults follow the track brief: privacy work that never blocks anyone is ON, the NSFW gate is ON,
 * and anything that could stop a legitimate user (hard dedupe blocks, holding listings for review,
 * the server-side NSFW re-check, removing scan "floaters") is OFF until Wei switches it on.
 *
 * Server: env `INGEST_<NAME>=on|off` (e.g. INGEST_DEDUPE_BLOCK=on).
 * Client: `?ingest-<name>=on|off` once (remembered on this phone) for QA; defaults otherwise.
 */
export const INGEST_FLAGS = {
  /** Strip EXIF/GPS/XMP/IPTC/comments/trailing data from every uploaded image (client + server). */
  stripMeta: { default: true, env: "INGEST_STRIP_META", blocks: false },
  /** Perceptual-hash (pHash) every image and flag re-uploads of the same picture. Flags only. */
  dedupe: { default: true, env: "INGEST_DEDUPE", blocks: false },
  /** Refuse an image whose pHash matches someone else's evidence (instead of just flagging it). */
  dedupeBlock: { default: false, env: "INGEST_DEDUPE_BLOCK", blocks: true },
  /** On-device NSFW gate before a photo leaves the phone. */
  nsfwGate: { default: true, env: "INGEST_NSFW_GATE", blocks: true },
  /** On-device face detection; offers (never forces) a blur for bystanders. */
  faceBlur: { default: true, env: "INGEST_FACE_BLUR", blocks: false },
  /** Server re-runs the NSFW model on CPU (needs INGEST_NSFW_MODEL_PATH on the server). */
  nsfwServer: { default: false, env: "INGEST_NSFW_SERVER", blocks: true },
  /** Scam / impersonation check on listing + claim text. Flags for review only, never bans. */
  scamFlag: { default: true, env: "INGEST_SCAM_FLAG", blocks: false },
  /** Hold "high" scam scores out of view until a reviewer clears them. */
  scamHold: { default: false, env: "INGEST_SCAM_HOLD", blocks: true },
} as const;

export type IngestFlag = keyof typeof INGEST_FLAGS;
export type IngestFlags = Record<IngestFlag, boolean>;

const ON = new Set(["1", "on", "true", "yes"]);
const OFF = new Set(["0", "off", "false", "no"]);

export function parseSwitch(v: string | null | undefined): boolean | null {
  const s = (v ?? "").trim().toLowerCase();
  if (ON.has(s)) return true;
  if (OFF.has(s)) return false;
  return null;
}

export function defaultFlags(): IngestFlags {
  const out = {} as IngestFlags;
  for (const k of Object.keys(INGEST_FLAGS) as IngestFlag[]) out[k] = INGEST_FLAGS[k].default;
  return out;
}

/** Server flags from an env object (process.env in prod, a plain object in tests). */
export function serverFlags(env: Record<string, string | undefined>): IngestFlags {
  const out = defaultFlags();
  for (const k of Object.keys(INGEST_FLAGS) as IngestFlag[]) {
    const v = parseSwitch(env[INGEST_FLAGS[k].env]);
    if (v !== null) out[k] = v;
  }
  return out;
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const STORE_KEY = "ndu.ingest.flags.v1";

type Store = Pick<Storage, "getItem" | "setItem">;

/** Client flags: defaults, then remembered QA overrides, then `?ingest-x=on|off` (which is remembered). */
export function clientFlags(search: string, store?: Store | null): IngestFlags {
  const out = defaultFlags();
  let saved: Partial<IngestFlags> = {};
  try {
    saved = JSON.parse(store?.getItem(STORE_KEY) ?? "{}") as Partial<IngestFlags>;
  } catch {
    saved = {};
  }
  const q = new URLSearchParams(search);
  let changed = false;
  for (const k of Object.keys(INGEST_FLAGS) as IngestFlag[]) {
    if (typeof saved[k] === "boolean") out[k] = saved[k] as boolean;
    const v = parseSwitch(q.get(`ingest-${kebab(k)}`));
    if (v !== null) {
      out[k] = v;
      saved[k] = v;
      changed = true;
    }
  }
  if (changed) {
    try {
      store?.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      // private mode: applies to this visit only
    }
  }
  return out;
}
