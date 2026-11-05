import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import {
  PipelineAnalyticsData,
  PipelineSettings,
  DEFAULT_PIPELINE_SETTINGS,
} from "@/models/interfaces";
import { PipelineDataService } from "@/services/PipelineDataService";
import { SettingsService } from "@/services/SettingsService";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  IconPlay,
  IconSettings,
  IconStop,
  Progress,
  Tabs,
} from "./ui";
import { CostSummaryCards } from "./CostSummaryCards";
import { PipelineRankingTable } from "./PipelineRankingTable";
import { DurationTrendChart } from "./DurationTrendChart";
import { FailureAnalysis } from "./FailureAnalysis";
import { QueueWaitChart } from "./QueueWaitChart";
import { TriggerAnalysis } from "./TriggerAnalysis";

type SubTabId = "overview" | "duration-trends" | "failure-analysis" | "queue-triggers";

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "duration-trends", label: "Duration Trends" },
  { id: "failure-analysis", label: "Failure Analysis" },
  { id: "queue-triggers", label: "Queue & Triggers" },
];

const settingsService = new SettingsService();

export const PipelineAnalytics: React.FC = () => {
  const [data, setData] = React.useState<PipelineAnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState({ message: "", percent: 0 });
  const [selectedPipeline, setSelectedPipeline] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<PipelineSettings>({
    ...DEFAULT_PIPELINE_SETTINGS,
  });
  const [showSettings, setShowSettings] = React.useState(false);
  const [activeSubTab, setActiveSubTab] = React.useState<SubTabId>("overview");
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    settingsService
      .getPipelineSettings()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch(console.error);
    // Abort any in-flight scan when the tab unmounts so it stops hitting the
    // API and never updates state on an unmounted component.
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  const handleScan = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const projectService = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService
      );
      const project = await projectService.getProject();
      if (!project) {
        throw new Error("Could not determine the current project.");
      }

      const service = new PipelineDataService();
      const result = await service.fetchPipelineData(
        project.name,
        settings,
        (message, percent) => {
          if (abortRef.current === controller) setProgress({ message, percent });
        },
        controller.signal
      );

      // A newer scan (or a cancel) superseded this one: drop the stale result.
      if (abortRef.current !== controller || controller.signal.aborted) return;

      setData(result);
      if (result.pipelines.length > 0) {
        setSelectedPipeline(result.pipelines[0].name);
      }
    } catch (err: any) {
      if (abortRef.current !== controller || controller.signal.aborted) return;
      if (err?.message !== "Aborted") {
        setError(err?.message ?? "An error occurred while scanning pipelines.");
      }
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const selectedData = data?.pipelines.find((p) => p.name === selectedPipeline);

  return (
    <div>
      <div className="ax-toolbar">
        <Button variant="primary" icon={<IconPlay />} onClick={handleScan} busy={loading}>
          {loading ? "Scanning..." : "Scan Pipelines"}
        </Button>
        {loading && (
          <Button icon={<IconStop />} onClick={handleCancel}>
            Cancel
          </Button>
        )}
        <Button
          icon={<IconSettings />}
          onClick={() => setShowSettings(!showSettings)}
          aria-expanded={showSettings}
        >
          {showSettings ? "Hide Settings" : "Settings"}
        </Button>
      </div>

      {showSettings && (
        <Card title="Pipeline Settings">
          <div className="ax-form-grid">
            <div className="ax-field">
              <label className="ax-label" htmlFor="pa-time-period">
                Time Period (days)
              </label>
              <input
                id="pa-time-period"
                className="ax-input"
                type="number"
                min={1}
                value={settings.timePeriodDays}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, timePeriodDays: Number(e.target.value) || 30 }))
                }
              />
            </div>
            <div className="ax-field">
              <label className="ax-label" htmlFor="pa-cost-per-minute">
                Cost per Minute ($)
              </label>
              <input
                id="pa-cost-per-minute"
                className="ax-input"
                type="number"
                step="0.01"
                min={0}
                value={settings.costPerMinute}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, costPerMinute: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="ax-field">
              <label className="ax-label" htmlFor="pa-queue-wait-warning">
                Queue Wait Warning (seconds)
              </label>
              <input
                id="pa-queue-wait-warning"
                className="ax-input"
                type="number"
                min={0}
                value={settings.queueWaitWarningSeconds}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    queueWaitWarningSeconds: Number(e.target.value) || 300,
                  }))
                }
              />
            </div>
          </div>
          <div className="ax-row" style={{ marginTop: 8 }}>
            <Button
              variant="primary"
              onClick={() => {
                settingsService
                  .savePipelineSettings(settings)
                  .catch((err) => setError(err?.message ?? "Could not save settings."));
                setShowSettings(false);
              }}
            >
              Save Settings
            </Button>
          </div>
        </Card>
      )}

      {loading && (
        <div className="ax-section">
          <Progress label={progress.message} current={Math.round(progress.percent)} total={100} />
        </div>
      )}

      {error && (
        <div className="ax-section">
          <Banner tone="error" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        </div>
      )}

      {data && (
        <>
          <Tabs
            tabs={SUB_TABS}
            active={activeSubTab}
            onChange={(id) => setActiveSubTab(id as SubTabId)}
            aria-label="Pipeline analytics views"
          />

          {activeSubTab === "overview" && (
            <>
              <CostSummaryCards data={data} costPerMinute={settings.costPerMinute} />
              <PipelineRankingTable pipelines={data.pipelines} />
            </>
          )}

          {activeSubTab === "duration-trends" && (
            <>
              {data.pipelines.length > 0 && (
                <div className="ax-field ax-field--inline">
                  <label className="ax-label" htmlFor="pa-trend-pipeline">
                    Select pipeline for trend:
                  </label>
                  <select
                    id="pa-trend-pipeline"
                    className="ax-select"
                    value={selectedPipeline ?? ""}
                    onChange={(e) => setSelectedPipeline(e.target.value)}
                  >
                    {data.pipelines.map((p) => (
                      <option key={p.definitionId} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedData && (
                <DurationTrendChart
                  data={selectedData.durationTrend}
                  pipelineName={selectedData.name}
                />
              )}
              {data.pipelines.length === 0 && (
                <Card>
                  <EmptyState title="No pipeline data available. Run a scan first." />
                </Card>
              )}
            </>
          )}

          {activeSubTab === "failure-analysis" && <FailureAnalysis pipelines={data.pipelines} />}

          {activeSubTab === "queue-triggers" && (
            <>
              <QueueWaitChart queueAnalysis={data.queueAnalysis} />
              <TriggerAnalysis triggerStats={data.triggerStats} />
            </>
          )}
        </>
      )}
    </div>
  );
};
