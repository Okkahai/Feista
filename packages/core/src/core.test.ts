import { describe, expect, it } from "vitest";
import {
  STORY_STAGES, expand, readyNodes, invalidated,
  transition, canTransition, retryDelayMs, idempotencyKey, InvalidTransitionError, type StageRun,
  decideSpend, committedCents,
  ProviderRegistry, type ProviderAdapter,
} from "./index";

const now = new Date("2026-11-03T00:00:00Z");
const run = (over: Partial<StageRun> = {}): StageRun => ({ nodeId: "n", status: "queued", attempt: 1, maxAttempts: 2, updatedAt: "", ...over });

describe("job lifecycle", () => {
  it("allows the happy path and rejects skipping", () => {
    let r = transition(run(), "running", now);
    r = transition(r, "awaiting_provider", now);
    r = transition(r, "running", now);
    r = transition(r, "completed", now);
    expect(r.status).toBe("completed");
    expect(() => transition(run(), "completed", now)).toThrow(InvalidTransitionError);
    expect(canTransition("completed", "queued")).toBe(false);
    expect(canTransition("cancelled", "running")).toBe(false);
  });

  it("retry bumps attempt, stops at maxAttempts, and clears the error", () => {
    const failed = transition(run({ status: "running" }), "failed", now, "boom");
    expect(failed.error).toBe("boom");
    const retried = transition(failed, "queued", now);
    expect(retried).toMatchObject({ attempt: 2, status: "queued" });
    expect(retried.error).toBeUndefined();
    const failed2 = transition(transition(retried, "running", now), "failed", now, "again");
    expect(() => transition(failed2, "queued", now)).toThrow(/max attempts/);
  });

  it("backoff grows and is capped", () => {
    expect(retryDelayMs(1, 1000, 10_000, () => 0.999)).toBe(999);
    expect(retryDelayMs(3, 1000, 10_000, () => 0.999)).toBe(3996);
    expect(retryDelayMs(20, 1000, 10_000, () => 0.999)).toBe(9990);
  });

  it("idempotency key is stable per attempt", () => {
    expect(idempotencyKey("p", "scene_video:2", "h", 1)).toBe(idempotencyKey("p", "scene_video:2", "h", 1));
    expect(idempotencyKey("p", "scene_video:2", "h", 1)).not.toBe(idempotencyKey("p", "scene_video:2", "h", 2));
  });
});

describe("story DAG", () => {
  const nodes = expand(STORY_STAGES, 3);

  it("expands per-scene stages and links scene to scene", () => {
    expect(nodes.find((n) => n.id === "scene_video:1")!.deps).toEqual(["keyframe:1"]);
    expect(nodes.find((n) => n.id === "assembly")!.deps).toEqual([
      "scene_video:0", "scene_video:1", "scene_video:2", "narration", "music",
    ]);
  });

  it("schedules scenes in parallel once their keyframe is done", () => {
    const st: Record<string, string> = { concept: "completed", script: "completed", characters: "completed", "keyframe:0": "completed", "keyframe:1": "running" };
    const ready = readyNodes(nodes, st).map((n) => n.id).sort();
    expect(ready).toEqual(["keyframe:2", "music", "narration", "scene_video:0"]);
  });

  it("regenerating one scene only invalidates that scene and downstream", () => {
    const hit = invalidated(nodes, "scene_video:1");
    expect(hit).toEqual(["scene_video:1", "assembly", "media_qa", "metadata", "review", "publish"]);
    expect(hit).not.toContain("scene_video:0");
    expect(hit).not.toContain("narration");
  });

  it("DAG is acyclic and every dep exists", () => {
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) for (const d of n.deps) expect(ids.has(d)).toBe(true);
    // topological drain must consume every node
    const st: Record<string, string> = {};
    for (let i = 0; i < nodes.length; i++) {
      const r = readyNodes(nodes, st);
      if (!r.length) break;
      for (const n of r) st[n.id] = "completed";
    }
    expect(Object.keys(st).length).toBe(nodes.length);
  });
});

describe("budget", () => {
  const b = { limitCents: 1000, approvalThresholdCents: 300, warnFraction: 0.8 };
  it("uses reported cost when known, estimate otherwise", () => {
    expect(committedCents([{ estimatedCents: 100, reportedCents: 140 }, { estimatedCents: 50 }])).toBe(190);
  });
  it("denies over budget before anything else", () => {
    expect(decideSpend(b, [{ estimatedCents: 900 }], 400)).toMatchObject({ decision: "deny", projectedCents: 1300 });
  });
  it("requires approval for big single ops, warns near limit, else allows", () => {
    expect(decideSpend(b, [], 300).decision).toBe("needs_approval");
    expect(decideSpend(b, [{ estimatedCents: 700 }], 150).decision).toBe("warn");
    expect(decideSpend(b, [], 100).decision).toBe("allow");
  });
  it("rejects malformed estimates", () => {
    expect(() => decideSpend(b, [], -1)).toThrow();
    expect(() => decideSpend(b, [], 1.5)).toThrow();
  });
});

describe("provider registry", () => {
  const fake = (id: string, caps: ProviderAdapter["manifest"]["capabilities"]): ProviderAdapter => ({
    manifest: { id, name: id, capabilities: caps, models: [], auth: "api_key", lifecycle: "poll", cancellation: false, docsUrl: "", verification: "mocked" },
    estimateCents: () => 0,
    submit: async () => ({ state: "error", retryable: false, message: "fake" }),
  });
  it("filters by capability and connection, preferred first", () => {
    const r = new ProviderRegistry();
    r.register(fake("a", ["audio.tts"]));
    r.register(fake("b", ["audio.tts", "llm.text"]));
    r.register(fake("c", ["audio.tts"]));
    expect(r.candidates("audio.tts", new Set(["a", "b"]), "b").map((a) => a.manifest.id)).toEqual(["b", "a"]);
    expect(r.candidates("llm.text", new Set(["a"])).length).toBe(0);
    expect(() => r.register(fake("a", []))).toThrow();
  });
});
