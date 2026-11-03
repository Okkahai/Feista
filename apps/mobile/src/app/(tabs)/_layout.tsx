import { Tabs } from "expo-router";
import { TabBar } from "../../components/TabBar";
import { color } from "../../theme/tokens";

const screenOptions = { headerShown: false, sceneStyle: { backgroundColor: color.bg } } as const;
const renderTabBar = (props: Parameters<typeof TabBar>[0]) => <TabBar {...props} />;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={screenOptions} tabBar={renderTabBar}>
      <Tabs.Screen name="index" options={{ title: "Studio" }} />
      <Tabs.Screen name="create" options={{ title: "Create" }} />
      <Tabs.Screen name="projects" options={{ title: "Projects" }} />
      <Tabs.Screen name="connections" options={{ title: "Connect" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
