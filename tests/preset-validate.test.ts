/**
 * The preset-input validation layer.
 *
 * Two populations, proving different things. The FIXTURE CORPUS is regression
 * cover and nearly a tautology as evidence of anything else -- those documents
 * were the reference while the validators were written, so of course they
 * pass. The ADVERSARIAL INPUTS are the only evidence the layer is not
 * decorative: each is a real failure measured against this repo before the
 * layer existed, and each has to come back named, with the offending path in
 * the message.
 *
 * What every adversarial case has in common: none of it is repairable. Repair
 * edits `width | height | wrap | canvasPadding` and nothing else, so a
 * dangling reference, a missing key, a duplicate id and a degenerate total all
 * sit squarely on this layer's side of the line.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SpecError } from "../src/ir/types.ts";
import { isPresetInput, parseFigureInput, validatePresetInput } from "../src/presets/index.ts";
import { PRESETS } from "../src/selection/vocabulary.ts";

function refusal(input: unknown): string {
  try {
    parseFigureInput(input);
  } catch (error) {
    assert.ok(error instanceof SpecError, `expected SpecError, got ${String(error)}`);
    return (error as SpecError).message;
  }
  assert.fail(`expected a refusal, got a figure: ${JSON.stringify(input)}`);
}

// ---------------------------------------------------------------------------
// The dispatch, and the refusal this project most needed to be able to make.
// ---------------------------------------------------------------------------

test("an unknown preset is refused by name, listing the repertoire and naming select", () => {
  const message = refusal({ preset: "flowchart", nodes: [] });
  assert.match(message, /flowchart/);
  assert.match(message, /select/);
  for (const preset of PRESETS.filter((entry) => entry.implemented)) {
    assert.match(message, new RegExp(preset.id));
  }
  // The defect this replaces: the raw-IR parser answering a question about a
  // preset by complaining about a field the author never wrote.
  assert.doesNotMatch(message, /version/);
});

test("a document that is neither preset nor IR is told it is neither", () => {
  const message = refusal({ nodes: [] });
  assert.match(message, /neither/);
  assert.match(message, /"preset"/);
  assert.match(message, /"version"/);
});

test("a valid raw-IR document still goes through untouched", () => {
  const spec = parseFigureInput({
    version: 1,
    root: { type: "block", id: "only", width: 100, height: 40 },
  });
  assert.equal(spec.version, 1);
});

// ---------------------------------------------------------------------------
// The five adversarial inputs.
// ---------------------------------------------------------------------------

test("a dangling edge reference names edges[0].to, not ELK's internal graph", () => {
  const message = refusal({
    preset: "graph",
    nodes: [{ id: "a", label: "A" }],
    edges: [{ from: "a", to: "zzz" }],
  });
  assert.match(message, /graph\.edges\[0\]\.to/);
  assert.match(message, /"zzz"/);
  assert.doesNotMatch(message, /elk/i);
});

test("a near-miss key is named in the refusal and is never renamed for the author", () => {
  const message = refusal({ preset: "chart", categories: [{ label: "Q1", value: 42 }] });
  assert.match(message, /chart\.categories\[0\]\.values/);
  assert.match(message, /"value"/);
  assert.match(message, /nothing is renamed for you/);
});

test("duplicate node ids are refused rather than silently merged by ELK", () => {
  const message = refusal({
    preset: "graph",
    nodes: [
      { id: "a", label: "A" },
      { id: "a", label: "Again" },
    ],
    edges: [],
  });
  assert.match(message, /graph\.nodes\[1\]\.id/);
});

test("a stacked100 category summing to zero is refused, not drawn empty under a 100% label", () => {
  const message = refusal({
    preset: "chart",
    stacking: "stacked100",
    categories: [
      { label: "NA", values: [0, 0] },
      { label: "EU", values: [1, 2] },
    ],
  });
  assert.match(message, /chart\.categories\[0\]\.values/);
  assert.match(message, /100%/);
});

test("a callout pointing at an undeclared part is refused, and the near part is offered", () => {
  const message = refusal({
    preset: "annotated-figure",
    width: 620,
    height: 340,
    parts: [{ id: "case", x: 10, y: 10, width: 100, height: 100 }],
    callouts: [{ text: "Terminal", at: { x: 20, y: 20 }, points: "casee" }],
  });
  assert.match(message, /annotated-figure\.callouts\[0\]\.points/);
  assert.match(message, /Did you mean "case"\?/);
});

// ---------------------------------------------------------------------------
// The boundary against the check layer, stated as a test so it cannot drift
// into "refuse everything statically knowable".
// ---------------------------------------------------------------------------

test("a part taller than its canvas is NOT refused -- repair grows boxes, so it is the checks' business", () => {
  const spec = parseFigureInput({
    preset: "annotated-figure",
    width: 620,
    height: 340,
    parts: [{ id: "tall", x: 10, y: 10, width: 100, height: 900 }],
    callouts: [{ text: "Part", at: { x: 20, y: 20 }, points: "tall" }],
  });
  assert.equal(spec.version, 1);
});

test("derived overflow is caught even though every value written is finite", () => {
  const message = refusal({
    preset: "chart",
    categories: [{ label: "big", values: [Number.MAX_VALUE, Number.MAX_VALUE] }],
  });
  assert.match(message, /summed/);
});

test("a NaN or Infinity written by hand is refused where it is written", () => {
  const message = refusal({
    preset: "annotated-figure",
    width: 620,
    height: 340,
    callouts: [{ text: "x", at: { x: 20, y: 20 }, points: { x: 1, y: Infinity } }],
  });
  assert.match(message, /annotated-figure\.callouts\[0\]\.points\.y/);
});

test("an empty collection the expander would index is refused with a reason", () => {
  assert.match(refusal({ preset: "graph", nodes: [], edges: [] }), /must not be empty/);
  assert.match(refusal({ preset: "chart", categories: [] }), /must not be empty/);
  assert.match(refusal({ preset: "labelled-blocks", items: [] }), /must not be empty/);
});

test("a mindmap with no root is told a mindmap has exactly one", () => {
  const message = refusal({ preset: "mindmap" });
  assert.match(message, /mindmap\.root is required/);
});

test("mindmap ids are unique across the whole tree, not just among siblings", () => {
  const message = refusal({
    preset: "mindmap",
    root: {
      label: "Root",
      id: "dup",
      children: [{ label: "Deep", children: [{ label: "Deeper", id: "dup" }] }],
    },
  });
  assert.match(message, /already used by an earlier node/);
});

test("a series list that does not match the value count is refused", () => {
  const message = refusal({
    preset: "chart",
    categories: [{ label: "Q1", values: [1, 2] }],
    series: ["only one"],
  });
  assert.match(message, /chart\.series/);
});

// ---------------------------------------------------------------------------
// Coverage and corpus.
// ---------------------------------------------------------------------------

test("every implemented preset has a validator wired into the dispatch", () => {
  for (const preset of PRESETS.filter((entry) => entry.implemented)) {
    // A preset with no clause in validatePresetInput would fall out of the
    // switch and return silently; a preset WITH one refuses this stub, since
    // no preset's required fields are all absent.
    const stub = { preset: preset.id } as never;
    assert.throws(
      () => validatePresetInput(stub),
      SpecError,
      `${preset.id} has no validator clause, or its validator accepts an empty input`,
    );
  }
});

test("every preset-input fixture this repo ships still passes the layer", () => {
  // Every folder under fixtures/, since fixtures live in fixtures/<preset>/ (ADR 0075).
  const dir = fileURLToPath(new URL("../fixtures/", import.meta.url));
  let checked = 0;
  for (const entry of readdirSync(dir, { recursive: true })) {
    const name = String(entry).split("\\").join("/");
    if (!name.endsWith(".json")) continue;
    const parsed: unknown = JSON.parse(readFileSync(new URL(name, pathToFileURL(dir)), "utf8"));
    if (!isPresetInput(parsed)) continue;
    checked += 1;
    assert.doesNotThrow(() => parseFigureInput(parsed), `fixtures/${name} is now refused`);
  }
  // A corpus that silently matched nothing would pass this test while proving
  // nothing at all.
  assert.ok(checked > 0, "no preset fixtures were found to check");
});
