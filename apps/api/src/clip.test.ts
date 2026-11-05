import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { parse } from "pg-connection-string";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KeyRing } from "@feista/vault";
import { createApp } from "./app";
import { devTokens } from "./auth";
import { llmHandlers, toHighlights, transcriptText } from "./llm";
import { clipHandlers, sourceKey, storeOutput } from "./media";
import { type StageHandler, runOnce } from "./runner";
import { localStorage } from "./storage";

// Clip Studio end to end: real FFmpeg + the media worker, a fake Anthropic API, a stubbed transcriber
// (faster-whisper's model is a download). No provider is called.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("run via `pnpm test` (db/with-temp-db.sh provides DATABASE_URL)");
const cfg = (user: string) => ({ ...(parse(url) as unknown as pg.PoolConfig), user, password: "feista-test", max: 4 });
const admin = new pg.Pool({ connectionString: url, max: 2 });
const api = new pg.Pool(cfg("feista_api"));
const pool = new pg.Pool(cfg("feista_runner"));
const ring = KeyRing.parse(`1:${randomBytes(32).toString("base64")}`, 1);
const tokens = devTokens(randomBytes(32));
const app = createApp({ pool: api, ring, authenticate: tokens.authenticate, log: () => {} });
const dir = mkdtempSync(join(tmpdir(), "feista-clip-test-"));
const storage = localStorage(join(dir, "store"));
const cmd = [process.env.FEISTA_MEDIA_PYTHON ?? "python3", "-m", "feista_media.cli"];
process.env.PYTHONPATH = resolve(__dirname, "../../../workers/media");
const U = randomUUID();
const auth = { authorization: `Bearer ${tokens.sign(U)}`, "content-type": "application/json" };

const WORDS = Array.from({ length: 100 }, (_, i) => [`word${i}`, i * 0.5, i * 0.5 + 0.4]);
const PICKS = { clips: [
  { start: 22, end: 44, title: "The clutch", hook: "word44 word45", why: "a full play" },
  { start: 2, end: 20, title: "Warm-up", hook: "word4", why: "a laugh" },
] };

function fakeAnthropic(answer: unknown) {
  const bodies: Record<string, unknown>[] = [];
  const f = async (input: string | URL | Request, init: RequestInit = {}) => {
    const req = new Request(input, init);
    bodies.push((await req.json()) as Record<string, unknown>);
    return new Response(JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5",
      content: [{ type: "text", text: JSON.stringify(answer) }], stop_reason: "end_turn", stop_sequence: null, stop_details: null,
      usage: { input_tokens: 1000, output_tokens: 500 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch: f as typeof fetch, bodies };
}

const create = (body: Record<string, unknown>) =>
  app.request("/v1/projects", { method: "POST", headers: auth, body: JSON.stringify({ kind: "clip", title: "Friday stream", sceneCount: 2, budgetLimitCents: 10000, approvalThresholdCents: 10000, warnFraction: 0.9, ...body }) });
const runsOf = async (pid: string) =>
  Object.fromEntries((await admin.query("select node_id, status, error from stage_runs where project_id = $1", [pid])).rows.map((r) => [r.node_id, r]));
async function drain(handlers: Record<string, StageHandler>) {
  for (let i = 0; i < 40; i++) if (!(await runOnce({ pool, ring, handlers, delayMs: () => 0, log: () => {} }))) return;
  throw new Error("runner did not go idle");
}
const stubTranscribe: StageHandler = {
  run: async (ctx) => {
    writeFileSync(join(dir, "t.json"), JSON.stringify({ duration: 50, words: WORDS }));
    await storeOutput({ pool, storage }, ctx, "transcript.json", join(dir, "t.json"), "captions", "application/json");
  },
};

beforeAll(async () => {
  await admin.query("alter role feista_api login password 'feista-test'");
  await admin.query("alter role feista_runner login password 'feista-test'");
  await admin.query("insert into users (id, email) values ($1, $2)", [U, `${U}@x.test`]);
  expect((await app.request("/v1/credentials", { method: "POST", headers: auth, body: JSON.stringify({ provider: "anthropic", secret: "sk-ant-test-0123456789abcdef" }) })).status).toBe(201);
  mkdirSync(join(dir, "src"));
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=50", "-f", "lavfi", "-i",
    "sine=frequency=440:duration=50", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, "src", "vod.mp4")]);
}, 60_000);
afterAll(async () => {
  await Promise.all([api.end(), pool.end()]);
  await admin.end();
});

describe("Clip Studio", () => {
  it("refuses a clip project without the creator's rights confirmation", async () => {
    expect((await create({})).status).toBe(400);
    expect((await create({ config: { rights: "found it online" } })).status).toBe(400);
    expect((await create({ config: ["own"] })).status).toBe(400);
    expect((await create({ config: { rights: "own", note: "a\u0000b" } })).status).toBe(400);
  });

  it("an uploaded recording becomes ranked, captioned 9:16 clips that pass QA, then waits for review", async () => {
    const res = await create({ config: { rights: "own", brief: "my Valorant stream" } });
    expect(res.status).toBe(201);
    const pid = ((await res.json()) as { project: { id: string } }).project.id;
    expect((await runsOf(pid)).source).toMatchObject({ status: "awaiting_review" }); // nothing runs before the upload

    await storage.put(sourceKey(pid), join(dir, "src", "vod.mp4"));
    expect((await app.request(`/v1/projects/${pid}/runs/source/approve`, { method: "POST", headers: auth })).status).toBe(204);
    const a = fakeAnthropic(PICKS);
    await drain({ ...clipHandlers({ pool, storage, cmd }), transcribe: stubTranscribe, ...llmHandlers({ pool, storage, fetch: a.fetch, sleep: async () => {} }) });

    const st = await runsOf(pid);
    for (const n of ["transcribe", "highlights", "clip_render:0", "clip_render:1", "clip_qa:0", "clip_qa:1"]) expect(st[n], n).toMatchObject({ status: "completed", error: null });
    expect(st.review).toMatchObject({ status: "awaiting_review" });
    expect(a.bodies).toHaveLength(1);
    const prompt = JSON.stringify(a.bodies[0]!.messages);
    expect(prompt).toContain("<brief>my Valorant stream</brief>");
    expect(prompt).toContain("[0.0] word0");
    expect(prompt).toContain("exactly 2 non-overlapping clips");
    const assets = (await admin.query("select storage_key from assets where project_id = $1 and storage_key like '%.mp4'", [pid])).rows.map((r) => r.storage_key.split("/").slice(1).join("/"));
    expect(assets.sort()).toEqual(["clip_render:0/g1/clips/C1.mp4", "clip_render:1/g1/clips/C2.mp4"]);
  }, 180_000);

  it("fails permanently, without calling anyone, when no recording was uploaded or its rights are missing", async () => {
    const a = fakeAnthropic(PICKS);
    const all = { ...clipHandlers({ pool, storage, cmd }), ...llmHandlers({ pool, storage, fetch: a.fetch, sleep: async () => {} }) };
    const pid = ((await (await create({ config: { rights: "licensed" } })).json()) as { project: { id: string } }).project.id;
    await app.request(`/v1/projects/${pid}/runs/source/approve`, { method: "POST", headers: auth });
    // a project that bypassed the API check (e.g. an old row) is still refused by the stage itself
    const raw = (await admin.query(
      `insert into projects (owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction, config)
       values ($1, 'clip', 'x', 1, 1000, 1000, 0.9, '{}') returning id`, [U])).rows[0].id as string;
    await storage.put(sourceKey(raw), join(dir, "src", "vod.mp4"));
    await admin.query("insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses) values ($1, 'transcribe', 'queued', 3, 2)", [raw]);
    await drain(all);
    expect((await runsOf(pid)).transcribe).toMatchObject({ status: "failed", error: "no source recording uploaded" });
    expect((await runsOf(raw)).transcribe).toMatchObject({ status: "failed", error: "clip project has no rights confirmation" });
    expect(a.bodies).toHaveLength(0);
  });

  it("a billed but unusable pick list parks once; picks that cannot fit never call the model", async () => {
    const run = async (scenes: number, answer: unknown) => {
      const a = fakeAnthropic(answer);
      const res = await create({ sceneCount: scenes, config: { rights: "own", brief: "<b>loud</b> stream" } });
      const pid = ((await res.json()) as { project: { id: string } }).project.id;
      await storage.put(sourceKey(pid), join(dir, "src", "vod.mp4"));
      await app.request(`/v1/projects/${pid}/runs/source/approve`, { method: "POST", headers: auth });
      await drain({ transcribe: stubTranscribe, ...llmHandlers({ pool, storage, fetch: a.fetch, sleep: async () => {} }) });
      return { st: await runsOf(pid), a };
    };
    const bad = await run(2, { clips: [PICKS.clips[0]] });
    expect(bad.st.highlights).toMatchObject({ status: "failed", error: expect.stringContaining("exactly 2 clips") });
    expect(bad.a.bodies).toHaveLength(1);
    expect(JSON.stringify(bad.a.bodies[0]!.messages)).toContain("<brief>bloud/b stream</brief>");
    const tooMany = await run(4, PICKS); // 4 x 15 s > the 50 s recording
    expect(tooMany.st.highlights).toMatchObject({ status: "failed", error: expect.stringContaining("cannot fit") });
    expect(tooMany.a.bodies).toHaveLength(0);
  });
});

describe("highlight checks", () => {
  it("rejects picks clip_render or the Shorts spec would choke on", () => {
    expect(toHighlights(PICKS, 2, 50).clips[0]).toMatchObject({ start: 22, end: 44, title: "The clutch" });
    expect(() => toHighlights(PICKS, 3, 50)).toThrow(/exactly 3/);
    expect(() => toHighlights({ clips: [{ ...PICKS.clips[0], end: 30 }, PICKS.clips[1]] }, 2, 50)).toThrow(/15-60 s/);
    expect(() => toHighlights({ clips: [{ ...PICKS.clips[0], end: 70 }, PICKS.clips[1]] }, 2, 50)).toThrow(/outside/);
    expect(() => toHighlights({ clips: [PICKS.clips[0], { ...PICKS.clips[1], end: 25 }] }, 2, 50)).toThrow(/overlap/);
    expect(() => toHighlights({ clips: [{ ...PICKS.clips[0], start: 35.03, end: 50.04 }, PICKS.clips[1]] }, 2, 50)).toThrow(/15-60 s/); // checked after clamping to the recording
  });

  it("groups words into timestamped lines and strips tag characters", () => {
    const t = transcriptText({ words: [["hi", 0, 0.4], ["<x>", 3, 3.2], ["later", 9, 9.4], ["more", 10, 10.2]] });
    expect(t).toBe("[0.0] hi x later\n[10.0] more");
  });
});
