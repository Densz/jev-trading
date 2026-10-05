import type { AnalysisInputV2, NewsArticle } from "@/types/analysis";

export function canonicalNewsUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  // Preserve identity-bearing parameters, particularly Finnhub's ?id=.
  url.searchParams.sort();
  return url.toString();
}
export function newsCategory(title: string): AnalysisInputV2["newsEvents"][number]["category"] {
  if (/should you|buy now|stocks to buy|look cheap|record high/i.test(title)) return "opinion";
  if (/earnings|quarterly|annual results|revenue|profit|financial results/i.test(title))
    return "earnings";
  if (/guidance|forecast|outlook/i.test(title)) return "guidance";
  if (/regulat|export|restriction|antitrust|lawsuit|investigation|tariff/i.test(title))
    return "regulation";
  if (/contract|launch|acqui|partnership|supply|customer|merger/i.test(title)) return "business";
  if (/cheap|expensive|should you|buy now|stocks to buy|record high|analyst|valuation/i.test(title))
    return "opinion";
  return "other";
}
export function normalizeNews(articles: NewsArticle[], now = new Date()): NewsArticle[] {
  const oldest = now.getTime() - 30 * 86400000;
  const score = (article: NewsArticle) =>
    (article.sourceType === "issuer-filing" ? 100 : 0) +
    { earnings: 40, guidance: 35, regulation: 30, business: 25, other: 10, opinion: 0 }[
      newsCategory(article.title)
    ];
  const clean = articles
    .filter((a) => {
      const time = new Date(a.publishedAt).getTime();
      try {
        return (
          Number.isFinite(time) &&
          time >= oldest &&
          time <= now.getTime() + 300000 &&
          /^https?:$/.test(new URL(a.url).protocol)
        );
      } catch {
        return false;
      }
    })
    .sort((a, b) => score(b) - score(a) || b.publishedAt.localeCompare(a.publishedAt));
  const result: NewsArticle[] = [];
  const words = (title: string) =>
    new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  for (const article of clean) {
    const titleWords = words(article.title);
    const duplicate = result.find((other) => {
      if (canonicalNewsUrl(other.url) === canonicalNewsUrl(article.url)) return true;
      const otherWords = words(other.title);
      const union = new Set([...titleWords, ...otherWords]).size;
      return union > 0 && [...titleWords].filter((w) => otherWords.has(w)).length / union >= 0.75;
    });
    if (duplicate) {
      if (canonicalNewsUrl(duplicate.url) !== canonicalNewsUrl(article.url)) {
        const related = [
          ...(duplicate.relatedSources ?? []),
          { source: article.source, url: article.url },
        ];
        duplicate.relatedSources = related
          .filter(
            (entry, index) =>
              related.findIndex(
                (other) => canonicalNewsUrl(other.url) === canonicalNewsUrl(entry.url),
              ) === index,
          )
          .slice(0, 4);
      }
      continue;
    }
    if (result.length < 12)
      result.push({
        ...article,
        title: article.title.slice(0, 300),
        source: article.source.slice(0, 100),
        summary: article.summary?.slice(0, 1000),
      });
  }
  return result;
}
export function buildNewsEvents(articles: NewsArticle[]): AnalysisInputV2["newsEvents"] {
  return articles.map((article, index) => ({
    id: `news-${index}`,
    category: newsCategory(article.title),
    title: article.title,
    reportedAt: article.publishedAt,
    sourceUrls: [article.url, ...(article.relatedSources ?? []).map((source) => source.url)],
    evidenceType: article.sourceType === "issuer-filing" ? "issuer-statement" : "publisher-summary",
  }));
}
