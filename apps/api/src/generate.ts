/**
 * Runner handlers for the paid generation stages: `keyframe` and `scene_video` (fal) and `narration`
 * (ElevenLabs). Every call uses the project owner's own key (BYOK). VERIFICATION: mocked; never run live.
 *
 * The plan comes from the script stage's config.json (the same file assembly reads):
 *   scenes[i] = { image_prompt, video_prompt, duration (4..15 s) }, script = { "<line>": text }, voice_id.
 * The owner's ElevenLabs plan rate comes from projects.config.tts_cents_per_1k_chars; without it narration
 * has no estimate and the runner refuses to spend.
 */
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ProviderAdapter, ProviderRequest, ProviderResult } from "@feista/core";
import { type Fetch, type Word, elevenLabsAdapter, falAdapter, isFalMedia } from "@feista/providers";
import type pg from "pg";
import { asWorker } from "./db";
import { inputs, storeOutput } from "./media";
import { PermanentError, type StageContext, type StageHandler } from "./runner";
import type { Storage } from "./storage";

export interface GenerateDeps {
  pool: pg.Pool; // feista_runner
  storage: Storage;
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  /** How long one run waits on a provider job before handing it to a retry (which re-attaches, never resubmits). */
  maxWaitMs?: number;
}

const IMAGE_MODEL = "fal-ai/nano-banana-2";
const EDIT_MODEL = "fal-ai/nano-banana-2/edit"; // same model with reference images
const VIDEO_MODEL = "bytedance/seedance-2.0/image-to-video";
const TTS_MODEL = "eleven_multilingual_v2";
const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_DOWNLOAD = 300 * 1024 * 1024;

/**
 * Submit (or re-attach to the job this node already submitted) and wait for the result.
 * The job id is persisted before the first wait, so a crash or timeout never pays twice.
 */
export async function drive(deps: GenerateDeps, adapter: ProviderAdapter, ctx: StageContext, req: Omit<ProviderRequest, "idempotencyKey">) {
  const { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxWaitMs = 15 * 60_000 } = deps;
  const pc = { credential: await ctx.secret(adapter.manifest.id) };
  const poll = (id: string) => {
    if (!adapter.poll) throw new PermanentError(`${adapter.manifest.id} cannot resume job ${id}`);
    return adapter.poll(id, pc);
  };
  let r: ProviderResult = ctx.externalId ? await poll(ctx.externalId) : await adapter.submit({ ...req, idempotencyKey: ctx.idempotencyKey }, pc);
  let jobId = ctx.externalId;
  // An accepted job whose id we cannot record would be submitted (and billed) again by the retry:
  // cancel it best-effort and park the node for a person instead.
  const record = async (id: string) => {
    for (let i = 0; ; i++) {
      try {
        return await ctx.setExternalId(id);
      } catch (e) {
        if (i < 2) { await sleep(500 * (i + 1)); continue; }
        await adapter.cancel?.(id, pc).catch(() => {});
        throw new PermanentError(`${adapter.manifest.id} accepted job ${id} but recording it failed (${e instanceof Error ? e.message : "error"}); cancel requested, check the provider before retrying`);
      }
    }
  };
  const deadline = Date.now() + maxWaitMs;
  while (r.state === "pending") {
    if (r.externalId !== jobId) await record((jobId = r.externalId));
    if (Date.now() > deadline) throw new Error(`${adapter.manifest.id} job still running after ${maxWaitMs} ms; a retry re-attaches to it`);
    await sleep(Math.min(Math.max(r.pollAfterMs, 1000), 60_000));
    r = await poll(r.externalId);
  }
  if (r.state === "error") {
    // the job id is kept even when this looks fatal (a rotated key, a billed job without output): a retry
    // re-attaches rather than paying again. Only a new take clears it (runner save()).
    throw r.retryable ? new Error(r.message) : new PermanentError(r.message);
  }
  return r;
}

/** Fetch one provider output to a file. Only data: URLs and fal's media CDN; no redirects (no SSRF hop). */
export async function download(fetchImpl: Fetch, url: string, file: string): Promise<void> {
  const data = /^data:[\w.+/-]+;base64,([A-Za-z0-9+/=]*)$/.exec(url);
  if (data) return writeFile(file, Buffer.from(data[1]!, "base64"));
  if (!isFalMedia(url)) throw new PermanentError("refusing to download a provider output from an untrusted host");
  const res = await fetchImpl(url, { redirect: "error" });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_DOWNLOAD) throw new PermanentError("provider output too large");
  let n = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _e, cb) {
      n += chunk.length;
      cb(n > MAX_DOWNLOAD ? new PermanentError("provider output too large") : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), cap, createWriteStream(file));
}

export async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "feista-gen-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

interface Plan {
  scenes: { image_prompt: string; video_prompt: string; duration: number }[];
  script: Record<string, string>;
  voice_id?: string;
}

/** The script stage's config.json for the current take. Bad plans are permanent: retrying will not fix them. */
async function plan(deps: GenerateDeps, ctx: StageContext): Promise<Plan> {
  const a = (await inputs(deps, ctx.projectId)).find((x) => x.node_id === "script" && x.storage_key.endsWith("/config.json"));
  if (!a) throw new PermanentError("no config.json from the script stage");
  const p = await withTemp(async (dir) => {
    await deps.storage.get(a.storage_key, join(dir, "c.json"));
    return JSON.parse(await readFile(join(dir, "c.json"), "utf8")) as Partial<Plan>;
  }).catch((e) => { throw e instanceof SyntaxError ? new PermanentError("config.json is not valid JSON") : e; });
  if (!Array.isArray(p.scenes) || typeof p.script !== "object" || !p.script) throw new PermanentError("config.json lacks scenes or script");
  return p as Plan;
}

function scene(p: Plan, ctx: StageContext) {
  const s = p.scenes[ctx.scene ?? -1];
  if (!s || typeof s.image_prompt !== "string" || typeof s.video_prompt !== "string") throw new PermanentError(`config.json has no prompts for scene ${ctx.scene}`);
  if (!Number.isInteger(s.duration) || s.duration < 4 || s.duration > 15) throw new PermanentError(`scene ${ctx.scene}: duration must be 4..15 s`);
  return s;
}

function lines(p: Plan): [string, string][] {
  const out = Object.entries(p.script).filter(([n, t]) => /^[1-9][0-9]{0,2}$/.test(n) && typeof t === "string" && t.trim());
  if (!out.length || out.length !== Object.keys(p.script).length) throw new PermanentError("config.json script must map line numbers to text");
  return out;
}

export function generateHandlers(deps: GenerateDeps): Record<"characters" | "keyframe" | "scene_video" | "narration", StageHandler> {
  const fetchImpl = deps.fetch ?? fetch;
  const fal = falAdapter(fetchImpl);
  const tts = (ctx: StageContext) => {
    const rate = ctx.projectConfig.tts_cents_per_1k_chars;
    return elevenLabsAdapter(typeof rate === "number" && Number.isFinite(rate) && rate >= 0 ? { centsPer1kChars: rate } : {}, fetchImpl);
  };
  const estimate = (a: ProviderAdapter, input: Record<string, unknown>, modelId: string, capability: ProviderRequest["capability"]) => {
    const cents = a.estimateCents({ modelId, capability, input, idempotencyKey: "" });
    return cents === undefined ? undefined : { provider: a.manifest.id, cents };
  };

  const imageInput = (s: Plan["scenes"][number]) => ({ prompt: s.image_prompt, aspect_ratio: "9:16", resolution: "1K", num_images: 1 });
  /** The character sheet's fal URL, when the characters stage made one: keyframes then draw from it. */
  const sheetUrl = async (ctx: StageContext) => {
    const a = (await inputs(deps, ctx.projectId)).find((x) => x.node_id === "characters");
    return a?.source_url && isFalMedia(a.source_url) ? a.source_url : undefined;
  };
  const keyframeRequest = async (ctx: StageContext) => {
    const input = imageInput(scene(await plan(deps, ctx), ctx));
    const sheet = await sheetUrl(ctx);
    return sheet
      ? { modelId: EDIT_MODEL, input: { ...input, prompt: `The characters look exactly as in the reference sheet. ${input.prompt}`, image_urls: [sheet] } }
      : { modelId: IMAGE_MODEL, input };
  };
  const characterInput = async (ctx: StageContext) => {
    const a = (await inputs(deps, ctx.projectId)).find((x) => x.node_id === "concept" && x.storage_key.endsWith("/concept.json"));
    if (!a) throw new PermanentError("no concept.json from the concept stage");
    const c = await withTemp(async (dir) => {
      await deps.storage.get(a.storage_key, join(dir, "c.json"));
      return JSON.parse(await readFile(join(dir, "c.json"), "utf8")) as { characters?: { name?: unknown; look?: unknown }[] };
    });
    const cast = (c.characters ?? []).filter((x) => typeof x.name === "string" && typeof x.look === "string").slice(0, 3);
    if (!cast.length) return undefined; // an object or nature story: keyframes go without a sheet
    const style = typeof ctx.projectConfig.style === "string" ? ctx.projectConfig.style.slice(0, 300) : "soft 3D animated film look, warm cinematic lighting";
    return {
      prompt: `Character reference sheet on a plain light background: front, side and back view of each character, full body, consistent proportions. ` +
        `${cast.map((x) => `${String(x.name).slice(0, 60)}: ${String(x.look).slice(0, 400)}`).join(". ")}. Style: ${style}. Single image, no text or labels.`,
      aspect_ratio: "16:9", resolution: "1K", num_images: 1,
    };
  };
  /** Store fal's image under `rel` (extension from its type), keeping its URL for the stages that reuse it. */
  const storeImage = async (ctx: StageContext, img: { url: string; mime: string }, rel: string) => {
    const ext = IMAGE_EXT[img.mime]; // the stored mime is served later: never trust html/svg from a provider
    if (!ext) throw new PermanentError(`fal returned an unsupported image type ${img.mime.slice(0, 40)}`);
    await withTemp(async (dir) => {
      await download(fetchImpl, img.url, join(dir, "i"));
      await storeOutput(deps, ctx, `${rel}.${ext}`, join(dir, "i"), "image", img.mime, img.url);
    });
  };
  const cost = (c: number | undefined) => (c === undefined ? undefined : { reportedCents: c });
  const videoInput = (s: Plan["scenes"][number], imageUrl: string) => ({
    prompt: s.video_prompt, image_url: imageUrl, duration: String(s.duration), resolution: "720p", aspect_ratio: "9:16", generate_audio: true,
  });

  return {
    characters: {
      estimate: async (ctx) => {
        const input = await characterInput(ctx);
        return input ? estimate(fal, input, IMAGE_MODEL, "image.generate") : { provider: "fal", cents: 0 };
      },
      run: async (ctx) => {
        // re-attaching needs no input (and must not fail on a re-read of the concept after paying)
        const input = ctx.externalId ? {} : await characterInput(ctx);
        if (!input) return;
        const r = await drive(deps, fal, ctx, { modelId: IMAGE_MODEL, capability: "image.generate", input });
        await storeImage(ctx, r.outputs[0]!, "characters/sheet");
        return cost(r.reportedCents);
      },
    },

    keyframe: {
      estimate: async (ctx) => {
        const k = await keyframeRequest(ctx);
        return estimate(fal, k.input, k.modelId, "image.generate");
      },
      run: async (ctx) => {
        const k = await keyframeRequest(ctx);
        const r = await drive(deps, fal, ctx, { ...k, capability: "image.generate" });
        await storeImage(ctx, r.outputs[0]!, `keyframes/K${ctx.scene! + 1}`);
        return cost(r.reportedCents);
      },
    },

    scene_video: {
      // the estimate does not depend on the keyframe URL, only on duration and resolution
      estimate: async (ctx) => estimate(fal, videoInput(scene(await plan(deps, ctx), ctx), ""), VIDEO_MODEL, "video.image_to_video"),
      run: async (ctx) => {
        const s = scene(await plan(deps, ctx), ctx);
        const kf = (await inputs(deps, ctx.projectId)).find((a) => a.node_id === `keyframe:${ctx.scene}`);
        // shortcut: fal needs a URL it can fetch; we pass back fal's own keyframe URL. Upload stored files once fal media expiry bites.
        if (!kf?.source_url || !isFalMedia(kf.source_url)) throw new PermanentError(`keyframe:${ctx.scene} has no fal media URL to animate`);
        const r = await drive(deps, fal, ctx, { modelId: VIDEO_MODEL, capability: "video.image_to_video", input: videoInput(s, kf.source_url) });
        const v = r.outputs[0]!;
        await withTemp(async (dir) => {
          await download(fetchImpl, v.url, join(dir, "v.mp4"));
          await storeOutput(deps, ctx, `clips/S${ctx.scene! + 1}.mp4`, join(dir, "v.mp4"), "video", "video/mp4", v.url);
        });
        return r.reportedCents === undefined ? undefined : { reportedCents: r.reportedCents };
      },
    },

    narration: {
      estimate: async (ctx) => {
        const text = lines(await plan(deps, ctx)).map(([, t]) => t).join("");
        return estimate(tts(ctx), { text, voice_id: "x" }, TTS_MODEL, "audio.tts");
      },
      run: async (ctx) => {
        const p = await plan(deps, ctx);
        if (typeof p.voice_id !== "string") throw new PermanentError("config.json has no voice_id");
        const adapter = tts(ctx);
        const words: Record<string, Word[]> = {};
        // lines already spoken in this take (an earlier attempt) are reused, never re-billed
        const have = new Set((await asWorker(deps.pool, (tx) => tx.query(
          "select storage_key from assets where project_id = $1 and node_id = $2 and generation = $3", [ctx.projectId, ctx.nodeId, ctx.generation],
        ))).rows.map((a) => (a.storage_key as string).split("/").slice(3).join("/")));
        await withTemp(async (dir) => {
          for (const [n, text] of lines(p)) {
            const timingKey = `${ctx.projectId}/${ctx.nodeId}/g${ctx.generation}/vo/timing/L${n}.json`;
            if (have.has(`vo/L${n}.mp3`) && have.has(`vo/timing/L${n}.json`)) {
              await deps.storage.get(timingKey, join(dir, `L${n}.json`));
              words[n] = JSON.parse(await readFile(join(dir, `L${n}.json`), "utf8")) as Word[];
              continue;
            }
            const r = await drive(deps, adapter, ctx, { modelId: TTS_MODEL, capability: "audio.tts", input: { text, voice_id: p.voice_id } });
            const [audio, timing] = r.outputs;
            if (!audio || !timing) throw new PermanentError("elevenlabs returned no audio or timing");
            await download(fetchImpl, audio.url, join(dir, `L${n}.mp3`));
            await storeOutput(deps, ctx, `vo/L${n}.mp3`, join(dir, `L${n}.mp3`), "audio", "audio/mpeg");
            await download(fetchImpl, timing.url, join(dir, `L${n}.json`));
            await storeOutput(deps, ctx, `vo/timing/L${n}.json`, join(dir, `L${n}.json`), "other", "application/json");
            words[n] = JSON.parse(await readFile(join(dir, `L${n}.json`), "utf8")) as Word[];
          }
          await writeFile(join(dir, "words.json"), JSON.stringify(words));
          await storeOutput(deps, ctx, "vo/words.json", join(dir, "words.json"), "captions", "application/json");
        });
      },
    },
  };
}
