import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scans/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { sendScan } = await import("@/world/scan-store.server");
        return sendScan(params.id, request); // NDU-UPG #356 #368: request for ?raw/Range
      },
    },
  },
});
