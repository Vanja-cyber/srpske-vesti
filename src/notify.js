// Слање WhatsApp поруке са линком ка дневном прегледу.
// Два бесплатна провајдера: "callmebot" (брзо за тест) и "meta" (WhatsApp Cloud API).

function buildText(link) {
  return (
    "Добро јутро! ☀️\n" +
    "Ваш дневни преглед вести из Србије је спреман.\n\n" +
    "📰 Кликните овде да прочитате:\n" +
    link
  );
}

export async function notify(link, opts = {}) {
  const provider = (opts.provider || process.env.WHATSAPP_PROVIDER || "none").toLowerCase();
  const text = buildText(link);
  if (provider === "none") return { provider, skipped: true, reason: "провајдер није подешен" };
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
