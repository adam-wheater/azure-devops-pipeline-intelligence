import { getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { TestRestClient, TestRun } from "azure-devops-extension-api/Test";
import {
  TestRunSummary,
  FlakyTest,
  TestHealthData,
  TestHealthSettings,
} from "@/models/testInterfaces";

interface TestResultRecord {
  testCaseTitle: string;
  automatedTestName: string;
  automatedTestStorage: string;
  outcome: string;
  durationInMs: number;
  runId: number;
  pipelineName: string;
  completedDate: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** queryTestRuns accepts at most a 7-day span and 100 runs per page. */
const RUN_QUERY_SPAN_DAYS = 7;
const RUN_PAGE_SIZE = 100;
/** Per 7-day span (100 x 100 = 10,000 runs) so a bad continuation token can't loop forever. */
const MAX_RUN_PAGES = 100;
/** Build ids per getBuilds call, to keep the query string short. */
const BUILD_ID_BATCH = 100;
const RESULT_PAGE_SIZE = 1000;
/** 20 x 1,000 = 20,000 results per run. */
const MAX_RESULT_PAGES = 20;

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.message === "Aborted" || err.name === "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Aborted");
}

/**
 * Walk a skip/top paginated endpoint. Stops on the first short (or empty)
 * page, after `maxPages` pages, or as soon as `signal` is aborted — checked
 * both before each request and after it resolves, so a cancel never lets a
 * late page through.
 */
export async function fetchAllPages<T>(
  fetchPage: (skip: number, top: number) => Promise<T[]>,
  pageSize: number,
  maxPages: number,
  signal?: AbortSignal
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    throwIfAborted(signal);
    const batch = (await fetchPage(page * pageSize, pageSize)) ?? [];
    throwIfAborted(signal);
    items.push(...batch);
    if (batch.length < pageSize) break;
  }
  return items;
}

/**
 * Every test run updated between `since` and `until`.
 *
 * Uses queryTestRuns, the only runs endpoint that filters by date. The older
 * getTestRuns lists from the oldest run up, so in a project with any history its
 * capped pages never reached the analysis window and Test Health came back empty.
 * The query takes at most a 7-day span, so the window is walked in 7-day slices,
 * newest first, following each slice's continuation token.
 */
export async function fetchRunsSince(
  testClient: TestRestClient,
  projectName: string,
  since: Date,
  until: Date,
  signal?: AbortSignal
): Promise<TestRun[]> {
  const runs = new Map<number, TestRun>();
  for (let end = until; end.getTime() > since.getTime(); ) {
    const start = new Date(Math.max(since.getTime(), end.getTime() - RUN_QUERY_SPAN_DAYS * DAY_MS));
    let continuationToken: string | undefined;
    for (let page = 0; page < MAX_RUN_PAGES; page++) {
      throwIfAborted(signal);
      const batch = await testClient.queryTestRuns(
        projectName,
        start,
        end,
        // state, planIds, isAutomated, publishContext, buildIds, buildDefIds,
        // branchName, releaseIds, releaseDefIds, releaseEnvIds, releaseEnvDefIds,
        // runTitle: no filter
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        RUN_PAGE_SIZE,
        continuationToken
      );
      throwIfAborted(signal);
      // Slices share their boundary instant, so a run can come back twice.
      for (const run of batch ?? []) runs.set(run.id, run);
      continuationToken = batch?.continuationToken || undefined;
      if (!continuationToken) break;
    }
    end = start;
  }
  return Array.from(runs.values());
}

/**
 * Pipeline (definition) name for each build id. A test run only carries its
 * build's id: BuildConfiguration has no definition name, which is why every
 * pipeline used to be listed under its test run's title instead.
 */
export async function fetchPipelineNames(
  buildClient: BuildRestClient,
  projectName: string,
  buildIds: number[],
  signal?: AbortSignal
): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (let i = 0; i < buildIds.length; i += BUILD_ID_BATCH) {
    throwIfAborted(signal);
    const builds = await buildClient.getBuilds(
      projectName,
      // definitions .. branchName: no filter
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      buildIds.slice(i, i + BUILD_ID_BATCH)
    );
    throwIfAborted(signal);
    for (const build of builds ?? []) {
      if (build.definition?.name) names.set(build.id, build.definition.name);
    }
  }
  return names;
}

/** The id of the build that published a run, or undefined for a manual run. */
function buildIdOf(run: TestRun): number | undefined {
  const id = Number(run.build?.id ?? run.buildConfiguration?.id);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

/** YYYY-MM-DD from local date components (no UTC conversion). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export class TestHealthService {
  async fetchTestHealth(
    projectName: string,
    settings: TestHealthSettings,
    onProgress?: (message: string, percent: number) => void,
    signal?: AbortSignal
  ): Promise<TestHealthData> {
    const testClient = getClient(TestRestClient);

    onProgress?.("Fetching test runs...", 5);
    if (signal?.aborted) throw new Error("Aborted");

    const minDate = new Date();
    minDate.setDate(minDate.getDate() - settings.timePeriodDays);

    const runs = await fetchRunsSince(testClient, projectName, minDate, new Date(), signal);

    if (signal?.aborted) throw new Error("Aborted");
    onProgress?.("Processing test runs...", 20);

    const filteredRuns = runs.filter((r: any) => {
      const completed = r.completedDate ? new Date(r.completedDate) : null;
      return completed && completed >= minDate;
    });

    const buildIds = Array.from(
      new Set(filteredRuns.map(buildIdOf).filter((id): id is number => id !== undefined))
    );
    let pipelineNames = new Map<number, string>();
    try {
      pipelineNames = await fetchPipelineNames(
        getClient(BuildRestClient),
        projectName,
        buildIds,
        signal
      );
    } catch (err) {
      // Names are a nicety: without them a run is listed under its own title.
      if (isAbortError(err)) throw err;
    }
    const pipelineNameOf = (run: TestRun): string => {
      const id = buildIdOf(run);
      return (id !== undefined ? pipelineNames.get(id) : undefined) ?? run.name ?? "Unknown";
    };

    const runSummaries: TestRunSummary[] = filteredRuns.map((r: any) => {
      const totalTests = r.totalTests ?? 0;
      const passedTests = r.passedTests ?? 0;
      const failedTests = (r.unanalyzedTests ?? 0) + (r.failedTests ?? 0);
      const skippedTests = totalTests - passedTests - failedTests;
      const startDate = new Date(r.startedDate ?? r.createdDate);
      const completedDate = new Date(r.completedDate);
      const durationSeconds = (completedDate.getTime() - startDate.getTime()) / 1000;

      return {
        id: r.id,
        name: r.name ?? "Unknown",
        pipelineName: pipelineNameOf(r),
        startDate,
        completedDate,
        totalTests,
        passedTests,
        failedTests: Math.max(0, failedTests),
        skippedTests: Math.max(0, skippedTests),
        passRate: totalTests > 0 ? passedTests / totalTests : 0,
        durationSeconds: Math.max(0, durationSeconds),
      };
    });

    onProgress?.("Fetching test results...", 40);
    if (signal?.aborted) throw new Error("Aborted");

    const allResults: TestResultRecord[] = [];
    for (let i = 0; i < filteredRuns.length; i++) {
      if (signal?.aborted) throw new Error("Aborted");
      const run = filteredRuns[i];
      try {
        // Paginate through test results for this run
        const results = await fetchAllPages<any>(
          (skip, top) =>
            testClient.getTestResults(
              projectName,
              run.id,
              undefined, // detailsToInclude
              skip,
              top
            ),
          RESULT_PAGE_SIZE,
          MAX_RESULT_PAGES,
          signal
        );
        for (const result of results) {
          allResults.push({
            testCaseTitle: result.testCaseTitle ?? "Unknown",
            automatedTestName: result.automatedTestName ?? result.testCaseTitle ?? "Unknown",
            automatedTestStorage: result.automatedTestStorage ?? "Default",
            outcome: result.outcome ?? "NotExecuted",
            durationInMs: (result.durationInMs ?? 0) as number,
            runId: run.id,
            pipelineName: pipelineNameOf(run),
            completedDate: new Date(result.completedDate ?? run.completedDate),
          });
        }
      } catch (err) {
        // A cancel must stop the whole scan; anything else just skips this run.
        if (isAbortError(err)) throw err;
        // Skip runs where results aren't accessible
      }

      const progress = 40 + Math.round(((i + 1) / filteredRuns.length) * 40);
      onProgress?.(`Processing test results (${i + 1}/${filteredRuns.length})...`, progress);
    }

    onProgress?.("Detecting flaky tests...", 85);
    const flakyTests = this.detectFlakyTests(allResults, settings.flakyWindowSize);

    onProgress?.("Finding slowest tests...", 90);
    const slowestTests = this.findSlowestTests(allResults, settings.slowTestThresholdMs);

    onProgress?.("Computing trends...", 95);
    const testCountTrend = this.computeTestCountTrend(runSummaries);

    const totalTestsExecuted = allResults.length;
    const passedResults = allResults.filter((r) => r.outcome === "Passed").length;
    const overallPassRate = totalTestsExecuted > 0 ? passedResults / totalTestsExecuted : 0;

    const pipelineMap = new Map<
      string,
      { passRate: number; testCount: number; passed: number; flakyCount: number }
    >();
    for (const result of allResults) {
      let entry = pipelineMap.get(result.pipelineName);
      if (!entry) {
        entry = { passRate: 0, testCount: 0, passed: 0, flakyCount: 0 };
        pipelineMap.set(result.pipelineName, entry);
      }
      entry.testCount++;
      if (result.outcome === "Passed") entry.passed++;
    }

    const flakyTestNames = new Set(flakyTests.map((f) => f.testName));
    for (const result of allResults) {
      if (flakyTestNames.has(result.automatedTestName)) {
        const entry = pipelineMap.get(result.pipelineName);
        if (entry) entry.flakyCount++;
      }
    }

    const pipelineTestSummary = Array.from(pipelineMap.entries()).map(([pipelineName, data]) => ({
      pipelineName,
      passRate: data.testCount > 0 ? data.passed / data.testCount : 0,
      testCount: data.testCount,
      flakyCount: data.flakyCount,
    }));

    onProgress?.("Analysis complete", 100);

    return {
      totalRuns: runSummaries.length,
      overallPassRate: Math.round(overallPassRate * 10000) / 10000,
      totalTestsExecuted,
      flakyTests,
      slowestTests,
      runHistory: runSummaries.sort(
        (a, b) => b.completedDate.getTime() - a.completedDate.getTime()
      ),
      pipelineTestSummary,
      testCountTrend,
    };
  }

  detectFlakyTests(testResults: TestResultRecord[], windowSize: number): FlakyTest[] {
    const testMap = new Map<
      string,
      {
        suiteName: string;
        outcomes: { outcome: string; date: Date }[];
        durations: number[];
        pipelineName: string;
      }
    >();

    for (const result of testResults) {
      const key = result.automatedTestName;
      let entry = testMap.get(key);
      if (!entry) {
        entry = {
          suiteName: result.automatedTestStorage,
          outcomes: [],
          durations: [],
          pipelineName: result.pipelineName,
        };
        testMap.set(key, entry);
      }
      entry.outcomes.push({ outcome: result.outcome, date: result.completedDate });
      if (result.durationInMs > 0) {
        entry.durations.push(result.durationInMs);
      }
    }

    const flakyTests: FlakyTest[] = [];

    for (const [testName, data] of testMap.entries()) {
      if (data.outcomes.length < 3) continue;

      // Take the last windowSize outcomes
      const sorted = data.outcomes
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(-windowSize);

      const recentResults: ("pass" | "fail" | "skip")[] = sorted.map((o) => {
        if (o.outcome === "Passed") return "pass";
        if (o.outcome === "Failed") return "fail";
        return "skip";
      });

      const passCount = recentResults.filter((r) => r === "pass").length;
      const failCount = recentResults.filter((r) => r === "fail").length;
      const total = passCount + failCount;

      if (total < 2) continue;

      // Flaky if there's a mix of pass and fail
      if (passCount > 0 && failCount > 0) {
        const flakyRate = Math.min(passCount, failCount) / total;
        if (flakyRate >= 0.1) {
          const avgDurationMs =
            data.durations.length > 0
              ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
              : 0;

          flakyTests.push({
            testName,
            suiteName: data.suiteName,
            flakyRate: Math.round(flakyRate * 10000) / 10000,
            recentResults,
            pipelineName: data.pipelineName,
            avgDurationMs: Math.round(avgDurationMs),
          });
        }
      }
    }

    return flakyTests.sort((a, b) => b.flakyRate - a.flakyRate);
  }

  findSlowestTests(
    testResults: TestResultRecord[],
    thresholdMs: number
  ): {
    testName: string;
    suiteName: string;
    avgDurationMs: number;
    maxDurationMs: number;
    runCount: number;
  }[] {
    const testMap = new Map<string, { suiteName: string; durations: number[] }>();

    for (const result of testResults) {
      if (result.durationInMs <= 0) continue;
      const key = result.automatedTestName;
      let entry = testMap.get(key);
      if (!entry) {
        entry = { suiteName: result.automatedTestStorage, durations: [] };
        testMap.set(key, entry);
      }
      entry.durations.push(result.durationInMs);
    }

    const slowTests: {
      testName: string;
      suiteName: string;
      avgDurationMs: number;
      maxDurationMs: number;
      runCount: number;
    }[] = [];

    for (const [testName, data] of testMap.entries()) {
      const avg = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      const max = Math.max(...data.durations);

      if (avg >= thresholdMs) {
        slowTests.push({
          testName,
          suiteName: data.suiteName,
          avgDurationMs: Math.round(avg),
          maxDurationMs: Math.round(max),
          runCount: data.durations.length,
        });
      }
    }

    return slowTests.sort((a, b) => b.avgDurationMs - a.avgDurationMs).slice(0, 20);
  }

  computeTestCountTrend(
    runs: TestRunSummary[]
  ): { week: string; count: number; passRate: number }[] {
    if (runs.length === 0) return [];

    const weekMap = new Map<string, { count: number; passed: number; total: number }>();

    for (const run of runs) {
      const date = new Date(run.completedDate);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      // Key on the LOCAL calendar date. toISOString() converts to UTC first,
      // which pushed early-Sunday runs in UTC+ zones into the previous week.
      const weekKey = localDateKey(weekStart);

      let entry = weekMap.get(weekKey);
      if (!entry) {
        entry = { count: 0, passed: 0, total: 0 };
        weekMap.set(weekKey, entry);
      }
      entry.count += run.totalTests;
      entry.passed += run.passedTests;
      entry.total += run.totalTests;
    }

    return Array.from(weekMap.entries())
      .map(([week, data]) => ({
        week,
        count: data.count,
        passRate: data.total > 0 ? Math.round((data.passed / data.total) * 10000) / 10000 : 0,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }
}
