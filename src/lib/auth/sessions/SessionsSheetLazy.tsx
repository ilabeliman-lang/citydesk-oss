/** NDU-UPG sessions: loads the sheet's code only when it is first opened (keeps the first map light). */
import { lazy, Suspense } from "react";
import { useSessionsSheetOpen } from "./open-store";

const Host = lazy(() => import("./SessionsSheet").then((m) => ({ default: m.SessionsSheetHost })));

export function SessionsSheetLazy() {
  const open = useSessionsSheetOpen();
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  );
}
