// Уклањање дупликата: чланци са (скоро) истим насловом се спајају,
// а њихови извори и линкови се обједињују. Право груписање по теми
// ради модел касније; овде само смањујемо буку.
function norm(t) {
  return String(t)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function dedup(articles) {
  const seen = new Map();
  for (const a of articles) {
    const key = norm(a.title);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, { ...a, sources: [a.source], links: a.link ? [a.link] : [] });
    } else {
      const g = seen.get(key);
      if (!g.sources.includes(a.source)) g.sources.push(a.source);
      if (a.link && !g.links.includes(a.link)) g.links.push(a.link);
    }
  }
  // Више извора за исту вест = вероватно важније -> на врх.
  return [...seen.values()].sort((x, y) => y.sources.length - x.sources.length);
}
