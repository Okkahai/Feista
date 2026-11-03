// Native modules have no JS implementation under Jest; use the libraries' own mocks where they work.
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
jest.mock("react-native-keyboard-controller", () => require("react-native-keyboard-controller/jest"));
// shortcut: Reanimated 4's bundled mock crashes under jest-expo 58 (setCSSEventHandler); stub only the APIs we use.
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const id = (v) => v;
  return {
    __esModule: true,
    default: { View },
    useReducedMotion: () => true,
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: (fn) => fn(),
    withRepeat: id,
    withTiming: id,
    cancelAnimation: () => {},
    Easing: { inOut: () => id, quad: id },
  };
});
