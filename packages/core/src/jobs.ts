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
  completed: [],
  cancelled: [],
};

export const TERMINAL: readonly JobStatus[] = ["completed", "cancelled"];

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
  attempt: number; // 1-based; bumps on every re-queue from failed
  maxAttempts: number;
  updatedAt: string;
  error?: string;
}

export function transition(run: StageRun, to: JobStatus, now: Date, error?: string): StageRun {
  if (!canTransition(run.status, to)) throw new InvalidTransitionError(run.status, to);
  const retry = run.status === "failed" && to === "queued";
  if (retry && run.attempt >= run.maxAttempts) {
    throw new Error(`${run.nodeId}: max attempts (${run.maxAttempts}) reached`);
  }
  const next: StageRun = {
    ...run,
    status: to,
    attempt: retry ? run.attempt + 1 : run.attempt,
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
 * Key sent to providers / used for de-duplicating side effects. Same attempt => same key,
 * so a worker that crashes after submitting re-attaches instead of paying twice.
 */
export function idempotencyKey(projectId: string, nodeId: string, inputHash: string, attempt: number): string {
  return `${projectId}:${nodeId}:${inputHash}:a${attempt}`;
}
