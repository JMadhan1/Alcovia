/**
 * Dynamic server URL — resolves correctly in Replit (where the backend runs
 * on a separate sub-domain) and falls back to localhost for local dev.
 *
 * EXPO_PUBLIC_SERVER_URL is injected by start.sh at bundle time from
 * REPLIT_DEV_DOMAIN so the exact URL is always correct for the current repl.
 */
export const SERVER_URL: string = (() => {
  const envUrl = process.env.EXPO_PUBLIC_SERVER_URL;
  if (envUrl && envUrl.length > 0) return envUrl;
  return 'http://localhost:3001';
})();
