/**
 * The reading panel (ADR 0062): one builder for every preset that prints
 * computed readings under its figure, the lines recorded on the spec as
 * `readings`, and a sheet that lifts them out of the drawing to set them as
 * page text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { Block, FigureSpec, Scene } from "../src/ir/types.ts";
import { ANSWER_AWARE, parseFigureInput } from "../src/presets/index.ts";
import { Board } from "../src/presets/function-graph/board.ts";
import { layoutPanel, liftReadings, rich, wrapRuns, runsWidth } from "../src/presets/shared/panel.ts";
import { render } from "../src/pipeline.ts";
import { readingsHtml, renderSheetFigure, resolveSheet } from "../src/sheet/sheet.ts";

const MIGRATED = [
  "automaton", "circuit", "construction", "distribution", "field", "linear-map", "logic-circuit", "optics", "probability-tree",
  "revolution", "solid", "space", "statistics", "surface", "truth-table", "value-table", "vectors", "venn",
];
const fixture = (preset: string, name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../fixtures/${preset}/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;
const blocksOf = (spec: FigureSpec): Block[] => (spec.root as Scene).children;

// ---- rich() and wrapping ----------------------------------------------------------------------

test("rich() reads _{…} and ^{…}, merges plain pieces, and leaves a bare _ or ^ as text", () => {
  assert.deepEqual(rich("U_{AB} = V_{A}"), [{ text: "U" }, { text: "AB", script: "sub" }, { text: " = V" }, { text: "A", script: "sub" }]);
  assert.deepEqual(rich("e^{−2,5}"), [{ text: "e" }, { text: "−2,5", script: "sup" }]);
  assert.deepEqual(rich("proj_v(u) and x^2"), [{ text: "proj_v(u) and x^2" }]);
});

test("wrapRuns breaks between words only, and never parts a script from its word", () => {
  const runs = rich("P_{R1} = 11,52 W; P_{R2} = 0,72 W; P_{E2} = 3,6 W (recebida); V_{A} = 12 V");
  const lines = wrapRuns(runs, 130, (r) => runsWidth(r, 13));
  assert.ok(lines.length > 1);
  assert.equal(lines.map((l) => l.map((r) => r.text).join("")).join(" "), "PR1 = 11,52 W; PR2 = 0,72 W; PE2 = 3,6 W (recebida); VA = 12 V");
  for (const l of lines) {
    const i = l.findIndex((r) => r.script === "sub");
    if (i >= 0) assert.ok(i > 0 && !l[i - 1]!.text.endsWith(" "), "a subscript stays on its letter");
  }
});

// ---- the builder --------------------------------------------------------------------------------

test("layoutPanel: ids under panel-, emphasis to weight and colour, scripts as runs, every block freeStanding, readings recorded", () => {
  const panel = layoutPanel(
    [
      { text: "U_{AB} = 7,2 V", emphasis: "strong", id: "u" },
      { text: "a soft note that is long enough to wrap onto a second line in this narrow panel", emphasis: "soft" },
      { text: "P(D) = 1%", emphasis: "accent", colour: "#B3400C", swatch: "#B3400C" },
      { lead: "aab", text: "q₀ →a q₁ →a q₁ →b q₂: aceita", gap: 6 },
    ],
    { width: 260, size: 13 },
  );
  const board = new Board(400, 400, "#FFFFFF");
  const bottom = panel.draw(board, { left: 10, top: 100, cut: 90 });
  assert.equal(bottom, 100 + panel.height);
  const ids = board.kids.map((b) => b.id);
  assert.ok(ids.includes("panel-u") && ids.includes("panel-1") && ids.includes("panel-1-2") && ids.includes("panel-3-lead"), ids.join(" "));
  for (const b of board.kids) {
    assert.ok(b.id!.startsWith("panel-"));
    assert.equal(b.freeStanding, true);
  }
  const u = board.kids.find((b) => b.id === "panel-u")!;
  assert.equal(u.label, "UAB = 7,2 V");
  assert.deepEqual(u.runs, [{ text: "U" }, { text: "AB", script: "sub" }, { text: " = 7,2 V" }]);
  assert.equal(u.fontWeight, 700);
  assert.equal(board.kids.find((b) => b.id === "panel-1")!.textColor, "#4E5763");
  assert.equal(board.kids.find((b) => b.id === "panel-1")!.runs, undefined, "a plain line carries no runs");
  assert.ok(board.marks.some((m) => m.id === "panel-swatch-2"));
  // readings: the LOGICAL lines, unwrapped, for a page to wrap at its own width
  assert.equal(board.readings?.top, 90);
  assert.equal(board.readings?.lines.length, 4);
  assert.deepEqual(board.readings?.lines[2], { runs: [{ text: "P(D) = 1%" }], emphasis: "accent", colour: "#B3400C", swatch: "#B3400C" });
  assert.deepEqual(board.readings?.lines[3]?.lead, [{ text: "aab" }]);
});

// ---- every migrated preset: a panel is readings, and it lifts cleanly ---------------------------

for (const preset of MIGRATED) {
  const files = readdirSync(new URL(`../fixtures/${preset}/`, import.meta.url)).filter((f) => f.endsWith(".json"));
  test(`${preset}: every fixture's panel is recorded as readings and lifts out of the drawing`, () => {
    let withReadings = 0;
    for (const file of files) {
      const input = fixture(preset, file);
      const variants = [input, ...(ANSWER_AWARE.includes(preset) ? [{ ...input, answers: false }] : [])];
      for (const raw of variants) {
        const spec = parseFigureInput(raw);
        const panelText = blocksOf(spec).filter((b) => b.id?.startsWith("panel-"));
        if (spec.readings === undefined) {
          assert.deepEqual(panelText.map((b) => b.id), [], `${file}: panel blocks but no readings`);
          continue;
        }
        withReadings += 1;
        assert.ok(panelText.length > 0, `${file}: readings but no panel drawn`);
        for (const b of panelText) assert.equal(b.freeStanding, true, `${file}: ${b.id}`);
        const lifted = liftReadings(spec);
        const scene = lifted.spec.root as Scene;
        assert.equal(lifted.spec.readings, undefined);
        assert.deepEqual(scene.children.filter((b) => b.id?.startsWith("panel-")), [], file);
        assert.deepEqual((scene.marks ?? []).filter((m) => m.id.startsWith("panel-")), [], file);
        assert.equal(scene.height, spec.readings.top, file);
        assert.ok(spec.readings.top < ((spec.root as Scene).height ?? Infinity), `${file}: the cut is above the canvas foot`);
      }
    }
    assert.ok(withReadings > 0, `${preset}: no fixture draws a panel`);
  });
}

test("answers:false panels hide what they hid: no computed reading reaches `readings`", () => {
  const circuit = parseFigureInput({ ...fixture("circuit", "two-batteries-kirchhoff.json"), answers: false });
  assert.equal(circuit.readings, undefined);
  const optics = parseFigureInput({ ...fixture("optics", "lens-converging-beyond-2f.json"), answers: false });
  assert.deepEqual(optics.readings?.lines.map((l) => l.runs.map((r) => r.text).join("")), ["p = 30 cm; f = 10 cm; o = 3 cm"]);
});

test("liftReadings refuses to crop away anything that is not the panel", () => {
  const spec = parseFigureInput(fixture("optics", "lens-converging-beyond-2f.json"));
  const bad: FigureSpec = { ...spec, readings: { ...spec.readings!, top: 40 } };
  assert.throws(() => liftReadings(bad), /below the panel's cut/);
  const plain = parseFigureInput(fixture("circuit", "parallel.json"));
  assert.equal(liftReadings({ ...plain, readings: undefined }).readings, undefined);
});

test("a lifted figure renders with every check passing and none of its panel's text", { timeout: 120000 }, async () => {
  const spec = parseFigureInput(fixture("circuit", "two-batteries-kirchhoff.json"));
  const drawn = await render(spec, { raster: false });
  const omitted = await render(spec, { raster: false, readings: "omit" });
  assert.match(drawn.svg, />AB<\/tspan>/);
  assert.ok(!omitted.svg.includes("panel-"), "no panel element left");
  assert.equal(omitted.figure.height, spec.readings!.top);
  for (const check of omitted.manifest.checks) assert.ok(check.status !== "fail", `${check.id} ${check.target}: ${check.detail}`);
});

// ---- the sheet ----------------------------------------------------------------------------------

const sheet = (readings?: "page" | "drawing"): unknown => ({
  name: "t",
  title: "t",
  ...(readings === undefined ? {} : { readings }),
  sections: [
    {
      title: "1",
      exercises: [
        {
          id: "1.1",
          level: "easy",
          statement: "{{figure}}",
          figure: { spec: fixture("optics", "total-internal-reflection-water-air.json") },
          answer: "a",
          solution: "{{figure}}",
          solutionFigure: { spec: fixture("circuit", "two-batteries-kirchhoff.json") },
        },
      ],
    },
  ],
});

test("a sheet lifts the panel by default and sets it as page text; `readings: \"drawing\"` keeps it in", { timeout: 120000 }, async () => {
  const lifted = resolveSheet(sheet());
  const [q, s] = lifted.figures;
  assert.equal(q!.readings, "page");
  const qDrawn = await renderSheetFigure(q!);
  // the statement figure's givens: page text, not drawing
  assert.ok(qDrawn.readings !== undefined);
  assert.ok(!qDrawn.svg.includes("sen θ"), "the statement's panel left the drawing");
  const sDrawn = await renderSheetFigure(s!);
  const html = readingsHtml(sDrawn.readings!);
  assert.match(html, /U<sub>AB<\/sub> = V<sub>A<\/sub> − V<sub>B<\/sub> = 7,2 V/);
  assert.match(html, /P<sub>E1<\/sub> = 28,8 W \(fornecida\)/);
  assert.ok(!sDrawn.svg.includes(">AB</tspan>"));

  const kept = resolveSheet(sheet("drawing"));
  assert.equal(kept.figures[1]!.readings, "drawing");
  const inDrawing = await renderSheetFigure(kept.figures[1]!);
  assert.equal(inDrawing.readings, undefined);
  assert.match(inDrawing.svg, />AB<\/tspan>/);
});

test("readingsHtml: emphasis classes, accent colour, swatch and lead columns", () => {
  const html = readingsHtml({
    top: 0,
    lines: [
      { runs: [{ text: "P(D) = 1%" }], emphasis: "accent", colour: "#B3400C", swatch: "#B3400C" },
      { runs: [{ text: "q₀ →a q₁" }], emphasis: "normal", lead: [{ text: "a" }] },
      { runs: [{ text: "x" }, { text: "2", script: "sup" }], emphasis: "soft" },
    ],
  });
  assert.match(html, /grid-template-columns: auto auto 1fr/);
  assert.match(html, /class="r accent span" style="color: #B3400C">P\(D\) = 1%</);
  assert.match(html, /<i style="background: #B3400C"><\/i>/);
  assert.match(html, /class="r normal lead">a<\/span>/);
  assert.match(html, /class="r soft span">x<sup>2<\/sup><\/span>/);
});
