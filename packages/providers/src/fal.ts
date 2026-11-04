/**
 * fal.ai queue adapter (docs checked 2026-11-03, docs/PROVIDER_INTEGRATIONS.md §2).
 * Submit to queue.fal.run/{model}; status/result/cancel live under the owner/app prefix only.
 * VERIFICATION: mocked. Contract-tested against documented response shapes; never called live.
 */
import type { ProviderAdapter, ProviderContext, ProviderRequest, ProviderResult } from "@feista/core";
import { type Fetch, httpError, submitError, submitThrew } from "./http";

const BASE = "https://queue.fal.run";
// segments like "seedance-2.0": dots only between alphanumerics, so "." / ".." can never form a path segment
const SEG = "[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*";
const MODEL = new RegExp(`^${SEG}(?:/${SEG}){1,4}$`);

/**
 * List prices in cents (fal model pages, checked 2026-11-03/04). Anything not priced here (another model,
 * resolution or option) gets no estimate, and the runner then refuses to spend: under-reserving is the failure to avoid.
 */
const VIDEO_PER_SECOND: Record<string, Record<string, number>> = {
  "bytedance/seedance-2.0/text-to-video": { "720p": 30.34, "1080p": 68.2 }, // with audio
  "bytedance/seedance-2.0/fast/text-to-video": { "720p": 24.19 },
};
const IMAGE: Record<string, { base: number; resolution: Record<string, number>; webSearch: number }> = {
  "fal-ai/nano-banana-2": { base: 8, resolution: { "1K": 1, "2K": 1.5, "4K": 2 }, webSearch: 1.5 },
};

const appOf = (model: string) => model.split("/").slice(0, 2).join("/");
const auth = (ctx: ProviderContext) => ({ authorization: `Key ${ctx.credential}` });

/** Outputs are downloaded server-side later, so only fal's own media CDN is trusted (no SSRF to internal hosts). */
export function isFalMedia(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.port && (u.hostname === "fal.media" || u.hostname.endsWith(".fal.media"));
  } catch {
    return false;
  }
}

function outputsOf(body: unknown): { url: string; mime: string }[] {
  const b = body as { video?: { url?: string; content_type?: string }; images?: { url?: string; content_type?: string }[] };
  const files = [...(b.video ? [b.video] : []), ...(b.images ?? [])];
  return files.filter((f) => typeof f.url === "string" && isFalMedia(f.url)).map((f) => ({ url: f.url!, mime: f.content_type ?? "application/octet-stream" }));
}

export function falAdapter(fetchImpl: Fetch = fetch): ProviderAdapter {
  const call = (url: string, ctx: ProviderContext, init: RequestInit = {}) =>
    fetchImpl(url, { ...init, headers: { ...auth(ctx), ...(init.body ? { "content-type": "application/json" } : {}) }, ...(ctx.signal ? { signal: ctx.signal } : {}) });

  async function result(model: string, id: string, ctx: ProviderContext): Promise<ProviderResult> {
    const res = await call(`${BASE}/${appOf(model)}/requests/${encodeURIComponent(id)}`, ctx);
    if (!res.ok) return httpError(res, "fal");
    const outputs = outputsOf(await res.json().catch(() => ({})));
    return outputs.length ? { state: "done", outputs } : { state: "error", retryable: false, message: "fal: completed without a media URL" };
  }

  return {
    manifest: {
      id: "fal",
      name: "fal.ai",
      capabilities: ["image.generate", "video.text_to_video", "video.image_to_video"],
      models: [
        { id: "bytedance/seedance-2.0/text-to-video", capability: "video.text_to_video", label: "Seedance 2.0", pricing: { unit: "second", cents: 30.34, checkedAt: "2026-11-03", note: "720p with audio; 1080p 68.2c/s" } },
        { id: "fal-ai/nano-banana-2", capability: "image.generate", label: "Nano Banana 2", pricing: { unit: "image", cents: 8, checkedAt: "2026-11-03" } },
      ],
      auth: "api_key",
      lifecycle: "poll_or_webhook",
      cancellation: true,
      docsUrl: "https://fal.ai/docs/model-apis/model-endpoints/queue",
      verification: "mocked",
    },

    estimateCents(req) {
      const video = VIDEO_PER_SECOND[req.modelId];
      if (video) {
        const rate = video[String(req.input.resolution)]; // explicit resolution only: the model default may change
        const secs = Number(req.input.duration); // "auto" or missing => unknown length
        return rate !== undefined && Number.isFinite(secs) && secs > 0 ? Math.ceil(rate * secs) : undefined;
      }
      const img = IMAGE[req.modelId];
      if (img) {
        const n = req.input.num_images ?? 1;
        const mult = img.resolution[String(req.input.resolution ?? "1K")];
        if (!Number.isInteger(n) || (n as number) < 1 || mult === undefined) return undefined;
        return Math.ceil((n as number) * (img.base * mult + (req.input.enable_web_search ? img.webSearch : 0)));
      }
      return undefined;
    },

    async submit(req, ctx) {
      if (!MODEL.test(req.modelId)) return { state: "error", retryable: false, message: `fal: invalid model id ${req.modelId}` };
      let res: Response;
      try {
        res = await call(`${BASE}/${req.modelId}`, ctx, { method: "POST", body: JSON.stringify(req.input) });
      } catch (e) {
        return submitThrew("fal", e);
      }
      if (!res.ok) return submitError(res, "fal");
      const { request_id } = (await res.json().catch(() => ({}))) as { request_id?: string };
      if (!request_id) return { state: "error", retryable: false, message: "fal: submit accepted without a request_id; check the provider before retrying" };
      return { state: "pending", externalId: `${req.modelId}#${request_id}`, pollAfterMs: 5000 };
    },

    async poll(externalId, ctx) {
      const [model, id] = externalId.split("#") as [string, string];
      const res = await call(`${BASE}/${appOf(model)}/requests/${encodeURIComponent(id)}/status`, ctx);
      if (!res.ok) return httpError(res, "fal");
      const st = (await res.json().catch(() => ({}))) as { status?: string; error?: unknown; error_type?: unknown };
      const status = st.status;
      // a failed job also reports COMPLETED, with error / error_type set
      if (status === "COMPLETED" && (st.error || st.error_type)) {
        return { state: "error", retryable: false, message: `fal: job failed (${String(st.error_type ?? "error")}): ${String(st.error ?? "").slice(0, 200)}` };
      }
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
