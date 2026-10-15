import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/property/evidence/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { sendEvidence } = await import("@/world/property-routes.server");
        return sendEvidence(params.id);
      },
    },
  },
});
