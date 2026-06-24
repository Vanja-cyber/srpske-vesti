// Аутоматско постављање на GitHub (репо + код + кључеви + Pages + прво покретање).
// Потребне env промене: GH_TOKEN, ANTHROPIC_API_KEY, CALLMEBOT_PHONE, CALLMEBOT_APIKEY.
// Опционо: REPO (подразумевано "srpske-vesti").
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import _sodium from "libsodium-wrappers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = process.env.GH_TOKEN;
const REPO = process.env.REPO || "srpske-vesti";
const ANTHROPIC = process.env.ANTHROPIC_API_KEY || "";
const CB_PHONE = process.env.CALLMEBOT_PHONE || "";
const CB_KEY = process.env.CALLMEBOT_APIKEY || "";

if (!TOKEN) { console.error("✗ Недостаје GH_TOKEN."); process.exit(1); }

const API = "https://api.github.com";
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "srpske-vesti-deploy"
};

async function gh(method, url, body) {
  const r = await fetch(url.startsWith("http") ? url : API + url, {
    method,
    headers: { ...H, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: r.status, ok: r.ok, json };
}

function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const log = (m) => console.log(m);

// 1) Корисник
const me = await gh("GET", "/user");
if (!me.ok) { console.error("✗ Токен не ради:", me.status, me.json.message); process.exit(1); }
const OWNER = me.json.login;
const SITE = `https://${OWNER}.github.io/${REPO}`;
log(`✓ Пријављен као: ${OWNER}`);

// 2) Репо (направи ако не постоји)
let repo = await gh("GET", `/repos/${OWNER}/${REPO}`);
if (repo.status === 404) {
  const c = await gh("POST", "/user/repos", { name: REPO, private: false, description: "Дневни преглед српских вести", has_issues: false, has_wiki: false });
  if (!c.ok) { console.error("✗ Не могу да направим репо:", c.status, c.json.message); process.exit(1); }
  log(`✓ Репо направљен: ${OWNER}/${REPO}`);
} else if (repo.ok) {
  log(`• Репо већ постоји: ${OWNER}/${REPO}`);
} else {
  console.error("✗ Грешка код репоа:", repo.status, repo.json.message); process.exit(1);
}

// 3) Пуш кода
const authUrl = `https://${OWNER}:${TOKEN}@github.com/${OWNER}/${REPO}.git`;
git(["remote", "remove", "origin"]);
git(["remote", "add", "origin", authUrl]);
git(["branch", "-M", "main"]);
const push = git(["push", "-u", "origin", "main", "--force"]);
log(push.code === 0 ? "✓ Код послат (push) на GitHub" : "✗ Push није успео:\n" + push.out);
// очисти токен из remote-а
git(["remote", "set-url", "origin", `https://github.com/${OWNER}/${REPO}.git`]);
if (push.code !== 0) process.exit(1);

// 4) Тајне (шифроване)
await _sodium.ready;
const sodium = _sodium;
const pk = await gh("GET", `/repos/${OWNER}/${REPO}/actions/secrets/public-key`);
if (!pk.ok) { console.error("✗ Не могу да добавим кључ за тајне:", pk.status, pk.json.message); process.exit(1); }
async function setSecret(name, value) {
  if (!value) { log(`• (прескочено) тајна ${name} је празна`); return; }
  const enc = sodium.to_base64(
    sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(pk.json.key, sodium.base64_variants.ORIGINAL)),
    sodium.base64_variants.ORIGINAL
  );
  const r = await gh("PUT", `/repos/${OWNER}/${REPO}/actions/secrets/${name}`, { encrypted_value: enc, key_id: pk.json.key_id });
  log(r.ok ? `✓ Тајна ${name}` : `✗ Тајна ${name}: ${r.status} ${r.json.message || ""}`);
}
await setSecret("ANTHROPIC_API_KEY", ANTHROPIC);
await setSecret("CALLMEBOT_PHONE", CB_PHONE);
await setSecret("CALLMEBOT_APIKEY", CB_KEY);

// 5) Променљиве
async function setVar(name, value) {
  let r = await gh("POST", `/repos/${OWNER}/${REPO}/actions/variables`, { name, value });
  if (r.status === 409) r = await gh("PATCH", `/repos/${OWNER}/${REPO}/actions/variables/${name}`, { name, value });
  log(r.ok ? `✓ Променљива ${name}=${value}` : `✗ Променљива ${name}: ${r.status} ${r.json.message || ""}`);
}
await setVar("WHATSAPP_PROVIDER", "callmebot");
await setVar("SITE_BASE_URL", SITE);

// 6) GitHub Pages (грана main, фолдер /docs)
let pages = await gh("POST", `/repos/${OWNER}/${REPO}/pages`, { source: { branch: "main", path: "/docs" } });
if (pages.status === 409) { log("• Pages већ укључен"); }
else if (pages.ok || pages.status === 201) { log("✓ GitHub Pages укључен (/docs)"); }
else { log(`• Pages: ${pages.status} ${pages.json.message || ""} (можеш ручно: Settings → Pages → main /docs)`); }

// 7) Прво покретање припреме (само ако је Claude кључ постављен)
if (ANTHROPIC && !process.env.NO_RUN) {
  const disp = await gh("POST", `/repos/${OWNER}/${REPO}/actions/workflows/prepare.yml/dispatches`, { ref: "main" });
  log(disp.status === 204 ? "✓ Припрема прегледа покренута" : `• Покретање: ${disp.status} ${disp.json.message || ""} (Actions → Run workflow)`);
} else {
  log("• Прескочено покретање припреме.");
}

log("\n──────────────────────────────────────");
log(`🌐 Страница (за пар минута): ${SITE}/`);
log(`⚙️  Actions:  https://github.com/${OWNER}/${REPO}/actions`);
if (ANTHROPIC) log("✅ Готово. Сваког јутра у 09:30 (Београд) шаље се аутоматски.");
else log("⚠️  Остаје само да додаш Claude кључ (ANTHROPIC_API_KEY) па да крене.");
log("──────────────────────────────────────");
