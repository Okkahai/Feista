import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { parse } from "pg-connection-string";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KeyRing } from "@feista/vault";
import { asUser } from "./db";
import { type MediaDeps, childEnv, mediaHandlers, storeOutput } from "./media";
import { type StageHandler, runOnce } from "./runner";
import { assertKey, localStorage } from "./storage";

// Real FFmpeg + the Python media worker on synthetic media. No providers, no network.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("run via `pnpm test` (db/with-temp-db.sh provides DATABASE_URL)");
const cfg = (user: string) => ({ ...(parse(url) as unknown as pg.PoolConfig), user, password: "feista-test", max: 4 });
const admin = new pg.Pool({ connectionString: url, max: 2 });
const api = new pg.Pool(cfg("feista_api"));
const pool = new pg.Pool(cfg("feista_runner"));
const ring = KeyRing.parse(`1:${randomBytes(32).toString("base64")}`, 1);
const dir = mkdtempSync(join(tmpdir(), "feista-media-test-"));
const media: MediaDeps = {
  pool,
  storage: localStorage(join(dir, "store")),
  cmd: [process.env.FEISTA_MEDIA_PYTHON ?? "python3", "-m", "feista_media.cli"],
};
process.env.PYTHONPATH = resolve(__dirname, "../../../workers/media");
const U = randomUUID();

const ff = (...a: string[]) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...a]);
const src = (name: string) => join(dir, "src", name);

beforeAll(async () => {
  await admin.query("alter role feista_api login password 'feista-test'");
  await admin.query("alter role feista_runner login password 'feista-test'");
  await admin.query("insert into users (id, email) values ($1, $2)", [U, `${U}@x.test`]);
  execFileSync("mkdir", ["-p", join(dir, "src")]);
  for (const n of [1, 2])
    ff("-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24:duration=9", "-f", "lavfi", "-i", `sine=frequency=${300 + n * 50}:duration=9`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src(`S${n}.mp4`));
  ff("-f", "lavfi", "-i", "sine=frequency=600:duration=1.3", src("L1.mp3"));
  ff("-f", "lavfi", "-i", "sine=frequency=220:duration=30", src("music.mp3"));
  writeFileSync(src("words.json"), JSON.stringify({ "1": [["Something", 0, 0.5], ["fell.", 0.5, 0.9]] }));
}, 60_000);
afterAll(async () => {
  await Promise.all([api.end(), pool.end()]);
  await admin.end();
});
beforeEach(async () => {
  await admin.query("update stage_runs set status = 'cancelled' where status in ('queued', 'running', 'awaiting_review')");
});

/** Upstream stages stand in for providers: each just stores its synthetic output. */
function upstream(shotSeconds: number): Record<string, StageHandler> {
  const paid = (outputs: (scene?: number) => [string, string][]): StageHandler => ({
    estimate: () => ({ provider: "fake", cents: 0 }),
    run: async (ctx) => {
      for (const [rel, file] of outputs(ctx.scene)) await storeOutput(media, ctx, rel, file, "other", "application/octet-stream");
    },
  });
  const config = join(dir, `config-${shotSeconds}.json`);
  writeFileSync(config, JSON.stringify({
    cuts: [["S1", 0, shotSeconds], ["S2", 0, shotSeconds]],
    script: { "1": "Something fell." }, vo_shot: { "1": 0 }, vo_offset: { "1": 0.3 },
    music: "music.mp3", silence: [1, 0.5, 0.6],
  }));
  return {
    concept: paid(() => []),
    script: paid(() => [["config.json", config]]),
    characters: paid(() => []),
    keyframe: paid(() => []),
    scene_video: paid((s) => [[`clips/S${s! + 1}.mp4`, src(`S${s! + 1}.mp4`)]]),
    narration: paid(() => [["vo/L1.mp3", src("L1.mp3")], ["vo/words.json", src("words.json")]]),
    music: { run: async (ctx) => storeOutput(media, ctx, "music.mp3", src("music.mp3"), "audio", "audio/mpeg") },
  };
}

async function produce(shotSeconds: number) {
  const pid = await asUser(api, U, async (tx) => {
    const id = (await tx.query(
      `insert into projects (owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction)
       values (app_user(), 'story', 'm', 2, 100, 100, 0.8) returning id`,
    )).rows[0].id as string;
    await tx.query("insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses) values ($1, 'concept', 'queued', 3, 2)", [id]);
    // an output from another take of scene_video:0: must be ignored, not mixed into this cut
    await tx.query(
      "insert into assets (project_id, node_id, generation, kind, storage_key, mime, bytes) values ($1::uuid, 'scene_video:0', 2, 'video', $1::text || '/scene_video:0/g2/clips/S1.mp4', 'video/mp4', 1)",
      [id],
    );
    return id;
  });
  const handlers = { ...upstream(shotSeconds), ...mediaHandlers(media), metadata: { estimate: () => ({ provider: "fake", cents: 0 }), run: async () => {} } };
  for (let i = 0; i < 100; i++) if (!(await runOnce({ pool, ring, handlers, delayMs: () => 0, log: () => {} }))) break;
  const runs = (await admin.query("select node_id, status, error from stage_runs where project_id = $1", [pid])).rows as { node_id: string; status: string; error: string | null }[];
  return { pid, by: Object.fromEntries(runs.map((r) => [r.node_id, r])) };
}

describe("child process", () => {
  it("gets an allowlisted environment: no KEKs, no database URL", () => {
    const env = childEnv({ PATH: "/bin", PYTHONPATH: "/x", FEISTA_KEKS: "1:secret", DATABASE_URL: "postgres://u:p@h/d", AWS_SECRET_ACCESS_KEY: "s" });
    expect(env).toEqual({ PATH: "/bin", PYTHONPATH: "/x" });
  });
});

describe("storage keys", () => {
  it("accepts only server-shaped keys inside the root", () => {
    const p = randomUUID();
    expect(() => assertKey(`${p}/scene_video:0/g1/clips/S1.mp4`)).not.toThrow();
    for (const bad of [`${p}/x/g1/../../etc/passwd`, `/etc/passwd`, `${p}/x/g1/a/./b`, `${p}/x/g1/`, "x/y/g1/a", `${p}/X/g1/a`])
      expect(() => assertKey(bad), bad).toThrow();
  });
});

describe("media stages", () => {
  it("assembles stored upstream outputs into a final that passes QA, then waits for review", async () => {
    const { pid, by } = await produce(8);
    expect(by.assembly?.status).toBe("completed");
    expect(by.media_qa).toMatchObject({ status: "completed", error: null });
    expect(by.review?.status).toBe("awaiting_review");
    const assets = (await admin.query("select node_id, kind, storage_key, bytes from assets where project_id = $1 and node_id in ('assembly', 'media_qa')", [pid])).rows;
    expect(assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ node_id: "assembly", kind: "final", storage_key: `${pid}/assembly/g1/final.mp4` }),
      expect.objectContaining({ node_id: "media_qa", storage_key: `${pid}/media_qa/g1/qa.json` }),
    ]));
  }, 240_000);

  it("a final that misses the delivery spec fails QA permanently and stops before review", async () => {
    const { by } = await produce(1.5); // 3 s total: under the 15 s Shorts minimum
    expect(by.assembly?.status).toBe("completed");
    expect(by.media_qa).toMatchObject({ status: "failed", error: expect.stringMatching(/duration/) });
    expect(by.review).toBeUndefined();
  }, 240_000);
});
