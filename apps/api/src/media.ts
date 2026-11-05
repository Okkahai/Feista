/**
 * Runner handlers for the free, local media stages: `assembly` (feista_media build_short port)
 * and `media_qa`. They run FFmpeg via the Python worker CLI; no provider is called.
 *
 * Asset convention: a node stores each output at `<project>/<node>/g<gen>/<relpath>`, where relpath
 * is its place in the episode dir assembly expects (config.json, clips/S1.mp4, vo/L1.mp3, music.mp3).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
export async function inputs(deps: Pick<MediaDeps, "pool">, projectId: string) {
  return asWorker(deps.pool, async (tx) =>
    (await tx.query(
      `select a.node_id, a.storage_key, a.source_url from assets a
       join stage_runs s on s.project_id = a.project_id and s.node_id = a.node_id and s.generation = a.generation
       where a.project_id = $1 and s.status = 'completed'`,
      [projectId],
    )).rows as { node_id: string; storage_key: string; source_url: string | null }[],
  );
}

export async function storeOutput(deps: Pick<MediaDeps, "pool" | "storage">, ctx: StageContext, rel: string, file: string, kind: string, mime: string, sourceUrl?: string) {
  const key = keyOf(ctx, rel);
  await deps.storage.put(key, file);
  const bytes = (await stat(file)).size;
  await asWorker(deps.pool, (tx) =>
    tx.query(
      `insert into assets (project_id, node_id, generation, kind, storage_key, mime, bytes, source_url) values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (storage_key) do update set bytes = excluded.bytes, source_url = excluded.source_url`, // a retry of the same generation overwrites its own output
      [ctx.projectId, ctx.nodeId, ctx.generation, kind, key, mime, bytes, sourceUrl ?? null],
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

export interface Highlight { start: number; end: number; title: string; hook: string; why: string }

/** The creator's upload for a clip project. The upload flow writes it here before the `source` gate is approved. */
export const sourceKey = (projectId: string) => `${projectId}/source/g1/source.mp4`;

async function fetchSource(deps: Pick<MediaDeps, "storage">, ctx: StageContext, to: string) {
  if (ctx.projectConfig.rights !== "own" && ctx.projectConfig.rights !== "licensed") throw new PermanentError("clip project has no rights confirmation");
  await deps.storage.get(sourceKey(ctx.projectId), to).catch((e: NodeJS.ErrnoException) => {
    throw e.code === "ENOENT" ? new PermanentError("no source recording uploaded") : e;
  });
}

async function json<T>(deps: MediaDeps, ctx: StageContext, node: string, rel: string, dir: string): Promise<T> {
  const a = (await inputs(deps, ctx.projectId)).find((x) => x.node_id === node && x.storage_key.endsWith(`/${rel}`));
  if (!a) throw new PermanentError(`no ${rel} from the ${node} stage`);
  await deps.storage.get(a.storage_key, join(dir, rel));
  return JSON.parse(await readFile(join(dir, rel), "utf8")) as T;
}

/** Clip Studio's local stages: transcribe the recording, render each picked highlight, QA each clip. */
export function clipHandlers(deps: MediaDeps): Record<"transcribe" | "clip_render" | "clip_qa", StageHandler> {
  return {
    transcribe: {
      leaseMs: 5 * 60_000,
      run: (ctx) =>
        withTemp(async (dir) => {
          await fetchSource(deps, ctx, join(dir, "source.mp4"));
          await cli(deps, ["clip-transcribe", join(dir, "source.mp4"), "--out", join(dir, "transcript.json")]);
          await storeOutput(deps, ctx, "transcript.json", join(dir, "transcript.json"), "captions", "application/json");
        }),
    },
    clip_render: {
      leaseMs: 5 * 60_000,
      run: (ctx) =>
        withTemp(async (dir) => {
          const { clips } = await json<{ clips: Highlight[] }>(deps, ctx, "highlights", "highlights.json", dir);
          const h = clips[ctx.scene ?? -1];
          if (!h) throw new PermanentError(`highlights.json has no clip ${ctx.scene}`);
          const t = await json<unknown>(deps, ctx, "transcribe", "transcript.json", dir);
          await writeFile(join(dir, "t.json"), JSON.stringify(t));
          await fetchSource(deps, ctx, join(dir, "source.mp4"));
          const out = join(dir, "clip.mp4");
          await cli(deps, ["clip-render", join(dir, "source.mp4"), "--start", String(h.start), "--end", String(h.end),
            "--transcript", join(dir, "t.json"), "--work", join(dir, "work"), "--out", out]);
          await storeOutput(deps, ctx, `clips/C${ctx.scene! + 1}.mp4`, out, "final", "video/mp4");
        }),
    },
    clip_qa: {
      run: (ctx) =>
        withTemp(async (dir) => {
          const clip = (await inputs(deps, ctx.projectId)).find((a) => a.node_id === `clip_render:${ctx.scene}` && a.storage_key.endsWith(".mp4"));
          if (!clip) throw new PermanentError(`no rendered clip ${ctx.scene}`);
          await deps.storage.get(clip.storage_key, join(dir, "c.mp4"));
          await writeFile(join(dir, "qa.json"), await cli(deps, ["qa", join(dir, "c.mp4"), "--spec", "clip"]));
          await storeOutput(deps, ctx, "qa.json", join(dir, "qa.json"), "other", "application/json");
        }),
    },
  };
}
