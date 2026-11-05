import * as React from "react";
import { useTheme } from "@/utils/theme";
import { QueueAnalysis } from "@/models/interfaces";
import { Card } from "./ui";

interface QueueWaitChartProps {
  queueAnalysis: QueueAnalysis;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Sequential ramp: one hue, four steps of opacity. Index 0 is the lightest. */
const RAMP_OPACITY = [0.25, 0.5, 0.75, 1];

export const QueueWaitChart: React.FC<QueueWaitChartProps> = ({ queueAnalysis }) => {
  const theme = useTheme();

  const cellSize = 24;
  const labelWidth = 40;
  const labelHeight = 30;
  const svgWidth = labelWidth + 24 * cellSize + 10;
  const svgHeight = labelHeight + 7 * cellSize + 10;

  // Find the max value across the 7x24 heatmap for colour scaling
  const maxVal = Math.max(...queueAnalysis.heatmap.flatMap((row) => row), 1);

  const rampStep = (value: number): number => {
    const intensity = Math.min(value / maxVal, 1);
    if (intensity < 0.25) return 0;
    if (intensity < 0.5) return 1;
    if (intensity < 0.75) return 2;
    return 3;
  };

  const getCellValue = (day: number, hour: number): number => {
    return queueAnalysis.heatmap[day]?.[hour] ?? 0;
  };

  return (
    <Card
      title="Queue Wait Heatmap"
      hint="Average queue wait in seconds by day of week and hour of day"
    >
      <svg
        className="ax-chart"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ maxWidth: svgWidth, height: "auto" }}
        role="img"
        aria-label="Queue wait heatmap by day of week and hour of day"
      >
        {/* Hour labels */}
        {Array.from({ length: 24 }, (_, h) => (
          <text
            key={`h-${h}`}
            x={labelWidth + h * cellSize + cellSize / 2}
            y={labelHeight - 6}
            textAnchor="middle"
            fontSize="9"
          >
            {h}
          </text>
        ))}

        {/* Day labels and cells */}
        {DAYS.map((dayName, d) => (
          <g key={`d-${d}`}>
            <text
              x={labelWidth - 6}
              y={labelHeight + d * cellSize + cellSize / 2 + 3}
              textAnchor="end"
              fontSize="10"
            >
              {dayName}
            </text>
            {Array.from({ length: 24 }, (_, h) => {
              const value = getCellValue(d, h);
              const empty = value <= 0;
              return (
                <rect
                  key={`cell-${d}-${h}`}
                  x={labelWidth + h * cellSize}
                  y={labelHeight + d * cellSize}
                  width={cellSize - 2}
                  height={cellSize - 2}
                  rx="3"
                  fill={empty ? theme.bgSurfaceAlt : theme.accent}
                  fillOpacity={empty ? 1 : RAMP_OPACITY[rampStep(value)]}
                >
                  <title>
                    {dayName} {h}:00 - Avg wait: {value.toFixed(1)}s
                  </title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="ax-row ax-fine" style={{ marginTop: 12 }} aria-hidden="true">
        <span>Low</span>
        {RAMP_OPACITY.map((opacity) => (
          <span
            key={opacity}
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              display: "inline-block",
              background: theme.accent,
              opacity,
            }}
          />
        ))}
        <span>High</span>
      </div>
    </Card>
  );
};
