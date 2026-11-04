import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { parse } from "pg-connection-string";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KeyRing } from "@feista/vault";
import { createApp } from "./app";
import { devTokens } from "./auth";
import { PermanentError, type RunnerDeps, type StageHandler, reapExpired, runOnce } from "./runner";

// Real Postgres via db/with-temp-db.sh. API connects as feista_api, runner as feista_runner.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("run via `pnpm test` (db/with-temp-db.sh provides DATABASE_URL)");
const cfg = (user: string) => ({ ...(parse(url) as unknown as pg.PoolConfig), user, password: "feista-test", max: 6 });

const admin = new pg.Pool({ connectionString: url, max: 2 });
const apiPool = new pg.Pool(cfg("feista_api"));
const runnerPool = new pg.Pool(cfg("feista_runner"));
const ring = KeyRing.parse(`1:${randomBytes(32).toString("base64")}`, 1);
const tokens = devTokens(randomBytes(32));
const app = createApp({ pool: apiPool, ring, authenticate: tokens.authenticate, log: () => {} });
const U = randomUUID();

const call = async (method: string, path: string, json?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { authorization: `Bearer ${tokens.sign(U)}`, "content-type": "application/json" },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  return { status: res.status, body: res.status === 204 ? undefined : await res.json() };
};
const newProject = async (over: Record<string, unknown> = {}) =>
  (await call("POST", "/v1/projects", { kind: "story", title: "T", sceneCount: 2, budgetLimitCents: 10_000, approvalThresholdCents: 5_000, warnFraction: 0.8, ...over })).body.project.id as string;
const runs = async (pid: string) =>
  Object.fromEntries(((await call("GET", `/v1/projects/${pid}/runs`)).body.runs as { node_id: string; status: string }[]).map((r) => [r.node_id, r.status]));

const ok = (cents = 10): StageHandler => ({ estimate: () => ({ provider: "fal", cents }), run: async () => ({ reportedCents: cents }) });
const ALL = ["concept", "script", "characters", "keyframe", "scene_video", "narration", "music", "assembly", "media_qa", "metadata", "publish"];
const handlersAll = (over: Record<string, StageHandler> = {}) => ({ ...Object.fromEntries(ALL.map((s) => [s, ok()])), ...over });
const deps = (handlers: RunnerDeps["handlers"]): RunnerDeps => ({ pool: runnerPool, ring, handlers, delayMs: () => 0, log: () => {} });
async function drain(d: RunnerDeps, parallel = 1) {
  for (let i = 0; i < 500; i++) if (!(await Promise.all(Array.from({ length: parallel }, () => runOnce(d)))).some(Boolean)) return;
  throw new Error("runner did not go idle");
}

beforeAll(async () => {
  await admin.query("alter role feista_api login password 'feista-test'");
  await admin.query("alter role feista_runner login password 'feista-test'");
  await admin.query("insert into users (id, email) values ($1, $2)", [U, `${U}@x.test`]);
});
// each test starts with an empty queue (drain() would otherwise pick up earlier tests' leftovers)
beforeEach(async () => {
  await admin.query("update stage_runs set status = 'cancelled' where status in ('queued', 'running', 'awaiting_review')");
});
afterAll(async () => {
  await Promise.all([apiPool.end(), runnerPool.end()]);
  await admin.end();
});

describe("runner", () => {
  it("drives a story from concept to the review gate, then on to publish after approval", async () => {
    const pid = await newProject();
    expect(await runs(pid)).toEqual({ concept: "queued" }); // creation seeds the roots
    await drain(deps(handlersAll()), 4); // parallel workers: join nodes must still be queued exactly once
    const st = await runs(pid);
    expect(st.review).toBe("awaiting_review");
    expect(Object.entries(st).filter(([k]) => k !== "review").every(([, v]) => v === "completed")).toBe(true);
    expect(Object.keys(st)).toHaveLength(13); // 2 scenes x (keyframe, scene_video) + 9 single stages; publish waits for review
    const ledger = (await admin.query("select count(*)::int n, sum(reported_cents)::int r from ledger where project_id = $1", [pid])).rows[0];
    expect(ledger).toEqual({ n: 9, r: 90 }); // every paid node reserved, then reported
    expect((await call("POST", `/v1/projects/${pid}/runs/review/approve`)).status).toBe(204);
    expect((await call("POST", `/v1/projects/${pid}/runs/review/approve`)).status).toBe(409);
    await drain(deps(handlersAll()));
    expect((await runs(pid)).publish).toBe("completed");
  });

  it("retries transient failures, then fails at the attempt cap without starting dependents", async () => {
    const pid = await newProject();
    let calls = 0;
    await drain(deps({ concept: { estimate: () => ({ provider: "fal", cents: 1 }), run: async () => { calls++; throw new Error(`503 from provider key=sk-live-abcdefghijklmnop`); } } }));
    expect(calls).toBe(3);
    const row = (await admin.query("select status, attempt, error from stage_runs where project_id = $1", [pid])).rows;
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ status: "failed", attempt: 3 });
    expect(row[0].error).not.toContain("sk-live-abcdefghijklmnop"); // stored errors are redacted
  });

  it("does not retry permanent errors", async () => {
    const pid = await newProject();
    let calls = 0;
    await drain(deps({ concept: { estimate: () => ({ provider: "fal", cents: 1 }), run: async () => { calls++; throw new PermanentError("bad prompt"); } } }));
    expect(calls).toBe(1);
    expect((await runs(pid)).concept).toBe("failed");
  });

  it("budget gate: denies over the limit and fails closed without an estimate", async () => {
    let ran = 0;
    const h = (cents: number): StageHandler => ({ estimate: () => ({ provider: "fal", cents }), run: async () => { ran++; } });
    const over = await newProject({ budgetLimitCents: 5 });
    await drain(deps({ concept: h(10) }));
    const noEst = await newProject();
    await drain(deps({ concept: { run: async () => { ran++; } } }));
    expect(ran).toBe(0);
    const err = async (pid: string) => (await admin.query("select status, error from stage_runs where project_id = $1", [pid])).rows[0];
    expect(await err(over)).toMatchObject({ status: "failed", error: expect.stringMatching(/over budget/) });
    expect(await err(noEst)).toMatchObject({ status: "failed", error: expect.stringMatching(/no cost estimate/) });
    expect((await admin.query("select count(*)::int n from ledger where project_id = any($1)", [[over, noEst]])).rows[0].n).toBe(0);
  });

  it("budget gate: a spend above the threshold waits for the user's approval, then runs once", async () => {
    let ran = 0;
    const d = deps({ concept: { estimate: () => ({ provider: "fal", cents: 60 }), run: async () => { ran++; } } });
    const pid = await newProject({ approvalThresholdCents: 50 });
    await drain(d);
    expect(ran).toBe(0);
    expect((await runs(pid)).concept).toBe("awaiting_review");
    expect((await call("POST", `/v1/projects/${pid}/runs/concept/approve`)).status).toBe(204);
    await drain(d);
    expect(ran).toBe(1);
    expect((await runs(pid)).concept).toBe("completed");
    const r = (await admin.query("select spend_approved from stage_runs where project_id = $1 and node_id = 'concept'", [pid])).rows[0];
    expect(r.spend_approved).toBe(false); // approval is not carried into a later new take
  });

  it("re-queues work whose worker vanished, and a stale worker cannot overwrite it", async () => {
    const pid = await newProject();
    let release!: () => void;
    const hung = new Promise<void>((r) => (release = r));
    const slow = runOnce(deps({ concept: { estimate: () => ({ provider: "fal", cents: 1 }), leaseMs: 50, run: () => hung } }));
    await new Promise((r) => setTimeout(r, 150));
    expect(await reapExpired(runnerPool)).toBe(1);
    expect((await runs(pid)).concept).toBe("queued");
    release();
    await slow; // the stale worker finishes: its lease is gone, so nothing changes
    const r = (await admin.query("select status, lease_losses from stage_runs where project_id = $1", [pid])).rows[0];
    expect(r).toEqual({ status: "queued", lease_losses: 1 });
  });

  it("hands handlers the owner's own key, and only that", async () => {
    const pid = await newProject();
    await call("POST", "/v1/credentials", { provider: "fal", secret: "fal_live_owner_key_1234567890" });
    let seen = "";
    await drain(deps({ concept: { estimate: () => ({ provider: "fal", cents: 1 }), run: async (ctx) => { seen = await ctx.secret("fal"); } } }));
    expect(seen).toBe("fal_live_owner_key_1234567890");
    expect((await runs(pid)).concept).toBe("completed");
  });
});
