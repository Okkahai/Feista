/** Story Studio production DAG. Mirrors the proven Wobbi pipeline (workflow/workflow.md). */
export interface StageDef {
  id: string;
  deps: string[];
  /** Expanded into one node per scene (`scene_video:0`, ...). */
  perScene?: boolean;
  /** Human gate: the stage parks in awaiting_review until the user acts. */
  review?: boolean;
  /** Stage calls a paid provider and must pass the budget check before running. */
  paid?: boolean;
}

export const STORY_STAGES: readonly StageDef[] = [
  { id: "concept", deps: [], paid: true }, // idea + originality check vs story log
  { id: "script", deps: ["concept"], paid: true }, // story spine, shot list, narration lines
  { id: "characters", deps: ["script"], paid: true }, // character sheet (reused if exists)
  { id: "keyframe", deps: ["characters"], perScene: true, paid: true },
  { id: "scene_video", deps: ["keyframe"], perScene: true, paid: true },
  { id: "narration", deps: ["script"], paid: true },
  { id: "music", deps: ["script"] }, // CC-BY library pick, credit carried to metadata
  { id: "assembly", deps: ["scene_video", "narration", "music"] }, // captions + mix + loudnorm
  { id: "media_qa", deps: ["assembly"] },
  { id: "metadata", deps: ["media_qa"], paid: true },
  { id: "review", deps: ["metadata"], review: true },
  { id: "publish", deps: ["review"] },
];

export interface Node {
  id: string; // "keyframe:2" or "assembly"
  stage: string;
  scene?: number;
  deps: string[];
}

/** Concrete nodes. A per-scene stage depending on another per-scene stage links scene-to-scene. */
export function expand(stages: readonly StageDef[], sceneCount: number): Node[] {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) throw new Error("sceneCount must be a positive integer");
  // deps must point at earlier stages: guarantees every dep exists and the graph is acyclic
  const seen = new Set<string>();
  for (const s of stages) {
    for (const d of s.deps) if (!seen.has(d)) throw new Error(`stage ${s.id}: dep ${d} unknown or not earlier`);
    seen.add(s.id);
  }
  const per = new Set(stages.filter((s) => s.perScene).map((s) => s.id));
  const idsOf = (stage: string) =>
    per.has(stage) ? Array.from({ length: sceneCount }, (_, i) => `${stage}:${i}`) : [stage];
  const nodes: Node[] = [];
  for (const s of stages) {
    if (s.perScene) {
      for (let i = 0; i < sceneCount; i++) {
        const deps = s.deps.flatMap((d) => (per.has(d) ? [`${d}:${i}`] : idsOf(d)));
        nodes.push({ id: `${s.id}:${i}`, stage: s.id, scene: i, deps });
      }
    } else {
      nodes.push({ id: s.id, stage: s.id, deps: s.deps.flatMap(idsOf) });
    }
  }
  return nodes;
}

/** Nodes that can start now: not started yet and every dependency completed. */
export function readyNodes(nodes: Node[], status: Record<string, string | undefined>): Node[] {
  return nodes.filter(
    (n) => status[n.id] === undefined && n.deps.every((d) => status[d] === "completed"),
  );
}

/** Everything that must be redone if `nodeId` is regenerated (the node + all transitive dependents). */
export function invalidated(nodes: Node[], nodeId: string): string[] {
  const out = new Set([nodeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (!out.has(n.id) && n.deps.some((d) => out.has(d))) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return nodes.map((n) => n.id).filter((id) => out.has(id));
}
