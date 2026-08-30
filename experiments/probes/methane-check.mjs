import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const { runAndVerifyModule } = await import(pathToFileURL("./src/modules/run.ts").href);
// Output goes to temp/, which is gitignored -- ADR 0011's home for transient
// artefacts. This used to be one developer's absolute scratchpad path, which
// meant the probe ran on exactly one machine.
const dir = "temp/";
await mkdir(dir, { recursive: true });

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
