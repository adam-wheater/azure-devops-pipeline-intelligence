import * as React from "react";
import { PipelineStats } from "@/models/interfaces";
import { Card, Pill, SortHeader, Tone } from "./ui";
import { Sparkline } from "./Sparkline";

interface PipelineRankingTableProps {
  pipelines: PipelineStats[];
}

type SortField =
  | "name"
  | "totalRuns"
  | "totalMinutes"
  | "avgDurationMinutes"
  | "avgQueueWaitSeconds"
  | "failureRate";

const COLUMNS: { field: SortField; label: string; numeric: boolean }[] = [
  { field: "name", label: "Pipeline", numeric: false },
  { field: "totalRuns", label: "Runs", numeric: true },
  { field: "totalMinutes", label: "Total Min", numeric: true },
  { field: "avgDurationMinutes", label: "Avg Duration", numeric: true },
  { field: "avgQueueWaitSeconds", label: "Avg Queue Wait", numeric: true },
  { field: "failureRate", label: "Failure Rate", numeric: true },
];

export const failureTone = (rate: number): Tone =>
  rate > 0.3 ? "danger" : rate > 0.1 ? "warn" : "success";

export const PipelineRankingTable: React.FC<PipelineRankingTableProps> = ({ pipelines }) => {
  const [sortField, setSortField] = React.useState<SortField>("totalMinutes");
  const [sortAsc, setSortAsc] = React.useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sorted = React.useMemo(() => {
    const copy = [...pipelines];
    copy.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      let cmp: number;
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = (aVal as number) - (bVal as number);
      }
      // Tie-break on definition id so the order is total and stable.
      if (cmp === 0) cmp = a.definitionId - b.definitionId;
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [pipelines, sortField, sortAsc]);

  return (
    <Card title="Pipeline Ranking" flush>
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <SortHeader
                  key={col.field}
                  label={col.label}
                  active={sortField === col.field}
                  direction={sortAsc ? "asc" : "desc"}
                  numeric={col.numeric}
                  onClick={() => handleSort(col.field)}
                />
              ))}
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pipeline) => (
              <tr key={pipeline.definitionId}>
                <td>
                  <div className="ax-row">
                    <span style={{ fontWeight: 600 }}>{pipeline.name}</span>
                    {pipeline.isFlaky && <Pill tone="warn">FLAKY</Pill>}
                  </div>
                </td>
                <td className="ax-num">{pipeline.totalRuns}</td>
                <td className="ax-num">{pipeline.totalMinutes.toFixed(1)}</td>
                <td className="ax-num">{pipeline.avgDurationMinutes.toFixed(1)} min</td>
                <td className="ax-num">{pipeline.avgQueueWaitSeconds.toFixed(1)}s</td>
                <td className="ax-num">
                  <Pill tone={failureTone(pipeline.failureRate)}>
                    {(pipeline.failureRate * 100).toFixed(1)}%
                  </Pill>
                </td>
                <td>
                  <Sparkline data={pipeline.durationTrend} />
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="ax-muted" style={{ textAlign: "center" }}>
                  No pipeline data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
