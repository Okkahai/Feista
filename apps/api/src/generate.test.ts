import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { parse } from "pg-connection-string";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KeyRing } from "@feista/vault";
import { createApp } from "./app";
import { devTokens } from "./auth";
import { asUser } from "./db";
import { download, generateHandlers } from "./generate";
import { storeOutput } from "./media";
import { type StageHandler, runOnce } from "./runner";
import { localStorage } from "./storage";

// Mocked providers only: a fake fetch stands in for fal and ElevenLabs. Nothing leaves the machine.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("run via `pnpm test` (db/with-temp-db.sh provides DATABASE_URL)");
const cfg = (user: string) => ({ ...(parse(url) as unknown as pg.PoolConfig), user, password: "feista-test", max: 4 });
const admin = new pg.Pool({ connectionString: url, max: 2 });
const api = new pg.Pool(cfg("feista_api"));
const pool = new pg.Pool(cfg("feista_runner"));
const ring = KeyRing.parse(`1:${randomBytes(32).toString("base64")}`, 1);
const tokens = devTokens(randomBytes(32));
const app = createApp({ pool: api, ring, authenticate: tokens.authenticate, log: () => {} });
const dir = mkdtempSync(join(tmpdir(), "feista-gen-test-"));
const storage = localStorage(join(dir, "store"));
const U = randomUUID();
const FAL_KEY = "fal-test-key-0123456789";
const XI_KEY = "xi-test-key-0123456789";

const PLAN = {
  scenes: [{ image_prompt: "a fox on a log", video_prompt: "the log rolls", duration: 5 }],
  script: { "1": "Hi there.", "2": "Bye." },
  voice_id: "voice-1",
};

/** Fake fal + ElevenLabs. `statusSeq` is what successive status polls of one job report. */
function fakeProviders(opts: { statusSeq?: string[]; failJob?: boolean; onSubmit?: () => Promise<void>; ttsFailOnce?: string } = {}) {
  const calls: { method: string; url: string; auth: string | undefined; body?: unknown; redirect?: string | undefined }[] = [];
  const polls = new Map<string, number>();
  const seenExternal: (string | null)[] = [];
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  const f = async (input: string | URL | Request, init: RequestInit = {}) => {
    const u = String(input);
    const h = (init.headers ?? {}) as Record<string, string>;
    calls.push({ method: init.method ?? "GET", url: u, auth: h.authorization ?? h["xi-api-key"], ...(init.body ? { body: JSON.parse(String(init.body)) } : {}), redirect: init.redirect });
    let m: RegExpExecArray | null;
    if ((m = /^https:\/\/queue\.fal\.run\/(fal-ai\/nano-banana-2(?:\/edit)?|bytedance\/seedance-2\.0\/image-to-video)$/.exec(u)) && init.method === "POST") {
      await opts.onSubmit?.();
      return json({ request_id: `${m[1]!.startsWith("fal-ai") ? "img" : "vid"}-${calls.length}` });
    }
    if (/\/cancel$/.test(u) && init.method === "PUT") return new Response(null, { status: 202 });
    if ((m = /\/requests\/([a-z]+-\d+)\/status$/.exec(u))) {
      const n = (polls.get(m[1]!) ?? 0) + 1;
      polls.set(m[1]!, n);
      seenExternal.push((await admin.query("select external_id from stage_runs where external_id like '%#' || $1", [m[1]])).rows[0]?.external_id ?? null);
      const seq = opts.statusSeq ?? ["IN_PROGRESS", "COMPLETED"];
      const status = seq[Math.min(n, seq.length) - 1];
      return json(opts.failJob && status === "COMPLETED" ? { status, error: "nsfw", error_type: "content_policy" } : { status });
    }
    if ((m = /\/requests\/(img-\d+)$/.exec(u))) return json({ images: [{ url: `https://v3.fal.media/files/${m[1]}.png`, content_type: "image/png" }] });
    if ((m = /\/requests\/(vid-\d+)$/.exec(u))) return json({ video: { url: `https://v3.fal.media/files/${m[1]}.mp4`, content_type: "video/mp4" } });
    if (u.startsWith("https://v3.fal.media/files/")) return new Response(`bytes of ${u}`);
    if (u.startsWith("https://api.elevenlabs.io/")) {
      const text = (JSON.parse(String(init.body)) as { text: string }).text;
      if (text === opts.ttsFailOnce) {
        delete opts.ttsFailOnce;
        return new Response("rate limited", { status: 429 });
      }
      return json({
        audio_base64: Buffer.from(`mp3:${text}`).toString("base64"),
        alignment: { characters: [...text], character_start_times_seconds: [...text].map((_, i) => i / 10), character_end_times_seconds: [...text].map((_, i) => (i + 1) / 10) },
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetch: f as typeof fetch, calls, polls, seenExternal };
}

async function project(config: Record<string, unknown> = {}) {
  const pid = await asUser(api, U, async (tx) => {
    const id = (await tx.query(
      `insert into projects (owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction, config)
       values (app_user(), 'story', 'g', 1, 10000, 10000, 0.9, $1) returning id`,
      [config],
    )).rows[0].id as string;
    await tx.query("insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses) values ($1, 'concept', 'queued', 3, 2)", [id]);
    return id;
  });
  return pid;
}

const planFile = join(dir, "plan.json");
const free = (fn?: StageHandler["run"]): StageHandler => ({ estimate: () => ({ provider: "fake", cents: 0 }), run: fn ?? (async () => {}) });
const stubs = {
  concept: free(),
  script: free(async (ctx) => storeOutput({ pool, storage }, ctx, "config.json", planFile, "other", "application/json")),
  characters: free(),
};
async function drain(handlers: Record<string, StageHandler>) {
  for (let i = 0; i < 50; i++) if (!(await runOnce({ pool, ring, handlers, delayMs: () => 0, log: () => {} }))) return;
  throw new Error("runner did not go idle");
}
const runsOf = async (pid: string) =>
  Object.fromEntries((await admin.query("select node_id, status, error, external_id from stage_runs where project_id = $1", [pid])).rows.map((r) => [r.node_id, r]));
const gen = (p: ReturnType<typeof fakeProviders>, maxWaitMs?: number) =>
  generateHandlers({ pool, storage, fetch: p.fetch, sleep: async () => {}, ...(maxWaitMs === undefined ? {} : { maxWaitMs }) });

beforeAll(async () => {
  await admin.query("alter role feista_api login password 'feista-test'");
  await admin.query("alter role feista_runner login password 'feista-test'");
  await admin.query("insert into users (id, email) values ($1, $2)", [U, `${U}@x.test`]);
  for (const [provider, secret] of [["fal", FAL_KEY], ["elevenlabs", XI_KEY]]) {
    const res = await app.request("/v1/credentials", {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.sign(U)}`, "content-type": "application/json" },
      body: JSON.stringify({ provider, secret }),
    });
    expect(res.status).toBe(201);
  }
});
beforeEach(async () => {
  writeFileSync(planFile, JSON.stringify(PLAN));
  await admin.query("update stage_runs set status = 'cancelled' where status in ('queued', 'running', 'awaiting_review')");
});
afterAll(async () => {
  await Promise.all([api.end(), pool.end()]);
  await admin.end();
});

describe("generation stages (mocked providers)", () => {
  it("keyframe then image-to-video then narration, on the owner's own keys, with the job id saved before waiting", async () => {
    const p = fakeProviders();
    const pid = await project({ tts_cents_per_1k_chars: 30 });
    await drain({ ...gen(p), ...stubs });
    const st = await runsOf(pid);
    expect(st["keyframe:0"]).toMatchObject({ status: "completed" });
    expect(st["scene_video:0"]).toMatchObject({ status: "completed", error: null });
    expect(st.narration).toMatchObject({ status: "completed", error: null });

    const submits = p.calls.filter((c) => c.method === "POST");
    expect(submits.map((c) => c.url)).toEqual(expect.arrayContaining([
      "https://queue.fal.run/fal-ai/nano-banana-2", "https://queue.fal.run/bytedance/seedance-2.0/image-to-video",
    ]));
    expect(p.calls.filter((c) => c.url.includes("fal.run")).every((c) => c.auth === `Key ${FAL_KEY}`)).toBe(true);
    expect(p.calls.filter((c) => c.url.includes("elevenlabs")).every((c) => c.auth === XI_KEY)).toBe(true);
    // the video is animated from the keyframe fal returned, and each media download refuses redirects
    const vid = submits.find((c) => c.url.endsWith("image-to-video"))!;
    expect(vid.body).toMatchObject({ image_url: expect.stringMatching(/^https:\/\/v3\.fal\.media\/files\/img-\d+\.png$/), duration: "5", resolution: "720p", aspect_ratio: "9:16" });
    expect(p.calls.filter((c) => c.url.includes("fal.media")).every((c) => c.redirect === "error")).toBe(true);
    // while a job was pending, its id was already in stage_runs
    expect(p.seenExternal.length).toBeGreaterThan(0);
    expect(p.seenExternal.every((x) => x !== null)).toBe(true);

    const assets = Object.fromEntries((await admin.query("select storage_key, kind, source_url from assets where project_id = $1", [pid])).rows.map((a) => [a.storage_key.split("/").slice(1).join("/"), a]));
    expect(assets["keyframe:0/g1/keyframes/K1.png"]).toMatchObject({ kind: "image", source_url: vid.body && (vid.body as { image_url: string }).image_url });
    expect(assets["scene_video:0/g1/clips/S1.mp4"]).toMatchObject({ kind: "video" });
    expect(assets["narration/g1/vo/L1.mp3"]).toBeDefined();
    const words = JSON.parse(readFileSync(join(dir, "store", pid, "narration/g1/vo/words.json"), "utf8"));
    expect(words).toEqual({ "1": [["Hi", 0, 0.2], ["there.", 0.3, 0.9]], "2": [["Bye.", 0, 0.4]] });
    expect(readFileSync(join(dir, "store", pid, "narration/g1/vo/L2.mp3"), "utf8")).toBe("mp3:Bye.");

    const ledger = (await admin.query("select node_id, estimated_cents from ledger where project_id = $1 and provider <> 'fake' order by node_id", [pid])).rows;
    expect(ledger).toEqual([
      { node_id: "keyframe:0", estimated_cents: 8 },
      { node_id: "narration", estimated_cents: 1 }, // 13 chars at 30c/1k
      { node_id: "scene_video:0", estimated_cents: 152 }, // 5 s x 30.34c
    ]);
  });

  it("the characters stage draws a sheet from the concept, and keyframes are drawn from that sheet", async () => {
    const p = fakeProviders();
    const pid = await project();
    const conceptFile = join(dir, "concept.json");
    writeFileSync(conceptFile, JSON.stringify({ title: "t", characters: [{ name: "Rex", look: "a small red fox with a blue scarf" }] }));
    const withConcept = { ...stubs, concept: free(async (ctx) => storeOutput({ pool, storage }, ctx, "concept.json", conceptFile, "other", "application/json")) };
    const { characters, keyframe } = gen(p);
    await drain({ ...withConcept, characters, keyframe });
    const st = await runsOf(pid);
    expect(st.characters).toMatchObject({ status: "completed" });
    expect(st["keyframe:0"]).toMatchObject({ status: "completed" });
    const [sheetCall, keyCall] = p.calls.filter((c) => c.method === "POST");
    expect(sheetCall).toMatchObject({ url: "https://queue.fal.run/fal-ai/nano-banana-2", body: { aspect_ratio: "16:9", prompt: expect.stringContaining("Rex: a small red fox with a blue scarf") } });
    const sheet = (await admin.query("select source_url from assets where project_id = $1 and node_id = 'characters'", [pid])).rows[0].source_url as string;
    expect(sheet).toMatch(/^https:\/\/v3\.fal\.media\//);
    expect(keyCall).toMatchObject({ url: "https://queue.fal.run/fal-ai/nano-banana-2/edit", body: { image_urls: [sheet], aspect_ratio: "9:16", prompt: expect.stringMatching(/^The characters look exactly as in the reference sheet\. a fox on a log/) } });
    // the edit job is polled under the app prefix only
    expect(p.calls.some((c) => /\/fal-ai\/nano-banana-2\/requests\/img-\d+\/status$/.test(c.url))).toBe(true);
    expect((await admin.query("select node_id, estimated_cents from ledger where project_id = $1 and provider = 'fal' order by node_id", [pid])).rows)
      .toEqual([{ node_id: "characters", estimated_cents: 8 }, { node_id: "keyframe:0", estimated_cents: 8 }]);
  });

  it("a run that times out hands the job to the retry, which re-attaches instead of paying again", async () => {
    const p = fakeProviders({ statusSeq: ["IN_PROGRESS", "COMPLETED"] });
    const pid = await project();
    await drain({ ...stubs, keyframe: gen(p, -1).keyframe }); // every wait is already past its deadline
    expect((await runsOf(pid))["keyframe:0"]).toMatchObject({ status: "completed" });
    expect(p.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect([...p.polls.values()]).toEqual([2]);
  });

  it("a worker that died mid-job is replaced by one that polls the saved job, never resubmits", async () => {
    const p = fakeProviders({ statusSeq: ["COMPLETED"] });
    const pid = await project();
    await drain(stubs); // keyframe:0 now queued
    await admin.query("update stage_runs set external_id = 'fal-ai/nano-banana-2#img-77' where project_id = $1 and node_id = 'keyframe:0'", [pid]);
    await admin.query("update projects set budget_limit_cents = 0 where id = $1", [pid]); // the job is already paid for: no second budget gate
    await drain({ keyframe: gen(p).keyframe });
    expect((await runsOf(pid))["keyframe:0"]).toMatchObject({ status: "completed" });
    expect(p.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(p.calls[0]!.url).toBe("https://queue.fal.run/fal-ai/nano-banana-2/requests/img-77/status");
  });

  it("an accepted job whose id cannot be recorded is cancelled and parked, never resubmitted", async () => {
    let pid = "";
    // another worker steals the lease right after fal accepts, so the id write matches no row
    const p = fakeProviders({ onSubmit: async () => void (await admin.query("update stage_runs set lease_until = now() + interval '1 hour' where project_id = $1 and node_id = 'keyframe:0'", [pid])) });
    pid = await project();
    await drain({ ...stubs, keyframe: gen(p).keyframe });
    expect(p.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(p.calls.filter((c) => c.method === "PUT").map((c) => c.url)).toEqual([expect.stringMatching(/\/requests\/img-\d+\/cancel$/)]);
  });

  it("a narration retry reuses lines already spoken in this take", async () => {
    const p = fakeProviders({ ttsFailOnce: "Bye." });
    const pid = await project({ tts_cents_per_1k_chars: 30 });
    await drain({ ...stubs, narration: gen(p).narration });
    expect((await runsOf(pid)).narration).toMatchObject({ status: "completed" });
    expect(p.calls.filter((c) => c.url.includes("elevenlabs")).map((c) => (c.body as { text: string }).text)).toEqual(["Hi there.", "Bye.", "Bye."]);
    expect(JSON.parse(readFileSync(join(dir, "store", pid, "narration/g1/vo/words.json"), "utf8"))).toHaveProperty("1", [["Hi", 0, 0.2], ["there.", 0.3, 0.9]]);
  });

  it("a new take forgets the previous take's job id", async () => {
    const pid = await project();
    await drain(stubs);
    await admin.query("update stage_runs set status = 'awaiting_review', spend_pending_cents = 8, external_id = 'fal-ai/nano-banana-2#img-1' where project_id = $1 and node_id = 'keyframe:0'", [pid]);
    const res = await app.request(`/v1/projects/${pid}/runs/keyframe:0/approve`, { method: "POST", headers: { authorization: `Bearer ${tokens.sign(U)}` } });
    expect(res.status).toBe(204);
    expect((await admin.query("select generation, external_id from stage_runs where project_id = $1 and node_id = 'keyframe:0'", [pid])).rows[0]).toEqual({ generation: 2, external_id: null });
  });

  it("a job the provider failed fails the node permanently but keeps its id, so a retry never pays again", async () => {
    const p = fakeProviders({ statusSeq: ["COMPLETED"], failJob: true });
    const pid = await project();
    await drain({ ...stubs, keyframe: gen(p).keyframe });
    expect((await runsOf(pid))["keyframe:0"]).toMatchObject({ status: "failed", external_id: expect.stringMatching(/^fal-ai\/nano-banana-2#img-\d+$/), error: expect.stringMatching(/content_policy/) });
    expect(p.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("narration refuses to spend without the owner's TTS rate, and bad plans fail without calling anyone", async () => {
    const p = fakeProviders();
    const pid = await project(); // no tts_cents_per_1k_chars
    writeFileSync(planFile, JSON.stringify({ ...PLAN, scenes: [{ ...PLAN.scenes[0], duration: 60 }] }));
    await drain({ ...gen(p), ...stubs });
    const st = await runsOf(pid);
    expect(st.narration).toMatchObject({ status: "failed", error: "paid stage has no cost estimate" });
    expect(st["keyframe:0"]).toMatchObject({ status: "failed", error: expect.stringMatching(/duration must be 4..15/) });
    expect(p.calls).toHaveLength(0);
  });
});

describe("download", () => {
  it("accepts data URLs and fal media only, without following redirects", async () => {
    const seen: RequestInit[] = [];
    const f = (async (_u: string, init: RequestInit) => (seen.push(init), new Response("ok"))) as unknown as typeof fetch;
    const out = join(dir, "dl");
    await download(f, `data:audio/mpeg;base64,${Buffer.from("hello").toString("base64")}`, out);
    expect(readFileSync(out, "utf8")).toBe("hello");
    await download(f, "https://v3.fal.media/files/x.png", out);
    expect(seen[0]).toMatchObject({ redirect: "error" });
    for (const bad of ["http://v3.fal.media/x", "https://169.254.169.254/latest", "https://fal.media.evil.test/x", "https://v3.fal.media:8443/x", "file:///etc/passwd"])
      await expect(download(f, bad, out), bad).rejects.toThrow(/untrusted host/);
    expect(seen).toHaveLength(1);
  });
});
