import { memo, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { color, font, gutter, space, touch, type } from "../theme/tokens";

type Props = Omit<TextInputProps, "style"> & { label: string; hint?: string | undefined; error?: string | undefined; suffix?: string };

/** Underlined field like a form on a camera report: mono label, body input, hairline that turns slate on focus. */
export const Field = memo(function Field({ label, hint, error, suffix, onFocus, onBlur, ...input }: Props) {
    const [focused, setFocused] = useState(false);
    return (
      <View style={styles.wrap}>
        <Text style={type.monoS} nativeID={`lbl-${label}`}>
          {label}
        </Text>
        <View style={[styles.box, focused && styles.focused, error ? styles.invalid : null]}>
          <TextInput
            {...input}
            accessibilityLabel={label}
            accessibilityLabelledBy={`lbl-${label}`}
            accessibilityHint={error ?? hint}
            placeholderTextColor={color.textFaint}
            selectionColor={color.slate}
            keyboardAppearance="dark"
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={styles.input}
          />
          {suffix ? <Text style={type.monoS}>{suffix}</Text> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={type.monoXS}>{hint}</Text> : null}
      </View>
    );
});

const styles = StyleSheet.create({
  wrap: { paddingLeft: gutter.left, paddingRight: gutter.right, paddingVertical: space[4], gap: space[2] },
  box: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: color.ruleStrong, minHeight: touch.row },
  focused: { borderBottomColor: color.slate, borderBottomWidth: 2 },
  invalid: { borderBottomColor: color.tape },
  input: { flex: 1, fontFamily: font.body, fontSize: 17, color: color.text, paddingVertical: space[3] },
  error: { ...type.monoS, color: color.tape },
});
