import type { ProviderResult } from "@feista/core";

export type Fetch = typeof fetch;

/** Map an HTTP failure to a result the runner can act on. Never echoes request headers (they hold the key). */
export async function httpError(res: Response, provider: string): Promise<ProviderResult & { state: "error" }> {
  const body = (await res.text().catch(() => "")).slice(0, 300);
  // 408/409/425/429 and 5xx are worth retrying; auth, validation and payment errors are not
  const retryable = res.status >= 500 || [408, 409, 425, 429].includes(res.status);
  return { state: "error", retryable, message: `${provider} HTTP ${res.status}: ${body}` };
}
