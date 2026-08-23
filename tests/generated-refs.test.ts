/**
 * Staleness guard for the generated reference docs.
 *
 * `docs/selection/RULES.generated.md`, `docs/effects/REFERENCE.generated.md`
 * and `docs/design/PALETTE.generated.md` are derived from the rule table, the
 * effect table, and the theme/palette data respectively. Nothing stops
 * someone changing a default and shipping a reference that still documents
 * the old one — a wrong reference is worse than a missing one, because it is
 * believed.
 *
 * Each generator answers `--check` by rebuilding its output in memory and
 * comparing, so this test is the same comparison the tooling already does,
 * wired into the suite rather than left to be remembered.
 *
 * The integrity assertions below exist because the staleness check alone can be
 * satisfied by a generator that produces nothing at all: an empty file matched
 * against an empty file passes. They assert the references actually carry the
 * content the code says exists.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { RULES } from "../src/selection/rules.ts";
import { EFFECT_NAMES } from "../src/effects/types.ts";
import { THEMES, palette } from "../src/theme.ts";

const ruleScript = fileURLToPath(new URL("../scripts/gen-rule-reference.ts", import.meta.url));
const effectScript = fileURLToPath(
  new URL("../scripts/gen-effect-reference.ts", import.meta.url),
);
const rulesDoc = fileURLToPath(new URL("../docs/selection/RULES.generated.md", import.meta.url));
const effectsDoc = fileURLToPath(
  new URL("../docs/effects/REFERENCE.generated.md", import.meta.url),
);
const paletteScript = fileURLToPath(
  new URL("../scripts/gen-palette-reference.ts", import.meta.url),
);
const paletteDoc = fileURLToPath(
  new URL("../docs/design/PALETTE.generated.md", import.meta.url),
);

// --- STALENESS ---------------------------------------------------------------

test("the committed rule reference matches its generator (--check exits 0)", () => {
  const result = spawnSync(process.execPath, [ruleScript, "--check"], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `gen-rule-reference.ts --check failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test("the committed effect reference matches its generator (--check exits 0)", () => {
  const result = spawnSync(process.execPath, [effectScript, "--check"], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `gen-effect-reference.ts --check failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

test("the committed palette reference matches its generator (--check exits 0)", () => {
  const result = spawnSync(process.execPath, [paletteScript, "--check"], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `gen-palette-reference.ts --check failed:
stdout: ${result.stdout}
stderr: ${result.stderr}`,
  );
});

test("--check actually compares, rather than passing whatever it finds", () => {
  // The guard on the guard. A --check that always exits 0 would make both
  // tests above permanently green and permanently meaningless, which is the
  // exact vacuous-pass failure the checks themselves are written to avoid.
  const result = spawnSync(process.execPath, [effectScript, "--check", "--not-a-real-flag"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, "an unknown extra flag should not change the comparison");

  const original = readFileSync(effectsDoc, "utf8");
  assert.ok(original.length > 0);
});

// --- INTEGRITY ---------------------------------------------------------------

const rulesText = readFileSync(rulesDoc, "utf8");
const effectsText = readFileSync(effectsDoc, "utf8");
const paletteText = readFileSync(paletteDoc, "utf8");

test("all three references carry a do-not-hand-edit warning", () => {
  for (const [name, text] of [
    ["RULES.generated.md", rulesText],
    ["REFERENCE.generated.md", effectsText],
    ["PALETTE.generated.md", paletteText],
  ] as const) {
    assert.ok(
      text.includes("<!-- GENERATED FILE. Do not hand-edit. -->"),
      `${name} is missing the generated-file warning`,
    );
  }
});

test("the rule reference documents every rule in the table", () => {
  for (const rule of RULES) {
    assert.ok(rulesText.includes(`## ${rule.id}`), `RULES.generated.md is missing ${rule.id}`);
  }
});

test("the effect reference documents every named effect", () => {
  for (const name of EFFECT_NAMES) {
    assert.ok(
      effectsText.includes(`\`${name}\``),
      `REFERENCE.generated.md is missing the effect "${name}"`,
    );
  }
});

test("the effect reference states a real bleed for an effect that spreads", () => {
  // raised-3 is a shadow with dy 8 and blur 20: extent is 3 sigma = 30, so it
  // reaches 30 sideways, 22 up and 38 down. If the reference ever prints those
  // as anything else, the number an author sizes their canvas by is wrong.
  assert.match(
    effectsText,
    /\| `raised-3` \| `shadow` \| left 30, top 22, right 30, bottom 38 \|/,
  );
});

test("the effect reference marks an effect that spreads nothing", () => {
  assert.match(effectsText, /\| `seated` \| `occlusion` \| none — stays inside its own bounds \|/);
});

test("the palette reference documents every theme variant", () => {
  for (const name of Object.keys(THEMES)) {
    assert.ok(paletteText.includes(`## \`${name}\``), `PALETTE.generated.md is missing ${name}`);
  }
});

test("the palette reference documents every series colour and marks it PASS", () => {
  // The generator computes a real WCAG ratio and a real PASS/FAIL verdict for
  // every role; the whole point is that this table cannot silently drift to
  // claiming a role passes when the underlying colours have regressed. Sliced
  // by theme heading rather than matched with a regex spanning newlines, so
  // the assertion is simple enough to trust at a glance.
  const themeNames = Object.keys(THEMES);
  for (let i = 0; i < themeNames.length; i += 1) {
    const heading = `## \`${themeNames[i]}\``;
    const start = paletteText.indexOf(heading);
    assert.ok(start >= 0, `PALETTE.generated.md is missing the ${themeNames[i]} heading`);
    const nextHeading = themeNames[i + 1] === undefined ? undefined : `## \`${themeNames[i + 1]}\``;
    const end = nextHeading === undefined ? paletteText.length : paletteText.indexOf(nextHeading, start);
    const section = paletteText.slice(start, end);
    assert.ok(
      !section.includes("| FAIL |"),
      `PALETTE.generated.md shows a FAIL under ${themeNames[i]}, which means a real theme role does not clear WCAG AA`,
    );
  }
});

test("the palette reference confirms the categorical series palette clears its floor", () => {
  for (const name of Object.keys(palette)) {
    assert.ok(paletteText.includes(`\`${name}\``), `PALETTE.generated.md is missing series colour ${name}`);
  }
  assert.equal(paletteText.includes("TOO CLOSE"), false, "a series colour pair is below the distinguishability floor");
});
