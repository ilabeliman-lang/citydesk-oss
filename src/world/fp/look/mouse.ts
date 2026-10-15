// NDU-FP (FPXR-06): pointer-lock mouse look. Click on the map canvas locks; Esc releases (browser default).
export function attachMouseLook(canvas: HTMLElement, onDelta: (dx: number, dy: number) => void, onLock?: (locked: boolean) => void): () => void {
  const isLocked = () => document.pointerLockElement === canvas;
  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.(".maplibregl-marker, button, [role=button], a, input, textarea, select")) return;
    if (isLocked()) return;
    try {
      const r = (canvas as HTMLElement & { requestPointerLock: (o?: unknown) => Promise<void> | void }).requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === "function")
        (r as Promise<void>).catch(() => {
          try {
            void canvas.requestPointerLock();
          } catch {
            // no pointer lock here: drag look still works
          }
        });
    } catch {
      try {
        void canvas.requestPointerLock();
      } catch {
        // ignore
      }
    }
  };
  const onMove = (e: MouseEvent) => {
    if (isLocked()) onDelta(e.movementX || 0, e.movementY || 0);
  };
  const onChange = () => onLock?.(isLocked());
  canvas.addEventListener("click", onClick);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("pointerlockchange", onChange);
  document.addEventListener("pointerlockerror", onChange);
  return () => {
    canvas.removeEventListener("click", onClick);
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("pointerlockchange", onChange);
    document.removeEventListener("pointerlockerror", onChange);
    if (isLocked()) document.exitPointerLock?.();
  };
}
