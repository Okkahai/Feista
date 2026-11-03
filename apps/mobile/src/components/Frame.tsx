import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { color, font } from "../theme/tokens";

type Props = {
  blurhash: string;
  /** Edge-printed frame number, e.g. "14" or "14A". */
  frameNo: string;
  aspect: number; // width / height
  uri?: string;
  accessibilityLabel: string;
};

const HOLES = Array.from({ length: 8 }, (_, i) => i);

function Sprockets() {
  return (
    <View style={styles.sprockets} accessibilityElementsHidden importantForAccessibility="no">
      {HOLES.map((i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  );
}

/** One film frame: sprocket edges, image (expo-image; blurhash until real keyframes), edge number. */
export const Frame = memo(function Frame({ blurhash, frameNo, aspect, uri, accessibilityLabel }: Props) {
  return (
    <View style={styles.strip}>
      <Sprockets />
      <View style={[styles.gate, { aspectRatio: aspect }]}>
        <Image
          style={StyleSheet.absoluteFill}
          source={uri ? { uri } : undefined}
          placeholder={{ blurhash }}
          contentFit="cover"
          transition={0}
          recyclingKey={frameNo}
          accessibilityLabel={accessibilityLabel}
        />
        <Text style={styles.edge}>{frameNo}</Text>
      </View>
      <Sprockets />
    </View>
  );
});

const styles = StyleSheet.create({
  strip: { backgroundColor: color.surfaceSunken, paddingHorizontal: 6 },
  sprockets: { height: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hole: { width: 7, height: 5, backgroundColor: color.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.ruleStrong, borderRadius: 1 },
  gate: { width: "100%", overflow: "hidden", backgroundColor: color.surface },
  edge: { position: "absolute", left: 4, top: 3, fontFamily: font.mono, fontSize: 10, letterSpacing: 1, color: color.slate, fontVariant: ["tabular-nums"] },
});
