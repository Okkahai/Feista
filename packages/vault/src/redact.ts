/** Scrub secrets from anything headed to logs or error messages. */
const PATTERNS: RegExp[] = [
  /\b(sk|pk|rk)[-_](live[-_]|test[-_]|ant[-_]|proj[-_])?[A-Za-z0-9_-]{12,}/g, // OpenAI/Anthropic/Stripe-style keys
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(Key|Basic)\s+[A-Za-z0-9._~+/=:-]{12,}/g, // "Authorization: Key id:secret" (fal, Higgsfield)
  /([?&](X-Amz-Signature|X-Amz-Credential|Signature|token|key|access_token|refresh_token)=)[^&\s"']+/gi, // signed URLs
  /\bya29\.[A-Za-z0-9._-]{20,}/g, // Google OAuth access tokens
  /\b1\/\/[A-Za-z0-9_-]{20,}/g, // Google refresh tokens
];

/** `known` = secrets in scope for this request (e.g. the decrypted key), redacted verbatim first. */
export function redact(text: string, known: readonly string[] = []): string {
  let out = text;
  for (const k of known) if (k.length >= 8) out = out.split(k).join("[REDACTED]");
  for (const p of PATTERNS) out = out.replace(p, (m, prefix?: string) => (typeof prefix === "string" && m.startsWith(prefix) && prefix.endsWith("=") ? `${prefix}[REDACTED]` : "[REDACTED]"));
  return out;
}
