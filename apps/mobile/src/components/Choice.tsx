import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, gutter, space, touch, type } from "../theme/tokens";

type Props<T extends string> = { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; format?: (v: T) => string };

/** Ruled segmented selector (radio group). Square cells, selected cell inverted. */
function ChoiceInner<T extends string>({ label, value, options, onChange, format }: Props<T>) {
  return (
    <View style={styles.wrap}>
      <Text style={type.monoS}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o, i) => {
          const on = o === value;
          return (
            <Pressable
              key={o}
              onPress={() => onChange(o)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={format ? format(o) : o}
              style={({ pressed }) => [styles.cell, i > 0 && styles.cellRule, on && styles.on, pressed && !on && styles.pressed]}
            >
              <Text style={[styles.text, on && styles.textOn]}>{format ? format(o) : o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
export const Choice = memo(ChoiceInner) as typeof ChoiceInner;

const styles = StyleSheet.create({
  wrap: { paddingLeft: gutter.left, paddingRight: gutter.right, paddingVertical: space[4], gap: space[3] },
  row: { flexDirection: "row", borderWidth: 1, borderColor: color.ruleStrong },
  cell: { flex: 1, minHeight: touch.min, alignItems: "center", justifyContent: "center", paddingHorizontal: space[2] },
  cellRule: { borderLeftWidth: 1, borderLeftColor: color.ruleStrong },
  on: { backgroundColor: color.text },
  pressed: { backgroundColor: color.surfaceRaised },
  text: { fontFamily: font.monoMedium, fontSize: 12, letterSpacing: 1, color: color.textMuted, textTransform: "uppercase", fontVariant: ["tabular-nums"] },
  textOn: { color: color.bg },
});
