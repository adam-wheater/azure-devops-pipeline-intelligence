import * as React from "react";
import { useTheme } from "@/utils/theme";
import { FlakyTest } from "@/models/testInterfaces";
import { Card, Pill } from "./ui";

interface FlakyTestsTableProps {
  flakyTests: FlakyTest[];
}

export const FlakyTestsTable: React.FC<FlakyTestsTableProps> = ({ flakyTests }) => {
  const theme = useTheme();

  const getResultColor = (result: "pass" | "fail" | "skip"): string => {
    switch (result) {
      case "pass":
        return theme.successText;
      case "fail":
        return theme.errorText;
      case "skip":
        return theme.textVeryMuted;
    }
  };

  return (
    <Card title="Flaky Tests" flush>
      <div className="ax-table-wrap">
        <table className="ax-table">
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Suite</th>
              <th>Pipeline</th>
              <th className="ax-num">Flaky Rate</th>
              <th>Recent Results</th>
              <th className="ax-num">Avg Duration</th>
            </tr>
          </thead>
          <tbody>
            {flakyTests.map((test) => (
              <tr key={`${test.pipelineName}\u0000${test.testName}`}>
                <td>
                  <span style={{ fontWeight: 600 }}>{test.testName}</span>
                </td>
                <td>{test.suiteName}</td>
                <td>{test.pipelineName}</td>
                <td className="ax-num">
                  <Pill tone="warn">{(test.flakyRate * 100).toFixed(1)}%</Pill>
                </td>
                <td>
                  <div
                    className="ax-row"
                    style={{ gap: 3, flexWrap: "nowrap" }}
                    aria-label={`Recent results: ${test.recentResults.join(", ")}`}
                  >
                    {test.recentResults.map((result, j) => (
                      <span
                        key={j}
                        title={result}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          display: "inline-block",
                          background: getResultColor(result),
                          opacity: 0.85,
                        }}
                      />
                    ))}
                  </div>
                </td>
                <td className="ax-num">
                  {test.avgDurationMs > 1000
                    ? `${(test.avgDurationMs / 1000).toFixed(1)}s`
                    : `${test.avgDurationMs}ms`}
                </td>
              </tr>
            ))}
            {flakyTests.length === 0 && (
              <tr>
                <td colSpan={6} className="ax-muted" style={{ textAlign: "center" }}>
                  No flaky tests detected
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
