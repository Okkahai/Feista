/** SETTINGS. FIXTURE-BACKED: changes live in the in-memory repo and reset on reload. */
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Choice, Field, MetaRow, Screen, SectionHead, Slate, Toggle } from "../../components";
import { repo, useStudio } from "../../data/repo";
import type { Settings, StudioState } from "../../data/types";
import { gutter, space, type } from "../../theme/tokens";

const ASPECTS = ["9:16", "1:1", "16:9"] as const;
const RESOLUTIONS = ["720p", "1080p", "2160p"] as const;
const WARN = ["0.7", "0.8", "0.9"] as const;
const pct = (v: string) => `${Math.round(Number(v) * 100)}%`;
const mb = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const selectSettings = (s: StudioState) => s.settings;
const selectSource = (s: StudioState) => s.source;

type Section = keyof Settings;
const set = <K extends Section>(k: K, patch: Partial<Settings[K]>) => repo.updateSettings((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

export default function SettingsScreen() {
  const s = useStudio(selectSettings);
  const source = useStudio(selectSource);

  return (
    <Screen keyboard testID="screen-settings">
      <Slate eyebrow="PREFERENCES" title="Settings" fixture={source === "fixture"} />
      <Text style={styles.prose}>Held in memory by the fixture repo — not persisted, reset on reload.</Text>

      <SectionHead index="01" title="Export defaults" />
      <Choice label="Aspect" value={s.export.aspect} options={ASPECTS} onChange={(aspect) => set("export", { aspect })} />
      <Choice label="Resolution" value={s.export.resolution} options={RESOLUTIONS} onChange={(resolution) => set("export", { resolution })} />
      <Toggle label="Burn in captions" detail="Open captions, for silent autoplay feeds" value={s.export.burnCaptions} onChange={(burnCaptions) => set("export", { burnCaptions })} />
      <Toggle label="Corner watermark" value={s.export.watermark} onChange={(watermark) => set("export", { watermark })} />

      <SectionHead index="02" title="Spending limits" aside="USD" />
      <MoneyField label="Monthly limit" cents={s.spending.monthlyLimitCents} onCommit={(monthlyLimitCents) => set("spending", { monthlyLimitCents })} hint="Hard stop across all productions" />
      <MoneyField label="Ask me above (per operation)" cents={s.spending.approvalThresholdCents} onCommit={(approvalThresholdCents) => set("spending", { approvalThresholdCents })} />
      <Choice label="Warn at" value={String(s.spending.warnFraction) as (typeof WARN)[number]} options={WARN} format={pct} onChange={(v) => set("spending", { warnFraction: Number(v) })} />

      <SectionHead index="03" title="Notifications" aside="DELIVERY NOT BUILT" />
      <Toggle label="Shots ready for review" value={s.notifications.reviewReady} onChange={(reviewReady) => set("notifications", { reviewReady })} />
      <Toggle label="A stage failed" value={s.notifications.failed} onChange={(failed) => set("notifications", { failed })} />
      <Toggle label="Budget warning" value={s.notifications.budgetWarn} onChange={(budgetWarn) => set("notifications", { budgetWarn })} />
      <Text style={styles.prose}>Preferences are saved; push delivery needs the notification service, which does not exist yet.</Text>

      <SectionHead index="04" title="Privacy" />
      <Toggle label="Share usage analytics" detail="Off by default. Nothing is collected while off." value={s.privacy.analytics} onChange={(analytics) => set("privacy", { analytics })} />
      <Toggle label="Keep source media after export" detail="Otherwise uploads are deleted once a production is published" value={s.privacy.keepSourceMedia} onChange={(keepSourceMedia) => set("privacy", { keepSourceMedia })} />

      <SectionHead index="05" title="Storage" />
      <MetaRow k="Proxy cache" v={`${mb.format(s.storage.cacheBytes / 1e6)} MB`} />
      <Toggle label="Keep offline proxies" detail="Low-res copies for reviewing without a connection" value={s.storage.offlineProxies} onChange={(offlineProxies) => set("storage", { offlineProxies })} />
      <View style={styles.actions}>
        <Button
          label="Clear proxy cache"
          variant="destructive"
          onPress={() => set("storage", { cacheBytes: 0 })}
          disabledReason={s.storage.cacheBytes === 0 ? "Cache is already empty" : undefined}
        />
      </View>
    </Screen>
  );
}

function MoneyField({ label, cents, onCommit, hint }: { label: string; cents: number; onCommit: (c: number) => void; hint?: string }) {
  const [text, setText] = useState((cents / 100).toFixed(2));
  const parsed = Math.round(Number(text.replace(",", ".")) * 100);
  const valid = text.trim() !== "" && Number.isInteger(parsed) && parsed > 0;
  const commit = useCallback(() => {
    if (valid) onCommit(parsed);
  }, [valid, parsed, onCommit]);
  return (
    <Field
      label={label}
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType="decimal-pad"
      returnKeyType="done"
      suffix="USD"
      hint={hint}
      error={valid ? undefined : "Enter an amount above 0"}
    />
  );
}

const styles = StyleSheet.create({
  prose: { ...type.bodyS, paddingLeft: gutter.left, paddingRight: gutter.right * 3, paddingTop: space[4] },
  actions: { paddingLeft: gutter.left, paddingRight: gutter.right, paddingTop: space[5] },
});
