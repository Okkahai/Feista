/** Spend guard. All money in integer US cents; estimates are never treated as billed amounts. */
export interface Budget {
  limitCents: number; // hard cap for the project (or month)
  approvalThresholdCents: number; // single operations at/above this need the user's OK
  warnFraction: number; // e.g. 0.8
}

export interface LedgerEntry {
  estimatedCents: number;
  /** Provider-reported cost once known. Undefined = still an estimate. */
  reportedCents?: number;
}

export type SpendDecision =
  | { decision: "allow" }
  | { decision: "warn"; projectedCents: number }
  | { decision: "needs_approval"; reason: "over_threshold" }
  | { decision: "deny"; reason: "over_budget"; projectedCents: number };

/** Committed spend: reported cost where known, otherwise the (worst-case) estimate. */
export function committedCents(ledger: readonly LedgerEntry[]): number {
  return ledger.reduce((sum, e) => sum + (e.reportedCents ?? e.estimatedCents), 0);
}

const isCents = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;

/**
 * Fails closed: malformed budget or ledger data throws instead of letting spend through.
 * `approved` = the user already approved this specific operation, which skips only the threshold gate.
 */
export function decideSpend(
  budget: Budget,
  ledger: readonly LedgerEntry[],
  estimateCents: number,
  opts: { approved?: boolean } = {},
): SpendDecision {
  if (!isCents(estimateCents)) throw new Error("estimate must be non-negative integer cents");
  if (!isCents(budget.limitCents) || !isCents(budget.approvalThresholdCents)) throw new Error("budget must be integer cents");
  if (!(budget.warnFraction >= 0 && budget.warnFraction <= 1)) throw new Error("warnFraction must be within 0..1");
  for (const e of ledger) {
    if (!isCents(e.estimatedCents) || (e.reportedCents !== undefined && !isCents(e.reportedCents)))
      throw new Error("ledger entries must be integer cents");
  }
  const projectedCents = committedCents(ledger) + estimateCents;
  if (projectedCents > budget.limitCents) return { decision: "deny", reason: "over_budget", projectedCents };
  if (!opts.approved && estimateCents >= budget.approvalThresholdCents) return { decision: "needs_approval", reason: "over_threshold" };
  if (projectedCents >= budget.limitCents * budget.warnFraction) return { decision: "warn", projectedCents };
  return { decision: "allow" };
}
