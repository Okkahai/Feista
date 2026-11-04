import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { parse } from "pg-connection-string";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KeyRing } from "@feista/vault";
import { createApp, loadSecret } from "./app";
import { devTokens } from "./auth";
import { asUser } from "./db";

// Runs against a real, freshly migrated Postgres (db/with-temp-db.sh sets DATABASE_URL).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("run via `pnpm test` (db/with-temp-db.sh provides DATABASE_URL)");

const admin = new pg.Pool({ connectionString: url, max: 2 });
// connectionString would override `user`, so build the config explicitly
const pool = new pg.Pool({ ...(parse(url) as unknown as pg.PoolConfig), user: "feista_api", password: "feista-test", max: 4 });
const ring = KeyRing.parse(`1:${randomBytes(32).toString("base64")}`, 1);
const tokens = devTokens(randomBytes(32));
const logs: string[] = [];
const app = createApp({ pool, ring, authenticate: tokens.authenticate, log: (l) => logs.push(l) });

const A = randomUUID(), B = randomUUID();
const call = (uid: string | null, method: string, path: string, json?: unknown) =>
  app.request(path, {
    method,
    headers: { ...(uid ? { authorization: `Bearer ${tokens.sign(uid)}` } : {}), "content-type": "application/json" },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
const SECRET = "fal_live_abcdefghijklmnop1234WXYZ";
const story = { kind: "story", title: "Long Drop", sceneCount: 6, budgetLimitCents: 500, approvalThresholdCents: 200, warnFraction: 0.8 };

beforeAll(async () => {
  await admin.query("alter role feista_api login password 'feista-test'");
  await admin.query("insert into users (id, email) values ($1, 'a@x.test'), ($2, 'b@x.test')", [A, B]);
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});

describe("auth", () => {
  it("rejects missing, malformed and forged tokens", async () => {
    expect((await call(null, "GET", "/v1/projects")).status).toBe(401);
    const forged = devTokens(randomBytes(32)).sign(A);
    expect((await app.request("/v1/projects", { headers: { authorization: `Bearer ${forged}` } })).status).toBe(401);
    expect((await app.request("/v1/projects", { headers: { authorization: `Bearer ${A}` } })).status).toBe(401);
  });
  it("connects as the unprivileged API role and runs as feista_app", async () => {
    const who = await asUser(pool, A, async (tx) => (await tx.query("select session_user::text s, current_user::text c")).rows[0]);
    expect(who).toEqual({ s: "feista_api", c: "feista_app" });
  });
});

describe("transaction scoping", () => {
  it("leaves no role or user id on the pooled connection afterwards", async () => {
    const one = new pg.Pool({ ...(parse(url) as unknown as pg.PoolConfig), user: "feista_api", password: "feista-test", max: 1 });
    try {
      await asUser(one, A, async (tx) => tx.query("select 1"));
      const after = (await one.query("select current_user::text u, coalesce(current_setting('app.user_id', true), '') id")).rows[0];
      expect(after).toEqual({ u: "feista_api", id: "" });
      await expect(asUser(one, A, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
      expect((await one.query("select current_user::text u")).rows[0].u).toBe("feista_api");
    } finally {
      await one.end();
    }
  });
});

describe("projects", () => {
  it("creates, lists and isolates per user", async () => {
    const res = await call(A, "POST", "/v1/projects", story);
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as { project: { id: string } };
    expect(((await (await call(A, "GET", "/v1/projects")).json()) as { projects: unknown[] }).projects).toHaveLength(1);
    expect((await call(A, "GET", `/v1/projects/${project.id}`)).status).toBe(200);
    expect(((await (await call(B, "GET", "/v1/projects")).json()) as { projects: unknown[] }).projects).toHaveLength(0);
    expect((await call(B, "GET", `/v1/projects/${project.id}`)).status).toBe(404);
    expect((await call(B, "GET", "/v1/projects/not-a-uuid")).status).toBe(404);
  });
  it("validates input", async () => {
    for (const bad of [{ ...story, kind: "x" }, { ...story, sceneCount: 0 }, { ...story, title: "" }, { ...story, budgetLimitCents: 1.5 }, { ...story, warnFraction: 0 }, [], "x"])
      expect((await call(A, "POST", "/v1/projects", bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await call(A, "POST", "/v1/projects", { ...story, title: "x".repeat(20_000) })).status).toBe(413);
    expect((await call(A, "POST", "/v1/projects", { ...story, title: "a\u0000b" })).status).toBe(400);
  });
  it("answers 401, not 500, for a signed token whose user does not exist", async () => {
    expect((await call(randomUUID(), "POST", "/v1/projects", story)).status).toBe(401);
  });
});

describe("credentials (BYOK)", () => {
  it("stores only ciphertext and never returns key material", async () => {
    const res = await call(A, "POST", "/v1/credentials", { provider: "fal", label: "main", secret: SECRET });
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text).credential).toMatchObject({ provider: "fal", label: "main", last4: "WXYZ" });
    const list = await (await call(A, "GET", "/v1/credentials")).text();
    expect(list).not.toContain(SECRET);
    expect(list).not.toMatch(/ciphertext|wrapped/);
    const raw = (await admin.query("select ciphertext from credentials where owner_id = $1", [A])).rows[0].ciphertext as Buffer;
    expect(raw.includes(Buffer.from(SECRET))).toBe(false);
    expect(await loadSecret(pool, ring, A, "fal")).toBe(SECRET);
  });
  it("is invisible and unusable for other users", async () => {
    expect(((await (await call(B, "GET", "/v1/credentials")).json()) as { credentials: unknown[] }).credentials).toHaveLength(0);
    await expect(loadSecret(pool, ring, B, "fal")).rejects.toThrow(/no active/);
    const id = (await admin.query("select id from credentials where owner_id = $1 and revoked_at is null", [A])).rows[0].id;
    expect((await call(B, "DELETE", `/v1/credentials/${id}`)).status).toBe(404);
    expect(await loadSecret(pool, ring, A, "fal")).toBe(SECRET);
  });
  it("replacing a key revokes and wipes the old one", async () => {
    const next = "fal_live_second_key_0000000000ABCD";
    expect((await call(A, "POST", "/v1/credentials", { provider: "fal", secret: next })).status).toBe(201);
    expect(await loadSecret(pool, ring, A, "fal")).toBe(next);
    const rows = (await admin.query("select length(ciphertext) n, revoked_at from credentials where owner_id = $1 order by created_at", [A])).rows;
    expect(rows.map((r) => [r.n, r.revoked_at !== null])).toEqual([[0, true], [expect.any(Number), false]]);
  });
  it("concurrent adds for one provider all succeed and leave one active key", async () => {
    const res = await Promise.all(Array.from({ length: 6 }, (_, i) => call(B, "POST", "/v1/credentials", { provider: "elevenlabs", secret: `xi_key_${i}_abcdefghijklmnop` })));
    expect(res.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect((await admin.query("select count(*)::int n from credentials where owner_id = $1 and revoked_at is null", [B])).rows[0].n).toBe(1);
  });
  it("delete revokes", async () => {
    const id = ((await (await call(A, "GET", "/v1/credentials")).json()) as { credentials: { id: string }[] }).credentials[0]!.id;
    expect((await call(A, "DELETE", `/v1/credentials/${id}`)).status).toBe(204);
    expect((await call(A, "DELETE", `/v1/credentials/${id}`)).status).toBe(404);
    await expect(loadSecret(pool, ring, A, "fal")).rejects.toThrow(/no active/);
  });
  it("validates input", async () => {
    for (const bad of [{ provider: "FAL", secret: SECRET }, { provider: "fal" }, { provider: "fal", secret: "short" }, { provider: "fal", secret: SECRET, label: 5 }])
      expect((await call(A, "POST", "/v1/credentials", bad)).status, JSON.stringify(bad)).toBe(400);
  });
  it("redacts secrets from error logs", async () => {
    const broken = createApp({ pool: { connect: () => Promise.reject(new Error(`connect failed api_key=${SECRET}`)) } as unknown as pg.Pool, ring, authenticate: tokens.authenticate, log: (l) => logs.push(l) });
    const res = await broken.request("/v1/credentials", { headers: { authorization: `Bearer ${tokens.sign(A)}` } });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(SECRET);
    expect(logs.join("\n")).not.toContain(SECRET);
    expect(logs.length).toBeGreaterThan(0);
  });
});
