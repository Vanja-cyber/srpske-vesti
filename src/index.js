import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "./collect.js";
import { dedup } from "./cluster.js";
import { summarize, translateToFrench } from "./summarize.js";
import { getWeather } from "./weather.js";
import { renderDocument, renderArchive } from "./render.js";
import { notify } from "./notify.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const MOCK = args.has("--mock");
const NOSEND = args.has("--no-send");
const ULTRA = args.has("--ultra");
const SENDONLY = args.has("--send-only");

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; }
}
function writeJson(p, o) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(o, null, 2));
}

const settings = readJson(path.join(ROOT, "config/settings.json"), {});
const sources = readJson(path.join(ROOT, "config/sources.json"), []);
const TZ = settings.timezone || "Europe/Belgrade";

function dateStr(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d);
}
function nowSr() {
  try {
    return new Intl.DateTimeFormat("sr-RS", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

async function main() {
  const date = dateStr();
  const docsDir = path.join(ROOT, "docs");
  fs.mkdirSync(path.join(docsDir, "arhiva"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });

  // Режим „само слање“: учита већ припремљен преглед и пошаље WhatsApp (без анализе).
  if (SENDONLY) {
    const prepared = readJson(path.join(ROOT, "data", `${date}.json`), null);
    const base = (process.env.SITE_BASE_URL || settings.siteBaseUrl || "").replace(/\/+$/, "");
    const link = base ? `${base}/` : "(SITE_BASE_URL није подешен)";
    const sendResult = prepared
      ? await notify(link, { provider: settings.whatsapp && settings.whatsapp.provider, digest: prepared })
      : { ok: false, error: `нема припремљеног прегледа за ${date}` };
    const logsPath = path.join(ROOT, "data", "logs.json");
    const logs = readJson(logsPath, []);
    logs.unshift({ ts: new Date().toISOString(), date, phase: "send", send: sendResult });
    writeJson(logsPath, logs.slice(0, 200));
    console.log("WhatsApp (слање):", JSON.stringify(sendResult));
    return;
  }

  const meta = { collected: 0, dedup: 0, feedErrors: [] };
  let digest;

  if (MOCK) {
    digest = mockDigest(date);
  } else {
    const { articles, errors } = await collect(sources, settings.lookbackHours || 24);
    meta.collected = articles.length;
    meta.feedErrors = errors;
    const deduped = dedup(articles).slice(0, settings.maxArticles || 120);
    meta.dedup = deduped.length;
    const ultra = ULTRA || !!settings.ultra;
    digest = await summarize(deduped, {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: ultra ? settings.ultraModel || "claude-opus-4-8" : settings.model || "claude-sonnet-4-6",
      ultra,
      date
    });
    // Слике из RSS-а — повежи их са вестима преко линка.
    const imgByLink = new Map();
    for (const a of deduped) {
      if (!a.image) continue;
      for (const l of a.links || [a.link]) if (l && !imgByLink.has(l)) imgByLink.set(l, a.image);
    }
    attachImages(digest.sections, imgByLink);
    digest.usedSources = usedSourcesOf(digest);
    digest.analyzedCount = meta.collected;
    digest.sourceCount = sources.length;
    if (settings.weather && settings.weather.enabled) {
      const w = await getWeather(settings.weather.lat, settings.weather.lon);
      if (w) digest.weather = { city: settings.weather.city || "Београд", ...w };
    }
    // Француски превод (опционо; ако не успе, дугме „Français“ се не приказује).
    const fr = await translateToFrench(digest, { apiKey: process.env.ANTHROPIC_API_KEY, model: settings.model || "claude-sonnet-4-6" });
    if (fr) { copyImages(digest.sections, fr.sections); digest.fr = fr; }
  }

  const generatedAt = nowSr();
  const html = renderDocument(digest, { generatedAt, defaultScript: settings.defaultScript || "cyrillic" });

  fs.writeFileSync(path.join(docsDir, "index.html"), html);
  fs.writeFileSync(path.join(docsDir, "arhiva", `${date}.html`), html);
  writeJson(path.join(ROOT, "data", `${date}.json`), digest);

  // Историја
  const histPath = path.join(ROOT, "data", "history.json");
  const history = readJson(histPath, []);
  const sectionCount = (digest.sections || []).length;
  const itemCount = (digest.sections || []).reduce((a, s) => a + ((s.items || []).length), 0);
  const entry = { date, greeting: digest.greeting || "", generatedAt, sections: sectionCount, items: itemCount };
  const i = history.findIndex((h) => h.date === date);
  if (i >= 0) history[i] = entry; else history.unshift(entry);
  writeJson(histPath, history);

  fs.writeFileSync(path.join(docsDir, "arhiva.html"), renderArchive(history));

  // Слање
  let sendResult = { skipped: true, reason: "--no-send" };
  if (!NOSEND) {
    const base = (process.env.SITE_BASE_URL || settings.siteBaseUrl || "").replace(/\/+$/, "");
    const link = base ? `${base}/` : "(SITE_BASE_URL није подешен)";
    sendResult = await notify(link, { provider: settings.whatsapp && settings.whatsapp.provider, digest });
  }

  // Дневник
  const logsPath = path.join(ROOT, "data", "logs.json");
  const logs = readJson(logsPath, []);
  logs.unshift({
    ts: new Date().toISOString(), date,
    collected: meta.collected, dedup: meta.dedup,
    feedErrors: meta.feedErrors, sections: sectionCount, items: itemCount, send: sendResult
  });
  writeJson(logsPath, logs.slice(0, 200));

  console.log(`✓ Преглед за ${date} — секције: ${sectionCount}, вести: ${itemCount}${MOCK ? " (mock)" : ""}`);
  if (meta.feedErrors.length) console.log(`  ⚠ ${meta.feedErrors.length} извор(а) недоступно: ${meta.feedErrors.map((e) => e.source).join(", ")}`);
  if (!NOSEND) console.log("  WhatsApp:", JSON.stringify(sendResult));
}

// Повезује слике (по линку) са вестима које је модел вратио.
function attachImages(sections, map) {
  for (const s of sections || []) for (const it of s.items || []) {
    if (it.image) continue;
    for (const l of it.links || []) { if (map.has(l)) { it.image = map.get(l); break; } }
  }
}
// Скуп свих извора стварно коришћених у данашњем прегледу.
function usedSourcesOf(digest) {
  const set = new Set();
  for (const s of digest.sections || []) for (const it of s.items || []) for (const src of it.sources || []) if (src) set.add(src);
  return [...set].sort((a, b) => a.localeCompare(b, "sr"));
}
// Копира слике у француску структуру (исти редослед секција/вести).
function copyImages(srcSections, dstSections) {
  (srcSections || []).forEach((s, i) => (s.items || []).forEach((it, j) => {
    const d = dstSections && dstSections[i] && dstSections[i].items && dstSections[i].items[j];
    if (d && it.image) d.image = it.image;
  }));
}

function mockDigest(date) {
  return {
    date,
    analyzedCount: 1147,
    sourceCount: 23,
    usedSources: ["Politika", "Blic", "Večernje novosti", "Danas", "Kurir", "Informer", "Alo!", "RTS", "N1", "Nova", "Euronews Srbija", "B92", "Telegraf", "Tanjug", "Sputnik Srbija", "Pančevac"],
    greeting: "Добро јутро. Дневни преглед вести за данас.",
    overview: "Данас обележавају три велике теме. Влада Србије представила је пакет мера подршке најстаријима — од повећања најнижих пензија до помоћи за грејање — што је одмах постало главна тема разговора и у домовима и у Скупштини.\n\nУ исто време, у економији влада опрезни оптимизам: динар је стабилан, а цене основних намирница нису се значајније мењале, иако грађани и даље пажљиво прате своје трошкове.\n\nИз света стижу важне вести које се тичу и нас, док се у спорту пажња окреће ка репрезентацији и њеним припремама за наредни меч.\n\nУ наставку следе детаљни прегледи по темама, са изворима и линковима ако желите да прочитате више.",
    intro: "Данас у фокусу: седница Скупштине, кретања цена и припрема репрезентације за наредну утакмицу. Време пријатно за шетњу.",
    sections: [
      {
        id: "glavne-vesti", title: "Главне вести", icon: "📰",
        items: [
          {
            image: "https://picsum.photos/seed/rs-penzije/640/360",
            title: "Влада усвојила нове мере подршке пензионерима",
            summary: "Влада Србије усвојила је пакет мера усмерен на старије суграђане, укључујући повећање најнижих пензија и додатну помоћ за грејање током зиме. Мере ступају на снагу наредног месеца.",
            facts: ["Повећање најнижих пензија", "Додатак за грејање", "Примена од наредног месеца"],
            sources: ["RTS", "N1"],
            links: ["https://example.com/vest1", "https://example.com/vest1b"]
          },
          {
            image: "https://picsum.photos/seed/rs-put/640/360",
            title: "Радови на путу Београд–Нови Сад привремено успоравају саобраћај",
            summary: "Због редовног одржавања, на деоници аутопута очекују се мања успоравања у преподневним сатима. Возачима се саветује стрпљење и поштовање привремене сигнализације.",
            facts: ["Радови у преподневним сатима", "Могућа успоравања", "Привремена сигнализација"],
            sources: ["Danas"],
            links: ["https://example.com/vest2"]
          }
        ]
      },
      {
        id: "politika", title: "Политика", icon: "🏛️",
        items: [{
          title: "Скупштина расправља о буџету за наредну годину",
          summary: "Народна скупштина започела је расправу о предлогу буџета. Очекује се да заседање потраје неколико дана, уз дискусију о издвајањима за здравство и образовање.",
          facts: ["Расправа о буџету", "Тежиште на здравству и образовању"],
          sources: ["N1", "Nova.rs"],
          links: ["https://example.com/pol1", "https://example.com/pol1b"]
        }]
      },
      {
        id: "ekonomija", title: "Економија", icon: "💰",
        items: [{
          title: "Динар стабилан, цене основних намирница без већих промена",
          summary: "Курс динара остаје стабилан, а цене хлеба, млека и уља нису се значајније мењале у односу на прошлу недељу. Народна банка најављује наставак праћења инфлације.",
          facts: ["Стабилан курс динара", "Цене намирница стабилне"],
          sources: ["Euronews Србија"],
          links: ["https://example.com/eko1"]
        }]
      },
      {
        id: "sport", title: "Спорт", icon: "⚽",
        items: [{
          title: "Репрезентација Србије спрема се за наредну утакмицу",
          summary: "Фудбалска репрезентација наставила је припреме пред важан меч. Селектор је најавио да су сви играчи спремни и здрави.",
          facts: ["Сви играчи спремни", "Меч наредне недеље"],
          sources: ["N1 Спорт"],
          links: ["https://example.com/sport1"]
        }]
      },
      {
        id: "hitno", title: "Хитне информације", icon: "🚨",
        items: [{
          title: "РХМЗ: појачан ветар у поподневним сатима",
          summary: "Републички хидрометеоролошки завод упозорава на појачан ветар у току поподнева. Препоручује се опрез при шетњи и учвршћивање лаких предмета на терасама.",
          facts: ["Појачан ветар поподне", "Препоручен опрез"],
          sources: ["RHMZ"],
          links: ["https://example.com/hitno1"]
        }]
      }
    ],
    weather: {
      city: "Београд",
      current: { temperature_2m: 21, weather_code: 1 },
      daily: { temperature_2m_max: [24], temperature_2m_min: [13], weather_code: [1] }
    },
    fr: {
      date,
      greeting: "Bonjour. Voici l'aperçu de l'actualité du jour.",
      overview: "Trois grands thèmes dominent aujourd'hui. Le gouvernement serbe a présenté un ensemble de mesures de soutien aux plus âgés — de la hausse des plus petites retraites à l'aide au chauffage — devenu aussitôt le principal sujet de conversation, à la maison comme à l'Assemblée.\n\nDans le même temps, l'économie respire un optimisme prudent : le dinar est stable et les prix des produits de base n'ont guère bougé, même si chacun surveille ses dépenses.\n\nDu reste du monde nous parviennent des nouvelles importantes qui nous concernent aussi, tandis que le sport tourne son regard vers la sélection et sa préparation au prochain match.\n\nSuivent des aperçus détaillés par thème, avec les sources et des liens si vous souhaitez en lire davantage.",
      intro: "Aujourd'hui en bref : séance de l'Assemblée, évolution des prix et préparation de la sélection pour le prochain match. Temps agréable pour une promenade.",
      sections: [
        {
          id: "glavne-vesti", title: "À la une", icon: "📰",
          items: [
            {
              image: "https://picsum.photos/seed/rs-penzije/640/360",
              title: "Le gouvernement adopte de nouvelles mesures de soutien aux retraités",
              summary: "Le gouvernement serbe a adopté un ensemble de mesures destinées aux personnes âgées, dont une hausse des pensions les plus basses et une aide supplémentaire pour le chauffage en hiver. Les mesures entrent en vigueur le mois prochain.",
              facts: ["Hausse des pensions les plus basses", "Aide au chauffage", "Application le mois prochain"],
              sources: ["RTS", "N1"],
              links: ["https://example.com/vest1", "https://example.com/vest1b"]
            },
            {
              image: "https://picsum.photos/seed/rs-put/640/360",
              title: "Travaux sur l'autoroute Belgrade–Novi Sad : ralentissements temporaires",
              summary: "En raison de travaux d'entretien, de légers ralentissements sont attendus le matin sur une portion de l'autoroute. Il est conseillé aux automobilistes d'être patients et de respecter la signalisation temporaire.",
              facts: ["Travaux le matin", "Ralentissements possibles", "Signalisation temporaire"],
              sources: ["Danas"],
              links: ["https://example.com/vest2"]
            }
          ]
        },
        {
          id: "politika", title: "Politique", icon: "🏛️",
          items: [{
            title: "L'Assemblée débat du budget de l'année prochaine",
            summary: "L'Assemblée nationale a entamé le débat sur le projet de budget. La séance devrait durer plusieurs jours, avec des discussions sur les dépenses de santé et d'éducation.",
            facts: ["Débat sur le budget", "Accent sur la santé et l'éducation"],
            sources: ["N1", "Nova.rs"],
            links: ["https://example.com/pol1", "https://example.com/pol1b"]
          }]
        },
        {
          id: "ekonomija", title: "Économie", icon: "💰",
          items: [{
            title: "Le dinar stable, prix des produits de base quasi inchangés",
            summary: "Le cours du dinar reste stable et les prix du pain, du lait et de l'huile n'ont pas connu de variation notable par rapport à la semaine dernière. La Banque nationale poursuit son suivi de l'inflation.",
            facts: ["Cours du dinar stable", "Prix des denrées stables"],
            sources: ["Euronews Србија"],
            links: ["https://example.com/eko1"]
          }]
        },
        {
          id: "sport", title: "Sport", icon: "⚽",
          items: [{
            title: "La sélection serbe se prépare pour son prochain match",
            summary: "La sélection de football a poursuivi sa préparation avant un match important. Le sélectionneur a annoncé que tous les joueurs sont prêts et en bonne santé.",
            facts: ["Tous les joueurs prêts", "Match la semaine prochaine"],
            sources: ["N1 Спорт"],
            links: ["https://example.com/sport1"]
          }]
        },
        {
          id: "hitno", title: "Informations urgentes", icon: "🚨",
          items: [{
            title: "RHMZ : vent renforcé dans l'après-midi",
            summary: "L'Institut hydrométéorologique met en garde contre un vent renforcé dans l'après-midi. La prudence est recommandée lors des promenades, ainsi que de fixer les objets légers sur les terrasses.",
            facts: ["Vent renforcé l'après-midi", "Prudence recommandée"],
            sources: ["RHMZ"],
            links: ["https://example.com/hitno1"]
          }]
        }
      ]
    }
  };
}

main().catch((e) => {
  console.error("✗ Грешка:", e && e.message ? e.message : e);
  process.exit(1);
});
