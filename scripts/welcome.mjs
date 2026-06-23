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
  "Добро вече! 👋\n\n" +
  "Од сутра ћете сваког јутра, око 9:30, добијати кратку поруку са најважнијим вестима из Србије.\n\n" +
  "У поруци ће бити линк — само га додирните прстом и отвориће се лепа страница са свим вестима дана: " +
  "главне вести, политика, економија, спорт, култура, време и још много тога.\n\n" +
  "На страници можете да изаберете ћирилицу или латиницу, светлу или тамну позадину, " +
  "па чак и да Вам вести буду прочитане наглас. 🔊\n\n" +
  "Прва права порука стиже сутра ујутру. Пријатно читање! 📰☕";

const provider = (process.env.WHATSAPP_PROVIDER || "callmebot").toLowerCase();
console.log(`→ Провајдер: ${provider} | телефон: ${process.env.CALLMEBOT_PHONE || "(није подешен)"}`);
console.log("\n--- Текст поруке ---\n" + WELCOME + "\n--------------------\n");

const r = await notify("", { provider, text: WELCOME });
console.log(JSON.stringify(r, null, 2));
if (r.ok) console.log("\n✅ Послато! Погледај WhatsApp на телефону.");
else if (r.skipped) console.log("\nℹ️  Прескочено: " + r.reason + "  → попуни .env.");
else console.log("\n❌ Није успело — провери CALLMEBOT_PHONE и CALLMEBOT_APIKEY у .env.");
