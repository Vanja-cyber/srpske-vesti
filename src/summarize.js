// Позива Claude (Anthropic Messages API преко fetch-а, без SDK-а).
// Користи "tool use" да модел врати ИСКЉУЧИВО валидан JSON (API га валидира) —
// тако нема ломљења парсирања због наводника у српском тексту.

const SYSTEM = `You are the chief editor of a daily Serbian news digest prepared for an older reader.
Read the provided news items (collected in the last 24h from Serbian media and agencies) and produce ONE clear, professional, well-structured daily digest by calling the "emit_digest" tool.

HARD RULES:
- Write EVERYTHING in Serbian, in CYRILLIC script (ћирилица). Natural, fluent, professional, easy for an older person. Avoid jargon and anglicisms.
- Remove duplicates. Merge items about the same event into a single entry and combine their sources/links.
- Order by importance (most important first) within each section.
- Use ONLY sources and URLs present in the input. NEVER invent facts, sources, or links. If unsure, omit.
- Be truthful and neutral.
- STYLE: professional, journalistic register, yet simple and clear for an older reader. Vary the greeting, the intro and your phrasing every day so the digest never reads as a fixed template.

SECTIONS — use these exact id / title / icon, keep this order, include a section ONLY if it has real items:
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

The greeting must be a neutral, professional one-line good-morning greeting in Serbian Cyrillic — do NOT address anyone by name.
Put ONLY genuinely urgent/safety items (severe weather, accidents, official warnings) in "hitno".`;

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Кратак, јасан наслов" },
    summary: { type: "string", description: "Резиме у више реченица" },
    facts: { type: "array", items: { type: "string" }, description: "Кратке кључне чињенице" },
    sources: { type: "array", items: { type: "string" }, description: "Имена извора из улаза" },
    links: { type: "array", items: { type: "string" }, description: "URL-ови из улаза" }
  },
  required: ["title", "summary"]
};

const DIGEST_SCHEMA = {
  type: "object",
  properties: {
    greeting: { type: "string" },
    intro: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          icon: { type: "string" },
          items: { type: "array", items: ITEM_SCHEMA }
        },
        required: ["id", "title", "icon", "items"]
      }
    }
  },
  required: ["greeting", "intro", "sections"]
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callTool({ apiKey, model, maxTokens, system, user, tool }) {
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name }
  });

  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(150000)
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Anthropic API ${res.status}`);
        if (process.env.LLM_DEBUG) console.error(`[llm] ${tool.name} retry ${attempt} (HTTP ${res.status})`);
        await sleep(2000 * attempt);
        continue;
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`);
      }
      const data = await res.json();
      if (process.env.LLM_DEBUG) console.error(`[llm] ${tool.name} stop=${data.stop_reason} out=${data.usage && data.usage.output_tokens}`);
      const block = (data.content || []).find((c) => c.type === "tool_use");
      if (!block || !block.input) throw new Error("Модел није вратио структуриран одговор.");
      return block.input;
    } catch (e) {
      lastErr = e;
      const transient = /fetch failed|terminated|timeout|aborted|ECONN|ETIMEDOUT|network/i.test(String(e && e.message));
      if (process.env.LLM_DEBUG) console.error(`[llm] ${tool.name} attempt ${attempt} error: ${e && e.message}`);
      if (attempt < 4 && transient) { await sleep(2000 * attempt); continue; }
      throw e;
    }
  }
  throw lastErr;
}

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
    ? "LENGTH: ULTRA-ДЕТАЉНО — резимеи од 4-6 реченица, по 4-6 кључних чињеница, буди исцрпан."
    : "LENGTH: Сажето — резимеи од 2-4 реченице, по 2-4 кључне чињенице.";

  const user =
    `Данашњи датум: ${date}\n${lengthRule}\n\n` +
    `Прикупљени чланци (последња 24 часа):\n\n${list}\n\n` +
    `Позови алат "emit_digest" са дневним прегледом.`;

  const digest = await callTool({
    apiKey, model, maxTokens: ultra ? 20000 : 12000, system: SYSTEM, user,
    tool: { name: "emit_digest", description: "Врати структуриран дневни преглед вести.", input_schema: DIGEST_SCHEMA }
  });
  digest.date = date;
  return digest;
}

// Превод већ направљеног прегледа на француски (иста структура).
// Враћа { greeting, intro, sections, date } или null ако није могуће.
export async function translateToFrench(digest, opts = {}) {
  const { apiKey, model = "claude-sonnet-4-6" } = opts;
  if (!apiKey) return null;

  const system =
    "You translate a Serbian news digest into French by calling the emit_translation tool. " +
    "Keep the SAME structure and the SAME 'id', 'icon', 'sources' and 'links' values. " +
    "Translate ONLY: greeting, intro, each section 'title', and each item's 'title', 'summary' and 'facts'. " +
    "Use natural, fluent, simple and professional French for an older reader.";

  const payload = { greeting: digest.greeting, intro: digest.intro, sections: digest.sections };

  try {
    const fr = await callTool({
      apiKey, model, maxTokens: 8000, system,
      user: "Translate this digest to French via emit_translation:\n" + JSON.stringify(payload),
      tool: { name: "emit_translation", description: "Return the French translation of the digest.", input_schema: DIGEST_SCHEMA }
    });
    fr.date = digest.date;
    return fr;
  } catch {
    return null;
  }
}
