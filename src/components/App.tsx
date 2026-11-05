import * as React from "react";
import { BRAND, BrandGlyph } from "../brand";
import { AppShell, ErrorBoundary, Tabs } from "./ui";
import { PipelineAnalytics } from "./PipelineAnalytics";
import { TestHealth } from "./TestHealth";

type TabId = "pipeline-analytics" | "test-health";

const TABS: { id: TabId; label: string }[] = [
  { id: "pipeline-analytics", label: "Pipeline Analytics" },
  { id: "test-health", label: "Test Health" },
];

const AppInner: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<TabId>("pipeline-analytics");

  return (
    <AppShell
      title={BRAND.name}
      subtitle="Analytics and insights for your build pipelines and test health"
      mark={<BrandGlyph />}
    >
      <Tabs
        tabs={TABS}
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        aria-label="Pipeline Intelligence sections"
      />

      {activeTab === "pipeline-analytics" && <PipelineAnalytics />}
      {activeTab === "test-health" && <TestHealth />}
    </AppShell>
  );
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <AppInner />
  </ErrorBoundary>
);
