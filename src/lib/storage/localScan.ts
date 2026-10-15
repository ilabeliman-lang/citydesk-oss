/**
 * Scan bytes stay off the network.
 * A missing or empty bucket is a local put. A set bucket is refused.
 * This does not start MinIO and does not upload.
 */
import { createHash } from "node:crypto";
import { localPut } from "./presign.ts";

export type StoreScanResult =
  | { where: "local"; ok: true; url: string }
  | { where: "local"; ok: false }
  | { where: "remote"; refused: true };

/** Content key localPut will accept: hex only, no slash and no dot-dot. */
function contentKey(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function storeScan(
  bytes: Uint8Array,
  env: { bucket?: string },
): Promise<StoreScanResult> {
  if (env.bucket) {
    return { where: "remote", refused: true };
  }
  return { where: "local", ...localPut(contentKey(bytes)) };
}
