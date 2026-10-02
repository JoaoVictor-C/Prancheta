/**
 * genetics: Punnett squares and pedigrees. The tests decode the DRAWN cells,
 * margins and panel by id and compare them with crosses worked out by hand,
 * pin the exact probabilities of the pedigree analysis, and the refusals.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandGenetics, validateGeneticsInput } from "../src/presets/genetics/preset.ts";
import type { GeneticsInput, PedigreeInput, PunnettInput } from "../src/presets/genetics/preset.ts";
import { punnettTallies, ratioOf } from "../src/presets/genetics/punnett.ts";
import { layoutPedigree } from "../src/presets/genetics/pedigree.ts";
import { frac } from "../src/presets/probability-tree/fraction.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/genetics/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));
const load = (name: string): GeneticsInput => {
  const { preset: _p, ...input } = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
  return input as unknown as GeneticsInput;
};

type Placed = Block & { id: string };
const blocksOf = (input: GeneticsInput): Placed[] => (expandGenetics(input).root as Scene).children as Placed[];
const panelOf = (input: GeneticsInput): string[] => blocksOf(input).filter((b) => b.id.startsWith("panel-")).map((b) => b.label ?? "");
const cellsOf = (input: GeneticsInput): string[][] => {
  const cells = blocksOf(input).filter((b) => /^cell-\d+-\d+$/.test(b.id));
  const rows = Math.max(...cells.map((b) => Number(b.id.split("-")[1]))) + 1;
  const cols = Math.max(...cells.map((b) => Number(b.id.split("-")[2]))) + 1;
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cells.find((b) => b.id === `cell-${r}-${c}`)!.label ?? ""));
};
const margins = (input: GeneticsInput): { cols: string[]; rows: string[] } => {
  const bs = blocksOf(input);
  const pick = (prefix: string): string[] =>
    bs
      .filter((b) => b.id.startsWith(prefix))
      .sort((a, b) => Number(a.id.split("-")[2]) - Number(b.id.split("-")[2]))
      .map((b) => b.label ?? "");
  return { cols: pick("gamete-col-"), rows: pick("gamete-row-") };
};

// ---- Punnett: the grid ----------------------------------------------------------------------------

test("Aa x Aa: gametes A, a; cells AA Aa / Aa aa; 3 : 1 and 1 : 2 : 1", () => {
  const input: PunnettInput = { kind: "punnett", parents: ["Aa", "Aa"], phenotypes: { A: { dominant: "amarela", recessive: "verde" } } };
  assert.deepEqual(margins(input), { cols: ["A", "a"], rows: ["A", "a"] });
  assert.deepEqual(cellsOf(input), [["AA", "Aa"], ["Aa", "aa"]]);
  const text = panelOf(input).join(" | ");
  assert.match(text, /1 : 2 : 1/);
  assert.match(text, /proporção 3 : 1/);
  assert.match(text, /3\/4 {3}amarela/);
});

test("AaBb x AaBb: four gametes each, dominant-first cells, 9 : 3 : 3 : 1, P(A_bb) = 3/16 with three cells outlined", () => {
  const input: PunnettInput = { kind: "punnett", parents: ["AaBb", "AaBb"], highlight: ["A_bb"] };
  assert.deepEqual(margins(input).cols, ["AB", "Ab", "aB", "ab"]);
  const cells = cellsOf(input);
  assert.equal(cells.length, 4);
  assert.deepEqual(cells[0], ["AABB", "AABb", "AaBB", "AaBb"]);
  assert.deepEqual(cells[3], ["AaBb", "Aabb", "aaBb", "aabb"]);
  const t = punnettTallies(input);
  assert.deepEqual([...t.phenotypes.values()].map((w) => `${w.n}/${w.d}`).sort(), ["1/16", "3/16", "3/16", "9/16"]);
  const text = panelOf(input).join(" | ");
  assert.match(text, /9 : 3 : 3 : 1/);
  assert.match(text, /P\(A_bb\) = 3\/16/);
  const outlined = (expandGenetics(input).root as Scene).marks!.filter((m) => m.id.startsWith("highlight-"));
  assert.equal(outlined.length, 3);
});

test("alleles are ordered dominant first however the parents are typed", () => {
  const input: PunnettInput = { kind: "punnett", parents: ["aA", "aa"] };
  assert.deepEqual(margins(input), { cols: ["a"], rows: ["A", "a"] });
  assert.deepEqual(cellsOf(input), [["Aa"], ["aa"]]);
});

test("a homozygous parent has one gamete: AA x Aa is a 1 x 2 grid", () => {
  const input: PunnettInput = { kind: "punnett", parents: ["AA", "Aa"] };
  assert.deepEqual(cellsOf(input), [["AA", "Aa"]]);
});

test("sex-linked: XᴬXᵃ x XᴬY, girls and boys, 1/4 each genotype, P(XᵃY) = 1/4", () => {
  const input = load("sex-linked-colour-blindness.json") as PunnettInput;
  assert.deepEqual(margins(input), { cols: ["XA", "Y"], rows: ["XA", "Xa"] });
  assert.deepEqual(cellsOf(input), [["XAXA", "XAY"], ["XAXa", "XaY"]]);
  const t = punnettTallies(input);
  const girl = t.phenotypes.get("menina visão normal")!;
  assert.deepEqual([girl.n, girl.d], [1n, 2n]);
  assert.equal(t.phenotypes.get("menino daltônica(o)")!.d, 4n);
  assert.match(panelOf(input).join(" | "), /P\(XaY\) = 1\/4/);
});

test("incomplete dominance: CᴿCᵂ x CᴿCᵂ is 1 : 2 : 1 in phenotype too", () => {
  const input = load("incomplete-dominance-flower.json") as PunnettInput;
  const t = punnettTallies(input);
  assert.deepEqual([...t.phenotypes.entries()].map(([k, w]) => `${k} ${w.n}/${w.d}`).sort(), ["branca 1/4", "rosa 1/2", "vermelha 1/4"]);
  assert.match(panelOf(input).join(" | "), /proporção 2 : 1 : 1/);
});

test("ABO codominance: Iᴬi x Iᴮi gives A, B, AB, O one quarter each", () => {
  const input = load("abo-codominance.json") as PunnettInput;
  const t = punnettTallies(input);
  assert.deepEqual([...t.phenotypes.keys()].sort(), ["A", "AB", "B", "O"]);
  assert.ok([...t.phenotypes.values()].every((w) => w.n === 1n && w.d === 4n));
  assert.deepEqual(cellsOf(input), [["IAIB", "IAi"], ["IBi", "ii"]]);
});

test("ratios are the smallest whole numbers in proportion", () => {
  assert.equal(ratioOf([frac(1n, 4n), frac(1n, 2n), frac(1n, 4n)]), "1 : 2 : 1");
  assert.equal(ratioOf([frac(3n, 4n), frac(1n, 4n)]), "3 : 1");
  assert.equal(ratioOf([frac(1n, 3n), frac(2n, 3n)]), "1 : 2");
});

test("Punnett refusals: different loci, three alleles without codominance, two capitals under complete dominance, two XX parents, a lone allele", () => {
  const refused = (parents: [string, string]): void => assert.throws(() => validateGeneticsInput({ kind: "punnett", parents }), SpecError);
  refused(["Aa", "AaBb"]);
  refused(["Iᴬi", "Iᴮi"]);
  refused(["CᴿCᵂ", "CᴿCᵂ"]);
  refused(["XᴬXᵃ", "XᴬXᵃ"]);
  refused(["Aa", "A"]);
});

test("answers:false: the gametes stay on the margins; every cell, tint, outline and the panel go", () => {
  for (const f of fixtures.filter((n) => (load(n) as { kind: string }).kind === "punnett")) {
    const input = { ...load(f), answers: false } as GeneticsInput;
    const bs = blocksOf(input);
    assert.ok(bs.some((b) => b.id.startsWith("gamete-col-")), f);
    assert.deepEqual(bs.filter((b) => b.id.startsWith("cell-") || b.id.startsWith("panel-")), [], f);
    const marks = (expandGenetics(input).root as Scene).marks!;
    assert.deepEqual(marks.filter((m) => m.id.startsWith("tint-") || m.id.startsWith("highlight-")), [], f);
  }
});

// ---- pedigree ----------------------------------------------------------------------------------------

test("autosomal recessive pedigree: P(II-2 carrier) = 2/3, P(III-1 carrier) = 2/3, genotypes under the symbols", () => {
  const input = load("pedigree-autosomal-recessive.json") as PedigreeInput;
  const panel = panelOf(input);
  assert.ok(panel.some((l) => /P\(II-2 ser portador\) = 2\/3/.test(l)), panel.join("\n"));
  assert.ok(panel.some((l) => /P\(III-1 ser portadora\) = 2\/3/.test(l)));
  assert.ok(panel.some((l) => /afetada\) = 1\/6/.test(l)));
  const label = (id: string): string => blocksOf(input).find((b) => b.id === id)!.label ?? "";
  assert.equal(label("genotype-0"), "Aa");
  assert.equal(label("genotype-1"), "Aa");
  assert.equal(label("genotype-2"), "aa");
  assert.equal(label("genotype-3"), "A_");
});

test("X-linked pedigree: an unaffected son lowers the mother's carrier probability to 1/3, a boy affected is 1/12", () => {
  const panel = panelOf(load("pedigree-x-linked.json"));
  assert.ok(panel.some((l) => /P\(II-3 ser portadora\) = 1\/3/.test(l)), panel.join("\n"));
  assert.ok(panel.some((l) => /menino e afetado\) = 1\/12/.test(l)));
});

test("labels are derived from the layout: generation numeral and place in the row", () => {
  const layout = layoutPedigree(load("pedigree-autosomal-recessive.json") as PedigreeInput);
  assert.deepEqual(layout.label, ["I-1", "I-2", "II-1", "II-2", "II-3", "II-4", "III-1", "III-2"]);
  assert.deepEqual(layout.gen, [1, 1, 2, 2, 2, 2, 3, 3]);
});

test("layout: neighbours at least one spacing apart; couples over their sibship and under their parents", () => {
  for (const f of fixtures.filter((n) => n.startsWith("pedigree"))) {
    const l = layoutPedigree(load(f) as PedigreeInput);
    for (const row of l.rows) for (let i = 1; i < row.length; i += 1) assert.ok(l.x[row[i]!]! - l.x[row[i - 1]!]! >= 95.99, `${f}: spacing`);
  }
  const l = layoutPedigree(load("pedigree-x-linked.json") as PedigreeInput);
  const mid = (a: number, b: number): number => (l.x[a]! + l.x[b]!) / 2;
  assert.ok(Math.abs(mid(0, 1) - (l.x[2]! + l.x[4]!) / 2) < 1, "I couple over its sibship");
  assert.ok(Math.abs(mid(4, 5) - (l.x[6]! + l.x[7]!) / 2) < 1, "II-3 and II-4 over their children");
});

test("consanguinity is found from the shared ancestors and drawn as a double line", () => {
  const input = load("pedigree-consanguineous.json") as PedigreeInput;
  assert.equal(layoutPedigree(input).unions.filter((u) => u.consanguineous).length, 1);
  const marks = (expandGenetics(input).root as Scene).marks!;
  assert.ok(marks.some((m) => /^union-\d+-a$/.test(m.id)) && marks.some((m) => /^union-\d+-b$/.test(m.id)));
});

test("an inconsistent pedigree is refused, naming the individual", () => {
  const input: PedigreeInput = {
    kind: "pedigree",
    individuals: [
      { id: "a", sex: "M" },
      { id: "b", sex: "F" },
      { id: "c", sex: "M", affected: true, parents: ["a", "b"] },
    ],
    analysis: { mode: "autosomal dominant" },
  };
  // two unaffected parents cannot have an affected child if the allele is dominant
  assert.throws(() => expandGenetics(input), (e: Error) => e instanceof SpecError && /II-1/.test(e.message) && /autossômica dominante/.test(e.message));
  // the same family is fine as recessive
  assert.doesNotThrow(() => expandGenetics({ ...input, analysis: { mode: "autosomal recessive" } }));
});

test("a probability that depends on an unrelated individual's genotype is refused until the frequency or the genotype is given", () => {
  const base: PedigreeInput = {
    kind: "pedigree",
    individuals: [
      { id: "I-1", sex: "M" },
      { id: "I-2", sex: "F" },
      { id: "II-1", sex: "M", affected: true, parents: ["I-1", "I-2"] },
      { id: "II-2", sex: "F", parents: ["I-1", "I-2"] },
      { id: "II-3", sex: "M" },
    ],
    marriages: [{ between: ["II-2", "II-3"] }],
    analysis: { mode: "autosomal recessive", queries: [{ childOf: ["II-2", "II-3"], is: "affected" }] },
  };
  assert.throws(() => expandGenetics(base), (e: Error) => /II-3/.test(e.message) && /frequency/.test(e.message));
  assert.doesNotThrow(() => expandGenetics({ ...base, analysis: { ...base.analysis!, frequency: "1/100" } }));
  const pinned: PedigreeInput = { ...base, individuals: base.individuals.map((p) => (p.id === "II-3" ? { ...p, genotype: "AA" } : p)) };
  assert.match(panelOf(pinned).join("|"), /= 0$|= 0 /m, "an AA partner cannot have an affected child");
  const carrier: PedigreeInput = { ...base, individuals: base.individuals.map((p) => (p.id === "II-3" ? { ...p, genotype: "Aa" } : p)) };
  // II-2 is Aa with probability 2/3; Aa x Aa gives aa with 1/4: 1/6
  assert.match(panelOf(carrier).join("|"), /= 1\/6/);
});

test("an id that looks like a label but is not the layout's label is refused", () => {
  const input: PedigreeInput = { kind: "pedigree", individuals: [{ id: "I-1", sex: "M" }, { id: "I-3", sex: "F" }], marriages: [{ between: ["I-1", "I-3"] }] };
  assert.throws(() => expandGenetics(input), /I-3.*I-2/);
});

test("answers:false: no genotypes under the symbols and no probabilities; the chart and its given marks stay", () => {
  for (const f of fixtures.filter((n) => n.startsWith("pedigree-a") || n.startsWith("pedigree-x"))) {
    const bs = blocksOf({ ...load(f), answers: false } as GeneticsInput);
    assert.deepEqual(bs.filter((b) => b.id.startsWith("genotype-") || b.id.startsWith("panel-")), [], f);
    assert.ok(bs.some((b) => b.id === "label-0"), f);
  }
});

// ---- the fixtures render -------------------------------------------------------------------------------

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes, with and without answers`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "genetics");
    const { preset: _p, ...input } = raw;
    validateGeneticsInput(input);
    for (const answers of [true, false]) {
      const result = await render(expandGenetics({ ...input, answers } as unknown as GeneticsInput), { maxPasses: 3, raster: false });
      for (const check of result.manifest.checks) {
        assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename} answers=${answers}: ${check.id} ${check.status}: ${check.detail}`);
      }
    }
  });
});
