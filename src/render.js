// Генерисање HTML странице дневног прегледа.
// Подржава 3 приказа: ћирилица (подразумевано), латиница, француски.
// renderDocument() -> комплетна HTML страница за GitHub Pages.

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STRINGS = {
  sr: {
    factsLabel: "Кључне чињенице",
    weatherWord: "Време",
    greetingFallback: "Добро јутро!",
    footerAuto: "🤖 Аутоматски направљено",
    footerLove: "Направљено с љубављу ❤️",
    range: (min, max) => `од ${min}° до ${max}°`
  },
  fr: {
    factsLabel: "Faits clés",
    weatherWord: "Météo",
    greetingFallback: "Bonjour !",
    footerAuto: "🤖 Généré automatiquement",
    footerLove: "Fait avec amour ❤️",
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
  const sr = {
    clear: "Ведро", mostly: "Претежно ведро", cloud: "Облачно", fog: "Магла",
    drizzle: "Ситна киша", rain: "Киша", snow: "Снег", showers: "Пљускови",
    snowShowers: "Снежни пљускови", storm: "Грмљавина", var: "Променљиво"
  };
  const fr = {
    clear: "Dégagé", mostly: "Plutôt dégagé", cloud: "Nuageux", fog: "Brouillard",
    drizzle: "Bruine", rain: "Pluie", snow: "Neige", showers: "Averses",
    snowShowers: "Averses de neige", storm: "Orage", var: "Variable"
  };
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

function renderSources(item) {
  const links = item.links || [];
  const srcs = item.sources || [];
  const n = Math.max(links.length, srcs.length);
  if (!n) return "";
  const chips = [];
  for (let i = 0; i < n; i++) {
    const label = srcs[i] || srcs[0] || "Извор";
    const url = links[i] || "";
    chips.push(
      url
        ? `<a class="izvor" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`
        : `<span class="izvor">${esc(label)}</span>`
    );
  }
  return `<div class="izvori">${chips.join("")}</div>`;
}

function renderItem(item, lang) {
  const facts = (item.facts || []).filter(Boolean);
  return (
    `<article class="vest">` +
    `<h3>${esc(item.title)}</h3>` +
    (item.summary ? `<p class="rezime">${esc(item.summary)}</p>` : "") +
    (facts.length
      ? `<div class="cinjenice"><span class="oznaka">${esc(STRINGS[lang].factsLabel)}</span><ul>` +
        facts.map((f) => `<li>${esc(f)}</li>`).join("") +
        `</ul></div>`
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
  const cur = w.current || {};
  const daily = w.daily || {};
  const info = wmo(cur.weather_code, lang);
  const t = cur.temperature_2m;
  const max = daily.temperature_2m_max && daily.temperature_2m_max[0];
  const min = daily.temperature_2m_min && daily.temperature_2m_min[0];
  const raspon = max != null && min != null ? ` • ${STRINGS[lang].range(Math.round(min), Math.round(max))}` : "";
  return (
    `<section class="sekcija vreme">` +
    `<h2><span class="ikona">🌤️</span> ${esc(STRINGS[lang].weatherWord)} — ${esc(w.city || "Београд")}</h2>` +
    `<div class="vreme-karta">` +
    `<div class="temp">${info.emoji} ${t != null ? Math.round(t) + "°" : ""}</div>` +
    `<div class="vreme-opis">${esc(info.text)}${raspon}</div>` +
    `</div></section>`
  );
}

function renderBody(d, lang, ctx) {
  const t = STRINGS[lang];
  return (
    `<header class="zaglavlje">` +
    `<div class="datum">${esc(formatDate(ctx.date, lang))}</div>` +
    `<h1>${esc(d.greeting || t.greetingFallback)}</h1>` +
    (d.intro ? `<p class="uvod">${esc(d.intro)}</p>` : "") +
    `</header>` +
    renderWeather(ctx.weather, lang) +
    (d.sections || []).map((s) => renderSection(s, lang)).join("") +
    `<footer class="podnozje">` +
    `<p>${esc(t.footerAuto)}${ctx.generatedAt ? " • " + esc(ctx.generatedAt) : ""}</p>` +
    `<p class="srce">${esc(t.footerLove)}</p>` +
    `</footer>`
  );
}

const CSS = `
#app{--bg:#f4f6f8;--card:#fff;--text:#15191e;--muted:#5a6472;--accent:#15508a;--accent-soft:#e9f1f8;--border:#e2e6ea;--alert:#b3261e;--alert-soft:#fdecec;
  background:var(--bg);color:var(--text);min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:20px;line-height:1.7;-webkit-text-size-adjust:100%;}
#app[data-tema="dark"]{--bg:#0f141a;--card:#1a212b;--text:#e9edf2;--muted:#9aa6b4;--accent:#5aa9ff;--accent-soft:#16273a;--border:#27313d;--alert:#ff7a70;--alert-soft:#2a1614;}
#app *{box-sizing:border-box;}
#app .controls{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;
  padding:12px 18px;background:var(--bg);border-bottom:1px solid var(--border);}
#app .ctrl{min-height:46px;min-width:46px;padding:0 16px;font-size:18px;font-weight:600;cursor:pointer;
  border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);}
#app .ctrl:hover{border-color:var(--accent);}
#app .sadrzaj{max-width:720px;margin:0 auto;padding:22px 18px 64px;}
#app .sadrzaj[hidden]{display:none;}
#app .zaglavlje{margin:6px 0 22px;}
#app .datum{color:var(--muted);font-size:18px;}
#app .zaglavlje h1{font-size:32px;line-height:1.25;margin:6px 0 10px;}
#app .uvod{font-size:21px;background:var(--accent-soft);padding:14px 16px;border-radius:14px;border:1px solid var(--border);margin:0;}
#app .sekcija{margin:26px 0;}
#app .sekcija h2{font-size:25px;display:flex;align-items:center;gap:10px;padding-bottom:8px;margin:0 0 6px;border-bottom:2px solid var(--accent);}
#app .ikona{font-size:26px;}
#app .vest{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px 18px 14px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.04);}
#app .vest h3{font-size:22px;line-height:1.35;margin:0 0 8px;}
#app .rezime{margin:0 0 12px;}
#app .cinjenice{background:var(--accent-soft);border-radius:12px;padding:10px 14px;margin:0 0 12px;}
#app .oznaka{display:inline-block;font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--accent);margin-bottom:4px;}
#app .cinjenice ul{margin:4px 0 0;padding-left:22px;}
#app .cinjenice li{margin:4px 0;}
#app .izvori{display:flex;flex-wrap:wrap;gap:8px;}
#app .izvor{display:inline-block;font-size:16px;font-weight:600;text-decoration:none;color:var(--accent);
  background:var(--accent-soft);border:1px solid var(--border);border-radius:999px;padding:7px 14px;min-height:38px;}
#app a.izvor:hover{border-color:var(--accent);text-decoration:underline;}
#app .vreme-karta{display:flex;align-items:center;gap:16px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px 18px;}
#app .vreme .temp{font-size:34px;font-weight:700;white-space:nowrap;}
#app .vreme-opis{color:var(--muted);font-size:19px;}
#app .sekcija.hitno h2{border-color:var(--alert);color:var(--alert);}
#app .sekcija.hitno .vest{border-color:var(--alert);background:var(--alert-soft);}
#app .podnozje{margin-top:40px;text-align:center;color:var(--muted);font-size:16px;border-top:1px solid var(--border);padding-top:18px;}
#app .srce{margin-top:4px;}
`;

const SCRIPT = `
(function(){
  var M={"а":"a","б":"b","в":"v","г":"g","д":"d","ђ":"đ","е":"e","ж":"ž","з":"z","и":"i","ј":"j","к":"k","л":"l","љ":"lj","м":"m","н":"n","њ":"nj","о":"o","п":"p","р":"r","с":"s","т":"t","ћ":"ć","у":"u","ф":"f","х":"h","ц":"c","ч":"č","џ":"dž","ш":"š","А":"A","Б":"B","В":"V","Г":"G","Д":"D","Ђ":"Đ","Е":"E","Ж":"Ž","З":"Z","И":"I","Ј":"J","К":"K","Л":"L","Љ":"Lj","М":"M","Н":"N","Њ":"Nj","О":"O","П":"P","Р":"R","С":"S","Т":"T","Ћ":"Ć","У":"U","Ф":"F","Х":"H","Ц":"C","Ч":"Č","Џ":"Dž","Ш":"Š"};
  function toLat(s){var o="";for(var i=0;i<s.length;i++){var c=s[i];o+=(M[c]!==undefined?M[c]:c);}return o;}
  var app=document.getElementById("app");
  var sr=document.getElementById("sadrzaj-sr");
  var fr=document.getElementById("sadrzaj-fr");
  var btnP=document.getElementById("btnP");
  var btnJ=document.getElementById("btnJ");
  var btnT=document.getElementById("btnT");
  function walk(node,fn){ if(node.nodeType===3){fn(node);} else { for(var i=0;i<node.childNodes.length;i++){ walk(node.childNodes[i],fn);} } }
  function toLatin(){ walk(sr,function(n){ if(n.__cyr===undefined)n.__cyr=n.nodeValue; n.nodeValue=toLat(n.__cyr); }); }
  function toCyr(){ walk(sr,function(n){ if(n.__cyr!==undefined)n.nodeValue=n.__cyr; }); }
  var pismo=localStorage.getItem("pismo")||app.getAttribute("data-pismo")||"cyrillic";
  var jezik=localStorage.getItem("jezik")||"sr";
  function applyPismo(){ if(pismo==="latin"){toLatin();if(btnP)btnP.textContent="Ћирилица";}else{toCyr();if(btnP)btnP.textContent="Latinica";} localStorage.setItem("pismo",pismo); }
  function applyJezik(){
    if(jezik==="fr" && fr){ sr.hidden=true; fr.hidden=false; if(btnP)btnP.style.display="none"; if(btnJ)btnJ.textContent="Српски"; }
    else { jezik="sr"; sr.hidden=false; if(fr)fr.hidden=true; if(btnP)btnP.style.display=""; if(btnJ)btnJ.textContent="Français"; }
    localStorage.setItem("jezik",jezik);
  }
  if(btnP)btnP.addEventListener("click",function(){ pismo=(pismo==="latin")?"cyrillic":"latin"; applyPismo(); });
  if(btnJ)btnJ.addEventListener("click",function(){ jezik=(jezik==="fr")?"sr":"fr"; applyJezik(); });
  var tema=localStorage.getItem("tema")|| ((window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light");
  function applyTema(){ app.setAttribute("data-tema",tema); if(btnT)btnT.textContent=(tema==="dark")?"☀️":"🌙"; localStorage.setItem("tema",tema); }
  if(btnT)btnT.addEventListener("click",function(){ tema=(tema==="dark")?"light":"dark"; applyTema(); });
  applyTema(); applyPismo(); applyJezik();
})();
`;

export function renderFragment(digest, opts = {}) {
  const script = opts.defaultScript === "latin" ? "latin" : "cyrillic";
  const hasFr = !!(digest.fr && (digest.fr.sections || []).length);
  const ctx = { date: digest.date, weather: digest.weather, generatedAt: opts.generatedAt };
  const srBody = renderBody(digest, "sr", ctx);
  const frBody = hasFr ? renderBody(digest.fr, "fr", ctx) : "";
  return (
    `<style>${CSS}</style>` +
    `<div id="app" data-tema="light" data-pismo="${script}">` +
    `<div class="controls">` +
    `<button id="btnP" class="ctrl" aria-label="Промени писмо">Latinica</button>` +
    (hasFr ? `<button id="btnJ" class="ctrl" aria-label="Changer de langue">Français</button>` : "") +
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
    `<!doctype html>\n<html lang="sr">\n<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>Дневне вести • ${esc(digest.date)}</title>\n` +
    `</head>\n<body style="margin:0">\n` +
    renderFragment(digest, opts) +
    `\n</body>\n</html>\n`
  );
}

export function renderArchive(history) {
  const items = (history || [])
    .map(
      (h) =>
        `<a class="red" href="arhiva/${esc(h.date)}.html"><span class="d">${esc(formatDate(h.date, "sr"))}</span>` +
        `<span class="g">${esc(h.greeting || "Дневни преглед")}</span>` +
        `<span class="b">${esc(h.items || 0)} вести</span></a>`
    )
    .join("");
  return (
    `<!doctype html>\n<html lang="sr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Архива прегледа</title>` +
    `<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f4f6f8;color:#15191e;font-size:19px}` +
    `.w{max-width:720px;margin:0 auto;padding:24px 18px}h1{font-size:28px}` +
    `.red{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;text-decoration:none;color:inherit;background:#fff;border:1px solid #e2e6ea;border-radius:14px;padding:14px 16px;margin:10px 0}` +
    `.red:hover{border-color:#15508a}.d{font-weight:700}.g{color:#5a6472;flex:1}.b{color:#15508a;font-weight:600}` +
    `a.nazad{color:#15508a}</style></head><body><div class="w">` +
    `<p><a class="nazad" href="index.html">← Данашњи преглед</a></p>` +
    `<h1>📚 Архива прегледа</h1>` +
    (items || `<p>Још нема сачуваних прегледа.</p>`) +
    `</div></body></html>\n`
  );
}
