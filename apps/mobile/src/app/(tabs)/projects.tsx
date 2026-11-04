/** PROJECTS — contact-sheet library. FIXTURE-BACKED via src/data/repo.ts. */
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { JobStatus } from "@feista/core";
import { Choice, ContactSheet, Slate, type SheetItem } from "../../components";
import { projectStatus, useStudio } from "../../data/repo";
import type { StudioState } from "../../data/types";
import { formatDay } from "../../lib/format";
import { color, gutter, space, type } from "../../theme/tokens";

const FILTERS = ["all", "active", "review", "failed", "done"] as const;
type Filter = (typeof FILTERS)[number];
const MATCH: Record<Filter, (s: JobStatus) => boolean> = {
  all: () => true,
  active: (s) => s === "running" || s === "awaiting_provider" || s === "queued",
  review: (s) => s === "awaiting_review",
  failed: (s) => s === "failed",
  done: (s) => s === "completed" || s === "cancelled",
};
const selectProjects = (s: StudioState) => s.projects;
const selectSource = (s: StudioState) => s.source;

export default function ProjectsScreen() {
  const projects = useStudio(selectProjects);
  const source = useStudio(selectSource);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");

  const all = useMemo<SheetItem[]>(
    () =>
      projects.map((p) => ({
        id: p.id,
        frameNo: p.code.slice(4),
        blurhash: p.scenes[0]?.blurhash ?? "",
        aspect: 4 / 5,
        title: p.title,
        caption: `${formatDay(p.createdAt)} · ${p.aspect} · ${p.durationSec}S`,
        status: projectStatus(p),
      })),
    [projects],
  );
  const items = useMemo(() => all.filter((i) => MATCH[filter](i.status)), [all, filter]);
  const onOpen = useCallback((id: string) => router.push(`/project/${id}`), [router]);

  const header = (
    <View>
      <Slate eyebrow="LIBRARY · CONTACT SHEET" title="Projects" fixture={source === "fixture"} cells={[{ k: "REELS", v: String(projects.length).padStart(2, "0") }, { k: "SHOWING", v: String(items.length).padStart(2, "0") }, { k: "SORT", v: "NEWEST" }]} />
      <Choice label="Filter by status" value={filter} options={FILTERS} onChange={setFilter} />
      <View style={styles.gap} />
    </View>
  );
  const empty = <Text style={styles.empty}>{`No ${filter} projects on this sheet.`}</Text>;

  return (
    <View style={styles.root} testID="screen-projects">
      <ContactSheet items={items} onOpen={onOpen} header={header} empty={empty} topInset={insets.top + space[3]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  gap: { height: space[4] },
  empty: { ...type.bodyS, paddingLeft: gutter.left, paddingVertical: space[6], color: color.textMuted },
});
