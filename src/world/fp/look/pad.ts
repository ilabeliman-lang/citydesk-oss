// NDU-FP (FPXR-06): gamepad right stick, polled from the controller's rAF.
export function readPad(): { rx: number; ry: number; lx: number; ly: number; run: boolean } | null {
  try {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const a = p.axes;
      return { lx: a[0] ?? 0, ly: a[1] ?? 0, rx: a[2] ?? 0, ry: a[3] ?? 0, run: Boolean(p.buttons[10]?.pressed || p.buttons[6]?.pressed) };
    }
  } catch {
    // no gamepad API
  }
  return null;
}
