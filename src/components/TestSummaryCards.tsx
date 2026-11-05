import * as React from "react";
import { TestHealthData } from "@/models/testInterfaces";
import { Metric } from "./ui";

interface TestSummaryCardsProps {
  data: TestHealthData;
}

export const TestSummaryCards: React.FC<TestSummaryCardsProps> = ({ data }) => {
  const slowestSuite = data.slowestTests.length > 0 ? data.slowestTests[0].suiteName : "N/A";

  return (
    <div className="ax-metrics">
      <Metric label="Total Test Runs" value={data.totalRuns.toLocaleString()} tone="accent" />
      <Metric
        label="Overall Pass Rate"
        value={`${(data.overallPassRate * 100).toFixed(1)}%`}
        tone={data.overallPassRate >= 0.9 ? "success" : "warn"}
      />
      <Metric label="Total Tests Executed" value={data.totalTestsExecuted.toLocaleString()} />
      <Metric
        label="Flaky Tests"
        value={data.flakyTests.length.toString()}
        tone={data.flakyTests.length > 0 ? "warn" : "success"}
      />
      <Metric
        label="Slowest Suite"
        value={
          <span className="ax-truncate" style={{ fontSize: 20 }} title={slowestSuite}>
            {slowestSuite}
          </span>
        }
      />
    </div>
  );
};
