/**
 * A preset ships complete (ADR 0075). Each implemented preset needs its
 * folder and PRESET.md, at least one fixture in fixtures/<id>/, a test that
 * names it, an ADR cited from its doc, a shelf in PRESET_AREA, and a
 * selection rule. The decision records need unique numbers and a status
 * line each.
 *
 * These are the steps of the procedure in CONTRIBUTING.md that a machine
 * can check; the rest (the ROADMAP entry, the plan row) cannot be checked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PRESETS, PRESET_AREA } from "../src/selection/vocabulary.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const testSources = readdirSync(join(root, "tests"))
  .filter((n) => n.endsWith(".test.ts") && n !== "preset-completeness.test.ts")
  .map((n) => readFileSync(join(root, "tests", n), "utf8"));
const rules = readFileSync(join(root, "src", "selection", "rules.ts"), "utf8");

/** Shipped before ADRs were written per preset; ADR 0002/0004 cover them as a set. */
const BEFORE_PER_PRESET_ADRS = new Set(["labelled-blocks", "graph", "mindmap", "annotated-figure"]);

for (const preset of PRESETS.filter((p) => p.implemented)) {
  test(`preset "${preset.id}" ships complete`, () => {
    const dir = join(root, "src", "presets", preset.id);
    assert.ok(existsSync(join(dir, "PRESET.md")), `src/presets/${preset.id}/PRESET.md`);
    const fixtures = join(root, "fixtures", preset.id);
    assert.ok(
      existsSync(fixtures) && readdirSync(fixtures, { recursive: true }).some((n) => String(n).endsWith(".json")),
      `at least one fixture in fixtures/${preset.id}/`,
    );
    assert.ok(
      testSources.some((src) => src.includes(`"${preset.id}"`) || src.includes(`presets/${preset.id}/`) || src.includes(`fixtures/${preset.id}/`)),
      `a test under tests/ that names "${preset.id}"`,
    );
    if (!BEFORE_PER_PRESET_ADRS.has(preset.id)) {
      const doc = readFileSync(join(dir, "PRESET.md"), "utf8");
      assert.match(doc, /ADRs? \d{4}|decisions\/\d{4}-/, `PRESET.md cites the ADR that introduced "${preset.id}"`);
    }
    assert.ok(PRESET_AREA[preset.id], `"${preset.id}" has a shelf in PRESET_AREA`);
    assert.ok(rules.includes(`"${preset.id}"`), `a selection rule in src/selection/rules.ts mentions "${preset.id}"`);
  });
}

test("every preset folder is in the repertoire", () => {
  const ids = new Set(PRESETS.map((p) => p.id as string));
  const folders = readdirSync(join(root, "src", "presets"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, "src", "presets", d.name, "PRESET.md")))
    .map((d) => d.name);
  for (const f of folders) assert.ok(ids.has(f), `src/presets/${f}/ has a PRESET.md but no entry in PRESETS`);
});

test("no fixture sits loose at the top of fixtures/", () => {
  const loose = readdirSync(join(root, "fixtures"), { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith(".json"));
  assert.deepEqual(loose.map((d) => d.name), [], "fixtures belong in fixtures/<preset>/ or fixtures/ir/");
});

test("decision records: unique numbers and a status each", () => {
  const dir = join(root, "docs", "decisions");
  const names = readdirSync(dir).filter((n) => /^\d{4}-.*\.md$/.test(n));
  const seen = new Map<string, string[]>();
  for (const n of names) seen.set(n.slice(0, 4), [...(seen.get(n.slice(0, 4)) ?? []), n]);
  // The one historical collision; both files are linked from elsewhere, so both keep it.
  const dupes = [...seen.entries()].filter(([num, files]) => files.length > 1 && num !== "0003");
  assert.deepEqual(dupes, [], "an ADR number is used twice; take the next free one from docs/decisions/README.md");
  for (const n of names) {
    const head = readFileSync(join(dir, n), "utf8").split(/\r?\n/).slice(0, 14).join("\n");
    assert.match(head, /Status/i, `${n} has a Status line`);
  }
});
