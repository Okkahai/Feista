/**
 * Story job runner. `stage_runs` is the queue: nodes are claimed with FOR UPDATE SKIP LOCKED,
 * leased, and moved through the lifecycle in packages/core (transition/blockedReason), so the
 * rules the app shows are the rules the runner enforces. See DECISIONS #13.
 */
import {
  type JobStatus,
  type StageRun,
  STORY_STAGES,
  type SpendDecision,
  blockedReason,
  decideSpend,
  expand,
  idempotencyKey,
  readyNodes,
  retryDelayMs,
  transition,
} from "@feista/core";
import type { KeyRing } from "@feista/vault";
import { redact } from "@feista/vault";
import type pg from "pg";
import { type Tx, asWorker, loadSecret } from "./db";

export const MAX_ATTEMPTS = 3;
export const MAX_LEASE_LOSSES = 2;

export interface StageContext {
  projectId: string;
  ownerId: string;
  nodeId: string;
  scene?: number;
  idempotencyKey: string;
  /** The project owner's own provider key (BYOK). Server-side only; never log it. */
  secret(provider: string): Promise<string>;
}

export interface StageHandler {
  /** Required for paid stages: the run is budget-checked against this before it starts. */
  estimate?: (ctx: StageContext) => { provider: string; cents: number };
  run(ctx: StageContext): Promise<{ reportedCents?: number } | void>;
  leaseMs?: number;
}

/** Throw this for failures a retry cannot fix (bad input, rejected key). */
export class PermanentError extends Error {}

export interface RunnerDeps {
  pool: pg.Pool; // logs in as feista_runner
  ring: KeyRing;
  handlers: Partial<Record<string, StageHandler>>;
  delayMs?: (attempt: number) => number;
  log?: (line: string) => void;
}

const STAGE = new Map(STORY_STAGES.map((s) => [s.id, s]));
const stageOf = (nodeId: string) => nodeId.split(":")[0]!;

interface Row {
  project_id: string;
  node_id: string;
  status: JobStatus;
  generation: number;
  attempt: number;
  max_attempts: number;
  lease_losses: number;
  max_lease_losses: number;
  lease_until: Date | null;
  spend_pending_cents: number | null;
  spend_approved_cents: number | null;
  error: string | null;
  updated_at: Date;
}

const toRun = (r: Row): StageRun => ({
  nodeId: r.node_id,
  status: r.status,
  generation: r.generation,
  attempt: r.attempt,
  maxAttempts: r.max_attempts,
  leaseLosses: r.lease_losses,
  maxLeaseLosses: r.max_lease_losses,
  updatedAt: r.updated_at.toISOString(),
  ...(r.error ? { error: r.error } : {}),
});

/** Persist a lifecycle step. `fence` = the lease we hold (ms-truncated so it round-trips via Date); a stale holder updates nothing. */
async function save(
  tx: Tx,
  projectId: string,
  run: StageRun,
  extra: { runAfterMs?: number; fence?: Date; spend?: { pending: number | null; approved: number | null } } = {},
): Promise<boolean> {
  const r = await tx.query(
    `update stage_runs set status = $3, generation = $4, attempt = $5, lease_losses = $6, error = $7,
       lease_until = null, run_after = now() + make_interval(secs => $8::double precision / 1000),
       spend_pending_cents = case when $10 then $11 else spend_pending_cents end,
       spend_approved_cents = case when $10 then $12 else spend_approved_cents end, updated_at = now()
     where project_id = $1 and node_id = $2 and ($9::timestamptz is null or (status = 'running' and lease_until = $9))`,
    [projectId, run.nodeId, run.status, run.generation, run.attempt, run.leaseLosses, run.error ?? null, extra.runAfterMs ?? 0,
      extra.fence ?? null, extra.spend !== undefined, extra.spend?.pending ?? null, extra.spend?.approved ?? null],
  );
  return (r.rowCount ?? 0) === 1;
}

const projectLock = (tx: Tx, kind: string, projectId: string) =>
  tx.query("select pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [`feista:${kind}`, projectId]);

/** Queue every node whose dependencies are complete. Safe to call from any transaction that can see the project. */
export async function advance(tx: Tx, projectId: string): Promise<void> {
  // serialize per project: two scenes finishing at once must not both miss the join node
  await projectLock(tx, "advance", projectId);
  const p = (await tx.query("select kind, scene_count from projects where id = $1", [projectId])).rows[0] as { kind: string; scene_count: number } | undefined;
  if (!p) throw new Error(`project ${projectId} not visible`);
  if (p.kind !== "story") return; // shortcut: only the Story DAG exists; Clip Studio gets its own stages later
  const rows = (await tx.query("select node_id, status from stage_runs where project_id = $1", [projectId])).rows as { node_id: string; status: string }[];
  const status = Object.fromEntries(rows.map((r) => [r.node_id, r.status]));
  for (const n of readyNodes(expand(STORY_STAGES, p.scene_count), status)) {
    await tx.query(
      `insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses) values ($1, $2, $3, $4, $5)
       on conflict do nothing`,
      [projectId, n.id, STAGE.get(n.stage)?.review ? "awaiting_review" : "queued", MAX_ATTEMPTS, MAX_LEASE_LOSSES],
    );
  }
}

const DEFAULT_LEASE_MS = 10 * 60_000;

/** Claim one queued node, budget-gate it, run it, record the outcome. Returns false when nothing was claimable. */
export async function runOnce(deps: RunnerDeps): Promise<boolean> {
  const { pool, ring, handlers, delayMs = (a) => retryDelayMs(a), log = console.error } = deps;
  const stages = Object.keys(handlers).filter((s) => handlers[s]);
  if (stages.length === 0) return false;
  const opened: string[] = []; // keys decrypted for this job, redacted verbatim from any error

  const claimed = await asWorker(pool, async (tx) => {
    const r = (await tx.query(
      `update stage_runs s set status = 'running', updated_at = now(),
         lease_until = date_trunc('milliseconds', now() + make_interval(secs => $2::double precision / 1000))
       from (select project_id, node_id from stage_runs
             where status = 'queued' and run_after <= now() and split_part(node_id, ':', 1) = any($1)
             order by run_after limit 1 for update skip locked) c
       where s.project_id = c.project_id and s.node_id = c.node_id
       returning s.*`,
      [stages, DEFAULT_LEASE_MS],
    )).rows[0] as Row | undefined;
    if (!r) return "idle" as const;
    const handler = handlers[stageOf(r.node_id)]!;
    const leaseMs = handler.leaseMs ?? DEFAULT_LEASE_MS;
    if (handler.leaseMs) {
      r.lease_until = (await tx.query(
        "update stage_runs set lease_until = date_trunc('milliseconds', now() + make_interval(secs => $3::double precision / 1000)) where project_id = $1 and node_id = $2 returning lease_until",
        [r.project_id, r.node_id, leaseMs],
      )).rows[0].lease_until;
    }
    const proj = (await tx.query("select owner_id, budget_limit_cents, approval_threshold_cents, warn_fraction from projects where id = $1", [r.project_id])).rows[0];
    const ctx: StageContext = {
      projectId: r.project_id,
      ownerId: proj.owner_id,
      nodeId: r.node_id,
      ...(r.node_id.includes(":") ? { scene: Number(r.node_id.split(":")[1]) } : {}),
      idempotencyKey: idempotencyKey(r.project_id, { nodeId: r.node_id, generation: r.generation, attempt: r.attempt }, "v1"),
      secret: async (provider) => {
        const k = await loadSecret(pool, ring, proj.owner_id, provider);
        opened.push(k);
        return k;
      },
    };
    if (STAGE.get(stageOf(r.node_id))?.paid) {
      const run = toRun(r);
      const fail = async (why: string) => {
        await save(tx, r.project_id, transition(run, "failed", new Date(), why));
        return "gated" as const;
      };
      // serialize spend decisions per project: two paid nodes must not both fit under the same headroom
      await projectLock(tx, "spend", r.project_id);
      let est: { provider: string; cents: number } | undefined;
      let d: SpendDecision;
      try {
        est = handler.estimate?.(ctx);
        if (!est) return await fail("paid stage has no cost estimate"); // fail closed
        // this node's own unreported reservation (an earlier attempt) is replaced below, not counted twice
        const ledger = (await tx.query(
          "select estimated_cents, reported_cents from ledger where project_id = $1 and not (node_id = $2 and reported_cents is null)",
          [r.project_id, r.node_id],
        )).rows.map((l) => ({ estimatedCents: l.estimated_cents as number, ...(l.reported_cents === null ? {} : { reportedCents: l.reported_cents as number }) }));
        d = decideSpend(
          { limitCents: proj.budget_limit_cents, approvalThresholdCents: proj.approval_threshold_cents, warnFraction: Number(proj.warn_fraction) },
          ledger,
          est.cents,
          { approved: r.spend_approved_cents !== null && est.cents <= r.spend_approved_cents },
        );
      } catch (e) {
        // a bad estimate must fail this node, not roll back and wedge the head of the queue
        return await fail(`budget check failed: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
      }
      if (d.decision === "deny") return await fail(`over budget: would reach ${d.projectedCents} of ${proj.budget_limit_cents} cents`);
      if (d.decision === "needs_approval") {
        await save(tx, r.project_id, transition(run, "awaiting_review", new Date()), { spend: { pending: est.cents, approved: null } });
        return "gated" as const;
      }
      if (d.decision === "warn") log(`${r.project_id} ${r.node_id}: budget warning, projected ${d.projectedCents} of ${proj.budget_limit_cents} cents`);
      // one outstanding reservation per node; the reported cost replaces it when the provider tells us
      await tx.query("delete from ledger where project_id = $1 and node_id = $2 and reported_cents is null", [r.project_id, r.node_id]);
      await tx.query("insert into ledger (project_id, node_id, provider, estimated_cents) values ($1, $2, $3, $4)", [r.project_id, r.node_id, est.provider, est.cents]);
    }
    return { row: r, handler, ctx, leaseMs };
  });
  if (claimed === "idle") return false;
  if (claimed === "gated") return true; // progress: the node was failed or parked for approval

  const { row, handler, ctx, leaseMs } = claimed;
  let fence = row.lease_until!;
  // heartbeat: extend our lease while the handler runs, so a long job is not reaped and run twice
  let renewing: Promise<unknown> | undefined;
  const beat = setInterval(() => {
    if (renewing) return; // one renewal at a time
    renewing = asWorker(pool, (tx) =>
      tx.query(
        `update stage_runs set lease_until = date_trunc('milliseconds', now() + make_interval(secs => $4::double precision / 1000))
         where project_id = $1 and node_id = $2 and status = 'running' and lease_until = $3 returning lease_until`,
        [row.project_id, row.node_id, fence, leaseMs],
      ),
    )
      .then((r) => { if (r.rows[0]) fence = r.rows[0].lease_until; })
      .catch((e) => log(`lease renewal failed: ${redact(String(e), opened)}`))
      .finally(() => (renewing = undefined));
  }, Math.max(10, Math.floor(leaseMs / 3)));
  // a renewal still in flight would move the lease after we read `fence` and orphan the result
  const stopBeat = async () => {
    clearInterval(beat);
    await renewing;
  };

  let out: { reportedCents?: number } | void;
  try {
    out = await handler.run(ctx);
  } catch (e) {
    await stopBeat();
    const msg = redact(e instanceof Error ? e.message : String(e), opened).slice(0, 500);
    log(`${row.project_id} ${row.node_id} failed: ${msg}`);
    await asWorker(pool, async (tx) => {
      const failed = transition(toRun(row), "failed", new Date(), msg);
      if (e instanceof PermanentError || blockedReason(failed, "queued")) await save(tx, row.project_id, failed, { fence });
      else {
        const retry = transition(failed, "queued", new Date());
        await save(tx, row.project_id, retry, { fence, runAfterMs: delayMs(retry.attempt) });
      }
    });
    return true;
  }
  await stopBeat();

  // The provider work succeeded. From here on, an error must never re-run (and re-pay for) it.
  try {
    const reported = out?.reportedCents;
    if (reported !== undefined && !(Number.isInteger(reported) && reported >= 0)) throw new Error(`handler reported invalid cost ${String(reported)}`);
    await asWorker(pool, async (tx) => {
      if (!(await save(tx, row.project_id, transition(toRun(row), "completed", new Date()), { fence, spend: { pending: null, approved: null } }))) return; // lease lost meanwhile
      if (reported !== undefined) {
        await tx.query(
          `update ledger set reported_cents = $3 where id = (select id from ledger where project_id = $1 and node_id = $2
             and reported_cents is null order by created_at desc limit 1)`,
          [row.project_id, row.node_id, reported],
        );
      }
      await advance(tx, row.project_id);
    });
  } catch (e) {
    const msg = `completed at the provider, but recording it failed: ${redact(e instanceof Error ? e.message : String(e), opened).slice(0, 300)}`;
    log(`${row.project_id} ${row.node_id}: ${msg}`);
    // park as failed (needs a person), never back to queued: the reservation stays counted
    await asWorker(pool, (tx) => save(tx, row.project_id, transition(toRun(row), "failed", new Date(), msg), { fence })).catch((e2) =>
      log(`could not mark ${row.node_id} failed: ${redact(String(e2), opened)}`),
    );
  }
  return true;
}

/** Re-queue (or fail, past the cap) nodes whose worker vanished without finishing. */
export async function reapExpired(pool: pg.Pool): Promise<number> {
  return asWorker(pool, async (tx) => {
    const rows = (await tx.query("select * from stage_runs where status = 'running' and lease_until < now() for update skip locked")).rows as Row[];
    for (const r of rows) {
      const run = toRun(r);
      const next = blockedReason(run, "queued") ? transition(run, "failed", new Date(), "worker lost repeatedly") : transition(run, "queued", new Date());
      await save(tx, r.project_id, next, { fence: r.lease_until! });
    }
    return rows.length;
  });
}

/** User decision on an awaiting_review node: the review stage completes; a spend gate re-queues with approval. */
export async function approve(tx: Tx, projectId: string, nodeId: string): Promise<"approved" | "not_found" | "not_waiting"> {
  const r = (await tx.query("select * from stage_runs where project_id = $1 and node_id = $2 for update", [projectId, nodeId])).rows[0] as Row | undefined;
  if (!r) return "not_found";
  if (r.status !== "awaiting_review") return "not_waiting";
  if (STAGE.get(stageOf(nodeId))?.review) {
    await save(tx, projectId, transition(toRun(r), "completed", new Date()));
    await advance(tx, projectId);
  } else {
    // approves exactly the amount the user was shown; awaiting_review -> queued counts as a new take,
    // harmless here because nothing was submitted to the provider yet
    await save(tx, projectId, transition(toRun(r), "queued", new Date()), { spend: { pending: null, approved: r.spend_pending_cents } });
  }
  return "approved";
}
