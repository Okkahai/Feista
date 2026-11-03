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

export function decideSpend(budget: Budget, ledger: readonly LedgerEntry[], estimateCents: number): SpendDecision {
  if (!Number.isInteger(estimateCents) || estimateCents < 0) throw new Error("estimate must be non-negative integer cents");
  const projectedCents = committedCents(ledger) + estimateCents;
  if (projectedCents > budget.limitCents) return { decision: "deny", reason: "over_budget", projectedCents };
  if (estimateCents >= budget.approvalThresholdCents) return { decision: "needs_approval", reason: "over_threshold" };
  if (projectedCents >= budget.limitCents * budget.warnFraction) return { decision: "warn", projectedCents };
  return { decision: "allow" };
}
