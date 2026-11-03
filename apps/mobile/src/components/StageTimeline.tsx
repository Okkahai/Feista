import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { STORY_STAGES, type StageRun } from "@feista/core";
import { retryBlockedReason } from "../data/repo";
import { nodeLabel } from "../lib/format";
import type { Project } from "../data/types";
import { color, gutter, space, type } from "../theme/tokens";
import { Button } from "./Button";
import { StatusMark } from "./StatusMark";

type Props = { project: Project; onRetry: (nodeId: string) => void };

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * Vertical production timeline of the Story DAG (core STORY_STAGES). Per-scene stages
 * fan out into SC01..SCnn sub-rows. Failed nodes carry an inline retry (or say why not).
 */
export const StageTimeline = memo(function StageTimeline({ project, onRetry }: Props) {
  return (
    <View>
      {STORY_STAGES.map((stage, i) => {
        const last = i === STORY_STAGES.length - 1;
        if (!stage.perScene) {
          return <NodeRow key={stage.id} title={stage.id} run={project.runs[stage.id]} onRetry={onRetry} last={last} paid={!!stage.paid} gate={!!stage.review} />;
        }
        return <SceneGroup key={stage.id} stage={stage.id} paid={!!stage.paid} project={project} onRetry={onRetry} last={last} />;
      })}
    </View>
  );
});

/** Per-scene fan-out. Collapsed when every scene is complete — only exceptions need eyes. */
function SceneGroup({ stage, paid, project, onRetry, last }: { stage: string; paid: boolean; project: Project; onRetry: (id: string) => void; last: boolean }) {
  const n = project.scenes.length;
  const subRuns = Array.from({ length: n }, (_, s) => project.runs[`${stage}:${s}`]);
  const done = subRuns.filter((r) => r?.status === "completed").length;
  const [open, setOpen] = useState(done < n);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${stage.replace(/_/g, " ")}, ${done} of ${n} scenes complete`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Rail last={false} run={done === n ? subRuns[0] : undefined} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={type.label}>{stage.replace(/_/g, " ")}</Text>
            <Text style={type.monoS}>{open ? "HIDE −" : `SC01–${String(n).padStart(2, "0")} +`}</Text>
          </View>
          <Text style={type.monoXS}>{`PER SCENE · ${done}/${n} COMPLETE${paid ? " · PAID" : ""}`}</Text>
        </View>
      </Pressable>
      {open
        ? subRuns.map((run, s) => (
            <NodeRow key={s} title={`SC${String(s + 1).padStart(2, "0")}`} run={run} onRetry={onRetry} last={last && s === n - 1} sub nodeId={`${stage}:${s}`} />
          ))
        : null}
    </View>
  );
}

function Rail({ last, run, sub }: { last: boolean; run?: StageRun | undefined; sub?: boolean }) {
  return (
    <View style={[styles.rail, sub && styles.railSub]} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[styles.line, last && styles.lineEnd]} />
      <View style={styles.marker}>{run ? <StatusMark status={run.status} showLabel={false} size={sub ? 8 : 10} /> : <View style={styles.pending} />}</View>
    </View>
  );
}

type RowProps = { title: string; run: StageRun | undefined; onRetry: (id: string) => void; last: boolean; sub?: boolean; nodeId?: string; paid?: boolean; gate?: boolean };

const NodeRow = memo(function NodeRow({ title, run, onRetry, last, sub, nodeId, paid, gate }: RowProps) {
  const id = nodeId ?? title;
  const blocked = run?.status === "failed" ? retryBlockedReason(run) : undefined;
  const tags = [paid ? "PAID" : null, gate ? "HUMAN GATE" : null].filter(Boolean).join(" · ");
  return (
    <View style={styles.row}>
      <Rail last={last} run={run} sub={!!sub} />
      <View style={[styles.body, sub && styles.bodySub]}>
        <View style={styles.titleRow}>
          <Text style={sub ? type.mono : type.label}>{title.replace(/_/g, " ").toUpperCase()}</Text>
          {run ? <StatusMark status={run.status} size={8} /> : <Text style={type.monoXS}>NOT STARTED</Text>}
        </View>
        {run ? (
          <Text style={type.monoXS}>
            {`${run.generation > 1 ? `GEN ${run.generation} · ` : ""}TAKE ${run.attempt}/${run.maxAttempts} · ${time.format(new Date(run.updatedAt))} UTC${tags ? " · " + tags : ""}`}
          </Text>
        ) : tags ? (
          <Text style={type.monoXS}>{tags}</Text>
        ) : null}
        {run?.error ? <Text style={styles.error}>{run.error}</Text> : null}
        {run?.status === "failed" ? (
          <View style={styles.retry}>
            <Button compact variant="secondary" label={`Retry ${nodeLabel(id)}`} onPress={() => onRetry(id)} disabledReason={blocked} testID={`retry-${id}`} />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const RAIL = 28;
const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingLeft: gutter.left - 8, paddingRight: gutter.right },
  rail: { width: RAIL, alignItems: "center" },
  railSub: { width: RAIL },
  line: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: color.ruleStrong },
  lineEnd: { bottom: "50%" },
  marker: { marginTop: 16, backgroundColor: color.bg, paddingVertical: 3, alignItems: "center", justifyContent: "center", minWidth: 14 },
  pending: { width: 6, height: 1, backgroundColor: color.textFaint },
  body: { flex: 1, paddingVertical: space[4], gap: space[1], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.rule, paddingLeft: space[3] },
  bodySub: { paddingVertical: space[3], paddingLeft: space[6] },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[3] },
  pressed: { backgroundColor: color.surface },
  error: { ...type.mono, fontSize: 12, color: color.tape, marginTop: space[2] },
  retry: { marginTop: space[3] },
});
