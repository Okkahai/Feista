import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { border, color } from "../theme/tokens";

type Weight = "hairline" | "thin" | "heavy";
type Tone = "rule" | "strong" | "text" | "slate";
type Props = { weight?: Weight; tone?: Tone; vertical?: boolean };

/** Hairline rules carry the grid. Heavy rules open sections, like a ruled camera report. */
export const Rule = memo(function Rule({ weight = "hairline", tone = "rule", vertical = false }: Props) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[vertical ? v[weight] : h[weight], tones[tone]]}
    />
  );
});

const h = StyleSheet.create({
  hairline: { alignSelf: "stretch", height: border.hairline },
  thin: { alignSelf: "stretch", height: border.thin },
  heavy: { alignSelf: "stretch", height: border.heavy },
});
const v = StyleSheet.create({
  hairline: { alignSelf: "stretch", width: border.hairline },
  thin: { alignSelf: "stretch", width: border.thin },
  heavy: { alignSelf: "stretch", width: border.heavy },
});
const tones = StyleSheet.create({
  rule: { backgroundColor: color.rule },
  strong: { backgroundColor: color.ruleStrong },
  text: { backgroundColor: color.text },
  slate: { backgroundColor: color.slate },
});
