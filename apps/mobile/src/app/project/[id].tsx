/** PROJECT DETAIL — shot-by-shot review + stage timeline. FIXTURE-BACKED: actions mutate the in-memory repo. */
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { committedCents } from "@feista/core";
import { Button, Field, Frame, MetaRow, Screen, SectionHead, Slate, StageTimeline, StatusMark, Timecode } from "../../components";
import { projectStatus, repo, retryBlockedReason, sceneNode, useStudio } from "../../data/repo";
import type { Project, Scene } from "../../data/types";
import { formatCents, formatDay } from "../../lib/format";
import { STATUS_MARKS } from "../../components/StatusMark";
import { color, gutter, space, touch, type } from "../../theme/tokens";

const ASPECT = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 } as const;

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useStudio(useCallback((s) => s.projects.find((p) => p.id === id), [id]));
  const source = useStudio((s) => s.source);
  const router = useRouter();
  const [error, setError] = useState<string>();

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const onRetry = useCallback((nodeId: string) => run(() => repo.retryStage(id, nodeId)), [id, run]);

  const back = (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/projects"))}
      accessibilityRole="button"
      accessibilityLabel="Back to projects"
      hitSlop={8}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <Text style={type.label}>← Projects</Text>
    </Pressable>
  );

  if (!project) {
    return (
      <Screen>
        {back}
        <Slate title="No such reel" eyebrow={`ID ${id}`} />
      </Screen>
    );
  }

  const status = projectStatus(project);
  // Running in-points: scene i starts where the previous scenes' durations end.
  const inPoints = project.scenes.map((_, i) => project.scenes.slice(0, i).reduce((t, s) => t + s.durationMs, 0));
  const toReview = project.scenes.filter((s) => project.runs[sceneNode(s.index)]?.status === "awaiting_review").length;

  return (
    <Screen keyboard testID="screen-project">
      {back}
      <Slate
        eyebrow={`${project.code} · ${project.kind.toUpperCase()} · ${formatDay(project.createdAt)}`}
        title={project.title}
        fixture={source === "fixture"}
        cells={[
          { k: "ASPECT", v: project.aspect },
          { k: "RUNTIME", v: `${project.durationSec}S` },
          { k: "SCENES", v: String(project.scenes.length).padStart(2, "0") },
          { k: "STATUS", v: STATUS_MARKS[status].label },
        ]}
      />
      <MetaRow k="Look" v={project.style} />
      <MetaRow k="Voice" v={project.voice} />
      <MetaRow k="Budget" v={`${formatCents(committedCents(project.ledger))} / ${formatCents(project.budget.limitCents)}`} />
      {error ? <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text> : null}

      <SectionHead index="01" title="Dailies" aside={toReview ? `${toReview} TO REVIEW` : "NONE WAITING"} />
      {project.scenes.map((s) => (
        <ShotRow key={s.index} project={project} scene={s} inMs={inPoints[s.index] ?? 0} />
      ))}

      <SectionHead index="02" title="Stage timeline" aside="STORY DAG" />
      <StageTimeline project={project} onRetry={onRetry} />
    </Screen>
  );
}

function ShotRow({ project, scene, inMs }: { project: Project; scene: Scene; inMs: number }) {
  const nodeRun = project.runs[sceneNode(scene.index)];
  const reviewing = nodeRun?.status === "awaiting_review";
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const [rowError, setRowError] = useState<string>();
  // errors render on the row that was acted on, so they're visible and announced
  const onAct = async (fn: () => Promise<void>, after?: () => void) => {
    setRowError(undefined);
    try {
      await fn();
      after?.();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : String(e));
    }
  };
  const sc = `SC${String(scene.index + 1).padStart(2, "0")}`;

  return (
    <View style={[styles.shot, reviewing && styles.shotReview]} testID={`shot-${scene.index}`}>
      <View style={styles.shotTop}>
        <View style={styles.thumb}>
          <Frame blurhash={scene.blurhash} frameNo={sc} aspect={ASPECT[project.aspect]} accessibilityLabel={`Keyframe for scene ${scene.index + 1}`} />
        </View>
        <View style={styles.shotBody}>
          <Text style={type.label}>{sc}</Text>
          <View style={styles.tcRow}>
            <Timecode ms={inMs} size="s" />
            <Text style={type.monoXS}>→</Text>
            <Timecode ms={inMs + scene.durationMs} size="s" />
          </View>
          <Text style={type.body}>{scene.beat}</Text>
          {nodeRun ? <StatusMark status={nodeRun.status} size={8} /> : <Text style={type.monoXS}>NOT RENDERED</Text>}
          {nodeRun?.status === "failed" ? (
            <Button
              compact
              variant="secondary"
              label={`Retry ${sc}`}
              onPress={() => onAct(() => repo.retryStage(project.id, sceneNode(scene.index)))}
              disabledReason={retryBlockedReason(nodeRun)}
            />
          ) : null}
          {scene.revisionNote ? <Text style={styles.note}>{`REVISION: ${scene.revisionNote}`}</Text> : null}
          {rowError ? <Text style={styles.rowError} accessibilityRole="alert" accessibilityLiveRegion="polite">{rowError}</Text> : null}
        </View>
      </View>
      {reviewing && !revising ? (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button label="Approve" onPress={() => onAct(() => repo.approveScene(project.id, scene.index))} testID={`approve-${scene.index}`} />
          </View>
          <View style={styles.flex}>
            <Button label="Revise" variant="secondary" onPress={() => setRevising(true)} testID={`revise-${scene.index}`} />
          </View>
        </View>
      ) : null}
      {reviewing && revising ? (
        <View style={styles.revise}>
          <View style={styles.bleed}>
            <Field label={`Note for ${sc}`} value={note} onChangeText={setNote} placeholder="e.g. slower push-in, keep the cat in frame" multiline maxLength={240} autoFocus />
          </View>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button
                label="Send back"
                variant="destructive"
                disabledReason={note.trim() ? undefined : "Write what should change"}
                onPress={() => onAct(() => repo.requestRevision(project.id, scene.index, note), () => { setRevising(false); setNote(""); })}
                testID={`send-revision-${scene.index}`}
              />
            </View>
            <View style={styles.flex}>
              <Button label="Cancel" variant="secondary" onPress={() => setRevising(false)} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: touch.min, minWidth: 88, justifyContent: "center", paddingLeft: gutter.left, marginBottom: space[3], alignSelf: "flex-start" },
  pressed: { opacity: 0.6 },
  error: { ...type.monoS, color: color.tape, paddingLeft: gutter.left, paddingTop: space[4] },
  rowError: { ...type.monoS, color: color.tape },
  shot: { paddingLeft: gutter.left, paddingRight: gutter.right, paddingVertical: space[5], gap: space[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.rule },
  shotReview: { borderLeftWidth: 3, borderLeftColor: color.slate, paddingLeft: gutter.left - 3 },
  shotTop: { flexDirection: "row", gap: space[4] },
  thumb: { width: 92 },
  shotBody: { flex: 1, gap: space[2] },
  tcRow: { flexDirection: "row", gap: space[2], alignItems: "center" },
  note: { ...type.monoS, color: color.slate },
  actions: { flexDirection: "row", gap: space[3] },
  flex: { flex: 1 },
  revise: { gap: space[2] },
  bleed: { marginLeft: -gutter.left, marginRight: -gutter.right },
});
