import { render, screen } from "@testing-library/react-native";
import { JOB_STATUSES } from "@feista/core";
import { STATUS_MARKS, StatusMark } from "../components/StatusMark";

describe("StatusMark mapping", () => {
  it("covers every JobStatus from core", () => {
    expect(Object.keys(STATUS_MARKS).sort()).toEqual([...JOB_STATUSES].sort());
  });
  it("gives each status a unique label and a unique shape (never colour alone)", () => {
    const specs = JOB_STATUSES.map((s) => STATUS_MARKS[s]);
    expect(new Set(specs.map((s) => s.label)).size).toBe(JOB_STATUSES.length);
    expect(new Set(specs.map((s) => s.shape)).size).toBe(JOB_STATUSES.length);
  });
  it("renders the printed label and a spoken description", async () => {
    await render(<StatusMark status="failed" />);
    expect(screen.getByText("FAILED")).toBeTruthy();
    expect(screen.getByLabelText("Status: Failed")).toBeTruthy();
  });
});
