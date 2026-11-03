import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import { color, font, space, touch } from "../theme/tokens";

/**
 * Reel-index tab bar: numbered, ruled cells; the active reel gets a slate-yellow top bar.
 * Custom (JS) on purpose — the platform's glass/blurred native tab bar is the exact look this
 * identity rejects. Text labels, no icons: production tools label things.
 */
export const TabBar = memo(function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[2]) }]} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const options = descriptors[route.key]?.options;
        const label = typeof options?.title === "string" ? options.title : route.name;
        const onPress = () => {
          const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            testID={`tab-${route.name}`}
            style={({ pressed }) => [styles.cell, i > 0 && styles.cellRule, pressed && styles.pressed]}
          >
            <View style={[styles.flag, focused && styles.flagOn]} />
            <Text style={[styles.num, focused && styles.numOn]}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
              {label.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.ruleStrong },
  cell: { flex: 1, minHeight: touch.row + 8, paddingHorizontal: 6, paddingTop: space[3], gap: 2 },
  cellRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.rule },
  pressed: { backgroundColor: color.surface },
  flag: { position: "absolute", top: -1, left: 0, right: 0, height: 3 },
  flagOn: { backgroundColor: color.slate },
  num: { fontFamily: font.mono, fontSize: 10, letterSpacing: 1, color: color.textFaint, fontVariant: ["tabular-nums"] },
  numOn: { color: color.slate },
  label: { fontFamily: font.monoMedium, fontSize: 10.5, letterSpacing: 0.8, color: color.textMuted },
  labelOn: { color: color.text },
});
