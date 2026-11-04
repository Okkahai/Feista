import { ProviderRegistry } from "@feista/core";
import { describe, expect, it } from "vitest";
import { elevenLabsAdapter, falAdapter, wordsFromAlignment } from "./index";

// Fixtures follow the documented response shapes (checked 2026-11-03). No network: these are mocks,
// so the adapters stay at verification "mocked" until a user-supplied key runs them live.
type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function fakeFetch(routes: [RegExp, number, unknown][]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, ...(init.body ? { body: String(init.body) } : {}) });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) throw new Error(`unexpected request ${url}`);
    return new Response(typeof hit[2] === "string" ? hit[2] : JSON.stringify(hit[2]), { status: hit[1] });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const KEY = "fal-key-id:fal-key-secret-0123456789";
const ctx = { credential: KEY };
const SEEDANCE = "bytedance/seedance-2.0/text-to-video";

describe("fal", () => {
  it("submits, polls under owner/app, and returns https outputs", async () => {
    const { f, calls } = fakeFetch([
      [/\/requests\/r1\/status$/, 200, { status: "COMPLETED" }],
      [/\/requests\/r1$/, 200, { video: { url: "https://v3.fal.media/files/x/out.mp4", content_type: "video/mp4" } }],
      [/queue\.fal\.run\/bytedance\/seedance-2\.0\/text-to-video$/, 200, { request_id: "r1" }],
    ]);
    const fal = falAdapter(f);
    const sub = await fal.submit({ modelId: SEEDANCE, capability: "video.text_to_video", input: { prompt: "a fox", duration: 5 }, idempotencyKey: "k" }, ctx);
    expect(sub).toEqual({ state: "pending", externalId: `${SEEDANCE}#r1`, pollAfterMs: 5000 });
    expect(await fal.poll!(`${SEEDANCE}#r1`, ctx)).toEqual({ state: "done", outputs: [{ url: "https://v3.fal.media/files/x/out.mp4", mime: "video/mp4" }] });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST https://queue.fal.run/${SEEDANCE}`,
      "GET https://queue.fal.run/bytedance/seedance-2.0/requests/r1/status", // full endpoint path here would 405
      "GET https://queue.fal.run/bytedance/seedance-2.0/requests/r1",
    ]);
    expect(calls.every((c) => c.headers.authorization === `Key ${KEY}`)).toBe(true);
    expect(JSON.parse(calls[0]!.body!)).toEqual({ prompt: "a fox", duration: 5 });
  });

  it("maps queue states and HTTP errors to retry decisions, without echoing the key", async () => {
    const pending = falAdapter(fakeFetch([[/status$/, 200, { status: "IN_PROGRESS" }]]).f);
    expect((await pending.poll!(`${SEEDANCE}#r1`, ctx)).state).toBe("pending");
    // a paid submit retries only when the provider provably rejected it up front: a 5xx may have been accepted
    for (const [code, retryable] of [[401, false], [422, false], [429, true], [503, false]] as const) {
      const r = await falAdapter(fakeFetch([[/./, code, "nope"]]).f).submit({ modelId: SEEDANCE, capability: "video.text_to_video", input: {}, idempotencyKey: "k" }, ctx);
      expect(r).toMatchObject({ state: "error", retryable });
      expect(JSON.stringify(r)).not.toContain("fal-key-secret");
    }
    // reads (status/result) are safe to retry on 5xx
    expect(await falAdapter(fakeFetch([[/status$/, 503, "x"]]).f).poll!(`${SEEDANCE}#r1`, ctx)).toMatchObject({ retryable: true });
    const offline = falAdapter((async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch);
    expect(await offline.submit({ modelId: SEEDANCE, capability: "video.text_to_video", input: {}, idempotencyKey: "k" }, ctx)).toMatchObject({ state: "error", retryable: false });
    // a failed job reports COMPLETED with an error: surface it, do not fetch a "result"
    const failed = fakeFetch([[/status$/, 200, { status: "COMPLETED", error: "content policy", error_type: "content_policy_violation" }]]);
    expect(await falAdapter(failed.f).poll!(`${SEEDANCE}#r1`, ctx)).toMatchObject({ state: "error", retryable: false, message: expect.stringMatching(/content_policy_violation/) });
    expect(failed.calls).toHaveLength(1);
    for (const url of ["file:///etc/passwd", "https://169.254.169.254/latest/meta-data", "https://evil.example/fal.media/x.mp4", "https://v3.fal.media:8443/x.mp4"]) {
      const noUrl = falAdapter(fakeFetch([[/status$/, 200, { status: "COMPLETED" }], [/r1$/, 200, { video: { url } }]]).f);
      expect(await noUrl.poll!(`${SEEDANCE}#r1`, ctx), url).toMatchObject({ state: "error", retryable: false });
    }
    for (const modelId of ["../../x", "fal-ai/x/../../evil/app", "fal-ai/./x", "fal-ai/x..y/z", "Fal-AI/x"]) {
      const bad = await falAdapter(fakeFetch([]).f).submit({ modelId, capability: "image.generate", input: {}, idempotencyKey: "k" }, ctx);
      expect(bad, modelId).toMatchObject({ state: "error", retryable: false });
    }
  });

  it("estimates from list prices and refuses to guess", () => {
    const fal = falAdapter(fakeFetch([]).f);
    const req = (modelId: string, input: Record<string, unknown>) => ({ modelId, capability: "video.text_to_video" as const, input, idempotencyKey: "k" });
    expect(fal.estimateCents(req(SEEDANCE, { duration: 5, resolution: "720p" }))).toBe(152); // 5 s x 30.34c, rounded up
    expect(fal.estimateCents(req(SEEDANCE, { duration: 10, resolution: "1080p" }))).toBe(682);
    expect(fal.estimateCents(req(SEEDANCE, { duration: 5 }))).toBeUndefined(); // model-default resolution: unknown price
    expect(fal.estimateCents(req(SEEDANCE, { duration: 15, resolution: "4k" }))).toBeUndefined(); // token-billed: not priced
    expect(fal.estimateCents(req(SEEDANCE, { duration: "auto", resolution: "720p" }))).toBeUndefined();
    expect(fal.estimateCents(req("fal-ai/nano-banana-2", { num_images: 2 }))).toBe(16);
    expect(fal.estimateCents(req("fal-ai/nano-banana-2", { num_images: 1, resolution: "4K", enable_web_search: true }))).toBe(18); // 16 + 1.5, rounded up
    for (const num_images of [0, "abc", 1.5]) expect(fal.estimateCents(req("fal-ai/nano-banana-2", { num_images }))).toBeUndefined();
    expect(fal.estimateCents(req("someone/unknown-model", { duration: 5 }))).toBeUndefined();
  });
});

describe("elevenlabs", () => {
  const alignment = {
    characters: [..."Hi there."],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  };

  it("turns character timings into words.json entries", () => {
    expect(wordsFromAlignment(alignment)).toEqual([["Hi", 0, 0.2], ["there.", 0.3, 0.9]]);
    expect(() => wordsFromAlignment({ ...alignment, character_end_times_seconds: [0] })).toThrow();
  });

  it("calls with-timestamps with the user's key and returns audio + words", async () => {
    const { f, calls } = fakeFetch([[/with-timestamps$/, 200, { audio_base64: "SUQz", alignment, normalized_alignment: alignment }]]);
    const r = await elevenLabsAdapter({}, f).submit({ modelId: "eleven_multilingual_v2", capability: "audio.tts", input: { text: "Hi there.", voice_id: "30fc8796" }, idempotencyKey: "k" }, { credential: "xi-secret-key" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.elevenlabs.io/v1/text-to-speech/30fc8796/with-timestamps" });
    expect(calls[0]!.headers["xi-api-key"]).toBe("xi-secret-key");
    expect(r.state).toBe("done");
    if (r.state !== "done") return;
    expect(r.outputs[0]).toEqual({ url: "data:audio/mpeg;base64,SUQz", mime: "audio/mpeg" });
    expect(JSON.parse(Buffer.from(r.outputs[1]!.url.split(",")[1]!, "base64").toString())).toEqual([["Hi", 0, 0.2], ["there.", 0.3, 0.9]]);
  });

  it("never retries once the characters may be billed", async () => {
    const send = (f: typeof fetch) => elevenLabsAdapter({}, f).submit({ modelId: "m", capability: "audio.tts", input: { text: "Hi", voice_id: "v1" }, idempotencyKey: "k" }, { credential: "c" });
    expect(await send(fakeFetch([[/./, 200, { audio_base64: "SUQz", alignment: { ...alignment, character_end_times_seconds: [0] } }]]).f)).toMatchObject({ state: "error", retryable: false });
    expect(await send(fakeFetch([[/./, 200, "not json"]]).f)).toMatchObject({ state: "error", retryable: false });
    expect(await send(fakeFetch([[/./, 500, "boom"]]).f)).toMatchObject({ state: "error", retryable: false });
    expect(await send(fakeFetch([[/./, 429, "busy"]]).f)).toMatchObject({ state: "error", retryable: true });
  });

  it("validates input and has no estimate without the user's plan rate", async () => {
    const el = elevenLabsAdapter({}, fakeFetch([]).f);
    for (const input of [{ text: "", voice_id: "v" }, { text: "x", voice_id: "../v" }])
      expect(await el.submit({ modelId: "m", capability: "audio.tts", input, idempotencyKey: "k" }, { credential: "c" })).toMatchObject({ state: "error", retryable: false });
    const req = { modelId: "m", capability: "audio.tts" as const, input: { text: "x".repeat(1500) }, idempotencyKey: "k" };
    expect(el.estimateCents(req)).toBeUndefined();
    expect(elevenLabsAdapter({ centsPer1kChars: 22 }).estimateCents(req)).toBe(33);
  });
});

describe("registry", () => {
  it("offers only providers the user has connected, preferred first", () => {
    const reg = new ProviderRegistry();
    reg.register(falAdapter());
    reg.register(elevenLabsAdapter());
    expect(reg.candidates("audio.tts", new Set(["fal"]))).toHaveLength(0);
    expect(reg.candidates("video.text_to_video", new Set(["fal", "elevenlabs"])).map((a) => a.manifest.id)).toEqual(["fal"]);
    expect([falAdapter(), elevenLabsAdapter()].every((a) => a.manifest.verification === "mocked")).toBe(true);
  });
});
