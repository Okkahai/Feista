import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { parse } from "pg-connection-string";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KeyRing } from "@feista/vault";
import { createApp } from "./app";
import { devTokens } from "./auth";
import { asUser } from "./db";
import { llmHandlers, toConfig } from "./llm";
import { runOnce } from "./runner";
import { localStorage } from "./storage";

// A fake fetch stands in for the Anthropic API. Nothing leaves the machine.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("run via `pnpm test` (db/with-temp-db.sh provides DATABASE_URL)");
const cfg = (user: string) => ({ ...(parse(url) as unknown as pg.PoolConfig), user, password: "feista-test", max: 4 });
const admin = new pg.Pool({ connectionString: url, max: 2 });
const api = new pg.Pool(cfg("feista_api"));
const pool = new pg.Pool(cfg("feista_runner"));
const ring = KeyRing.parse(`1:${randomBytes(32).toString("base64")}`, 1);
const tokens = devTokens(randomBytes(32));
const app = createApp({ pool: api, ring, authenticate: tokens.authenticate, log: () => {} });
const dir = mkdtempSync(join(tmpdir(), "feista-llm-test-"));
const storage = localStorage(join(dir, "store"));
const U = randomUUID();
const KEY = "sk-ant-test-0123456789abcdef";

const SCRIPT = {
  scenes: [
    { image_prompt: "close-up, a fox grabs a hat", video_prompt: "push in. Sound: wind. No music, no speech.", duration: 6, end_state: "fox running" },
    { image_prompt: "the fox on a log", video_prompt: "pan left. Sound: creak. No music, no speech.", duration: 7, end_state: "fox stuck" },
    { image_prompt: "the hat flies off", video_prompt: "tilt up. Sound: whoosh. No music, no speech.", duration: 6, end_state: "fox smiles" },
    { image_prompt: "close-up, fox wears the hat", video_prompt: "hold. Sound: chirp. No music, no speech.", duration: 5, end_state: "fox proud" },
  ],
  lines: [
    { text: "Rex wanted one thing.", scene: 0, offset: 0.3 },
    { text: "The wind wanted it more.", scene: 1, offset: 1 },
    { text: "Fine. Keep it.", scene: 3, offset: 0.5 },
  ],
  silence: { scene: 2, at: 1.5, duration: 1 },
};

function fakeAnthropic(opts: { concept?: Record<string, unknown>; script?: unknown; stop?: string; model?: string } = {}) {
  const calls: { headers: Headers; body: Record<string, unknown> }[] = [];
  const f = async (input: string | URL | Request, init: RequestInit = {}) => {
    const req = new Request(input, init);
    if (!req.url.startsWith("https://api.anthropic.com/v1/messages")) return new Response("no", { status: 404 });
    const body = (await req.json()) as Record<string, unknown>;
    calls.push({ headers: req.headers, body });
    const isScript = String(body.system).length > 0 && JSON.stringify(body.output_config).includes("end_state");
    const answer = isScript ? (opts.script ?? SCRIPT) : (opts.concept ?? { title: "Who stole the hat?", summary_stripped: `a thief turns out to be ${calls.length}`, story_type: "misunderstanding", ending_type: "reveal" });
    return new Response(JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: opts.model ?? "claude-opus-5-5",
      content: opts.stop === "refusal" ? [] : [{ type: "text", text: JSON.stringify(answer) }],
      stop_reason: opts.stop ?? "end_turn", stop_sequence: null, stop_details: opts.stop === "refusal" ? { type: "refusal", category: "general_harms", explanation: "" } : null,
      usage: { input_tokens: 1000, output_tokens: 2000 },
    }), { status: 200, headers: { "content-type": "application/json", "request-id": "req_1" } });
  };
  return { fetch: f as typeof fetch, calls };
}

async function project(config: Record<string, unknown> = {}, scenes = 4) {
  return asUser(api, U, async (tx) => {
    const id = (await tx.query(
      `insert into projects (owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction, config)
       values (app_user(), 'story', 'A fox and a hat', $1, 10000, 10000, 0.9, $2) returning id`,
      [scenes, config],
    )).rows[0].id as string;
    await tx.query("insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses) values ($1, 'concept', 'queued', 3, 2)", [id]);
    return id;
  });
}
async function drain(f: typeof fetch, store = storage) {
  const handlers = llmHandlers({ pool, storage: store, fetch: f, sleep: async () => {} });
  for (let i = 0; i < 20; i++) if (!(await runOnce({ pool, ring, handlers, delayMs: () => 0, log: () => {} }))) return;
  throw new Error("runner did not go idle");
}
const runsOf = async (pid: string) =>
  Object.fromEntries((await admin.query("select node_id, status, error from stage_runs where project_id = $1", [pid])).rows.map((r) => [r.node_id, r]));
const stored = (pid: string, rel: string) => JSON.parse(readFileSync(join(dir, "store", pid, rel), "utf8"));

beforeAll(async () => {
  // server env must never redirect or replace a user's key
  process.env.ANTHROPIC_BASE_URL = "https://attacker.example";
  process.env.ANTHROPIC_CUSTOM_HEADERS = "Authorization: Bearer sk-ant-OPERATOR\nX-Api-Key: sk-ant-OPERATOR";
  process.env.ANTHROPIC_API_KEY = "sk-ant-OPERATOR";
  process.env.ANTHROPIC_AUTH_TOKEN = "sk-ant-OPERATOR";
  await admin.query("alter role feista_api login password 'feista-test'");
  await admin.query("alter role feista_runner login password 'feista-test'");
  await admin.query("insert into users (id, email) values ($1, $2)", [U, `${U}@x.test`]);
  const res = await app.request("/v1/credentials", {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.sign(U)}`, "content-type": "application/json" },
    body: JSON.stringify({ provider: "anthropic", secret: KEY }),
  });
  expect(res.status).toBe(201);
});
beforeEach(async () => {
  await admin.query("update stage_runs set status = 'cancelled' where status in ('queued', 'running', 'awaiting_review')");
});
afterAll(async () => {
  await Promise.all([api.end(), pool.end()]);
  await admin.end();
});

describe("text stages (mocked Anthropic)", () => {
  it("concept then script, on the owner's key, produce a config.json the media worker accepts", async () => {
    const a = fakeAnthropic();
    const pid = await project({ brief: "a fox who loves hats", voice_id: "voice-1" });
    await drain(a.fetch);
    const st = await runsOf(pid);
    expect(st.concept).toMatchObject({ status: "completed" });
    expect(st.script).toMatchObject({ status: "completed", error: null });

    expect(a.calls).toHaveLength(2);
    for (const c of a.calls) {
      expect(c.headers.get("authorization")).toBe(`Bearer ${KEY}`); // SDK 1.x sends API keys as a Bearer token
      expect(c.headers.get("x-api-key")).toBeNull();
      expect([...c.headers.values()].join(" ")).not.toContain("OPERATOR");
      expect(c.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
      expect(c.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { format: { type: "json_schema" } } });
      expect(c.body.temperature).toBeUndefined();
    }
    expect(JSON.stringify(a.calls[0]!.body.messages)).toContain("<brief>a fox who loves hats</brief>");
    expect(JSON.stringify(a.calls[1]!.body.messages)).toContain("Who stole the hat?"); // the script builds on the stored concept

    const config = stored(pid, "script/g1/config.json");
    expect(config).toMatchObject({
      cuts: [["S1", 0, 6], ["S2", 0, 7], ["S3", 0, 6], ["S4", 0, 5]],
      script: { "1": "Rex wanted one thing.", "2": "The wind wanted it more.", "3": "Fine. Keep it." },
      vo_shot: { "1": 0, "2": 1, "3": 3 },
      silence: [2, 1.5, 1],
      voice_id: "voice-1",
    });
    expect(config.scenes[0]).toEqual({ image_prompt: SCRIPT.scenes[0]!.image_prompt, video_prompt: SCRIPT.scenes[0]!.video_prompt, duration: 6 });
    execFileSync(process.env.FEISTA_MEDIA_PYTHON ?? "python3", ["-c", "import json,sys; from feista_media.assemble import load_plan; load_plan(json.load(open(sys.argv[1])))", join(dir, "store", pid, "script/g1/config.json")], {
      env: { ...process.env, PYTHONPATH: resolve(__dirname, "../../../workers/media") },
    });

    // reserved at the fallback-ceiling estimate, then the real cost: 1000 in x 0.04c/1k + 2000 out x 2c/1k = 4.4 -> 5
    const ledger = (await admin.query("select node_id, estimated_cents, reported_cents from ledger where project_id = $1 order by node_id", [pid])).rows;
    expect(ledger.map((l) => [l.node_id, l.reported_cents])).toEqual([["concept", 5], ["script", 5]]);
    expect(ledger.every((l) => l.estimated_cents >= 72)).toBe(true); // two full 16k-token attempts (refusal + fallback)
  });

  it("a new concept is checked against the owner's earlier ones, never another user's", async () => {
    // another user's finished concept, written straight into the store
    const other = randomUUID();
    await admin.query("insert into users (id, email) values ($1, $2)", [other, `${other}@x.test`]);
    const op = (await admin.query(
      "insert into projects (owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction) values ($1, 'story', 'x', 4, 1, 1, 0.5) returning id", [other],
    )).rows[0].id as string;
    await admin.query("insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses) values ($1, 'concept', 'completed', 3, 2)", [op]);
    const f = join(dir, "other.json");
    writeFileSync(f, JSON.stringify({ title: "t", summary_stripped: "SECRET-OF-ANOTHER-USER", story_type: "x", ending_type: "y" }));
    await storage.put(`${op}/concept/g1/concept.json`, f);
    await admin.query("insert into assets (project_id, node_id, generation, kind, storage_key, mime, bytes) values ($1::uuid, 'concept', 1, 'other', $1::text || '/concept/g1/concept.json', 'application/json', 1)", [op]);

    const first = fakeAnthropic({ concept: { title: "t", summary_stripped: "MINE-EARLIER", story_type: "rivalry", ending_type: "reveal" } });
    await project();
    await drain(first.fetch);
    const a = fakeAnthropic();
    await project();
    await drain(a.fetch);
    const prompt = JSON.stringify(a.calls[0]!.body.messages);
    expect(prompt).toContain("MINE-EARLIER (rivalry, reveal)");
    expect(prompt).not.toContain("SECRET-OF-ANOTHER-USER");
  });

  it("a paid answer whose storing fails parks the node instead of paying again", async () => {
    const a = fakeAnthropic();
    const pid = await project();
    let failed = false;
    const flaky = { ...storage, put: async (k: string, from: string) => { if (!failed) { failed = true; throw new Error("disk full"); } return storage.put(k, from); } };
    await drain(a.fetch, flaky);
    expect((await runsOf(pid)).concept).toMatchObject({ status: "failed", error: expect.stringMatching(/billed.*not retried.*disk full/) });
    expect(a.calls).toHaveLength(1);
  });

  it("a refusal, a fallback and a bad script are handled honestly", async () => {
    const refused = fakeAnthropic({ stop: "refusal" });
    const p1 = await project();
    await drain(refused.fetch);
    expect((await runsOf(p1)).concept).toMatchObject({ status: "failed", error: expect.stringMatching(/declined \(general_harms\)/) });
    expect(refused.calls).toHaveLength(1); // permanent: never retried

    const fellBack = fakeAnthropic({ model: "claude-opus-4-8" });
    const p2 = await project();
    await drain(fellBack.fetch);
    // another model answered: its price is not ours to guess, so the reservation stands unreported
    expect((await admin.query("select reported_cents from ledger where project_id = $1 and node_id = 'concept'", [p2])).rows[0]).toEqual({ reported_cents: null });

    const p3 = await project({}, 3); // the script has 4 scenes
    await drain(fakeAnthropic().fetch);
    expect((await runsOf(p3)).script).toMatchObject({ status: "failed", error: "script has 4 scenes, the project has 3" });
  });
});

describe("toConfig", () => {
  it("rejects scripts assembly or the Shorts spec would choke on", () => {
    expect(() => toConfig({ ...SCRIPT, lines: [{ text: "x", scene: 0, offset: 6 }] }, 4, undefined)).toThrow(/outside its scene/);
    expect(() => toConfig({ ...SCRIPT, lines: [{ text: "x", scene: 9, offset: 0 }] }, 4, undefined)).toThrow(/outside its scene/);
    expect(() => toConfig({ ...SCRIPT, silence: { scene: 0, at: -1, duration: 1 } }, 4, undefined)).toThrow(/silence/);
    expect(() => toConfig({ ...SCRIPT, scenes: SCRIPT.scenes.slice(0, 2) }, 2, undefined)).toThrow(/15-60/);
    expect(() => toConfig({ ...SCRIPT, lines: [] }, 4, undefined)).toThrow(/1-12/);
    expect(toConfig(SCRIPT, 4, 42)).not.toHaveProperty("voice_id");
  });
});
