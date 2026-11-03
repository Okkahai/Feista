/** Job / stage lifecycle shared by API, workers and the app. */
export const JOB_STATUSES = [
  "queued",
  "running",
  "awaiting_provider",
  "awaiting_review",
  "completed",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

const NEXT: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "cancelled"],
  // running -> queued: a worker lost its lease (restart) and the run is re-enqueued.
  running: ["awaiting_provider", "awaiting_review", "completed", "failed", "cancelled", "queued"],
  awaiting_provider: ["running", "failed", "cancelled"],
  // review: approve -> completed, request revision -> queued.
  awaiting_review: ["completed", "queued", "cancelled"],
  failed: ["queued"], // manual or automatic retry
  completed: ["queued"], // regenerate ("new take"), or invalidated by an upstream regeneration
  cancelled: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return NEXT[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(public from: JobStatus, public to: JobStatus) {
    super(`invalid job transition ${from} -> ${to}`);
  }
}

export interface StageRun {
  nodeId: string;
  status: JobStatus;
  /** Bumps when a completed/reviewed result is thrown away for a new take; resets attempt. */
  generation: number;
  attempt: number; // 1-based within a generation; bumps on every re-queue from failed
  maxAttempts: number;
  leaseLosses: number; // worker died mid-run; capped so a job that kills workers can't loop forever
  maxLeaseLosses: number;
  updatedAt: string;
  error?: string;
}

/** Why `run` may not move to `to`, or undefined if it may. Schedulers should check this, not canTransition. */
export function blockedReason(run: StageRun, to: JobStatus): string | undefined {
  if (!canTransition(run.status, to)) return `invalid job transition ${run.status} -> ${to}`;
  if (run.status === "failed" && to === "queued" && run.attempt >= run.maxAttempts)
    return `${run.nodeId}: max attempts (${run.maxAttempts}) reached`;
  if (run.status === "running" && to === "queued" && run.leaseLosses >= run.maxLeaseLosses)
    return `${run.nodeId}: lost its worker ${run.leaseLosses} times; fail it instead`;
  return undefined;
}

export function transition(run: StageRun, to: JobStatus, now: Date, error?: string): StageRun {
  const blocked = blockedReason(run, to);
  if (blocked) {
    if (!canTransition(run.status, to)) throw new InvalidTransitionError(run.status, to);
    throw new Error(blocked);
  }
  const retry = run.status === "failed" && to === "queued";
  const newTake = (run.status === "completed" || run.status === "awaiting_review") && to === "queued";
  const leaseLost = run.status === "running" && to === "queued";
  const next: StageRun = {
    ...run,
    status: to,
    generation: newTake ? run.generation + 1 : run.generation,
    attempt: newTake ? 1 : retry ? run.attempt + 1 : run.attempt,
    leaseLosses: newTake ? 0 : leaseLost ? run.leaseLosses + 1 : run.leaseLosses,
    updatedAt: now.toISOString(),
  };
  if (to === "failed" && error !== undefined) next.error = error;
  else delete next.error;
  return next;
}

/** Exponential backoff with full jitter. `rand` is injectable for tests. */
export function retryDelayMs(attempt: number, baseMs = 2000, capMs = 5 * 60_000, rand = Math.random): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(rand() * ceiling);
}

/**
 * Key sent to providers / used for de-duplicating side effects. Same generation+attempt => same key,
 * so a worker that crashes after submitting re-attaches instead of paying twice; a new take or a
 * retry gets a new key and really regenerates.
 */
export function idempotencyKey(projectId: string, run: Pick<StageRun, "nodeId" | "generation" | "attempt">, inputHash: string): string {
  return `${projectId}:${run.nodeId}:${inputHash}:g${run.generation}:a${run.attempt}`;
}
