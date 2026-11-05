import * as React from "react";
import { TriggerStats } from "@/models/interfaces";
import { Card, Pill } from "./ui";
import { failureTone } from "./PipelineRankingTable";

interface TriggerAnalysisProps {
  triggerStats: TriggerStats[];
}

export const TriggerAnalysis: React.FC<TriggerAnalysisProps> = ({ triggerStats }) => (
  <Card title="Trigger Analysis" hint="Who triggers builds and how often they fail" flush>
    <div className="ax-table-wrap">
      <table className="ax-table">
        <thead>
          <tr>
            <th>User</th>
            <th className="ax-num">Build Count</th>
            <th className="ax-num">Failed</th>
            <th className="ax-num">Failure Rate</th>
          </tr>
        </thead>
        <tbody>
          {triggerStats.map((user) => {
            const failureRate = user.buildCount > 0 ? user.failedCount / user.buildCount : 0;
            return (
              <tr key={user.userId}>
                <td>{user.displayName}</td>
                <td className="ax-num">{user.buildCount}</td>
                <td className="ax-num">{user.failedCount}</td>
                <td className="ax-num">
                  <Pill tone={failureTone(failureRate)}>{(failureRate * 100).toFixed(1)}%</Pill>
                </td>
              </tr>
            );
          })}
          {triggerStats.length === 0 && (
            <tr>
              <td colSpan={4} className="ax-muted" style={{ textAlign: "center" }}>
                No trigger data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Card>
);
