import type { ProviderResult } from "@feista/core";

export type Fetch = typeof fetch;

/** Map an HTTP failure to a result the runner can act on. Never echoes request headers (they hold the key). */
export async function httpError(res: Response, provider: string): Promise<ProviderResult & { state: "error" }> {
  const body = (await res.text().catch(() => "")).slice(0, 300);
  // 408/409/425/429 and 5xx are worth retrying; auth, validation and payment errors are not
  const retryable = res.status >= 500 || [408, 409, 425, 429].includes(res.status);
  return { state: "error", retryable, message: `${provider} HTTP ${res.status}: ${body}` };
}

/**
 * For a request that may start paid work (a POST submit): once the provider might have accepted it,
 * a retry could bill twice, because neither fal nor ElevenLabs documents an idempotency key.
 * So only responses that prove the request was rejected up front (408/425/429) stay retryable.
 */
export async function submitError(res: Response, provider: string): Promise<ProviderResult & { state: "error" }> {
  const e = await httpError(res, provider);
  const rejectedUpFront = [408, 425, 429].includes(res.status);
  return rejectedUpFront ? e : { ...e, retryable: false, message: res.status >= 500 ? `${e.message} (may have been accepted: check the provider before retrying)` : e.message };
}

/** A network failure during a paid submit has the same ambiguity: report it, never auto-retry. */
export function submitThrew(provider: string, e: unknown): ProviderResult & { state: "error" } {
  return { state: "error", retryable: false, message: `${provider}: submit failed in flight (${e instanceof Error ? e.name : "error"}); it may have been accepted` };
}
