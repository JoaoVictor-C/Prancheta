import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { PRESETS } from "../src/selection/vocabulary.ts";

const presetsDir = fileURLToPath(new URL("../src/presets", import.meta.url));
const selectionDocPath = fileURLToPath(
  new URL("../docs/selection/SELECTION.md", import.meta.url),
);

// --- EVERY PRESET HAS ITS DOC AND IMPLEMENTATION ------------------------------

for (const preset of PRESETS) {
  test(`preset "${preset.id}" has a non-empty PRESET.md`, () => {
    const docPath = join(presetsDir, preset.id, "PRESET.md");
    assert.ok(existsSync(docPath), `missing ${docPath}`);
    const content = readFileSync(docPath, "utf8");
    assert.ok(content.trim().length > 0, `${docPath} is empty`);
  });

  test(`preset "${preset.id}" has a preset.ts`, () => {
    const implPath = join(presetsDir, preset.id, "preset.ts");
    assert.ok(existsSync(implPath), `missing ${implPath}`);
  });
}

// --- NO ORPHAN PRESET DIRECTORIES --------------------------------------------

test("every directory under src/presets/ with a preset.ts corresponds to a PRESETS id", () => {
  const knownIds = new Set(PRESETS.map((preset) => preset.id));
  const entries = readdirSync(presetsDir).filter((entry) =>
    statSync(join(presetsDir, entry)).isDirectory(),
  );
  const orphans = entries.filter(
    (entry) => existsSync(join(presetsDir, entry, "preset.ts")) && !knownIds.has(entry as never),
  );
  assert.deepEqual(orphans, [], `orphan preset directories not in PRESETS: ${orphans.join(", ")}`);
});

// --- SELECTION.md NEVER NAMES A PRESET THAT DOESN'T EXIST ---------------------

test("every preset id mentioned in docs/selection/SELECTION.md exists in PRESETS", () => {
  const docText = readFileSync(selectionDocPath, "utf8");
  const knownIds = new Set(PRESETS.map((preset) => preset.id));
  // Rule ids (`S-...`, `I-...`) are the only backtick-quoted tokens the doc
  // currently uses, and they start with an uppercase letter + hyphen, so a
  // lowercase-starting kebab-case backtick token is a plausible preset-id
  // reference rather than a rule-id fragment. This stays true (vacuously) if
  // no such token exists yet, and catches a dangling reference the moment one
  // is added.
  const backtickTokens = docText.match(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`/g) ?? [];
  const found = new Set(backtickTokens.map((token) => token.slice(1, -1)));
  const unknown = [...found].filter((token) => !knownIds.has(token as never));
  assert.deepEqual(
    unknown,
    [],
    `SELECTION.md backtick-quotes preset-id-shaped tokens absent from PRESETS: ${unknown.join(", ")}`,
  );
});
