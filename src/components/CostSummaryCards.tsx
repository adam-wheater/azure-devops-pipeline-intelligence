import * as React from "react";
import { PipelineAnalyticsData } from "@/models/interfaces";
import { Metric } from "./ui";

interface CostSummaryCardsProps {
  data: PipelineAnalyticsData;
  costPerMinute: number;
}

const TextValue: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="ax-truncate" style={{ fontSize: 20 }} title={String(children)}>
    {children}
  </span>
);

export const CostSummaryCards: React.FC<CostSummaryCardsProps> = ({ data, costPerMinute }) => (
  <div className="ax-metrics">
    <Metric
      label="Total Agent Minutes"
      value={data.totalAgentMinutes.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      hint={
        costPerMinute > 0 ? `$${(data.totalAgentMinutes * costPerMinute).toFixed(2)}` : undefined
      }
      tone="accent"
    />
    <Metric
      label="Most Expensive Pipeline"
      value={<TextValue>{data.mostExpensivePipeline}</TextValue>}
      tone="warn"
    />
    <Metric
      label="Avg Queue Wait"
      value={`${data.avgQueueWaitSeconds.toFixed(1)}s`}
      tone={data.avgQueueWaitSeconds > 300 ? "danger" : "success"}
    />
  </div>
);
