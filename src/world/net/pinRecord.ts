import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { contentId } from "@/lib/property/cid";

/**
 * Pin one public claim receipt on a Kubo node running on this same machine.
 * Refuses any other address. Does not upload to Arweave and does not spend.
 */
export const sealPublicRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { hash?: string }) => ({ hash: String(input?.hash ?? "").trim().toLowerCase() }))
  .handler(async ({ context, data }) => {
    if (!/^[0-9a-f]{64}$/.test(data.hash)) return { pinned: false, cid: null as string | null, reason: "That is not a receipt hash." };
    const { getSql } = await import("@/lib/db");
    const { readMetadata } = await import("@/world/property.server");
    const sql = await getSql();
    const json = await readMetadata(sql, context.userId, data.hash);
    const cid = await contentId(new TextEncoder().encode(json));
    const api = process.env.KUBO_API?.trim();
    if (!api) {
      return { pinned: false, cid, reason: "No node is configured on this machine. The content id still names these exact bytes." };
    }
    let host = "";
    try {
      host = new URL(api).hostname;
    } catch {
      return { pinned: false, cid, reason: "The node address is not usable." };
    }
    if (host !== "127.0.0.1" && host !== "localhost") {
      return { pinned: false, cid, reason: "Refusing to send the receipt anywhere but a node on this machine." };
    }
    const root = api.replace(/\/$/, "");
    try {
      const form = new FormData();
      form.append("file", new Blob([new TextEncoder().encode(json)]), "receipt.json");
      const put = await fetch(`${root}/api/v0/block/put?cid-codec=raw&mhtype=sha2-256`, { method: "POST", body: form });
      const body = (await put.json().catch(() => null)) as { Key?: string } | null;
      if (!put.ok || body?.Key !== cid) return { pinned: false, cid, reason: "The node did not store these exact bytes." };
      await fetch(`${root}/api/v0/pin/add?arg=${encodeURIComponent(cid)}`, { method: "POST" });
      return { pinned: true, cid, reason: "Pinned on this machine's node. That is not the public network, and it is not Arweave." };
    } catch {
      return { pinned: false, cid, reason: "This machine has no IPFS node answering." };
    }
  });
