/**
 * truth-table: every cell is computed. These tests decode the DRAWN cells and
 * headers (by their ids) and compare them with tables worked out by hand, then
 * pin the panel's claims, the column sizing, and the fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandTruthTable, validateTruthTableInput } from "../src/presets/truth-table/preset.ts";
import type { TruthTableInput } from "../src/presets/truth-table/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/truth-table/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

/** A block as the presets place it: id and box always present. */
type Placed = Block & { id: string; x: number; y: number; width: number; height: number };
const blocksOf = (spec: { root: unknown }): Placed[] => (spec.root as Scene).children as Placed[];

/** The table as printed: rows of cell texts, columns of head texts. */
function decode(input: TruthTableInput): { heads: string[][]; rows: string[][]; panel: string[]; blocks: Placed[] } {
  const spec = expandTruthTable(input);
  const blocks = blocksOf(spec);
  const cellBlocks = blocks.filter((b) => /^cell-\d+-\d+$/.test(b.id));
  const rowCount = Math.max(...cellBlocks.map((b) => Number(b.id.split("-")[1]))) + 1;
  const colCount = Math.max(...cellBlocks.map((b) => Number(b.id.split("-")[2]))) + 1;
  const rows = Array.from({ length: rowCount }, (_, r) => Array.from({ length: colCount }, (_, c) => blocks.find((b) => b.id === `cell-${r}-${c}`)!.label ?? ""));
  const heads = Array.from({ length: colCount }, (_, c) =>
    blocks
      .filter((b) => b.id.startsWith(`head-${c}-`))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((b) => b.label ?? ""),
  );
  const panel = blocks.filter((b) => b.id.startsWith("panel-")).map((b) => b.label ?? "");
  return { heads, rows, panel, blocks };
}

const rowStrings = (rows: string[][]): string[] => rows.map((r) => r.join(""));

// ---- computed cells ----------------------------------------------------------------

test("p → q in logic notation: rows VV VF FV FF, result V F V V", () => {
  const t = decode({ expressions: ["p -> q"] });
  assert.deepEqual(t.heads, [["p"], ["q"], ["p → q"]]);
  assert.deepEqual(rowStrings(t.rows), ["VVV", "VFF", "FVV", "FFV"]);
});

test("¬(p ∨ q) and ¬p ∧ ¬q: same column (De Morgan), with the subexpression columns", () => {
  const t = decode({
    expressions: [{ expr: "not (p or q)", label: "P" }, { expr: "not p and not q", label: "Q" }],
    showSubexpressions: true,
  });
  // p, q, p ∨ q, ¬p, ¬q, then P, Q
  assert.deepEqual(t.heads.map((h) => h[h.length - 1]), ["p", "q", "p ∨ q", "¬p", "¬q", "¬(p ∨ q)", "¬p ∧ ¬q"]);
  assert.deepEqual(rowStrings(t.rows), ["VVVFFFF", "VFVFVFF", "FVVVFFF", "FFFVVVV"]);
});

test("digital notation: 1/0, rows from 00 up, and the minterm number column", () => {
  const t = decode({ notation: "digital", expressions: ["A B + A C + B C"], minterms: true });
  assert.deepEqual(t.heads.map((h) => h[0]), ["m", "A", "B", "C", "S"].map((x, i) => (i === 4 ? "A·B + A·C + B·C" : x)));
  assert.deepEqual(rowStrings(t.rows), ["00000", "10010", "20100", "30111", "41000", "51011", "61101", "71111"]);
});

test("every cell equals an independent evaluation of the expression, over four variables", () => {
  const t = decode({ notation: "digital", expressions: ["(A xor B) and (C or not D)", "A -> (B <-> C)"] });
  assert.equal(t.rows.length, 16);
  t.rows.forEach((row, r) => {
    const [A, B, C, D] = [0, 1, 2, 3].map((i) => Number(row[i]));
    assert.equal(r, A * 8 + B * 4 + C * 2 + D, "rows run 0000 … 1111");
    const e1 = (A !== B) && (C === 1 || D === 0) ? "1" : "0";
    const e2 = A === 0 || B === C ? "1" : "0";
    assert.equal(row[4], e1, `row ${r}`);
    assert.equal(row[5], e2, `row ${r}`);
  });
});

test("variables come in order of first appearance, or as the caller says", () => {
  assert.deepEqual(decode({ expressions: ["q and p"] }).heads.map((h) => h[0]).slice(0, 2), ["q", "p"]);
  const t = decode({ expressions: ["q and not p"], variables: ["p", "q"] });
  assert.deepEqual(t.heads.map((h) => h[0]).slice(0, 2), ["p", "q"]);
  assert.deepEqual(rowStrings(t.rows), ["VVF", "VFF", "FVV", "FFF"]);
});

test("a header shows the typeset expression, and the label above it when there is one", () => {
  const t = decode({ expressions: [{ expr: "p -> q", label: "P" }] });
  assert.deepEqual(t.heads[2], ["P", "p → q"]);
  assert.deepEqual(decode({ notation: "digital", expressions: ["A'B + AB'"] }).heads[2], ["A′·B + A·B′"]);
});

test("a subexpression column is not repeated when it is already an expression", () => {
  const t = decode({ expressions: ["p and q", "(p and q) or r"], showSubexpressions: true });
  assert.deepEqual(t.heads.map((h) => h[h.length - 1]), ["p", "q", "r", "p ∧ q", "(p ∧ q) ∨ r"]);
});

// ---- the panel ---------------------------------------------------------------------------

test("compare: equal columns say P ≡ Q; different ones list the rows", () => {
  const same = decode({ expressions: [{ expr: "p -> q", label: "P" }, { expr: "not p or q", label: "Q" }], compare: true });
  assert.deepEqual(same.panel, ["As colunas de P e Q são iguais: P ≡ Q."]);
  const different = decode({ expressions: [{ expr: "p -> q", label: "P" }, { expr: "q -> p", label: "Q" }], compare: true });
  assert.deepEqual(different.panel, ["As colunas de P e Q diferem nas linhas 2 e 3: P ≢ Q."]);
  const one = decode({ expressions: [{ expr: "p and q", label: "P" }, { expr: "p or q", label: "Q" }], compare: true });
  assert.match(one.panel[0]!, /diferem nas linhas 2 e 3/);
  const single = decode({ expressions: [{ expr: "p and q", label: "P" }, { expr: "p and q and (p or q)", label: "Q" }], compare: true });
  assert.match(single.panel[0]!, /iguais/);
  // digital writes = instead of ≡
  const digital = decode({ notation: "digital", expressions: [{ expr: "A xor B", label: "S" }, { expr: "A'B + AB'", label: "X" }], compare: true });
  assert.deepEqual(digital.panel, ["As colunas de S e X são iguais: S = X."]);
});

test("classify: tautologia, contradição, contingência, from the printed rows", () => {
  const t = decode({ expressions: ["p or not p", "p and not p", "p and q"], classify: true });
  assert.match(t.panel[0]!, /^p ∨ ¬p é uma tautologia: verdadeira nas 4 linhas\.$/);
  assert.match(t.panel[1]!, /^p ∧ ¬p é uma contradição: falsa nas 4 linhas\.$/);
  assert.match(t.panel[2]!, /^p ∧ q é uma contingência: verdadeira em 1 das 4 linhas\.$/);
  const digital = decode({ notation: "digital", expressions: ["A + B"], classify: true });
  assert.match(digital.panel[0]!, /contingência: vale 1 em 3 das 4 linhas/);
});

test("minterms: Σm, the canonical sum, and the minimal form (majority → AB + AC + BC)", () => {
  const t = decode({ notation: "digital", expressions: ["A'BC + AB'C + ABC' + ABC"], minterms: true });
  assert.deepEqual(t.panel, [
    "Σm(3, 5, 6, 7)",
    "soma canônica: A′·B·C + A·B′·C + A·B·C′ + A·B·C",
    "forma simplificada: A·B + A·C + B·C",
  ]);
  const xor = decode({ notation: "digital", expressions: ["A xor B"], minterms: true });
  assert.equal(xor.panel[0], "Σm(1, 2)");
  assert.equal(xor.panel[2], "forma simplificada: A′·B + A·B′");
  const logic = decode({ notation: "logic", expressions: ["p or q"], minterms: true });
  assert.equal(logic.panel[1], "soma canônica: (¬p ∧ q) ∨ (p ∧ ¬q) ∨ (p ∧ q)");
  assert.equal(logic.panel[2], "forma simplificada: p ∨ q");
  // several expressions name each block of lines
  const many = decode({ notation: "digital", expressions: [{ expr: "A B", label: "F" }, { expr: "A + B", label: "G" }], minterms: true });
  assert.equal(many.panel[0], "F: Σm(3)");
  assert.equal(many.panel[3], "G: Σm(1, 2, 3)");
});

// ---- geometry: column widths come from the text ---------------------------------------------------

test("no two blocks in a row overlap, however wide a header is", () => {
  const t = decode({
    notation: "digital",
    expressions: [{ expr: "A B C D + A' B' C' D' + A xor B xor C xor D", label: "Função longa" }, "(A + B)(C + D)(A' + C')(B' + D')"],
    showSubexpressions: true,
  });
  const cols = new Map<number, Placed[]>();
  for (const b of t.blocks) {
    const m = /^head-(\d+)-\d+$/.exec(b.id) ?? /^cell-\d+-(\d+)$/.exec(b.id);
    if (m === null) continue;
    const c = Number(m[1]);
    (cols.get(c) ?? cols.set(c, []).get(c)!).push(b);
  }
  const spans = [...cols.entries()].sort((a, b) => a[0] - b[0]).map(([c, bs]) => ({ c, lo: Math.min(...bs.map((b) => b.x)), hi: Math.max(...bs.map((b) => b.x + b.width)) }));
  for (let i = 1; i < spans.length; i += 1) {
    assert.ok(spans[i - 1]!.hi <= spans[i]!.lo + 0.001, `column ${spans[i - 1]!.c} (to ${spans[i - 1]!.hi}) runs into column ${spans[i]!.c} (from ${spans[i]!.lo})`);
  }
});

// ---- refusals -------------------------------------------------------------------------------------------

function bad(input: Record<string, unknown>, pattern: RegExp): void {
  assert.throws(() => validateTruthTableInput(input), (e: unknown) => e instanceof SpecError && pattern.test(e.message), `expected ${pattern}`);
}

test("input errors name the path, and a parse error shows where", () => {
  bad({}, /truth-table.expressions is required/);
  bad({ expressions: [] }, /must not be empty/);
  bad({ expressions: ["p and"] }, /truth-table.expressions\[0\]: falta um operando depois de "and" \(posição 6\)\n {2}p and\n {2} {5}\^/);
  bad({ expressions: ["p", "q $ r"] }, /expressions\[1\]: caractere inesperado "\$"/);
  bad({ expressions: [{ expr: "p", label: 3 }] }, /label must be a string/);
  bad({ expressions: [{ expr: "p", name: "x" }] }, /not a field/);
  bad({ expressions: ["p"], notation: "binary" }, /notation must be one of logic, digital/);
  bad({ expressions: ["p"], minterms: "yes" }, /minterms must be true or false/);
  bad({ expressions: ["p and q"], variables: ["p"] }, /leaves out q/);
  bad({ expressions: ["p"], variables: ["p", "p"] }, /lists p twice/);
  bad({ expressions: ["p"], variables: ["p q"] }, /not a variable name/);
  bad({ expressions: ["A B C D E G H"] }, /7 variables make 128 rows; at most 6/);
  bad({ expressions: ["1 and 0"] }, /no variables/);
  bad({ expressions: Array.from({ length: 7 }, () => "p") }, /at most 6 result columns/);
});

// ---- fixtures ---------------------------------------------------------------------------------------------

test("there are at least four fixtures, covering the required kinds", () => {
  assert.ok(fixtures.length >= 4, `${fixtures.length} fixtures`);
  const names = fixtures.join(" ");
  for (const needle of ["implication", "de-morgan", "majority", "tautology"]) assert.ok(names.includes(needle), `no ${needle} fixture`);
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "truth-table");
    const { preset: _preset, ...input } = raw;
    validateTruthTableInput(input);
    const spec = expandTruthTable(input as unknown as TruthTableInput);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
  });
});

test("the fixtures say what they claim: p → q ≡ ¬p ∨ q, De Morgan, the majority, a tautology", () => {
  const load = (name: string): TruthTableInput => {
    const { preset: _p, ...input } = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
    return input as unknown as TruthTableInput;
  };
  assert.ok(decode(load("implication-vs-disjunction.json")).panel.some((l) => /iguais: P ≡ Q/.test(l)));
  assert.ok(decode(load("de-morgan.json")).panel.some((l) => /iguais: P ≡ Q/.test(l)));
  assert.equal(decode(load("majority-minterms-digital.json")).panel[0], "Σm(3, 5, 6, 7)");
  assert.match(decode(load("tautology-excluded-middle.json")).panel[0]!, /tautologia/);
});
