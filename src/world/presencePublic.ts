// NDU-UPG 903
/**
 * Public presence allow-list. Exact home and scan coordinates are private and never copied.
 * A coarse place name is kept only when the payload already has one (label / area / place / coarse).
 * Pure: no database and no network. Map neighbors still use the snapped share point from presence.ts;
 * that grid point is not a home or scan site, so this does not invent one.
 */

export type PublicPresence = {
  id: string;
  displayName: string;
  avatar: string;
  /** Coarse place name already on the payload. Never a lat/lng. */
  label: string | null;
};

const LABEL_KEYS = ["label", "area", "place", "coarse", "neighborhood"] as const;
const BARE_NUMBER = /^-?\d+(?:\.\d+)?$/;

function clip(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function coarseLabel(src: Record<string, unknown>): string | null {
  for (const key of LABEL_KEYS) {
    const text = clip(src[key], 80);
    if (!text || BARE_NUMBER.test(text)) continue;
    return text;
  }
  return null;
}

/** Drop home, scan, and any other exact coordinates. Keep only id, name, avatar, and a coarse label. */
export function sanitizePresence(input: object | null | undefined): PublicPresence {
  const src = (input ?? {}) as Record<string, unknown>;
  return {
    id: clip(src.id, 128),
    displayName: clip(src.displayName, 32),
    avatar: clip(src.avatar, 100_000),
    label: coarseLabel(src),
  };
}
