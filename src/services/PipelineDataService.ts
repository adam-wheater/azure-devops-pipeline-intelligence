import { getClient } from "azure-devops-extension-api";
import { BuildRestClient, BuildStatus, BuildResult } from "azure-devops-extension-api/Build";

// Timeline record result values (TaskResult enum)
const TASK_RESULT_FAILED = 2;
import { ConcurrencyLimiter } from "@/utils/ConcurrencyLimiter";
import {
  PipelineStats,
  StageBreakdown,
  TriggerStats,
  QueueAnalysis,
  PipelineAnalyticsData,
  PipelineSettings,
} from "@/models/interfaces";

interface BuildRecord {
  id: number;
  definitionId: number;
  definitionName: string;
  status: number;
  result: number;
  queueTime?: Date;
  startTime?: Date;
  finishTime?: Date;
  requestedForId?: string;
  requestedForName?: string;
}

export class PipelineDataService {
  async fetchPipelineData(
    projectName: string,
    settings: PipelineSettings,
    onProgress?: (message: string, percent: number) => void,
    signal?: AbortSignal
  ): Promise<PipelineAnalyticsData> {
    const buildClient = getClient(BuildRestClient);

    onProgress?.("Fetching build definitions...", 5);
    if (signal?.aborted) throw new Error("Aborted");

    const minDate = new Date();
    minDate.setDate(minDate.getDate() - settings.timePeriodDays);

    const builds = await (buildClient as any).getBuilds(
      projectName,
      undefined, // definitions
      undefined, // queues
      undefined, // buildNumber
      minDate, // minTime — filter server-side instead of pulling the whole history
      undefined, // maxTime
      undefined, // requestedFor
      undefined, // reasonFilter
      BuildStatus.Completed
    );

    if (signal?.aborted) throw new Error("Aborted");
    onProgress?.("Processing build data...", 30);

    const buildRecords: BuildRecord[] = builds
      .filter((b: any) => {
        const queueTime = b.queueTime ? new Date(b.queueTime) : null;
        return queueTime && queueTime >= minDate;
      })
      .filter((b: any) => !settings.excludedDefinitionIds.includes(b.definition?.id ?? 0))
      .map((b: any) => ({
        id: b.id,
        definitionId: b.definition?.id ?? 0,
        definitionName: b.definition?.name ?? "Unknown",
        status: b.status ?? 0,
        result: b.result ?? 0,
        queueTime: b.queueTime ? new Date(b.queueTime) : undefined,
        startTime: b.startTime ? new Date(b.startTime) : undefined,
        finishTime: b.finishTime ? new Date(b.finishTime) : undefined,
        requestedForId: b.requestedFor?.uniqueName ?? b.requestedFor?.id ?? "",
        requestedForName: b.requestedFor?.displayName ?? b.requestedFor?.uniqueName ?? "Unknown",
      }))
      // Oldest first, whatever order the Build API used, so a pipeline's last 20
      // durations are its most recent builds and the trend reads left to right.
      .sort((a: BuildRecord, b: BuildRecord) => a.queueTime!.getTime() - b.queueTime!.getTime());

    onProgress?.("Computing pipeline statistics...", 50);

    const pipelineMap = new Map<
      number,
      { name: string; durations: number[]; results: number[]; queueWaits: number[] }
    >();

    for (const build of buildRecords) {
      let entry = pipelineMap.get(build.definitionId);
      if (!entry) {
        entry = { name: build.definitionName, durations: [], results: [], queueWaits: [] };
        pipelineMap.set(build.definitionId, entry);
      }

      if (build.startTime && build.finishTime) {
        const durationMin = (build.finishTime.getTime() - build.startTime.getTime()) / 60000;
        entry.durations.push(durationMin);
      }

      entry.results.push(build.result);

      if (build.queueTime && build.startTime) {
        const waitSec = (build.startTime.getTime() - build.queueTime.getTime()) / 1000;
        entry.queueWaits.push(waitSec);
      }
    }

    if (signal?.aborted) throw new Error("Aborted");
    onProgress?.("Building analytics...", 70);

    const pipelines: PipelineStats[] = [];
    for (const [definitionId, data] of pipelineMap.entries()) {
      const totalRuns = data.results.length;
      const totalMinutes = data.durations.reduce((a, b) => a + b, 0);
      const avgDurationMinutes =
        data.durations.length > 0 ? totalMinutes / data.durations.length : 0;
      const avgQueueWaitSeconds =
        data.queueWaits.length > 0
          ? data.queueWaits.reduce((a, b) => a + b, 0) / data.queueWaits.length
          : 0;
      const failedCount = data.results.filter((r) => r === BuildResult.Failed).length;
      const failureRate = totalRuns > 0 ? failedCount / totalRuns : 0;

      const trend = data.durations.slice(-20);

      pipelines.push({
        definitionId,
        name: data.name,
        totalRuns,
        totalMinutes: Math.round(totalMinutes * 100) / 100,
        avgDurationMinutes: Math.round(avgDurationMinutes * 100) / 100,
        avgQueueWaitSeconds: Math.round(avgQueueWaitSeconds * 100) / 100,
        failureRate: Math.round(failureRate * 10000) / 10000,
        durationTrend: trend,
        isFlaky: false,
      });
    }

    this.computeFlakyPipelines(pipelines);

    const triggerStats = this.computeTriggerStats(buildRecords);
    const queueAnalysis = this.computeQueueAnalysis(buildRecords);

    const totalAgentMinutes = pipelines.reduce((sum, p) => sum + p.totalMinutes, 0);
    const mostExpensive = pipelines.reduce(
      (max, p) => (p.totalMinutes > (max?.totalMinutes ?? 0) ? p : max),
      pipelines[0]
    );

    onProgress?.("Analysis complete", 100);

    return {
      pipelines,
      totalAgentMinutes: Math.round(totalAgentMinutes * 100) / 100,
      mostExpensivePipeline: mostExpensive?.name ?? "N/A",
      avgQueueWaitSeconds:
        pipelines.length > 0
          ? Math.round(
              (pipelines.reduce((s, p) => s + p.avgQueueWaitSeconds, 0) / pipelines.length) * 100
            ) / 100
          : 0,
      triggerStats,
      queueAnalysis,
    };
  }

  async getStageBreakdown(
    projectName: string,
    definitionId: number,
    timePeriodDays: number
  ): Promise<StageBreakdown[]> {
    const buildClient = getClient(BuildRestClient);
    const limiter = new ConcurrencyLimiter(5);

    const minDate = new Date();
    minDate.setDate(minDate.getDate() - timePeriodDays);

    const builds = await buildClient.getBuilds(
      projectName,
      [definitionId],
      undefined,
      undefined,
      minDate,
      undefined,
      undefined,
      undefined,
      BuildStatus.Completed
    );

    const recentBuilds = builds.filter((b: any) => {
      const qt = b.queueTime ? new Date(b.queueTime) : null;
      return qt && qt >= minDate;
    });

    const stageMap = new Map<string, { durations: number[]; failures: number; total: number }>();

    await limiter.map(recentBuilds, async (build: any) => {
      try {
        const timeline = await buildClient.getBuildTimeline(projectName, build.id);
        if (!timeline?.records) return;

        for (const record of timeline.records) {
          if (record.type === "Stage" && record.name) {
            let entry = stageMap.get(record.name);
            if (!entry) {
              entry = { durations: [], failures: 0, total: 0 };
              stageMap.set(record.name, entry);
            }
            entry.total++;
            if (
              (record.result as number) === TASK_RESULT_FAILED ||
              (record.result as any) === BuildResult.Failed
            ) {
              entry.failures++;
            }
            if (record.startTime && record.finishTime) {
              const dur =
                (new Date(record.finishTime).getTime() - new Date(record.startTime).getTime()) /
                60000;
              entry.durations.push(dur);
            }
          }
        }
      } catch {
        // Skip builds without timeline data
      }
    });

    const stages: StageBreakdown[] = [];
    for (const [stageName, data] of stageMap.entries()) {
      const avgDuration =
        data.durations.length > 0
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
          : 0;
      stages.push({
        stageName,
        avgDurationMinutes: Math.round(avgDuration * 100) / 100,
        failureRate: data.total > 0 ? Math.round((data.failures / data.total) * 10000) / 10000 : 0,
        totalRuns: data.total,
      });
    }

    return stages.sort((a, b) => b.avgDurationMinutes - a.avgDurationMinutes);
  }

  computeFlakyPipelines(pipelines: PipelineStats[]): void {
    for (const pipeline of pipelines) {
      if (pipeline.totalRuns < 4) continue;
      const trend = pipeline.durationTrend;
      if (trend.length < 4) continue;

      // A pipeline is flaky if its failure rate is between 20% and 80%
      // indicating inconsistent results
      if (pipeline.failureRate >= 0.2 && pipeline.failureRate <= 0.8) {
        pipeline.isFlaky = true;
      }
    }
  }

  computeTriggerStats(builds: BuildRecord[]): TriggerStats[] {
    const userMap = new Map<
      string,
      { displayName: string; buildCount: number; failedCount: number }
    >();

    for (const build of builds) {
      const userId = build.requestedForId ?? "unknown";
      let entry = userMap.get(userId);
      if (!entry) {
        entry = {
          displayName: build.requestedForName ?? "Unknown",
          buildCount: 0,
          failedCount: 0,
        };
        userMap.set(userId, entry);
      }
      entry.buildCount++;
      if (build.result === BuildResult.Failed) {
        entry.failedCount++;
      }
    }

    return Array.from(userMap.entries())
      .map(([userId, data]) => ({
        userId,
        displayName: data.displayName,
        buildCount: data.buildCount,
        failedCount: data.failedCount,
      }))
      .sort((a, b) => b.buildCount - a.buildCount);
  }

  computeQueueAnalysis(builds: BuildRecord[]): QueueAnalysis {
    const hourBuckets = new Array(24).fill(0);
    const hourCounts = new Array(24).fill(0);
    const dayBuckets = new Array(7).fill(0);
    const dayCounts = new Array(7).fill(0);
    const cellBuckets = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const cellCounts = Array.from({ length: 7 }, () => new Array(24).fill(0));

    for (const build of builds) {
      if (!build.queueTime || !build.startTime) continue;
      const waitSec = (build.startTime.getTime() - build.queueTime.getTime()) / 1000;
      const hour = build.queueTime.getHours();
      const day = build.queueTime.getDay();

      hourBuckets[hour] += waitSec;
      hourCounts[hour]++;
      dayBuckets[day] += waitSec;
      dayCounts[day]++;
      cellBuckets[day][hour] += waitSec;
      cellCounts[day][hour]++;
    }

    const hourOfDay = hourBuckets.map((total, i) =>
      hourCounts[i] > 0 ? Math.round((total / hourCounts[i]) * 100) / 100 : 0
    );
    const dayOfWeek = dayBuckets.map((total, i) =>
      dayCounts[i] > 0 ? Math.round((total / dayCounts[i]) * 100) / 100 : 0
    );
    const heatmap = cellBuckets.map((row, d) =>
      row.map((total, h) =>
        cellCounts[d][h] > 0 ? Math.round((total / cellCounts[d][h]) * 100) / 100 : 0
      )
    );

    return { hourOfDay, dayOfWeek, heatmap };
  }
}
