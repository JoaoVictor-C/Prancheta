/**
 * PYTHON TEST: the sheet's page PNGs, rasterised by PyMuPDF.
 *
 * In the module suite (scripts/run-tests.ts routes any test that spawns
 * python there) because it fails loudly without Python and PyMuPDF, which
 * is the point: a sheet that silently skipped its pages would look built.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildSheet, sheetFailures } from "../src/sheet/sheet.ts";

const STUB = pathToFileURL(fileURLToPath(new URL("./fixtures/katex-stub", import.meta.url))).href;
const probe = { command: "python", args: ["-c", "import pymupdf; print(pymupdf.__doc__)"] };

test("PyMuPDF is importable", () => {
  const run = spawnSync(probe.command, probe.args, { encoding: "utf8" });
  assert.equal(run.status, 0, `python -m pip install pymupdf\n${run.stderr}`);
});

test("every PDF page becomes a PNG, without pdftoppm", { timeout: 300000 }, async () => {
  const out = mkdtempSync(join(tmpdir(), "prancheta-pages-"));
  const lista = JSON.parse(
    readFileSync(fileURLToPath(new URL("../experiments/exercises/calculo1/lista.json", import.meta.url)), "utf8"),
  );
  const result = await buildSheet(lista, { out, katex: STUB, dpi: 40 });
  assert.deepEqual(sheetFailures(result), []);
  const count = spawnSync(probe.command, ["-c", `import pymupdf; print(pymupdf.open(r"${result.pdf}").page_count)`], {
    encoding: "utf8",
  });
  assert.equal(result.pages.length, Number(count.stdout.trim()));
  assert.ok(result.pages.length > 10);
  assert.match(result.pages[0]!, /p01\.png$/);
  assert.equal(readFileSync(result.pages[0]!).subarray(1, 4).toString(), "PNG");
});
