import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { summarizeBoard, emptySummary, type ReceptionSummary } from "./receptionSummary";

/**
 * Server-side proxy to Agent Office reception (studio-internal 127.0.0.1:8847).
 * Office credentials are read on the server only (~/.agent-office/env or AGENT_OFFICE_* env)
 * and never reach the browser; only the sanitised summary is returned.
 */
export const getReceptionSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<ReceptionSummary> => {
    try {
      const fs = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");
      let user = process.env.AGENT_OFFICE_USER || "";
      let pass = process.env.AGENT_OFFICE_PASSWORD || "";
      if (!pass) {
        const envFile =
          process.env.AGENT_OFFICE_ENV || path.join(os.homedir(), ".agent-office", "env");
        const txt = fs.readFileSync(envFile, "utf8");
        const get = (k: string) =>
          (txt.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1] ?? "")
            .replace(/^["']|["']$/g, "")
            .trim();
        user = get("BASIC_AUTH_USER");
        pass = get("BASIC_AUTH_PASSWORD");
      }
      if (!user || !pass) return emptySummary("office login not configured on server");
      const base = process.env.AGENT_OFFICE_URL || "http://127.0.0.1:8847";
      const r = await fetch(base + "/reception/board", {
        headers: { authorization: "Basic " + Buffer.from(user + ":" + pass).toString("base64") },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return emptySummary("reception HTTP " + r.status);
      return summarizeBoard(await r.json());
    } catch {
      return emptySummary("reception unavailable");
    }
  });
