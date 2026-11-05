import { TestHealthService } from "@/services/TestHealthService";
import { TestRunSummary } from "@/models/testInterfaces";

describe("TestHealthService", () => {
  let service: TestHealthService;

  beforeEach(() => {
    service = new TestHealthService();
  });

  describe("detectFlakyTests", () => {
    it("should detect tests with mixed pass/fail results", () => {
      const testResults = [
        {
          testCaseTitle: "Test A",
          automatedTestName: "Test A",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 100,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
        {
          testCaseTitle: "Test A",
          automatedTestName: "Test A",
          automatedTestStorage: "Suite1",
          outcome: "Failed",
          durationInMs: 120,
          runId: 2,
          pipelineName: "P1",
          completedDate: new Date("2024-01-02"),
        },
        {
          testCaseTitle: "Test A",
          automatedTestName: "Test A",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 110,
          runId: 3,
          pipelineName: "P1",
          completedDate: new Date("2024-01-03"),
        },
        {
          testCaseTitle: "Test A",
          automatedTestName: "Test A",
          automatedTestStorage: "Suite1",
          outcome: "Failed",
          durationInMs: 130,
          runId: 4,
          pipelineName: "P1",
          completedDate: new Date("2024-01-04"),
        },
        {
          testCaseTitle: "Test B",
          automatedTestName: "Test B",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 50,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
        {
          testCaseTitle: "Test B",
          automatedTestName: "Test B",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 55,
          runId: 2,
          pipelineName: "P1",
          completedDate: new Date("2024-01-02"),
        },
        {
          testCaseTitle: "Test B",
          automatedTestName: "Test B",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 52,
          runId: 3,
          pipelineName: "P1",
          completedDate: new Date("2024-01-03"),
        },
      ];

      const flakyTests = service.detectFlakyTests(testResults, 10);

      expect(flakyTests).toHaveLength(1);
      expect(flakyTests[0].testName).toBe("Test A");
      expect(flakyTests[0].suiteName).toBe("Suite1");
      expect(flakyTests[0].flakyRate).toBeGreaterThan(0);
      expect(flakyTests[0].recentResults).toContain("pass");
      expect(flakyTests[0].recentResults).toContain("fail");
    });

    it("should not detect stable tests as flaky", () => {
      const testResults = [
        {
          testCaseTitle: "Stable",
          automatedTestName: "Stable",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 100,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
        {
          testCaseTitle: "Stable",
          automatedTestName: "Stable",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 110,
          runId: 2,
          pipelineName: "P1",
          completedDate: new Date("2024-01-02"),
        },
        {
          testCaseTitle: "Stable",
          automatedTestName: "Stable",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 105,
          runId: 3,
          pipelineName: "P1",
          completedDate: new Date("2024-01-03"),
        },
      ];

      const flakyTests = service.detectFlakyTests(testResults, 10);
      expect(flakyTests).toHaveLength(0);
    });

    it("should return empty for empty input", () => {
      const flakyTests = service.detectFlakyTests([], 10);
      expect(flakyTests).toHaveLength(0);
    });

    it("should respect window size parameter", () => {
      const testResults = [];
      // First 8 results: all pass
      for (let i = 0; i < 8; i++) {
        testResults.push({
          testCaseTitle: "Test C",
          automatedTestName: "Test C",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 100,
          runId: i + 1,
          pipelineName: "P1",
          completedDate: new Date(`2024-01-${String(i + 1).padStart(2, "0")}`),
        });
      }
      // Last 2 results: fail
      for (let i = 8; i < 10; i++) {
        testResults.push({
          testCaseTitle: "Test C",
          automatedTestName: "Test C",
          automatedTestStorage: "Suite1",
          outcome: "Failed",
          durationInMs: 100,
          runId: i + 1,
          pipelineName: "P1",
          completedDate: new Date(`2024-01-${String(i + 1).padStart(2, "0")}`),
        });
      }

      // With window of 3, only last 3 results matter (1 pass, 2 fail)
      const flakyWindow3 = service.detectFlakyTests(testResults, 3);
      expect(flakyWindow3).toHaveLength(1);

      // With window of 10, all 10 results matter (8 pass, 2 fail)
      const flakyWindow10 = service.detectFlakyTests(testResults, 10);
      expect(flakyWindow10).toHaveLength(1);
    });

    it("should compute average duration for flaky tests", () => {
      const testResults = [
        {
          testCaseTitle: "Flaky",
          automatedTestName: "Flaky",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 100,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
        {
          testCaseTitle: "Flaky",
          automatedTestName: "Flaky",
          automatedTestStorage: "Suite1",
          outcome: "Failed",
          durationInMs: 200,
          runId: 2,
          pipelineName: "P1",
          completedDate: new Date("2024-01-02"),
        },
        {
          testCaseTitle: "Flaky",
          automatedTestName: "Flaky",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 300,
          runId: 3,
          pipelineName: "P1",
          completedDate: new Date("2024-01-03"),
        },
      ];

      const flakyTests = service.detectFlakyTests(testResults, 10);
      expect(flakyTests).toHaveLength(1);
      expect(flakyTests[0].avgDurationMs).toBe(200);
    });
  });

  describe("findSlowestTests", () => {
    it("should find tests above the threshold", () => {
      const testResults = [
        {
          testCaseTitle: "Slow Test",
          automatedTestName: "Slow Test",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 40000,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
        {
          testCaseTitle: "Slow Test",
          automatedTestName: "Slow Test",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 50000,
          runId: 2,
          pipelineName: "P1",
          completedDate: new Date("2024-01-02"),
        },
        {
          testCaseTitle: "Fast Test",
          automatedTestName: "Fast Test",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 100,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
        {
          testCaseTitle: "Fast Test",
          automatedTestName: "Fast Test",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 150,
          runId: 2,
          pipelineName: "P1",
          completedDate: new Date("2024-01-02"),
        },
      ];

      const slowTests = service.findSlowestTests(testResults, 30000);

      expect(slowTests).toHaveLength(1);
      expect(slowTests[0].testName).toBe("Slow Test");
      expect(slowTests[0].avgDurationMs).toBe(45000);
      expect(slowTests[0].maxDurationMs).toBe(50000);
      expect(slowTests[0].runCount).toBe(2);
    });

    it("should return empty for no slow tests", () => {
      const testResults = [
        {
          testCaseTitle: "Fast",
          automatedTestName: "Fast",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 100,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
      ];

      const slowTests = service.findSlowestTests(testResults, 30000);
      expect(slowTests).toHaveLength(0);
    });

    it("should limit to top 20", () => {
      const testResults = [];
      for (let i = 0; i < 25; i++) {
        testResults.push({
          testCaseTitle: `Slow Test ${i}`,
          automatedTestName: `Slow Test ${i}`,
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 50000 + i * 1000,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        });
      }

      const slowTests = service.findSlowestTests(testResults, 30000);
      expect(slowTests).toHaveLength(20);
    });

    it("should sort by avg duration descending", () => {
      const testResults = [
        {
          testCaseTitle: "Medium",
          automatedTestName: "Medium",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 40000,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
        {
          testCaseTitle: "Slowest",
          automatedTestName: "Slowest",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 90000,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
        {
          testCaseTitle: "Slow",
          automatedTestName: "Slow",
          automatedTestStorage: "Suite1",
          outcome: "Passed",
          durationInMs: 60000,
          runId: 1,
          pipelineName: "P1",
          completedDate: new Date("2024-01-01"),
        },
      ];

      const slowTests = service.findSlowestTests(testResults, 30000);
      expect(slowTests[0].testName).toBe("Slowest");
      expect(slowTests[1].testName).toBe("Slow");
      expect(slowTests[2].testName).toBe("Medium");
    });
  });

  describe("computeTestCountTrend", () => {
    it("should compute weekly test count and pass rate", () => {
      const runs: TestRunSummary[] = [
        {
          id: 1,
          name: "Run 1",
          pipelineName: "P1",
          startDate: new Date("2024-01-08T10:00:00Z"),
          completedDate: new Date("2024-01-08T11:00:00Z"),
          totalTests: 100,
          passedTests: 90,
          failedTests: 10,
          skippedTests: 0,
          passRate: 0.9,
          durationSeconds: 3600,
        },
        {
          id: 2,
          name: "Run 2",
          pipelineName: "P1",
          startDate: new Date("2024-01-09T10:00:00Z"),
          completedDate: new Date("2024-01-09T11:00:00Z"),
          totalTests: 200,
          passedTests: 180,
          failedTests: 20,
          skippedTests: 0,
          passRate: 0.9,
          durationSeconds: 3600,
        },
        {
          id: 3,
          name: "Run 3",
          pipelineName: "P1",
          startDate: new Date("2024-01-15T10:00:00Z"),
          completedDate: new Date("2024-01-15T11:00:00Z"),
          totalTests: 150,
          passedTests: 120,
          failedTests: 30,
          skippedTests: 0,
          passRate: 0.8,
          durationSeconds: 3600,
        },
      ];

      const trend = service.computeTestCountTrend(runs);

      expect(trend.length).toBeGreaterThanOrEqual(1);
      // Each entry should have week, count, passRate
      for (const entry of trend) {
        expect(entry.week).toBeDefined();
        expect(typeof entry.count).toBe("number");
        expect(typeof entry.passRate).toBe("number");
        expect(entry.passRate).toBeGreaterThanOrEqual(0);
        expect(entry.passRate).toBeLessThanOrEqual(1);
      }
    });

    it("should return empty for no runs", () => {
      const trend = service.computeTestCountTrend([]);
      expect(trend).toEqual([]);
    });

    it("should sort by week ascending", () => {
      const runs: TestRunSummary[] = [
        {
          id: 1,
          name: "Run Late",
          pipelineName: "P1",
          startDate: new Date("2024-02-15T10:00:00Z"),
          completedDate: new Date("2024-02-15T11:00:00Z"),
          totalTests: 50,
          passedTests: 40,
          failedTests: 10,
          skippedTests: 0,
          passRate: 0.8,
          durationSeconds: 3600,
        },
        {
          id: 2,
          name: "Run Early",
          pipelineName: "P1",
          startDate: new Date("2024-01-08T10:00:00Z"),
          completedDate: new Date("2024-01-08T11:00:00Z"),
          totalTests: 100,
          passedTests: 95,
          failedTests: 5,
          skippedTests: 0,
          passRate: 0.95,
          durationSeconds: 3600,
        },
      ];

      const trend = service.computeTestCountTrend(runs);
      expect(trend.length).toBe(2);
      expect(trend[0].week < trend[1].week).toBe(true);
    });
  });
});
