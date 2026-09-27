/**
 * The `sheet` command: one structured file in, a checked sheet out.
 *
 * KaTeX is replaced by a local stand-in (tests/fixtures/katex-stub) so this
 * runs offline; it produces the same .katex / .katex-error elements the
 * build inspects. Page PNGs need Python and live in sheet-pages.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildSheet, defaultSheetDir, fillText, sheetFailures, validateSheet } from "../src/sheet/sheet.ts";
import type { SheetFigure, SheetInput } from "../src/sheet/sheet.ts";
import { commandByName } from "../src/commands.ts";

/** The first figure, whether an exercise has one or several. */
const one = (f: SheetFigure | SheetFigure[] | undefined): SheetFigure | undefined => (Array.isArray(f) ? f[0] : f);

const STUB = pathToFileURL(fileURLToPath(new URL("./fixtures/katex-stub", import.meta.url))).href;
const LISTA = fileURLToPath(new URL("../experiments/exercises/calculo1/lista.json", import.meta.url));
const tmp = (): string => mkdtempSync(join(tmpdir(), "prancheta-sheet-"));

function small(overrides: Partial<SheetInput> = {}): SheetInput {
  return {
    name: "teste",
    title: "Lista de teste",
    footer: "Teste",
    sections: [
      {
        title: "1. Retas",
        exercises: [
          {
            id: "1.1",
            level: "easy",
            statement: "<p>Seja \\(P={{fig.P}}\\). Em texto: {{fig.P}}.</p>{{figure}}<p>Depois da figura.</p>",
            figure: {
              graph: {
                x: { range: [-1, 4], unit: 60 },
                y: { range: [-1, 8], unit: 30 },
                functions: [{ id: "f", expr: "x^2", label: { text: "y = {expr}", at: [-0.5, 3], towards: ["U"] } }],
                points: [{ id: "P", at: { of: "f", x: 2.5 }, label: "P{coords}", towards: ["L", "NW"] }],
              },
              caption: "O ponto \\(P={{fig.P}}\\).",
            },
            answer: "\\(y=5x-6{,}25\\)",
            solution: "<p>Derive e substitua.</p>",
          },
          { id: "1.2", level: "hard", statement: "<p>Calcule \\(2+2\\).</p>", answer: "\\(4\\)" },
        ],
      },
    ],
    ...overrides,
  };
}

// --- text -------------------------------------------------------------------

test("placeholders are formatted as TeX inside math and as text outside", () => {
  const points = { fig: new Map([["P", { x: 2.5, y: 6.25 }]]), sol: new Map() };
  assert.equal(fillText("\\(P={{fig.P}}\\)", points, "pt-BR", "t"), "\\(P=\\left(2{,}5;\\,6{,}25\\right)\\)");
  assert.equal(fillText("P = {{fig.P}}", points, "pt-BR", "t"), "P = (2,5; 6,25)");
  assert.equal(fillText("$$x={{fig.P.x}}$$ e {{num:2073.6:2}}", points, "pt-BR", "t"), "$$x=2{,}5$$ e 2073,60");
  assert.equal(fillText("{{pt:2,5}}", points, "pt-BR", "t"), "(2; 5)");
  assert.throws(() => fillText("{{fig.Q}}", points, "pt-BR", "t"), /names point "Q".*declares P/);
  assert.throws(() => fillText("{{bogus}}", points, "pt-BR", "t"), /unknown placeholder/);
});

test("validation refuses what cannot be built", () => {
  assert.throws(() => validateSheet({ ...small(), name: "a/b" }), /folder-safe/);
  assert.throws(() => validateSheet({ ...small(), sections: [] }), /must not be empty/);
  const twice = small();
  twice.sections[0]!.exercises[1]!.id = "1.1";
  assert.throws(() => validateSheet(twice), /already used/);
  const noFigure = small();
  delete noFigure.sections[0]!.exercises[0]!.figure;
  assert.throws(() => validateSheet(noFigure), /marks \{\{figure\}\} but the exercise has no figure/);
  const badLevel = small();
  (badLevel.sections[0]!.exercises[0] as { level: string }).level = "easyish";
  assert.throws(() => validateSheet(badLevel), /level/);
});

test("the default folder is ProjectHub/Listas/<name>, beside the repository", () => {
  const saved = process.env.PRANCHETA_SHEETS_DIR;
  delete process.env.PRANCHETA_SHEETS_DIR;
  try {
    assert.match(defaultSheetDir("calculo1").replaceAll("\\", "/"), /ProjectHub\/Listas\/calculo1$/);
    process.env.PRANCHETA_SHEETS_DIR = join(tmpdir(), "listas");
    assert.equal(defaultSheetDir("x"), join(tmpdir(), "listas", "x"));
  } finally {
    if (saved === undefined) delete process.env.PRANCHETA_SHEETS_DIR;
    else process.env.PRANCHETA_SHEETS_DIR = saved;
  }
});

// --- build --------------------------------------------------------------------

test("a sheet builds: figure rendered and checked, answer key generated, PDF written", { timeout: 240000 }, async () => {
  const out = tmp();
  const result = await buildSheet(small(), { out, katex: STUB, pages: false, source: "{}" });
  assert.deepEqual(sheetFailures(result), []);
  assert.ok(existsSync(join(out, "figures", "q1-1.svg")));
  assert.ok(result.pdf !== undefined && readFileSync(result.pdf).subarray(0, 5).toString() === "%PDF-");
  assert.ok(existsSync(join(out, "teste.json")), "the source is kept beside its PDF");

  const html = readFileSync(result.html, "utf8");
  // The answer appears exactly twice -- the key and the solution -- from one field.
  assert.equal(html.split("\\(y=5x-6{,}25\\)").length - 1, 2);
  assert.match(html, /<table class="ref gab">[\s\S]*<td>1\.1<\/td><td>\\\(y=5x-6\{,\}25\\\)<\/td>/);
  assert.match(html, /<span class="ans">Resposta: \\\(y=5x-6\{,\}25\\\)<\/span>/);
  // The figure sits where {{figure}} marked it, with its caption's placeholder resolved.
  assert.match(html, /<\/p><figure><img src="figures\/q1-1\.svg"><figcaption>O ponto \\\(P=\\left\(2\{,\}5;\\,6\{,\}25\\right\)\\\)/);
  assert.match(html, /Em texto: \(2,5; 6,25\)\./);
  // The same number the figure's own label prints.
  assert.match(readFileSync(join(out, "figures", "q1-1.svg"), "utf8"), /P\(2,5; 6,25\)/);
  // Inline formulas never break across lines.
  assert.match(html, /\.katex \{[^}]*white-space: nowrap/);
});

test("KaTeX errors and broken images are returned, and fail the command", { timeout: 240000 }, async () => {
  const bad = small();
  bad.sections[0]!.exercises[1]!.statement = '<p>\\(\\undefinedmacro{x}\\)</p><img src="figures/missing.png">';
  const out = tmp();
  const result = await buildSheet(bad, { out, katex: STUB, pages: false });
  assert.equal(result.katexErrors.length, 1);
  assert.match(result.katexErrors[0]!, /Undefined control sequence/);
  assert.deepEqual(result.brokenImages, ["figures/missing.png"]);
  assert.ok(sheetFailures(result).length >= 2);
});

test("a figure that fails a check is reported by name", { timeout: 240000 }, async () => {
  const bad = small();
  // Two unlabelled solid curves: told apart by colour alone.
  one(bad.sections[0]!.exercises[0]!.figure)!.graph!.functions!.push({ id: "g", expr: "x + 1", colour: "ask" });
  delete one(bad.sections[0]!.exercises[0]!.figure)!.graph!.functions![0]!.label;
  const result = await buildSheet(bad, { out: tmp(), katex: STUB, pdf: false });
  assert.equal(result.figureFailures.length, 1);
  assert.match(result.figureFailures[0]!.checks.join(" "), /series-distinguishable-without-colour/);
});

// --- the Cálculo 1 list ---------------------------------------------------------

test("the Cálculo 1 list converts: 30 exercises, 14 figures, every answer written once", () => {
  const lista = validateSheet(JSON.parse(readFileSync(LISTA, "utf8")));
  const exercises = lista.sections.flatMap((s) => s.exercises);
  assert.equal(exercises.length, 30);
  assert.equal(exercises.filter((e) => e.figure).length + exercises.filter((e) => e.solutionFigure).length, 14);
  assert.ok(exercises.every((e) => e.answer.length > 0 && e.solution !== undefined));
});

test("the list's figures are the fixtures, not a drifting copy of them", () => {
  const lista = JSON.parse(readFileSync(LISTA, "utf8")) as SheetInput;
  const keyOf: Record<string, string> = {};
  for (const e of lista.sections.flatMap((s) => s.exercises)) {
    const q = one(e.figure);
    const s = one(e.solutionFigure);
    if (q?.graph) keyOf[`q${e.id.replace(".", "-")}`] = JSON.stringify(q.graph);
    if (s?.graph) keyOf[`s${e.id.replace(".", "-")}`] = JSON.stringify(s.graph);
  }
  for (const [key, graph] of Object.entries(keyOf)) {
    const fixture = JSON.parse(
      readFileSync(fileURLToPath(new URL(`../fixtures/function-graph/calc1-${key}.json`, import.meta.url)), "utf8"),
    );
    delete fixture.preset;
    assert.equal(graph, JSON.stringify(fixture), `${key} differs from its fixture -- rerun convert.py`);
  }
});

test("the sheet command (CLI and MCP) builds the Cálculo 1 list with every figure clean", { timeout: 600000 }, async () => {
  const out = tmp();
  const result = await commandByName("sheet")!.run({ sheet: LISTA, out, katex: STUB, pages: false });
  assert.equal(result.exitCode, 0, result.text);
  const data = result.data as { figures: string[]; pdf: string };
  assert.equal(data.figures.length, 14);
  const html = readFileSync(join(out, "calculo1.html"), "utf8");
  assert.equal((html.match(/<tr><td>\d\.\d<\/td>/g) ?? []).length, 30, "one answer-key row per exercise");
  assert.match(html, /P=\\left\(2;\\,5\\right\)/, "2.5 cites P from its figure");
});

test("an exercise may carry several figures: a graph and its sign table, each at its marker", { timeout: 240000 }, async () => {
  const sheet = small();
  const e = sheet.sections[0]!.exercises[0]!;
  e.solution = "<p>O quadro:</p>{{figure2}}<p>E o gráfico:</p>{{figure}}";
  e.solutionFigure = [
    { graph: one(e.figure)!.graph!, caption: "o gráfico, com P = {{sol.P}}" },
    { spec: { preset: "sign-chart", expr: "x^2", rows: ["f'", "variation"] }, caption: "o quadro de sinais" },
  ];
  const out = tmp();
  const result = await buildSheet(sheet, { out, katex: STUB, pdf: false });
  assert.deepEqual(sheetFailures(result), []);
  assert.ok(existsSync(join(out, "figures", "s1-1.svg")) && existsSync(join(out, "figures", "s1-1-2.svg")));
  const html = readFileSync(result.html, "utf8");
  const table = html.indexOf("figures/s1-1-2.svg");
  const graph = html.indexOf("figures/s1-1.svg");
  assert.ok(html.indexOf("O quadro:") < table && table < html.indexOf("E o gráfico:") && html.indexOf("E o gráfico:") < graph);
  assert.match(html, /o gráfico, com P = \(2,5; 6,25\)/);
});

test("a marker for a figure that does not exist is refused", () => {
  const sheet = small();
  sheet.sections[0]!.exercises[0]!.statement += "{{figure2}}";
  assert.throws(() => validateSheet(sheet), /marks \{\{figure2\}\} but the exercise has 1 figure/);
});
