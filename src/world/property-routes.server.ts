/**
 * Raw-body API handlers for NDU property evidence + metadata (server-only, imported lazily by routes).
 * Same auth as `authMiddleware`: same-site check, then a verified session.
 */
import { z } from "zod";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUserId } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";
import { PROPERTY } from "@/config/neura";
import { PropertyError, readEvidence, readMetadata, requireReady, storeEvidence } from "@/world/property.server";

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

// ── request validation (zod) ─────────────────────────────────────────────────
// The property API has no JSON request bodies: the only body it takes is the raw
// evidence upload, which stays raw bytes on purpose. What IS attacker-reachable
// input are the fields that ride alongside it — the upload headers and the two
// path segments — so those are what get schemas, bounds and a 400.

/** Loose UUID shape (matches `isUuid` in property.server.ts) — ids are server-generated. */
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A bounded id field. Missing (`undefined`/`null`, as an absent header arrives)
 * is normalised to `""` so the field reports "required" rather than zod's
 * generic type message.
 */
const idField = (what: string) =>
  z.preprocess(
    (v) => (v == null ? "" : v),
    z
      .string()
      .trim()
      .min(1, `${what} is required.`)
      .max(64, `${what} is too long.`)
      .regex(idPattern, `${what} is not a valid id.`),
  );

/** `X-Item-Id` + `X-Evidence-Kind` on the raw upload (the body itself is bytes, not JSON). */
export const EvidenceUploadSchema = z.object({
  itemId: idField("Item"),
  kind: z.preprocess((v) => (v == null ? "" : v), z.enum(["receipt", "photo"], { message: "Evidence is a receipt or a photo." })),
});
export type EvidenceUpload = z.infer<typeof EvidenceUploadSchema>;

/** Path segment of GET /api/property/evidence/:id. */
export const EvidenceIdSchema = idField("Evidence");

/** Path segment of GET /api/property/meta/:hash(.json) — the `.json` suffix is optional. */
export const MetadataHashSchema = z.preprocess(
  (v) => (v == null ? "" : v),
  z
    .string()
    .trim()
    .min(1, "Metadata hash is required.")
    .max(80, "Metadata hash is too long.")
    .regex(/^[0-9a-f]{64}(\.json)?$/i, "Metadata hash must be 64 hex characters."),
);

/**
 * First message per field path, so a bad body reports one clear line per field
 * rather than every overlapping rule that also failed.
 */
function fieldMessages(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Parse `input` with `schema`; on failure a 400 whose body names every bad field. */
export function validate<T extends z.ZodType>(schema: T, input: unknown): { ok: true; data: z.infer<T> } | { ok: false; response: Response } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields = fieldMessages(parsed.error);
  return {
    ok: false,
    response: json(400, {
      error: "Check the highlighted fields and try again.",
      fields,
    }),
  };
}

async function caller(): Promise<string | Response> {
  try {
    assertSameSiteRequest();
    return await requireUserId();
  } catch (err) {
    const status = (err as { status?: number }).status === 403 ? 403 : 401;
    return json(status, { error: status === 403 ? "Forbidden" : "Sign in first." });
  }
}

function fail(err: unknown): Response {
  if (err instanceof PropertyError) return json(err.status || 400, { error: err.message });
  console.error("[property] route error:", err instanceof Error ? err.message : err);
  return json(500, { error: "Something went wrong. Please try again." });
}

async function readCapped(request: Request, cap: number): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > cap) {
      reader.releaseLock(); // never cancel mid-stream (Node 22 adapter); the 413 closes the connection
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/** POST /api/property/evidence — raw body; `X-Item-Id`, `X-Evidence-Kind: receipt|photo`. */
export async function receiveEvidence(request: Request): Promise<Response> {
  const who = await caller();
  if (who instanceof Response) return who;
  try {
    const kek = requireReady();
    const fields = validate(EvidenceUploadSchema, {
      itemId: request.headers.get("x-item-id"),
      kind: request.headers.get("x-evidence-kind"),
    });
    if (!fields.ok) return fields.response;
    const declared = Number(request.headers.get("content-length") || 0);
    const tooBig = json(413, { error: `Files are limited to ${PROPERTY.maxEvidenceBytes / 1048576} MB.` }, { Connection: "close" });
    if (declared > PROPERTY.maxEvidenceBytes) return tooBig;
    const body = await readCapped(request, PROPERTY.maxEvidenceBytes);
    if (body === null) return tooBig;
    if (!body.length) return json(400, { error: "Empty upload." });
    const evidence = await storeEvidence(await getSql(), kek, who, fields.data.itemId, fields.data.kind, body);
    return json(201, { evidence });
  } catch (err) {
    return fail(err);
  }
}

/** GET /api/property/evidence/:id — decrypted bytes for the owner or a group member. */
export async function sendEvidence(id: string): Promise<Response> {
  const who = await caller();
  if (who instanceof Response) return who;
  const fields = validate(EvidenceIdSchema, id);
  if (!fields.ok) return fields.response;
  try {
    const kek = requireReady();
    const { bytes, mime } = await readEvidence(await getSql(), kek, who, fields.data);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (err) {
    return fail(err);
  }
}

/**
 * GET /api/property/meta/:hash(.json) — the content-addressed public metadata. While on-chain minting
 * is off, only viewers of the item can fetch it (it becomes public, immutable, at mint time).
 */
export async function sendMetadata(hash: string): Promise<Response> {
  const who = await caller();
  if (who instanceof Response) return who;
  const fields = validate(MetadataHashSchema, hash);
  if (!fields.ok) return fields.response;
  try {
    requireReady();
    const text = await readMetadata(await getSql(), who, fields.data);
    return new Response(text, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (err) {
    return fail(err);
  }
}
