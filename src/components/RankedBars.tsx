/**
 * Horizontal bar list for one series with long category names (e.g. eval
 * check ids): label left, bar with a 4px rounded data-end, value at the end.
 */
import type { ChartSpec } from "../../shared/contracts";
import { chartColor } from "../lib/chart";
import { ChartTable } from "./ChartTable";

export function RankedBars({ chart }: { chart: ChartSpec }) {
  const series = chart.series[0];
  if (!series) return null;
  const rows = chart.categories.map((label, i) => ({ label, value: series.values[i] ?? 0 })).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="chart" aria-label={chart.title}>
      <figcaption className="chart-head">
        <span className="chart-title">{chart.title}</span>
        {chart.sample ? <span className="badge badge-sample">Sample data</span> : null}
        <span className="chart-sub">{chart.subtitle}</span>
      </figcaption>
      <ol className="ranked">
        {rows.map((r) => (
          <li key={r.label} className="ranked-row">
            <span className="ranked-label mono" title={r.label}>{r.label}</span>
            <span className="ranked-track" aria-hidden="true">
              <span className="ranked-bar" style={{ width: `${(r.value / max) * 100}%`, background: chartColor(series.color) }} />
            </span>
            <span className="ranked-value">
              {r.value}
              <span className="visually-hidden"> {chart.unit}</span>
            </span>
          </li>
        ))}
      </ol>
      <ChartTable chart={chart} />
    </figure>
  );
}
