import { __setMockClient, __resetMockClients } from "../__mocks__/azure-devops-extension-api";
import {
  TestHealthService,
  fetchAllPages,
  fetchRunsSince,
  localDateKey,
} from "@/services/TestHealthService";
import { DEFAULT_TEST_SETTINGS } from "@/models/testInterfaces";

const recent = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

const makeRun = (id: number) => ({
  id,
  name: `Run ${id}`,
  completedDate: recent(),
  startedDate: recent(),
  totalTests: 1,
  passedTests: 1,
  buildConfiguration: { definitionName: "Build contoso-api" },
});

describe("fetchAllPages", () => {
  it("requests consecutive pages and stops on the first short page", async () => {
    const fetchPage = jest.fn(async (skip: number, top: number) =>
      skip === 0 ? Array.from({ length: top }, (_, i) => i) : [1, 2, 3]
    );

    const items = await fetchAllPages(fetchPage, 10, 50);

    expect(items).toHaveLength(13);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 10);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 10, 10);
  });

  it("stops on an empty page", async () => {
    const fetchPage = jest.fn(async () => []);
    expect(await fetchAllPages(fetchPage, 10, 50)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("caps the number of pages when every page is full", async () => {
    const fetchPage = jest.fn(async (_skip: number, top: number) => new Array(top).fill(0));

    const items = await fetchAllPages(fetchPage, 5, 4);

    expect(fetchPage).toHaveBeenCalledTimes(4);
    expect(items).toHaveLength(20);
  });

  it("throws Aborted and stops requesting once the signal is aborted", async () => {
    const controller = new AbortController();
    const fetchPage = jest.fn(async (_skip: number, top: number) => {
      // Abort while the first page is in flight; the second must never be requested.
      controller.abort();
      return new Array(top).fill(0);
    });

    await expect(fetchAllPages(fetchPage, 5, 50, controller.signal)).rejects.toThrow("Aborted");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("treats a null page as empty", async () => {
    const fetchPage = jest.fn(async () => null as unknown as number[]);
    expect(await fetchAllPages(fetchPage, 5, 50)).toEqual([]);
  });
});

const DAY_MS = 24 * 3600 * 1000;

/** queryTestRuns as the server behaves: date-filtered, 100 per page, continuation token. */
function queryRunsFrom(runs: { id: number; lastUpdated: Date }[], pageSize = 100) {
  return jest.fn(async (...args: any[]) => {
    const [, min, max] = args as [string, Date, Date];
    const token = args[16] as string | undefined;
    const inSpan = runs.filter((r) => r.lastUpdated >= min && r.lastUpdated <= max);
    const offset = token ? Number(token) : 0;
    const page: any = inSpan.slice(offset, offset + pageSize).map((r) => makeRun(r.id));
    if (offset + pageSize < inSpan.length) page.continuationToken = String(offset + pageSize);
    return page;
  });
}

describe("fetchRunsSince", () => {
  it("walks the window in spans of at most 7 days, newest first, covering all of it", async () => {
    const queryTestRuns = queryRunsFrom([]);
    const until = new Date("2026-11-03T12:00:00Z");
    const since = new Date(until.getTime() - 30 * DAY_MS);

    await fetchRunsSince({ queryTestRuns } as any, "contoso", since, until);

    const spans = queryTestRuns.mock.calls.map((c) => [c[1] as Date, c[2] as Date]);
    expect(spans).toHaveLength(5);
    expect(spans[0][1]).toEqual(until);
    expect(spans[spans.length - 1][0]).toEqual(since);
    for (const [min, max] of spans) {
      expect(max.getTime() - min.getTime()).toBeLessThanOrEqual(7 * DAY_MS);
    }
    for (let i = 1; i < spans.length; i++) expect(spans[i][1]).toEqual(spans[i - 1][0]);
  });

  it("follows continuation tokens and drops runs repeated on a span boundary", async () => {
    const until = new Date("2026-11-03T12:00:00Z");
    const since = new Date(until.getTime() - 14 * DAY_MS);
    const boundary = new Date(until.getTime() - 7 * DAY_MS);
    const runs = [
      ...Array.from({ length: 250 }, (_, i) => ({
        id: i + 1,
        lastUpdated: new Date(until.getTime() - DAY_MS),
      })),
      { id: 999, lastUpdated: boundary },
    ];
    const queryTestRuns = queryRunsFrom(runs);

    const found = await fetchRunsSince({ queryTestRuns } as any, "contoso", since, until);

    expect(found).toHaveLength(251);
    expect(new Set(found.map((r) => r.id)).size).toBe(251);
    // Newest span: three pages (100 + 100 + 51); older span: one page.
    expect(queryTestRuns).toHaveBeenCalledTimes(4);
    expect(queryTestRuns.mock.calls.every((c) => c[15] === 100)).toBe(true);
  });

  it("finds recent runs however many older runs the project has", async () => {
    // The old getTestRuns listed oldest first, so 10,000 old runs hid every recent one.
    const now = Date.now();
    const old = Array.from({ length: 12000 }, (_, i) => ({
      id: i + 1,
      lastUpdated: new Date(now - 400 * DAY_MS),
    }));
    const recentRun = { id: 50000, lastUpdated: new Date(now - DAY_MS) };
    const queryTestRuns = queryRunsFrom([...old, recentRun]);

    const found = await fetchRunsSince(
      { queryTestRuns } as any,
      "contoso",
      new Date(now - 30 * DAY_MS),
      new Date(now)
    );

    expect(found.map((r) => r.id)).toEqual([50000]);
  });
});

describe("TestHealthService.fetchTestHealth", () => {
  afterEach(() => __resetMockClients());

  it("walks every result page of every run", async () => {
    const now = Date.now();
    const queryTestRuns = queryRunsFrom(
      Array.from({ length: 250 }, (_, i) => ({ id: i + 1, lastUpdated: new Date(now - DAY_MS) }))
    );
    const getTestResults = jest.fn(
      async (_project: string, runId: number, _d: unknown, skip: number, top: number) =>
        runId === 1 && skip === 0
          ? Array.from({ length: top }, (_, i) => ({
              automatedTestName: `Test ${i}`,
              outcome: "Passed",
              durationInMs: 10,
            }))
          : runId === 1
            ? [{ automatedTestName: "Tail", outcome: "Passed", durationInMs: 10 }]
            : []
    );
    __setMockClient("TestRestClient", { queryTestRuns, getTestResults });

    const data = await new TestHealthService().fetchTestHealth("contoso", DEFAULT_TEST_SETTINGS);

    expect(data.totalRuns).toBe(250);
    // Run 1 needed two result pages: 1000 + 1 results.
    expect(getTestResults.mock.calls.filter((c) => c[1] === 1)).toHaveLength(2);
    expect(data.totalTestsExecuted).toBe(1001);
  });

  it("names pipelines after the build definition, not the test run", async () => {
    const run = { ...makeRun(1), name: "VSTest_TestResults_77", build: { id: "77" } };
    __setMockClient("TestRestClient", {
      queryTestRuns: jest.fn(async (...args: any[]) => (args[16] ? [] : [run])),
      getTestResults: jest.fn(async () => [{ automatedTestName: "A", outcome: "Passed" }]),
    });
    const getBuilds = jest.fn(async () => [{ id: 77, definition: { name: "contoso-api CI" } }]);
    __setMockClient("BuildRestClient", { getBuilds });

    const data = await new TestHealthService().fetchTestHealth("contoso", DEFAULT_TEST_SETTINGS);

    expect((getBuilds.mock.calls[0] as any[])[18]).toEqual([77]);
    expect(data.runHistory[0].pipelineName).toBe("contoso-api CI");
    expect(data.pipelineTestSummary.map((p) => p.pipelineName)).toEqual(["contoso-api CI"]);
  });

  it("falls back to the run title when build names cannot be read", async () => {
    const run = { ...makeRun(1), name: "VSTest_TestResults_77", build: { id: "77" } };
    __setMockClient("TestRestClient", {
      queryTestRuns: jest.fn(async (...args: any[]) => (args[16] ? [] : [run])),
      getTestResults: jest.fn(async () => []),
    });
    __setMockClient("BuildRestClient", {
      getBuilds: jest.fn(async () => {
        throw { status: 403, message: "denied" };
      }),
    });

    const data = await new TestHealthService().fetchTestHealth("contoso", DEFAULT_TEST_SETTINGS);

    expect(data.runHistory[0].pipelineName).toBe("VSTest_TestResults_77");
  });

  it("propagates a cancel raised while fetching results instead of swallowing it", async () => {
    const controller = new AbortController();
    const now = Date.now();
    const queryTestRuns = queryRunsFrom([
      { id: 1, lastUpdated: new Date(now - DAY_MS) },
      { id: 2, lastUpdated: new Date(now - DAY_MS) },
    ]);
    const getTestResults = jest.fn(async () => {
      controller.abort();
      return [];
    });
    __setMockClient("TestRestClient", { queryTestRuns, getTestResults });

    await expect(
      new TestHealthService().fetchTestHealth(
        "contoso",
        DEFAULT_TEST_SETTINGS,
        undefined,
        controller.signal
      )
    ).rejects.toThrow("Aborted");
    expect(getTestResults).toHaveBeenCalledTimes(1);
  });
});

describe("localDateKey", () => {
  it("uses the local calendar date, not the UTC one", () => {
    // Local midnight: toISOString() would roll back a day in any UTC+ zone.
    const localMidnight = new Date(2024, 0, 7, 0, 30);
    expect(localDateKey(localMidnight)).toBe("2024-01-07");
  });

  it("buckets runs by their local Sunday", () => {
    const service = new TestHealthService();
    const run = (completedDate: Date) => ({
      id: 1,
      name: "r",
      pipelineName: "p",
      startDate: completedDate,
      completedDate,
      totalTests: 10,
      passedTests: 9,
      failedTests: 1,
      skippedTests: 0,
      passRate: 0.9,
      durationSeconds: 1,
    });
    // Sunday 00:30 and the following Wednesday, both local time -> one week.
    const trend = service.computeTestCountTrend([
      run(new Date(2024, 0, 7, 0, 30)),
      run(new Date(2024, 0, 10, 12, 0)),
    ]);
    expect(trend).toEqual([{ week: "2024-01-07", count: 20, passRate: 0.9 }]);
  });
});
