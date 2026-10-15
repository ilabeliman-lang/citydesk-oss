/**
 * NDU-UPG u-086: trusted-origins construction, extracted pure so it freeze-tests
 * without loading the auth server (which pulls the DB). See server.ts, which
 * calls this with the env-derived inputs.
 */

const LOCAL_DEV_ORIGINS: string[] = ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"];

export { LOCAL_DEV_ORIGINS };

/** Origins Better Auth accepts on credentialed POSTs. */
export function buildTrustedOrigins(
  explicitBaseURL: string | undefined,
  previewAllowedHosts: string[],
  extraTrustedOrigins: string[],
): string[] {
  if (explicitBaseURL) {
    return [explicitBaseURL, ...LOCAL_DEV_ORIGINS, ...extraTrustedOrigins];
  }
  return [
    ...extraTrustedOrigins,
    // Host wildcards (matched against Origin's host)
    ...previewAllowedHosts,
    // Full-origin wildcards (matched against Origin)
    ...previewAllowedHosts.flatMap((host) => [`https://${host}`, `http://${host}`]),
    ...LOCAL_DEV_ORIGINS,
  ];
}
