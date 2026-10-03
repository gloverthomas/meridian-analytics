import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ChartSpec } from "../../shared/contracts";
import { niceTicks, sanitizeChart, stackedTop } from "../lib/chart";
import { Chart } from "./Chart";

const grouped: ChartSpec = {
  id: "prs_per_day",
  kind: "grouped",
  title: "PRs merged per day",
  subtitle: "Last 3 days · GitHub",
  categories: ["Wed 23", "Thu 24", "Fri 25"],
  series: [
    { key: "core", name: "Core", color: "series1", values: [0, 0, 6] },
    { key: "rep", name: "Reporting", color: "series2", values: [0, 2, 6] },
  ],
  unit: "PRs",
  sample: false,
};

describe("Chart", () => {
  it("renders title, legend, an accessible summary and a data table", async () => {
    render(<Chart chart={grouped} />);
    expect(screen.getByText("PRs merged per day")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Legend" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Core", "Reporting"]);
    expect(screen.getByRole("img")).toHaveAccessibleName(/Core 6, Reporting 8 PRs in total/);
    await userEvent.click(screen.getByText("Show data"));
    const rows = within(screen.getByRole("table")).getAllByRole("row").map((r) => r.textContent);
    expect(rows).toEqual(["PRsCoreReporting", "Wed 2300", "Thu 2402", "Fri 2566"]);
    expect(screen.queryByText("Sample data")).toBeNull();
  });

  it("shows a per-column tooltip on hover, with a total for stacked charts", () => {
    const { container } = render(<Chart chart={{ ...grouped, kind: "stacked", sample: true }} />);
    expect(screen.getByText("Sample data")).toBeInTheDocument();
    const hitTargets = container.querySelectorAll('rect[fill="transparent"]');
    fireEvent.mouseEnter(hitTargets[2]);
    const tip = screen.getByRole("status");
    expect(tip).toHaveTextContent("Fri 25");
    expect(tip).toHaveTextContent("Total12");
    fireEvent.mouseLeave(container.querySelector(".chart-plot")!);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("omits the legend for a single series", () => {
    render(<Chart chart={{ ...grouped, series: [grouped.series[0]] }} />);
    expect(screen.queryByRole("list", { name: "Legend" })).toBeNull();
  });
});

describe("chart helpers", () => {
  it("makes clean integer ticks", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(6)).toEqual([0, 2, 4, 6]);
    expect(niceTicks(19)).toEqual([0, 10, 20]);
    expect(niceTicks(1)).toEqual([0, 1]);
  });

  it("finds the top stacked segment", () => {
    expect(stackedTop(grouped.series, 1)).toBe("rep");
    expect(stackedTop(grouped.series, 0)).toBeNull();
  });

  it("rejects malformed charts from storage", () => {
    expect(sanitizeChart(grouped)).toEqual(grouped);
    expect(sanitizeChart({ ...grouped, kind: "pie" })).toBeNull();
    expect(sanitizeChart({ ...grouped, series: [{ ...grouped.series[0], color: "javascript:alert(1)" }] })).toBeNull();
    expect(sanitizeChart({ ...grouped, series: [{ ...grouped.series[0], values: [1, 2] }] })).toBeNull();
    expect(sanitizeChart({ ...grouped, series: [{ ...grouped.series[0], values: [1, NaN, 2] }] })).toBeNull();
    expect(sanitizeChart({ ...grouped, categories: [] })).toBeNull();
    expect(sanitizeChart("chart")).toBeNull();
  });
});
