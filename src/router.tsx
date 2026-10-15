import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { NotFound } from "@/components/NotFound";
import { routeTree } from "./routeTree.gen";
import { makeNonce } from "@/lib/security/headers";

export function getRouter() {
  // NDU-UPG CSP v2: one nonce per server render; TanStack puts it on its inline scripts.
  const nonce = typeof window === "undefined" ? makeNonce() : undefined;
  return createRouter({
    routeTree,
    context: { nonce },
    ssr: nonce ? { nonce } : undefined,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFound,
  });
}
