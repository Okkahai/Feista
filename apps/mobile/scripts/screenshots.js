// Capture each tab of the web export at 390x844 @2x. Run from apps/mobile after `pnpm export:web`:
//   node scripts/screenshots.js "$PWD/dist" ../../docs/design/screens   (needs `playwright` resolvable, e.g. NODE_PATH=$(npm root -g))
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const [dist, out] = process.argv.slice(2);
const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".ttf": "font/ttf", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(8765);
const shots = [
  ["studio", "/"], ["create", "/create"], ["projects", "/projects"], ["project-detail", "/project/p142"],
  ["connections", "/connections"], ["settings", "/settings"],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: Number(process.env.H || 844) }, deviceScaleFactor: Number(process.env.DPR || 2), isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
  for (const [name, url] of shots) {
    await page.goto("http://localhost:8765" + url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, name + ".png") });
    if (process.env.FULL) await page.screenshot({ path: path.join(out, name + "-full.png"), fullPage: true });
    console.log("shot", name);
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
