import Parser from "rss-parser";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "srpske-vesti/0.1 (+daily news digest)" },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumb"],
      ["content:encoded", "contentEncoded"]
    ]
  }
});

// Неки српски феедови имају неисправан XML (голи „&“, BOM…). Поправљамо најчешће.
function sanitizeXml(xml) {
  return xml
    .replace(/^﻿/, "")
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
}

// Дохвати и распарсирај феед, уз благ покушај поправке ако XML није валидан.
export async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "srpske-vesti/0.1 (+daily news digest)", Accept: "application/rss+xml, application/xml, text/xml, */*" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const xml = await res.text();
  try {
    return await parser.parseString(xml);
  } catch {
    return await parser.parseString(sanitizeXml(xml));
  }
}

// Извлачи слику из RSS ставке (enclosure / media / <img> у садржају).
function imageOf(it) {
  const enc = it.enclosure;
  if (enc && enc.url && (/^image\//.test(enc.type || "") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enc.url))) return enc.url;
  if (it.mediaThumb && it.mediaThumb.$ && it.mediaThumb.$.url) return it.mediaThumb.$.url;
  const mc = it.mediaContent;
  if (Array.isArray(mc)) {
    const hit = mc.find((m) => m && m.$ && m.$.url && /image|jpg|jpeg|png|webp/i.test(m.$.medium || m.$.type || m.$.url));
    if (hit) return hit.$.url;
  } else if (mc && mc.$ && mc.$.url) {
    return mc.$.url;
  }
  const html = it.contentEncoded || it.content || it["content:encoded"] || "";
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (m) return m[1];
  return "";
}

// Google News у наслову често има облик „Наслов - Извор“. Извлачимо извор.
function sourceFromTitle(title, fallback) {
  const m = /^(.*) - ([^-]+)$/.exec(String(title || "").trim());
  if (m && m[2].length <= 40) return { title: m[1].trim(), source: m[2].trim() };
  return { title: String(title || "").trim(), source: fallback };
}

// Сакупља чланке из свих извора, задржава само оне из последњих `hours` сати.
export async function collect(sources, hours = 24) {
  const since = Date.now() - hours * 3600 * 1000;
  const articles = [];
  const errors = [];

  const settled = await Promise.allSettled(sources.map(async (s) => ({ s, feed: await fetchFeed(s.url) })));

  for (let i = 0; i < settled.length; i++) {
    const s = sources[i];
    const r = settled[i];
    if (r.status === "rejected") {
      errors.push({ source: s.name, url: s.url, error: String(r.reason && r.reason.message ? r.reason.message : r.reason).slice(0, 80) });
      continue;
    }
    const isGN = /news\.google\.com/.test(s.url);
    for (const it of r.value.items || []) {
      const raw = it.isoDate || it.pubDate || "";
      const ts = raw ? Date.parse(raw) : NaN;
      if (!Number.isNaN(ts) && ts < since) continue;
      let title = (it.title || "").trim();
      let source = s.name;
      if (isGN) {
        const parsed = sourceFromTitle(title, s.name);
        title = parsed.title;
        source = parsed.source;
      }
      if (!title) continue;
      articles.push({
        title,
        link: it.link || "",
        source,
        category: s.category || "glavne",
        date: raw,
        image: isGN ? "" : imageOf(it),
        snippet: (it.contentSnippet || it.summary || "").replace(/\s+/g, " ").slice(0, 400).trim()
      });
    }
  }
  return { articles, errors };
}
