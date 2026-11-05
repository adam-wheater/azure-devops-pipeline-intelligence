import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PipelineRankingTable } from "@/components/PipelineRankingTable";
import { PipelineStats } from "@/models/interfaces";

const mockPipelines: PipelineStats[] = [
  {
    definitionId: 1,
    name: "Build API",
    totalRuns: 50,
    totalMinutes: 250,
    avgDurationMinutes: 5,
    avgQueueWaitSeconds: 30,
    failureRate: 0.1,
    durationTrend: [4, 5, 6, 5, 4, 5],
    isFlaky: false,
  },
  {
    definitionId: 2,
    name: "Build Frontend",
    totalRuns: 30,
    totalMinutes: 600,
    avgDurationMinutes: 20,
    avgQueueWaitSeconds: 60,
    failureRate: 0.35,
    durationTrend: [18, 20, 22, 19, 21],
    isFlaky: true,
  },
  {
    definitionId: 3,
    name: "Deploy Staging",
    totalRuns: 10,
    totalMinutes: 100,
    avgDurationMinutes: 10,
    avgQueueWaitSeconds: 15,
    failureRate: 0.05,
    durationTrend: [9, 10, 11, 10],
    isFlaky: false,
  },
];

describe("PipelineRankingTable", () => {
  it("should render all pipeline names", () => {
    render(<PipelineRankingTable pipelines={mockPipelines} />);

    expect(screen.getByText("Build API")).toBeInTheDocument();
    expect(screen.getByText("Build Frontend")).toBeInTheDocument();
    expect(screen.getByText("Deploy Staging")).toBeInTheDocument();
  });

  it("should render the Pipeline Ranking heading", () => {
    render(<PipelineRankingTable pipelines={mockPipelines} />);
    expect(screen.getByText("Pipeline Ranking")).toBeInTheDocument();
  });

  it("should display FLAKY badge for flaky pipelines", () => {
    render(<PipelineRankingTable pipelines={mockPipelines} />);
    expect(screen.getByText("FLAKY")).toBeInTheDocument();
  });

  it("should render column headers", () => {
    render(<PipelineRankingTable pipelines={mockPipelines} />);

    expect(screen.getByText("Pipeline Ranking")).toBeInTheDocument();
    expect(screen.getByText(/^Runs/)).toBeInTheDocument();
    expect(screen.getByText(/Total Min/)).toBeInTheDocument();
    expect(screen.getByText(/Avg Duration/)).toBeInTheDocument();
    expect(screen.getByText(/Avg Queue Wait/)).toBeInTheDocument();
    expect(screen.getByText(/Failure Rate/)).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
  });

  it("should sort when clicking on column headers", () => {
    render(<PipelineRankingTable pipelines={mockPipelines} />);

    // Default sort is by totalMinutes desc -> Build Frontend (600), Build API (250), Deploy Staging (100)
    const rows = screen.getAllByRole("row");
    // Row 0 is header, rows 1-3 are data
    expect(rows[1]).toHaveTextContent("Build Frontend");

    // Click on Runs header
    fireEvent.click(screen.getByText(/^Runs/));

    const rowsAfterSort = screen.getAllByRole("row");
    // Should now sort by totalRuns desc: Build API (50), Build Frontend (30), Deploy Staging (10)
    expect(rowsAfterSort[1]).toHaveTextContent("Build API");
  });

  it("should toggle sort direction on repeated click", () => {
    render(<PipelineRankingTable pipelines={mockPipelines} />);

    // Click Runs twice -> ascending
    fireEvent.click(screen.getByText(/^Runs/));
    fireEvent.click(screen.getByText(/^Runs/));

    const rows = screen.getAllByRole("row");
    // Ascending by runs: Deploy Staging (10), Build Frontend (30), Build API (50)
    expect(rows[1]).toHaveTextContent("Deploy Staging");
  });

  it("should render empty message when no pipelines", () => {
    render(<PipelineRankingTable pipelines={[]} />);
    expect(screen.getByText("No pipeline data available")).toBeInTheDocument();
  });

  it("should render failure rate percentages", () => {
    render(<PipelineRankingTable pipelines={mockPipelines} />);
    expect(screen.getByText("10.0%")).toBeInTheDocument();
    expect(screen.getByText("35.0%")).toBeInTheDocument();
    expect(screen.getByText("5.0%")).toBeInTheDocument();
  });
});
