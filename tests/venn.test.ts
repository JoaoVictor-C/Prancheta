/**
 * venn: Venn diagrams of two or three sets. The tests pin the three things a
 * reviewer with a ruler would check without trusting the preset's own numbers:
 * the set-expression language (parsed, printed and evaluated), the arithmetic
 * of the survey data (inclusion-exclusion, refused when a region goes
 * negative), and the DRAWN geometry, decoded back from the marks -- region
 * outlines that tile the circles' union, shaded exactly where the expression
 * holds, every count inside the region it names.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { buildVennModel, describeRegion, expandVenn, maskAt, regionLoops, circleArcs, solveCounts, solveElements, validateVennInput, vennCircles } from "../src/presets/venn/preset.ts";
import type { VennInput } from "../src/presets/venn/preset.ts";
import { evalSetExpr, parseSetExpr, printSetExpr } from "../src/presets/venn/setexpr.ts";
import type { SetExpr } from "../src/presets/venn/setexpr.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/venn/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

const SHADE = "#9DBDE9";
const AB = ["A", "B"];
const ABC = ["A", "B", "C"];

/** Every membership vector of n sets. */
function vectors(n: number): boolean[][] {
  return Array.from({ length: 1 << n }, (_, m) => Array.from({ length: n }, (_, i) => (m & (1 << i)) !== 0));
}
const table = (e: SetExpr, n: number): boolean[] => vectors(n).map((v) => evalSetExpr(e, v));
const same = (a: string, b: string, names: string[]): boolean => JSON.stringify(table(parseSetExpr(a, names), names.length)) === JSON.stringify(table(parseSetExpr(b, names), names.length));

// ---- the expression language -------------------------------------------------------------

test("the four operations evaluate on membership vectors", () => {
  const t = (src: string): string => table(parseSetExpr(src, AB), 2).map((x) => (x ? "1" : "0")).join("");
  // index = mask: 0 outside, 1 only A, 2 only B, 3 both
  assert.equal(t("A ∪ B"), "0111");
  assert.equal(t("A ∩ B"), "0001");
  assert.equal(t("A − B"), "0100");
  assert.equal(t("A'"), "1010");
  assert.equal(t("(A ∪ B)'"), "1000");
  assert.equal(t("U"), "1111");
  assert.equal(t("∅"), "0000");
});

test("ascii and unicode spellings are one language", () => {
  for (const [a, b] of [
    ["A ∪ B", "A union B"],
    ["A ∪ B", "A | B"],
    ["A ∩ B", "A inter B"],
    ["A ∩ B", "A & B"],
    ["A − B", "A - B"],
    ["A − B", "A minus B"],
    ["A − B", "A \\ B"],
    ["A′", "A'"],
    ["A′", "Aᶜ"],
    ["A′", "A^c"],
    ["A′", "A^{c}"],
    ["A′", "~A"],
    ["A′", "not A"],
    ["(A ∪ B)′", "(A union B)^c"],
  ] as const) {
    assert.ok(same(a, b, AB), `${a} vs ${b}`);
  }
});

test("∩ binds tighter than ∪ and −, which are left associative", () => {
  assert.ok(same("A ∪ B ∩ C", "A ∪ (B ∩ C)", ABC));
  assert.ok(!same("A ∪ B ∩ C", "(A ∪ B) ∩ C", ABC));
  assert.ok(same("A ∪ B − C", "(A ∪ B) − C", ABC));
  assert.ok(same("A − B ∪ C", "(A − B) ∪ C", ABC));
  assert.ok(same("A − B − C", "(A − B) − C", ABC));
  assert.ok(!same("A − B − C", "A − (B − C)", ABC));
  assert.ok(same("A ∩ B'", "A ∩ (B')", ABC));
  assert.ok(same("~A ∩ B", "(~A) ∩ B", ABC));
  assert.ok(same("A''", "A", ABC));
});

test("De Morgan and the difference identity hold on every region", () => {
  assert.ok(same("(A ∪ B)'", "A' ∩ B'", ABC));
  assert.ok(same("(A ∩ B ∩ C)'", "A' ∪ B' ∪ C'", ABC));
  assert.ok(same("A − B", "A ∩ B'", ABC));
  assert.ok(same("(A ∪ B) − C", "(A − C) ∪ (B − C)", ABC));
});

test("printSetExpr writes text that parses back to the same set", () => {
  // A deterministic generator over the grammar.
  let seed = 12345;
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const gen = (depth: number): SetExpr => {
    if (depth === 0 || rnd(4) === 0) return rnd(6) === 0 ? { k: "universe" } : { k: "set", i: rnd(3) };
    const k = rnd(5);
    if (k === 0) return { k: "not", a: gen(depth - 1) };
    const a = gen(depth - 1);
    const b = gen(depth - 1);
    return k === 1 ? { k: "and", a, b } : k === 2 ? { k: "or", a, b } : { k: "minus", a, b };
  };
  for (let n = 0; n < 300; n += 1) {
    const e = gen(4);
    const text = printSetExpr(e, ABC);
    const back = parseSetExpr(text, ABC);
    assert.deepEqual(table(back, 3), table(e, 3), text);
  }
  assert.equal(printSetExpr(parseSetExpr("(A union B) - C", ABC), ABC), "(A ∪ B) − C");
  assert.equal(printSetExpr(parseSetExpr("A inter B'", ABC), ABC), "A ∩ B′");
  assert.equal(printSetExpr(parseSetExpr("(A ∪ B)^c", ABC), ABC), "(A ∪ B)′");
});

test("multi-letter names and a custom universe are understood", () => {
  const e = parseSetExpr("Jornal ∩ Radio'", ["Jornal", "Radio"], "Ω");
  assert.deepEqual(table(e, 2), [false, true, false, false]);
  assert.deepEqual(table(parseSetExpr("Ω − Jornal", ["Jornal", "Radio"], "Ω"), 2), [true, false, true, false]);
});

test("a bad expression is refused with where and why", () => {
  const bad = (src: string, names = AB): string => {
    try {
      parseSetExpr(src, names);
    } catch (e) {
      assert.ok(e instanceof SpecError, String(e));
      return (e as Error).message;
    }
    return assert.fail(`${src} was accepted`);
  };
  assert.match(bad("A ∪ D"), /"D" is not one of the sets \(A, B\)/);
  assert.match(bad("AB", AB), /write the operator between them: A ∪ B/);
  assert.match(bad("(A ∪ B"), /bracket is never closed/);
  assert.match(bad("A ∪ B)"), /closing bracket/);
  assert.match(bad("A B"), /operator .* is missing/);
  assert.match(bad("A ∪"), /ends where a set was expected/);
  assert.match(bad("∩ A"), /set was expected here/);
  assert.match(bad("A ^ B"), /"\^" must be followed by c/);
  assert.match(bad("A ? B"), /unexpected character "\?"/);
  assert.match(bad(""), /non-empty set expression/);
  assert.match(bad("A ∪ ∩ B"), /set was expected/);
});

test("nothing is executed: a host-language string is just an unknown name", () => {
  assert.throws(() => parseSetExpr("process.exit()", AB), SpecError);
  assert.throws(() => parseSetExpr("A; B", AB), SpecError);
});

// ---- the data: inclusion-exclusion ---------------------------------------------------------

const region = (s: ReturnType<typeof solveCounts>, names: string[], set: string[]): number | undefined => s.region[names.reduce((m, x, i) => (set.includes(x) ? m | (1 << i) : m), 0)];

test("the newspaper problem: 100 people, 45 read A, 30 read B, 12 both -- 37 read neither", () => {
  const s = solveCounts({ total: 100, A: 45, B: 30, "A∩B": 12 }, AB);
  assert.equal(region(s, AB, ["A"]), 33);
  assert.equal(region(s, AB, ["B"]), 18);
  assert.equal(region(s, AB, ["A", "B"]), 12);
  assert.equal(s.none, 37);
});

test("the three-set survey is solved by inclusion-exclusion and every region adds back up", () => {
  const data = { total: 130, A: 60, B: 50, C: 40, "A∩B": 20, "A∩C": 15, "B∩C": 10, "A∩B∩C": 5 };
  const s = solveCounts(data, ABC);
  assert.equal(region(s, ABC, ["A"]), 30);
  assert.equal(region(s, ABC, ["B"]), 25);
  assert.equal(region(s, ABC, ["C"]), 20);
  assert.equal(region(s, ABC, ["A", "B"]), 15);
  assert.equal(region(s, ABC, ["A", "C"]), 10);
  assert.equal(region(s, ABC, ["B", "C"]), 5);
  assert.equal(region(s, ABC, ["A", "B", "C"]), 5);
  assert.equal(s.none, 20);
  // Each set's cardinality is the sum of the regions inside it.
  for (const [name, want] of [["A", 60], ["B", 50], ["C", 40]] as const) {
    const i = ABC.indexOf(name);
    let sum = 0;
    for (let m = 1; m < 8; m += 1) if ((m & (1 << i)) !== 0) sum += s.region[m]!;
    assert.equal(sum, want);
  }
  assert.equal(s.region.reduce<number>((a, x) => a + (x ?? 0), 0) + s.none!, 130);
});

test("the property holds for any consistent data: counts in, the same cardinalities out", () => {
  let seed = 99;
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  for (let trial = 0; trial < 60; trial += 1) {
    const reg = Array.from({ length: 8 }, () => rnd(30));
    const card = (mask: number): number => reg.reduce((s, x, m) => (m !== 0 && (m & mask) === mask ? s + x : s), 0);
    const total = reg.reduce((s, x) => s + x, 0) + rnd(20);
    const s = solveCounts({ total, A: card(1), B: card(2), C: card(4), "A∩B": card(3), "A∩C": card(5), "B∩C": card(6), "A∩B∩C": card(7) }, ABC);
    for (let m = 1; m < 8; m += 1) assert.equal(s.region[m], reg[m], `region ${m}`);
    assert.equal(s.none, total - reg.slice(1).reduce((a, x) => a + x, 0));
  }
});

test("the union may stand in for the last intersection, and other key spellings work", () => {
  const two = solveCounts({ total: 100, "n(A)": 45, "|B|": 30, "A∪B": 63 }, AB);
  assert.equal(region(two, AB, ["A", "B"]), 12);
  assert.equal(two.none, 37);
  const three = solveCounts({ A: 60, B: 50, C: 40, "A∩B": 20, "A∩C": 15, "B∩C": 10, "A∪B∪C": 110 }, ABC);
  assert.equal(region(three, ABC, ["A", "B", "C"]), 5);
  assert.equal(three.none, undefined, "no total, nothing printed outside");
});

test("per-region counts, with total deriving the outside", () => {
  const s = solveCounts({ regions: { A: 33, B: 18, "A∩B": 12 }, total: 100 }, AB);
  assert.equal(s.none, 37);
  assert.throws(() => solveCounts({ regions: { A: 33, "A∩B": 12 } }, AB), /missing B/);
  assert.throws(() => solveCounts({ regions: { A: 33, B: 18, "A∩B": 12, none: 5 }, total: 100 }, AB), /total 100 is not the sum/);
});

test("inconsistent data is refused, naming the region that comes out negative", () => {
  assert.throws(() => solveCounts({ total: 100, A: 10, B: 30, "A∩B": 12 }, AB), (e: Error) => e instanceof SpecError && /region "only A" comes out as -2/.test(e.message));
  assert.throws(() => solveCounts({ total: 50, A: 45, B: 30, "A∩B": 12 }, AB), (e: Error) => e instanceof SpecError && /region "outside every set" comes out as -13/.test(e.message));
  assert.throws(
    () => solveCounts({ A: 60, B: 50, C: 40, "A∩B": 20, "A∩C": 15, "B∩C": 10, "A∩B∩C": 25 }, ABC),
    (e: Error) => e instanceof SpecError && /region "A ∩ B, outside C" comes out as -5/.test(e.message),
  );
  assert.equal(describeRegion(3, ABC), "A ∩ B, outside C");
  assert.equal(describeRegion(7, ABC), "A ∩ B ∩ C");
});

test("malformed data is refused with the path", () => {
  assert.throws(() => solveCounts({ total: 100, A: 45.5, B: 30, "A∩B": 12 }, AB), /counts\.A must be a whole number/);
  assert.throws(() => solveCounts({ total: 100, A: 45, B: 30 }, AB), /needs \|A∩B\| or \|A∪B\|/);
  assert.throws(() => solveCounts({ total: 100, A: 45, B: 30, "A∩D": 12 }, AB), /"D", which is not one of the sets/);
  assert.throws(() => solveCounts({ A: 45, B: 30 }, ABC), /needs /);
});

test("elements: membership is computed, and a stray element is refused", () => {
  const e = solveElements({ U: [1, 2, 3, 4, 5, 6], A: [1, 2, 3], B: [3, 4] }, AB, "U", "pt-BR");
  assert.deepEqual(e.region[1], ["1", "2"]);
  assert.deepEqual(e.region[3], ["3"]);
  assert.deepEqual(e.region[2], ["4"]);
  assert.deepEqual(e.none, ["5", "6"]);
  assert.equal(solveElements({ A: [1], B: [2] }, AB, "U", "pt-BR").none, undefined);
  assert.throws(() => solveElements({ U: [1, 2], A: [1, 9] }, AB, "U", "pt-BR"), /9, which the universe U does not contain/);
  assert.throws(() => solveElements({ A: [1, 1] }, AB, "U", "pt-BR"), /twice/);
  assert.throws(() => solveElements({ Z: [1] }, AB, "U", "pt-BR"), /elements\.Z is not one of the sets/);
  assert.deepEqual(solveElements({ A: [1.5] }, AB, "U", "pt-BR").region[1], ["1,5"], "decimal comma in pt-BR");
});

// ---- geometry, decoded from the drawn marks ---------------------------------------------------

type Poly = Point[];

/** A mark's outline as a polygon, arcs flattened the way the renderer sweeps them (the minor arc). */
function polygonOf(mark: Mark): Poly {
  const out: Poly = [];
  let prev = mark.from as Point;
  out.push(prev);
  for (const seg of mark.segments) {
    if ("line" in seg) {
      prev = seg.line as Point;
      out.push(prev);
      continue;
    }
    const c = seg.centre as Point;
    const end = seg.arc as Point;
    const a0 = Math.atan2(prev.y - c.y, prev.x - c.x);
    const r = Math.hypot(prev.x - c.x, prev.y - c.y);
    assert.ok(Math.abs(r - Math.hypot(end.x - c.x, end.y - c.y)) < 1e-6, "an arc's ends are equidistant from its centre");
    let da = Math.atan2(end.y - c.y, end.x - c.x) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    assert.ok(Math.abs(da) < Math.PI - 0.05, "every arc is minor");
    for (let s = 1; s <= 64; s += 1) out.push(s === 64 ? end : { x: c.x + r * Math.cos(a0 + (da * s) / 64), y: c.y + r * Math.sin(a0 + (da * s) / 64) });
    prev = end;
  }
  return out;
}

const area = (p: Poly): number => {
  let s = 0;
  for (let i = 0; i < p.length; i += 1) {
    const q = p[(i + 1) % p.length]!;
    s += p[i]!.x * q.y - q.x * p[i]!.y;
  }
  return Math.abs(s) / 2;
};

function inside(p: Poly, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1) {
    const a = p[i]!;
    const b = p[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

const marksOf = (spec: ReturnType<typeof expandVenn>): Mark[] => (spec.root as Scene).marks as Mark[];
const blocksOf = (spec: ReturnType<typeof expandVenn>): Block[] => (spec.root as Scene).children as Block[];
const regionMarks = (spec: ReturnType<typeof expandVenn>): Mark[] => marksOf(spec).filter((m) => m.id.startsWith("region-"));

test("the classic layout: equal circles, two overlapping or three on a triangle of side r", () => {
  const two = vennCircles(2, 100);
  assert.equal(Math.hypot(two[0]!.x - two[1]!.x, two[0]!.y - two[1]!.y), 100);
  const three = vennCircles(3, 100);
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) assert.ok(Math.abs(Math.hypot(three[i]!.x - three[j]!.x, three[i]!.y - three[j]!.y) - 100) < 1e-9);
  assert.ok(three.every((c) => c.r === 100));
  // all 7 inner regions of the three circles exist, and so do the 3 of two
  const seen = new Set<number>();
  for (let x = -200; x <= 200; x += 2) for (let y = -200; y <= 200; y += 2) seen.add(maskAt(three, x, y));
  assert.equal(seen.size, 8);
});

test("every inner region's outline closes, and the arcs on it are exactly those the circles are cut into", () => {
  for (const n of [2, 3] as const) {
    const circles = vennCircles(n, 100);
    const arcs = circleArcs(circles);
    let runs = 0;
    for (let m = 1; m < 1 << n; m += 1) {
      const loops = regionLoops(circles, arcs, m);
      assert.equal(loops.length, 1, `region ${m} of ${n} is one loop`);
      runs += loops[0]!.length;
    }
    // Each arc is a boundary of exactly two regions (or of one region and the outside).
    assert.ok(runs >= arcs.length && runs <= 2 * arcs.length);
  }
});

test("the regions tile the circles' union: the areas add up to the union, and the lens is the lens", () => {
  for (const [names, r] of [[AB, 100], [ABC, 100]] as const) {
    const spec = expandVenn({ sets: [...names] });
    const marks = regionMarks(spec);
    assert.equal(marks.length, (1 << names.length) - 1);
    const total = marks.reduce((s, m) => s + area(polygonOf(m)), 0);
    // The union's area by fine sampling of the y-up model.
    const circles = vennCircles(names.length as 2 | 3, r);
    let inUnion = 0;
    const h = 0.5;
    for (let x = -260; x <= 260; x += h) for (let y = -260; y <= 260; y += h) if (maskAt(circles, x, y) !== 0) inUnion += h * h;
    assert.ok(Math.abs(total - inUnion) / inUnion < 0.002, `${names.length} sets: regions ${total.toFixed(0)} vs union ${inUnion.toFixed(0)}`);
    for (const m of marks) assert.ok(area(polygonOf(m)) > 200, `${m.id} has area`);
  }
  const lens = area(polygonOf(regionMarks(expandVenn({ sets: AB })).find((m) => m.id === "region-A-B")!));
  const r = 100;
  const d = 100;
  const exact = 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);
  assert.ok(Math.abs(lens - exact) / exact < 1e-3, `lens ${lens} vs ${exact}`);
});

test("the shaded regions are exactly those where the expression holds -- computed, never picked", () => {
  const cases: [string[], string][] = [
    [AB, "A ∩ B"],
    [AB, "A'"],
    [AB, "(A ∪ B)'"],
    [AB, "A − B"],
    [ABC, "(A ∪ B) − C"],
    [ABC, "A ∩ B ∩ C"],
    [ABC, "(A ∩ B) ∪ (A ∩ C) ∪ (B ∩ C)"],
    [ABC, "C'"],
    [ABC, "U"],
    [ABC, "∅"],
    [ABC, "A ∩ B'"],
  ];
  for (const [names, shade] of cases) {
    const spec = expandVenn({ sets: names, shade });
    const e = parseSetExpr(shade, names);
    const marks = marksOf(spec);
    const fillOf = (id: string): string | undefined => marks.find((m) => m.id === id)?.fill;
    const vs = vectors(names.length);
    for (let m = 0; m < vs.length; m += 1) {
      const want = evalSetExpr(e, vs[m]!);
      const id = m === 0 ? "universe-fill" : `region-${names.filter((_, i) => (m & (1 << i)) !== 0).join("-")}`;
      assert.equal(fillOf(id) === SHADE, want, `${shade}: ${id}`);
    }
  }
});

test("a filled region has no stroke, and the circle outlines come after every fill", () => {
  const spec = expandVenn({ sets: ABC, shade: "(A ∪ B) − C" });
  const marks = marksOf(spec);
  const lastFill = Math.max(...marks.map((m, i) => (m.id.startsWith("region-") || m.id === "universe-fill" ? i : -1)));
  const firstOutline = Math.min(...marks.map((m, i) => (m.id.startsWith("set-") || m.id === "universe" ? i : Infinity)));
  assert.ok(lastFill < firstOutline);
  for (const m of marks.filter((x) => x.id.startsWith("region-"))) assert.ok(m.stroke === "none" && (m.strokeWidth ?? 0) === 0);
  for (const m of marks.filter((x) => x.id.startsWith("set-"))) assert.ok((m.strokeWidth ?? 0) > 0 && m.fill === "none");
});

test("each count sits inside the region it names, its whole box clear of every outline", () => {
  for (const fixture of ["newspaper-two-sets.json", "survey-three-sets.json", "counts-per-region.json"]) {
    const { preset: _p, ...input } = JSON.parse(readFileSync(join(dir, fixture), "utf8")) as Record<string, unknown>;
    const spec = expandVenn(input as unknown as VennInput);
    const marks = marksOf(spec);
    const circlePolys = marks.filter((m) => m.id.startsWith("set-")).map(polygonOf);
    const counts = blocksOf(spec).filter((b) => b.id?.startsWith("count-"));
    const n = (input.sets as string[]).length;
    assert.equal(counts.length, 1 << n, `${fixture}: a count for every region including the outside`);
    for (const b of counts) {
      const x0 = b.x!;
      const y0 = b.y!;
      const x1 = x0 + b.width!;
      const y1 = y0 + b.height!;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const membership = circlePolys.map((p) => inside(p, cx, cy));
      // The box's corners and edge midpoints are in the same region as its centre.
      for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [cx, y0], [cx, y1], [x0, cy], [x1, cy]] as const) {
        assert.deepEqual(circlePolys.map((p) => inside(p, px, py)), membership, `${fixture}: ${b.id} straddles an outline`);
      }
      if (b.id !== "count-outside") {
        const owner = marks.find((m) => m.id === b.annotates)!;
        assert.ok(inside(polygonOf(owner), cx, cy), `${fixture}: ${b.id} is not inside ${b.annotates}`);
      } else assert.ok(membership.every((x) => !x), "the outside count is outside every circle");
    }
  }
});

test("the printed numbers are the solved ones, in their regions", () => {
  const spec = expandVenn({ sets: AB, counts: { total: 100, A: 45, B: 30, "A∩B": 12 } });
  const by = new Map(blocksOf(spec).map((b) => [b.id, b.label]));
  assert.equal(by.get("count-A"), "33");
  assert.equal(by.get("count-B"), "18");
  assert.equal(by.get("count-A-B"), "12");
  assert.equal(by.get("count-outside"), "37");
});

test("with counts and a shade, the caption is the sum of the shaded regions", () => {
  const cap = (input: VennInput): string => blocksOf(expandVenn(input)).find((b) => b.id === "caption")!.label as string;
  assert.equal(cap({ sets: AB, counts: { total: 100, A: 45, B: 30, "A∩B": 12 }, shade: "(A ∪ B)'" }), "n((A ∪ B)′) = 37");
  assert.equal(cap({ sets: AB, counts: { total: 100, A: 45, B: 30, "A∩B": 12 }, shade: "A ∪ B" }), "n(A ∪ B) = 63");
  assert.equal(cap({ sets: AB, counts: { total: 100, A: 45, B: 30, "A∩B": 12 }, shade: "A ∩ B" }), "n(A ∩ B) = 12");
  assert.equal(cap({ sets: AB, shade: "A ∩ B'" }), "sombreado: A ∩ B′");
  assert.equal(cap({ sets: AB, elements: { A: [1, 2, 3], B: [3, 4] }, shade: "A − B" }), "A − B = {1, 2}");
  // no total, so the outside is unknown: the sum is not claimed
  assert.equal(cap({ sets: AB, counts: { A: 45, B: 30, "A∩B": 12 }, shade: "A'" }), "sombreado: A′");
});

test("elements are listed inside their own regions", () => {
  const spec = expandVenn({ sets: ABC, elements: { U: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], A: [1, 2, 3, 4, 5], B: [4, 5, 6, 7, 8], C: [5, 8, 9, 10] } });
  const marks = marksOf(spec);
  const by = new Map(blocksOf(spec).map((b) => [b.id, b]));
  assert.equal(by.get("elements-A")!.label!.replace(/\s+/g, " "), "1, 2, 3");
  assert.equal(by.get("elements-A-B")!.label, "4");
  assert.equal(by.get("elements-A-B-C")!.label, "5");
  assert.equal(by.get("elements-B-C")!.label, "8");
  assert.equal(by.get("elements-C")!.label!.replace(/\s+/g, " "), "9, 10");
  assert.equal(by.get("elements-outside")!.label!.replace(/\s+/g, " "), "11, 12");
  assert.equal(by.get("elements-A-C"), undefined, "an empty region prints nothing");
  for (const [id, b] of by) {
    if (!id?.startsWith("elements-") || id === "elements-outside") continue;
    const owner = marks.find((m) => m.id === b.annotates)!;
    assert.ok(inside(polygonOf(owner), b.x! + b.width! / 2, b.y! + b.height! / 2), id);
  }
});

test("many elements wrap onto lines rather than overflow their region", () => {
  const many = Array.from({ length: 14 }, (_, i) => i + 1);
  const spec = expandVenn({ sets: AB, elements: { A: many, B: [100] } });
  const b = blocksOf(spec).find((x) => x.id === "elements-A")!;
  assert.ok((b.label as string).includes("\n"), "wrapped");
  assert.equal((b.label as string).replace(/,?\n/g, ", "), many.join(", "));
  // ...and an impossible list is refused rather than drawn across the outlines
  assert.throws(() => expandVenn({ sets: AB, elements: { A: Array.from({ length: 400 }, (_, i) => `elemento${i}`), B: [] } }), /do not fit/);
});

test("names sit outside the circles; U in the corner; the layout is symmetric", () => {
  const spec = expandVenn({ sets: ABC });
  const blocks = blocksOf(spec);
  const marks = marksOf(spec);
  const rect = polygonOf(marks.find((m) => m.id === "universe")!);
  const polys = new Map(marks.filter((m) => m.id.startsWith("set-")).map((m) => [m.id, polygonOf(m)]));
  for (const name of ABC) {
    const b = blocks.find((x) => x.id === `name-${name}`)!;
    for (const p of polys.values()) assert.ok(!inside(p, b.x! + b.width! / 2, b.y! + b.height! / 2), `${name} is outside every circle`);
    assert.ok(inside(rect, b.x! + b.width! / 2, b.y! + b.height! / 2));
  }
  const u = blocks.find((b) => b.id === "universe-name")!;
  const xs = rect.map((p) => p.x);
  const ys = rect.map((p) => p.y);
  assert.ok(u.x! < Math.min(...xs) + 40 && u.y! < Math.min(...ys) + 40, "U is in the top-left corner");
  // A and B mirror each other about the vertical axis of the diagram
  const a = blocks.find((b) => b.id === "name-A")!;
  const bb = blocks.find((b) => b.id === "name-B")!;
  const axis = (Math.min(...xs) + Math.max(...xs)) / 2;
  assert.ok(Math.abs(a.x! + a.width! / 2 + (bb.x! + bb.width! / 2) - 2 * axis) < 14, "A and B are symmetric");
});

test("a custom universe name is drawn in the corner and usable in the expression", () => {
  const spec = expandVenn({ sets: AB, universe: "Ω", shade: "Ω − A" });
  assert.equal(blocksOf(spec).find((b) => b.id === "universe-name")!.label, "Ω");
  const model = buildVennModel({ sets: AB, universe: "Ω", shade: "Ω − A" });
  assert.deepEqual(model.shaded, [true, false, true, false]);
});

// ---- input validation -----------------------------------------------------------------------------

test("input is validated with the path in the message", () => {
  const bad = (input: Record<string, unknown>): string => {
    try {
      validateVennInput(input);
    } catch (e) {
      assert.ok(e instanceof SpecError, String(e));
      return (e as Error).message;
    }
    return assert.fail("accepted");
  };
  assert.match(bad({}), /venn\.sets/);
  assert.match(bad({ sets: ["A"] }), /two or three sets/);
  assert.match(bad({ sets: ["A", "B", "C", "D"] }), /two or three sets/);
  assert.match(bad({ sets: ["A", "A"] }), /repeated/);
  assert.match(bad({ sets: ["A", "union"] }), /reserved/);
  assert.match(bad({ sets: ["A", "U"] }), /reserved/);
  assert.match(bad({ sets: ["A", "1B"] }), /venn\.sets\[1\]/);
  assert.match(bad({ sets: AB, shading: "A" }), /venn\.shading is not a field/);
  assert.match(bad({ sets: AB, shade: "A ∪ D" }), /venn\.shade: "D" is not one of the sets/);
  assert.match(bad({ sets: AB, counts: { A: 1, B: 1, "A∩B": 1 }, elements: { A: [1] } }), /not both/);
  assert.match(bad({ sets: AB, counts: { total: 10, A: 1, B: 1, "A∩B": 5 } }), /region "only A" comes out as -4/);
  validateVennInput({ sets: AB, shade: "A ∩ B" });
});

// ---- every fixture: renders, and every check passes --------------------------------------------------

test("there are at least six fixtures, covering the required kinds", () => {
  assert.ok(fixtures.length >= 6, `${fixtures.length} fixtures`);
  for (const needle of ["inter", "minus", "complement", "newspaper", "survey", "elements"]) assert.ok(fixtures.join(" ").includes(needle), `no ${needle} fixture`);
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "venn");
    const { preset: _preset, ...input } = raw;
    validateVennInput(input);
    const spec = expandVenn(input as unknown as VennInput);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
  });
});

// ---- answers: false, and magnitudes ---------------------------------------------------------------

const vennPasses = async (input: VennInput, what: string): Promise<void> => {
  const result = await render(expandVenn(input), { maxPasses: 3 });
  for (const c of result.manifest.checks) assert.ok(c.status === "pass" || c.status === "not-applicable", `${what}: ${c.id} ${c.status}: ${c.detail}`);
};
const SURVEY: VennInput = { sets: ["A", "B", "C"], counts: { total: 130, A: 60, B: 50, C: 40, "A∩B": 20, "A∩C": 15, "B∩C": 10, "A∩B∩C": 5 }, shade: "C'" };

test("answers:true is the default and changes nothing", () => {
  assert.deepEqual(expandVenn({ ...SURVEY, answers: true }), expandVenn(SURVEY));
});

test("answers:false is the empty diagram: circles, names and the universe, no counts, shading or caption", async () => {
  const q = { ...SURVEY, answers: false };
  const spec = expandVenn(q);
  const labels = blocksOf(spec).map((b) => b.label);
  assert.deepEqual([...labels].sort(), ["A", "B", "C", "U"]);
  const marks = (spec.root as Scene).marks ?? [];
  assert.ok(!marks.some((m) => m.fill !== undefined && /^#9DBDE9$/i.test(m.fill)), "nothing shaded");
  await vennPasses(q, "venn counts answers:false");
  const els: VennInput = { sets: ["A", "B"], elements: { U: [1, 2, 3, 4, 5, 6], A: [1, 2, 3], B: [3, 4] }, shade: "A ∩ B", answers: false };
  assert.deepEqual(blocksOf(expandVenn(els)).map((b) => b.label).sort(), ["A", "B", "U"]);
  await vennPasses(els, "venn elements answers:false");
});

test("answers:false still refuses contradictory data", () => {
  assert.throws(() => expandVenn({ sets: ["A", "B"], counts: { total: 10, A: 5, B: 5, "A∩B": 9 }, answers: false }), SpecError);
});

test("counts in the thousands and hundreds of thousands fit their regions", async () => {
  await vennPasses({ sets: ["A", "B", "C"], counts: { total: 250000, A: 60000, B: 50000, C: 40000, "A∩B": 20000, "A∩C": 15000, "B∩C": 10000, "A∩B∩C": 5000 } }, "venn 5-digit");
  await vennPasses({ sets: ["A", "B"], counts: { regions: { A: 123456, "A∩B": 98765, B: 12345, none: 1234567 } } }, "venn 7-digit");
});
