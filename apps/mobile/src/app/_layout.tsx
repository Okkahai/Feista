import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Anton_400Regular } from "@expo-google-fonts/anton";
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { color } from "../theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});

const screenOptions = { headerShown: false, contentStyle: { backgroundColor: color.bg } } as const;

export default function RootLayout() {
  // Keys here are the fontFamily names used in theme/tokens.ts.
  const [loaded, error] = useFonts({
    Anton_400Regular,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  const ready = loaded || !!error; // on font error fall back to system fonts rather than a blank app
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar style="light" />
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="project/[id]" />
        </Stack>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
