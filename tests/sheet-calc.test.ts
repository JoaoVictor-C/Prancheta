/**
 * Computed sheet text (ADR 0040): params, `{{= …}}`, the calculus functions,
 * and params substituted into figures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  EMPTY_ENV,
  evaluateCalc,
  evaluateParams,
  formatCalc,
  spellForExpression,
  substituteFigure,
} from "../src/sheet/calc.ts";
import { KATEX, buildSheet, fillText, resolveSheet, sheetHtml } from "../src/sheet/sheet.ts";
import type { SheetInput } from "../src/sheet/sheet.ts";
import { snapExact, writeExact, writeExactTex } from "../src/locale/format.ts";

const STUB = pathToFileURL(fileURLToPath(new URL("./fixtures/katex-stub", import.meta.url))).href;
const LISTA = fileURLToPath(new URL("../experiments/exercises/calculo1/lista.json", import.meta.url));
const PARAMS = fileURLToPath(new URL("../experiments/exercises/parametros/lista.json", import.meta.url));
const none = { fig: new Map(), sol: new Map() };

/** The value of `source`, printed as text and as TeX. */
function both(source: string, env = EMPTY_ENV): [string, string] {
  const v = evaluateCalc(source, env, "t");
  return [formatCalc(v, "pt-BR", false), formatCalc(v, "pt-BR", true)];
}

// ---- params -------------------------------------------------------------------------

test("params: numbers, expressions over other params in any order, and functions", () => {
  const env = evaluateParams({ b: "a + k", a: 2, k: 3, "f(x)": "a*x^2", A: "integral(f(x), x, 0, b)" });
  assert.deepEqual([...env.values.keys()], ["b", "a", "k", "A"], "declaration order");
  assert.equal(env.values.get("b"), 5);
  assert.ok(Math.abs(env.values.get("A")! - 250 / 3) < 1e-9);
  assert.equal(both("f(b)", env)[0], "50");
});

test("params: cycles, unknown names and reserved names are refused by name", () => {
  assert.throws(() => evaluateParams({ a: "b + 1", b: "2a" }), /cycle: a → b → a/);
  assert.throws(() => evaluateParams({ a: "a + 1" }), /cycle: a → a/);
  assert.throws(() => evaluateParams({ "f(x)": "g(x)", "g(x)": "f(x)" }), /cycle: f → g → f/);
  assert.throws(() => evaluateParams({ a: "z + 1" }), /params\.a: .*unknown name "z"/);
  assert.throws(() => evaluateParams({ e: 1 }), /"e" cannot be a param: it is already a constant/);
  assert.throws(() => evaluateParams({ figure2: 1 }), /"figure2" cannot be a param/);
  assert.throws(() => evaluateParams({ integral: 1 }), /already a function/);
  assert.throws(() => evaluateParams({ a: 1, "f(a)": "a" }), /variable "a" is also a param/);
});

test("params: a sheet's params are shared and cannot be redefined; overrides recompute what derives", () => {
  const sheet = evaluateParams({ n: 4 });
  const ex = evaluateParams({ m: "n/2" }, {}, sheet);
  assert.equal(ex.values.get("m"), 2);
  assert.throws(() => evaluateParams({ n: 1 }, {}, sheet), /already a param of the sheet/);
  const varied = evaluateParams({ a: 1, b: "3a", "f(x)": "b x" }, { a: 5 });
  assert.equal(varied.values.get("b"), 15);
  assert.equal(both("f(2)", varied)[0], "30");
  assert.throws(() => evaluateParams({ a: 1 }, { c: 3 }), /the override "c" names no param \(the params are a\)/);
  assert.throws(() => evaluateParams({ "f(x)": "x" }, { f: 3 }), /names a function/);
});

// ---- {{= }} -------------------------------------------------------------------------

test("{{= }} prints exact values: 8/3, √2, π/2, in text and in TeX", () => {
  assert.deepEqual(both("integral(x^2, x, 0, 2)"), ["8/3", "\\frac{8}{3}"]);
  assert.deepEqual(both("sqrt(2)"), ["√2", "\\sqrt{2}"]);
  assert.deepEqual(both("pi/2"), ["π/2", "\\frac{\\pi}{2}"]);
  assert.deepEqual(both("-3pi/2"), ["−3π/2", "-\\frac{3\\pi}{2}"]);
  assert.deepEqual(both("5/2"), ["2,5", "2{,}5"]);
  assert.deepEqual(both("3*integral(x^2, x, 0, 2)"), ["8", "8"]); // each call snapped where computed
});

test("{{= }} in a sheet text: TeX inside math, text outside, shorthand {{a}}, fixed decimals", () => {
  const env = evaluateParams({ a: 2, b: "a + 1", "f(x)": "(1/2)x^2 - b" });
  assert.equal(fillText("\\(A = {{= integral(x^2, x, 0, a)}}\\)", none, "pt-BR", "t", env), "\\(A = \\frac{8}{3}\\)");
  assert.equal(fillText("A = {{= integral(x^2, x, 0, a)}}", none, "pt-BR", "t", env), "A = 8/3");
  assert.equal(fillText("de 0 a {{a}}, $$b = {{b}}$$", none, "pt-BR", "t", env), "de 0 a 2, $$b = 3$$");
  assert.equal(fillText("{{= b/4 : 2}}", none, "pt-BR", "t", env), "0,75");
  assert.equal(fillText("\\(f(x) = {{f}}\\)", none, "pt-BR", "t", env), "\\(f(x) = \\frac{1}{2}x^{2} - 3\\)");
  assert.equal(fillText("f(x) = {{f}}", none, "pt-BR", "t", env), "f(x) = (1/2)x² − 3");
  assert.throws(() => fillText("{{c}}", none, "pt-BR", "t", env), /unknown placeholder \{\{c\}\}.*\(a, b\)/);
  assert.throws(() => fillText("{{= 2,5}}", none, "pt-BR", "t", env), /comma/);
  // No params at all: the old placeholders behave exactly as before.
  assert.equal(fillText("{{num:2.5}} {{pt:2,5}}", none, "pt-BR", "t"), "2,5 (2; 5)");
});

// ---- the calculus functions -----------------------------------------------------------------

test("integral, deriv, lim and f(x): values", () => {
  assert.deepEqual(both("integral(sin(x), x, 0, pi)"), ["2", "2"]);
  assert.deepEqual(both("deriv(x^3, x, 2)"), ["12", "12"]);
  assert.deepEqual(both("deriv(sin(x), x, pi/3)"), ["0,5", "0{,}5"]);
  assert.deepEqual(both("lim(sin(x)/x, x, 0)"), ["1", "1"]);
  assert.deepEqual(both("lim((x^2 - 1)/(x - 1), x, 1)"), ["2", "2"]);
  assert.deepEqual(both("lim(1/x, x, -inf)"), ["0", "0"]);
  assert.deepEqual(both("lim(1/x^2, x, 0)"), ["+∞", "+\\infty"]);
  assert.deepEqual(both("lim(1/x, x, 0, right)"), ["+∞", "+\\infty"]);
  assert.deepEqual(both("lim(1/x, x, 0, left)"), ["−∞", "-\\infty"]);
  const env = evaluateParams({ c: 1, "f(x)": "x^2 + c" });
  assert.deepEqual(both("f(deriv(f(x), x, 2))", env), ["17", "17"]);
});

test("integral, deriv, lim: refused when the numbers cannot be trusted", () => {
  assert.throws(() => evaluateCalc("integral(1/x, x, -1, 1)", EMPTY_ENV, "t"), /pole at x = 0, inside \[−1; 1\]/);
  assert.throws(() => evaluateCalc("integral(1/(x - 1)^2, x, 0, 3)", EMPTY_ENV, "t"), /pole at x = 1/);
  assert.throws(() => evaluateCalc("lim(1/x, x, 0)", EMPTY_ENV, "t"), /the limit was not found/);
  assert.throws(() => evaluateCalc("lim(sin(1/x), x, 0)", EMPTY_ENV, "t"), /the limit was not found/);
  assert.throws(() => evaluateCalc("deriv(abs(x), x, 0)", EMPTY_ENV, "t"), /do not meet at x = 0/);
  assert.throws(() => evaluateCalc("deriv(sqrt(x), x, 0)", EMPTY_ENV, "t"), /not defined on both sides/);
  assert.throws(() => evaluateCalc("lim(1/x^2, x, 0) + 1", EMPTY_ENV, "t"), /cannot take part in arithmetic/);
  assert.throws(() => evaluateCalc("1/(2 - 2)", EMPTY_ENV, "t"), /infinite/);
  assert.throws(() => evaluateCalc("integral(x, x, 0)", EMPTY_ENV, "t"), /integral takes/);
  assert.throws(() => evaluateCalc("integral(deriv(x^2, x, 1), x, 0, 1)", EMPTY_ENV, "t"), /cannot appear inside/);
  const env = evaluateParams({ x: 1 });
  assert.throws(() => evaluateCalc("integral(x, x, 0, 1)", env, "t"), /also a param/);
});

// ---- the shared snapping helper ------------------------------------------------------------------

test("one snapping helper: fractions, √n, kπ/q, at the caller's tolerance", () => {
  assert.equal(writeExact(snapExact(2 / 3 + 1e-8, 1e-7)), "2/3");
  assert.equal(writeExact(snapExact(2 / 3 + 1e-5, 1e-7)), "0,667");
  assert.equal(writeExactTex(snapExact(-Math.SQRT2, 1e-9)), "-\\sqrt{2}");
  assert.equal(writeExactTex(snapExact(2 * Math.PI, 1e-9)), "2\\pi");
});

test("powers of e snap: e, e², 1/e, √e, −e -- and a value merely near e does not", () => {
  assert.equal(writeExact(snapExact(Math.E + 2e-7, 1e-5)), "e");
  assert.equal(writeExact(snapExact(Math.exp(2), 1e-9)), "e²");
  assert.equal(writeExact(snapExact(1 / Math.E, 1e-9)), "1/e");
  assert.equal(writeExact(snapExact(Math.sqrt(Math.E), 1e-9)), "√e");
  assert.equal(writeExact(snapExact(-Math.E, 1e-9)), "−e");
  assert.equal(writeExact(snapExact(2.718, 1e-7)), "2,718");
  assert.equal(writeExactTex(snapExact(Math.exp(-2), 1e-9)), "\\frac{1}{e^{2}}");
  assert.equal(writeExactTex(snapExact(Math.sqrt(Math.E), 1e-9)), "\\sqrt{e}");
  assert.equal(spellForExpression(Math.exp(2)), "e^2");
  assert.equal(spellForExpression(1 / Math.E), "(1/e)");
  assert.equal(formatCalc(evaluateCalc("lim((1 + 1/x)^x, x, inf)"), "pt-BR", false), "e");
});

// ---- figures ---------------------------------------------------------------------------------

test("figure substitution: structural, exact spellings, leftovers refused, untouched without {{", () => {
  const env = evaluateParams({ a: 0.5, b: 3, c: "1/3", "f(x)": "a*x^2" });
  const graph = {
    functions: [{ id: "f", expr: "{{f}}", label: { text: "y = {expr}", at: "{{= b - 0.4}}" } }, { id: "g", expr: "x^{{c}} + {{= -b}}" }],
    areas: [{ id: "A", of: "f", from: 0, to: "{{= b}}" }],
    points: [{ id: "P", at: { of: "f", x: "{{b}}" }, label: "P{coords}" }],
  };
  const out = substituteFigure(graph, env, "fig");
  assert.equal(out.functions[0]!.expr, "((0.5*(x^2)))");
  assert.equal(out.functions[0]!.label!.at, 2.6);
  assert.equal(out.functions[1]!.expr, "x^(1/3) + (-3)");
  assert.equal(out.areas[0]!.to, 3);
  assert.equal(out.points[0]!.at.x, 3);
  assert.equal(out.points[0]!.label, "P{coords}");
  assert.equal(graph.areas[0]!.to, "{{= b}}", "the input is not mutated");
  const plain = { functions: [{ expr: "x^2" }] };
  assert.equal(substituteFigure(plain, env, "fig"), plain, "no {{ anywhere: the same object back");
  assert.throws(() => substituteFigure({ label: "{{fig.P}}" }, env, "fig"), /fig\.label: .*\{\{fig\.P\}\}, which a figure cannot resolve/);
  assert.throws(() => substituteFigure({ to: "{{= z}}" }, env, "fig"), /unknown name "z"/);
  assert.throws(() => substituteFigure({ to: "{{= b" }, env, "fig"), /without a closing/);
  assert.equal(spellForExpression(Math.PI / 2), "(pi/2)");
  assert.equal(spellForExpression(Math.SQRT2), "sqrt(2)");
  assert.equal(spellForExpression(-2), "(-2)");
});

function paramSheet(): SheetInput {
  return {
    name: "calc",
    title: "Texto calculado",
    params: { n: 2 },
    sections: [
      {
        title: "1. Áreas",
        exercises: [
          {
            id: "1.1",
            level: "easy",
            params: { a: 1, b: "n", "f(x)": "a*x^2", A: "integral(f(x), x, 0, b)" },
            statement: "<p>Calcule a área sob \\(y = {{f}}\\) de \\(0\\) a \\({{b}}\\).</p>{{figure}}",
            figure: {
              graph: {
                x: { range: [-0.6, "{{= b + 0.6}}"], unit: 110, step: 0.5, labelEvery: 2 },
                y: { range: [-0.8, "{{= f(b) + 0.8}}"], unit: 50 },
                functions: [{ id: "f", expr: "{{f}}", label: { text: "y = {expr}", at: "{{= b + 0.15}}", towards: ["L", "U"] } }],
                areas: [{ id: "A", of: "f", from: 0, to: "{{= b}}" }],
                points: [{ id: "B", at: { of: "f", x: "{{b}}" } }],
              },
            },
            answer: "\\(A = {{A}}\\)",
          },
        ],
      },
    ],
  } as unknown as SheetInput;
}

test("statement and figure share one value; an override moves both", () => {
  const resolved = resolveSheet(paramSheet());
  assert.equal(resolved.texts.get("1.1.statement"), "<p>Calcule a área sob \\(y = x^{2}\\) de \\(0\\) a \\(2\\).</p>{{figure}}");
  assert.equal(resolved.texts.get("1.1.answer"), "\\(A = \\frac{8}{3}\\)");
  const graph = resolved.figures[0]!.figure.graph as unknown as { areas: { to: number }[]; points: { at: { x: number } }[] };
  assert.equal(graph.areas[0]!.to, 2);
  assert.equal(graph.points[0]!.at.x, 2);

  const varied = resolveSheet(paramSheet(), { sheet: { n: 3 }, exercises: { "1.1": { a: 2 } } });
  assert.equal(varied.texts.get("1.1.answer"), "\\(A = 18\\)");
  assert.match(varied.texts.get("1.1.statement")!, /y = 2x\^\{2\}.*\\\(3\\\)/);
  assert.equal((varied.figures[0]!.figure.graph as unknown as { areas: { to: number }[] }).areas[0]!.to, 3);
  assert.throws(() => resolveSheet(paramSheet(), { exercises: { "9.9": { a: 1 } } }), /exercise "9\.9"/);
});

test("a graph written with params renders with every check passing, its area label the answer's value", { timeout: 240000 }, async () => {
  const out = mkdtempSync(join(tmpdir(), "prancheta-calc-"));
  const result = await buildSheet(paramSheet(), { out, katex: STUB, pdf: false });
  assert.deepEqual(result.figureFailures, []);
  const svg = readFileSync(result.figures[0]!, "utf8");
  assert.match(svg, /A = 8\/3/, "the figure's own area label agrees with {{A}}");
  const html = readFileSync(result.html, "utf8");
  assert.doesNotMatch(html, /\{\{(?!figure)/, "no placeholder left in the page");
});

test("the example list with params resolves with no raw placeholder", () => {
  const resolved = resolveSheet(JSON.parse(readFileSync(PARAMS, "utf8")));
  for (const [key, text] of resolved.texts) assert.doesNotMatch(text, /\{\{(?!figure\d*\}\})/, key);
  assert.equal(resolved.texts.get("1.1.answer"), "\\(A = 4{,}5\\)");
  assert.equal(resolved.texts.get("2.1.answer"), "\\(y = 9x - 16\\)");
  assert.equal(resolved.texts.get("2.2.answer"), "\\(6\\)");
});

// ---- backward compatibility ------------------------------------------------------------

test("the Cálculo 1 list's HTML is byte-for-byte what it was before computed text", () => {
  // sha256 of calculo1.html as built by the sheet command BEFORE ADR 0040
  // (default KaTeX URL). Change it only for a deliberate edit of the list.
  // Changed once, by ADR 0063: the page's style gained the bundled face's
  // @font-face and its body family became the bundled stack -- verified to
  // be the ONLY difference (undoing those two edits gives back 2f439e18...).
  // Changed again, for chemistry lists: the head loads KaTeX's mhchem
  // extension (\ce{...}), and a figure is shrunk to the column but never
  // enlarged past its own size -- verified the ONLY differences (undoing
  // them gives back 314eaa3f...).
  const BEFORE = "73c9187a584e3c1d1cc1451041e50829dce439464d774d5a73a9b705fb26e1ab";
  const { sheet, texts, figures } = resolveSheet(JSON.parse(readFileSync(LISTA, "utf8")));
  const map = new Map(
    figures.map((f) => [f.key, { src: `figures/${f.key}.svg`, caption: texts.get(f.captionKey), wide: f.figure.wide }] as const),
  );
  const html = sheetHtml(sheet, texts, map, KATEX).replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(html, "utf8").digest("hex"), BEFORE);
});
