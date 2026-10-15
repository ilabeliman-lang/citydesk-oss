import { createFileRoute } from "@tanstack/react-router";

/** NDU-AI avatar-bot assistant: server proxy to the LitServe gateway (OFF unless configured; see gateway.server.ts). */
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const clientKey = (request: Request) =>
  (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "anon"
  ).trim();

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      GET: async () => {
        const { gatewayConfig } = await import("@/world/assistant/gateway.server");
        return json(200, { gateway: gatewayConfig().enabled });
      },
      POST: async ({ request }) => {
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > 4096) return json(413, { error: "too-large" });
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "bad-json" });
        }
        const { proxyAssistant } = await import("@/world/assistant/gateway.server");
        const out = await proxyAssistant(clientKey(request), body);
        return json(out.status, out.body);
      },
    },
  },
});
