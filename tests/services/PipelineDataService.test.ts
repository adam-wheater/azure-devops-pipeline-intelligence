import { PipelineDataService } from "@/services/PipelineDataService";
import { __setMockClient, __resetMockClients } from "../__mocks__/azure-devops-extension-api";
import { PipelineStats } from "@/models/interfaces";
// BuildResult enum values for assertions
const BuildResult = {
  None: 0,
  Succeeded: 2,
  PartiallySucceeded: 4,
  Failed: 8,
  Canceled: 32,
} as const;

describe("PipelineDataService", () => {
  let service: PipelineDataService;

  beforeEach(() => {
    service = new PipelineDataService();
  });

  describe("fetchPipelineData duration trend", () => {
    afterEach(() => __resetMockClients());

    it("keeps the 20 most recent builds, oldest first, when the API lists newest first", async () => {
      const hour = 3_600_000;
      const start = Date.now() - 30 * hour;
      // 25 builds, build i takes i minutes; the API hands them back newest first.
      const builds = Array.from({ length: 25 }, (_, i) => ({
        id: i,
        definition: { id: 1, name: "billing-api" },
        result: BuildResult.Succeeded,
        queueTime: new Date(start + i * hour).toISOString(),
        startTime: new Date(start + i * hour).toISOString(),
        finishTime: new Date(start + i * hour + i * 60_000).toISOString(),
      })).reverse();
      __setMockClient("BuildRestClient", { getBuilds: jest.fn().mockResolvedValue(builds) });

      const data = await service.fetchPipelineData("Contoso", {
        timePeriodDays: 30,
        excludedDefinitionIds: [],
        costPerMinute: 0,
        queueWaitWarningSeconds: 300,
      });

      expect(data.pipelines[0].durationTrend).toEqual(Array.from({ length: 20 }, (_, i) => i + 5));
    });
  });

  describe("computeFlakyPipelines", () => {
    it("should mark pipelines with failure rate between 0.2 and 0.8 as flaky", () => {
      const pipelines: PipelineStats[] = [
        {
          definitionId: 1,
          name: "Flaky Pipeline",
          totalRuns: 10,
          totalMinutes: 100,
          avgDurationMinutes: 10,
          avgQueueWaitSeconds: 30,
          failureRate: 0.4,
          durationTrend: [5, 6, 5, 7, 5, 6, 5, 7],
          isFlaky: false,
        },
        {
          definitionId: 2,
          name: "Stable Pipeline",
          totalRuns: 10,
          totalMinutes: 50,
          avgDurationMinutes: 5,
          avgQueueWaitSeconds: 10,
          failureRate: 0.05,
          durationTrend: [5, 5, 5, 5, 5, 5, 5, 5],
          isFlaky: false,
        },
        {
          definitionId: 3,
          name: "Always Failing",
          totalRuns: 10,
          totalMinutes: 30,
          avgDurationMinutes: 3,
          avgQueueWaitSeconds: 5,
          failureRate: 0.9,
          durationTrend: [3, 3, 3, 3, 3, 3, 3, 3],
          isFlaky: false,
        },
      ];

      service.computeFlakyPipelines(pipelines);

      expect(pipelines[0].isFlaky).toBe(true);
      expect(pipelines[1].isFlaky).toBe(false);
      expect(pipelines[2].isFlaky).toBe(false);
    });

    it("should not mark pipelines with fewer than 4 runs as flaky", () => {
      const pipelines: PipelineStats[] = [
        {
          definitionId: 1,
          name: "Short Pipeline",
          totalRuns: 3,
          totalMinutes: 30,
          avgDurationMinutes: 10,
          avgQueueWaitSeconds: 30,
          failureRate: 0.5,
          durationTrend: [5, 6, 5],
          isFlaky: false,
        },
      ];

      service.computeFlakyPipelines(pipelines);

      expect(pipelines[0].isFlaky).toBe(false);
    });

    it("should mark pipeline at boundary failure rate 0.2 as flaky", () => {
      const pipelines: PipelineStats[] = [
        {
          definitionId: 1,
          name: "Boundary Low",
          totalRuns: 10,
          totalMinutes: 100,
          avgDurationMinutes: 10,
          avgQueueWaitSeconds: 30,
          failureRate: 0.2,
          durationTrend: [5, 6, 5, 7, 5, 6, 5, 7],
          isFlaky: false,
        },
      ];

      service.computeFlakyPipelines(pipelines);

      expect(pipelines[0].isFlaky).toBe(true);
    });
  });

  describe("computeTriggerStats", () => {
    it("should group builds by user and compute failure counts", () => {
      const builds = [
        {
          id: 1,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Succeeded,
          requestedForId: "user1",
          requestedForName: "Alice",
        },
        {
          id: 2,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Failed,
          requestedForId: "user1",
          requestedForName: "Alice",
        },
        {
          id: 3,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Succeeded,
          requestedForId: "user2",
          requestedForName: "Bob",
        },
        {
          id: 4,
          definitionId: 2,
          definitionName: "P2",
          status: 2,
          result: BuildResult.Failed,
          requestedForId: "user2",
          requestedForName: "Bob",
        },
        {
          id: 5,
          definitionId: 2,
          definitionName: "P2",
          status: 2,
          result: BuildResult.Failed,
          requestedForId: "user2",
          requestedForName: "Bob",
        },
      ];

      const stats = service.computeTriggerStats(builds as any);

      expect(stats).toHaveLength(2);

      // Sorted by buildCount desc -> Bob (3) then Alice (2)
      const bob = stats.find((s) => s.displayName === "Bob");
      const alice = stats.find((s) => s.displayName === "Alice");

      expect(bob).toBeDefined();
      expect(bob!.buildCount).toBe(3);
      expect(bob!.failedCount).toBe(2);

      expect(alice).toBeDefined();
      expect(alice!.buildCount).toBe(2);
      expect(alice!.failedCount).toBe(1);
    });

    it("should return empty array for empty builds", () => {
      const stats = service.computeTriggerStats([]);
      expect(stats).toEqual([]);
    });

    it("should sort by build count descending", () => {
      const builds = [
        {
          id: 1,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Succeeded,
          requestedForId: "user1",
          requestedForName: "Alice",
        },
        {
          id: 2,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Succeeded,
          requestedForId: "user2",
          requestedForName: "Bob",
        },
        {
          id: 3,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Succeeded,
          requestedForId: "user2",
          requestedForName: "Bob",
        },
      ];

      const stats = service.computeTriggerStats(builds as any);
      expect(stats[0].displayName).toBe("Bob");
      expect(stats[1].displayName).toBe("Alice");
    });
  });

  describe("computeQueueAnalysis", () => {
    it("should compute average wait time by hour and day", () => {
      // Local-time constructors: the heatmap buckets by the viewer's local hour
      // and weekday, so UTC literals would land in different cells outside UTC.
      const monday10am = new Date(2024, 0, 8, 10, 0, 0); // Monday
      const monday10amStart = new Date(2024, 0, 8, 10, 1, 0); // 60s wait
      const tuesday14pm = new Date(2024, 0, 9, 14, 0, 0); // Tuesday
      const tuesday14pmStart = new Date(2024, 0, 9, 14, 2, 0); // 120s wait

      const builds = [
        {
          id: 1,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Succeeded,
          queueTime: monday10am,
          startTime: monday10amStart,
        },
        {
          id: 2,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Succeeded,
          queueTime: tuesday14pm,
          startTime: tuesday14pmStart,
        },
      ];

      const analysis = service.computeQueueAnalysis(builds as any);

      expect(analysis.hourOfDay).toHaveLength(24);
      expect(analysis.dayOfWeek).toHaveLength(7);
      expect(analysis.heatmap).toHaveLength(7);
      expect(analysis.heatmap[0]).toHaveLength(24);

      // Hour 10 should have 60s avg
      expect(analysis.hourOfDay[10]).toBe(60);
      // Hour 14 should have 120s avg
      expect(analysis.hourOfDay[14]).toBe(120);
      // Other hours should be 0
      expect(analysis.hourOfDay[0]).toBe(0);

      // Monday (day 1) hour 10 should have 60s
      expect(analysis.heatmap[1][10]).toBe(60);
      // Tuesday (day 2) hour 14 should have 120s
      expect(analysis.heatmap[2][14]).toBe(120);
      // Unoccupied cells should be 0
      expect(analysis.heatmap[0][0]).toBe(0);
      expect(analysis.heatmap[1][14]).toBe(0);
    });

    it("should handle empty builds", () => {
      const analysis = service.computeQueueAnalysis([]);
      expect(analysis.hourOfDay).toHaveLength(24);
      expect(analysis.dayOfWeek).toHaveLength(7);
      expect(analysis.heatmap).toHaveLength(7);
      expect(analysis.hourOfDay.every((v: number) => v === 0)).toBe(true);
      expect(analysis.dayOfWeek.every((v: number) => v === 0)).toBe(true);
      expect(analysis.heatmap.every((row: number[]) => row.every((v) => v === 0))).toBe(true);
    });

    it("should handle builds without queue/start times", () => {
      const builds = [
        {
          id: 1,
          definitionId: 1,
          definitionName: "P1",
          status: 2,
          result: BuildResult.Succeeded,
          queueTime: undefined,
          startTime: undefined,
        },
      ];

      const analysis = service.computeQueueAnalysis(builds as any);
      expect(analysis.hourOfDay.every((v: number) => v === 0)).toBe(true);
    });
  });
});
