import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = process.env.DASH_PORT || 4899;

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; }
}
function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "content-type": type + "; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}
function state() {
  return {
    settings: readJson(path.join(ROOT, "config/settings.json"), {}),
    sources: readJson(path.join(ROOT, "config/sources.json"), []),
    history: readJson(path.join(ROOT, "data/history.json"), []),
    logs: readJson(path.join(ROOT, "data/logs.json"), [])
  };
}

let running = false;
function run(mode, res) {
  if (running) return send(res, 409, JSON.stringify({ error: "Анализа је већ у току." }));
  const args = ["src/index.js"];
  if (mode === "mock") args.push("--mock", "--no-send");
  else if (mode === "nosend") args.push("--no-send");
  // mode === "send" -> без додатних аргумената
  running = true;
  const child = spawn("node", args, { cwd: ROOT, env: process.env });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  child.on("close", (code) => { running = false; send(res, 200, JSON.stringify({ code, output: out.slice(-6000) })); });
  child.on("error", (e) => { running = false; send(res, 500, JSON.stringify({ code: -1, output: String(e.message || e) })); });
}

const TYPES = { ".html": "text/html", ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;
    if (p === "/" || p === "/index.html") return send(res, 200, fs.readFileSync(path.join(HERE, "dashboard.html")), "text/html");
    if (p === "/api/state") return send(res, 200, JSON.stringify(state()));
    if (p === "/api/run" && req.method === "POST") return run(u.searchParams.get("mode") || "mock", res);
    if (p.startsWith("/docs/")) {
      const fp = path.normalize(path.join(ROOT, p));
      if (fp.startsWith(path.join(ROOT, "docs")) && fs.existsSync(fp))
        return send(res, 200, fs.readFileSync(fp), TYPES[path.extname(fp)] || "application/octet-stream");
      return send(res, 404, "not found", "text/plain");
    }
    send(res, 404, JSON.stringify({ error: "not found" }));
  })
  .listen(PORT, () => console.log(`\n  ✅ Контролна табла ради:  http://localhost:${PORT}\n  (Затвори овај прозор да зауставиш.)\n`));
