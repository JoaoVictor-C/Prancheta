import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const { runAndVerifyModule } = await import(pathToFileURL("./src/modules/run.ts").href);
const dir = "C:/Users/JOO~1/AppData/Local/Temp/claude/C--Joao-Programa--o-ProjectHub-Prancheta/2caffd2e-027a-4e22-9fdd-63ae36e2d598/scratchpad/";

const { output } = await runAndVerifyModule({
  command: "python",
  args: ["modules/reaction/render.py", "--name=combustion_methane"],
  input: { width: 900, height: 320 },
  timeoutMs: 60000,
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><body style="margin:0">${output.svg}</body></html>`);
const el = await page.$("svg");
const png = await el.screenshot();
await writeFile(dir + "methane-debug.png", png);
console.log("done");
