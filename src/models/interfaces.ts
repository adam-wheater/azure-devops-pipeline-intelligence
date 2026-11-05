export interface PipelineStats {
  definitionId: number;
  name: string;
  totalRuns: number;
  totalMinutes: number;
  avgDurationMinutes: number;
  avgQueueWaitSeconds: number;
  failureRate: number;
  durationTrend: number[];
  isFlaky: boolean;
}

export interface StageBreakdown {
  stageName: string;
  avgDurationMinutes: number;
  failureRate: number;
  totalRuns: number;
}

export interface TriggerStats {
  userId: string;
  displayName: string;
  buildCount: number;
  failedCount: number;
}

export interface QueueAnalysis {
  hourOfDay: number[];
  dayOfWeek: number[];
  heatmap: number[][];
}

export interface PipelineAnalyticsData {
  pipelines: PipelineStats[];
  totalAgentMinutes: number;
  mostExpensivePipeline: string;
  avgQueueWaitSeconds: number;
  triggerStats: TriggerStats[];
  queueAnalysis: QueueAnalysis;
}

export interface PipelineSettings {
  timePeriodDays: number;
  excludedDefinitionIds: number[];
  costPerMinute: number;
  queueWaitWarningSeconds: number;
}

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  timePeriodDays: 30,
  excludedDefinitionIds: [],
  costPerMinute: 0,
  queueWaitWarningSeconds: 300,
};
