import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire("C:/Joao/Programação/ProjectHub/Prancheta/package.json");
const { chromium } = require("playwright");
const html = fileURLToPath(new URL("./lista.html", import.meta.url));
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__mathDone === true, null, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
const bad = await page.evaluate(() => [...document.querySelectorAll(".katex-error")].map((e) => e.title || e.textContent));
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
await page.pdf({
  path: out, format: "A4", printBackground: true,
  margin: { top: "18mm", bottom: "20mm", left: "17mm", right: "17mm" },
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8pt;color:#777;width:100%;text-align:center;font-family:Segoe UI">Cálculo 1 · Lista de exercícios · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
console.log(JSON.stringify({ errors, katexErrors: bad, brokenImages: broken }, null, 1));
