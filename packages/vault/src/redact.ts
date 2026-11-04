/**
 * Scrub secrets from anything headed to logs or error messages.
 * Defence in depth only: pass the decrypted key as `known` — patterns cannot catch every shape.
 */
const R = "[REDACTED]";
const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, R],
  [/\b(sk|pk|rk)[-_](live[-_]|test[-_]|ant[-_]|proj[-_])?[A-Za-z0-9_-]{12,}/g, R], // OpenAI/Anthropic/Stripe-style
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, R], // JWT
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, R], // Google API key
  [/\bGOCSPX-[0-9A-Za-z_-]{20,}/g, R], // Google OAuth client secret
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, R], // AWS access key id
  [/\br8_[0-9A-Za-z]{20,}/g, R], // Replicate
  [/\bya29\.[A-Za-z0-9._-]{20,}/g, R], // Google OAuth access token
  [/\b1\/\/[A-Za-z0-9_-]{20,}/g, R], // Google refresh token
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32}\b/gi, R], // fal "id:secret"
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, R],
  // Authorization header schemes only after the header name, so prose like "Key results" survives
  [/(authorization["']?\s*[:=]\s*["']?)(Key|Basic|Token)\s+[A-Za-z0-9._~+/=:-]{8,}/gi, `$1${R}`],
  // header / JSON / query-ish "name: value" pairs whose name says secret
  [/(["']?(?:x-api-key|xi-api-key|api[-_]?key|apikey|client[-_]?secret|secret|password|passwd|access[-_]?token|refresh[-_]?token|id[-_]?token|token)["']?\s*[:=]\s*["']?)[^\s"',&}]{6,}/gi, `$1${R}`],
  // signed URL query params
  [/([?&](?:X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|X-Goog-Signature|X-Goog-Credential|Signature|sig|token|key|access_token|refresh_token)=)[^&\s"']+/gi, `$1${R}`],
];

/** `known` = secrets in scope for this request (e.g. the decrypted key), redacted verbatim first. */
export function redact(text: string, known: readonly string[] = []): string {
  let out = text;
  for (const k of known) {
    if (k.length < 8) continue;
    // also the forms a secret takes once URL-encoded or embedded in JSON
    for (const form of new Set([k, encodeURIComponent(k), JSON.stringify(k).slice(1, -1)])) out = out.split(form).join(R);
  }
  for (const [p, rep] of PATTERNS) out = out.replace(p, rep);
  return out;
}
