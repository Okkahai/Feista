import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, gutter, space, type } from "../theme/tokens";
import { Rule } from "./Rule";

export type SlateCell = { k: string; v: string };

type Props = {
  title: string;
  /** Small mono line above the title, e.g. "FST-0142 · STORY". */
  eyebrow?: string;
  /** Up to 4 slate fields (PROD / ROLL / SCENE / DATE). */
  cells?: SlateCell[];
  /** Mark fixture-backed screens visibly. */
  fixture?: boolean;
};

const STRIPES = Array.from({ length: 18 }, (_, i) => i);

/**
 * Clapperboard header: diagonal stick band, display title, ruled field grid.
 * Asymmetric on purpose — the title hangs off a wide left gutter, fields run right.
 */
export const Slate = memo(function Slate({ title, eyebrow, cells, fixture }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.sticks} accessibilityElementsHidden importantForAccessibility="no">
        {STRIPES.map((i) => (
          <View key={i} style={[styles.stick, i % 2 === 0 ? styles.stickOn : styles.stickOff]} />
        ))}
      </View>
      <Rule weight="thin" tone="text" />
      <View style={styles.head}>
        <View style={styles.eyebrowRow}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : <View />}
          {fixture ? (
            <Text style={styles.fixture} accessibilityLabel="Showing fixture data, not live">
              FIXTURE DATA
            </Text>
          ) : null}
        </View>
        <Text style={type.displayXL} accessibilityRole="header" numberOfLines={3}>
          {title}
        </Text>
      </View>
      {cells && cells.length ? (
        <>
          <Rule tone="strong" />
          <View style={styles.grid}>
            {cells.map((c, i) => (
              <View key={c.k} style={[styles.cell, i === 0 ? styles.cellFirst : styles.cellRule]} accessible accessibilityLabel={`${c.k}: ${c.v}`}>
                <Text style={type.monoXS}>{c.k}</Text>
                <Text style={styles.cellV} numberOfLines={1}>
                  {c.v}
                </Text>
              </View>
            ))}
          </View>
          <Rule tone="strong" />
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { backgroundColor: color.bg },
  sticks: { flexDirection: "row", height: 12, overflow: "hidden", marginLeft: -8 },
  stick: { width: 26, height: 12, transform: [{ skewX: "-35deg" }] },
  stickOn: { backgroundColor: color.text },
  stickOff: { backgroundColor: color.bg },
  head: { paddingLeft: gutter.left, paddingRight: gutter.right * 2, paddingTop: space[5], paddingBottom: space[5], gap: space[3] },
  eyebrowRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { ...type.monoS, color: color.text },
  fixture: { ...type.monoXS, color: color.slate, borderWidth: 1, borderColor: color.slate, paddingHorizontal: 4, paddingVertical: 1 },
  grid: { flexDirection: "row" },
  cell: { flex: 1, paddingVertical: space[3], paddingHorizontal: space[3], gap: 2 },
  cellFirst: { paddingLeft: gutter.left },
  cellRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.ruleStrong },
  cellV: { ...type.mono, fontSize: 14 },
});
