import { type ReactNode, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, space } from "../theme/tokens";

type Props = { children: ReactNode; keyboard?: boolean; testID?: string };

/**
 * Screen scroll container. Safe-area top goes into contentContainerStyle (not a wrapper
 * View) so content scrolls under the status bar edge; keyboard screens use
 * KeyboardAwareScrollView so the focused field is kept above the keyboard.
 */
export function Screen({ children, keyboard, testID }: Props) {
  const insets = useSafeAreaInsets();
  const content = useMemo(() => ({ paddingTop: insets.top + space[3], paddingBottom: space[9] }), [insets.top]);
  return (
    <View style={styles.root} testID={testID}>
      {keyboard ? (
        <KeyboardAwareScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled" bottomOffset={space[7]}>
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: color.bg } });
