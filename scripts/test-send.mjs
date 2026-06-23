// Брзи тест слања WhatsApp поруке (без целог процеса).
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

const provider = (process.env.WHATSAPP_PROVIDER || "callmebot").toLowerCase();
const base = (process.env.SITE_BASE_URL || "").replace(/\/+$/, "");
const link = base ? base + "/" : "https://example.com/";
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date());

const digest = {
  date,
  analyzedCount: 0,
  sourceCount: 0,
  sections: [{ id: "glavne-vesti", items: [{ title: "Тест порука — Српске вести раде ✅" }] }]
};

console.log(`→ Провајдер: ${provider} | телефон: ${process.env.CALLMEBOT_PHONE || "(није подешен)"}`);
const r = await notify(link, { provider, digest });
console.log(JSON.stringify(r, null, 2));
if (r.ok) console.log("\n✅ Послато! Погледај WhatsApp на телефону.");
else if (r.skipped) console.log("\nℹ️  Прескочено: " + r.reason + "  → попуни .env (види упутство).");
else console.log("\n❌ Није успело — провери CALLMEBOT_PHONE и CALLMEBOT_APIKEY у .env.");
