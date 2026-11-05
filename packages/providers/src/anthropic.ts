/**
 * Anthropic Messages API for the text stages (concept, script). The owner's own key (BYOK).
 * Pricing checked 2026-11-04 (platform.claude.com/docs/en/about-claude/pricing): Opus 5.5 $4 / $20 per MTok.
 * VERIFICATION: mocked. Contract-tested with a fake fetch; never called live.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ProviderAdapter } from "@feista/core";
import type { Fetch } from "./http";

export const LLM_MODEL = "claude-opus-5-5";
// cents per token. A refusal falls back server-side to Claude Opus 5 / 4.8 ($5 / $25), so estimates use that ceiling.
const PRICE = { in: 400 / 1e6, out: 2000 / 1e6 };
const CEILING = { in: 500 / 1e6, out: 2500 / 1e6 };
const MAX_TOKENS = 16_000;

interface LlmInput {
  system: string;
  prompt: string;
  /** JSON schema the answer must match (structured outputs). */
  schema: Record<string, unknown>;
}

function inputOf(raw: Record<string, unknown>): LlmInput | undefined {
  const { system, prompt, schema } = raw;
  return typeof system === "string" && typeof prompt === "string" && schema && typeof schema === "object" ? { system, prompt, schema: schema as Record<string, unknown> } : undefined;
}

export function anthropicAdapter(fetchImpl: Fetch = fetch): ProviderAdapter {
  return {
    manifest: {
      id: "anthropic",
      name: "Anthropic",
      capabilities: ["llm.text"],
      models: [{ id: LLM_MODEL, capability: "llm.text", label: "Claude Opus 5.5", pricing: { unit: "1m_tokens", cents: 400, checkedAt: "2026-11-04", note: "input; output 2000c/MTok" } }],
      auth: "api_key",
      lifecycle: "sync",
      cancellation: false,
      docsUrl: "https://platform.claude.com/docs/en/api/messages",
      verification: "mocked",
    },

    estimateCents(req) {
      const i = inputOf(req.input);
      if (!i || req.modelId !== LLM_MODEL) return undefined;
      // upper bound: ~3 chars per token on the way in, the whole max_tokens (thinking included) on the way out
      // A mid-answer refusal is billed and then re-run on the fallback, so the worst case pays both attempts.
      // UTF-8 bytes bound the token count for any script (CJK, emoji, Turkish).
      const inTokens = Buffer.byteLength(i.system + i.prompt + JSON.stringify(i.schema));
      return Math.ceil(inTokens * (PRICE.in + CEILING.in) + MAX_TOKENS * (PRICE.out + CEILING.out));
    },

    async submit(req, ctx) {
      const i = inputOf(req.input);
      if (!i || req.modelId !== LLM_MODEL) return { state: "error", retryable: false, message: "anthropic: input needs system, prompt and schema" };
      // without a key the SDK would fall back to the server's own credentials (env, profile)
      if (!ctx.credential) return { state: "error", retryable: false, message: "anthropic: no credential" };
      // the runner owns retries: an SDK retry after a timeout could bill the same request twice
      // pinned host: an ANTHROPIC_BASE_URL in the server's env must never redirect users' keys elsewhere
      const client = new Anthropic({ apiKey: ctx.credential, baseURL: "https://api.anthropic.com", fetch: fetchImpl, maxRetries: 0, timeout: 10 * 60_000 });
      let msg: Anthropic.Beta.BetaMessage;
      try {
        msg = await client.beta.messages.create(
          {
            model: LLM_MODEL,
            max_tokens: MAX_TOKENS,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "high", format: { type: "json_schema", schema: i.schema } },
            system: i.system,
            messages: [{ role: "user", content: i.prompt }],
          },
          // per-request headers merge last: an ANTHROPIC_CUSTOM_HEADERS on the host cannot swap in another key
          { headers: { authorization: `Bearer ${ctx.credential}`, "x-api-key": null }, ...(ctx.signal ? { signal: ctx.signal } : {}) },
        );
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) return { state: "error", retryable: true, message: "anthropic: rate limited" };
        if (e instanceof Anthropic.APIConnectionError) return { state: "error", retryable: false, message: "anthropic: request failed in flight; it may have been billed" };
        if (e instanceof Anthropic.APIError) {
          const s = e.status ?? 0;
          return { state: "error", retryable: s === 529 || s === 503, message: `anthropic HTTP ${s}: ${String(e.message).slice(0, 200)}` };
        }
        throw e;
      }
      if (msg.stop_reason === "refusal") return { state: "error", retryable: false, message: `anthropic: declined (${msg.stop_details?.category ?? "no category"})` };
      if (msg.stop_reason === "max_tokens") return { state: "error", retryable: false, message: "anthropic: answer cut off at max_tokens" };
      const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      try {
        JSON.parse(text);
      } catch {
        return { state: "error", retryable: false, message: "anthropic: answer is not JSON" };
      }
      // shortcut: a fallback answer keeps the (ceiling) estimate as its cost; price usage.iterations per model once that matters
      const fellBack = msg.model !== LLM_MODEL;
      const reportedCents = fellBack ? undefined : Math.ceil(msg.usage.input_tokens * PRICE.in + msg.usage.output_tokens * PRICE.out);
      return {
        state: "done",
        outputs: [{ url: `data:application/json;base64,${Buffer.from(text).toString("base64")}`, mime: "application/json" }],
        ...(reportedCents === undefined ? {} : { reportedCents }),
      };
    },
  };
}
