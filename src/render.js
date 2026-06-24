// Генерисање HTML странице дневног прегледа — формат „новине за читање“.
// Велики уводни текст дана + детаљне вести по темама, са изворима и линковима.
// Прикази: ћирилица (подразумевано), латиница, француски. Светла/тамна тема. Читање наглас.

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const STRINGS = {
  sr: {
    factsLabel: "Најважније",
    weatherWord: "Време",
    greetingFallback: "Добро јутро.",
    sourcesUsed: "Коришћени извори",
    overviewTitle: "Преглед дана",
    footerAuto: "Аутоматски дневни преглед вести",
    listen: "🔊 Слушај",
    stop: "⏹ Заустави",
    range: (min, max) => `од ${min}° до ${max}°`
  },
  fr: {
    factsLabel: "L'essentiel",
    weatherWord: "Météo",
    greetingFallback: "Bonjour.",
    sourcesUsed: "Sources utilisées",
    overviewTitle: "Le tour de l'actualité du jour",
    footerAuto: "Aperçu quotidien de l'actualité",
    listen: "🔊 Écouter",
    stop: "⏹ Arrêter",
    range: (min, max) => `de ${min}° à ${max}°`
  }
};

const DAN_SR = ["недеља", "понедељак", "уторак", "среда", "четвртак", "петак", "субота"];
const MES_SR = ["јануара", "фебруара", "марта", "априла", "маја", "јуна", "јула", "августа", "септембра", "октобра", "новембра", "децембра"];
const JOUR_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function formatDate(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const Y = +m[1], M = +m[2], D = +m[3];
  const d = new Date(Date.UTC(Y, M - 1, D));
  if (lang === "fr") return `${JOUR_FR[d.getUTCDay()]} ${D} ${MOIS_FR[M - 1]} ${Y}`;
  return `${DAN_SR[d.getUTCDay()]}, ${D}. ${MES_SR[M - 1]} ${Y}.`;
}

function wmo(code, lang) {
  const c = Number(code);
  const sr = { clear: "Ведро", mostly: "Претежно ведро", cloud: "Облачно", fog: "Магла", drizzle: "Ситна киша", rain: "Киша", snow: "Снег", showers: "Пљускови", snowShowers: "Снежни пљускови", storm: "Грмљавина", var: "Променљиво" };
  const fr = { clear: "Dégagé", mostly: "Plutôt dégagé", cloud: "Nuageux", fog: "Brouillard", drizzle: "Bruine", rain: "Pluie", snow: "Neige", showers: "Averses", snowShowers: "Averses de neige", storm: "Orage", var: "Variable" };
  const t = lang === "fr" ? fr : sr;
  if (c === 0) return { emoji: "☀️", text: t.clear };
  if (c === 1 || c === 2) return { emoji: "🌤️", text: t.mostly };
  if (c === 3) return { emoji: "☁️", text: t.cloud };
  if (c === 45 || c === 48) return { emoji: "🌫️", text: t.fog };
  if (c >= 51 && c <= 57) return { emoji: "🌦️", text: t.drizzle };
  if (c >= 61 && c <= 67) return { emoji: "🌧️", text: t.rain };
  if (c >= 71 && c <= 77) return { emoji: "❄️", text: t.snow };
  if (c >= 80 && c <= 82) return { emoji: "🌧️", text: t.showers };
  if (c >= 85 && c <= 86) return { emoji: "🌨️", text: t.snowShowers };
  if (c >= 95) return { emoji: "⛈️", text: t.storm };
  return { emoji: "🌡️", text: t.var };
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function renderSources(item) {
  const links = item.links || [];
  const srcs = item.sources || [];
  const n = Math.max(links.length, srcs.length);
  if (!n) return "";
  const chips = [];
  for (let i = 0; i < n; i++) {
    const label = srcs[i] || srcs[0] || "Извор";
    const url = links[i] || "";
    chips.push(url
      ? `<a class="izvor" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`
      : `<span class="izvor">${esc(label)}</span>`);
  }
  return `<div class="izvori">${chips.join("")}</div>`;
}

function renderItem(item, lang) {
  const facts = (item.facts || []).filter(Boolean);
  const sum = paragraphs(item.summary).map((p) => `<p class="rezime">${esc(p)}</p>`).join("");
  return (
    `<article class="vest">` +
    (item.image ? `<img class="slika" src="${esc(item.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : "") +
    `<h3>${esc(item.title)}</h3>` +
    sum +
    (facts.length
      ? `<div class="cinjenice"><span class="oznaka">${esc(STRINGS[lang].factsLabel)}</span><ul>` +
        facts.map((f) => `<li>${esc(f)}</li>`).join("") + `</ul></div>`
      : "") +
    renderSources(item) +
    `</article>`
  );
}

function renderSection(s, lang) {
  const items = (s.items || []).filter((x) => x && x.title);
  if (!items.length) return "";
  const cls = s.id === "hitno" ? "sekcija hitno" : "sekcija";
  return (
    `<section class="${cls}">` +
    `<h2><span class="ikona">${esc(s.icon || "•")}</span> ${esc(s.title)}</h2>` +
    items.map((it) => renderItem(it, lang)).join("") +
    `</section>`
  );
}

function renderWeather(w, lang) {
  if (!w || !w.current) return "";
  const cur = w.current || {}, daily = w.daily || {};
  const info = wmo(cur.weather_code, lang);
  const t = cur.temperature_2m;
  const max = daily.temperature_2m_max && daily.temperature_2m_max[0];
  const min = daily.temperature_2m_min && daily.temperature_2m_min[0];
  const raspon = max != null && min != null ? ` • ${STRINGS[lang].range(Math.round(min), Math.round(max))}` : "";
  return (
    `<section class="sekcija vreme"><h2><span class="ikona">🌤️</span> ${esc(STRINGS[lang].weatherWord)} — ${esc(w.city || "Београд")}</h2>` +
    `<div class="vreme-karta"><div class="temp">${info.emoji} ${t != null ? Math.round(t) + "°" : ""}</div>` +
    `<div class="vreme-opis">${esc(info.text)}${raspon}</div></div></section>`
  );
}

function renderUsed(list, lang) {
  if (!list || !list.length) return "";
  return (
    `<section class="sekcija izvori-korisceni"><h2>${esc(STRINGS[lang].sourcesUsed)}</h2>` +
    `<div class="izvori">${list.map((s) => `<span class="izvor">${esc(s)}</span>`).join("")}</div></section>`
  );
}

function renderBody(d, lang, ctx) {
  const t = STRINGS[lang];
  const ovText = d.overview || d.intro || "";
  const ov = paragraphs(ovText);
  const overview = ov.length
    ? `<section class="sekcija pregled-dana"><h2><span class="ikona">📰</span> ${esc(t.overviewTitle)}</h2>` +
      ov.map((p) => `<p class="pregled">${esc(p)}</p>`).join("") + `</section>`
    : "";
  return (
    `<header class="zaglavlje">` +
    `<div class="datum">${esc(formatDate(ctx.date, lang))}</div>` +
    `<h1>${esc(d.greeting || t.greetingFallback)}</h1>` +
    `</header>` +
    overview +
    renderWeather(ctx.weather, lang) +
    (d.sections || []).map((s) => renderSection(s, lang)).join("") +
    renderUsed(ctx.usedSources, lang) +
    `<footer class="podnozje"><p>${esc(t.footerAuto)}${ctx.generatedAt ? " • " + esc(ctx.generatedAt) : ""}</p></footer>`
  );
}

const CSS = `
#app{--bg:#f6f7f9;--card:#ffffff;--text:#191c20;--muted:#56606b;--accent:#a01b1b;--accent2:#15539e;--soft:#f1f3f6;--border:#e4e7ec;--alert:#b3261e;--alert-soft:#fdecec;
  background:var(--bg);color:var(--text);min-height:100vh;
  font-family:Georgia,"Times New Roman",-apple-system,BlinkMacSystemFont,"Segoe UI",serif;
  font-size:21px;line-height:1.8;-webkit-text-size-adjust:100%;}
#app[data-tema="dark"]{--bg:#12161c;--card:#1b212a;--text:#eceff3;--muted:#aab4c0;--accent:#ff8a7a;--accent2:#7fb2ff;--soft:#222a35;--border:#2c3540;--alert:#ff8175;--alert-soft:#33201d;}
#app *{box-sizing:border-box;}
#app .controls{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;
  padding:12px 14px;background:var(--bg);border-bottom:1px solid var(--border);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
#app .ctrl{min-height:46px;min-width:46px;padding:0 16px;font-size:17px;font-weight:600;cursor:pointer;
  border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);}
#app .ctrl:hover{border-color:var(--accent);}
#app .sadrzaj{max-width:740px;margin:0 auto;padding:20px 20px 70px;}
#app .sadrzaj[hidden]{display:none;}
#app .zaglavlje{margin:8px 0 26px;border-bottom:3px double var(--accent);padding-bottom:16px;}
#app .datum{color:var(--muted);font-size:18px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}
#app .zaglavlje h1{font-size:36px;line-height:1.2;margin:8px 0 0;letter-spacing:-.01em;}
#app .sekcija{margin:34px 0;}
#app .sekcija h2{font-size:27px;display:flex;align-items:center;gap:10px;padding-bottom:8px;margin:0 0 14px;border-bottom:2px solid var(--accent);}
#app .ikona{font-size:26px;}
#app .pregled-dana{background:var(--soft);border:1px solid var(--border);border-radius:16px;padding:8px 22px 18px;}
#app .pregled{font-size:21px;line-height:1.9;margin:14px 0;}
#app .vest{margin:22px 0;padding:0 0 20px;border-bottom:1px solid var(--border);}
#app .slika{width:100%;max-height:300px;object-fit:cover;border-radius:10px;margin:0 0 14px;display:block;background:var(--soft);}
#app .vest h3{font-size:25px;line-height:1.35;margin:0 0 12px;}
#app .rezime{margin:0 0 14px;font-size:21px;line-height:1.85;}
#app .cinjenice{background:var(--soft);border-left:4px solid var(--accent);border-radius:6px;padding:12px 18px;margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}
#app .oznaka{display:inline-block;font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:6px;}
#app .cinjenice ul{margin:4px 0 0;padding-left:22px;}
#app .cinjenice li{margin:7px 0;font-size:19px;}
#app .izvori{display:flex;flex-wrap:wrap;gap:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}
#app .izvor{display:inline-block;font-size:16px;font-weight:600;text-decoration:none;color:var(--accent2);
  background:var(--soft);border:1px solid var(--border);border-radius:999px;padding:7px 15px;min-height:38px;}
#app a.izvor:hover{border-color:var(--accent2);text-decoration:underline;}
#app .vreme-karta{display:flex;align-items:center;gap:16px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px;}
#app .vreme .temp{font-size:36px;font-weight:700;white-space:nowrap;}
#app .vreme-opis{color:var(--muted);font-size:20px;}
#app .sekcija.hitno h2{border-color:var(--alert);color:var(--alert);}
#app .izvori-korisceni h2{font-size:20px;border-bottom-width:1px;}
#app .podnozje{margin-top:46px;text-align:center;color:var(--muted);font-size:16px;border-top:1px solid var(--border);padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}
`;

const SCRIPT = `
(function(){
  var M={"а":"a","б":"b","в":"v","г":"g","д":"d","ђ":"đ","е":"e","ж":"ž","з":"z","и":"i","ј":"j","к":"k","л":"l","љ":"lj","м":"m","н":"n","њ":"nj","о":"o","п":"p","р":"r","с":"s","т":"t","ћ":"ć","у":"u","ф":"f","х":"h","ц":"c","ч":"č","џ":"dž","ш":"š","А":"A","Б":"B","В":"V","Г":"G","Д":"D","Ђ":"Đ","Е":"E","Ж":"Ž","З":"Z","И":"I","Ј":"J","К":"K","Л":"L","Љ":"Lj","М":"M","Н":"N","Њ":"Nj","О":"O","П":"P","Р":"R","С":"S","Т":"T","Ћ":"Ć","У":"U","Ф":"F","Х":"H","Ц":"C","Ч":"Č","Џ":"Dž","Ш":"Š"};
  function toLat(s){var o="";for(var i=0;i<s.length;i++){var c=s[i];o+=(M[c]!==undefined?M[c]:c);}return o;}
  function $(id){return document.getElementById(id);}
  var app=$("app"),sr=$("sadrzaj-sr"),fr=$("sadrzaj-fr"),btnP=$("btnP"),btnJ=$("btnJ"),btnT=$("btnT"),btnA=$("btnA");
  function walk(n,f){ if(n.nodeType===3){f(n);} else { for(var i=0;i<n.childNodes.length;i++){ walk(n.childNodes[i],f);} } }
  function toLatin(){ walk(sr,function(n){ if(n.__cyr===undefined)n.__cyr=n.nodeValue; n.nodeValue=toLat(n.__cyr); }); }
  function toCyr(){ walk(sr,function(n){ if(n.__cyr!==undefined)n.nodeValue=n.__cyr; }); }
  var pismo=localStorage.getItem("pismo")||app.getAttribute("data-pismo")||"cyrillic";
  var jezik=localStorage.getItem("jezik")||"sr";
  function visMain(){ return (jezik==="fr"&&fr)?fr:sr; }
  function applyPismo(){ if(pismo==="latin"){toLatin();if(btnP)btnP.textContent="Ћирилица";}else{toCyr();if(btnP)btnP.textContent="Latinica";} localStorage.setItem("pismo",pismo); }
  function applyJezik(){
    if(jezik==="fr"&&fr){ sr.hidden=true; fr.hidden=false; if(btnP)btnP.style.display="none"; if(btnJ)btnJ.textContent="Српски"; if(btnA)btnA.textContent="🔊 Écouter"; }
    else { jezik="sr"; sr.hidden=false; if(fr)fr.hidden=true; if(btnP)btnP.style.display=""; if(btnJ)btnJ.textContent="Français"; if(btnA)btnA.textContent="🔊 Слушај"; }
    localStorage.setItem("jezik",jezik);
  }
  if(btnP)btnP.addEventListener("click",function(){ pismo=(pismo==="latin")?"cyrillic":"latin"; applyPismo(); });
  if(btnJ)btnJ.addEventListener("click",function(){ jezik=(jezik==="fr")?"sr":"fr"; applyJezik(); });
  var tema=localStorage.getItem("tema")||"light";
  function applyTema(){ app.setAttribute("data-tema",tema); if(btnT)btnT.textContent=(tema==="dark")?"☀️":"🌙"; localStorage.setItem("tema",tema); }
  if(btnT)btnT.addEventListener("click",function(){ tema=(tema==="dark")?"light":"dark"; applyTema(); });
  var speaking=false;
  function stopA(){ if(window.speechSynthesis)window.speechSynthesis.cancel(); speaking=false; if(btnA)btnA.textContent=(jezik==="fr")?"🔊 Écouter":"🔊 Слушај"; }
  if(btnA)btnA.addEventListener("click",function(){
    if(!("speechSynthesis" in window))return;
    if(speaking){ stopA(); return; }
    var m=visMain(); var text=m?m.innerText:""; if(!text)return;
    var u=new SpeechSynthesisUtterance(text); u.lang=(jezik==="fr")?"fr-FR":"sr-RS"; u.rate=.95;
    u.onend=stopA; u.onerror=stopA;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); speaking=true;
    btnA.textContent=(jezik==="fr")?"⏹ Arrêter":"⏹ Заустави";
  });
  applyTema(); applyPismo(); applyJezik();
})();
`;

export function renderFragment(digest, opts = {}) {
  const script = opts.defaultScript === "latin" ? "latin" : "cyrillic";
  const hasFr = !!(digest.fr && (digest.fr.sections || []).length);
  const ctx = { date: digest.date, weather: digest.weather, generatedAt: opts.generatedAt, usedSources: digest.usedSources };
  const srBody = renderBody(digest, "sr", ctx);
  const frBody = hasFr ? renderBody(digest.fr, "fr", ctx) : "";
  return (
    `<style>${CSS}</style>` +
    `<div id="app" data-tema="light" data-pismo="${script}">` +
    `<div class="controls">` +
    `<button id="btnP" class="ctrl" aria-label="Промени писмо">Latinica</button>` +
    (hasFr ? `<button id="btnJ" class="ctrl" aria-label="Changer de langue">Français</button>` : "") +
    `<button id="btnA" class="ctrl" aria-label="Слушај">🔊 Слушај</button>` +
    `<button id="btnT" class="ctrl" aria-label="Промени тему">🌙</button>` +
    `</div>` +
    `<main id="sadrzaj-sr" class="sadrzaj">${srBody}</main>` +
    (hasFr ? `<main id="sadrzaj-fr" class="sadrzaj" hidden>${frBody}</main>` : "") +
    `</div>` +
    `<script>${SCRIPT}</script>`
  );
}

export function renderDocument(digest, opts = {}) {
  return (
    `<!doctype html>\n<html lang="sr">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>Дневне вести • ${esc(digest.date)}</title>\n</head>\n<body style="margin:0">\n` +
    renderFragment(digest, opts) +
    `\n</body>\n</html>\n`
  );
}

export function renderArchive(history) {
  const items = (history || [])
    .map((h) =>
      `<a class="red" href="arhiva/${esc(h.date)}.html"><span class="d">${esc(formatDate(h.date, "sr"))}</span>` +
      `<span class="g">${esc(h.greeting || "Дневни преглед")}</span></a>`)
    .join("");
  return (
    `<!doctype html>\n<html lang="sr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Архива прегледа</title>` +
    `<style>body{margin:0;font-family:Georgia,serif;background:#f6f7f9;color:#191c20;font-size:20px}` +
    `.w{max-width:740px;margin:0 auto;padding:24px 20px}h1{font-size:30px}` +
    `.red{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;text-decoration:none;color:inherit;background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:14px 16px;margin:10px 0}` +
    `.red:hover{border-color:#a01b1b}.d{font-weight:700}.g{color:#56606b;flex:1}` +
    `a.nazad{color:#15539e}</style></head><body><div class="w">` +
    `<p><a class="nazad" href="index.html">← Данашњи преглед</a></p><h1>📚 Архива прегледа</h1>` +
    (items || `<p>Још нема сачуваних прегледа.</p>`) +
    `</div></body></html>\n`
  );
}
