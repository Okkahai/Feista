import { describe, expect, it } from "vitest";
import {
  STORY_STAGES, expand, readyNodes, invalidated,
  transition, canTransition, blockedReason, retryDelayMs, idempotencyKey, InvalidTransitionError, type StageRun,
  decideSpend, committedCents,
  ProviderRegistry, type ProviderAdapter,
} from "./index";

const now = new Date("2026-11-03T00:00:00Z");
const run = (over: Partial<StageRun> = {}): StageRun => ({
  nodeId: "n", status: "queued", generation: 1, attempt: 1, maxAttempts: 2, leaseLosses: 0, maxLeaseLosses: 2, updatedAt: "", ...over,
});

describe("job lifecycle", () => {
  it("allows the happy path and rejects skipping", () => {
    let r = transition(run(), "running", now);
    r = transition(r, "awaiting_provider", now);
    r = transition(r, "running", now);
    r = transition(r, "completed", now);
    expect(r.status).toBe("completed");
    expect(() => transition(run(), "completed", now)).toThrow(InvalidTransitionError);
    expect(canTransition("completed", "running")).toBe(false);
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

  it("idempotency key is stable per attempt and changes for a retry or a new take", () => {
    const r = run({ nodeId: "scene_video:2" });
    expect(idempotencyKey("p", r, "h")).toBe(idempotencyKey("p", { ...r }, "h"));
    expect(idempotencyKey("p", r, "h")).not.toBe(idempotencyKey("p", { ...r, attempt: 2 }, "h"));
    const done = transition(transition(r, "running", now), "completed", now);
    const take2 = transition(done, "queued", now);
    expect(take2).toMatchObject({ generation: 2, attempt: 1 });
    expect(idempotencyKey("p", take2, "h")).not.toBe(idempotencyKey("p", r, "h"));
    // review revision is a new take too
    const rev = transition(transition(transition(r, "running", now), "awaiting_review", now), "queued", now);
    expect(rev.generation).toBe(2);
  });

  it("caps worker lease losses and reports exhausted retries before transition throws", () => {
    let r = run();
    for (let i = 0; i < 2; i++) r = transition(transition(r, "running", now), "queued", now);
    r = transition(r, "running", now);
    expect(blockedReason(r, "queued")).toMatch(/lost its worker/);
    expect(() => transition(r, "queued", now)).toThrow(/lost its worker/);
    expect(transition(r, "failed", now, "oom").status).toBe("failed");
    expect(blockedReason(run({ status: "failed", attempt: 2 }), "queued")).toMatch(/max attempts/);
    expect(canTransition("failed", "queued")).toBe(true); // the raw table; blockedReason is the scheduler's check
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

  it("rejects zero scenes and unknown or forward deps", () => {
    expect(() => expand(STORY_STAGES, 0)).toThrow();
    expect(() => expand([{ id: "a", deps: ["b"] }, { id: "b", deps: [] }], 1)).toThrow(/not earlier/);
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
  it("fails closed on corrupt budget or ledger data", () => {
    expect(() => decideSpend(b, [{ estimatedCents: 10, reportedCents: Number.NaN }], 50)).toThrow();
    expect(() => decideSpend({ ...b, limitCents: undefined as unknown as number }, [], 50)).toThrow();
    expect(() => decideSpend({ ...b, warnFraction: Number.NaN }, [], 50)).toThrow();
  });
  it("an approved op skips only the threshold gate, never the cap", () => {
    expect(decideSpend(b, [], 300, { approved: true }).decision).toBe("allow");
    expect(decideSpend(b, [{ estimatedCents: 800 }], 300, { approved: true }).decision).toBe("deny");
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

describe("format presets", () => {
  it("every preset is internally consistent, and none is named after a channel", async () => {
    const { FORMATS, resolveFormat } = await import("./formats");
    expect(FORMATS).toHaveLength(16);
    expect(new Set(FORMATS.map((f) => f.id)).size).toBe(16);
    for (const f of FORMATS) {
      expect(resolveFormat({ base: f.id }), f.id).toMatchObject({ voice: f.voice, lines: f.lines, cast: f.cast }); // passes the custom checks too
      expect(f.seconds[1], f.id).toBeLessThanOrEqual(180);
      expect(JSON.stringify(f), f.id).not.toMatch(/wobbi/i);
    }
    expect(resolveFormat(undefined).id).toBe("animal_story");
  });

  it("checks custom formats, which are user text headed for a prompt", async () => {
    const { resolveFormat } = await import("./formats");
    expect(resolveFormat({ base: "what_if", name: "Space facts", seconds: [20, 40] })).toMatchObject({ id: "custom", name: "Space facts", seconds: [20, 40], voice: "narrator" });
    expect(resolveFormat({ base: "animal_story", voice: "none" }).lines).toEqual([0, 0]);
    expect(() => resolveFormat("nope")).toThrow(/unknown format/);
    expect(() => resolveFormat({ rules: "x".repeat(2001) })).toThrow(/rules must be/);
    expect(() => resolveFormat({ seconds: [30, 600] })).toThrow(/seconds/);
    expect(() => resolveFormat({ beats: ["one"] })).toThrow(/beats/);
    expect(() => resolveFormat({ voice: "shout" })).toThrow(/voice/);
    expect(() => resolveFormat({ base: "dialogue_sketch", cast: [1, 2] })).toThrow(/at least 2/);
    expect(() => resolveFormat({ base: { base: "x" } })).toThrow();
    expect(() => resolveFormat({ base: "anime_story", cast: [0, 0] })).toThrow(/needs a hero/);
  });
});
