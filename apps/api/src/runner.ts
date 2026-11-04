/**
 * Story job runner. `stage_runs` is the queue: nodes are claimed with FOR UPDATE SKIP LOCKED,
 * leased, and moved through the lifecycle in packages/core (transition/blockedReason), so the
 * rules the app shows are the rules the runner enforces. See DECISIONS #13.
 */
import {
  type JobStatus,
  type StageRun,
  STORY_STAGES,
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
  spend_approved: boolean;
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
async function save(tx: Tx, projectId: string, run: StageRun, extra: { runAfterMs?: number; fence?: Date; spendApproved?: boolean } = {}): Promise<boolean> {
  const r = await tx.query(
    `update stage_runs set status = $3, generation = $4, attempt = $5, lease_losses = $6, error = $7,
       lease_until = null, run_after = now() + make_interval(secs => $8::double precision / 1000),
       spend_approved = coalesce($10, spend_approved), updated_at = now()
     where project_id = $1 and node_id = $2 and ($9::timestamptz is null or (status = 'running' and lease_until = $9))`,
    [projectId, run.nodeId, run.status, run.generation, run.attempt, run.leaseLosses, run.error ?? null, extra.runAfterMs ?? 0, extra.fence ?? null, extra.spendApproved ?? null],
  );
  return (r.rowCount ?? 0) === 1;
}

/** Queue every node whose dependencies are complete. Safe to call from any transaction that can see the project. */
export async function advance(tx: Tx, projectId: string): Promise<void> {
  // serialize per project: two scenes finishing at once must not both miss the join node
  await tx.query("select pg_advisory_xact_lock(hashtext('feista:advance:' || $1))", [projectId]);
  const p = (await tx.query("select scene_count from projects where id = $1", [projectId])).rows[0] as { scene_count: number } | undefined;
  if (!p) throw new Error(`project ${projectId} not visible`);
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

/** Claim one queued node, budget-gate it, run it, record the outcome. Returns false when nothing was claimable. */
export async function runOnce(deps: RunnerDeps): Promise<boolean> {
  const { pool, ring, handlers, delayMs = (a) => retryDelayMs(a), log = console.error } = deps;
  const stages = Object.keys(handlers).filter((s) => handlers[s]);
  if (stages.length === 0) return false;

  const claimed = await asWorker(pool, async (tx) => {
    const r = (await tx.query(
      `update stage_runs s set status = 'running', updated_at = now(),
         lease_until = date_trunc('milliseconds', now() + make_interval(secs => $2::double precision / 1000))
       from (select project_id, node_id from stage_runs
             where status = 'queued' and run_after <= now() and split_part(node_id, ':', 1) = any($1)
             order by run_after limit 1 for update skip locked) c
       where s.project_id = c.project_id and s.node_id = c.node_id
       returning s.*`,
      [stages, 10 * 60_000],
    )).rows[0] as Row | undefined;
    if (!r) return "idle" as const;
    const handler = handlers[stageOf(r.node_id)]!;
    if (handler.leaseMs) {
      r.lease_until = (await tx.query(
        "update stage_runs set lease_until = date_trunc('milliseconds', now() + make_interval(secs => $3::double precision / 1000)) where project_id = $1 and node_id = $2 returning lease_until",
        [r.project_id, r.node_id, handler.leaseMs],
      )).rows[0].lease_until;
    }
    const proj = (await tx.query("select owner_id, budget_limit_cents, approval_threshold_cents, warn_fraction from projects where id = $1", [r.project_id])).rows[0];
    const ctx: StageContext = {
      projectId: r.project_id,
      ownerId: proj.owner_id,
      nodeId: r.node_id,
      ...(r.node_id.includes(":") ? { scene: Number(r.node_id.split(":")[1]) } : {}),
      idempotencyKey: idempotencyKey(r.project_id, { nodeId: r.node_id, generation: r.generation, attempt: r.attempt }, "v1"),
      secret: (provider) => loadSecret(pool, ring, proj.owner_id, provider),
    };
    if (STAGE.get(stageOf(r.node_id))?.paid) {
      // fail closed: a paid stage with no estimate never runs
      const est = handler.estimate?.(ctx);
      const run = toRun(r);
      if (!est) {
        await save(tx, r.project_id, transition(run, "failed", new Date(), "paid stage has no cost estimate"));
        return "gated" as const;
      }
      const ledger = (await tx.query("select estimated_cents, reported_cents from ledger where project_id = $1", [r.project_id])).rows.map((l) => ({
        estimatedCents: l.estimated_cents as number,
        ...(l.reported_cents === null ? {} : { reportedCents: l.reported_cents as number }),
      }));
      const d = decideSpend(
        { limitCents: proj.budget_limit_cents, approvalThresholdCents: proj.approval_threshold_cents, warnFraction: Number(proj.warn_fraction) },
        ledger,
        est.cents,
        { approved: r.spend_approved },
      );
      if (d.decision === "deny") {
        await save(tx, r.project_id, transition(run, "failed", new Date(), `over budget: would reach ${d.projectedCents} of ${proj.budget_limit_cents} cents`));
        return "gated" as const;
      }
      if (d.decision === "needs_approval") {
        await save(tx, r.project_id, transition(run, "awaiting_review", new Date()));
        return "gated" as const;
      }
      // reserve the estimate now; reported cost replaces it when the provider tells us
      await tx.query("insert into ledger (project_id, node_id, provider, estimated_cents) values ($1, $2, $3, $4)", [r.project_id, r.node_id, est.provider, est.cents]);
    }
    return { row: r, handler, ctx };
  });
  if (claimed === "idle") return false;
  if (claimed === "gated") return true; // progress: the node was failed or parked for approval

  const { row, handler, ctx } = claimed;
  const fence = row.lease_until!;
  try {
    const out = await handler.run(ctx);
    await asWorker(pool, async (tx) => {
      if (!(await save(tx, row.project_id, transition(toRun(row), "completed", new Date()), { fence, spendApproved: false }))) return; // lease lost meanwhile
      if (out && out.reportedCents !== undefined) {
        await tx.query(
          `update ledger set reported_cents = $3 where id = (select id from ledger where project_id = $1 and node_id = $2
             and reported_cents is null order by created_at desc limit 1)`,
          [row.project_id, row.node_id, out.reportedCents],
        );
      }
      await advance(tx, row.project_id);
    });
  } catch (e) {
    const msg = redact(e instanceof Error ? e.message : String(e)).slice(0, 500);
    log(`${row.project_id} ${row.node_id} failed: ${msg}`);
    await asWorker(pool, async (tx) => {
      const failed = transition(toRun(row), "failed", new Date(), msg);
      if (e instanceof PermanentError || blockedReason(failed, "queued")) {
        await save(tx, row.project_id, failed, { fence });
      } else {
        const retry = transition(failed, "queued", new Date());
        await save(tx, row.project_id, retry, { fence, runAfterMs: delayMs(retry.attempt) });
      }
    });
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
    // awaiting_review -> queued counts as a new take (generation+1): nothing was submitted yet, so that is harmless
    await save(tx, projectId, transition(toRun(r), "queued", new Date()), { spendApproved: true });
  }
  return "approved";
}
