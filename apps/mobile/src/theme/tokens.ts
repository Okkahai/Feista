/**
 * Feista design tokens — "Cinematic Analog × Editorial Brutalism".
 * Dark is the primary (and currently only) theme: the app is a production
 * instrument used next to monitors, like a slate or a camera report.
 */
import { Platform, StyleSheet, type TextStyle } from "react-native";

/**
 * Palette. Neutrals are warm (film base, not blue-black). Accents come from
 * production markings and each has exactly one job:
 *  - slate:  clapper/slate yellow. Primary action + "needs your attention".
 *  - tape:   red camera tape / REC light. Failed, destructive, recording.
 *  - leader: green leader / "good take". Completed, verified live.
 *  - tungsten: 3200K work-light amber. In progress (running / at provider).
 */
export const color = {
  bg: "#0E0D0C",
  surface: "#151311",
  surfaceRaised: "#1C1916",
  surfaceSunken: "#090807",
  rule: "#2E2A26",
  ruleStrong: "#4A443D",
  text: "#EFE8DC",
  textMuted: "#A69D8F", // 7.3:1 on bg
  textFaint: "#8A8175", // 5.1:1 on bg (4.8 on surface) — AA even at 10–11px metadata sizes
  slate: "#E8C547",
  slateInk: "#0E0D0C", // text on slate yellow
  tape: "#E5533D", // 5.2:1 on bg
  tapeInk: "#0E0D0C",
  leader: "#7FB069", // 7.7:1 on bg
  tungsten: "#E0913A",
  focus: "#EFE8DC",
} as const;

export type ColorToken = keyof typeof color;

/** Font family keys must match the keys passed to useFonts() in src/app/_layout.tsx. */
export const font = {
  display: "Anton_400Regular",
  body: "IBMPlexSans_400Regular",
  bodyMedium: "IBMPlexSans_500Medium",
  bodySemi: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
} as const;

const tabular: TextStyle["fontVariant"] = ["tabular-nums"];

/** Type scale. Display is condensed poster type, set tight; mono carries all metadata. */
export const type = StyleSheet.create({
  displayXL: { fontFamily: font.display, fontSize: 56, lineHeight: 56, letterSpacing: 0.5, color: color.text, textTransform: "uppercase" },
  displayL: { fontFamily: font.display, fontSize: 40, lineHeight: 42, letterSpacing: 0.5, color: color.text, textTransform: "uppercase" },
  displayM: { fontFamily: font.display, fontSize: 28, lineHeight: 30, letterSpacing: 0.5, color: color.text, textTransform: "uppercase" },
  displayS: { fontFamily: font.display, fontSize: 20, lineHeight: 22, letterSpacing: 0.6, color: color.text, textTransform: "uppercase" },
  bodyL: { fontFamily: font.body, fontSize: 17, lineHeight: 24, color: color.text },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.text },
  bodyStrong: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: color.text },
  bodyS: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.textMuted },
  mono: { fontFamily: font.mono, fontSize: 13, lineHeight: 18, color: color.text, fontVariant: tabular },
  monoS: { fontFamily: font.mono, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, color: color.textMuted, fontVariant: tabular, textTransform: "uppercase" },
  monoXS: { fontFamily: font.mono, fontSize: 10, lineHeight: 12, letterSpacing: 1, color: color.textFaint, fontVariant: tabular, textTransform: "uppercase" },
  label: { fontFamily: font.monoMedium, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, color: color.text, textTransform: "uppercase" },
});

/** 4pt base grid. */
export const space = { 0: 0, 1: 2, 2: 4, 3: 8, 4: 12, 5: 16, 6: 24, 7: 32, 8: 48, 9: 64 } as const;

/** Page gutter: asymmetric — wider on the left so the eye hangs on the type edge. */
export const gutter = { left: 20, right: 16 } as const;

export const border = {
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
  heavy: 2,
  /** Square corners. 2 is the ceiling (screens' physical roundness only). */
  radius: 0,
  radiusMax: 2,
} as const;

/** Minimum touch target (iOS HIG 44pt; Android 48dp is met by our 48 default rows). */
export const touch = { min: 44, row: 48 } as const;

/** Motion: subtle, mechanical. No springs with overshoot, no parallax. */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  /** REC-light pulse for running jobs. */
  pulse: 1200,
} as const;

export const fps = 24;

export const isWeb = Platform.OS === "web";
