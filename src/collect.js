import Parser from "rss-parser";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "srpske-vesti/0.1 (+daily news digest)" }
});

// Сакупља чланке из свих извора, задржава само оне из последњих `hours` сати.
export async function collect(sources, hours = 24) {
  const since = Date.now() - hours * 3600 * 1000;
  const articles = [];
  const errors = [];

  for (const s of sources) {
    try {
      const feed = await parser.parseURL(s.url);
      for (const it of feed.items || []) {
        const raw = it.isoDate || it.pubDate || "";
        const ts = raw ? Date.parse(raw) : NaN;
        // Без датума -> задржи; са датумом -> само ако је свеже.
        if (!Number.isNaN(ts) && ts < since) continue;
        const title = (it.title || "").trim();
        if (!title) continue;
        articles.push({
          title,
          link: it.link || "",
          source: s.name,
          category: s.category || "glavne",
          date: raw,
          snippet: (it.contentSnippet || it.summary || "").replace(/\s+/g, " ").slice(0, 400).trim()
        });
      }
    } catch (e) {
      errors.push({ source: s.name, url: s.url, error: String(e && e.message ? e.message : e) });
    }
  }
  return { articles, errors };
}
