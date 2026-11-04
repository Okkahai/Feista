/** STUDIO (home). FIXTURE-BACKED via src/data/repo.ts. */
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { DagStrip, Frame, MetaRow, Rule, Screen, SectionHead, Slate, StatusMark, Timecode } from "../../components";
import { FIXTURE_NOW } from "../../data/fixtures";
import { monthLedger, projectStatus, spendSummary, useStudio } from "../../data/repo";
import type { Project, StudioState } from "../../data/types";
import { formatCents, formatDay, nodeLabel } from "../../lib/format";
import { color, gutter, space, touch, type } from "../../theme/tokens";

const selectState = (s: StudioState) => s;
const ACTIVE = new Set(["running", "awaiting_provider", "awaiting_review", "failed"]);
const ASPECT = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 } as const;

export default function StudioScreen() {
  const state = useStudio(selectState);
  const router = useRouter();

  const { active, queue, recent, spend, ledgerCount } = useMemo(() => {
    const withStatus = state.projects.map((p) => ({ p, status: projectStatus(p) }));
    const ledger = monthLedger(state);
    return {
      active: withStatus.filter((x) => ACTIVE.has(x.status)),
      queue: state.projects.flatMap((p) =>
        Object.values(p.runs)
          .filter((r) => r.status === "queued" || r.status === "awaiting_provider")
          .map((r) => ({ p, r })),
      ),
      recent: withStatus.filter((x) => x.status === "completed" || x.p.runs.review?.status === "awaiting_review").map((x) => x.p),
      spend: spendSummary(ledger),
      ledgerCount: ledger.length,
    };
  }, [state]);

  const limit = state.settings.spending.monthlyLimitCents;
  const connected = state.providers.filter((p) => p.connected).length;
  const reviewCount = active.filter((a) => a.status === "awaiting_review").length;

  return (
    <Screen testID="screen-studio">
      <Slate
        eyebrow="FEISTA · PRODUCTION BOARD"
        title="Studio"
        fixture={state.source === "fixture"}
        cells={[
          { k: "DATE", v: formatDay(FIXTURE_NOW.toISOString()) },
          { k: "ROLLING", v: String(active.length).padStart(2, "0") },
          { k: "REVIEW", v: String(reviewCount).padStart(2, "0") },
          { k: "QUEUE", v: String(queue.length).padStart(2, "0") },
        ]}
      />

      <SectionHead index="01" title="On the floor" aside={`${active.length} PRODUCTIONS`} />
      {active.map(({ p, status }) => (
        <ProductionRow key={p.id} project={p} status={status} onOpen={() => router.push(`/project/${p.id}`)} />
      ))}

      <SectionHead index="02" title="Queue" aside={`${queue.length} NODES`} />
      {queue.length === 0 ? <Text style={styles.prose}>Nothing waiting.</Text> : null}
      {queue.map(({ p, r }) => (
        <View key={`${p.id}-${r.nodeId}`}>
          <View style={styles.qRow}>
            <Text style={[type.monoS, styles.qCode]}>{p.code}</Text>
            <Text style={[type.mono, styles.qNode]} numberOfLines={1}>
              {nodeLabel(r.nodeId)}
            </Text>
            <StatusMark status={r.status} size={8} />
          </View>
          <Rule />
        </View>
      ))}

      <SectionHead index="03" title="Recent prints" aside={`${recent.length} REELS`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reel}>
        {recent.map((p, i) => (
          <Pressable
            key={p.id}
            style={styles.reelItem}
            onPress={() => router.push(`/project/${p.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${p.title}, ${p.durationSec} seconds`}
          >
            <Frame blurhash={p.scenes[0]?.blurhash ?? ""} frameNo={`${String(i + 1).padStart(2, "0")}A`} aspect={ASPECT[p.aspect]} accessibilityLabel={`First frame of ${p.title}`} />
            <Text style={styles.reelTitle} numberOfLines={1}>
              {p.title}
            </Text>
            <Timecode ms={p.durationSec * 1000} size="s" />
          </Pressable>
        ))}
      </ScrollView>

      <SectionHead index="04" title="Spend · Nov" aside="USD" />
      <View style={styles.spendHead}>
        <Text style={type.monoXS}>COMMITTED (REPORTED, ELSE ESTIMATE)</Text>
        <View style={styles.spendBig}>
          <Text style={type.displayL}>{formatCents(spend.committedCents)}</Text>
          <Text style={type.mono}>{`/ ${formatCents(limit)}`}</Text>
        </View>
        <Meter fraction={spend.committedCents / limit} warn={state.settings.spending.warnFraction} />
      </View>
      <MetaRow k="Estimated" v={formatCents(spend.estimatedCents)} tone="muted" />
      <MetaRow k="Reported by providers" v={formatCents(spend.reportedCents)} />
      <MetaRow k="Not yet reported (est.)" v={formatCents(spend.unreportedEstimateCents)} tone="slate" />
      <Text style={styles.prose}>{`${ledgerCount} ledger entries. Estimates are not bills — reported figures replace them as providers confirm cost.`}</Text>

      <SectionHead index="05" title="Lines" aside="HEALTH" />
      <MetaRow k="Backend API" v="NOT CONNECTED — FIXTURE REPO" tone="tape" />
      <MetaRow k="Providers with keys" v={`${connected} OF ${state.providers.length}`} />
      <MetaRow k="Live health probe" v="NOT BUILT" tone="muted" />
      <Pressable
        onPress={() => router.navigate("/connections")}
        accessibilityRole="link"
        accessibilityLabel="Open connections"
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={type.label}>Open connections</Text>
        <Text style={type.label}>→</Text>
      </Pressable>
    </Screen>
  );
}

function ProductionRow({ project, status, onOpen }: { project: Project; status: ReturnType<typeof projectStatus>; onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${project.title}, ${project.code}`}
      accessibilityHint="Opens shot review and stage timeline"
      style={({ pressed }) => [styles.prod, pressed && styles.pressed]}
    >
      <View style={styles.prodTop}>
        <Text style={type.monoS}>{project.code}</Text>
        <StatusMark status={status} />
      </View>
      <Text style={type.displayM} numberOfLines={2}>
        {project.title}
      </Text>
      <DagStrip project={project} />
    </Pressable>
  );
}

function Meter({ fraction, warn }: { fraction: number; warn: number }) {
  const pct = `${Math.min(100, Math.round(fraction * 100))}%` as const;
  const warnAt = `${Math.round(warn * 100)}%` as const;
  return (
    <View style={styles.meter} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }} accessibilityLabel="Monthly spend against limit">
      <View style={[styles.meterFill, { width: pct }, fraction >= warn && styles.meterWarn]} />
      <View style={[styles.meterTick, { left: warnAt }]} />
      <View style={styles.meterScale}>
        {[0, 25, 50, 75, 100].map((t) => (
          <Text key={t} style={type.monoXS}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  prose: { ...type.bodyS, paddingLeft: gutter.left, paddingRight: gutter.right * 3, paddingVertical: space[4] },
  prod: { paddingLeft: gutter.left, paddingRight: gutter.right, paddingVertical: space[5], gap: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.rule },
  prodTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pressed: { backgroundColor: color.surface },
  qRow: { minHeight: touch.min, flexDirection: "row", alignItems: "center", gap: space[4], paddingLeft: gutter.left, paddingRight: gutter.right },
  qCode: { width: 72 },
  qNode: { flex: 1 },
  reel: { paddingLeft: gutter.left, paddingRight: gutter.right, gap: space[3] },
  reelItem: { width: 132, gap: space[2] },
  reelTitle: { ...type.bodyStrong, fontSize: 13, lineHeight: 17 },
  spendHead: { paddingLeft: gutter.left, paddingRight: gutter.right, paddingBottom: space[5], gap: space[2] },
  spendBig: { flexDirection: "row", alignItems: "baseline", gap: space[3] },
  meter: { height: 14, marginTop: space[3], marginBottom: space[5], borderWidth: 1, borderColor: color.ruleStrong },
  meterFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: color.text },
  meterWarn: { backgroundColor: color.slate },
  meterTick: { position: "absolute", top: -5, bottom: -5, width: 2, backgroundColor: color.tape },
  meterScale: { position: "absolute", top: 16, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between" },
  link: { minHeight: touch.row, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingLeft: gutter.left, paddingRight: gutter.right, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.rule },
});
