/**
 * Category 12: Cultural Localisation & Accessibility (items 551–600).
 * Accessibility manager (a11yGuard):
 *  - Detect or override prefers-reduced-motion
 *  - Detect or override prefers-contrast (high-contrast palette theme overrides)
 *  - Screen reader announcer queue for live region ARIA messages
 *  - Safe SSR fallback when window or document is undefined
 */

export type MotionPreference = "system" | "reduce" | "no-preference";
export type ContrastPreference = "system" | "more" | "no-preference";
export type AriaPriority = "polite" | "assertive";

export interface AriaAnnouncement {
  id: string;
  message: string;
  priority: AriaPriority;
  timestamp: number;
}

export interface A11yState {
  reducedMotion: boolean;
  reducedMotionOverride: MotionPreference;
  highContrast: boolean;
  contrastOverride: ContrastPreference;
  pendingAnnouncements: number;
}

/** Standard emboss theme tokens */
export const DEFAULT_PALETTE_TOKENS: Record<string, string> = {
  "--e-bg": "#1a1511",
  "--e-surface": "#2c241c",
  "--e-hi": "rgba(255,255,255,0.14)",
  "--e-lo": "rgba(0,0,0,0.30)",
  "--e-accent": "#e8843a",
  "--e-accent-hi": "#f7b47a",
  "--e-accent-lo": "#6e3612",
  "--e-fg": "#f6efe2",
  "--e-muted": "#b5a48e",
  "--e-shadow-out": "0 3px 0 rgba(0,0,0,0.42), 0 8px 18px rgba(0,0,0,0.38)",
  "--e-shadow-in": "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -3px 6px rgba(0,0,0,0.38)",
  "--e-radius": "18px",
  "--e-radius-pill": "999px",
  "--a11y-focus-ring": "2px solid #e8843a",
  "--a11y-border": "1px solid rgba(255,255,255,0.18)",
};

/** High contrast theme overrides with WCAG AAA compliant contrast */
export const HIGH_CONTRAST_TOKENS: Record<string, string> = {
  "--e-bg": "#000000",
  "--e-surface": "#121212",
  "--e-hi": "#ffffff",
  "--e-lo": "#000000",
  "--e-accent": "#ffff00", // pure yellow against dark
  "--e-accent-hi": "#ffffff",
  "--e-accent-lo": "#ffd700",
  "--e-fg": "#ffffff",
  "--e-muted": "#e0e0e0",
  "--e-shadow-out": "0 0 0 2px #ffffff",
  "--e-shadow-in": "inset 0 0 0 2px #ffffff",
  "--e-radius": "18px",
  "--e-radius-pill": "999px",
  "--a11y-focus-ring": "3px solid #ffff00",
  "--a11y-border": "2px solid #ffffff",
};

export class A11yGuardManager {
  private motionOverride: MotionPreference = "system";
  private contrastOverride: ContrastPreference = "system";
  private announcements: AriaAnnouncement[] = [];
  private listeners: Set<(state: A11yState) => void> = new Set();
  private announcementSeq = 0;

  /** Media query listeners cleanup callbacks */
  private mediaQueryCleanups: (() => void)[] = [];

  constructor() {
    this.setupMediaListeners();
  }

  /**
   * Safe SSR check for window availability.
   */
  private hasWindow(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function";
  }

  /**
   * Safe SSR check for document availability.
   */
  private hasDocument(): boolean {
    return typeof document !== "undefined" && typeof document.createElement === "function";
  }

  private setupMediaListeners(): void {
    if (!this.hasWindow()) return;

    try {
      const motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onMotionChange = () => this.notifyState();
      if (typeof motionMql.addEventListener === "function") {
        motionMql.addEventListener("change", onMotionChange);
        this.mediaQueryCleanups.push(() =>
          motionMql.removeEventListener("change", onMotionChange)
        );
      } else if (typeof motionMql.addListener === "function") {
        // Fallback for older Safari/browsers
        motionMql.addListener(onMotionChange);
        this.mediaQueryCleanups.push(() => motionMql.removeListener(onMotionChange));
      }

      const contrastMql = window.matchMedia("(prefers-contrast: more)");
      const onContrastChange = () => this.notifyState();
      if (typeof contrastMql.addEventListener === "function") {
        contrastMql.addEventListener("change", onContrastChange);
        this.mediaQueryCleanups.push(() =>
          contrastMql.removeEventListener("change", onContrastChange)
        );
      } else if (typeof contrastMql.addListener === "function") {
        contrastMql.addListener(onContrastChange);
        this.mediaQueryCleanups.push(() =>
          contrastMql.removeListener(onContrastChange)
        );
      }
    } catch {
      // Graceful fallback if matchMedia fails
    }
  }

  /**
   * Returns true if reduced motion is requested by system or override.
   */
  public isReducedMotion(): boolean {
    if (this.motionOverride === "reduce") return true;
    if (this.motionOverride === "no-preference") return false;

    if (!this.hasWindow()) return false;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  /**
   * Sets manual override for reduced motion.
   */
  public setReducedMotionOverride(override: MotionPreference): void {
    if (this.motionOverride !== override) {
      this.motionOverride = override;
      this.notifyState();
    }
  }

  public getReducedMotionOverride(): MotionPreference {
    return this.motionOverride;
  }

  /**
   * Clamp an animation duration (ms). Returns 0 if reduced motion is enabled.
   */
  public clampDuration(durationMs: number): number {
    if (this.isReducedMotion()) return 0;
    return Math.max(0, durationMs);
  }

  /**
   * Choose between an animated value and a static fallback value based on reduced motion state.
   */
  public clampMotion<T>(animatedValue: T, staticValue: T): T {
    return this.isReducedMotion() ? staticValue : animatedValue;
  }

  /**
   * Returns true if animations are allowed to run.
   */
  public shouldAnimate(): boolean {
    return !this.isReducedMotion();
  }

  /**
   * Returns true if high contrast mode is requested by system or override.
   */
  public isHighContrast(): boolean {
    if (this.contrastOverride === "more") return true;
    if (this.contrastOverride === "no-preference") return false;

    if (!this.hasWindow()) return false;
    try {
      return window.matchMedia("(prefers-contrast: more)").matches;
    } catch {
      return false;
    }
  }

  /**
   * Sets manual override for contrast mode.
   */
  public setContrastOverride(override: ContrastPreference): void {
    if (this.contrastOverride !== override) {
      this.contrastOverride = override;
      this.notifyState();
    }
  }

  public getContrastOverride(): ContrastPreference {
    return this.contrastOverride;
  }

  /**
   * Returns current active theme tokens (standard or high-contrast).
   */
  public getTokens(): Record<string, string> {
    return this.isHighContrast() ? HIGH_CONTRAST_TOKENS : DEFAULT_PALETTE_TOKENS;
  }

  /**
   * Returns high contrast CSS string.
   */
  public highContrastTokensCss(): string {
    const lines = Object.entries(HIGH_CONTRAST_TOKENS)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n");
    return `:root[data-contrast="high"], :root.high-contrast, @media (prefers-contrast: more) {\n  :root {\n${lines}\n  }\n}`;
  }

  /**
   * Injects high-contrast styles into the document head safely.
   */
  public injectHighContrastCss(): void {
    if (!this.hasDocument()) return;
    const existing = document.getElementById("ndu-a11y-contrast");
    if (existing) return;

    const style = document.createElement("style");
    style.id = "ndu-a11y-contrast";
    style.textContent = this.highContrastTokensCss();
    document.head.appendChild(style);
  }

  /**
   * Applies or removes high-contrast data attributes / classes on target or root element.
   */
  public applyContrastToDom(targetElement?: HTMLElement | null): void {
    if (!this.hasDocument()) return;
    const el = targetElement ?? document.documentElement;
    if (!el) return;

    if (this.isHighContrast()) {
      el.setAttribute("data-contrast", "high");
      el.classList.add("high-contrast");
    } else {
      el.removeAttribute("data-contrast");
      el.classList.remove("high-contrast");
    }
  }

  // ── Screen Reader Announcer Queue ──

  /**
   * Enqueues an ARIA live region message.
   */
  public announce(
    message: string,
    priority: AriaPriority = "polite"
  ): AriaAnnouncement {
    const trimmed = message.trim();
    const announcement: AriaAnnouncement = {
      id: `a11y-${++this.announcementSeq}-${Date.now()}`,
      message: trimmed,
      priority,
      timestamp: Date.now(),
    };

    this.announcements.push(announcement);
    this.updateDomAnnouncer(announcement);
    this.notifyState();
    return announcement;
  }

  /**
   * Returns a snapshot of queued announcements.
   */
  public getAnnouncements(): ReadonlyArray<AriaAnnouncement> {
    return [...this.announcements];
  }

  /**
   * Returns number of pending announcements.
   */
  public getPendingCount(): number {
    return this.announcements.length;
  }

  /**
   * Peek next announcement without removing it.
   */
  public peekNextAnnouncement(): AriaAnnouncement | null {
    return this.announcements[0] ?? null;
  }

  /**
   * Consume and dequeue the oldest announcement (FIFO).
   */
  public consumeNextAnnouncement(): AriaAnnouncement | null {
    if (this.announcements.length === 0) return null;
    const item = this.announcements.shift() ?? null;
    this.notifyState();
    return item;
  }

  /**
   * Clear all pending announcements.
   */
  public clearAnnouncements(): void {
    if (this.announcements.length > 0) {
      this.announcements = [];
      this.notifyState();
    }
  }

  /**
   * Safe live region update in the DOM if available.
   */
  private updateDomAnnouncer(announcement: AriaAnnouncement): void {
    if (!this.hasDocument()) return;

    try {
      const containerId = `ndu-a11y-live-${announcement.priority}`;
      let liveEl = document.getElementById(containerId);

      if (!liveEl) {
        liveEl = document.createElement("div");
        liveEl.id = containerId;
        liveEl.setAttribute("aria-live", announcement.priority);
        liveEl.setAttribute("aria-atomic", "true");
        // Visually hidden styles
        liveEl.style.position = "absolute";
        liveEl.style.width = "1px";
        liveEl.style.height = "1px";
        liveEl.style.padding = "0";
        liveEl.style.margin = "-1px";
        liveEl.style.overflow = "hidden";
        liveEl.style.clip = "rect(0, 0, 0, 0)";
        liveEl.style.whiteSpace = "nowrap";
        liveEl.style.border = "0";
        document.body.appendChild(liveEl);
      }

      // Small delay/toggle trick to ensure screen readers announce identical successive messages
      liveEl.textContent = "";
      liveEl.textContent = announcement.message;
    } catch {
      // Safe fallback
    }
  }

  // ── State and Observers ──

  public getState(): A11yState {
    return {
      reducedMotion: this.isReducedMotion(),
      reducedMotionOverride: this.motionOverride,
      highContrast: this.isHighContrast(),
      contrastOverride: this.contrastOverride,
      pendingAnnouncements: this.announcements.length,
    };
  }

  public subscribe(listener: (state: A11yState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyState(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Keep other listeners intact
      }
    }
  }

  /**
   * Reset state and clear all listeners (for unit testing or cleanup).
   */
  public reset(): void {
    this.motionOverride = "system";
    this.contrastOverride = "system";
    this.announcements = [];
    this.announcementSeq = 0;
    for (const cleanup of this.mediaQueryCleanups) {
      try {
        cleanup();
      } catch {
        // Ignore
      }
    }
    this.mediaQueryCleanups = [];
    this.listeners.clear();
  }
}

/** Default singleton instance */
export const a11yGuard = new A11yGuardManager();

export function isReducedMotion(): boolean {
  return a11yGuard.isReducedMotion();
}

export function setReducedMotionOverride(override: MotionPreference): void {
  a11yGuard.setReducedMotionOverride(override);
}

export function clampDuration(durationMs: number): number {
  return a11yGuard.clampDuration(durationMs);
}

export function clampMotion<T>(animatedValue: T, staticValue: T): T {
  return a11yGuard.clampMotion(animatedValue, staticValue);
}

export function shouldAnimate(): boolean {
  return a11yGuard.shouldAnimate();
}

export function isHighContrast(): boolean {
  return a11yGuard.isHighContrast();
}

export function setContrastOverride(override: ContrastPreference): void {
  a11yGuard.setContrastOverride(override);
}

export function getTokens(): Record<string, string> {
  return a11yGuard.getTokens();
}

export function announce(
  message: string,
  priority: AriaPriority = "polite"
): AriaAnnouncement {
  return a11yGuard.announce(message, priority);
}

export function getAnnouncements(): ReadonlyArray<AriaAnnouncement> {
  return a11yGuard.getAnnouncements();
}

export function consumeNextAnnouncement(): AriaAnnouncement | null {
  return a11yGuard.consumeNextAnnouncement();
}

export function clearAnnouncements(): void {
  a11yGuard.clearAnnouncements();
}

export function getA11yState(): A11yState {
  return a11yGuard.getState();
}

export function subscribeA11y(
  listener: (state: A11yState) => void
): () => void {
  return a11yGuard.subscribe(listener);
}
