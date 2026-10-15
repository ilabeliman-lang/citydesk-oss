/**
 * NDU-UPG #30 & #34: WebGL Context Loss detection and recovery ladder,
 * plus layer order verification.
 */

export type ContextState = "healthy" | "restoring" | "degraded_2d";

export class WebGlLifecycleManager {
  private failureCount = 0;
  private state: ContextState = "healthy";
  private onStateChange?: (state: ContextState) => void;

  constructor(onStateChange?: (state: ContextState) => void) {
    this.onStateChange = onStateChange;
  }

  getState(): ContextState {
    return this.state;
  }

  getFailures(): number {
    return this.failureCount;
  }

  /**
   * Handle WebGLContextLost event on map canvas.
   * After 2 failures, permanently degrades to Tier C 2D mode per requirement.
   */
  handleContextLost(event?: { preventDefault: () => void }): void {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    this.failureCount++;

    if (this.failureCount >= 2) {
      this.state = "degraded_2d";
    } else {
      this.state = "restoring";
    }

    this.onStateChange?.(this.state);
  }

  /**
   * Handle WebGLContextRestored event.
   */
  handleContextRestored(): void {
    if (this.state !== "degraded_2d") {
      this.state = "healthy";
      this.onStateChange?.(this.state);
    }
  }

  reset(): void {
    this.failureCount = 0;
    this.state = "healthy";
    this.onStateChange?.(this.state);
  }
}

/** Layer contract IDs in strictly ascending visual order */
export const RENDER_ORDER_CONTRACT = [
  "basemap-fills",
  "roads",
  "3d-buildings",
  "three-scans-and-props",
  "poi-labels",
  "html-markers",
] as const;

export function verifyLayerOrder(layers: string[]): boolean {
  let lastIdx = -1;
  for (const layer of layers) {
    const idx = (RENDER_ORDER_CONTRACT as readonly string[]).indexOf(layer);
    if (idx !== -1) {
      if (idx < lastIdx) return false;
      lastIdx = idx;
    }
  }
  return true;
}
