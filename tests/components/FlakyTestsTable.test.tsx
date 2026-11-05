import * as React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FlakyTestsTable } from "@/components/FlakyTestsTable";
import { FlakyTest } from "@/models/testInterfaces";

const mockFlakyTests: FlakyTest[] = [
  {
    testName: "LoginTest.ShouldLoginSuccessfully",
    suiteName: "AuthTests.dll",
    flakyRate: 0.4,
    recentResults: ["pass", "fail", "pass", "fail", "pass"],
    pipelineName: "Build API",
    avgDurationMs: 2500,
  },
  {
    testName: "PaymentTest.ProcessPayment",
    suiteName: "PaymentTests.dll",
    flakyRate: 0.3,
    recentResults: ["pass", "pass", "fail", "pass", "pass", "fail"],
    pipelineName: "Build Backend",
    avgDurationMs: 45000,
  },
];

describe("FlakyTestsTable", () => {
  it("should render flaky test names", () => {
    render(<FlakyTestsTable flakyTests={mockFlakyTests} />);

    expect(screen.getByText("LoginTest.ShouldLoginSuccessfully")).toBeInTheDocument();
    expect(screen.getByText("PaymentTest.ProcessPayment")).toBeInTheDocument();
  });

  it("should render the Flaky Tests heading", () => {
    render(<FlakyTestsTable flakyTests={mockFlakyTests} />);
    expect(screen.getByText("Flaky Tests")).toBeInTheDocument();
  });

  it("should render suite names", () => {
    render(<FlakyTestsTable flakyTests={mockFlakyTests} />);

    expect(screen.getByText("AuthTests.dll")).toBeInTheDocument();
    expect(screen.getByText("PaymentTests.dll")).toBeInTheDocument();
  });

  it("should render pipeline names", () => {
    render(<FlakyTestsTable flakyTests={mockFlakyTests} />);

    expect(screen.getByText("Build API")).toBeInTheDocument();
    expect(screen.getByText("Build Backend")).toBeInTheDocument();
  });

  it("should render flaky rate as percentage", () => {
    render(<FlakyTestsTable flakyTests={mockFlakyTests} />);

    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText("30.0%")).toBeInTheDocument();
  });

  it("should render formatted duration", () => {
    render(<FlakyTestsTable flakyTests={mockFlakyTests} />);

    // 2500ms -> 2.5s
    expect(screen.getByText("2.5s")).toBeInTheDocument();
    // 45000ms -> 45.0s
    expect(screen.getByText("45.0s")).toBeInTheDocument();
  });

  it("should render column headers", () => {
    render(<FlakyTestsTable flakyTests={mockFlakyTests} />);

    expect(screen.getByText("Test Name")).toBeInTheDocument();
    expect(screen.getByText("Suite")).toBeInTheDocument();
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Flaky Rate")).toBeInTheDocument();
    expect(screen.getByText("Recent Results")).toBeInTheDocument();
    expect(screen.getByText("Avg Duration")).toBeInTheDocument();
  });

  it("should render empty message when no flaky tests", () => {
    render(<FlakyTestsTable flakyTests={[]} />);
    expect(screen.getByText("No flaky tests detected")).toBeInTheDocument();
  });

  it("should render result indicators for each recent result", () => {
    const { container } = render(<FlakyTestsTable flakyTests={mockFlakyTests} />);

    // First test has 5 results, second has 6 = 11 total result divs
    const resultDivs = container.querySelectorAll('[title="pass"], [title="fail"]');
    expect(resultDivs.length).toBe(11);
  });
});
