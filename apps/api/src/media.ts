/**
 * Runner handlers for the free, local media stages: `assembly` (feista_media build_short port)
 * and `media_qa`. They run FFmpeg via the Python worker CLI; no provider is called.
 *
 * Asset convention: a node stores each output at `<project>/<node>/g<gen>/<relpath>`, where relpath
 * is its place in the episode dir assembly expects (config.json, clips/S1.mp4, vo/L1.mp3, music.mp3).
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type pg from "pg";
import { asWorker } from "./db";
import { PermanentError, type StageContext, type StageHandler } from "./runner";
import type { Storage } from "./storage";


export interface MediaDeps {
  pool: pg.Pool; // feista_runner
  storage: Storage;
  /** e.g. ["python3", "-m", "feista_media.cli"]; feista_media must be importable via PATH/PYTHONPATH. */
  cmd: string[];
  timeoutMs?: number;
}

/**
 * The child decodes untrusted provider media, so it gets an allowlisted env only: never the
 * KEKs, DATABASE_URL or anything else from the runner's environment.
 */
export function childEnv(from: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const keep = ["PATH", "PYTHONPATH", "HOME", "LANG", "TMPDIR", "FFMPEG", "FFPROBE"];
  return Object.fromEntries(keep.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));
}

const keyOf = (ctx: StageContext, rel: string) => `${ctx.projectId}/${ctx.nodeId}/g${ctx.generation}/${rel}`;

/** Current-generation assets of every completed node in the project (what this run builds on). */
async function inputs(deps: MediaDeps, projectId: string) {
  return asWorker(deps.pool, async (tx) =>
    (await tx.query(
      `select a.node_id, a.storage_key from assets a
       join stage_runs s on s.project_id = a.project_id and s.node_id = a.node_id and s.generation = a.generation
       where a.project_id = $1 and s.status = 'completed'`,
      [projectId],
    )).rows as { node_id: string; storage_key: string }[],
  );
}

export async function storeOutput(deps: MediaDeps, ctx: StageContext, rel: string, file: string, kind: string, mime: string) {
  const key = keyOf(ctx, rel);
  await deps.storage.put(key, file);
  const bytes = (await stat(file)).size;
  await asWorker(deps.pool, (tx) =>
    tx.query(
      `insert into assets (project_id, node_id, generation, kind, storage_key, mime, bytes) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (storage_key) do update set bytes = excluded.bytes`, // a retry of the same generation overwrites its own output
      [ctx.projectId, ctx.nodeId, ctx.generation, kind, key, mime, bytes],
    ),
  );
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "feista-media-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const CAP = 64 * 1024;

/**
 * Runs the worker CLI in its own process group so a timeout kills ffmpeg too, not just python.
 * Exit 1 (QA failed) and 2 (bad input) are permanent; anything else (75, signals, spawn errors) retries.
 */
function cli(deps: MediaDeps, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(deps.cmd[0]!, [...deps.cmd.slice(1), ...args], { env: childEnv(), detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d: Buffer) => (out = (out + d.toString()).slice(-CAP)));
    child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-CAP)));
    const killGroup = () => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ } };
    const timer = setTimeout(killGroup, deps.timeoutMs ?? 20 * 60_000);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      killGroup(); // reap any grandchild still holding the group
      if (code === 0) return resolve(out);
      const tail = (out || err).slice(-400);
      if (code === 1 || code === 2) return reject(new PermanentError(`media worker exit ${code}: ${tail}`));
      reject(new Error(`media worker ${signal ? `killed by ${signal}` : `exit ${code}`}: ${tail}`));
    });
  });
}

export function mediaHandlers(deps: MediaDeps): Record<"assembly" | "media_qa", StageHandler> {
  return {
    assembly: {
      leaseMs: 5 * 60_000,
      run: (ctx) =>
        withTemp(async (dir) => {
          const ep = join(dir, "episode");
          const seen = new Map<string, string>();
          for (const a of await inputs(deps, ctx.projectId)) {
            if (a.node_id === "assembly" || a.node_id === "media_qa") continue;
            const rel = a.storage_key.split("/").slice(3).join("/"); // drop <project>/<node>/g<gen>
            const other = seen.get(rel);
            if (other) throw new PermanentError(`${rel} is produced by both ${other} and ${a.node_id}`); // never pick one silently
            seen.set(rel, a.node_id);
            await deps.storage.get(a.storage_key, join(ep, rel));
          }
          const out = join(dir, "final.mp4");
          await cli(deps, ["assemble", ep, "--work", join(dir, "work"), "--out", out]);
          await storeOutput(deps, ctx, "final.mp4", out, "final", "video/mp4");
        }),
    },
    media_qa: {
      run: (ctx) =>
        withTemp(async (dir) => {
          const final = (await inputs(deps, ctx.projectId)).find((a) => a.node_id === "assembly" && a.storage_key.endsWith("/final.mp4"));
          if (!final) throw new PermanentError("no assembled final.mp4 to check");
          const file = join(dir, "final.mp4");
          await deps.storage.get(final.storage_key, file);
          const out = await cli(deps, ["qa", file]); // throws PermanentError with the failures when QA fails
          const report = join(dir, "qa.json");
          await writeFile(report, out);
          await storeOutput(deps, ctx, "qa.json", report, "other", "application/json");
        }),
    },
  };
}
