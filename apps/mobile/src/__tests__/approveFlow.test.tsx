import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ProjectScreen from "../app/project/[id]";
import { repo, sceneNode } from "../data/repo";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "p142" }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

describe("shot review flow (fixture repo)", () => {
  it("approve on a scene in review completes it and removes its review actions", async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ProjectScreen />
      </SafeAreaProvider>,
    );
    expect(screen.getByText("2 TO REVIEW")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("approve-0"));
    expect(repo.getSnapshot().projects.find((p) => p.id === "p142")?.runs[sceneNode(0)]?.status).toBe("completed");
    expect(screen.queryByTestId("approve-0")).toBeNull();
    expect(screen.getByText("1 TO REVIEW")).toBeTruthy();
  });

  it("revise needs a note before it can be sent", async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ProjectScreen />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByTestId("revise-1"));
    expect(screen.getByText("⊘ Write what should change")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Note for SC02"), "hold on the cat");
    await fireEvent.press(screen.getByTestId("send-revision-1"));
    expect(screen.getByText("REVISION: hold on the cat")).toBeTruthy();
    expect(screen.getByText("NONE WAITING")).toBeTruthy();
  });
});
