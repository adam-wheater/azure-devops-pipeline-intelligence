import * as React from "react";
import { useTheme } from "@/utils/theme";
import { TestRunSummary } from "@/models/testInterfaces";
import { Card, Pill, Tone } from "./ui";

interface TestRunHistoryProps {
  runs: TestRunSummary[];
}

const formatDate = (date: Date): string =>
  new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const passRateTone = (rate: number): Tone =>
  rate >= 0.95 ? "success" : rate >= 0.8 ? "warn" : "danger";

export const TestRunHistory: React.FC<TestRunHistoryProps> = ({ runs }) => {
  const theme = useTheme();
  const displayRuns = runs.slice(0, 50);

  return (
    <Card title="Test Run History" hint="The 50 most recent test runs" flush>
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              <th>Run Name</th>
              <th>Pipeline</th>
              <th>Date</th>
              <th className="ax-num">Total</th>
              <th className="ax-num">Passed</th>
              <th className="ax-num">Failed</th>
              <th className="ax-num">Skipped</th>
              <th className="ax-num">Pass Rate</th>
            </tr>
          </thead>
          <tbody>
            {displayRuns.map((run) => (
              <tr key={run.id}>
                <td>{run.name}</td>
                <td>{run.pipelineName}</td>
                <td style={{ whiteSpace: "nowrap" }}>{formatDate(run.completedDate)}</td>
                <td className="ax-num">{run.totalTests}</td>
                <td className="ax-num" style={{ color: theme.successText }}>
                  {run.passedTests}
                </td>
                <td
                  className="ax-num"
                  style={{ color: run.failedTests > 0 ? theme.errorText : undefined }}
                >
                  {run.failedTests}
                </td>
                <td className="ax-num ax-muted">{run.skippedTests}</td>
                <td className="ax-num">
                  <Pill tone={passRateTone(run.passRate)}>{(run.passRate * 100).toFixed(1)}%</Pill>
                </td>
              </tr>
            ))}
            {displayRuns.length === 0 && (
              <tr>
                <td colSpan={8} className="ax-muted" style={{ textAlign: "center" }}>
                  No test run data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
