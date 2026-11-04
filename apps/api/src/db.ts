import pg from "pg";
import { type KeyRing, open } from "@feista/vault";

export type Tx = pg.PoolClient;

async function inTx<T>(pool: pg.Pool, setup: (c: Tx) => Promise<unknown>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  let broken = false;
  try {
    await c.query("begin");
    await setup(c);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => (broken = true));
    throw e;
  } finally {
    c.release(broken); // a connection that could not roll back is destroyed, never reused
  }
}

/**
 * The database access contract (docs/SECURITY.md): every request runs in one transaction as
 * feista_app with app.user_id set locally, so RLS scopes every statement to that user.
 * `userId` must come from the verified session only.
 */
export function asUser<T>(pool: pg.Pool, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inTx(pool, async (c) => {
    await c.query("set local role feista_app");
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
  }, fn);
}

/** Runner-only (login feista_runner): cross-tenant queue access, no credentials or users. */
export function asWorker<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inTx(pool, (c) => c.query("set local role feista_worker"), fn);
}

/** Server-side only (job runner, right before a provider call). Throws if the user has no active key. */
export async function loadSecret(pool: pg.Pool, ring: KeyRing, uid: string, provider: string): Promise<string> {
  const row = await asUser(pool, uid, async (tx) =>
    (await tx.query("select id, ciphertext, wrapped_key, key_version from credentials where provider = $1 and revoked_at is null", [provider])).rows[0],
  );
  if (!row) throw new Error(`no active ${provider} credential`);
  return open(ring, { ciphertext: row.ciphertext, wrappedKey: row.wrapped_key, keyVersion: row.key_version, last4: "" }, { ownerId: uid, provider, credentialId: row.id });
}
