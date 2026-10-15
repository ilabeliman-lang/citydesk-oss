import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/property/evidence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { receiveEvidence } = await import("@/world/property-routes.server");
        return receiveEvidence(request);
      },
    },
  },
});
