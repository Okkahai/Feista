import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import type { JobStatus } from "@feista/core";
import { color, font, motion } from "../theme/tokens";

export type MarkShape = "hollow-square" | "dot" | "ring" | "diamond" | "square" | "cross" | "slashed-square";

export interface StatusMarkSpec {
  label: string; // printed label — the primary carrier of meaning
  color: string;
  shape: MarkShape; // second, colour-independent channel
  a11y: string; // spoken description
}

/**
 * Every JobStatus gets a distinct label AND a distinct shape, so meaning never rides on
 * colour alone (WCAG 1.4.1). Shapes borrow from camera-report / lab-sheet marks.
 */
export const STATUS_MARKS: Record<JobStatus, StatusMarkSpec> = {
  queued: { label: "QUEUED", color: color.textMuted, shape: "hollow-square", a11y: "Queued, waiting for a worker" },
  running: { label: "RUNNING", color: color.tungsten, shape: "dot", a11y: "Running" },
  awaiting_provider: { label: "AT PROVIDER", color: color.tungsten, shape: "ring", a11y: "Waiting on the provider" },
  awaiting_review: { label: "REVIEW", color: color.slate, shape: "diamond", a11y: "Needs your review" },
  completed: { label: "COMPLETE", color: color.leader, shape: "square", a11y: "Complete" },
  failed: { label: "FAILED", color: color.tape, shape: "cross", a11y: "Failed" },
  cancelled: { label: "CANCELLED", color: color.textFaint, shape: "slashed-square", a11y: "Cancelled" },
};

type Props = { status: JobStatus; showLabel?: boolean; size?: number };

export const StatusMark = memo(function StatusMark({ status, showLabel = true, size = 10 }: Props) {
  const spec = STATUS_MARKS[status];
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={`Status: ${spec.a11y}`} testID={`status-${status}`}>
      <Shape shape={spec.shape} tint={spec.color} size={size} pulse={status === "running"} />
      {showLabel ? <Text style={[styles.label, { color: spec.color }]}>{spec.label}</Text> : null}
    </View>
  );
});

function Shape({ shape, tint, size, pulse }: { shape: MarkShape; tint: string; size: number; pulse: boolean }) {
  const reduce = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!pulse || reduce) return;
    // REC-light pulse: opacity only (GPU-friendly), slow, no scale bounce.
    opacity.value = withRepeat(withTiming(0.35, { duration: motion.pulse / 2, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [pulse, reduce, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const box = { width: size, height: size };
  const line = { position: "absolute" as const, width: size * 1.3, height: 2, backgroundColor: tint, top: size / 2 - 1, left: -size * 0.15 };
  switch (shape) {
    case "hollow-square":
      return <View style={[box, { borderWidth: 1.5, borderColor: tint }]} />;
    case "dot":
      return <Animated.View style={[box, { borderRadius: size / 2, backgroundColor: tint }, animated]} />;
    case "ring":
      return <View style={[box, { borderRadius: size / 2, borderWidth: 1.5, borderColor: tint }]} />;
    case "diamond":
      return <View style={[{ width: size * 0.8, height: size * 0.8, margin: size * 0.1, backgroundColor: tint, transform: [{ rotate: "45deg" }] }]} />;
    case "square":
      return <View style={[box, { backgroundColor: tint }]} />;
    case "cross":
      return (
        <View style={box}>
          <View style={[line, { transform: [{ rotate: "45deg" }] }]} />
          <View style={[line, { transform: [{ rotate: "-45deg" }] }]} />
        </View>
      );
    case "slashed-square":
      return (
        <View style={[box, { borderWidth: 1, borderColor: tint, overflow: "hidden" }]}>
          <View style={[line, { height: 1, transform: [{ rotate: "-45deg" }] }]} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontFamily: font.monoMedium, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
});
