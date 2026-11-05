import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { TestHealthData, TestHealthSettings, DEFAULT_TEST_SETTINGS } from "@/models/testInterfaces";
import { TestHealthService } from "@/services/TestHealthService";
import { SettingsService } from "@/services/SettingsService";
import { Banner, Button, Card, IconPlay, IconSettings, IconStop, Progress } from "./ui";
import { TestSummaryCards } from "./TestSummaryCards";
import { TestRunHistory } from "./TestRunHistory";
import { FlakyTestsTable } from "./FlakyTestsTable";
import { SlowestTestsTable } from "./SlowestTestsTable";
import { TestTrendChart } from "./TestTrendChart";

const settingsService = new SettingsService();

export const TestHealth: React.FC = () => {
  const [data, setData] = React.useState<TestHealthData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState({ message: "", percent: 0 });
  const [settings, setSettings] = React.useState<TestHealthSettings>({ ...DEFAULT_TEST_SETTINGS });
  const [showSettings, setShowSettings] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    settingsService
      .getTestHealthSettings()
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

      const service = new TestHealthService();
      const result = await service.fetchTestHealth(
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
    } catch (err: any) {
      if (abortRef.current !== controller || controller.signal.aborted) return;
      if (err?.message !== "Aborted") {
        setError(err?.message ?? "An error occurred while scanning test health.");
      }
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  return (
    <div>
      <div className="ax-toolbar">
        <Button variant="primary" icon={<IconPlay />} onClick={handleScan} busy={loading}>
          {loading ? "Scanning..." : "Scan Test Health"}
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
        <Card title="Test Health Settings">
          <div className="ax-form-grid">
            <div className="ax-field">
              <label className="ax-label" htmlFor="th-time-period">
                Time Period (days)
              </label>
              <input
                id="th-time-period"
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
              <label className="ax-label" htmlFor="th-flaky-window">
                Flaky Window Size
              </label>
              <input
                id="th-flaky-window"
                className="ax-input"
                type="number"
                min={2}
                value={settings.flakyWindowSize}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, flakyWindowSize: Number(e.target.value) || 10 }))
                }
              />
            </div>
            <div className="ax-field">
              <label className="ax-label" htmlFor="th-slow-threshold">
                Slow Test Threshold (ms)
              </label>
              <input
                id="th-slow-threshold"
                className="ax-input"
                type="number"
                min={0}
                value={settings.slowTestThresholdMs}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    slowTestThresholdMs: Number(e.target.value) || 30000,
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
                  .saveTestHealthSettings(settings)
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
          <TestSummaryCards data={data} />
          <TestTrendChart data={data.testCountTrend} />
          <FlakyTestsTable flakyTests={data.flakyTests} />
          <SlowestTestsTable tests={data.slowestTests} />
          <TestRunHistory runs={data.runHistory} />
        </>
      )}
    </div>
  );
};
