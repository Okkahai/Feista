import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, gutter, space, touch, type } from "../theme/tokens";
import { Rule } from "./Rule";

type Props = { k: string; v: ReactNode; tone?: "default" | "muted" | "tape" | "leader" | "slate" };



/** Camera-report row: mono key left, value right, hairline below. */
export const MetaRow = memo(function MetaRow({ k, v, tone = "default" }: Props) {
  return (
    <View>
      <View style={styles.row} accessible accessibilityLabel={typeof v === "string" ? `${k}: ${v}` : undefined}>
        <Text style={type.monoS}>{k}</Text>
        {typeof v === "string" ? <Text style={[type.mono, styles.v, tones[tone]]}>{v}</Text> : v}
      </View>
      <Rule />
    </View>
  );
});

const styles = StyleSheet.create({
  row: { minHeight: touch.min, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[4], paddingLeft: gutter.left, paddingRight: gutter.right, paddingVertical: space[3] },
  v: { flexShrink: 1, textAlign: "right" },
});
const tones = StyleSheet.create({
  default: { color: color.text },
  muted: { color: color.textMuted },
  tape: { color: color.tape },
  leader: { color: color.leader },
  slate: { color: color.slate },
});
