import { createFixtureRepo, monthLedger, parseUsdCents, projectStatus, sceneNode } from "../data/repo";
import { toTimecode } from "../lib/format";

const at = () => new Date("2026-11-03T10:00:00Z");
const project = (r: ReturnType<typeof createFixtureRepo>, id = "p142") => r.getSnapshot().projects.find((p) => p.id === id)!;

describe("fixture repo", () => {
  it("approving a scene in review completes it and notifies subscribers", async () => {
    const r = createFixtureRepo(undefined, at);
    const seen = jest.fn();
    r.subscribe(seen);
    await r.approveScene("p142", 0);
    expect(project(r).runs[sceneNode(0)]?.status).toBe("completed");
    expect(seen).toHaveBeenCalled();
  });
  it("cannot approve a scene that is not awaiting review", async () => {
    const r = createFixtureRepo(undefined, at);
    await expect(r.approveScene("p142", 3)).rejects.toThrow(/not awaiting review \(running\)/);
  });
  it("revision requires a note, re-queues the scene and keeps the note", async () => {
    const r = createFixtureRepo(undefined, at);
    await expect(r.requestRevision("p142", 1, "  ")).rejects.toThrow();
    await r.requestRevision("p142", 1, "slower push-in");
    const p = project(r);
    expect(p.runs[sceneNode(1)]?.status).toBe("queued");
    expect(p.scenes[1]?.revisionNote).toBe("slower push-in");
    expect(p.runs[sceneNode(1)]).toMatchObject({ generation: 2, attempt: 1 }); // new take per core
  });
  it("retry re-queues a failed node and bumps the take; max attempts is refused", async () => {
    const r = createFixtureRepo(undefined, at);
    await r.retryStage("p142", "scene_video:4");
    expect(project(r).runs["scene_video:4"]).toMatchObject({ status: "queued", attempt: 2 });
    await expect(r.retryStage("p131", "script")).rejects.toThrow(/max attempts/i);
  });
  it("creates a queued story production", async () => {
    const r = createFixtureRepo(undefined, at);
    const id = await r.createStory({ title: "Test", durationSec: 30, aspect: "9:16", style: "", voice: "Mara", sceneCount: 3, budgetCapCents: 2000 });
    expect(projectStatus(project(r, id))).toBe("queued");
    // 60 s x 6 scenes is over the 15 USD approval threshold: refused unless approved
    const big = { title: "Big", durationSec: 60, aspect: "9:16" as const, style: "", voice: "Mara", sceneCount: 6, budgetCapCents: 5000 };
    await expect(r.createStory(big)).rejects.toThrow(/approval/);
    await expect(r.createStory({ ...big, approved: true })).resolves.toMatch(/^p/);
    await expect(r.createStory({ title: " ", durationSec: 30, aspect: "9:16", style: "", voice: "Mara", sceneCount: 3, budgetCapCents: 2000 })).rejects.toThrow();
  });
});

describe("toTimecode", () => {
  it("new productions reserve their estimate so the monthly cap eventually denies", async () => {
    const r = createFixtureRepo(undefined, at);
    const input = { title: "T", sceneCount: 6, durationSec: 60, aspect: "9:16", style: "", voice: "Mara", budgetCapCents: 3000, approved: true } as const;
    const before = monthLedger(r.getSnapshot(), at()).length;
    let created = 0;
    await expect((async () => { for (;;) { await r.createStory({ ...input }); created++; if (created > 100) break; } })()).rejects.toThrow(/exceeds budget/);
    expect(created).toBeGreaterThan(0);
    expect(created).toBeLessThan(10);
    expect(monthLedger(r.getSnapshot(), at()).length).toBe(before + created);
  });
  it("retryStage refuses non-failed nodes (no silent new take)", async () => {
    const r = createFixtureRepo(undefined, at);
    const runsBefore = Object.keys(project(r).runs).length;
    await expect(r.retryStage("p142", "concept")).rejects.toThrow(/Only failed/);
    expect(Object.keys(project(r).runs).length).toBe(runsBefore);
  });
  it("revision resets everything downstream of the scene but not other scenes", async () => {
    const r = createFixtureRepo(undefined, at);
    const other = project(r).runs[sceneNode(0)];
    await r.requestRevision("p142", 1, "again");
    const p = project(r);
    expect(p.runs.assembly).toBeUndefined();
    expect(p.runs[sceneNode(0)]).toEqual(other);
  });
  it("parses money conservatively", () => {
    expect(parseUsdCents("250")).toBe(25000);
    expect(parseUsdCents("12,5")).toBe(1250);
    expect(parseUsdCents("12.05")).toBe(1205);
    for (const bad of ["1,000", "1.000", "", "0", "-5", "abc", "1e3"]) expect(parseUsdCents(bad)).toBeUndefined();
  });
  it("formats HH:MM:SS:FF at 24 fps", () => {
    expect(toTimecode(0)).toBe("00:00:00:00");
    expect(toTimecode(12_166)).toBe("00:00:12:04");
    expect(toTimecode(3_600_000 + 61_500)).toBe("01:01:01:12");
  });
});
