// Шаље једнократну поруку добродошлице (нпр. вечерас, пре првог јутарњег прегледа).
// Користи .env (CALLMEBOT_PHONE, CALLMEBOT_APIKEY, WHATSAPP_PROVIDER).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { notify } from "../src/notify.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Учитај .env ако постоји
try {
  const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const WELCOME =
  "Драга бако, 👋\n\n" +
  "Од сада имаш свој лични дневни преглед вести, направљен посебно за тебе.\n\n" +
  "Сваког јутра, око 9:30, добићеш поруку овде на WhatsApp-у са најважнијим насловима из Србије и једним линком.\n\n" +
  "Када додирнеш линк прстом, отвориће се прегледна страница, лака за читање, са свим важним вестима дана разврстаним по темама: главне вести, политика, економија, свет, спорт, технологија, култура, здравље, време и хитна упозорења. За сваку тему имаш јасан наслов, кратак резиме, најважније чињенице и изворе.\n\n" +
  "Страница је направљена да буде пријатна: можеш бирати ћирилицу или латиницу, светлу или тамну позадину, увећати слова, па чак и да ти вести буду прочитане наглас. 🔊\n\n" +
  "Све ради аутоматски и потпуно је бесплатно за тебе — ништа не мораш да инсталираш ни да подешаваш, довољно је да сваког јутра додирнеш линк.\n\n" +
  "Пријатно читање и леп дан! 📰☕";

const provider = (process.env.WHATSAPP_PROVIDER || "callmebot").toLowerCase();
console.log(`→ Провајдер: ${provider} | телефон: ${process.env.CALLMEBOT_PHONE || "(није подешен)"}`);
console.log("\n--- Текст поруке ---\n" + WELCOME + "\n--------------------\n");

const r = await notify("", { provider, text: WELCOME });
console.log(JSON.stringify(r, null, 2));
if (r.ok) console.log("\n✅ Послато! Погледај WhatsApp на телефону.");
else if (r.skipped) console.log("\nℹ️  Прескочено: " + r.reason + "  → попуни .env.");
else console.log("\n❌ Није успело — провери CALLMEBOT_PHONE и CALLMEBOT_APIKEY у .env.");
