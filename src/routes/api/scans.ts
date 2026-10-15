import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scans")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { receiveScan } = await import("@/world/scan-store.server");
        return receiveScan(request);
      },
    },
  },
});
