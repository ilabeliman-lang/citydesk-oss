import { isSupportedLocale } from "@/world/i18n/dictionary";
import type { ContrastPreference, MotionPreference } from "./a11yGuard";

export const KEY = "ndu.a11y.v1";
export type Saved = { locale?: string; motion?: MotionPreference; contrast?: ContrastPreference };

export function readSaved(raw: string | null): Saved {
  try {
    const j = raw ? (JSON.parse(raw) as Saved) : {};
    return {
      locale: isSupportedLocale(j.locale) ? j.locale : undefined,
      motion: j.motion === "reduce" || j.motion === "no-preference" || j.motion === "system" ? j.motion : undefined,
      contrast: j.contrast === "more" || j.contrast === "no-preference" || j.contrast === "system" ? j.contrast : undefined,
    };
  } catch {
    return {};
  }
}

