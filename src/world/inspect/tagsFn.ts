// NDU-UPG inspect (#04): the inspect tag lookup server fn (public OSM tags, allow-listed).
import { createServerFn } from "@tanstack/react-start";
import type { TagsAnswer } from "./tags.server";

export const inspectTags = createServerFn({ method: "POST" })
  .validator((input: { id: number; lat: number; lng: number }) => {
    const id = Number(input?.id);
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Bad id");
    if (!Number.isFinite(lat) || lat < -85 || lat > 85 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Location required");
    return { id, lat, lng };
  })
  .handler(async ({ data }): Promise<TagsAnswer> => {
    const { serveInspectTags } = await import("./tags.server");
    return serveInspectTags(data);
  });
