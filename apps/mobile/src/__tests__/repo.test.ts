import { createFixtureRepo, projectStatus, sceneNode } from "../data/repo";
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
  });
  it("retry re-queues a failed node and bumps the take; max attempts is refused", async () => {
    const r = createFixtureRepo(undefined, at);
    await r.retryStage("p142", "scene_video:4");
    expect(project(r).runs["scene_video:4"]).toMatchObject({ status: "queued", attempt: 2 });
    await expect(r.retryStage("p131", "script")).rejects.toThrow(/max attempts/);
  });
  it("creates a queued story production", async () => {
    const r = createFixtureRepo(undefined, at);
    const id = await r.createStory({ title: "Test", durationSec: 30, aspect: "9:16", style: "", voice: "Mara", sceneCount: 3, budgetCapCents: 2000 });
    expect(projectStatus(project(r, id))).toBe("queued");
    await expect(r.createStory({ title: " ", durationSec: 30, aspect: "9:16", style: "", voice: "Mara", sceneCount: 3, budgetCapCents: 2000 })).rejects.toThrow();
  });
});

describe("toTimecode", () => {
  it("formats HH:MM:SS:FF at 24 fps", () => {
    expect(toTimecode(0)).toBe("00:00:00:00");
    expect(toTimecode(12_166)).toBe("00:00:12:04");
    expect(toTimecode(3_600_000 + 61_500)).toBe("01:01:01:12");
  });
});
