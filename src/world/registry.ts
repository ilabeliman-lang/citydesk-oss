import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

/** "Places & Claims": the City Desk Map Registry for the signed-in City Desk user (server-side bridge). */
export const REGISTRY_URL: string =
  (import.meta.env?.VITE_REGISTRY_URL as string | undefined) || "https://office.citydesk.example/spaces/map";

/** Validated shape of the registry bridge's /me response (remote data — never trust the cast). */
const RegistryTripSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  mode: z.string(),
  status: z.string(),
  current_stop: z.number().int(),
  n_stops: z.number().int(),
});
const RegistryClaimSchema = z.object({
  id: z.number().int(),
  status: z.string(),
  label: z.string(),
  kind: z.string(),
});
const RegistryOwnedSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  kind: z.string(),
  lat: z.number(),
  lng: z.number(),
});
const RegistryMeSchema = z.object({
  ok: z.boolean(),
  linked: z.boolean(),
  handle: z.string().optional(),
  trips: z.array(RegistryTripSchema).optional(),
  claims: z.array(RegistryClaimSchema).optional(),
  owned: z.array(RegistryOwnedSchema).optional(),
  error: z.string().optional(),
});

export type RegistryMe = z.infer<typeof RegistryMeSchema>;

export const registryMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RegistryMe> => {
    const { bridge } = await import("@/world/registryBridge.server");
    const j = await bridge.me(String(context.userId));
    if (!j) return { ok: false, linked: false, error: "Registry is unreachable right now." };
    // Parse on load: the bridge is a remote service — a malformed payload must not
    // reach the client as a silently mistyped object. Fail closed with a clear error.
    const parsed = RegistryMeSchema.safeParse(j);
    if (!parsed.success) {
      return { ok: false, linked: false, error: `Registry returned an unexpected payload (${parsed.error.issues.map((i) => i.path.join(".")).join(", ") || "schema"}).` };
    }
    return parsed.data;
  });

export const registryLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code: string; name?: string }) => {
    const code = String(input?.code ?? "").trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(code)) throw new Error("Enter the 8-character code from the Spaces map page.");
    return { code, name: String(input?.name ?? "").slice(0, 64) };
  })
  .handler(async ({ context, data }) => {
    const { bridge } = await import("@/world/registryBridge.server");
    const j = await bridge.link(String(context.userId), data.code, data.name);
    if (!j) return { ok: false, error: "Registry is unreachable right now." };
    return { ok: Boolean(j.ok), handle: j.handle, error: j.error };
  });

export const registryUnlink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { bridge } = await import("@/world/registryBridge.server");
    return { ok: Boolean((await bridge.unlink(String(context.userId)))?.ok) };
  });

export const registryNearby = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { lat: number; lng: number }) => {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) throw new Error("Location required");
    return { lat, lng };
  })
  .handler(async ({ data }) => {
    const { registryPlacesNear } = await import("@/world/registryBridge.server");
    return (await registryPlacesNear(data.lat, data.lng, 900)).slice(0, 30).map(({ tags: _t, ...p }) => p);
  });

/** Trip avatars: own + accepted Spaces friends only (Spaces enforces it); none for unlinked users. */
export const tripAvatars = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { bridge } = await import("@/world/registryBridge.server");
    const j = await bridge.presence(String(context.userId));
    return (j?.presence ?? []).map((p) => ({
      id: `trip:${p.handle}`,
      displayName: `${p.mine ? "You" : p.handle} · ${p.label}`.slice(0, 60),
      avatar: "",
      lat: p.lat,
      lng: p.lng,
      moving: p.moving,
    }));
  });
