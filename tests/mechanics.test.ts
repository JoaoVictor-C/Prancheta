/**
 * mechanics: pulley systems and inclines solved against hand-worked values,
 * every arrow drawn to one scale, values hidden under answers:false, and every
 * fixture rendered clean.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandMechanics, solveAtwood, solveIncline, solvePulleys, solveSpring, solveTable, validateMechanicsInput } from "../src/presets/mechanics/preset.ts";
import type { MechanicsInput } from "../src/presets/mechanics/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { FigureNode, FigureSpec } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/mechanics/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));
const fixture = (name: string): MechanicsInput => JSON.parse(readFileSync(join(dir, name), "utf8")) as MechanicsInput;
const near = (a: number, b: number, e = 1e-6): boolean => Math.abs(a - b) <= e;

type Pt = { x: number; y: number };
type MarkLike = { id?: string; from?: Pt; segments?: { line?: Pt }[] };
const marks = (s: FigureSpec): MarkLike[] => (s.root as { marks?: MarkLike[] }).marks ?? [];
/** An arrow's drawn length: shaft start to the tip of its head. */
function arrowLength(s: FigureSpec, id: string): number {
  const shaft = marks(s).find((m) => m.id === id)!;
  const head = marks(s).find((m) => m.id === `${id}-head`)!;
  const tip = head.from!;
  return Math.hypot(tip.x - shaft.from!.x, tip.y - shaft.from!.y);
}
function labels(s: FigureSpec): string[] {
  const out: string[] = [];
  const walk = (n: FigureNode): void => {
    const o = n as { label?: string; children?: FigureNode[] };
    if (typeof o.label === "string") out.push(o.label);
    o.children?.forEach(walk);
  };
  walk(s.root);
  return out;
}

test("pulleys: each movable pulley halves the force", () => {
  assert.deepEqual(solvePulleys(40, 10, 1), { P: 400, tensions: [200], F: 200, advantage: 2 });
  assert.deepEqual(solvePulleys(80, 10, 2), { P: 800, tensions: [400, 200], F: 200, advantage: 4 });
  assert.equal(solvePulleys(30, 10, 0).F, 300);
  assert.equal(solvePulleys(80, 10, 3).F, 100);
});

test("incline: components, friction and acceleration", () => {
  const free = solveIncline(40, 10, 30);
  assert.ok(near(free.Px, 200) && near(free.N, 400 * Math.cos(Math.PI / 6)) && near(free.a, 5));
  const slides = solveIncline(10, 10, 37, 0.25);
  assert.ok(slides.sliding && near(slides.friction, 0.25 * slides.N) && near(slides.a, 10 * (Math.sin((37 * Math.PI) / 180) - 0.25 * Math.cos((37 * Math.PI) / 180))));
  const holds = solveIncline(5, 10, 20, 0.5); // tg 20° ≈ 0,364 < 0,5
  assert.ok(!holds.sliding && near(holds.friction, holds.Px) && holds.a === 0);
});

test("every arrow is drawn to one scale: F is half of P with one movable pulley", () => {
  const s = expandMechanics(fixture("pulley-one-movable.json"));
  assert.ok(near(arrowLength(s, "forca") / arrowLength(s, "peso"), 0.5, 1e-6));
  const two = expandMechanics(fixture("pulley-two-movable.json"));
  assert.ok(near(arrowLength(two, "forca") / arrowLength(two, "peso"), 0.25, 1e-6));
  const slope = expandMechanics(fixture("incline-slides.json"));
  const sol = solveIncline(10, 10, 37, 0.25);
  assert.ok(near(arrowLength(slope, "normal") / arrowLength(slope, "peso"), sol.N / sol.P, 1e-6));
  assert.ok(near(arrowLength(slope, "px") / arrowLength(slope, "peso"), sol.Px / sol.P, 1e-6));
  assert.ok(near(arrowLength(slope, "atrito") / arrowLength(slope, "peso"), sol.friction / sol.P, 1e-6));
});

test("the rope runs tangent to every wheel: vertical runs at centre ± r", () => {
  const s = expandMechanics(fixture("pulley-two-movable.json"));
  const rope = marks(s).find((m) => m.id === "corda-1")!;
  const first = rope.from!;
  const second = rope.segments![0]!.line!;
  // The anchored run leaves the ceiling straight down to the wheel's side.
  assert.ok(near(first.x, second.x, 1e-9));
});

test("table: A pulled over the edge by B, with and without friction", () => {
  const free = solveTable(3, 2, 10);
  assert.ok(free.sliding && near(free.a, 4) && near(free.T, 12)); // a = 20/5; T = 2(10 − 4)
  const slides = solveTable(6, 4, 10, 0.2);
  assert.ok(slides.sliding && near(slides.friction, 12) && near(slides.a, 2.8) && near(slides.T, 28.8));
  const holds = solveTable(10, 2, 10, 0.3); // P_B = 20 ≤ μN = 30
  assert.ok(!holds.sliding && holds.a === 0 && near(holds.friction, 20) && near(holds.T, 20));
});

test("atwood: a = |m₂ − m₁|g/(m₁ + m₂), T = 2m₁m₂g/(m₁ + m₂)", () => {
  const s = solveAtwood(3, 5, 10);
  assert.ok(near(s.a, 2.5) && near(s.T, 37.5) && s.heavier === 2);
  const even = solveAtwood(4, 4, 10);
  assert.ok(even.a === 0 && near(even.T, 40) && even.heavier === 0);
  // The tension lies between the two weights.
  assert.ok(s.T > s.P1 && s.T < s.P2);
});

test("spring: k·x = m·g, and the stretch is drawn to the same scale as L₀", () => {
  const s = solveSpring(2, 10, 250);
  assert.ok(near(s.x, 0.08) && near(s.Fel, 20));
  const spec = expandMechanics(fixture("spring-hanging.json"));
  const len = (id: string): number => {
    const m = marks(spec).find((q) => q.id === id)!;
    return Math.abs(m.segments![0]!.line!.y - m.from!.y);
  };
  assert.ok(near(len("x") / len("l0"), 0.08 / 0.2, 1e-6));
  // In equilibrium the spring's pull and the weight are drawn the same length.
  assert.ok(near(arrowLength(spec, "elastica"), arrowLength(spec, "peso"), 1e-6));
  assert.throws(() => expandMechanics({ kind: "spring", mass: 0.01, stiffness: 5000, natural: 0.5 }), /too small/);
});

test("two-body arrows share one scale: T on both sides, weights in their ratio", () => {
  const atw = expandMechanics(fixture("atwood.json"));
  assert.ok(near(arrowLength(atw, "tracao-1"), arrowLength(atw, "tracao-2"), 1e-6));
  assert.ok(near(arrowLength(atw, "peso-1") / arrowLength(atw, "peso-2"), 3 / 5, 1e-6));
  const tab = expandMechanics(fixture("table-slides.json"));
  assert.ok(near(arrowLength(tab, "tracao-a") / arrowLength(tab, "peso-b"), 28.8 / 40, 1e-6));
  assert.ok(near(arrowLength(tab, "atrito") / arrowLength(tab, "peso-a"), 12 / 60, 1e-6));
});

test("answers:false hides the values and keeps the arrows and their names", () => {
  const input = fixture("incline-slides.json");
  const shown = labels(expandMechanics(input));
  const hidden = labels(expandMechanics({ ...input, answers: false }));
  assert.ok(shown.some((t) => /≈ 19,97 N/.test(t)), shown.join(" | "));
  assert.ok(!hidden.some((t) => /\d+,\d+ N|m\/s²/.test(t)), hidden.join(" | "));
  for (const name of ["P", "N", "Px", "Py", "Fat", "10 kg", "37°"]) assert.ok(hidden.includes(name), `${name} stays`);
});

test("validation refuses what cannot be drawn or solved", () => {
  const bad = (raw: Record<string, unknown>, re: RegExp) => assert.throws(() => validateMechanicsInput(raw), (e: unknown) => e instanceof SpecError && re.test(e.message));
  bad({ mass: 1 }, /kind is required/);
  bad({ kind: "pulleys", mass: 0 }, /positive/);
  bad({ kind: "pulleys", mass: 1, movable: 4 }, /0, 1, 2 or 3/);
  bad({ kind: "pulleys", mass: 1, movable: 0, redirect: false }, /needs the fixed pulley/);
  bad({ kind: "incline", mass: 1 }, /angle is required/);
  bad({ kind: "incline", mass: 1, angle: 5 }, /10 to 75/);
  bad({ kind: "incline", mass: 1, angle: 30, movable: 1 }, /another kind \(pulleys\)/);
  bad({ kind: "table", masses: [1] }, /two positive masses/);
  bad({ kind: "atwood", masses: [1, 2], friction: 0.1 }, /another kind/);
  bad({ kind: "spring", mass: 1 }, /stiffness/);
  bad({ kind: "spring", mass: 1, stiffness: 100, natural: 0 }, /positive/);
  bad({ kind: "lever", mass: 1 }, /kind/);
  bad({ kind: "incline", mass: 1, angle: 30, friction: -0.1 }, /negative/);
});

for (const name of fixtures) {
  for (const answers of [true, false]) {
    test(`fixture ${name} (answers: ${answers}) renders with every check passing`, { timeout: 120000 }, async () => {
      const result = await render(expandMechanics({ ...fixture(name), answers }), { raster: false });
      const failed = result.manifest.checks.filter((c) => c.status === "fail");
      assert.deepEqual(failed.map((c) => `${c.id}: ${c.detail}`), []);
    });
  }
}
