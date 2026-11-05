import * as React from "react";
import { useTheme } from "@/utils/theme";
import { Card, EmptyState } from "./ui";

interface DurationTrendChartProps {
  data: number[];
  pipelineName: string;
  width?: number;
  height?: number;
}

export const DurationTrendChart: React.FC<DurationTrendChartProps> = ({
  data,
  pipelineName,
  width = 600,
  height = 200,
}) => {
  const theme = useTheme();
  const title = `Duration Trend - ${pipelineName}`;

  if (!data || data.length < 2) {
    return (
      <Card title={title}>
        <EmptyState title="Not enough data for trend chart" />
      </Card>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = padding.left + (index / (data.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((value - min) / range) * chartHeight;
    return { x, y, value };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const yTicks = 5;
  const yLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const value = min + (range * i) / yTicks;
    const y = padding.top + chartHeight - (i / yTicks) * chartHeight;
    return { value, y };
  });

  const series = theme.chart[0];

  return (
    <Card title={title} hint="Build duration in minutes for the most recent builds">
      <svg
        className="ax-chart"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: width, height: "auto" }}
        role="img"
        aria-label={`${title}: ${data.length} builds, from ${min.toFixed(1)} to ${max.toFixed(1)} minutes`}
      >
        {yLines.map((tick, i) => (
          <g key={i}>
            <line
              className="ax-grid"
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              strokeDasharray="4,4"
            />
            <text x={padding.left - 8} y={tick.y + 4} textAnchor="end" fontSize="10">
              {tick.value.toFixed(1)}
            </text>
          </g>
        ))}

        <line
          className="ax-axis"
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={width - padding.right}
          y2={padding.top + chartHeight}
        />

        <path d={pathD} fill="none" stroke={series} strokeWidth="2" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle key={i} className="ax-point" cx={p.x} cy={p.y} r="3" fill={series}>
            <title>
              Build {i + 1}: {p.value.toFixed(1)} min
            </title>
          </circle>
        ))}

        <text x={padding.left + chartWidth / 2} y={height - 5} textAnchor="middle" fontSize="11">
          Build Number
        </text>
        <text
          x={15}
          y={padding.top + chartHeight / 2}
          textAnchor="middle"
          fontSize="11"
          transform={`rotate(-90, 15, ${padding.top + chartHeight / 2})`}
        >
          Minutes
        </text>
      </svg>
    </Card>
  );
};
