// Слање WhatsApp поруке са линком ка дневном прегледу.
// Провајдери: "callmebot" (бесплатно) и "meta" (WhatsApp Cloud API).

function formatDateShort(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}.` : String(iso || "");
}

function topHeadlines(d, n) {
  const secs = d.sections || [];
  const glavne = secs.find((s) => s.id === "glavne-vesti") || secs[0];
  const out = [];
  if (glavne) for (const it of glavne.items || []) { if (out.length >= n) break; if (it.title) out.push(it.title); }
  return out;
}

// Кратка порука: датум, главни наслови, линк. (Без техничких бројева.)
function buildText(link, digest) {
  const d = digest || {};
  const lines = [`📰 Дневни преглед вести — ${formatDateShort(d.date)}`, ""];
  const top = topHeadlines(d, 3);
  for (const h of top) lines.push("• " + h);
  if (top.length) lines.push("");
  lines.push("👉 Цео извештај:", link);
  return lines.join("\n");
}

export async function notify(link, opts = {}) {
  const provider = (opts.provider || process.env.WHATSAPP_PROVIDER || "none").toLowerCase();
  const text = opts.text || buildText(link, opts.digest);
  if (provider === "none") return { provider, skipped: true, reason: "провајдер није подешен", preview: text };
  if (provider === "callmebot") return sendCallMeBot(text);
  if (provider === "meta") return sendMeta(link, text);
  return { provider, skipped: true, reason: "непознат провајдер" };
}

// Хитно обавештење власнику (теби) — на посебан број (OWNER_PHONE/OWNER_APIKEY).
export async function ownerAlert(text) {
  const phone = process.env.OWNER_PHONE;
  const apikey = process.env.OWNER_APIKEY;
  if (!phone || !apikey) return { skipped: true, reason: "OWNER_PHONE/OWNER_APIKEY нису подешени" };
  return sendCallMeBot(text, phone, apikey);
}

async function sendCallMeBot(text, phoneOverride, keyOverride) {
  const phone = phoneOverride || process.env.CALLMEBOT_PHONE;
  const apikey = keyOverride || process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) return { provider: "callmebot", ok: false, error: "CALLMEBOT_PHONE/CALLMEBOT_APIKEY недостаје" };
  try {
    const url =
      `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}` +
      `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const body = await r.text();
    // CallMeBot враћа 200 и кад нешто не ваља — зато гледамо и садржај.
    const bad = /error|not authorized|apikey|couldn't|invalid|missing/i.test(body);
    return { provider: "callmebot", ok: r.ok && !bad, status: r.status, body: body.slice(0, 200) };
  } catch (e) {
    return { provider: "callmebot", ok: false, error: String((e && e.message) || e) };
  }
}

async function sendMeta(link, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const pnid = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = process.env.WHATSAPP_TO;
  const template = process.env.WHATSAPP_TEMPLATE;
  if (!token || !pnid || !to) {
    return { provider: "meta", ok: false, error: "WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_TO недостаје" };
  }
  let payload;
  if (template) {
    payload = {
      messaging_product: "whatsapp", to, type: "template",
      template: { name: template, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "sr" },
        components: [{ type: "body", parameters: [{ type: "text", text: link }] }] }
    };
  } else {
    payload = { messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: text } };
  }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pnid}/messages`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    const body = await r.text();
    return { provider: "meta", ok: r.ok, status: r.status, body: body.slice(0, 300) };
  } catch (e) {
    return { provider: "meta", ok: false, error: String((e && e.message) || e) };
  }
}
