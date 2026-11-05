// Sample data for the demo build: a fictional "Contoso" project with seven
// pipelines, a month of builds and the test runs published by four of them.
// See demo/kit.ts for the helpers.
import { BuildResult, BuildStatus } from "azure-devops-extension-api/Build";
import {
  CommonServiceIds,
  clientFactory,
  delay,
  extensionDataService,
  projectPageService,
} from "./kit";

export { CommonServiceIds };

const DAY = 86_400_000;
const now = Date.now();

// Same input, same number in [0, 1): every screenshot run shows the same data.
const hash = (a: number, b = 0) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
// Spreads `rate` of the items evenly through a sequence, so a 6% failure rate
// really is about 6%.
const spread = (i: number, rate: number, offset = 0) => ((i + 1 + offset) * 0.6180339887) % 1 < rate;

const people = [
  { name: "Priya Shah", email: "priya.shah@contoso.com" },
  { name: "Tom Ellis", email: "tom.ellis@contoso.com" },
  { name: "Maria Lopez", email: "maria.lopez@contoso.com" },
  { name: "Sam Okafor", email: "sam.okafor@contoso.com" },
  { name: "Chen Wei", email: "chen.wei@contoso.com" },
  { name: "Ruth Adams", email: "ruth.adams@contoso.com" },
];

// ---- Pipelines and builds ----------------------------------------------------

interface PipelineDef {
  id: number;
  name: string;
  perWeekday: number; // builds on every weekday
  extra: number; // chance of one more on a weekday
  weekend: number; // chance of a build on a weekend day
  nightly?: boolean; // one scheduled build a night instead
  avgMin: number; // average build duration
  vary: number; // how much durations swing around the average
  failRate: number;
  who: number[]; // indexes into `people`, repeated to weight them
  tests?: boolean; // publishes test runs
}

const pipelines: PipelineDef[] = [
  { id: 12, name: "billing-api", perWeekday: 3, extra: 0.1, weekend: 0.1, avgMin: 11.4, vary: 0.25, failRate: 0.06, who: [0, 0, 0, 1, 1, 2, 3], tests: true },
  { id: 14, name: "web-portal", perWeekday: 3, extra: 0.5, weekend: 0.1, avgMin: 7.8, vary: 0.3, failRate: 0.08, who: [2, 2, 2, 4, 4, 0, 5], tests: true },
  { id: 17, name: "payments-worker", perWeekday: 1, extra: 0.8, weekend: 0.05, avgMin: 9.2, vary: 0.25, failRate: 0.05, who: [1, 1, 3, 3, 0, 4], tests: true },
  { id: 21, name: "notifications-service", perWeekday: 1, extra: 0.4, weekend: 0.05, avgMin: 5.6, vary: 0.2, failRate: 0.03, who: [5, 5, 2, 4, 3], tests: true },
  { id: 23, name: "mobile-app", perWeekday: 1, extra: 0.05, weekend: 0, avgMin: 21.5, vary: 0.6, failRate: 0.27, who: [4, 4, 4, 5, 5, 1] },
  { id: 26, name: "infra-terraform", perWeekday: 0, extra: 0.55, weekend: 0, avgMin: 14, vary: 0.3, failRate: 0.17, who: [3, 3, 3, 1] },
  { id: 29, name: "data-sync", perWeekday: 0, extra: 0, weekend: 0, nightly: true, avgMin: 18.2, vary: 0.2, failRate: 0.07, who: [3] },
];

// Busy windows: the queue is longest early in the morning midweek and after lunch.
const congestion = (weekday: number, hour: number) => {
  if ([2, 3, 4].includes(weekday) && (hour === 9 || hour === 10)) return 5;
  if (weekday === 1 && hour === 9) return 3;
  if ([3, 4].includes(weekday) && hour === 14) return 4;
  return 1;
};
const HOURS = [8, 9, 9, 9, 10, 10, 10, 11, 11, 12, 13, 13, 14, 14, 14, 15, 15, 16, 16, 17];

interface Slot {
  def: PipelineDef;
  queue: number;
  wait: number;
  mins: number;
}
const slots: Slot[] = [];
for (const def of pipelines) {
  for (let d = 0; d < 30; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    day.setHours(0, 0, 0, 0);
    const weekday = day.getDay();
    const weekend = weekday === 0 || weekday === 6;
    let count = 0;
    if (def.nightly) count = 1;
    else if (weekend) count = hash(def.id, d + 100) < def.weekend ? 1 : 0;
    else count = def.perWeekday + (hash(def.id, d + 200) < def.extra ? 1 : 0);
    for (let j = 0; j < count; j++) {
      const key = def.id * 31 + j;
      const hour = def.nightly ? 2 : HOURS[Math.floor(hash(key, d) * HOURS.length)];
      const at = new Date(day);
      at.setHours(hour, Math.floor(hash(key + 1, d) * 60), Math.floor(hash(key + 2, d) * 60));
      const wait = def.nightly
        ? 6 + hash(key + 3, d) * 8
        : (15 + hash(key + 3, d) * 30) * congestion(weekday, hour);
      const mins = def.avgMin * (1 - def.vary + 2 * def.vary * hash(key + 4, d));
      if (at.getTime() + wait * 1000 + mins * 60_000 < now - 60_000 && at.getTime() > now - 29.5 * DAY) {
        slots.push({ def, queue: at.getTime(), wait, mins });
      }
    }
  }
}
slots.sort((a, b) => a.queue - b.queue);

const builds: any[] = [];
const seen = new Map<number, number>(); // builds so far, per pipeline
slots.forEach((slot, n) => {
  const { def } = slot;
  const i = seen.get(def.id) ?? 0;
  seen.set(def.id, i + 1);
  let result = BuildResult.Succeeded;
  let mins = slot.mins;
  if (spread(i, def.failRate)) {
    result = BuildResult.Failed;
    mins *= 0.55;
  } else if (spread(i, 0.02, 7)) {
    result = BuildResult.Canceled;
    mins *= 0.25;
  } else if (spread(i, 0.03, 13)) {
    result = BuildResult.PartiallySucceeded;
  }
  const requester = people[def.who[Math.floor(hash(def.id, i + 300) * def.who.length)]];
  const start = slot.queue + slot.wait * 1000;
  builds.push({
    id: 5200 + n,
    buildNumber: `${new Date(slot.queue).toISOString().slice(0, 10).replace(/-/g, "")}.${i + 1}`,
    definition: { id: def.id, name: def.name },
    status: BuildStatus.Completed,
    result,
    queueTime: new Date(slot.queue),
    startTime: new Date(start),
    finishTime: new Date(start + mins * 60_000),
    requestedFor: { displayName: requester.name, uniqueName: requester.email },
  });
});
// The Build API returns the latest finished build first.
builds.sort((a, b) => b.finishTime - a.finishTime);
const buildById = new Map(builds.map((b) => [b.id, b]));

// ---- Tests -------------------------------------------------------------------

interface SuiteDef {
  pipeline: string;
  runTitle: string;
  prefix: string;
  /** Where the tests live: an assembly for .NET, a file for Jest (then storage per test). */
  storage: string | null;
  tests: string[];
}
const suites: SuiteDef[] = [
  {
    pipeline: "billing-api",
    runTitle: "VSTest Test Run release any cpu",
    prefix: "Billing.",
    storage: "Billing.Tests.dll",
    tests: [
      "InvoiceCalculatorTests.RoundsHalfUpToTwoDecimals",
      "InvoiceCalculatorTests.AppliesVolumeDiscount",
      "InvoiceCalculatorTests.ReturnsZeroForEmptyInvoice",
      "InvoiceCalculatorTests.HandlesMixedTaxRates",
      "TaxRateProviderTests.LooksUpRateByCountry",
      "TaxRateProviderTests.FallsBackToDefaultRate",
      "TaxRateProviderTests.CachesRatesForAnHour",
      "CurrencyConverterTests.ConvertsUsingDailyRate",
      "CurrencyConverterTests.RejectsUnknownCurrency",
      "CurrencyConverterTests.RoundsToCurrencyPrecision",
      "CreditNoteServiceTests.LinksNoteToInvoice",
      "CreditNoteServiceTests.PreventsOverRefund",
      "CreditNoteServiceTests.NumbersNotesInSequence",
      "LedgerExporterTests.WritesHeaderRow",
      "LedgerExporterTests.EscapesCommasInDescriptions",
      "LedgerExporterTests.ExportsLargeLedger",
      "PaymentScheduleTests.SplitsIntoEqualInstalments",
      "PaymentScheduleTests.PutsRemainderOnFirstInstalment",
      "PaymentScheduleTests.SkipsBankHolidays",
      "InvoiceRepositoryTests.MigratesLegacyInvoices",
      "InvoiceRepositoryTests.RollsBackOnConflict",
      "CustomerLookupTests.FindsByAccountNumber",
      "CustomerLookupTests.IgnoresClosedAccounts",
      "CustomerLookupTests.PagesLargeResultSets",
    ],
  },
  {
    pipeline: "web-portal",
    runTitle: "Jest unit tests",
    prefix: "",
    storage: null,
    tests: [
      "src/checkout/CheckoutForm.test.tsx|CheckoutForm > validates postcode",
      "src/checkout/CheckoutForm.test.tsx|CheckoutForm > disables pay button while submitting",
      "src/checkout/CheckoutForm.test.tsx|CheckoutForm > shows saved cards after sign in",
      "src/checkout/CheckoutForm.test.tsx|CheckoutForm > shows an error when the card is declined",
      "src/checkout/BasketSummary.test.tsx|BasketSummary > totals line items",
      "src/checkout/BasketSummary.test.tsx|BasketSummary > applies promo code",
      "src/checkout/BasketSummary.test.tsx|BasketSummary > hides promo field when basket is empty",
      "src/account/ProfilePage.test.tsx|ProfilePage > loads the signed-in user",
      "src/account/ProfilePage.test.tsx|ProfilePage > saves changed email",
      "src/account/ProfilePage.test.tsx|ProfilePage > rejects invalid phone numbers",
      "src/auth/SessionTimeout.test.tsx|SessionTimeout > warns two minutes before expiry",
      "src/auth/SessionTimeout.test.tsx|SessionTimeout > signs out when the timer ends",
      "src/reports/ReportTable.test.tsx|ReportTable > sorts by column",
      "src/reports/ReportTable.test.tsx|ReportTable > renders 10k rows without freezing",
      "src/reports/ReportTable.test.tsx|ReportTable > exports visible rows to CSV",
      "src/search/SearchBox.test.tsx|SearchBox > debounces input",
      "src/search/SearchBox.test.tsx|SearchBox > clears results on escape",
      "src/search/SearchBox.test.tsx|SearchBox > highlights matches",
      "e2e/checkout.spec.ts|checkout > completes purchase with saved card",
      "e2e/login.spec.ts|login > redirects to the requested page",
    ],
  },
  {
    pipeline: "payments-worker",
    runTitle: "VSTest Test Run release any cpu",
    prefix: "Payments.",
    storage: "Payments.Tests.dll",
    tests: [
      "RetryPolicyTests.BacksOffOnTransientError",
      "RetryPolicyTests.GivesUpAfterMaxAttempts",
      "RetryPolicyTests.DoesNotRetryDeclines",
      "SettlementBatchTests.ProcessesFullDayBatch",
      "SettlementBatchTests.SkipsAlreadySettledPayments",
      "SettlementBatchTests.ReportsTotalsPerMerchant",
      "WebhookSignerTests.SignsPayloadWithSharedSecret",
      "WebhookSignerTests.RejectsStaleTimestamps",
      "RefundProcessorTests.RefundsToOriginalCard",
      "RefundProcessorTests.CapsRefundAtCaptured",
      "IdempotencyStoreTests.ReturnsStoredResponse",
      "IdempotencyStoreTests.ExpiresKeysAfter24Hours",
      "QueueConsumerTests.AcknowledgesAfterSuccess",
      "QueueConsumerTests.DeadLettersPoisonMessages",
    ],
  },
  {
    pipeline: "notifications-service",
    runTitle: "Unit tests",
    prefix: "Notifications.",
    storage: "Notifications.Tests.dll",
    tests: [
      "EmailQueueTests.DeliversInOrder",
      "EmailQueueTests.RetriesBouncedMessages",
      "EmailQueueTests.DropsMessagesForUnsubscribedUsers",
      "TemplateRendererTests.FillsPlaceholders",
      "TemplateRendererTests.EscapesHtmlInValues",
      "TemplateRendererTests.FallsBackToDefaultLocale",
      "SmsGatewayTests.TruncatesLongMessages",
      "SmsGatewayTests.NormalisesPhoneNumbers",
      "DigestBuilderTests.GroupsByProject",
      "DigestBuilderTests.SkipsEmptyDigests",
      "PreferenceStoreTests.DefaultsToEmailOnly",
    ],
  },
];

// Tests that fail now and then (share of runs), take a long time (average ms),
// or are switched off. Everything else passes in 20 to 420 ms.
const flaky: Record<string, number> = {
  "CurrencyConverterTests.ConvertsUsingDailyRate": 0.3,
  "LedgerExporterTests.ExportsLargeLedger": 0.2,
  "CheckoutForm > shows saved cards after sign in": 0.35,
  "SessionTimeout > warns two minutes before expiry": 0.2,
  "RetryPolicyTests.BacksOffOnTransientError": 0.25,
  "EmailQueueTests.DeliversInOrder": 0.15,
};
const slow: Record<string, number> = {
  "InvoiceRepositoryTests.MigratesLegacyInvoices": 64_000,
  "SettlementBatchTests.ProcessesFullDayBatch": 112_000,
  "checkout > completes purchase with saved card": 48_000,
  "ReportTable > renders 10k rows without freezing": 33_000,
  "InvoiceRepositoryTests.RollsBackOnConflict": 4_200,
  "LedgerExporterTests.ExportsLargeLedger": 2_600,
  "login > redirects to the requested page": 5_200,
};
const skipped = new Set(["CustomerLookupTests.PagesLargeResultSets", "QueueConsumerTests.AcknowledgesAfterSuccess"]);

const testRuns: any[] = [];
const resultsByRun = new Map<number, any[]>();
let testIndex = 0;
for (const suite of suites) {
  const defn = pipelines.find((p) => p.name === suite.pipeline)!;
  const first = testIndex;
  testIndex += suite.tests.length;
  let published = 0;
  // About a third of the pipeline's builds publish a test run.
  const own = builds
    .filter((b) => b.definition.id === defn.id && b.result !== BuildResult.Canceled)
    .reverse();
  own.forEach((build, runIndex) => {
    if (!spread(runIndex, 0.34, defn.id)) return;
    const k = published++;
    const runId = 9000 + testRuns.length;
    const completed = new Date(build.finishTime.getTime() - 20_000);
    const started = new Date(build.startTime.getTime() + (build.finishTime - build.startTime) * 0.5);
    const results = suite.tests.map((entry, t) => {
      const [storage, name] = entry.includes("|") ? entry.split("|") : [suite.storage, entry];
      const isSkipped = skipped.has(name);
      let outcome = "Passed";
      if (isSkipped) outcome = "NotExecuted";
      else if (flaky[name] && spread(k + (first + t) * 3, flaky[name])) outcome = "Failed";
      const ms = isSkipped
        ? 0
        : (slow[name] ?? 20 + hash(first + t) * 400) * (0.85 + 0.3 * hash(first + t, runId));
      return {
        id: runId * 1000 + t,
        testCaseTitle: suite.prefix ? name.split(".").pop() : name,
        automatedTestName: suite.prefix + name,
        automatedTestStorage: storage,
        outcome,
        durationInMs: Math.round(ms),
        completedDate: completed,
      };
    });
    resultsByRun.set(runId, results);
    const failed = results.filter((r) => r.outcome === "Failed").length;
    testRuns.push({
      id: runId,
      name: suite.runTitle,
      state: "Completed",
      build: { id: build.id },
      startedDate: started,
      completedDate: completed,
      lastUpdatedDate: completed,
      totalTests: results.length,
      passedTests: results.filter((r) => r.outcome === "Passed").length,
      failedTests: failed,
      unanalyzedTests: 0,
    });
  });
}

// ---- Services and clients ----------------------------------------------------

const settings = extensionDataService({
  "pipeline-intelligence-settings": {
    "pipeline-settings": {
      timePeriodDays: 30,
      costPerMinute: 0.04,
      queueWaitWarningSeconds: 300,
      excludedDefinitionIds: [],
    },
    "test-health-settings": { timePeriodDays: 30, flakyWindowSize: 10, slowTestThresholdMs: 30000 },
  },
});

export const services: Record<string, unknown> = {
  [CommonServiceIds.ProjectPageService]: projectPageService("Contoso"),
  [CommonServiceIds.ExtensionDataService]: settings,
};

const page = <T>(items: T[], continuationToken?: string) =>
  Object.assign(items, { continuationToken });

export const getClient = clientFactory({
  BuildRestClient: {
    // getBuilds(project, definitions, queues, buildNumber, minTime, maxTime, requestedFor,
    //   reasonFilter, statusFilter, ..., branchName, buildIds, ...): buildIds is the 19th argument.
    getBuilds: (...args: any[]) => {
      const minTime: Date | undefined = args[4];
      const buildIds: number[] | undefined = args[18];
      const found = buildIds
        ? buildIds.map((id) => buildById.get(id)).filter(Boolean)
        : builds.filter((b) => !minTime || b.queueTime >= minTime);
      return delay(page(found as any[]), buildIds ? 120 : 450);
    },
  },
  TestRestClient: {
    // queryTestRuns(project, minLastUpdatedDate, maxLastUpdatedDate, state, planIds, isAutomated,
    //   publishContext, buildIds, buildDefIds, branchName, releaseIds, releaseDefIds,
    //   releaseEnvIds, releaseEnvDefIds, runTitle, top, continuationToken)
    queryTestRuns: (...args: any[]) => {
      const [, min, max] = args as [string, Date, Date];
      const top: number = args[15] ?? 100;
      const offset = Number(args[16] ?? 0);
      const inSpan = testRuns
        .filter((r) => r.lastUpdatedDate >= min && r.lastUpdatedDate <= max)
        .sort((a, b) => b.lastUpdatedDate - a.lastUpdatedDate);
      const more = offset + top < inSpan.length;
      return delay(page(inSpan.slice(offset, offset + top), more ? String(offset + top) : undefined), 90);
    },
    // getTestResults(project, runId, detailsToInclude, skip, top)
    getTestResults: (_project: string, runId: number, _details: unknown, skip = 0, top = 1000) =>
      delay((resultsByRun.get(runId) ?? []).slice(skip, skip + top), 12),
  },
});
