/**
 * data-table: a table of GIVEN text and numbers, with a few derived cells.
 * These tests decode the DRAWN cells (by id) and compare them with tables
 * worked out by hand: pt-BR number writing, derived columns and totals, the
 * answers:false contract, scripts markup, header wrapping, validation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandDataTable, markup, validateDataTableInput } from "../src/presets/data-table/preset.ts";
import type { DataTableInput } from "../src/presets/data-table/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import { NARROW_SPACE } from "../src/locale/format.ts";

const dir = fileURLToPath(new URL("../fixtures/data-table/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));
const fixture = (name: string): DataTableInput => JSON.parse(readFileSync(join(dir, name), "utf8")) as DataTableInput;

type Placed = Block & { id: string; x: number; y: number; width: number; height: number };
const blocksOf = (input: DataTableInput): Placed[] => (expandDataTable(input).root as Scene).children as Placed[];

/** The table as printed: rows of cell texts (a wrapped cell's lines joined by a space; an empty cell is ""). */
function decode(input: DataTableInput): { heads: string[]; rows: string[][]; blocks: Placed[] } {
  const blocks = blocksOf(input);
  const cell = blocks.filter((b) => /^cell-\d+-\d+/.test(b.id));
  const rowCount = Math.max(...cell.map((b) => Number(b.id.split("-")[1]))) + 1;
  const colCount = input.columns.length;
  const rows = Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: colCount }, (_, c) =>
      blocks
        .filter((b) => b.id === `cell-${r}-${c}` || b.id.startsWith(`cell-${r}-${c}-l`))
        .map((b) => b.label ?? "")
        .join(" "),
    ),
  );
  const heads: string[] = [];
  for (let c = 0; c < colCount; c += 1) {
    heads.push(
      blocks
        .filter((b) => b.id.startsWith(`head-${c}-`))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((b) => b.label ?? "")
        .join(" "),
    );
  }
  return { heads, rows, blocks };
}

// ---- numbers, pt-BR ------------------------------------------------------------

test("given numbers print with a decimal comma and the column's own decimals", () => {
  const t = decode({
    columns: [{ header: "Item" }, { header: "Massa", unit: "kg" }],
    rows: [["a", 2.5], ["b", 10], ["c", 0.25]],
  });
  assert.deepEqual(t.heads, ["Item", "Massa (kg)"]);
  assert.deepEqual(t.rows.map((r) => r[1]), ["2,50", "10,00", "0,25"]);
});

test("a whole-number column prints no decimals, five digits get the narrow space", () => {
  const t = decode({ columns: [{ header: "n" }], rows: [[7], [12345], [2023]] });
  assert.deepEqual(t.rows.map((r) => r[0]), ["7", `12${NARROW_SPACE}345`, "2023"]);
});

test("formats: money, percent (a fraction times 100), integer, explicit decimals, prefix and suffix", () => {
  const t = decode({
    columns: [
      { header: "a", format: "money" },
      { header: "b", format: "percent" },
      { header: "c", format: "integer" },
      { header: "d", format: { decimals: 1, suffix: " °C" } },
      { header: "e", format: { decimals: 0, prefix: "R$ ", grouping: true } },
    ],
    rows: [[1234.5, 0.256, 7.4, -3, 12345]],
  });
  assert.deepEqual(t.rows[0], ["1.234,50", "25,6%", "7", "−3,0 °C", "R$ 12.345"]);
});

// ---- derived columns and totals ---------------------------------------------------

test("a derived column is computed from the other columns, by letter or id", () => {
  const t = decode({
    columns: [
      { header: "Produto" },
      { header: "Qtd", id: "q" },
      { header: "Preço", id: "p", format: "money" },
      { header: "Total", from: "q*p", format: "money" },
      { header: "Dobro", from: "D*2", format: "money" },
    ],
    rows: [["x", 3, 2.5], ["y", 4, 0.75]],
  });
  assert.deepEqual(t.rows.map((r) => r.slice(3)), [["7,50", "15,00"], ["3,00", "6,00"]]);
});

test("a totals row reduces named columns; a derived column's total is the sum of what is drawn", () => {
  const t = decode({
    columns: [{ header: "Item" }, { header: "n", id: "n" }, { header: "preço", id: "p" }, { header: "total", from: "n*p" }],
    rows: [["a", 2, 1.5], ["b", 3, 2]],
    totals: { by: { n: "sum", D: "sum", p: "max" } },
  });
  assert.deepEqual(t.rows[2], ["Total", "5", "2,0", "9"]);
  const drawn = t.rows.slice(0, 2).map((r) => Number(r[3]!.replace(",", ".")));
  assert.equal(drawn.reduce((s, x) => s + x, 0), 9);
});

test("a mean totals row is labelled Média, and the mean is computed", () => {
  const t = decode({ columns: [{ header: "Aluno" }, { header: "Nota" }], rows: [["a", 6], ["b", 7], ["c", 9]], totals: { by: { B: "mean" } } });
  assert.deepEqual(t.rows[3], ["Média", "7,33"]);
});

test("a percent derived column: the ratio is times 100", () => {
  const t = decode({
    columns: [{ header: "a", id: "a" }, { header: "b", id: "b" }, { header: "a/b", from: "a/b", format: "percent" }],
    rows: [[3, 8]],
  });
  assert.equal(t.rows[0]![2], "37,5%");
});

test("derived columns may use other derived columns, and a loop is refused", () => {
  const ok = decode({ columns: [{ header: "x", id: "x" }, { header: "y", from: "x+1", id: "y" }, { header: "z", from: "y*2" }], rows: [[4]] });
  assert.equal(ok.rows[0]![2], "10");
  assert.throws(
    () => expandDataTable({ columns: [{ header: "a", from: "B+1" }, { header: "b", from: "A+1" }], rows: [[]] }),
    (e: unknown) => e instanceof SpecError && /loop/.test(e.message),
  );
});

test("computing from a blank cell, a text cell or dividing by zero is refused with the cell named", () => {
  const base = { columns: [{ header: "a" }, { header: "b", from: "A*2" }] };
  assert.throws(() => expandDataTable({ ...base, rows: [[null]] }), /blank/);
  assert.throws(() => expandDataTable({ ...base, rows: [["texto"]] }), /needs a number/);
  assert.throws(() => expandDataTable({ columns: [{ header: "a" }, { header: "b", from: "1/A" }], rows: [[0]] }), /finite/);
  assert.throws(() => expandDataTable({ columns: [{ header: "a" }, { header: "b", from: "Q+1" }], rows: [[1]] }), SpecError);
});

// ---- answers: false -------------------------------------------------------------------

test("answers:false empties derived cells, totals and { answer } cells, and keeps every given cell", () => {
  const input = fixture("fill-in-answers.json");
  const shown = decode(input);
  const asked = decode({ ...input, answers: false, blank: undefined });
  assert.equal(shown.rows[0]![3], "2,75");
  assert.equal(shown.rows[2]![2], "5,0");
  assert.deepEqual(asked.rows.map((r) => r[3]), ["", "", "", "", "", ""]);
  assert.equal(asked.rows[2]![2], "");
  assert.equal(asked.rows[3]![1], "");
  // What is given stays: names, the numbers that were not asked.
  assert.deepEqual(asked.rows.map((r) => r[0]), shown.rows.map((r) => r[0]));
  assert.equal(asked.rows[0]![1], "5500");
  assert.equal(asked.rows[5]![0], "Total diário");
  // No hidden number leaks anywhere in the figure's labels.
  const labels = blocksOf({ ...input, answers: false }).map((b) => b.label ?? "");
  for (const secret of ["2,75", "3,60", "0,36", "7,95", "5,0"]) assert.ok(!labels.includes(secret), `${secret} leaked`);
});

test("the question and the solution share one geometry", () => {
  const input = fixture("fill-in-answers.json");
  const a = expandDataTable(input).root as Scene;
  const q = expandDataTable({ ...input, answers: false }).root as Scene;
  assert.equal(a.width, q.width);
  assert.equal(a.height, q.height);
});

test("the blank marker fills null cells (always) and hidden answers; without it they are empty", () => {
  const cols = [{ header: "a" }, { header: "b" }];
  const rows = [[1, null], [2, { answer: 5 }]];
  assert.deepEqual(decode({ columns: cols, rows, blank: "?" }).rows.map((r) => r[1]), ["?", "5"]);
  assert.deepEqual(decode({ columns: cols, rows, blank: "?", answers: false }).rows.map((r) => r[1]), ["?", "?"]);
  assert.deepEqual(decode({ columns: cols, rows: [[1, null], [2, 3]] }).rows.map((r) => r[1]), ["", "3"]);
});

// ---- text and scripts -----------------------------------------------------------------

test("markup: bare and braced scripts, charges, and a lone _ or ^ left alone", () => {
  const show = (s: string) => markup(s).map((r) => (r.script === undefined ? r.text : `[${r.script}:${r.text}]`)).join("");
  assert.equal(show("H_2O"), "H[sub:2]O");
  assert.equal(show("C_6H_12O_6"), "C[sub:6]H[sub:12]O[sub:6]");
  assert.equal(show("m^2"), "m[sup:2]");
  assert.equal(show("g/cm^3"), "g/cm[sup:3]");
  assert.equal(show("10^-3"), "10[sup:−3]");
  assert.equal(show("Ca^2+"), "Ca[sup:2+]");
  assert.equal(show("Na^+ e Cl^-"), "Na[sup:+] e Cl[sup:−]");
  assert.equal(show("SO_4^{2-}"), "SO[sub:4][sup:2−]");
  assert.equal(show("x^2-1"), "x[sup:2]-1");
  assert.equal(show("proj_v"), "proj_v");
  assert.equal(show("a_{ij}"), "a[sub:ij]");
});

test("scripts are drawn as real runs, and the label is their plain text", () => {
  const blocks = blocksOf(fixture("chemistry-subscripts.json"));
  const co2 = blocks.find((b) => b.id === "cell-0-0")!;
  assert.equal(co2.label, "CO2");
  assert.deepEqual(co2.runs, [{ text: "CO" }, { text: "2", script: "sub" }]);
  const head = blocks.filter((b) => b.id.startsWith("head-2-")).map((b) => b.label).join(" ");
  assert.equal(head, "Densidade (g/cm3)");
});

// ---- headers, wrapping, structure -------------------------------------------------------

test("a long header wraps to lines inside its column; a long text cell wraps instead of overflowing", () => {
  const input = fixture("wrapped-wide.json");
  const blocks = blocksOf(input);
  assert.ok(blocks.filter((b) => b.id.startsWith("head-0-")).length >= 2);
  const first = blocks.filter((b) => b.id === "cell-0-0" || b.id.startsWith("cell-0-0-l"));
  assert.ok(first.length >= 2, "the long cell wraps");
  const width = (expandDataTable(input).root as Scene).width as number;
  for (const b of blocks) assert.ok(b.x >= 0 && b.x + b.width <= width, `${b.id} is within the canvas`);
});

test("column widths hold the widest thing in the column, measured", () => {
  const input: DataTableInput = {
    columns: [{ header: "N" }, { header: "Valor" }],
    rows: [["um texto bem comprido mas curto o bastante", 1234.56789]],
  };
  const blocks = blocksOf(input);
  const text = blocks.find((b) => b.id === "cell-0-0")!;
  const num = blocks.find((b) => b.id === "cell-0-1")!;
  assert.ok(text.x + text.width <= num.x, "the first column's text ends before the next column's number begins");
});

test("grouped headers: each group is drawn once over its span; spans must add up", () => {
  const input = fixture("grouped-header.json");
  const blocks = blocksOf(input);
  const groups = blocks.filter((b) => b.id.startsWith("group-0-") && (b.label ?? "") !== "");
  assert.deepEqual(groups.map((b) => b.label), ["Escola pública", "Escola privada"]);
  const pub = groups[0]!;
  const centre = (id: string): number => {
    const b = blocks.find((x) => x.id === id)!;
    return b.x + b.width / 2;
  };
  const mid = pub.x + pub.width / 2;
  assert.ok(centre("head-1-0") < mid && mid < centre("head-2-0"), "sits over its two columns");
  assert.throws(() => validateDataTableInput({ ...input, headerRows: [[{ text: "a", span: 2 }]] } as unknown as Record<string, unknown>), /add up/);
});

test("highlight: a cell, a row and a column are bold; a letter, an id or an index names a column", () => {
  const input: DataTableInput = {
    columns: [{ header: "a", id: "alfa" }, { header: "b" }, { header: "c" }],
    rows: [[1, 2, 3], [4, 5, 6]],
    highlight: [{ row: 0, col: "B" }, { row: 1 }, { col: "alfa" }],
  };
  const bold = blocksOf(input)
    .filter((b) => /^cell-/.test(b.id) && b.fontWeight === 700)
    .map((b) => b.id)
    .sort();
  assert.deepEqual(bold, ["cell-0-0", "cell-0-1", "cell-1-0", "cell-1-1", "cell-1-2"]);
  assert.throws(() => expandDataTable({ ...input, highlight: [{ row: 5 }] }), /out of range/);
  assert.throws(() => expandDataTable({ ...input, highlight: [{ col: "Z" }] }), /names column/);
});

test("rows may list every column (null at derived ones) or only the given ones", () => {
  const cols = [{ header: "a" }, { header: "b", from: "A+1" }, { header: "c" }];
  const short = decode({ columns: cols, rows: [[1, 9]] });
  const full = decode({ columns: cols, rows: [[1, null, 9]] });
  assert.deepEqual(short.rows, full.rows);
  assert.deepEqual(short.rows[0], ["1", "2", "9"]);
  assert.throws(() => expandDataTable({ columns: cols, rows: [[1]] }), /cells/);
  assert.throws(() => expandDataTable({ columns: cols, rows: [[1, 5, 9]] }), /derived/);
});

test("a very long table stays within a sane canvas, and past the cap is refused", () => {
  const rows = Array.from({ length: 60 }, (_, i) => [`Linha ${i + 1}`, i * 3]);
  const spec = expandDataTable({ columns: [{ header: "Nome" }, { header: "Valor" }], rows });
  const h = (spec.root as Scene).height as number;
  assert.ok(h < 4000, `height ${h}`);
  assert.throws(() => expandDataTable({ columns: [{ header: "a" }], rows: Array.from({ length: 121 }, (_, i) => [i]) }), /at most/);
});

test("validation: shapes are refused with a path", () => {
  const bad = (x: unknown) => () => validateDataTableInput(x as Record<string, unknown>);
  assert.throws(bad({ rows: [[1]] }), /columns/);
  assert.throws(bad({ columns: [{ header: "a" }] }), /rows/);
  assert.throws(bad({ columns: [{ header: "a", id: "1x" }], rows: [[1]] }), /id/);
  assert.throws(bad({ columns: [{ header: "a", format: "euro" }], rows: [[1]] }), /format/);
  assert.throws(bad({ columns: [{ header: "a" }], rows: [[{ value: 1 }]] }), /answer/);
  assert.throws(bad({ columns: [{ header: "a" }], rows: [[1]], blank: "..." }), /blank/);
  assert.throws(bad({ columns: [{ header: "a" }], rows: [[1]], totals: { by: { B: "sum" } } }), /names column/);
  assert.throws(bad({ columns: [{ header: "a" }, { header: "b" }], rows: [["x", "y"]], totals: { by: { B: "sum" } } }), /no numbers/);
});

// ---- fixtures --------------------------------------------------------------------------------

for (const name of fixtures) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const result = await render(expandDataTable(fixture(name)), { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}

test("fixtures cover the cases the audit names", () => {
  for (const name of ["nutrition.json", "price-total.json", "grouped-header.json", "fill-in-answers.json", "fill-in-question.json", "ranking-long.json", "chemistry-subscripts.json"]) {
    assert.ok(fixtures.includes(name), name);
  }
  assert.equal(fixture("fill-in-question.json").answers, false);
});

test('grouping "space" groups from four digits, as exam booklets print; a parenthesised unit is never split', () => {
  const t = decode({
    columns: [{ header: "Folha mensal (em real)", format: { decimals: 2, grouping: "space" } }],
    rows: [[2000], [108000.5], [950]],
  });
  assert.deepEqual(t.rows.map((r) => r[0]), [`2${NARROW_SPACE}000,00`, `108${NARROW_SPACE}000,50`, "950,00"]);
  const heads = blocksOf({ columns: [{ header: "Quantidade de funcionários contratados no período", unit: "em real" }], rows: [[1]] }).filter((b) => b.id.startsWith("head-0-"));
  assert.ok(heads.every((b) => !/^real\)/.test(b.label ?? "")), "the unit stays whole");
});
