import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type pg from "pg";
import { type KeyRing, redact, seal } from "@feista/vault";
import type { Authenticate } from "./auth";
import { asUser } from "./db";
import { advance, approve } from "./runner";

export { loadSecret } from "./db";

export interface Deps {
  pool: pg.Pool;
  ring: KeyRing;
  authenticate: Authenticate;
  log?: (line: string) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROVIDER = /^[a-z0-9][a-z0-9_-]{1,31}$/;

const bad = (message: string) => new HTTPException(400, { message });
const notFound = () => new HTTPException(404, { message: "not found" });

function int(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw bad(`${name} must be an integer ${min}..${max}`);
  return v;
}
function str(v: unknown, name: string, min: number, max: number): string {
  if (typeof v !== "string" || v.trim().length < min || v.length > max) throw bad(`${name} must be ${min}..${max} characters`);
  if (v.includes("\u0000")) throw bad(`${name} must not contain NUL`); // Postgres text rejects it
  return v.trim();
}
async function body(req: Request): Promise<Record<string, unknown>> {
  const b: unknown = await req.json().catch(() => undefined);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw bad("JSON object body required");
  return b as Record<string, unknown>;
}

export function createApp({ pool, ring, authenticate, log = console.error }: Deps) {
  const app = new Hono<{ Variables: { uid: string } }>();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    // FK on owner_id: a validly signed token for a user that has no users row (deleted / not provisioned)
    if ((err as { code?: string }).code === "23503") return c.json({ error: "unknown user" }, 401);
    log(redact(`${c.req.method} ${c.req.path} failed: ${err.stack ?? err.message}`));
    return c.json({ error: "internal error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.use("/v1/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "body too large" }, 413) }));
  app.use("/v1/*", async (c, next) => {
    const uid = await authenticate(c.req.header("authorization"));
    if (!uid) return c.json({ error: "unauthorized" }, 401);
    c.set("uid", uid);
    await next();
  });

  // ── projects ──
  app.get("/v1/projects", async (c) => {
    const rows = await asUser(pool, c.get("uid"), async (tx) =>
      (await tx.query("select id, kind, title, scene_count, created_at from projects order by created_at desc limit 100")).rows,
    );
    return c.json({ projects: rows });
  });

  app.get("/v1/projects/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const row = await asUser(pool, c.get("uid"), async (tx) => (await tx.query("select * from projects where id = $1", [id])).rows[0]);
    if (!row) throw notFound(); // also when it belongs to someone else: RLS hides it
    return c.json({ project: row });
  });

  app.post("/v1/projects", async (c) => {
    const b = await body(c.req.raw);
    if (b.kind !== "story" && b.kind !== "clip") throw bad("kind must be story or clip");
    const title = str(b.title, "title", 1, 200);
    const sceneCount = int(b.sceneCount, "sceneCount", 1, 24);
    const limit = int(b.budgetLimitCents, "budgetLimitCents", 0, 10_000_000);
    const threshold = int(b.approvalThresholdCents, "approvalThresholdCents", 0, 10_000_000);
    const warn = b.warnFraction;
    if (typeof warn !== "number" || !(warn > 0 && warn <= 1)) throw bad("warnFraction must be in (0, 1]");
    const row = await asUser(pool, c.get("uid"), async (tx) => {
      const created = (await tx.query(
        `insert into projects (owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction)
         values (app_user(), $1, $2, $3, $4, $5, $6) returning id, kind, title, scene_count, created_at`,
        [b.kind, title, sceneCount, limit, threshold, warn],
      )).rows[0];
      await advance(tx, created.id); // queue the root stages
      return created;
    });
    return c.json({ project: row }, 201);
  });

  app.get("/v1/projects/:id/runs", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const rows = await asUser(pool, c.get("uid"), async (tx) =>
      (await tx.query("select node_id, status, generation, attempt, error, updated_at from stage_runs where project_id = $1 order by node_id", [id])).rows,
    );
    return c.json({ runs: rows });
  });

  // approve a finished review, or a spend above the per-operation threshold
  app.post("/v1/projects/:id/runs/:node/approve", async (c) => {
    const id = c.req.param("id"), node = c.req.param("node");
    if (!UUID.test(id) || !/^[a-z_]+(:[0-9]+)?$/.test(node)) throw notFound();
    const out = await asUser(pool, c.get("uid"), (tx) => approve(tx, id, node));
    if (out === "not_found") throw notFound();
    if (out === "not_waiting") return c.json({ error: "not awaiting approval" }, 409);
    return c.body(null, 204);
  });

  // ── BYOK credentials: write-only. Responses carry last4 + status, never key material. ──
  const PUBLIC_COLS = "id, provider, label, last4, created_at";

  app.get("/v1/credentials", async (c) => {
    const rows = await asUser(pool, c.get("uid"), async (tx) =>
      (await tx.query(`select ${PUBLIC_COLS} from credentials where revoked_at is null order by provider`)).rows,
    );
    return c.json({ credentials: rows });
  });

  app.post("/v1/credentials", async (c) => {
    const b = await body(c.req.raw);
    const provider = typeof b.provider === "string" && PROVIDER.test(b.provider) ? b.provider : undefined;
    if (!provider) throw bad("provider must be a lowercase provider id");
    const label = b.label === undefined ? "" : str(b.label, "label", 0, 80);
    if (typeof b.secret !== "string") throw bad("secret required");
    const uid = c.get("uid");
    const id = randomUUID(); // generated here so the ciphertext is bound to this exact row
    let sealed;
    try {
      sealed = seal(ring, b.secret, { ownerId: uid, provider, credentialId: id });
    } catch {
      throw bad("secret must be 8..4096 characters");
    }
    const row = await asUser(pool, uid, async (tx) => {
      // serialize concurrent adds for this user+provider; otherwise both revoke nothing and one hits the unique index
      await tx.query("select pg_advisory_xact_lock(hashtext('feista:cred:' || app_user()::text || ':' || $1))", [provider]);
      await revoke(tx, "provider = $1", [provider]); // one active key per provider
      return (await tx.query(
        `insert into credentials (id, owner_id, provider, label, ciphertext, wrapped_key, key_version, last4)
         values ($1, app_user(), $2, $3, $4, $5, $6, $7) returning ${PUBLIC_COLS}`,
        [id, provider, label, sealed.ciphertext, sealed.wrappedKey, sealed.keyVersion, sealed.last4],
      )).rows[0];
    });
    return c.json({ credential: row }, 201);
  });

  app.delete("/v1/credentials/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) throw notFound();
    const n = await asUser(pool, c.get("uid"), (tx) => revoke(tx, "id = $1", [id]));
    if (n === 0) throw notFound();
    return c.body(null, 204);
  });

  return app;
}

/** Revocation wipes the key material; the row stays for audit (provider, label, last4, dates). */
async function revoke(tx: pg.PoolClient, where: string, params: unknown[]): Promise<number> {
  const r = await tx.query(
    `update credentials set revoked_at = now(), ciphertext = '\\x', wrapped_key = '\\x' where revoked_at is null and ${where}`,
    params,
  );
  return r.rowCount ?? 0;
}
