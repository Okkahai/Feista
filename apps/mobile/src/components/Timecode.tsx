import { memo } from "react";
import { Text, type TextStyle, type StyleProp } from "react-native";
import { toTimecode } from "../lib/format";
import { type } from "../theme/tokens";

type Props = { ms: number; style?: StyleProp<TextStyle>; size?: "s" | "m" };

/** SMPTE-style HH:MM:SS:FF at 24 fps, mono with tabular numerals so columns never jitter. */
export const Timecode = memo(function Timecode({ ms, style, size = "m" }: Props) {
  const tc = toTimecode(ms);
  const [h, m, s, f] = tc.split(":");
  return (
    <Text style={[size === "m" ? type.mono : type.monoS, style]} accessibilityLabel={`Timecode ${Number(h)} hours ${Number(m)} minutes ${Number(s)} seconds ${Number(f)} frames`}>
      {tc}
    </Text>
  );
});
