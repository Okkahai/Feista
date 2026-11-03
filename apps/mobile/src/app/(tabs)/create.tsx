/** CREATE. FIXTURE-BACKED: "Queue production" writes to the in-memory repo only. */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { decideSpend, type SpendDecision } from "@feista/core";
import { Button, Choice, Field, MetaRow, Screen, SectionHead, Slate } from "../../components";
import { estimateStoryCents, monthLedger, repo, useStudio } from "../../data/repo";
import type { Aspect, StudioState } from "../../data/types";
import { formatCents } from "../../lib/format";
import { color, gutter, space, touch, type } from "../../theme/tokens";

const ASPECTS = ["9:16", "1:1", "16:9"] as const;
const DURATIONS = ["30", "45", "60", "90"] as const;
const VOICES = ["Mara", "Ilya", "None"] as const;
const secs = (v: string) => `${v} s`;
const selectState = (s: StudioState) => s;

type Mode = "story" | "clips";

export default function CreateScreen() {
  const state = useStudio(selectState);
  const [mode, setMode] = useState<Mode>("story");

  return (
    <Screen keyboard testID="screen-create">
      <Slate eyebrow="NEW PRODUCTION" title="Create" fixture={state.source === "fixture"} />
      <View style={styles.entries} accessibilityRole="radiogroup" accessibilityLabel="Production type">
        <Entry letter="A" title="Story" detail="Original short from a premise. Script → keyframes → scenes → mix." on={mode === "story"} onPress={() => setMode("story")} />
        <Entry letter="B" title="Clips" detail="Cut authorised long-form into shorts." on={mode === "clips"} onPress={() => setMode("clips")} />
      </View>
      {mode === "story" ? <StoryForm state={state} /> : <ClipsPlaceholder />}
    </Screen>
  );
}

function Entry({ letter, title, detail, on, onPress }: { letter: string; title: string; detail: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${title}: ${detail}`}
      style={({ pressed }) => [styles.entry, on && styles.entryOn, pressed && !on && styles.entryPressed]}
    >
      <Text style={[type.monoS, on && styles.inkOn]}>{`ENTRY ${letter}`}</Text>
      <Text style={[type.displayL, on && styles.inkOn]}>{title}</Text>
      <Text style={[type.bodyS, on && styles.inkOn]}>{detail}</Text>
    </Pressable>
  );
}

function ClipsPlaceholder() {
  return (
    <View>
      <SectionHead index="B" title="Clip Studio" aside="NOT BUILT" />
      <Text style={styles.prose}>
        Clip Studio needs the media ingest worker (rights check, transcription, highlight detection). None of it exists yet, so there is
        nothing honest to submit to.
      </Text>
      <View style={styles.actions}>
        <Button label="Import source video" disabledReason="Media ingest worker not built" />
      </View>
    </View>
  );
}

function StoryForm({ state }: { state: StudioState }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>("60");
  const [aspect, setAspect] = useState<Aspect>(state.settings.export.aspect);
  const [style, setStyle] = useState("");
  const [voice, setVoice] = useState<(typeof VOICES)[number]>("Mara");
  const [scenes, setScenes] = useState(6);
  const [cap, setCap] = useState("30");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const durationSec = Number(duration);
  const capCents = Math.round(Number(cap.replace(",", ".")) * 100);
  const capValid = Number.isFinite(capCents) && capCents > 0;
  const estimate = estimateStoryCents(scenes, durationSec);

  const { project, month } = useMemo(() => {
    const s = state.settings.spending;
    return {
      project: capValid ? decideSpend({ limitCents: capCents, approvalThresholdCents: s.approvalThresholdCents, warnFraction: s.warnFraction }, [], estimate) : undefined,
      month: decideSpend({ limitCents: s.monthlyLimitCents, approvalThresholdCents: s.approvalThresholdCents, warnFraction: s.warnFraction }, monthLedger(state), estimate),
    };
  }, [state, capCents, capValid, estimate]);

  const blocked = !title.trim()
    ? "Give it a working title"
    : !capValid
      ? "Set a budget cap above $0"
      : project?.decision === "deny"
        ? "Estimate exceeds this project's cap"
        : month.decision === "deny"
          ? "Estimate exceeds this month's limit"
          : busy
            ? "Queuing…"
            : undefined;
  const needsApproval = project?.decision === "needs_approval" || month.decision === "needs_approval";

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const id = await repo.createStory({ title, durationSec, aspect, style, voice, sceneCount: scenes, budgetCapCents: capCents });
      setTitle("");
      router.push(`/project/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SectionHead index="A1" title="Brief" />
      <Field label="Working title" value={title} onChangeText={setTitle} placeholder="e.g. The Lighthouse Keeper's Cat" returnKeyType="next" maxLength={80} />
      <Field label="Look / style" value={style} onChangeText={setStyle} placeholder="e.g. 16mm, tungsten interiors" hint="Film stock, light, lens — words a DP would use" maxLength={120} />

      <SectionHead index="A2" title="Format" />
      <Choice label="Duration" value={duration} options={DURATIONS} onChange={setDuration} format={secs} />
      <Choice label="Aspect" value={aspect} options={ASPECTS} onChange={setAspect} />
      <Choice label="Narration voice" value={voice} options={VOICES} onChange={setVoice} />
      <View style={styles.stepper}>
        <View style={styles.stepperText}>
          <Text style={type.monoS}>Scenes</Text>
          <Text style={type.bodyS}>{`≈ ${(durationSec / scenes).toFixed(1)} s per shot`}</Text>
        </View>
        <StepButton label="−" a11y="Fewer scenes" disabled={scenes <= 1} onPress={() => setScenes((n) => n - 1)} />
        <Text style={styles.stepValue} accessibilityLiveRegion="polite" accessibilityLabel={`${scenes} scenes`}>
          {String(scenes).padStart(2, "0")}
        </Text>
        <StepButton label="+" a11y="More scenes" disabled={scenes >= 12} onPress={() => setScenes((n) => n + 1)} />
      </View>

      <SectionHead index="A3" title="Budget" aside="FIXTURE PRICES" />
      <Field label="Budget cap" value={cap} onChangeText={setCap} keyboardType="decimal-pad" suffix="USD" error={capValid ? undefined : "Enter an amount above 0"} hint="Hard stop for this production" />
      <MetaRow k="Estimate" v={formatCents(estimate)} />
      <MetaRow k="Against project cap" v={project ? decisionText(project) : "—"} tone={project ? decisionTone(project) : "muted"} />
      <MetaRow k="Against month limit" v={decisionText(month)} tone={decisionTone(month)} />

      <View style={styles.actions}>
        <Button label={needsApproval ? `Approve ${formatCents(estimate)} & queue` : "Queue production"} onPress={submit} disabledReason={blocked} testID="create-submit" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={type.monoXS}>Queues into the in-memory fixture repo. No provider is called.</Text>
      </View>
    </View>
  );
}

function StepButton({ label, a11y, disabled, onPress }: { label: string; a11y: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed, disabled && styles.stepDisabled]}
    >
      <Text style={[type.displayS, disabled && styles.faint]}>{label}</Text>
    </Pressable>
  );
}

function decisionText(d: SpendDecision): string {
  switch (d.decision) {
    case "allow":
      return "WITHIN";
    case "warn":
      return `NEAR LIMIT · ${formatCents(d.projectedCents)}`;
    case "needs_approval":
      return "NEEDS YOUR OK";
    case "deny":
      return `OVER · ${formatCents(d.projectedCents)}`;
  }
}
function decisionTone(d: SpendDecision) {
  return d.decision === "allow" ? "leader" : d.decision === "deny" ? "tape" : "slate";
}

const styles = StyleSheet.create({
  entries: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.ruleStrong, marginTop: space[5] },
  entry: { flex: 1, padding: space[4], paddingLeft: gutter.left, gap: space[2], minHeight: 140, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: color.ruleStrong },
  entryOn: { backgroundColor: color.slate },
  entryPressed: { backgroundColor: color.surface },
  inkOn: { color: color.slateInk },
  prose: { ...type.body, color: color.textMuted, paddingLeft: gutter.left, paddingRight: gutter.right * 3, paddingBottom: space[5] },
  actions: { paddingLeft: gutter.left, paddingRight: gutter.right, paddingTop: space[6], gap: space[3] },
  error: { ...type.monoS, color: color.tape },
  stepper: { flexDirection: "row", alignItems: "center", gap: space[3], paddingLeft: gutter.left, paddingRight: gutter.right, paddingVertical: space[4] },
  stepperText: { flex: 1, gap: 2 },
  step: { width: touch.row, height: touch.row, borderWidth: 1, borderColor: color.ruleStrong, alignItems: "center", justifyContent: "center" },
  stepPressed: { backgroundColor: color.surfaceRaised },
  stepDisabled: { borderStyle: "dashed", borderColor: color.rule },
  faint: { color: color.textFaint },
  stepValue: { ...type.displayM, minWidth: 44, textAlign: "center", fontVariant: ["tabular-nums"] },
});
