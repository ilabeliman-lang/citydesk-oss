/**
 * NDU-UPG sessions: request chokepoint for the session-management server functions (server-only).
 * Same-site + same-origin checks (CSRF), then the verified session (user id AND session id, so the
 * UI can mark "this device" and keep it when signing out the others). Never trusts client ids.
 */
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { assertSameSiteRequest, CrossSiteRequestError } from "../isolation.server";
import { UnauthorizedError } from "../verify.server";

export type CurrentSession = { userId: string; sessionId: string };

/** Extra CSRF belt for state-changing calls: an Origin header, when sent, must match this host. */
export function assertSameOrigin(request: Request | undefined = getRequest()) {
  if (!request) return;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (host && new URL(origin).host !== host) throw new CrossSiteRequestError();
  } catch (err) {
    if (err instanceof CrossSiteRequestError) throw err;
    throw new CrossSiteRequestError();
  }
}

export async function resolveCurrentSession(bearerToken?: string): Promise<CurrentSession> {
  assertSameSiteRequest();
  assertSameOrigin();
  const request = getRequest();
  if (!request) throw new UnauthorizedError();
  const { auth } = await import("../server");
  let headers = request.headers;
  if (bearerToken) {
    headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }
  const session = await auth.api.getSession({ headers });
  if (!session?.user || !session.session?.id) throw new UnauthorizedError();
  return { userId: session.user.id, sessionId: session.session.id };
}

/** Run a handler; errors that carry an HTTP status (401/403/503) become that response status. */
export async function withStatus<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (typeof status === "number" && status >= 400 && status < 600) {
      try {
        setResponseStatus(status);
      } catch {
        // no response context (tests)
      }
    }
    throw err;
  }
}
