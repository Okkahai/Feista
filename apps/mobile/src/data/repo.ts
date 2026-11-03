/**
 * Repository seam between screens and data. Today the only implementation is
 * the in-memory FIXTURE repo; an API-backed repo implements the same interface
 * (snapshot + subscribe for reads, async mutations) and is swapped in at
 * `repo` below. Screens never import fixtures directly.
 */
import { useSyncExternalStore } from "react";
import {
  STORY_STAGES, expand, invalidated, transition, blockedReason, committedCents, decideSpend,
  type JobStatus, type LedgerEntry, type StageRun,
} from "@feista/core";
import { FIXTURE_NOW, FRAMES, initialState } from "./fixtures";
import type { Project, Settings, StoryInput, StudioState } from "./types";

export interface StudioRepo {
  getSnapshot(): StudioState;
  subscribe(listener: () => void): () => void;
  approveScene(projectId: string, scene: number): Promise<void>;
  requestRevision(projectId: string, scene: number, note: string): Promise<void>;
  retryStage(projectId: string, nodeId: string): Promise<void>;
  createStory(input: StoryInput): Promise<string>;
  updateSettings(patch: (s: Settings) => Settings): Promise<void>;
}

export const sceneNode = (scene: number) => `scene_video:${scene}`;

/** Roll a project's node runs up to one status; problems outrank progress. */
export function projectStatus(p: Project): JobStatus {
  const all = expand(STORY_STAGES, p.scenes.length).map((n) => p.runs[n.id]?.status);
  const has = (s: JobStatus) => all.includes(s);
  if (has("failed")) return "failed";
  if (has("cancelled")) return "cancelled";
  if (has("awaiting_review")) return "awaiting_review";
  if (has("running")) return "running";
  if (has("awaiting_provider")) return "awaiting_provider";
  if (all.every((s) => s === "completed")) return "completed";
  return all.some((s) => s === "completed") ? "running" : "queued";
}

/** Why a failed node can't be retried (core's blockedReason, worded for the UI), or undefined. */
export function retryBlockedReason(run: StageRun | undefined): string | undefined {
  if (!run || run.status !== "failed") return "Only failed stages can be retried";
  if (!blockedReason(run, "queued")) return undefined;
  return run.attempt >= run.maxAttempts ? `Max attempts reached (${run.attempt}/${run.maxAttempts}) — edit the brief instead` : "Retry not allowed";
}

/** Fixture price model. shortcut: flat per-unit cents, replace with provider estimateCents() once adapters exist. */
export function estimateStoryCents(sceneCount: number, durationSec: number): number {
  const text = 30; // concept + script + characters + metadata
  const keyframes = 6 * sceneCount;
  const video = 35 * durationSec;
  const narration = 2 * durationSec;
  return text + keyframes + video + narration;
}

/** shortcut: ledger entries carry no date, so "this month" = projects created this month; add entry timestamps with the API. */
export function monthLedger(state: StudioState, now: Date = FIXTURE_NOW): LedgerEntry[] {
  const ym = now.toISOString().slice(0, 7);
  return state.projects.filter((p) => p.createdAt.startsWith(ym)).flatMap((p) => p.ledger);
}

export function spendSummary(ledger: readonly LedgerEntry[]) {
  return {
    estimatedCents: ledger.reduce((s, e) => s + e.estimatedCents, 0),
    reportedCents: ledger.reduce((s, e) => s + (e.reportedCents ?? 0), 0),
    unreportedEstimateCents: ledger.reduce((s, e) => s + (e.reportedCents === undefined ? e.estimatedCents : 0), 0),
    committedCents: committedCents(ledger),
  };
}

export function createFixtureRepo(seed: StudioState = initialState(), clock: () => Date = () => new Date()): StudioRepo {
  let state = seed;
  const listeners = new Set<() => void>();
  const commit = (next: StudioState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  const editProject = (id: string, fn: (p: Project) => Project) => {
    if (!state.projects.some((p) => p.id === id)) throw new Error(`unknown project ${id}`);
    commit({ ...state, projects: state.projects.map((p) => (p.id === id ? fn(p) : p)) });
  };
  /** Move one node and reset everything downstream of it (core's invalidated()). */
  const moveNode = (p: Project, nodeId: string, to: JobStatus): Project => {
    const run = p.runs[nodeId];
    if (!run) throw new Error(`${nodeId} has not started`);
    const runs = { ...p.runs, [nodeId]: transition(run, to, clock()) };
    if (to === "queued") {
      for (const id of invalidated(expand(STORY_STAGES, p.scenes.length), nodeId)) if (id !== nodeId) delete runs[id];
    }
    return { ...p, runs };
  };

  /** Shot review acts only on scenes parked at the review gate (core would also allow running -> completed). */
  const assertInReview = (projectId: string, scene: number) => {
    const status = state.projects.find((p) => p.id === projectId)?.runs[sceneNode(scene)]?.status;
    if (status !== "awaiting_review") throw new Error(`scene ${scene + 1} is not awaiting review (${status ?? "not started"})`);
  };

  return {
    getSnapshot: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async approveScene(projectId, scene) {
      assertInReview(projectId, scene);
      editProject(projectId, (p) => moveNode(p, sceneNode(scene), "completed"));
    },
    async requestRevision(projectId, scene, note) {
      const trimmed = note.trim();
      if (!trimmed) throw new Error("revision note is required");
      assertInReview(projectId, scene);
      editProject(projectId, (p) => {
        const moved = moveNode(p, sceneNode(scene), "queued");
        return { ...moved, scenes: moved.scenes.map((s) => (s.index === scene ? { ...s, revisionNote: trimmed } : s)) };
      });
    },
    async retryStage(projectId, nodeId) {
      editProject(projectId, (p) => moveNode(p, nodeId, "queued"));
    },
    async createStory(input) {
      const title = input.title.trim();
      if (!title) throw new Error("title is required");
      if (!Number.isInteger(input.sceneCount) || input.sceneCount < 1 || input.sceneCount > 12) throw new Error("scenes must be 1–12");
      if (input.durationSec < 15 || input.durationSec > 180) throw new Error("duration must be 15–180 s");
      if (!Number.isInteger(input.budgetCapCents) || input.budgetCapCents <= 0) throw new Error("budget cap must be positive");
      // Repo re-checks spend itself; the form's preview is advisory.
      const sp = state.settings.spending;
      const estimate = estimateStoryCents(input.sceneCount, input.durationSec);
      const opts = { approved: input.approved === true };
      for (const d of [
        decideSpend({ limitCents: input.budgetCapCents, approvalThresholdCents: sp.approvalThresholdCents, warnFraction: sp.warnFraction }, [], estimate, opts),
        decideSpend({ limitCents: sp.monthlyLimitCents, approvalThresholdCents: sp.approvalThresholdCents, warnFraction: sp.warnFraction }, monthLedger(state), estimate, opts),
      ]) {
        if (d.decision === "deny") throw new Error("estimate exceeds budget");
        if (d.decision === "needs_approval") throw new Error("estimate needs explicit approval");
      }
      const n = state.projects.length + 145;
      const now = clock().toISOString();
      const each = Math.round((input.durationSec * 1000) / input.sceneCount);
      const project: Project = {
        id: `p${n}`,
        code: `FST-${String(n).padStart(4, "0")}`,
        kind: "story",
        title,
        createdAt: now,
        aspect: input.aspect,
        durationSec: input.durationSec,
        style: input.style.trim() || "Unspecified",
        voice: input.voice,
        scenes: Array.from({ length: input.sceneCount }, (_, index) => ({
          index, beat: "Awaiting script", durationMs: each, blurhash: FRAMES[index % FRAMES.length] ?? FRAMES[0],
        })),
        runs: { concept: { nodeId: "concept", status: "queued", generation: 1, attempt: 1, maxAttempts: 3, leaseLosses: 0, maxLeaseLosses: 2, updatedAt: now } },
        ledger: [],
        budget: {
          limitCents: input.budgetCapCents,
          approvalThresholdCents: state.settings.spending.approvalThresholdCents,
          warnFraction: state.settings.spending.warnFraction,
        },
      };
      commit({ ...state, projects: [project, ...state.projects] });
      return project.id;
    },
    async updateSettings(patch) {
      commit({ ...state, settings: patch(state.settings) });
    },
  };
}

/** The app-wide repo. FIXTURE-BACKED: swap for an API repo here. */
export const repo: StudioRepo = createFixtureRepo();

/** Subscribe to one slice. Selector must return an existing reference (no new arrays/objects). */
export function useStudio<T>(selector: (s: StudioState) => T): T {
  const get = () => selector(repo.getSnapshot());
  return useSyncExternalStore(repo.subscribe, get, get);
}
