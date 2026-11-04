/**
 * fal.ai queue adapter (docs checked 2026-11-03, docs/PROVIDER_INTEGRATIONS.md §2).
 * Submit to queue.fal.run/{model}; status/result/cancel live under the owner/app prefix only.
 * VERIFICATION: mocked. Contract-tested against documented response shapes; never called live.
 */
import type { ProviderAdapter, ProviderContext, ProviderRequest, ProviderResult } from "@feista/core";
import { type Fetch, httpError } from "./http";

const BASE = "https://queue.fal.run";
const MODEL = /^[a-z0-9-]+\/[a-z0-9.-]+(\/[a-z0-9.-]+)*$/;

/** List prices (cents) from fal.ai/pricing, checked 2026-11-03. Unknown model => no estimate => the runner refuses to spend. */
const PRICES: Record<string, { perSecond?: number; perImage?: number }> = {
  "bytedance/seedance-2.0/text-to-video": { perSecond: 30.34 }, // 720p + audio
  "bytedance/seedance-2.0/fast/text-to-video": { perSecond: 24.19 },
  "fal-ai/nano-banana-2": { perImage: 8 },
};

const appOf = (model: string) => model.split("/").slice(0, 2).join("/");
const auth = (ctx: ProviderContext) => ({ authorization: `Key ${ctx.credential}` });

function outputsOf(body: unknown): { url: string; mime: string }[] {
  const b = body as { video?: { url?: string; content_type?: string }; images?: { url?: string; content_type?: string }[] };
  const files = [...(b.video ? [b.video] : []), ...(b.images ?? [])];
  return files.filter((f) => typeof f.url === "string" && f.url.startsWith("https://")).map((f) => ({ url: f.url!, mime: f.content_type ?? "application/octet-stream" }));
}

export function falAdapter(fetchImpl: Fetch = fetch): ProviderAdapter {
  const call = (url: string, ctx: ProviderContext, init: RequestInit = {}) =>
    fetchImpl(url, { ...init, headers: { ...auth(ctx), ...(init.body ? { "content-type": "application/json" } : {}) }, ...(ctx.signal ? { signal: ctx.signal } : {}) });

  async function result(model: string, id: string, ctx: ProviderContext): Promise<ProviderResult> {
    const res = await call(`${BASE}/${appOf(model)}/requests/${encodeURIComponent(id)}`, ctx);
    if (!res.ok) return httpError(res, "fal");
    const outputs = outputsOf(await res.json());
    return outputs.length ? { state: "done", outputs } : { state: "error", retryable: false, message: "fal: completed without a media URL" };
  }

  return {
    manifest: {
      id: "fal",
      name: "fal.ai",
      capabilities: ["image.generate", "video.text_to_video", "video.image_to_video"],
      models: [
        { id: "bytedance/seedance-2.0/text-to-video", capability: "video.text_to_video", label: "Seedance 2.0", pricing: { unit: "second", cents: 30.34, checkedAt: "2026-11-03" } },
        { id: "fal-ai/nano-banana-2", capability: "image.generate", label: "Nano Banana 2", pricing: { unit: "image", cents: 8, checkedAt: "2026-11-03" } },
      ],
      auth: "api_key",
      lifecycle: "poll_or_webhook",
      cancellation: true,
      docsUrl: "https://fal.ai/docs/model-apis/model-endpoints/queue",
      verification: "mocked",
    },

    estimateCents(req) {
      const p = PRICES[req.modelId];
      if (!p) return undefined;
      if (p.perImage !== undefined) return Math.ceil(p.perImage * Number(req.input.num_images ?? 1));
      const secs = Number(req.input.duration);
      return Number.isFinite(secs) && secs > 0 ? Math.ceil(p.perSecond! * secs) : undefined;
    },

    async submit(req, ctx) {
      if (!MODEL.test(req.modelId)) return { state: "error", retryable: false, message: `fal: invalid model id ${req.modelId}` };
      const res = await call(`${BASE}/${req.modelId}`, ctx, { method: "POST", body: JSON.stringify(req.input) });
      if (!res.ok) return httpError(res, "fal");
      const { request_id } = (await res.json()) as { request_id?: string };
      if (!request_id) return { state: "error", retryable: true, message: "fal: submit returned no request_id" };
      return { state: "pending", externalId: `${req.modelId}#${request_id}`, pollAfterMs: 5000 };
    },

    async poll(externalId, ctx) {
      const [model, id] = externalId.split("#") as [string, string];
      const res = await call(`${BASE}/${appOf(model)}/requests/${encodeURIComponent(id)}/status`, ctx);
      if (!res.ok) return httpError(res, "fal");
      const { status } = (await res.json()) as { status?: string };
      if (status === "COMPLETED") return result(model, id, ctx);
      if (status === "IN_QUEUE" || status === "IN_PROGRESS") return { state: "pending", externalId, pollAfterMs: 5000 };
      return { state: "error", retryable: false, message: `fal: unexpected status ${String(status)}` };
    },

    async cancel(externalId, ctx) {
      const [model, id] = externalId.split("#") as [string, string];
      // 202 for a running request only signals it: it may still finish and bill
      await call(`${BASE}/${appOf(model)}/requests/${encodeURIComponent(id)}/cancel`, ctx, { method: "PUT" });
    },
  };
}
