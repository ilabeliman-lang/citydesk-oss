// NDU cat 12 basics: wire the existing i18n + a11yGuard managers into the app.
// - <A11yBoot/> restores saved locale / motion / contrast and keeps <html lang dir> in sync.
// - <A11yPrefs/> is the embossed settings block in the account sheet.
import { useEffect, useState } from "react";
import { LOCALE_METADATA, getLocale, isSupportedLocale, setLocale, getSupportedLocales, type SupportedLocale } from "@/world/i18n/dictionary";
import { a11yGuard, type ContrastPreference, type MotionPreference } from "@/world/a11y/a11yGuard";

import { KEY, readSaved, type Saved } from "./prefs";

function save(next: Saved) {
  try {
    const cur = readSaved(localStorage.getItem(KEY));
    localStorage.setItem(KEY, JSON.stringify({ ...cur, ...next }));
  } catch {
    /* private mode */
  }
}

function applyDom() {
  const el = document.documentElement;
  const loc = getLocale();
  el.lang = loc;
  el.dir = LOCALE_METADATA[loc].direction;
  el.toggleAttribute("data-reduce-motion", a11yGuard.isReducedMotion());
  a11yGuard.injectHighContrastCss();
  a11yGuard.applyContrastToDom();
}

export function A11yBoot() {
  useEffect(() => {
    const s = readSaved(localStorage.getItem(KEY));
    if (s.locale) setLocale(s.locale as SupportedLocale);
    if (s.motion) a11yGuard.setReducedMotionOverride(s.motion);
    if (s.contrast) a11yGuard.setContrastOverride(s.contrast);
    applyDom();
  }, []);
  return null;
}

export function A11yPrefs() {
  const [locale, setLoc] = useState<SupportedLocale>(getLocale());
  const [motion, setMotion] = useState<MotionPreference>(a11yGuard.getReducedMotionOverride());
  const [contrast, setContrast] = useState<ContrastPreference>(a11yGuard.getContrastOverride());
  const chip = "ndu-a11y-chip bg-bg min-h-11 rounded-full px-3 text-sm";
  return (
    <section className="mt-4" aria-label="Language and accessibility">
      <label className="text-sm" htmlFor="ndu-locale">Language</label>
      <select
        id="ndu-locale"
        className="bg-bg mt-1 min-h-11 w-full rounded-full px-4 text-sm"
        value={locale}
        onChange={(e) => {
          const v = e.target.value as SupportedLocale;
          if (setLocale(v)) {
            setLoc(v);
            save({ locale: v });
            applyDom();
          }
        }}
      >
        {getSupportedLocales().map((l) => (
          <option key={l} value={l}>
            {LOCALE_METADATA[l].nativeName}
          </option>
        ))}
      </select>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={chip}
          aria-pressed={motion === "reduce"}
          onClick={() => {
            const v: MotionPreference = motion === "reduce" ? "system" : "reduce";
            a11yGuard.setReducedMotionOverride(v);
            setMotion(v);
            save({ motion: v });
            applyDom();
          }}
        >
          Reduce motion
        </button>
        <button
          type="button"
          className={chip}
          aria-pressed={contrast === "more"}
          onClick={() => {
            const v: ContrastPreference = contrast === "more" ? "system" : "more";
            a11yGuard.setContrastOverride(v);
            setContrast(v);
            save({ contrast: v });
            applyDom();
          }}
        >
          High contrast
        </button>
      </div>
    </section>
  );
}
