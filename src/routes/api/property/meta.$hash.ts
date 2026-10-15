import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/property/meta/$hash")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { sendMetadata } = await import("@/world/property-routes.server");
        return sendMetadata(params.hash);
      },
    },
  },
});
