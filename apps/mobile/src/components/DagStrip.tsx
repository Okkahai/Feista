import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { STORY_STAGES, expand, type JobStatus } from "@feista/core";
import type { Project } from "../data/types";
import { color, space, type } from "../theme/tokens";
import { STATUS_MARKS } from "./StatusMark";

/**
 * Compact horizontal read of a project's whole DAG: one cell per node, like a
 * strip of edge-coded frames. Colour is backed by the counts line underneath.
 */
export const DagStrip = memo(function DagStrip({ project }: { project: Project }) {
  const nodes = expand(STORY_STAGES, project.scenes.length);
  const statuses = nodes.map((n) => project.runs[n.id]?.status);
  const count = (s: JobStatus) => statuses.filter((x) => x === s).length;
  const parts = [
    `${count("completed")}/${nodes.length} DONE`,
    count("running") + count("awaiting_provider") ? `${count("running") + count("awaiting_provider")} ACTIVE` : null,
    count("awaiting_review") ? `${count("awaiting_review")} REVIEW` : null,
    count("failed") ? `${count("failed")} FAILED` : null,
  ].filter(Boolean);
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Pipeline: ${parts.join(", ")}`}>
      <View style={styles.strip}>
        {statuses.map((s, i) => (
          <View key={nodes[i]?.id ?? i} style={[styles.cell, s ? { backgroundColor: STATUS_MARKS[s].color } : styles.empty, s === "failed" && styles.failed]} />
        ))}
      </View>
      <Text style={type.monoXS}>{parts.join("  ·  ")}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  strip: { flexDirection: "row", gap: 2, height: 10 },
  cell: { flex: 1 },
  empty: { borderWidth: StyleSheet.hairlineWidth, borderColor: color.ruleStrong },
  failed: { height: 16, marginTop: -3 },
});
