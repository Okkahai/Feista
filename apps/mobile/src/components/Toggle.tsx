import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, gutter, space, touch, type } from "../theme/tokens";

type Props = { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void };

/** Full-row switch. A square ON/OFF indicator instead of a pill; the whole row is the target. */
export const Toggle = memo(function Toggle({ label, detail, value, onChange }: Props) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={detail}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={type.body}>{label}</Text>
        {detail ? <Text style={type.bodyS}>{detail}</Text> : null}
      </View>
      <View style={[styles.box, value && styles.boxOn]}>
        <Text style={[styles.state, value && styles.stateOn]}>{value ? "ON" : "OFF"}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { minHeight: touch.row, flexDirection: "row", alignItems: "center", gap: space[4], paddingLeft: gutter.left, paddingRight: gutter.right, paddingVertical: space[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.rule },
  pressed: { backgroundColor: color.surface },
  text: { flex: 1, gap: 2 },
  box: { width: 52, height: 28, borderWidth: 1, borderColor: color.ruleStrong, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: color.text, borderColor: color.text },
  state: { fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 1.2, color: color.textMuted },
  stateOn: { color: color.bg },
});
