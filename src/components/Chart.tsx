/**
 * Column chart (grouped or stacked) drawn as plain SVG. Specs follow the
 * dataviz rules: ≤24px bars with a 4px rounded data-end and square baseline,
 * 2px surface gaps, hairline grid, legend for ≥2 series, per-column hover
 * tooltip, and a data table so nothing is colour- or hover-only.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChartSpec } from "../../shared/contracts";
import { chartColor, niceTicks, stackedTop } from "../lib/chart";
import { ChartTable } from "./ChartTable";
import { RankedBars } from "./RankedBars";

interface ChartProps {
  chart: ChartSpec;
}

const HEIGHT = 200;
const PAD = { top: 18, right: 8, bottom: 26, left: 32 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
const MIN_LABEL_SPACE = 46;

/** Bar with a rounded top (data-end) and a square baseline. */
function barPath(x: number, y: number, w: number, h: number, rounded: boolean): string {
  if (h <= 0 || w <= 0) return "";
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(560);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function Chart({ chart }: ChartProps) {
  return chart.kind === "ranked" ? <RankedBars chart={chart} /> : <ColumnChart chart={chart} />;
}

function ColumnChart({ chart }: ChartProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const stacked = chart.kind === "stacked";

  const totals = useMemo(() => chart.categories.map((_, i) => chart.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)), [chart]);
  const maxValue = stacked ? Math.max(0, ...totals) : Math.max(0, ...chart.series.flatMap((s) => s.values));
  const ticks = niceTicks(maxValue);
  const top = ticks.at(-1) || 1;

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / chart.categories.length;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_SPACE / band));

  const groupW = stacked ? Math.min(MAX_BAR, band * 0.6) : Math.min(chart.series.length * MAX_BAR + (chart.series.length - 1) * GAP, band * 0.72);
  const barW = stacked ? groupW : Math.max(2, (groupW - (chart.series.length - 1) * GAP) / chart.series.length);
  const peak = totals.indexOf(Math.max(...totals));
  const summary = `${chart.title}. ${chart.series.map((s) => `${s.name} ${s.values.reduce((a, v) => a + v, 0)}`).join(", ")} ${chart.unit} in total.`;

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption className="chart-head">
        <span id={titleId} className="chart-title">
          {chart.title}
        </span>
        {chart.sample ? <span className="badge badge-sample">Sample data</span> : null}
        <span className="chart-sub">{chart.subtitle}</span>
      </figcaption>

      {chart.series.length > 1 ? (
        <ul className="chart-legend" aria-label="Legend">
          {chart.series.map((s) => (
            <li key={s.key}>
              <span className="chart-swatch" style={{ background: chartColor(s.color) }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="chart-plot" ref={wrapRef} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={summary}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "chart-baseline" : "chart-grid"} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">
                {t}
              </text>
            </g>
          ))}

          {chart.categories.map((cat, i) => {
            const cx = PAD.left + band * i + band / 2;
            const x0 = cx - groupW / 2;
            const topKey = stackedTop(chart.series, i);
            let acc = 0;
            return (
              <g key={cat}>
                {hover === i ? <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} className="chart-hover-band" /> : null}
                {chart.series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  if (!v) return null;
                  if (stacked) {
                    const yTop = y(acc + v);
                    const h = y(acc) - yTop - (acc > 0 ? GAP : 0);
                    acc += v;
                    return <path key={s.key} d={barPath(x0, yTop, barW, h, s.key === topKey)} fill={chartColor(s.color)} />;
                  }
                  const bx = x0 + si * (barW + GAP);
                  return <path key={s.key} d={barPath(bx, y(v), barW, y(0) - y(v), true)} fill={chartColor(s.color)} />;
                })}
                {i === peak && totals[i] > 0 ? (
                  <text x={cx} y={y(stacked ? totals[i] : Math.max(...chart.series.map((s) => s.values[i] ?? 0))) - 6} textAnchor="middle" className="chart-value">
                    {stacked ? totals[i] : Math.max(...chart.series.map((s) => s.values[i] ?? 0))}
                  </text>
                ) : null}
                {i % labelEvery === 0 || i === chart.categories.length - 1 ? (
                  <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="chart-tick">
                    {cat}
                  </text>
                ) : null}
                {/* Hit target: the whole column, larger than the marks. */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={-1}
                />
              </g>
            );
          })}
        </svg>

        {hover !== null ? (
          <div
            className="chart-tooltip"
            role="status"
            style={{ left: Math.min(Math.max(PAD.left + band * hover + band / 2, 90), width - 90) }}
          >
            <strong>{chart.categories[hover]}</strong>
            {chart.series.map((s) => (
              <span key={s.key}>
                <span className="chart-swatch" style={{ background: chartColor(s.color) }} aria-hidden="true" />
                {s.name}
                <b>{s.values[hover] ?? 0}</b>
              </span>
            ))}
            {stacked && chart.series.length > 1 ? (
              <span className="chart-tooltip-total">
                Total<b>{totals[hover]}</b>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <ChartTable chart={chart} />
    </figure>
  );
}
