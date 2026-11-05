export interface TestRunSummary {
  id: number;
  name: string;
  pipelineName: string;
  startDate: Date;
  completedDate: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  passRate: number;
  durationSeconds: number;
}

export interface FlakyTest {
  testName: string;
  suiteName: string;
  flakyRate: number;
  recentResults: ("pass" | "fail" | "skip")[];
  pipelineName: string;
  avgDurationMs: number;
}

export interface TestHealthData {
  totalRuns: number;
  overallPassRate: number;
  totalTestsExecuted: number;
  flakyTests: FlakyTest[];
  slowestTests: {
    testName: string;
    suiteName: string;
    avgDurationMs: number;
    maxDurationMs: number;
    runCount: number;
  }[];
  runHistory: TestRunSummary[];
  pipelineTestSummary: {
    pipelineName: string;
    passRate: number;
    testCount: number;
    flakyCount: number;
  }[];
  testCountTrend: { week: string; count: number; passRate: number }[];
}

export interface TestHealthSettings {
  flakyWindowSize: number;
  slowTestThresholdMs: number;
  timePeriodDays: number;
}

export const DEFAULT_TEST_SETTINGS: TestHealthSettings = {
  flakyWindowSize: 10,
  slowTestThresholdMs: 30000,
  timePeriodDays: 30,
};
