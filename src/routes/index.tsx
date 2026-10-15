import { createFileRoute } from "@tanstack/react-router";
import { MapPage } from "./map";

export const Route = createFileRoute("/")({ component: MapPage });
