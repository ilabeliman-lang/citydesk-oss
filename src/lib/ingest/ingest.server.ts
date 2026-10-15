/**
 * NDU-AI safe ingest #1/#2, server side (Node CPU). Every uploaded image is stripped again here no matter what the
 * phone did (a modified client can skip its own strip), perceptual-hashed, and checked against earlier evidence.
 * Optional (OFF by default): a CPU re-run of the NSFW model.
 *
 * Storage: no DB migration. The pHash index is an append-only JSONL file beside the evidence store
 * (`<evidence dir>/.ingest/phash.jsonl`, mode 0600) holding only {hash, evidence id, item id, user id, time}.
 * Shredding evidence removes its line (`forgetEvidence`), so a deleted photo stops matching.
 */
import { appendFile, chmod, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { serverFlags, type IngestFlags } from "./flags.ts";
import { stripImageMetadata, type MetaKind } from "./imageMeta.ts";
import {
  dedupeVerdict,
  findMatches,
  isPhash,
  phash32,
  resizeGray,
  type DedupeVerdict,
  type PhashEntry,
} from "./phash.ts";

export class IngestRejected extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export const ingestFlags = (): IngestFlags => serverFlags(process.env);

/** pHash on the server: sharp decodes (honouring orientation), we do the resize + DCT so both sides agree. */
export async function phashImage(bytes: Uint8Array): Promise<string> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(bytes, { failOn: "error" })
    .rotate()
    .removeAlpha()
    .greyscale()
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return phash32(resizeGray(data, info.width, info.height));
}

const indexFile = (dir: string) => path.join(dir, ".ingest", "phash.jsonl");
const g = globalThis as typeof globalThis & { __nduIngestLock__?: Promise<unknown> };

/** Serialise index writes inside this process (the web server runs one Node process per checkout). */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const prev = g.__nduIngestLock__ ?? Promise.resolve();
  const next = prev.then(fn, fn);
  g.__nduIngestLock__ = next.catch(() => undefined);
  return next;
}

export async function readIndex(dir: string): Promise<PhashEntry[]> {
  let text = "";
  try {
    text = await readFile(indexFile(dir), "utf8");
  } catch {
    return [];
  }
  const out: PhashEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as PhashEntry;
      if (isPhash(e.h) && typeof e.id === "string") out.push(e);
    } catch {
      // a torn last line after a crash: skip it
    }
  }
  return out;
}

export function rememberEvidence(dir: string, entry: PhashEntry): Promise<void> {
  return locked(async () => {
    await mkdir(path.dirname(indexFile(dir)), { recursive: true, mode: 0o700 });
    await appendFile(
      indexFile(dir),
      JSON.stringify({ ...entry, at: entry.at ?? Date.now() }) + "\n",
      { mode: 0o600 },
    );
    await chmod(indexFile(dir), 0o600).catch(() => undefined);
  });
}

export function forgetEvidence(dir: string, ids: string[]): Promise<void> {
  if (!ids.length) return Promise.resolve();
  return forgetWhere(dir, (e) => ids.includes(e.id));
}

/** A deleted item takes every hash of its evidence with it. */
export const forgetItem = (dir: string, itemId: string) =>
  forgetWhere(dir, (e) => e.item === itemId);

function forgetWhere(dir: string, drop: (e: PhashEntry) => boolean): Promise<void> {
  return locked(async () => {
    const all = await readIndex(dir);
    const keep = all.filter((e) => !drop(e));
    if (keep.length === all.length) return;
    const tmp = `${indexFile(dir)}.${process.pid}.tmp`;
    await writeFile(
      tmp,
      keep.map((e) => JSON.stringify(e)).join("\n") + (keep.length ? "\n" : ""),
      { mode: 0o600 },
    );
    await rename(tmp, indexFile(dir));
  });
}

export type IngestReview = {
  removed: MetaKind[];
  dedupe: DedupeVerdict | null;
  nsfw: { pNsfw: number; verdict: string } | null;
};

export type IngestResult = {
  bytes: Buffer;
  phash: string | null;
  review: IngestReview;
  /** Call after the evidence row exists, so the next upload can match against it. */
  remember: (evidenceId: string) => Promise<void>;
};

const DEDUPE_MESSAGES: Record<DedupeVerdict["status"], string | null> = {
  new: null,
  "same-item": null,
  "reused-own": "You used this same photo for another item. Each item needs its own photo.",
  "someone-else":
    "This photo is already evidence on someone else's record, so it can't back this one.",
};
export const dedupeMessage = (v: DedupeVerdict | null) => (v ? DEDUPE_MESSAGES[v.status] : null);

/**
 * The server half of the gate for one image. Non-images (PDF receipts) pass straight through.
 * Throws IngestRejected only for switched-on blocking flags (dedupeBlock, nsfwServer).
 */
export async function ingestImage(opts: {
  bytes: Buffer;
  userId: string;
  itemId: string;
  dir: string;
  flags?: IngestFlags;
}): Promise<IngestResult> {
  const flags = opts.flags ?? ingestFlags();
  const kind = stripImageMetadata(opts.bytes).kind;
  if (!kind)
    return {
      bytes: opts.bytes,
      phash: null,
      review: { removed: [], dedupe: null, nsfw: null },
      remember: async () => undefined,
    };
  let bytes = opts.bytes;
  let removed: MetaKind[] = [];
  if (flags.stripMeta) {
    try {
      const res = stripImageMetadata(opts.bytes);
      bytes = Buffer.from(res.bytes);
      removed = res.removed;
    } catch (err) {
      throw new IngestRejected(
        err instanceof Error ? err.message : "That image looks damaged.",
        415,
      );
    }
  }
  let nsfw: IngestReview["nsfw"] = null;
  if (flags.nsfwServer) {
    const { nsfwCheckServer } = await import("./nsfw.server.ts");
    nsfw = await nsfwCheckServer(bytes);
    if (nsfw?.verdict === "block")
      throw new IngestRejected(
        "This photo looks like adult content, so it can't be used here.",
        422,
      );
  }
  let phash: string | null = null;
  let dedupe: DedupeVerdict | null = null;
  if (flags.dedupe) {
    try {
      phash = await phashImage(bytes);
    } catch {
      // Undecodable pixels: the strip above still ran; dedupe just can't vouch for it. Never a block on its own.
      console.warn(`[ingest] pHash skipped: image for item ${opts.itemId} could not be decoded`);
      phash = null;
    }
    const matches = phash ? findMatches(await readIndex(opts.dir), phash) : [];
    dedupe = phash ? dedupeVerdict(matches, { user: opts.userId, item: opts.itemId }) : null;
    if (dedupe?.status === "someone-else") {
      // ids only, never the picture or the other person's details
      console.warn(
        `[ingest] review: evidence pHash matches ${dedupe.matches} other user record(s), distance ${dedupe.closest}, item ${opts.itemId}`,
      );
      if (flags.dedupeBlock) throw new IngestRejected(DEDUPE_MESSAGES["someone-else"]!, 409);
    }
  }
  const h = phash;
  return {
    bytes,
    phash: h,
    review: { removed, dedupe, nsfw },
    remember: async (evidenceId) => {
      if (h)
        await rememberEvidence(opts.dir, {
          h,
          id: evidenceId,
          item: opts.itemId,
          user: opts.userId,
        });
    },
  };
}
