import pg from "pg";

export type Tx = pg.PoolClient;

/**
 * The database access contract (docs/SECURITY.md): every request runs in one transaction as
 * feista_app with app.user_id set locally, so RLS scopes every statement to that user.
 * `userId` must come from the verified session only.
 */
export async function asUser<T>(pool: pg.Pool, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  let broken = false;
  try {
    await c.query("begin");
    await c.query("set local role feista_app");
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
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
