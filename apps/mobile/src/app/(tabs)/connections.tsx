/** CONNECTIONS — provider list. FIXTURE-BACKED; verification levels are shown exactly as recorded. */
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { VerificationLevel } from "@feista/core";
import { Button, Rule, Screen, SectionHead, Slate } from "../../components";
import { useStudio } from "../../data/repo";
import type { ProviderConnection, StudioState } from "../../data/types";
import { color, font, gutter, space, touch, type } from "../../theme/tokens";

/** Honest ladder. Nothing is upgraded for display: PLANNED means no code exists. */
const LEVELS: Record<VerificationLevel, { label: string; meaning: string }> = {
  planned: { label: "PLANNED", meaning: "Contract written, no adapter code" },
  mocked: { label: "MOCKED", meaning: "Adapter runs against a fake; never hit the real API" },
  tested_locally: { label: "TESTED LOCALLY", meaning: "Real API, developer machine, not in production" },
  tested_live: { label: "TESTED LIVE", meaning: "Verified against production traffic" },
};
const box = StyleSheet.create({
  planned: { borderStyle: "dashed", borderColor: color.textFaint },
  mocked: { borderColor: color.slate },
  tested_locally: { borderColor: color.leader },
  tested_live: { borderColor: color.leader, backgroundColor: color.leader },
});
const ink = StyleSheet.create({
  planned: { color: color.textMuted },
  mocked: { color: color.slate },
  tested_locally: { color: color.leader },
  tested_live: { color: color.bg },
});
const ORDER: VerificationLevel[] = ["planned", "mocked", "tested_locally", "tested_live"];
const selectState = (s: StudioState) => s;

export default function ConnectionsScreen() {
  const state = useStudio(selectState);
  const live = state.providers.filter((p) => p.manifest.verification === "tested_live").length;
  return (
    <Screen testID="screen-connections">
      <Slate
        eyebrow="BRING YOUR OWN KEYS"
        title="Connections"
        fixture={state.source === "fixture"}
        cells={[
          { k: "PROVIDERS", v: String(state.providers.length).padStart(2, "0") },
          { k: "KEYS", v: String(state.providers.filter((p) => p.connected).length).padStart(2, "0") },
          { k: "LIVE", v: String(live).padStart(2, "0") },
        ]}
      />
      <Text style={styles.prose}>
        Each line shows how far its integration has actually been proven. Feista asks for a capability, not a vendor — a production only
        runs on providers you have keys for.
      </Text>

      <SectionHead index="01" title="Providers" />
      {state.providers.map((p) => (
        <ProviderRow key={p.manifest.id} p={p} />
      ))}

      <SectionHead index="02" title="Verification key" />
      {ORDER.map((l) => (
        <View key={l} style={styles.legendRow}>
          <Badge level={l} />
          <Text style={[type.bodyS, styles.flex]}>{LEVELS[l].meaning}</Text>
        </View>
      ))}
    </Screen>
  );
}

function Badge({ level }: { level: VerificationLevel }) {
  const l = LEVELS[level];
  return (
    <View style={[styles.badge, box[level]]} accessible accessibilityLabel={`Verification: ${l.label.toLowerCase()}`}>
      <Text style={[styles.badgeText, ink[level]]}>{l.label}</Text>
    </View>
  );
}

function ProviderRow({ p }: { p: ProviderConnection }) {
  const m = p.manifest;
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <Text style={type.displayM}>{m.name}</Text>
          <Badge level={m.verification} />
        </View>
        <Text style={type.monoS}>{m.capabilities.join("  ·  ")}</Text>
        <View style={styles.facts}>
          <Fact k="KEY" v={p.connected ? "ON FILE" : "NONE"} on={p.connected} />
          <Fact k="AUTH" v={m.auth === "oauth2" ? "OAUTH" : "API KEY"} />
          <Fact k="HEALTH" v={p.health.toUpperCase()} />
          <Fact k="MODE" v={m.lifecycle.replace(/_/g, " ").toUpperCase()} />
        </View>
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button
              compact
              variant="secondary"
              label={p.connected ? "Replace key" : "Add key"}
              disabledReason="Server-side key vault not built — keys are never stored on this device"
            />
          </View>
          <Pressable
            onPress={() => Linking.openURL(m.docsUrl)}
            accessibilityRole="link"
            accessibilityLabel={`${m.name} documentation`}
            style={({ pressed }) => [styles.docs, pressed && styles.pressed]}
          >
            <Text style={type.label}>Docs ↗</Text>
          </Pressable>
        </View>
      </View>
      <Rule />
    </View>
  );
}

function Fact({ k, v, on }: { k: string; v: string; on?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={type.monoXS}>{k}</Text>
      <Text style={[type.mono, styles.factV, on && styles.on]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  prose: { ...type.body, color: color.textMuted, paddingLeft: gutter.left, paddingRight: gutter.right * 3, paddingTop: space[5] },
  row: { paddingLeft: gutter.left, paddingRight: gutter.right, paddingVertical: space[5], gap: space[3] },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space[3] },
  facts: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.rule },
  fact: { flex: 1, paddingVertical: space[3], gap: 2 },
  factV: { fontSize: 12 },
  on: { color: color.leader },
  actions: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  docs: { minHeight: touch.min, paddingHorizontal: space[4], justifyContent: "center", borderWidth: 1, borderColor: color.rule },
  pressed: { backgroundColor: color.surface },
  flex: { flex: 1 },
  badge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontFamily: font.monoMedium, fontSize: 10, letterSpacing: 1.2 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space[4], minHeight: touch.min, paddingLeft: gutter.left, paddingRight: gutter.right, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.rule, paddingVertical: space[3] },
});
