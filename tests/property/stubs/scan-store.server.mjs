/**
 * Test stub for `@/world/scan-store.server`. property.server.ts only needs `scanRoot()`; the real
 * module pulls in the auth/session stack (Better Auth, PGLite dialect, TanStack request context),
 * which can't load under plain `node --test`. Same logic as the real scanRoot().
 */
import path from "node:path";

export function scanRoot() {
  return process.env.SCAN_STORAGE_DIR?.trim() || path.resolve(process.cwd(), "..", ".citydesk-scans");
}
