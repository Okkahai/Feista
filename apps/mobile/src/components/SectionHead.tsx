import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, gutter, space, type } from "../theme/tokens";
import { Rule } from "./Rule";

type Props = { index: string; title: string; aside?: ReactNode };

/** "02 ── QUEUE ............ 3 JOBS": heavy rule, reel number, title, right-aligned metadata. */
export const SectionHead = memo(function SectionHead({ index, title, aside }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Rule weight="heavy" tone="text" />
      <View style={styles.row}>
        <Text style={styles.index}>{index}</Text>
        <Text style={type.displayS}>{title}</Text>
        <View style={styles.spacer} />
        {typeof aside === "string" ? <Text style={type.monoS}>{aside}</Text> : aside}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: space[6] },
  row: { flexDirection: "row", alignItems: "baseline", gap: space[4], paddingTop: space[3], paddingBottom: space[4], paddingLeft: gutter.left, paddingRight: gutter.right },
  index: { ...type.monoS, color: color.slate },
  spacer: { flex: 1 },
});
