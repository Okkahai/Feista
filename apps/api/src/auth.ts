import { createHmac, timingSafeEqual } from "node:crypto";

/** Returns the verified user id for an Authorization header, or undefined. */
export type Authenticate = (authorization: string | undefined) => Promise<string | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * shortcut: HMAC dev tokens stand in for real auth (Supabase Auth JWT verification);
 * replace before any non-local deploy. server.ts refuses to start with this in production.
 */
export function devTokens(secret: Buffer) {
  if (secret.length < 32) throw new Error("dev auth secret must be >= 32 bytes");
  const mac = (uid: string) => createHmac("sha256", secret).update(`feista-dev:${uid}`).digest();
  return {
    sign: (uid: string) => `${uid}.${mac(uid).toString("base64url")}`,
    authenticate: (async (header) => {
      const m = /^Bearer ([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(header ?? "");
      if (!m || !UUID.test(m[1]!)) return undefined;
      const got = Buffer.from(m[2]!, "base64url");
      return got.length === 32 && timingSafeEqual(got, mac(m[1]!)) ? m[1] : undefined;
    }) satisfies Authenticate,
  };
}
