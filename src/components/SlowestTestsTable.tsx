import * as React from "react";
import { Card, Pill } from "./ui";

interface SlowTest {
  testName: string;
  suiteName: string;
  avgDurationMs: number;
  maxDurationMs: number;
  runCount: number;
}

interface SlowestTestsTableProps {
  tests: SlowTest[];
}

const formatDuration = (ms: number): string => {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(1)} min`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
};

export const SlowestTestsTable: React.FC<SlowestTestsTableProps> = ({ tests }) => {
  const topTests = tests.slice(0, 20);

  return (
    <Card title="Slowest Tests (Top 20)" flush>
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              <th className="ax-num">#</th>
              <th>Test Name</th>
              <th>Suite</th>
              <th className="ax-num">Avg Duration</th>
              <th className="ax-num">Max Duration</th>
              <th className="ax-num">Run Count</th>
            </tr>
          </thead>
          <tbody>
            {topTests.map((test, i) => (
              <tr key={`${test.suiteName}\u0000${test.testName}`}>
                <td className="ax-num ax-muted">{i + 1}</td>
                <td>
                  <span style={{ fontWeight: 600 }}>{test.testName}</span>
                </td>
                <td>{test.suiteName}</td>
                <td className="ax-num">
                  <Pill tone="warn">{formatDuration(test.avgDurationMs)}</Pill>
                </td>
                <td className="ax-num">{formatDuration(test.maxDurationMs)}</td>
                <td className="ax-num">{test.runCount}</td>
              </tr>
            ))}
            {topTests.length === 0 && (
              <tr>
                <td colSpan={6} className="ax-muted" style={{ textAlign: "center" }}>
                  No slow tests found above threshold
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
