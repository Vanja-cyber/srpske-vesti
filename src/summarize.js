// Позива Claude (Anthropic Messages API преко fetch-а, без SDK-а)
// и враћа структуриран дневни преглед као JSON.

const SYSTEM = `You are the chief editor of a daily Serbian news digest prepared for an older reader.
Read the provided news items (collected in the last 24h from Serbian media and agencies) and produce ONE clear, professional, well-structured daily digest.

HARD RULES:
- Write EVERYTHING in Serbian, in CYRILLIC script (ћирилица). Natural, fluent, professional, easy for an older person. Avoid jargon and anglicisms.
- Output ONLY valid JSON. No markdown, no commentary, no code fences.
- Remove duplicates. Merge items about the same event into a single entry and combine their sources/links.
- Order by importance (most important first) within each section.
- Use ONLY sources and URLs present in the input. NEVER invent facts, sources, or links. If unsure, omit.
- Be truthful and neutral.
- STYLE: professional, journalistic register, yet simple and clear for an older reader. Vary the greeting, the intro and your phrasing every day so the digest never reads as a fixed template.

JSON SHAPE:
{
  "greeting": "neutral, professional one-line good-morning greeting in Serbian Cyrillic — do NOT address anyone by name",
  "intro": "1-2 sentence overview of the day in Serbian Cyrillic",
  "sections": [
    { "id": <allowed id>, "title": <Serbian Cyrillic title>, "icon": <emoji>,
      "items": [ { "title": "...", "summary": "...", "facts": ["...", "..."], "sources": ["RTS", "N1"], "links": ["https://..."] } ] }
  ]
}

ALLOWED SECTIONS (use these exact id/title/icon, keep this order, include a section ONLY if it has real items):
glavne-vesti | Главне вести | 📰
politika | Политика | 🏛️
ekonomija | Економија | 💰
srbija | Вести из земље | 🇷🇸
svet | Свет | 🌍
sport | Спорт | ⚽
tehnologija | Технологија | 💻
kultura | Култура | 🎭
zdravlje | Здравље | 🏥
dogadjaji | Важни догађаји | 📅
hitno | Хитне информације | 🚨

Put ONLY genuinely urgent/safety items (severe weather, accidents, official warnings) in "hitno".`;

export async function summarize(articles, opts = {}) {
  const { apiKey, model = "claude-sonnet-4-6", ultra = false, date } = opts;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY није постављен.");

  const list = articles
    .map((a, i) => {
      const srcs = (a.sources || [a.source]).join(", ");
      const url = (a.links && a.links[0]) || a.link || "";
      return `[${i}] (${a.category}) ${a.title}\nИзвори: ${srcs}\nURL: ${url}\n${a.snippet || ""}`;
    })
    .join("\n\n");

  const lengthRule = ultra
    ? "LENGTH: ULTRA-DETALJNO — резимеи од 4-6 реченица, по 4-6 кључних чињеница, буди исцрпан."
    : "LENGTH: Сажето — резимеи од 2-4 реченице, по 2-4 кључне чињенице.";

  const user =
    `Данашњи датум: ${date}\n${lengthRule}\n\n` +
    `Прикупљени чланци (последња 24 часа):\n\n${list}\n\n` +
    `Направи дневни преглед сада, искључиво као JSON по задатој шеми.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: ultra ? 8000 : 5000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }]
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`);
  }

  const data = await res.json();
  let text = (data.content || []).map((c) => c.text || "").join("").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const digest = JSON.parse(text);
  digest.date = date;
  return digest;
}

// Превод већ направљеног прегледа на француски (исти JSON облик).
// Враћа { greeting, intro, sections, date } или null ако није могуће.
export async function translateToFrench(digest, opts = {}) {
  const { apiKey, model = "claude-sonnet-4-6" } = opts;
  if (!apiKey) return null;

  const system =
    "Translate the given Serbian news-digest JSON into French. Keep the EXACT same JSON structure and keys. " +
    "Translate ONLY human-readable text: greeting, intro, each section 'title', and each item's 'title', 'summary', and 'facts'. " +
    "Do NOT change 'id', 'icon', 'sources', 'links', or 'date'. " +
    "Use natural, fluent, simple and warm French suitable for an elderly reader. Output ONLY the JSON, no code fences.";

  const payload = {
    greeting: digest.greeting,
    intro: digest.intro,
    date: digest.date,
    sections: digest.sections
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: "JSON:\n" + JSON.stringify(payload) }]
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    let text = (data.content || []).map((c) => c.text || "").join("").trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const fr = JSON.parse(text);
    fr.date = digest.date;
    return fr;
  } catch {
    return null;
  }
}
