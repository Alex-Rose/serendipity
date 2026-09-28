// All settings come from environment variables; see server/README.md.

const env = process.env;

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

/** Express "trust proxy": "true", a hop count, or a comma-separated list of addresses / subnets. */
function trustProxy(value: string | undefined): boolean | number | string {
  if (!value) return false;
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

const production = env.NODE_ENV === "production";

export const config = {
  production,
  port: Number(env.PORT ?? 3000),
  mongoUri: env.MONGODB_URI ?? "mongodb://localhost:27017/serendipity",
  /**
   * Mark the session cookie Secure (HTTPS only). "auto" does it whenever the
   * request came over HTTPS; behind a TLS-terminating proxy that needs TRUST_PROXY.
   */
  cookieSecure: !env.COOKIE_SECURE || env.COOKIE_SECURE === "auto" ? ("auto" as const) : flag(env.COOKIE_SECURE, true),
  trustProxy: trustProxy(env.TRUST_PROXY),
  /** Load each saved page in a headless browser for its title, description and screenshot. */
  capture: flag(env.SERENDIPITY_CAPTURE, true),
  /** How many pages may be captured at once (each one is a Chromium instance). */
  captureConcurrency: Math.max(1, Number(env.SERENDIPITY_CAPTURE_CONCURRENCY ?? 2)),
  /**
   * Let captures reach loopback / private network addresses. Off by default so
   * nobody can use the server to look at your internal network.
   */
  allowPrivateUrls: flag(env.SERENDIPITY_ALLOW_PRIVATE_URLS, false),
};
