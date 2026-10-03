import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  isTransparent,
  parseColour,
  relativeLuminance,
  WCAG_AA_NORMAL,
} from "../src/colour/contrast.ts";
import {
  DICHROMACY_KINDS,
  MIN_DISTINGUISHABLE_DISTANCE,
  simulate,
  simulatedDistance,
} from "../src/colour/colourblind.ts";
import { THEMES, resolveTheme, roles as darkRoles, theme as darkTheme, palette } from "../src/theme.ts";

// --- parseHexColour -----------------------------------------------------------

test("parseColour reads a 6-digit hex", () => {
  const c = parseColour("#5B8DEF")!;
  assert.equal(c.r, 0x5b);
  assert.equal(c.g, 0x8d);
  assert.equal(c.b, 0xef);
  assert.equal(c.a, 1);
});

test("parseColour expands a 3-digit hex", () => {
  const c = parseColour("#fff")!;
  assert.equal(c.r, 255);
  assert.equal(c.g, 255);
  assert.equal(c.b, 255);
});

test("parseColour reads the 8-digit hex alpha channel rather than discarding it", () => {
  const opaque = parseColour("#5B8DEFFF")!;
  assert.equal(opaque.a, 1);
  const transparent = parseColour("#5B8DEF00")!;
  assert.equal(transparent.a, 0);
});

/**
 * The bug this milestone actually found: `getComputedStyle` never reports
 * hex. Every real render hands this project `rgb(...)`/`rgba(...)`, and a
 * parser that only understood hex made contrast-sufficient silently
 * not-applicable on every real figure -- proven by rendering
 * fixtures/ir/bad-contrast.json end to end, not by a unit test, which is why
 * this regression is pinned here explicitly.
 */
test("parseColour reads what a browser actually reports: rgb() and rgba()", () => {
  const opaque = parseColour("rgb(230, 233, 239)")!;
  assert.equal(opaque.r, 230);
  assert.equal(opaque.g, 233);
  assert.equal(opaque.b, 239);
  assert.equal(opaque.a, 1);

  const withAlpha = parseColour("rgba(23, 26, 33, 0.5)")!;
  assert.equal(withAlpha.a, 0.5);
});

test("a CSS transparent background normalises to rgba(0, 0, 0, 0), and parseColour reads it as alpha 0", () => {
  // The second bug this milestone found, in the same feature: checks.ts once
  // compared `owner.fill === "transparent"` literally, which a real render
  // never produces -- confirmed by rendering a callout-role block and
  // reading its manifest.
  const c = parseColour("rgba(0, 0, 0, 0)")!;
  assert.equal(c.a, 0);
});

test("isTransparent is true for alpha 0 in any of the three forms this project sees", () => {
  assert.equal(isTransparent("transparent"), true);
  assert.equal(isTransparent("rgba(0, 0, 0, 0)"), true);
  assert.equal(isTransparent("#00000000"), true);
});

test("isTransparent is false for a fully opaque colour", () => {
  assert.equal(isTransparent("#171A21"), false);
  assert.equal(isTransparent("rgb(23, 26, 33)"), false);
});

test("parseColour returns null for a CSS colour keyword other than transparent", () => {
  assert.equal(parseColour("red"), null);
});

test("parseColour returns null for malformed input", () => {
  assert.equal(parseColour("#12345"), null);
  assert.equal(parseColour("not a colour"), null);
  assert.equal(parseColour("rgb(1, 2)"), null);
});

// --- relativeLuminance / contrastRatio -----------------------------------------

test("relativeLuminance of black is 0 and white is 1", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#FFFFFF"), 1);
});

test("contrastRatio of black on white is the WCAG maximum, 21:1", () => {
  const ratio = contrastRatio("#000000", "#FFFFFF")!;
  assert.ok(Math.abs(ratio - 21) < 0.01, `expected ~21:1, got ${ratio}`);
});

test("contrastRatio of a colour against itself is 1:1", () => {
  assert.equal(contrastRatio("#5B8DEF", "#5B8DEF"), 1);
});

test("contrastRatio is symmetric", () => {
  const a = contrastRatio("#171A21", "#E6E9EF")!;
  const b = contrastRatio("#E6E9EF", "#171A21")!;
  assert.equal(a, b);
});

test("contrastRatio returns null when either colour is unparsable", () => {
  assert.equal(contrastRatio("red", "#FFFFFF"), null);
  assert.equal(contrastRatio("#FFFFFF", "not a colour"), null);
});

test("contrastRatio treats \"transparent\" as black -- callers must special-case it themselves", () => {
  // parseColour deliberately DOES resolve "transparent" (alpha 0, rgb 0,0,0)
  // rather than rejecting it, because isTransparent() needs a real parse to
  // detect alpha 0 across hex/rgba/literal forms uniformly. contrastRatio has
  // no opinion about transparency; checks.ts's isTransparent()-gated fallback
  // to the canvas colour is what makes that judgement, one layer up.
  assert.equal(contrastRatio("#FFFFFF", "transparent"), 21);
});

// --- the design system's own palettes must clear WCAG AA ----------------------

test("every dark-theme role clears WCAG AA text contrast against its own fill", () => {
  for (const [name, role] of Object.entries(darkRoles)) {
    if (role.fill === "transparent") continue; // checked against canvas separately
    const ratio = contrastRatio(role.text, role.fill)!;
    assert.ok(
      ratio >= WCAG_AA_NORMAL,
      `dark.${name}: ${ratio.toFixed(2)}:1 is below ${WCAG_AA_NORMAL}:1`,
    );
  }
});

test("every theme variant's roles clear WCAG AA text contrast against their own fill", () => {
  for (const variant of Object.values(THEMES)) {
    for (const [name, role] of Object.entries(variant.roles)) {
      if (role.fill === "transparent") continue;
      const ratio = contrastRatio(role.text, role.fill)!;
      assert.ok(
        ratio >= WCAG_AA_NORMAL,
        `${variant.name}.${name}: ${ratio.toFixed(2)}:1 is below ${WCAG_AA_NORMAL}:1`,
      );
    }
  }
});

test("every theme variant's callout text clears contrast against that theme's canvas", () => {
  for (const variant of Object.values(THEMES)) {
    const ratio = contrastRatio(variant.roles.callout.text, variant.canvas.background)!;
    assert.ok(
      ratio >= WCAG_AA_NORMAL,
      `${variant.name}.callout vs canvas: ${ratio.toFixed(2)}:1 is below ${WCAG_AA_NORMAL}:1`,
    );
  }
});

// --- resolveTheme ---------------------------------------------------------------

test("resolveTheme with no argument resolves to dark", () => {
  assert.equal(resolveTheme(), THEMES.dark);
});

test("resolveTheme(\"dark\") is byte-for-byte the pre-existing theme constants", () => {
  const dark = resolveTheme("dark");
  assert.equal(dark.canvas.background, darkTheme.canvas.background);
  assert.equal(dark.canvas.padding, darkTheme.canvas.padding);
  assert.equal(dark.roles, darkRoles);
});

test("resolveTheme names light and print as distinct palettes from dark", () => {
  assert.notEqual(THEMES.light.canvas.background, THEMES.dark.canvas.background);
  assert.notEqual(THEMES.print.canvas.background, THEMES.dark.canvas.background);
  assert.notEqual(THEMES.light.roles.primary.fill, THEMES.dark.roles.primary.fill);
});

// --- colourblind simulation -----------------------------------------------------

test("simulate returns null for an unparsable colour", () => {
  assert.equal(simulate("red", "deuteranopia"), null);
});

test("simulatedDistance of a colour against itself is 0", () => {
  for (const kind of DICHROMACY_KINDS) {
    assert.equal(simulatedDistance("#5B8DEF", "#5B8DEF", kind), 0);
  }
});

test("simulatedDistance returns null when either colour is unparsable", () => {
  assert.equal(simulatedDistance("red", "#5B8DEF", "deuteranopia"), null);
});

test("a muted red/green pair collapses under both dichromacy simulations", () => {
  // Under this simplified matrix, SATURATED red/green (#E74C3C vs #4CAF50)
  // stays over 75 apart -- distinguishable by brightness alone even to a
  // dichromat, which is realistic. Muted, closer-in-luminance red/green
  // (#B48C3C vs #8CB43C) is the pair that actually collapses, and is the
  // shape of confusion this check exists to catch: two "different" chart
  // colours picked at similar lightness with only hue differing.
  for (const kind of DICHROMACY_KINDS) {
    const distance = simulatedDistance("#B48C3C", "#8CB43C", kind)!;
    assert.ok(
      distance < MIN_DISTINGUISHABLE_DISTANCE,
      `expected this red/green pair to collapse under ${kind}, got ${distance.toFixed(1)}`,
    );
  }
});

test("black and white remain maximally distinguishable under both simulations", () => {
  for (const kind of DICHROMACY_KINDS) {
    const distance = simulatedDistance("#000000", "#FFFFFF", kind)!;
    assert.ok(distance > 200, `expected black/white to stay far apart under ${kind}, got ${distance}`);
  }
});

test("the chart preset's own series palette clears the distinguishability floor pairwise", () => {
  // Regression guard for the real defect this milestone found: the old
  // SERIES_COLOURS (a `teal` at #48A9A6, 27.7-30.4 apart from `green` under
  // simulation) failed this exact comparison. palette.magenta is what
  // replaced it, chosen specifically to clear every pair in this set.
  const series = [palette.blue, palette.red, palette.green, palette.yellow, palette.magenta];
  for (const kind of DICHROMACY_KINDS) {
    for (let i = 0; i < series.length; i += 1) {
      for (let j = i + 1; j < series.length; j += 1) {
        const distance = simulatedDistance(series[i]!, series[j]!, kind)!;
        assert.ok(
          distance >= MIN_DISTINGUISHABLE_DISTANCE,
          `series[${i}] vs series[${j}] under ${kind}: ${distance.toFixed(1)}, ` +
            `below the floor of ${MIN_DISTINGUISHABLE_DISTANCE}`,
        );
      }
    }
  }
});
