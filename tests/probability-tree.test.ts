/**
 * probability-tree: every number printed is exact rational arithmetic on the
 * probabilities typed (or counted from the urn), so these tests pin the
 * arithmetic, the refusals, and then every fixture renders with all checks
 * passing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandProbabilityTree, validateProbabilityTreeInput } from "../src/presets/probability-tree/preset.ts";
import type { ProbabilityTreeInput } from "../src/presets/probability-tree/preset.ts";
import { ONE, add, decimalText, div, frac, fractionText, mul, parseProbability } from "../src/presets/probability-tree/fraction.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/probability-tree/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

type Spec = ReturnType<typeof expandProbabilityTree>;
const blocksOf = (spec: Spec): Block[] => (spec.root as Scene).children as Block[];
const marksOf = (spec: Spec): Mark[] => (spec.root as Scene).marks ?? [];
const texts = (spec: Spec): string[] => blocksOf(spec).map((b) => b.label ?? "");

test("decimals convert exactly: 0,95 is 19/20 and 0,1 + 0,2 is exactly 0,3", () => {
  assert.equal(fractionText(parseProbability("0,95", "p").value), "19/20");
  assert.equal(fractionText(parseProbability(0.95, "p").value), "19/20");
  assert.equal(fractionText(parseProbability("95%", "p").value), "19/20");
  assert.equal(fractionText(parseProbability("12,5%", "p").value), "1/8");
  const s = add(parseProbability(0.1, "p").value, parseProbability(0.2, "p").value);
  assert.deepEqual(s, parseProbability(0.3, "p").value);
  assert.equal(fractionText(mul(frac(3n, 5n), frac(2n, 4n))), "3/10");
});

test("a fraction keeps its written form for the branch; the value is reduced", () => {
  const p = parseProbability("2/4", "p");
  assert.equal(p.written?.d, 4n);
  assert.equal(fractionText(p.value), "1/2");
});

test("decimal writing: exact when it terminates, approximate when rounded, in pt-BR", () => {
  assert.deepEqual(decimalText(frac(19n, 20n), "pt-BR", { percent: true }), { text: "95%", exact: true });
  assert.deepEqual(decimalText(frac(19n, 217n), "pt-BR", { percent: true }), { text: "8,76%", exact: false });
  assert.deepEqual(decimalText(frac(1n, 3n), "en", { percent: false }), { text: "0.3333", exact: false });
  assert.deepEqual(decimalText(div(frac(19n, 2000n), ONE), "pt-BR", { percent: false }), { text: "0,0095", exact: true });
});

test("the urn 3V/2A without replacement: products and P(cores diferentes) = 3/5", () => {
  const spec = expandProbabilityTree({ urn: { V: 3, A: 2 }, draws: 2, replacement: false, events: [{ name: "E", paths: [["V", "A"], ["A", "V"]] }] });
  const t = texts(spec);
  assert.ok(t.includes("P(V ∩ V) = 3/5 · 2/4 = 3/10"), t.join("|"));
  assert.ok(t.includes("P(V ∩ A) = 3/5 · 2/4 = 3/10"));
  assert.ok(t.includes("P(A ∩ V) = 2/5 · 3/4 = 3/10"));
  assert.ok(t.includes("P(A ∩ A) = 2/5 · 1/4 = 1/10"));
  assert.ok(t.includes("P(E) = 3/10 + 3/10 = 3/5"));
});

test("with replacement the second draw is the same 3/5, 2/5", () => {
  const t = texts(expandProbabilityTree({ urn: { V: 3, A: 2 }, draws: 2, replacement: true }));
  assert.ok(t.includes("P(A ∩ A) = 2/5 · 2/5 = 4/25"));
});

test("an exhausted colour has no branch (probability 0)", () => {
  const t = texts(expandProbabilityTree({ urn: { V: 1, A: 2 }, draws: 2 }));
  assert.ok(!t.some((x) => x.startsWith("P(V ∩ V)")));
  assert.ok(t.includes("P(V ∩ A) = 1/3 · 2/2 = 1/3"));
});

test("Bayes: P(D | +) = 19/217 from 1%, 95%, 90%", () => {
  const spec = expandProbabilityTree({
    root: {
      children: [
        { label: "D", p: "1%", children: [{ label: "+", p: "95%" }, { label: "−", p: "5%" }] },
        { label: "S", p: "99%", children: [{ label: "+", p: "10%" }, { label: "−", p: "90%" }] },
      ],
    },
    notation: "fraction",
    events: [{ name: "D", paths: [["D"]] }, { name: "+", paths: [["*", "+"]] }],
    given: { event: "D", given: "+" },
  });
  const t = texts(spec);
  assert.ok(t.some((x) => x.startsWith("P(D ∩ +) = 1/100 · 1/100")) === false);
  assert.ok(t.includes("P(D ∩ +) = 1/100 · 19/20 = 19/2000"), t.join("|"));
  assert.ok(t.some((x) => x.startsWith("P(+) = 19/2000 + 99/1000")), t.join("|"));
  assert.ok(t.some((x) => x.includes("= 19/217 ≈ 8,76%")), t.join("|"));
});

test("count events and the missing-p complement", () => {
  const spec = expandProbabilityTree({
    root: {
      children: [
        { label: "C", p: "1/2", children: [{ label: "C", p: "1/2" }, { label: "K" }] },
        { label: "K", children: [{ label: "C", p: "1/2" }, { label: "K", p: "1/2" }] },
      ],
    },
    events: [{ name: "uma cara", count: { of: "C", is: 1 } }],
  });
  assert.ok(texts(spec).includes("P(uma cara) = 1/4 + 1/4 = 1/2"), texts(spec).join("|"));
});

test("branch probabilities sit above upward branches and below downward ones", () => {
  const spec = expandProbabilityTree({ urn: { V: 3, A: 2 }, draws: 2 });
  const marks = marksOf(spec);
  for (const b of blocksOf(spec).filter((x) => (x.id ?? "").startsWith("p-"))) {
    const m = marks.find((k) => k.id === b.annotates)!;
    const a = m.from as Point;
    const e = (m.segments[0] as { line: Point }).line;
    const cy = (b.y ?? 0) + (b.height ?? 0) / 2;
    const lineY = a.y + ((e.y - a.y) * ((b.x ?? 0) + (b.width ?? 0) / 2 - a.x)) / (e.x - a.x);
    if (e.y - a.y > 0.5) assert.ok(cy > lineY, `${b.id} should be below its downward branch`);
    else assert.ok(cy < lineY, `${b.id} should be above its branch`);
  }
});

test("leaf products stand in one column, aligned", () => {
  const spec = expandProbabilityTree({ urn: { V: 3, A: 2 }, draws: 2 });
  const xs = blocksOf(spec).filter((b) => (b.id ?? "").startsWith("leaf-") && b.id !== "leaf-header").map((b) => Math.round(b.x ?? 0));
  assert.equal(xs.length, 4);
  assert.equal(new Set(xs).size, 1);
});

test("refusals name what is wrong", () => {
  const bad = (raw: Record<string, unknown>, pattern: RegExp): void =>
    assert.throws(() => validateProbabilityTreeInput(raw), (e: unknown) => e instanceof SpecError && pattern.test(e.message), JSON.stringify(raw));
  bad({}, /exactly one of `root`/);
  bad({ root: { children: [{ label: "A", p: "1/2" }, { label: "B", p: "1/3" }] } }, /root.*sum to 5\/6, not 1/);
  bad({ root: { children: [{ label: "A", p: "1/2", children: [{ label: "X", p: "0,7" }, { label: "Y", p: "0,2" }] }, { label: "B", p: "1/2" }] } }, /node "A".*sum to 9\/10, not 1/);
  bad({ root: { children: [{ label: "A", p: "3/2" }] } }, /outside \[0, 1\]/);
  bad({ root: { children: [{ label: "A", p: "banana" }, { label: "B" }] } }, /not a probability/);
  bad({ root: { children: [{ label: "A", p: "1/2" }, { label: "A", p: "1/2" }] } }, /both named "A"/);
  bad({ root: { children: [{ label: "A" }, { label: "B" }] } }, /no p/);
  bad({ urn: { V: 1 }, draws: 3 }, /without replacement/);
  bad({ urn: { V: 3, A: 2 }, draws: 0 }, /draws must be/);
  bad({ urn: { V: 3, A: 2 }, draws: 2, events: [{ name: "E", paths: [["Z"]] }] }, /matches no leaf/);
  bad({ urn: { V: 3, A: 2 }, draws: 2, events: [{ name: "E", paths: [["V"]] }], given: { event: "E", given: "F" } }, /not a declared event/);
  bad({ urn: { V: 3, A: 2 }, draws: 2, colour: "red" }, /not a field/);
  bad({ urn: { V: 3, A: 2 }, draws: 6, replacement: true }, /more than 32/);
});

test("there are at least five fixtures", () => {
  assert.ok(fixtures.length >= 5);
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "probability-tree");
    const { preset: _p, ...input } = raw;
    validateProbabilityTreeInput(input);
    const result = await render(expandProbabilityTree(input as unknown as ProbabilityTreeInput), { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
  });
});
