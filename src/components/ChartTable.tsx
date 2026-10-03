import type { ChartSpec } from "../../shared/contracts";

/** The data behind a chart, so nothing is colour- or hover-only. */
export function ChartTable({ chart }: { chart: ChartSpec }) {
  return (
    <details className="chart-table">
      <summary>Show data</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{chart.unit}</th>
            {chart.series.map((s) => (
              <th key={s.key} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.categories.map((cat, i) => (
            <tr key={cat}>
              <th scope="row">{cat}</th>
              {chart.series.map((s) => (
                <td key={s.key}>{s.values[i] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
