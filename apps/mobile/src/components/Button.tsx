import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from "react-native";
import { border, color, font, space, touch } from "../theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "destructive";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Disabled buttons must say why — no dead buttons. */
  disabledReason?: string | undefined;
  compact?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

/**
 * Square, ruled buttons. Primary = slate yellow block. Secondary = outlined.
 * Destructive = tape red outline, fills on press.
 */
export const Button = memo(function Button({ label, onPress, variant = "primary", disabledReason, compact, accessibilityHint, testID }: Props) {
  const disabled = disabledReason !== undefined || !onPress;
  const v = variants[variant];
  return (
    <View style={compact ? styles.compactWrap : undefined}>
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityHint={disabled ? disabledReason : accessibilityHint}
        hitSlop={compact ? 4 : 0}
        style={({ pressed }: PressableStateCallbackType) => [styles.base, compact && styles.compact, v.box, pressed && v.pressed, disabled && styles.disabled]}
      >
        {({ pressed }) => <Text style={[styles.text, v.text, pressed && v.pressedText, disabled && styles.disabledText]}>{label}</Text>}
      </Pressable>
      {disabled && disabledReason ? <Text style={styles.reason}>{"⊘ " + disabledReason}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  base: { minHeight: touch.row, paddingHorizontal: space[5], alignItems: "center", justifyContent: "center", borderRadius: border.radius, borderWidth: border.thin },
  compact: { minHeight: touch.min, paddingHorizontal: space[4] },
  compactWrap: { alignSelf: "flex-start" },
  text: { fontFamily: font.monoMedium, fontSize: 13, letterSpacing: 1.6, textTransform: "uppercase" },
  disabled: { backgroundColor: "transparent", borderColor: color.rule, borderStyle: "dashed" },
  disabledText: { color: color.textFaint },
  reason: { fontFamily: font.mono, fontSize: 11, lineHeight: 15, color: color.textMuted, marginTop: space[2] },
});

const variants = {
  primary: StyleSheet.create({
    box: { backgroundColor: color.slate, borderColor: color.slate },
    pressed: { backgroundColor: color.text, borderColor: color.text },
    text: { color: color.slateInk },
    pressedText: { color: color.slateInk },
  }),
  secondary: StyleSheet.create({
    box: { backgroundColor: "transparent", borderColor: color.ruleStrong },
    pressed: { backgroundColor: color.text, borderColor: color.text },
    text: { color: color.text },
    pressedText: { color: color.bg },
  }),
  destructive: StyleSheet.create({
    box: { backgroundColor: "transparent", borderColor: color.tape },
    pressed: { backgroundColor: color.tape },
    text: { color: color.tape },
    pressedText: { color: color.tapeInk },
  }),
};
