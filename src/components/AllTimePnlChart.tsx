"use client";

import { useMemo, useState } from "react";

type PnlWindow = "day" | "month" | "year";

interface AllTimePnlChartProps {
  title?: string;
  executions: Array<{ timestamp: number; pnlUsd: number }>;
}

const CHART_WIDTH = 420;
const CHART_HEIGHT = 104;
const CHART_PADDING = 8;

function formatSignedCurrency(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}$${value.toFixed(2)}`;
}

function buildChart(points: Array<{ cumulativePnlUsd: number }>): {
  path: string;
  areaPath: string;
  baselineY: number;
  markerX: number | null;
  markerY: number | null;
} {
  const xMin = CHART_PADDING;
  const xMax = CHART_WIDTH - CHART_PADDING;
  const yMin = CHART_PADDING;
  const yMax = CHART_HEIGHT - CHART_PADDING;
  const width = xMax - xMin;
  const height = yMax - yMin;

  if (points.length === 0) {
    const y = yMin + height / 2;
    const path = `M ${xMin} ${y} L ${xMax} ${y}`;
    const areaPath = `M ${xMin} ${y} L ${xMax} ${y} L ${xMax} ${yMax} L ${xMin} ${yMax} Z`;
    return { path, areaPath, baselineY: y, markerX: null, markerY: null };
  }

  const values = points.map((point) => point.cumulativePnlUsd);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);
  const span = maxValue - minValue || 1;

  const xForIndex = (index: number): number => xMin + (index / Math.max(points.length - 1, 1)) * width;
  const yForValue = (value: number): number => yMin + ((maxValue - value) / span) * height;

  let firstX = xForIndex(0);
  let firstY = yForValue(values[0]);
  let lastX = xForIndex(values.length - 1);
  let lastY = yForValue(values[values.length - 1]);
  let path = `M ${firstX.toFixed(2)} ${firstY.toFixed(2)}`;

  if (points.length === 1) {
    firstX = xMin;
    lastX = xMax;
    firstY = yForValue(values[0]);
    lastY = firstY;
    path = `M ${firstX.toFixed(2)} ${firstY.toFixed(2)} L ${lastX.toFixed(2)} ${lastY.toFixed(2)}`;
  } else {
    for (let index = 1; index < values.length; index += 1) {
      const x = xForIndex(index);
      const y = yForValue(values[index]);
      path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
  }

  const areaPath = `${path} L ${lastX.toFixed(2)} ${yMax.toFixed(2)} L ${firstX.toFixed(2)} ${yMax.toFixed(2)} Z`;

  return {
    path,
    areaPath,
    baselineY: yForValue(0),
    markerX: points.length === 1 ? xMin + width / 2 : lastX,
    markerY: points.length === 1 ? firstY : lastY
  };
}

function cutoffForWindow(window: PnlWindow): number {
  const now = Date.now();
  if (window === "day") {
    return now - 1000 * 60 * 60 * 24;
  }
  if (window === "month") {
    return now - 1000 * 60 * 60 * 24 * 30;
  }
  return now - 1000 * 60 * 60 * 24 * 365;
}

export function AllTimePnlChart({ title = "Profit & Loss", executions }: AllTimePnlChartProps) {
  const [window, setWindow] = useState<PnlWindow>("year");

  const summary = useMemo(() => {
    const cutoff = cutoffForWindow(window);
    const filtered = [...executions]
      .filter((item) => item.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);

    let cumulative = 0;
    let wins = 0;
    let losses = 0;
    const points = filtered.map((item) => {
      cumulative += item.pnlUsd;
      if (item.pnlUsd > 0) {
        wins += 1;
      } else if (item.pnlUsd < 0) {
        losses += 1;
      }
      return { cumulativePnlUsd: cumulative };
    });

    return {
      totalPnlUsd: cumulative,
      closedExecutions: filtered.length,
      winningExecutions: wins,
      losingExecutions: losses,
      points
    };
  }, [executions, window]);

  const chart = buildChart(summary.points);
  const trendClass = summary.totalPnlUsd >= 0 ? "good" : "bad";

  return (
    <div className="alltime-pnl-card">
      <div className="row">
        <div className="small">
          {title} ({window === "day" ? "Day" : window === "month" ? "Month" : "Year"})
        </div>
        <strong className={trendClass}>{formatSignedCurrency(summary.totalPnlUsd)}</strong>
      </div>

      <div className="pnl-filter-row">
        <button
          type="button"
          className={window === "day" ? "pnl-filter-btn active" : "pnl-filter-btn"}
          onClick={() => setWindow("day")}
        >
          Day
        </button>
        <button
          type="button"
          className={window === "month" ? "pnl-filter-btn active" : "pnl-filter-btn"}
          onClick={() => setWindow("month")}
        >
          Month
        </button>
        <button
          type="button"
          className={window === "year" ? "pnl-filter-btn active" : "pnl-filter-btn"}
          onClick={() => setWindow("year")}
        >
          Year
        </button>
      </div>

      <svg
        className="alltime-pnl-svg"
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="All-time profit and loss chart"
      >
        <line
          x1={CHART_PADDING}
          x2={CHART_WIDTH - CHART_PADDING}
          y1={chart.baselineY}
          y2={chart.baselineY}
          className="alltime-pnl-baseline"
        />
        <path d={chart.areaPath} className="alltime-pnl-area" />
        <path d={chart.path} className="alltime-pnl-line" />
        {chart.markerX !== null && chart.markerY !== null ? (
          <circle cx={chart.markerX} cy={chart.markerY} r={3.2} className="alltime-pnl-point" />
        ) : null}
      </svg>

      <div className="row small">
        <span>Closed {summary.closedExecutions}</span>
        <span className="good">Win {summary.winningExecutions}</span>
        <span className="bad">Loss {summary.losingExecutions}</span>
      </div>
    </div>
  );
}
