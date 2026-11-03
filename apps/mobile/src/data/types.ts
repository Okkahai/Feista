import type { Budget, JobStatus, LedgerEntry, ProviderManifest, StageRun } from "@feista/core";

export type Aspect = "9:16" | "1:1" | "16:9";
export type Resolution = "720p" | "1080p" | "2160p";

export interface Scene {
  index: number;
  beat: string; // one-line shot description from the script
  durationMs: number;
  /** Placeholder frame until real keyframe URLs exist (rendered by expo-image). */
  blurhash: string;
  revisionNote?: string;
}

export interface Project {
  id: string;
  code: string; // slate code, e.g. "FST-0142"
  kind: "story" | "clips";
  title: string;
  createdAt: string;
  aspect: Aspect;
  durationSec: number;
  style: string;
  voice: string;
  scenes: Scene[];
  /** Keyed by DAG node id. Absent = not started (matches readyNodes() semantics). */
  runs: Record<string, StageRun>;
  ledger: LedgerEntry[];
  budget: Budget;
}

export interface ProviderConnection {
  manifest: ProviderManifest;
  connected: boolean;
  /** Fixture repo cannot probe anything, so this stays "unchecked". */
  health: "ok" | "degraded" | "unreachable" | "unchecked";
}

export interface Settings {
  export: { aspect: Aspect; resolution: Resolution; burnCaptions: boolean; watermark: boolean };
  spending: { monthlyLimitCents: number; approvalThresholdCents: number; warnFraction: number };
  notifications: { reviewReady: boolean; failed: boolean; budgetWarn: boolean };
  privacy: { analytics: boolean; keepSourceMedia: boolean };
  storage: { cacheBytes: number; offlineProxies: boolean };
}

export interface StudioState {
  projects: Project[];
  providers: ProviderConnection[];
  settings: Settings;
  /** Where the data came from; surfaced in the UI so fixture data is never mistaken for live. */
  source: "fixture" | "api";
}

export interface StoryInput {
  title: string;
  durationSec: number;
  aspect: Aspect;
  style: string;
  voice: string;
  sceneCount: number;
  budgetCapCents: number;
}

export type { JobStatus };
