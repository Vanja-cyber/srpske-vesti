// Слање WhatsApp поруке са линком ка дневном прегледу.
// Два бесплатна провајдера: "callmebot" (брзо за тест) и "meta" (WhatsApp Cloud API).

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

// Кратка WhatsApp порука: датум, главни наслови, број чланака и линк на пуни извештај.
function buildText(link, digest) {
  const d = digest || {};
  const lines = [`📰 Дневни преглед вести — ${formatDateShort(d.date)}`, ""];
  const top = topHeadlines(d, 3);
  for (const h of top) lines.push("• " + h);
  if (top.length) lines.push("");
  if (d.analyzedCount) lines.push(`Анализирано ${d.analyzedCount} чланака из ${d.sourceCount || 0} извора.`, "");
  lines.push("👉 Цео извештај:", link);
  return lines.join("\n");
}

export async function notify(link, opts = {}) {
  const provider = (opts.provider || process.env.WHATSAPP_PROVIDER || "none").toLowerCase();
  const text = buildText(link, opts.digest);
  if (provider === "none") return { provider, skipped: true, reason: "провајдер није подешен", preview: text };
  if (provider === "callmebot") return sendCallMeBot(text);
  if (provider === "meta") return sendMeta(link, text);
  return { provider, skipped: true, reason: "непознат провајдер" };
}

async function sendCallMeBot(text) {
  const phone = process.env.CALLMEBOT_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) return { provider: "callmebot", ok: false, error: "CALLMEBOT_PHONE/CALLMEBOT_APIKEY недостаје" };
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  const r = await fetch(url);
  const body = await r.text();
  return { provider: "callmebot", ok: r.ok, status: r.status, body: body.slice(0, 200) };
}

async function sendMeta(link, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const pnid = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = process.env.WHATSAPP_TO;
  const template = process.env.WHATSAPP_TEMPLATE; // име одобреног шаблона (за поруке ван 24h прозора)
  if (!token || !pnid || !to) {
    return { provider: "meta", ok: false, error: "WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_TO недостаје" };
  }

  let payload;
  if (template) {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "sr" },
        components: [{ type: "body", parameters: [{ type: "text", text: link }] }]
      }
    };
  } else {
    // Ради само унутар 24h прозора (нпр. за тест, кад бака прва пошаље поруку).
    payload = { messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: text } };
  }

  const r = await fetch(`https://graph.facebook.com/v20.0/${pnid}/messages`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await r.text();
  return { provider: "meta", ok: r.ok, status: r.status, body: body.slice(0, 300) };
}
