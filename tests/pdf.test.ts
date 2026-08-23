/**
 * SLOW TESTS: launch real Chromium (via render()) and exercise the PDF
 * structural check in scripts/check-independent.ts against both a real
 * figure and a deliberately raster-only PDF built the same way page.pdf()
 * would produce one -- the planted-defect discipline this project applies
 * to every other check, applied to the newest one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpec } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import type { FigureSpec } from "../src/ir/types.ts";

const checkScript = fileURLToPath(new URL("../scripts/check-independent.ts", import.meta.url));

function specWith(label: string): FigureSpec {
  return parseSpec({
    version: 1,
    root: { type: "block", id: "subject", label, width: 300 },
  });
}

function runCheck(pdfPath: string): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(process.execPath, [checkScript, pdfPath], { encoding: "utf8" });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

test(
  "pdf: options.pdf produces a real PDF whose page matches the figure size by default",
  { timeout: 60000 },
  async () => {
    const result = await render(specWith("PDF size test"), { pdf: {} });
    assert.ok(result.pdf, "expected a pdf buffer");
    assert.equal(result.pdf!.subarray(0, 5).toString("ascii"), "%PDF-");

    const raw = result.pdf!.toString("latin1");
    const match = /MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
    assert.ok(match, "expected a MediaBox in the PDF");
    const widthPt = Number(match![3]);
    const heightPt = Number(match![4]);
    // CSS px -> PDF pt is a factor of 0.75 (96dpi -> 72dpi); allow slack for
    // the ceil() applied to the viewport before printing.
    assert.ok(Math.abs(widthPt - result.figure.width * 0.75) < 2);
    assert.ok(Math.abs(heightPt - result.figure.height * 0.75) < 2);
  },
);

test(
  "pdf: no pdf option means no pdf buffer, exactly as before this feature existed",
  { timeout: 60000 },
  async () => {
    const result = await render(specWith("No PDF"));
    assert.equal(result.pdf, undefined);
  },
);

test(
  "pdf: a named page size (a4) produces the real A4 dimensions in points",
  { timeout: 60000 },
  async () => {
    const result = await render(specWith("A4 test"), { pdf: { size: "a4" } });
    const raw = result.pdf!.toString("latin1");
    const match = /MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
    const widthPt = Number(match![3]);
    const heightPt = Number(match![4]);
    // A4 is 210mm x 297mm; 1mm = 72/25.4 pt.
    assert.ok(Math.abs(widthPt - (210 * 72) / 25.4) < 2);
    assert.ok(Math.abs(heightPt - (297 * 72) / 25.4) < 2);
  },
);

test(
  "check-independent.ts passes a real figure PDF: real paint/text operators are found",
  { timeout: 60000 },
  async () => {
    const result = await render(specWith("Independent check test"), { pdf: {} });
    const dir = mkdtempSync(join(tmpdir(), "prancheta-pdf-"));
    const pdfPath = join(dir, "figure.pdf");
    try {
      writeFileSync(pdfPath, result.pdf!);
      const { status, stdout } = runCheck(pdfPath);
      assert.equal(status, 0, `expected the check to pass: ${stdout}`);
      assert.match(stdout, /real vector\/text content streams found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "check-independent.ts FAILS a raster-only PDF -- the planted defect this check exists to catch",
  { timeout: 60000 },
  async () => {
    // Built the same way page.pdf() would: a full-page <img>, no text, no
    // vector drawing at all -- only a clip rectangle around the image, which
    // is the exact false positive the check's first version had.
    const browser = await chromium.launch();
    const dir = mkdtempSync(join(tmpdir(), "prancheta-pdf-"));
    const pdfPath = join(dir, "raster-only.pdf");
    try {
      const page = await browser.newPage();
      const onePixelPng =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      await page.setContent(
        `<html><body style="margin:0"><img src="data:image/png;base64,${onePixelPng}" ` +
          `style="width:100vw;height:100vh"></body></html>`,
      );
      const pdf = await page.pdf({ width: "100px", height: "100px", printBackground: true });
      writeFileSync(pdfPath, pdf);

      const { status, stderr } = runCheck(pdfPath);
      assert.equal(status, 1, "expected the check to fail on a raster-only PDF");
      assert.match(stderr, /no real paint or text-show operator/);
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
