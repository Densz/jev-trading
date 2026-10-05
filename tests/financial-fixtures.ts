export const fixtureCik = "0001234567";
export function companyFactsFixture() {
  const facts: Record<string, { units: Record<string, unknown[]> }> = {};
  const add = (
    concept: string,
    start: string | undefined,
    end: string,
    value: number,
    accession: string,
    form: string,
    unit = "USD",
  ) => {
    const filed = new Date(Date.parse(end) + 35 * 86400000).toISOString().slice(0, 10);
    const entry = (facts[concept] ??= { units: {} });
    (entry.units[unit] ??= []).push({ start, end, val: value, accn: accession, filed, form });
  };
  for (let year = 2023; year <= 2026; year++) {
    const quarterRevenue = (quarter: number) => 100 + (year - 2023) * 20 + quarter * 5;
    for (let quarter = 1; quarter <= 4; quarter++) {
      if (year === 2026 && quarter > 2) continue;
      const end = new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);
      const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1)).toISOString().slice(0, 10);
      const accession = `0001234567-${String(year).slice(2)}-${String(quarter).padStart(6, "0")}`;
      const annual = quarter === 4;
      const form = annual ? "10-K" : "10-Q";
      const ytdRevenue = Array.from({ length: quarter }, (_, i) => quarterRevenue(i + 1)).reduce(
        (sum, value) => sum + value,
        0,
      );
      const reportedStart = annual ? `${year}-01-01` : start;
      const reportedRevenue = annual ? ytdRevenue : quarterRevenue(quarter);
      for (const [concept, factor] of [
        ["RevenueFromContractWithCustomerExcludingAssessedTax", 1],
        ["GrossProfit", 0.6],
        ["OperatingIncomeLoss", 0.3],
        ["NetIncomeLoss", 0.2],
      ] as const) {
        add(concept, reportedStart, end, reportedRevenue * factor, accession, form);
        if (!annual && quarter > 1)
          add(concept, `${year}-01-01`, end, ytdRevenue * factor, accession, form);
      }
      add(
        "EarningsPerShareDiluted",
        reportedStart,
        end,
        reportedRevenue / 100,
        accession,
        form,
        "USD/shares",
      );
      add(
        "NetCashProvidedByUsedInOperatingActivities",
        `${year}-01-01`,
        end,
        ytdRevenue * 0.25,
        accession,
        form,
      );
      add(
        "PaymentsToAcquirePropertyPlantAndEquipment",
        `${year}-01-01`,
        end,
        ytdRevenue * 0.05,
        accession,
        form,
      );
      add("CashAndCashEquivalentsAtCarryingValue", undefined, end, 500, accession, form);
      add("LongTermDebtCurrent", undefined, end, 20, accession, form);
      add("LongTermDebtNoncurrent", undefined, end, 80, accession, form);
    }
  }
  return { cik: Number(fixtureCik), facts: { "us-gaap": facts } };
}
export const submissionsFixture = {
  filings: {
    recent: {
      accessionNumber: ["0001234567-26-000002", "0001234567-25-000004", "0001234567-26-000009"],
      filingDate: ["2026-08-04", "2026-02-04", "2026-08-01"],
      form: ["10-Q", "10-K", "8-K"],
      primaryDocument: ["quarterly.htm", "annual.htm", "release.htm"],
      items: ["", "", "2.02,9.01"],
    },
  },
};
export const filingHtmlFixture = `<html><head><script>alert('ignored')</script></head><body>
<p>Management expects revenue to grow in the upcoming quarter, subject to demand conditions and customer purchase commitments. The outlook is a company statement, not an independently verified prediction.</p>
<p>Our data center segment increased revenue due to demand from enterprise customers, while the consumer segment reported a different growth trajectory and product mix.</p>
<p>Export restrictions and customer concentration remain significant risks that could affect deliveries, operating margins, and future demand for our products.</p>
<p>Operating revenue increased year over year, while operating cash flow remained positive and capital expenditure funded the expansion of production capacity.</p>
</body></html>`;
