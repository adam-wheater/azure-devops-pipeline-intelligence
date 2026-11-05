import * as React from "react";
import { PipelineStats } from "@/models/interfaces";
import { Card, IconChevronRight, Pill } from "./ui";
import { failureTone } from "./PipelineRankingTable";

interface FailureAnalysisProps {
  pipelines: PipelineStats[];
}

export const FailureAnalysis: React.FC<FailureAnalysisProps> = ({ pipelines }) => {
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  const sorted = React.useMemo(
    () =>
      [...pipelines].sort((a, b) => b.failureRate - a.failureRate || a.name.localeCompare(b.name)),
    [pipelines]
  );

  return (
    <Card
      title="Failure Analysis"
      hint="Pipelines ranked by failure rate; click a row for details"
      flush
    >
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              <th>Pipeline</th>
              <th>Failure Rate</th>
              <th className="ax-num">Failed Runs</th>
              <th className="ax-num">Total Runs</th>
              <th className="ax-num">Avg Duration</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pipeline) => {
              const failedRuns = Math.round(pipeline.failureRate * pipeline.totalRuns);
              const isExpanded = expandedId === pipeline.definitionId;
              const tone = failureTone(pipeline.failureRate);

              return (
                <React.Fragment key={pipeline.definitionId}>
                  <tr
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpandedId(isExpanded ? null : pipeline.definitionId)}
                    aria-expanded={isExpanded}
                  >
                    <td>
                      <div className="ax-row" style={{ flexWrap: "nowrap" }}>
                        <span
                          className="ax-disclosure__chevron"
                          style={{
                            display: "inline-flex",
                            transform: isExpanded ? "rotate(90deg)" : undefined,
                          }}
                          aria-hidden="true"
                        >
                          <IconChevronRight />
                        </span>
                        <span style={{ fontWeight: 600 }}>{pipeline.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="ax-row" style={{ flexWrap: "nowrap" }}>
                        <div className="ax-bar" style={{ width: 60, flex: "none" }}>
                          <div
                            className={`ax-bar__fill ax-bar__fill--${tone}`}
                            style={{ width: `${Math.min(100, pipeline.failureRate * 100)}%` }}
                          />
                        </div>
                        <Pill tone={tone}>{(pipeline.failureRate * 100).toFixed(1)}%</Pill>
                      </div>
                    </td>
                    <td className="ax-num">{failedRuns}</td>
                    <td className="ax-num">{pipeline.totalRuns}</td>
                    <td className="ax-num">{pipeline.avgDurationMinutes.toFixed(1)} min</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} style={{ padding: "12px 24px" }}>
                        <dl className="ax-kv" style={{ margin: 0 }}>
                          <dt>Definition ID</dt>
                          <dd>{pipeline.definitionId}</dd>
                          <dt>Total Agent Minutes</dt>
                          <dd>{pipeline.totalMinutes.toFixed(1)}</dd>
                          <dt>Avg Queue Wait</dt>
                          <dd>{pipeline.avgQueueWaitSeconds.toFixed(1)}s</dd>
                          <dt>Flaky</dt>
                          <dd>{pipeline.isFlaky ? "Yes" : "No"}</dd>
                        </dl>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="ax-muted" style={{ textAlign: "center" }}>
                  No failure data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
