import * as React from "react";
import { useTheme } from "@/utils/theme";
import { Card, EmptyState } from "./ui";

interface TestTrendChartProps {
  data: { week: string; count: number; passRate: number }[];
  width?: number;
  height?: number;
}

export const TestTrendChart: React.FC<TestTrendChartProps> = ({
  data,
  width = 700,
  height = 250,
}) => {
  const theme = useTheme();
  const title = "Test Count & Pass Rate Trend";

  if (!data || data.length < 2) {
    return (
      <Card title={title}>
        <EmptyState title="Not enough data for trend chart" />
      </Card>
    );
  }

  const padding = { top: 20, right: 60, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const countPoints = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (d.count / maxCount) * chartHeight;
    return { x, y };
  });

  const ratePoints = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - d.passRate * chartHeight;
    return { x, y };
  });

  const countPath = countPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const ratePath = ratePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const countColor = theme.chart[0];
  const rateColor = theme.successText;
  const labelStep = data.length > 10 ? Math.ceil(data.length / 8) : 1;

  return (
    <Card title={title} hint="Weekly test count (solid) and pass rate (dashed)">
      <svg
        className="ax-chart"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: width, height: "auto" }}
        role="img"
        aria-label={`${title} over ${data.length} weeks`}
      >
        {/* Y-axis grid lines */}
        {Array.from({ length: 5 }, (_, i) => {
          const y = padding.top + (i / 4) * chartHeight;
          const countLabel = Math.round(maxCount * (1 - i / 4));
          const rateLabel = `${Math.round((1 - i / 4) * 100)}%`;
          return (
            <g key={i}>
              <line
                className="ax-grid"
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                strokeDasharray="4,4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                style={{ fill: countColor }}
              >
                {countLabel}
              </text>
              <text
                x={width - padding.right + 8}
                y={y + 4}
                textAnchor="start"
                fontSize="10"
                style={{ fill: rateColor }}
              >
                {rateLabel}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % labelStep !== 0) return null;
          const x = padding.left + (i / (data.length - 1)) * chartWidth;
          return (
            <text
              key={d.week}
              x={x}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              fontSize="9"
              transform={`rotate(-30, ${x}, ${height - padding.bottom + 20})`}
            >
              {d.week}
            </text>
          );
        })}

        {/* Count line */}
        <path d={countPath} fill="none" stroke={countColor} strokeWidth="2" />

        {/* Pass rate line */}
        <path d={ratePath} fill="none" stroke={rateColor} strokeWidth="2" strokeDasharray="6,3" />

        {/* Legend */}
        <line
          x1={padding.left}
          y1={height - 8}
          x2={padding.left + 20}
          y2={height - 8}
          stroke={countColor}
          strokeWidth="2"
        />
        <text x={padding.left + 25} y={height - 4} fontSize="10">
          Test Count
        </text>
        <line
          x1={padding.left + 100}
          y1={height - 8}
          x2={padding.left + 120}
          y2={height - 8}
          stroke={rateColor}
          strokeWidth="2"
          strokeDasharray="6,3"
        />
        <text x={padding.left + 125} y={height - 4} fontSize="10">
          Pass Rate
        </text>
      </svg>
    </Card>
  );
};
