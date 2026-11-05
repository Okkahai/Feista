/**
 * Runner process. Env: DATABASE_URL (login feista_runner), FEISTA_KEKS, FEISTA_KEK_CURRENT,
 * FEISTA_STORAGE_DIR, optional FEISTA_MEDIA_PYTHON (default python3; feista_media must be importable).
 * Handlers: local media stages, plus characters / keyframe / scene_video / narration on each owner's own provider keys
 * (BYOK; mocked-tested only). plus concept / script on the owner's Anthropic key. music, metadata and publish have none yet and wait in the queue.
 */
import pg from "pg";
import { KeyRing, redact } from "@feista/vault";
import { generateHandlers } from "./generate";
import { llmHandlers } from "./llm";
import { mediaHandlers } from "./media";
import { reapExpired, runOnce } from "./runner";
import { localStorage } from "./storage";

// BYOK: the SDK reads ANTHROPIC_* (custom headers, keys, base URL) from the environment; none may leak into users' calls
for (const k of Object.keys(process.env)) if (k.startsWith("ANTHROPIC_")) delete process.env[k];
const env = (k: string) => process.env[k] ?? (() => { throw new Error(`${k} is required`); })();
const ring = KeyRing.parse(env("FEISTA_KEKS"), Number(env("FEISTA_KEK_CURRENT")));
const pool = new pg.Pool({ connectionString: env("DATABASE_URL"), max: 4 });
pool.on("error", (e) => console.error(redact(`idle db connection error: ${e.message}`)));
const storage = localStorage(env("FEISTA_STORAGE_DIR"));
const handlers = {
  ...mediaHandlers({ pool, storage, cmd: [process.env.FEISTA_MEDIA_PYTHON ?? "python3", "-m", "feista_media.cli"] }),
  ...generateHandlers({ pool, storage }),
  ...llmHandlers({ pool, storage }),
};

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastReap = 0;
while (!stopping) {
  try {
    if (Date.now() - lastReap > 30_000) {
      lastReap = Date.now();
      const n = await reapExpired(pool);
      if (n) console.log(`re-queued ${n} run(s) whose worker vanished`);
    }
    if (!(await runOnce({ pool, ring, handlers }))) await sleep(1000);
  } catch (e) {
    console.error(redact(`runner loop error: ${e instanceof Error ? e.message : String(e)}`));
    await sleep(5000);
  }
}
await pool.end();
