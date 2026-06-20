import { fetchFeed } from "../src/collect.js";
import fs from "node:fs";

const sources = JSON.parse(fs.readFileSync(new URL("../config/sources.json", import.meta.url), "utf8"));

const results = await Promise.allSettled(
  sources.map(async (s) => {
    const feed = await fetchFeed(s.url);
    return { ...s, n: (feed.items || []).length };
  })
);

let ok = 0, totalItems = 0;
results.forEach((r, i) => {
  const s = sources[i];
  if (r.status === "fulfilled" && r.value.n > 0) {
    ok++; totalItems += r.value.n;
    console.log(`✅ ${String(r.value.n).padStart(3)} | ${s.category.padEnd(12)} | ${s.name}`);
  } else {
    console.log(`❌   - | ${s.category.padEnd(12)} | ${s.name} | ${r.status === "rejected" ? String(r.reason && r.reason.message || r.reason).slice(0, 45) : "0"}`);
  }
});
console.log(`\n${ok}/${sources.length} извора ради, укупно ~${totalItems} чланака пре дедупликације.`);
