import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/block")({ component: Gone });

function Gone() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/map" });
  }, [navigate]);
  return (
    <main className="bg-bg text-fg grid min-h-dvh place-items-center">
      <p className="font-display text-2xl">Opening the map</p>
    </main>
  );
}
