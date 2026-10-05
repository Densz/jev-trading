import { z } from "zod";
import {
  financialReportsSchema,
  type FinancialMetrics,
  type FinancialPeriod,
  type FinancialReports,
  type FinancialSource,
} from "@/types/financials";
import { AppError } from "@/lib/errors";

const rawFactSchema = z.object({
  start: z.iso.date().optional(),
  end: z.iso.date(),
  val: z.number().finite(),
  accn: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
  filed: z.iso.date(),
  form: z.string(),
});
type Fact = z.infer<typeof rawFactSchema> & { concept: string; unit: string };
const concepts: Partial<Record<keyof FinancialMetrics, string[]>> = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "Revenue",
  ],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  dilutedEps: ["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"],
  operatingCashFlow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "CashFlowsFromUsedInOperatingActivities",
  ],
  capitalExpenditure: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
  ],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalents"],
  longTermDebt: [
    "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
    "LongTermDebtAndFinanceLeaseObligationsIncludingCurrentMaturities",
  ],
};
export const emptyMetrics = (): FinancialMetrics => ({
  revenue: null,
  grossProfit: null,
  operatingIncome: null,
  netIncome: null,
  dilutedEps: null,
  operatingCashFlow: null,
  capitalExpenditure: null,
  freeCashFlow: null,
  cash: null,
  longTermDebt: null,
  grossMarginPercent: null,
  operatingMarginPercent: null,
  netMarginPercent: null,
});
const days = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
const byLatest = (a: Fact, b: Fact) =>
  b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn);
export function normalizeCompanyFacts(
  raw: unknown,
  cik: string,
  now = new Date(),
): FinancialReports {
  const root = z
    .object({
      cik: z.number().int(),
      facts: z.record(
        z.string(),
        z.record(z.string(), z.object({ units: z.record(z.string(), z.array(z.unknown())) })),
      ),
    })
    .parse(raw);
  if (String(root.cik).padStart(10, "0") !== cik)
    throw new AppError("SYMBOL_MISMATCH", "SEC financial facts belong to another issuer.");
  const today = now.toISOString().slice(0, 10);
  const all: Fact[] = [];
  const wanted = new Set([
    ...Object.values(concepts).flat(),
    "LongTermDebtCurrent",
    "LongTermDebtNoncurrent",
  ]);
  for (const [taxonomy, entries] of Object.entries(root.facts)) {
    if (!["us-gaap", "ifrs-full"].includes(taxonomy)) continue;
    for (const [concept, data] of Object.entries(entries)) {
      if (!wanted.has(concept)) continue;
      for (const [unit, records] of Object.entries(data.units))
        for (const rawFact of records) {
          const parsed = rawFactSchema.safeParse(rawFact);
          if (
            parsed.success &&
            parsed.data.filed <= today &&
            parsed.data.end <= today &&
            parsed.data.filed >= parsed.data.end &&
            /^(10-K|10-Q|20-F|40-F|6-K)(\/A)?$/.test(parsed.data.form)
          )
            all.push({ ...parsed.data, concept: `${taxonomy}:${concept}`, unit });
        }
    }
  }
  const sources = new Map<string, FinancialSource>();
  const source = (fact: Fact) => {
    sources.set(fact.accn, {
      id: fact.accn,
      form: fact.form,
      filedAt: fact.filed,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${fact.accn.replaceAll("-", "")}/${fact.accn}-index.html`,
    });
    return fact.accn;
  };
  const factsFor = (metric: keyof FinancialMetrics, currency: string) => {
    const names = concepts[metric] ?? [];
    const unit = metric === "dilutedEps" ? `${currency}/shares` : currency;
    // Prefer a stable standard concept over mixing overlapping revenue definitions.
    for (const name of names) {
      const entries = all.filter((fact) => fact.concept.endsWith(`:${name}`) && fact.unit === unit);
      if (entries.length) return entries;
    }
    return [];
  };
  const revenueFacts = all.filter(
    (fact) =>
      concepts.revenue!.some((name) => fact.concept.endsWith(`:${name}`)) &&
      /^[A-Z]{3}$/.test(fact.unit) &&
      fact.start,
  );
  const currency = revenueFacts.sort(byLatest)[0]?.unit;
  if (!currency)
    throw new AppError(
      "NO_FINANCIAL_REPORTS",
      "No supported standard revenue facts were found in SEC filings.",
    );
  const revenue = factsFor("revenue", currency).filter((fact) => fact.start);
  const unique = new Map<
    string,
    { start: string; end: string; periodType: FinancialPeriod["periodType"] }
  >();
  for (const fact of revenue) {
    const length = days(fact.start!, fact.end);
    const periodType =
      length >= 330 && length <= 400
        ? "annual"
        : length >= 70 && length <= 110
          ? "quarterly"
          : length >= 150 && length <= 220
            ? "semiannual"
            : null;
    if (periodType)
      unique.set(`${fact.start}:${fact.end}`, { start: fact.start!, end: fact.end, periodType });
    // The final fiscal quarter may only be disclosed as annual minus nine-month revenue.
    if (periodType === "annual") {
      const prior = revenue
        .filter(
          (other) =>
            other.start === fact.start &&
            days(other.start!, other.end) >= 250 &&
            days(other.start!, other.end) <= 300 &&
            days(other.end, fact.end) >= 70 &&
            days(other.end, fact.end) <= 111,
        )
        .sort((a, b) => b.end.localeCompare(a.end))[0];
      if (prior) {
        const start = new Date(Date.parse(prior.end) + 86400000).toISOString().slice(0, 10);
        unique.set(`${start}:${fact.end}`, { start, end: fact.end, periodType: "quarterly" });
      }
    }
  }
  let derivedAcrossFilings = false;
  const build = (period: {
    start: string;
    end: string;
    periodType: FinancialPeriod["periodType"];
  }): FinancialPeriod => {
    const metrics = emptyMetrics();
    const provenance: FinancialPeriod["provenance"] = {};
    for (const metric of Object.keys(concepts) as (keyof FinancialMetrics)[]) {
      const facts = factsFor(metric, currency);
      const instant = metric === "cash" || metric === "longTermDebt";
      const direct = facts
        .filter(
          (fact) =>
            fact.end === period.end && (instant ? !fact.start : fact.start === period.start),
        )
        .sort(byLatest)[0];
      if (direct) {
        metrics[metric] = direct.val;
        provenance[metric] = {
          concept: direct.concept,
          sourceIds: [source(direct)],
          method: "reported",
        };
      } else if (period.periodType === "quarterly" && !instant && metric !== "dilutedEps") {
        const cumulative = facts
          .filter((fact) => fact.start && fact.start < period.start && fact.end === period.end)
          .sort(byLatest);
        for (const current of cumulative) {
          const previousEnd = new Date(Date.parse(period.start) - 86400000)
            .toISOString()
            .slice(0, 10);
          const previous = facts
            .filter(
              (fact) =>
                fact.start === current.start &&
                fact.end === previousEnd &&
                fact.concept === current.concept,
            )
            .sort(byLatest)[0];
          if (!previous) continue;
          metrics[metric] = current.val - previous.val;
          provenance[metric] = {
            concept: current.concept,
            sourceIds: [...new Set([source(current), source(previous)])],
            method: "difference",
          };
          if (current.accn !== previous.accn) derivedAcrossFilings = true;
          break;
        }
      }
    }
    const assignDerived = (
      key: keyof FinancialMetrics,
      value: number,
      operands: (keyof FinancialMetrics)[],
      method: "ratio" | "difference" | "sum",
    ) => {
      if (!Number.isFinite(value)) return;
      metrics[key] = value;
      provenance[key] = {
        concept: operands.join(method === "difference" ? " - " : " / "),
        sourceIds: [
          ...new Set(operands.flatMap((operand) => provenance[operand]?.sourceIds ?? [])),
        ].slice(0, 4),
        method,
      };
    };
    if (metrics.longTermDebt === null) {
      const debt = ["LongTermDebtCurrent", "LongTermDebtNoncurrent"].map(
        (concept) =>
          all
            .filter(
              (fact) =>
                fact.concept === `us-gaap:${concept}` &&
                fact.unit === currency &&
                !fact.start &&
                fact.end === period.end,
            )
            .sort(byLatest)[0],
      );
      if (debt.every((fact) => !!fact)) {
        metrics.longTermDebt = debt[0]!.val + debt[1]!.val;
        provenance.longTermDebt = {
          concept: "us-gaap:LongTermDebtCurrent + us-gaap:LongTermDebtNoncurrent",
          sourceIds: [...new Set(debt.map((fact) => source(fact!)))],
          method: "sum",
        };
      }
    }
    if (metrics.operatingCashFlow !== null && metrics.capitalExpenditure !== null)
      assignDerived(
        "freeCashFlow",
        metrics.operatingCashFlow - metrics.capitalExpenditure,
        ["operatingCashFlow", "capitalExpenditure"],
        "difference",
      );
    if (metrics.revenue !== null && metrics.revenue > 0)
      for (const [profit, margin] of [
        ["grossProfit", "grossMarginPercent"],
        ["operatingIncome", "operatingMarginPercent"],
        ["netIncome", "netMarginPercent"],
      ] as const)
        if (metrics[profit] !== null)
          assignDerived(
            margin,
            (metrics[profit] / metrics.revenue) * 100,
            [profit, "revenue"],
            "ratio",
          );
    return {
      id: `${period.periodType}:${period.start}:${period.end}`,
      periodType: period.periodType,
      startDate: period.start,
      endDate: period.end,
      currency,
      accountingBasis: "as-reported",
      metrics,
      provenance,
      changes: { revenueYoYPercent: null, dilutedEpsYoYPercent: null, grossMarginYoYPoints: null },
    };
  };
  // Keep comparison periods internally, but send only bounded recent periods to the engine.
  const periods = [...unique.values()]
    .sort((a, b) => b.end.localeCompare(a.end))
    .filter((period) => days(period.end, today) <= 5 * 366)
    .map(build);
  for (const current of periods) {
    const prior = periods.find(
      (other) =>
        other.periodType === current.periodType &&
        days(other.endDate, current.endDate) >= 345 &&
        days(other.endDate, current.endDate) <= 385 &&
        Math.abs(days(other.startDate, other.endDate) - days(current.startDate, current.endDate)) <=
          15,
    );
    if (!prior) continue;
    const growth = (key: "revenue" | "dilutedEps") =>
      current.metrics[key] !== null && prior.metrics[key] !== null && prior.metrics[key] > 0
        ? (current.metrics[key] / prior.metrics[key] - 1) * 100
        : null;
    current.changes = {
      revenueYoYPercent: growth("revenue"),
      dilutedEpsYoYPercent: growth("dilutedEps"),
      grossMarginYoYPoints:
        current.metrics.grossMarginPercent !== null && prior.metrics.grossMarginPercent !== null
          ? current.metrics.grossMarginPercent - prior.metrics.grossMarginPercent
          : null,
    };
    // Comparison filings are part of provenance even when outside the displayed window.
    for (const key of ["revenue", "dilutedEps", "grossProfit"])
      if (current.provenance[key] && prior.provenance[key])
        current.provenance[key].sourceIds = [
          ...new Set([...current.provenance[key].sourceIds, ...prior.provenance[key].sourceIds]),
        ].slice(0, 4);
  }
  const selected = {
    quarterly: periods.filter((p) => p.periodType === "quarterly").slice(0, 8),
    annual: periods.filter((p) => p.periodType === "annual").slice(0, 3),
    semiannual: periods.filter((p) => p.periodType === "semiannual").slice(0, 2),
  };
  const used = new Set(
    Object.values(selected)
      .flat()
      .flatMap((p) => Object.values(p.provenance).flatMap((entry) => entry.sourceIds)),
  );
  return financialReportsSchema.parse({
    provider: "SEC EDGAR",
    fetchedAt: now.toISOString(),
    cik,
    ...selected,
    sources: [...sources.values()].filter((entry) => used.has(entry.id)),
    excerpts: [],
    warnings: [
      "Standard company-level XBRL facts only; custom segment tags and non-GAAP measures are not automatically normalized.",
      "Long-term debt includes current maturities where reported; it is not a verified total of all borrowings.",
      ...(derivedAcrossFilings
        ? [
            "Some quarterly flows are derived from cumulative values in different filings; restatements can affect comparability. Diluted EPS is never derived by subtraction.",
          ]
        : []),
    ],
  });
}
