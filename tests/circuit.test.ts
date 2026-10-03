/**
 * circuit: DC circuits with a GIVEN layout. The solver is pinned against
 * circuits solved by hand (series, parallel, divider, Wheatstone balanced and
 * unbalanced, a two-source Kirchhoff problem, superposition, a current
 * source), every unsolvable netlist is refused by name, and the drawing is
 * read back -- which way each arrowhead points, where the dots are, what the
 * labels say -- instead of trusting the preset's numbers a second time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { CircuitError, gaussSolve, solveMna, solveWithDiodes } from "../src/presets/circuit/mna.ts";
import type { MnaElement } from "../src/presets/circuit/mna.ts";
import { analyseBranches, currentName, displayName, expandCircuit, parseQty, prepare, quantity, solveCircuit, validateCircuitInput } from "../src/presets/circuit/preset.ts";
import type { CircuitInput } from "../src/presets/circuit/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, FigureSpec, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/circuit/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));
const load = (name: string): CircuitInput => {
  const { preset: _p, ...input } = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
  return input as unknown as CircuitInput;
};

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;
const assertNear = (got: number | undefined, want: number, what: string, eps = 1e-9): void => assert.ok(got !== undefined && near(got, want, eps), `${what}: got ${got}, wanted ${want}`);

const R = (id: string, a: string, b: string, value: number): MnaElement => ({ id, kind: "R", a, b, value });
const Vs = (id: string, a: string, b: string, value: number): MnaElement => ({ id, kind: "V", a, b, value });
const Is = (id: string, a: string, b: string, value: number): MnaElement => ({ id, kind: "I", a, b, value });
const W = (id: string, a: string, b: string): MnaElement => ({ id, kind: "W", a, b, value: 0 });
const Am = (id: string, a: string, b: string): MnaElement => ({ id, kind: "A", a, b, value: 0 });

const blocksOf = (spec: FigureSpec): Block[] => (spec.root as Scene).children as Block[];
const marksOf = (spec: FigureSpec): Mark[] => (spec.root as Scene).marks ?? [];
const textOf = (spec: FigureSpec, id: string): string | undefined => blocksOf(spec).find((b) => b.id === id)?.label;
/** A panel line as a reader reads it: one block per line (ADR 0062), its label the runs joined. */
const panelLines = (spec: FigureSpec): string[] =>
  blocksOf(spec)
    .filter((b) => (b.id ?? "").startsWith("panel-"))
    .map((b) => (b.label ?? "").replace(/ /g, " "));

// ---- the linear algebra ------------------------------------------------------------------------

test("gaussSolve pivots past a zero on the diagonal", () => {
  const x = gaussSolve([[0, 1], [1, 0]], [2, 3]);
  assert.deepEqual(x, [3, 2]);
  const y = gaussSolve([[1e-14, 1], [1, 1]], [1, 2]);
  assert.ok(near(y[0]!, 1, 1e-9) && near(y[1]!, 1, 1e-9));
  assert.throws(() => gaussSolve([[1, 2], [2, 4]], [1, 2]), CircuitError);
});

// ---- hand-solved circuits ----------------------------------------------------------------------

test("series: 12 V across 2 + 4 + 6 Ω carries 1 A, and each drop is I·R", () => {
  const s = solveMna({ nodes: ["E", "A", "B", "C"], elements: [Vs("E1", "E", "A", 12), R("R1", "A", "B", 2), R("R2", "B", "C", 4), R("R3", "C", "E", 6)] });
  for (const id of ["E1", "R1", "R2", "R3"]) assertNear(s.current.get(id), 1, id);
  assert.equal(s.ground, "E");
  assertNear(s.potential.get("A"), 12, "V_A");
  assertNear(s.potential.get("B"), 10, "V_B");
  assertNear(s.potential.get("C"), 6, "V_C");
});

test("parallel: 12 V across 6 Ω ∥ 3 Ω -- 2 A and 4 A, 6 A from the source", () => {
  const s = solveMna({ nodes: ["n", "p"], elements: [Vs("E1", "n", "p", 12), R("R1", "p", "n", 6), R("R2", "p", "n", 3)] });
  assertNear(s.current.get("R1"), 2, "R1");
  assertNear(s.current.get("R2"), 4, "R2");
  assertNear(s.current.get("E1"), 6, "E1 (from − to + inside the source)");
});

test("divider: V_out = E·R2/(R1 + R2), and an ideal voltmeter changes nothing", () => {
  const s = solveMna({ nodes: ["G", "A", "M"], elements: [Vs("E1", "G", "A", 12), R("R1", "A", "M", 4), R("R2", "M", "G", 2)] });
  assertNear(s.potential.get("M"), 4, "V_M");
  const fig = solveCircuit(load("divider-voltmeter.json"));
  assertNear(fig.potential.get("M")! - fig.potential.get("B")!, 4, "voltmeter reading");
});

test("Wheatstone bridge, balanced (R1/R2 = R3/R4): no current in the galvanometer arm", () => {
  const s = solveMna({
    nodes: ["A", "B", "C", "D"],
    elements: [Vs("E1", "B", "A", 10), R("R1", "A", "C", 3), R("R2", "C", "B", 6), R("R3", "A", "D", 5), R("R4", "D", "B", 10), R("R5", "C", "D", 7)],
  });
  assertNear(s.current.get("R5"), 0, "R5");
  assertNear(s.potential.get("C"), s.potential.get("D")!, "V_C = V_D");
});

test("Wheatstone bridge, unbalanced: the currents solved by hand (18/7, 12/7, 6/7, 30/7 A)", () => {
  const s = solveCircuit(load("wheatstone-unbalanced.json"));
  assertNear(s.current.get("R1"), 18 / 7, "R1");
  assertNear(s.current.get("R2"), 12 / 7, "R2");
  assertNear(s.current.get("R3"), 12 / 7, "R3");
  assertNear(s.current.get("R4"), 18 / 7, "R4");
  assertNear(s.current.get("R5"), 6 / 7, "R5 (C to D)");
  assertNear(s.current.get("E1"), 30 / 7, "E1");
  assertNear(s.potential.get("C")! - s.potential.get("D")!, 12 / 7, "U_CD");
});

test("two batteries, two meshes (Kirchhoff): V_A = 7,2 V; 2,4 A, 0,6 A (charging E2) and 1,8 A", () => {
  const s = solveCircuit(load("two-batteries-kirchhoff.json"));
  assertNear(s.potential.get("B"), 0, "ground");
  assertNear(s.potential.get("A"), 7.2, "V_A");
  assertNear(s.current.get("R1"), 2.4, "R1");
  assertNear(s.current.get("R2"), 0.6, "R2 (A to p2)");
  assertNear(s.current.get("R3"), 1.8, "R3");
  assertNear(s.current.get("E2"), -0.6, "E2 is driven backwards: it is being charged");
  // KCL at A.
  assertNear(s.current.get("R1")!, s.current.get("R2")! + s.current.get("R3")!, "KCL at A");
});

test("superposition: the answer with both sources is the sum of each alone", () => {
  const net = (e1: number, e2: number, i3: number): ReturnType<typeof solveMna> =>
    solveMna({
      nodes: ["g", "a", "b", "c"],
      ground: "g",
      elements: [Vs("E1", "g", "a", e1), R("R1", "a", "b", 3), R("R2", "b", "g", 6), R("R3", "b", "c", 2), Vs("E2", "g", "c", e2), Is("I1", "g", "b", i3)],
    });
  const all = net(9, 4, 1.5);
  const parts = [net(9, 0, 0), net(0, 4, 0), net(0, 0, 1.5)];
  for (const id of ["R1", "R2", "R3", "E1", "E2"]) {
    assertNear(all.current.get(id), parts.reduce((s, p) => s + p.current.get(id)!, 0), id, 1e-12);
  }
  assertNear(all.potential.get("b"), parts.reduce((s, p) => s + p.potential.get("b")!, 0), "V_b", 1e-12);
});

test("a current source drives its current through a resistor: 2 A through 5 Ω is 10 V", () => {
  const s = solveMna({ nodes: ["g", "a"], elements: [Is("I1", "g", "a", 2), R("R1", "a", "g", 5)] });
  assertNear(s.potential.get("a")! - s.potential.get("g")!, 10, "V_a");
  assertNear(s.current.get("R1"), 2, "R1");
});

test("an ideal ammeter reads its branch current and drops nothing", () => {
  const s = solveCircuit(load("ammeter-switch-open.json"));
  assertNear(s.current.get("A1"), 2, "A1");
  assertNear(s.potential.get("p1"), s.potential.get("A")!, "no drop across A1");
  assertNear(s.current.get("R2"), 0, "the open switch leaves R2 without current");
});

test("wires make one node of their ends; power balances in every fixture", () => {
  const s = solveMna({ nodes: ["g", "a", "a2"], elements: [Vs("E1", "g", "a", 5), W("w1", "a", "a2"), R("R1", "a2", "g", 5)] });
  assert.equal(s.merged.get("a"), s.merged.get("a2"));
  assertNear(s.current.get("R1"), 1, "R1");
  for (const f of fixtures) {
    const input = load(f);
    const sol = solveCircuit(input);
    // Every element of the netlist, internal resistances and diode drops included: delivered = dissipated.
    let supplied = 0;
    let dissipated = 0;
    for (const e of sol.net.elements) {
      const i = sol.current.get(e.id) ?? 0;
      if (e.kind === "R") dissipated += i * i * e.value;
      if (e.kind === "V") supplied += e.value * i;
      if (e.kind === "I") supplied += e.value * (sol.potential.get(e.b)! - sol.potential.get(e.a)!);
    }
    for (const c of input.components) {
      if (c.kind !== "led" && c.kind !== "diode") continue;
      const st = sol.diodes.get(c.id ?? "")!;
      if (st.on) dissipated += (c.vf ?? 0) * st.current;
    }
    assertNear(supplied, dissipated, `${f}: power`, 1e-9);
  }
});

// ---- refusals -----------------------------------------------------------------------------------

const refuses = (elements: MnaElement[], nodes: string[], pattern: RegExp, ground?: string): void =>
  assert.throws(() => solveMna({ nodes, elements, ...(ground === undefined ? {} : { ground }) }), (e: unknown) => e instanceof CircuitError && pattern.test(e.message), pattern.source);

test("a source shorted by wires is refused, naming the wires", () => {
  refuses([Vs("E1", "a", "b", 5), W("w1", "b", "c"), W("w2", "c", "a"), R("R1", "a", "b", 1)], ["a", "b", "c"], /E1 is short-circuited.*(w1 and w2|w2 and w1)/);
});

test("an ammeter bypassed by a wire is refused", () => {
  refuses([Vs("E1", "g", "a", 5), Am("A1", "a", "b"), W("w1", "a", "b"), R("R1", "b", "g", 1)], ["g", "a", "b"], /ammeter A1 is bypassed/);
});

test("two ideal sources in parallel form a loop of voltage sources", () => {
  refuses([Vs("E1", "g", "a", 5), Vs("E2", "g", "a", 6), R("R1", "a", "g", 1)], ["g", "a"], /E1 and E2 form a loop of ideal voltage sources/);
  refuses([Vs("E1", "g", "a", 5), Am("A1", "a", "b"), Vs("E2", "g", "b", 5)], ["g", "a", "b"], /E1, A1 and E2|E2, E1 and A1|form a loop/);
});

test("a floating subcircuit is refused, naming its elements and nodes", () => {
  refuses([Vs("E1", "g", "a", 5), R("R1", "a", "g", 1), R("R9", "x", "y", 2)], ["g", "a", "x", "y"], /R9 \(nodes x and y\) has no conducting path to the reference node g/);
});

test("a current source in series with an open circuit is refused", () => {
  // I1 feeds node x, whose only other connection (a switch) is open -- not passed in.
  refuses([Vs("E1", "g", "a", 5), R("R1", "a", "g", 1), Is("I1", "a", "x", 2)], ["g", "a", "x"], /current source I1 is in series with an open circuit: nodes x/);
});

test("nonsense values are refused", () => {
  refuses([Vs("E1", "g", "a", 5), R("R1", "a", "g", 0)], ["g", "a"], /R1: a resistance must be a positive number/);
  refuses([Vs("E1", "g", "a", 5), R("R1", "a", "q", 1)], ["g", "a"], /unknown node "q"/);
  refuses([R("R1", "a", "g", 1)], ["g", "a", "z"], /ground: node z is touched by no conducting element/, "z");
});

// ---- numbers ------------------------------------------------------------------------------------

test("quantities: exact decimals and fractions, otherwise ≈ and three significant figures", () => {
  assert.deepEqual(quantity(0.5, "pt-BR"), { rel: "=", text: "0,5" });
  assert.deepEqual(quantity(2 / 3, "pt-BR"), { rel: "=", text: "2/3" });
  assert.deepEqual(quantity(11.52, "pt-BR"), { rel: "=", text: "11,52" });
  assert.deepEqual(quantity(18 / 35, "pt-BR"), { rel: "≈", text: "0,514" });
  assert.deepEqual(quantity(0.0012345, "pt-BR"), { rel: "≈", text: "0,00123" });
  assert.deepEqual(quantity(-2.4, "pt-BR"), { rel: "=", text: "−2,4" });
  assert.deepEqual(quantity(0.5, "en"), { rel: "=", text: "0.5" });
  assert.equal(displayName("R12"), "R₁₂");
  assert.equal(displayName("Ch"), "Ch");
  assert.equal(currentName(3, 5), "i₃");
  assert.equal(currentName(1, 1), "i");
});

// ---- branches -----------------------------------------------------------------------------------

test("series components share one branch; a parallel circuit has one branch per arm", () => {
  const series = load("series-battery-three-resistors.json");
  const b1 = analyseBranches(series, solveCircuit(series));
  assert.equal(b1.length, 1);
  assert.deepEqual(b1[0]!.members, ["E1", "R1", "R2", "R3"]);
  assert.equal(b1[0]!.name, "i");
  const kirchhoff = load("two-batteries-kirchhoff.json");
  const b2 = analyseBranches(kirchhoff, solveCircuit(kirchhoff));
  assert.deepEqual(b2.map((b) => b.members), [["E1", "R1"], ["R2", "E2"], ["R3"]]);
  const open = load("ammeter-switch-open.json");
  const b3 = analyseBranches(open, solveCircuit(open));
  assert.deepEqual(b3.map((b) => [b.members, b.zero]), [[["E1", "A1", "R1"], false], [["R2"], true]]);
});

// ---- the drawing, read back ------------------------------------------------------------------------

/** Unit direction an arrowhead points, from its drawn triangle (tip is `from`). */
function arrowDir(m: Mark): Point {
  const tip = m.from as Point;
  const b1 = (m.segments[0] as { line: Point }).line;
  const b2 = (m.segments[1] as { line: Point }).line;
  const base = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
  const len = Math.hypot(tip.x - base.x, tip.y - base.y);
  return { x: (tip.x - base.x) / len, y: (tip.y - base.y) / len };
}

test("series: one arrow, pointing the way conventional current flows, labelled i = 1 A", () => {
  const spec = expandCircuit(load("series-battery-three-resistors.json"));
  const arrows = marksOf(spec).filter((m) => /^current-\d+$/.test(m.id));
  assert.equal(arrows.length, 1);
  assert.equal(textOf(spec, "current-1-label"), "i = 1 A");
  // The arrow sits on the bottom wire D → E (y = 0), and current returns from D to E: leftward on the page.
  const d = arrowDir(arrows[0]!);
  assert.ok(near(d.x, -1, 1e-9) && near(d.y, 0, 1e-9), JSON.stringify(d));
  assert.equal(textOf(spec, "label-R1"), "2 Ω");
  assert.equal(textOf(spec, "label-E1"), "12 V");
  assert.deepEqual(panelLines(spec), ["UAC = VA − VC = 6 V"]);
  // ADR 0062: the subscripts are real runs of ONE block, not blocks set side by side.
  const u = blocksOf(spec).find((b) => b.id === "panel-u-1")!;
  assert.deepEqual(u.runs?.filter((r) => r.script === "sub").map((r) => r.text), ["AC", "A", "C"]);
  assert.deepEqual(spec.readings?.lines.map((l) => l.runs.map((r) => r.text).join("")), ["UAC = VA − VC = 6 V"]);
  assert.equal(marksOf(spec).filter((m) => m.id.startsWith("dot-")).length, 0, "no T-junctions, no dots");
});

test("Kirchhoff: every arrow agrees with the sign of the current it names", () => {
  const input = load("two-batteries-kirchhoff.json");
  const spec = expandCircuit(input);
  const sol = solveCircuit(input);
  const branches = analyseBranches(input, sol);
  assert.deepEqual(
    branches.map((_, i) => textOf(spec, `current-${i + 1}-label`)),
    ["i₁ = 2,4 A", "i₂ = 0,6 A", "i₃ = 1,8 A"],
  );
  // Each arrow is on a vertical run of its branch here: E1's lead (up), E2's lead (down: E2 is charged), R3's lead (down).
  const dirs = [1, 2, 3].map((k) => arrowDir(marksOf(spec).find((m) => m.id === `current-${k}`)!));
  assert.ok(near(dirs[0]!.y, -1, 1e-9), `i₁ runs up through E1: ${JSON.stringify(dirs[0])}`);
  assert.ok(near(dirs[1]!.y, 1, 1e-9), `i₂ runs down through E2: ${JSON.stringify(dirs[1])}`);
  assert.ok(near(dirs[2]!.y, 1, 1e-9), `i₃ runs down through R3: ${JSON.stringify(dirs[2])}`);
  assert.deepEqual(panelLines(spec), [
    "UAB = VA − VB = 7,2 V",
    "PE1 = 28,8 W (fornecida)",
    "PR1 = 11,52 W",
    "PR2 = 0,72 W",
    "PE2 = 3,6 W (recebida)",
    "PR3 = 12,96 W",
  ]);
  assert.ok(marksOf(spec).some((m) => m.id === "ground"), "an explicit ground is drawn");
});

test("junction dots only where three or more runs meet", () => {
  const spec = expandCircuit(load("wheatstone-unbalanced.json"));
  const dots = marksOf(spec).filter((m) => m.id.startsWith("dot-")).map((m) => m.id).sort();
  assert.deepEqual(dots, ["dot-C", "dot-D", "dot-a2", "dot-b2"]);
  // Dots are painted last (a label's place carries no ink).
  const ids = marksOf(spec).filter((m) => m.place !== true).map((m) => m.id);
  assert.ok(ids.slice(-4).every((id) => id.startsWith("dot-")));
});

test("meters: the ammeter and voltmeter readings are computed", () => {
  const a = expandCircuit(load("ammeter-switch-open.json"));
  assert.equal(textOf(a, "label-A1-reading"), "2 A");
  assert.equal(textOf(a, "label-A1-letter"), "A");
  assert.equal(textOf(a, "current-2-label"), "i₂ = 0");
  const v = expandCircuit(load("divider-voltmeter.json"));
  assert.equal(textOf(v, "label-V1-reading"), "V₁: 4 V");
});

test("current values move to the panel when asked, leaving i₁ on the arrow", () => {
  const input = load("wheatstone-unbalanced.json");
  const spec = expandCircuit({ ...input, show: { ...input.show, currentValues: "panel" } });
  assert.equal(textOf(spec, "current-1-label"), "i₁");
  const lines = panelLines(spec);
  assert.ok(lines[0]!.startsWith("i₁ = 18/7 A "), lines[0]);
  assert.ok(lines.some((l) => l.includes("i₆ = 30/7 A")), lines.join(" | "));
});

test("sources and a lamp: a voltage source driven backwards receives power; exact fractions throughout", () => {
  const input = load("sources-lamp-iec.json");
  const sol = solveCircuit(input);
  assertNear(sol.potential.get("A"), 40 / 3, "V_A");
  const spec = expandCircuit(input);
  assert.deepEqual(
    [1, 2, 3].map((k) => textOf(spec, `current-${k}-label`)),
    ["i₁ = 2/3 A", "i₂ = 4/3 A", "i₃ = 2 A"],
  );
  // i₁ runs from A back into the source's + terminal: leftward on the top wire.
  assert.ok(near(arrowDir(marksOf(spec).find((m) => m.id === "current-1")!).x, -1, 1e-9));
  assert.deepEqual(panelLines(spec), ["VA = 40/3 V", "VB = 0 (referência)", "PU1 = 20/3 W (recebida)", "PL1 = 20/9 W", "PR1 = 160/9 W", "PI1 = 80/3 W (fornecida)"]);
});

test("IEC symbols draw a rectangle, not a zigzag", () => {
  const input = load("series-battery-three-resistors.json");
  const zig = marksOf(expandCircuit(input)).find((m) => m.id === "R1")!;
  const iec = marksOf(expandCircuit({ ...input, symbols: "iec" })).find((m) => m.id === "R1")!;
  assert.notEqual(zig.segments.length, iec.segments.length);
});

// ---- layout refusals ----------------------------------------------------------------------------------

test("layouts that mislead are refused", () => {
  const base = (components: CircuitInput["components"], nodes: CircuitInput["nodes"] = { A: [0, 0], B: [2, 0], C: [2, 2], D: [0, 2] }): CircuitInput => ({ nodes, components });
  const bad = (input: CircuitInput, pattern: RegExp): void =>
    assert.throws(() => expandCircuit(input), (e: unknown) => e instanceof SpecError && pattern.test(e.message), pattern.source);
  const loop = [
    { id: "E1", kind: "battery", from: "A", to: "D", value: 6 },
    { kind: "wire", from: "D", to: "C" },
    { id: "R1", kind: "resistor", from: "C", to: "B", value: 3 },
    { kind: "wire", from: "B", to: "A" },
  ] as CircuitInput["components"];
  assert.doesNotThrow(() => expandCircuit(base(loop)));
  bad(base([...loop, { id: "R2", kind: "resistor", from: "A", to: "C", value: 1 }]), /neither horizontal nor vertical.*via/);
  bad(base([...loop.slice(0, 3), { kind: "wire", from: "B", to: "A", via: [2, 0] }]), /zero length/);
  bad(base([...loop, { id: "R2", kind: "resistor", from: "B", to: "A", value: 1 }]), /run on top of each other/);
  bad(base(loop, { A: [0, 0], B: [2, 0], C: [2, 2], D: [0, 2], M: [1, 0] }), /passes through node M/);
  bad(
    base([...loop, { kind: "wire", from: "X", to: "Y" }], { A: [0, 0], B: [2, 0], C: [2, 2], D: [0, 2], X: [1, -1], Y: [1, 3] }),
    /cross at \(1; [02]\)/,
  );
  bad(base(loop, { A: [0, 0], B: [2, 0], C: [2, 0.1], D: [0, 0.1] }), /too short for a battery symbol/);
  bad(base(loop, { A: [0, 0], B: [2, 0], C: [2, 2], D: [2, 2] }), /both at/);
});

test("validation names what is wrong", () => {
  const ok: Record<string, unknown> = load("series-battery-three-resistors.json") as unknown as Record<string, unknown>;
  const bad = (patch: Record<string, unknown>, pattern: RegExp): void =>
    assert.throws(() => validateCircuitInput({ ...ok, ...patch }), (e: unknown) => e instanceof SpecError && pattern.test(e.message), `${JSON.stringify(patch)} ${pattern.source}`);
  const comps = (ok.components as Record<string, unknown>[]).map((c) => ({ ...c }));
  const withComp = (i: number, patch: Record<string, unknown>): Record<string, unknown> => ({ components: comps.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  assert.doesNotThrow(() => validateCircuitInput(ok));
  bad({ nodes: { A: [0, 0] } }, /at least two nodes/);
  bad({ nodes: { ...(ok.nodes as object), Z: [1] } }, /nodes\.Z must be \[x, y\]/);
  bad(withComp(1, { kind: "capacitor" }), /kind must be one of/);
  bad(withComp(1, { id: undefined }), /id is required for a resistor/);
  bad(withComp(1, { value: undefined }), /value is required for a resistor/);
  bad(withComp(1, { value: -2 }), /must be positive/);
  bad(withComp(0, { value: -12 }), /swap from and to/);
  bad(withComp(1, { to: "Q" }), /refers to node "Q"/);
  bad(withComp(1, { closed: true }), /closed applies only to a switch/);
  bad(withComp(2, { id: "R1" }), /already used/);
  bad({ components: [...comps, { id: "A9", kind: "ammeter", from: "A", to: "B", value: 2 }] }, /reading is computed, never typed/);
  bad({ show: { currents: "yes" } }, /show.currents must be true or false/);
  bad({ show: { pretty: true } }, /not a flag/);
  bad({ show: { voltages: [["A"]] } }, /pair of node names/);
  bad({ show: { currentValues: "margin" } }, /currentValues must be one of/);
  bad({ ground: "Q" }, /refers to node "Q"/);
  bad({ symbols: "din" }, /symbols must be one of/);
});

// ---- every fixture: renders, and every check passes --------------------------------------------------------

test("at least six fixtures, covering the required circuits", () => {
  assert.ok(fixtures.length >= 6, `${fixtures.length} fixtures`);
  for (const needle of ["series", "parallel", "divider", "wheatstone", "kirchhoff", "ammeter"]) assert.ok(fixtures.join(" ").includes(needle), `no ${needle} fixture`);
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "circuit");
    const { preset: _preset, ...input } = raw;
    validateCircuitInput(input);
    const spec = expandCircuit(input as unknown as CircuitInput);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
  });
});

test("the panel variant of a dense circuit also passes every check", async () => {
  const input = load("wheatstone-unbalanced.json");
  const spec = expandCircuit({ ...input, show: { ...input.show, currentValues: "panel" } });
  const result = await render(spec, { maxPasses: 3, raster: false });
  for (const check of result.manifest.checks) assert.ok(check.status === "pass" || check.status === "not-applicable", `${check.id} ${check.status}: ${check.detail}`);
});

// ---- answers: false --------------------------------------------------------------------------------

const answerIds = (spec: FigureSpec): string[] =>
  [...blocksOf(spec).map((b) => b.id ?? ""), ...marksOf(spec).map((m) => m.id ?? "")].filter((id) => /^(current-|panel-)|-reading$/.test(id));

fixtures.forEach((filename) => {
  test(`answers:false ${filename}: no current, reading, U, V or P is drawn, and every check passes`, async () => {
    const input = { ...load(filename), answers: false, show: { ...load(filename).show, voltages: [Object.keys(load(filename).nodes).slice(0, 2)] as [string, string][], nodeVoltages: true, power: true } };
    const spec = expandCircuit(input);
    assert.deepEqual(answerIds(spec), [], filename);
    // Nothing but givens: values of components (Ω, V, A of a source), names and node letters.
    for (const b of blocksOf(spec)) assert.ok(!/^U|referência|fornecida|recebida/.test(b.label ?? ""), `${filename}: ${b.id} "${b.label}"`);
    const result = await render(spec, { maxPasses: 3, raster: false });
    for (const check of result.manifest.checks) assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
  });
});

test("answers:false keeps the ground, the meter letters and the given values; answers:true is unchanged", () => {
  const input = load("divider-voltmeter.json");
  const hidden = expandCircuit({ ...input, answers: false });
  const texts = blocksOf(hidden).map((b) => b.label);
  assert.ok(texts.includes("V"), "the voltmeter's letter stays");
  assert.ok(texts.some((t) => t?.includes("12 V")) && texts.some((t) => t?.includes("4 Ω")));
  assert.deepEqual(answerIds(hidden), []);
  const shown = expandCircuit(input);
  assert.ok(answerIds(shown).some((id) => id.endsWith("-reading")));
  assert.deepEqual(expandCircuit({ ...input, answers: true }), shown);
});

// ---- ADR 0069: diodes, real sources, symbols, taps, load boxes ---------------------------------------------

test("diode: an LED with a series resistor conducts (6 V, 2 V, 200 Ω → 20 mA) and is drawn lit", () => {
  const input = load("led-series-resistor.json");
  const sol = solveCircuit(input);
  assertNear(sol.current.get("D1"), 0.02, "D1");
  assertNear(sol.current.get("R1"), 0.02, "R1");
  assert.equal(sol.diodes.get("D1")!.on, true);
  assertNear(sol.potential.get("B")! - sol.potential.get("C")!, 2, "the LED holds V_f");
  const spec = expandCircuit(input);
  assert.equal(textOf(spec, "current-1-label"), "i = 20 mA");
  assert.ok(panelLines(spec).includes("D₁: aceso, i = 20 mA"), panelLines(spec).join(" | "));
  assert.equal(marksOf(spec).find((m) => m.id === "D1")!.fill, "#F2C94C");
});

test("diode: reversed, or starved below its V_f, it is off and the circuit carries nothing", () => {
  const input = load("led-series-resistor.json");
  const reversed: CircuitInput = { ...input, components: input.components.map((c) => (c.id === "D1" ? { ...c, from: "C", to: "B" } : c)) };
  const r = solveCircuit(reversed);
  assert.equal(r.diodes.get("D1")!.on, false);
  assertNear(r.current.get("R1"), 0, "R1");
  assertNear(r.diodes.get("D1")!.drop, -6, "the LED blocks the whole battery");
  const weak: CircuitInput = { ...input, components: input.components.map((c) => (c.id === "E1" ? { ...c, value: 1.5 } : c)) };
  assert.equal(solveCircuit(weak).diodes.get("D1")!.on, false, "1,5 V < V_f = 2 V");
  assert.ok(panelLines(expandCircuit(reversed)).includes("D₁: apagado"));
});

test("diode: two LEDs in parallel branches each get their own current (30 and 20 mA, 50 mA from the source)", () => {
  const s = solveCircuit(load("led-two-branches.json"));
  assertNear(s.current.get("R1"), 0.03, "R1");
  assertNear(s.current.get("R2"), 0.02, "R2");
  assertNear(s.current.get("E1"), 0.05, "E1");
});

test("diodes: the ideal diode forward and reverse; a negative V_f is refused", () => {
  const net = { nodes: ["g", "a", "b"], elements: [Vs("E1", "g", "a", 10), R("R1", "b", "g", 5)] };
  const fwd = solveWithDiodes(net, [{ id: "D1", a: "a", b: "b", vf: 0 }]);
  assertNear(fwd.diodes.get("D1")!.current, 2, "anode → cathode through an ideal diode");
  assert.equal(fwd.diodes.get("D1")!.on, true);
  const rev = solveWithDiodes(net, [{ id: "D1", a: "b", b: "a", vf: 0 }]);
  assert.equal(rev.diodes.get("D1")!.on, false);
  assertNear(rev.diodes.get("D1")!.drop, -10, "the diode blocks 10 V");
  assert.throws(() => solveWithDiodes(net, [{ id: "D1", a: "a", b: "b", vf: -1 }]), /forward voltage/);
});

test("diodes: no self-consistent state is refused, not guessed", () => {
  // 2 A is forced into node a, whose only way out is a diode that points INTO it: on, it would carry -2 A;
  // off, the current source is in series with an open circuit.
  const net = { nodes: ["g", "a"], elements: [Is("I1", "g", "a", 2)] };
  assert.throws(() => solveWithDiodes(net, [{ id: "D1", a: "g", b: "a", vf: 0 }]), /no on\/off state of D1 is consistent/);
});

test("non-ideal source: U = ε − r·i, 12 V and 0,5 Ω into 2,5 Ω gives 4 A and 10 V", () => {
  const input = load("source-internal-resistance.json");
  const sol = solveCircuit(input);
  assertNear(sol.current.get("E1"), 4, "E1");
  assertNear(sol.potential.get("A")! - sol.potential.get("E")!, 10, "terminal voltage");
  const spec = expandCircuit(input);
  assert.ok(panelLines(spec).includes("UE1 = ε − r·i = 12 − 0,5 · 4 = 10 V"), panelLines(spec).join(" | "));
  assert.equal(textOf(spec, "label-E1-r"), "r = 0,5 Ω");
  assert.ok(marksOf(spec).some((m) => m.id === "E1-box" && m.lineStyle === "dashed"));
  // Shorted by a wire, a real source drives ε/r, not infinity.
  const shorted: CircuitInput = { ...input, components: input.components.map((c) => (c.id === "R1" ? { kind: "wire", from: "B", to: "C" } : c)) as CircuitInput["components"] };
  assertNear(solveCircuit(shorted).current.get("E1"), 24, "short-circuit current ε/r");
});

test("symbolic: R in series with 2R ∥ 3R from E → i = 5E/(11R), 3E/(11R), 2E/(11R)", () => {
  const input = load("symbolic-series-parallel.json");
  const sol = solveCircuit(input);
  assert.deepEqual(sol.net.symbolic, { r: "R", e: "E" });
  assertNear(sol.current.get("R1"), 5 / 11, "R1 in units of E/R");
  assertNear(sol.current.get("R2"), 3 / 11, "R2");
  assertNear(sol.current.get("R3"), 2 / 11, "R3");
  const spec = expandCircuit(input);
  assert.deepEqual([1, 2, 3].map((k) => textOf(spec, `current-${k}-label`)), ["i₁ = 5E/(11R)", "i₂ = 3E/(11R)", "i₃ = 2E/(11R)"]);
  assert.equal(textOf(spec, "label-R2"), "2R");
  assert.ok(panelLines(spec).includes("UBF = VB − VF = 6E/11"), panelLines(spec).join(" | "));
  assert.ok(panelLines(spec).some((l) => l.startsWith("PR1 = 25E2/(121R)")), panelLines(spec).join(" | "));
});

test("symbolic: parseQty reads R, 2R, 0,2 R_c and refuses the rest", () => {
  assert.deepEqual(parseQty("R", "x"), { coef: 1, sym: "R" });
  assert.deepEqual(parseQty("2R", "x"), { coef: 2, sym: "R" });
  assert.deepEqual(parseQty("0,2 R_c", "x"), { coef: 0.2, sym: "R_{c}" });
  assert.deepEqual(parseQty(5, "x"), { coef: 5 });
  assert.throws(() => parseQty("12", "x"), SpecError);
  assert.throws(() => parseQty("R+1", "x"), SpecError);
});

test("symbolic: a subscripted symbol is drawn with a real subscript; what cannot be scaled is refused", () => {
  const base = load("symbolic-series-parallel.json");
  const edit = (id: string, patch: Record<string, unknown>): CircuitInput => ({ ...base, components: base.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const spec = expandCircuit(edit("R2", { value: "0,2 R" }));
  assert.equal(textOf(spec, "label-R2"), "0,2 R");
  const sub: CircuitInput = { ...base, components: base.components.map((c) => (c.kind === "resistor" ? { ...c, value: String(c.value).replace("R", "R_c") } : c)) };
  const subSpec = expandCircuit(sub);
  const label = blocksOf(subSpec).find((b) => b.id === "label-R2")!;
  assert.deepEqual(label.runs, [{ text: "2R" }, { text: "c", script: "sub" }]);
  const bad = (input: CircuitInput, pattern: RegExp): void => assert.throws(() => solveCircuit(input), (e: unknown) => e instanceof SpecError && pattern.test(e.message), pattern.source);
  bad(edit("R2", { value: 4 }), /mix symbols and numbers/);
  bad(edit("R2", { value: "2S" }), /more than one resistance symbol/);
  bad(edit("E1", { value: 12 }), /EMFs mix symbols and numbers/);
  bad(edit("E1", { value: "R" }), /both use the symbol R/);
});

test("potentiometer: a tap at x = 0,25 is placed by the preset and splits the wire 25 Ω / 75 Ω", () => {
  const input = load("potentiometer-divider.json");
  assert.deepEqual(prepare(input).nodes.W, [1, 2], "a quarter of the way from Q (0, 2) to R (4, 2)");
  const sol = solveCircuit(input);
  assertNear(sol.net.resistance.get("P1.1"), 25, "upper part");
  assertNear(sol.net.resistance.get("P1.2"), 75, "lower part");
  // 25 + (75 ∥ 150) = 75 Ω: 0,16 A from the 12 V; the load sees 12 − 0,16·25 = 8 V.
  assertNear(sol.current.get("E1"), 0.16, "E1");
  assertNear(sol.potential.get("W")! - sol.potential.get("M")!, 8, "U_WM");
  assert.ok(panelLines(expandCircuit(input)).some((l) => l.startsWith("UWM = VW − VM = 8 V")));
});

test("potentiometer: taps and relative nodes are derived and validated", () => {
  const input = load("tapped-wire-ammeter.json");
  const prep = prepare(input);
  assert.deepEqual(prep.nodes.C, [3, 0]);
  assert.deepEqual(prep.nodes.M, [3, 2]);
  assert.deepEqual(["A", "B", "C", "D", "E"].map((n) => prep.nodes[n]![0]), [1, 2, 3, 4, 5]);
  const edit = (patch: Record<string, unknown>): CircuitInput => ({ ...input, components: input.components.map((c) => (c.id === "W1" ? { ...c, ...patch } : c)) });
  assert.throws(() => expandCircuit(edit({ taps: [{ node: "A", at: 1.2 }] })), /strictly between/);
  assert.throws(() => expandCircuit(edit({ taps: [{ node: "A", at: 0.5 }, { node: "B", at: "1/2" }] })), /same place/);
  assert.throws(() => expandCircuit({ ...input, nodes: { ...input.nodes, A: [1, 0] } }), /also in "nodes"/);
});

test("tapped wire: with the ammeter on tap C it reads 0,25 A, and a different tap reads differently", () => {
  const input = load("tapped-wire-ammeter.json");
  // Ground Q; wire 24 Ω across 12 V, 2 V per Ω-quarter: V(C) = 6 V. L1 = 3 Ω, L2 = 6 Ω from the rails Q (0 V) and R (12 V).
  // Node P: (0 − V_P)/3 + (12 − V_P)/6 + I_A = 0 with V_P = V_C = 6 V → I_A = 6/3 − 6/6 − 0 ... solved by the netlist: 0,25 A.
  assertNear(Math.abs(solveCircuit(input).current.get("A1")!), 0.25, "A1 on C");
  const onTap = (tap: string): number => {
    const comps = input.components.map((c) => (c.id === "A1" ? { ...c, to: tap } : c));
    return Math.abs(solveCircuit({ ...input, nodes: { ...input.nodes, M: { at: tap, dy: 2 } }, components: comps }).current.get("A1")!);
  };
  const reads = ["A", "B", "C", "D", "E"].map(onTap);
  assert.ok(reads.some((r) => !near(r, reads[2]!, 1e-6)), "another tap reads differently");
});

test("load box: a rated 960 W / 120 V appliance is 15 Ω, and the circuit carries 7,5 A", () => {
  const input = load("household-load-box.json");
  const sol = solveCircuit(input);
  assertNear(sol.net.resistance.get("L1"), 15, "R = U²/P");
  assertNear(sol.current.get("L1"), 7.5, "i");
  assertNear(sol.potential.get("B")! - sol.potential.get("C")!, 112.5, "U_BC");
  const spec = expandCircuit(input);
  assert.equal(textOf(spec, "label-L1-name"), "aparelho");
  assert.equal(textOf(spec, "label-L1"), "960 W, 120 V");
  assert.equal(textOf(spec, "current-1-label"), "i = 7,5 A");
  assert.throws(() => validateCircuitInput({ ...(input as unknown as Record<string, unknown>), components: input.components.map((c) => (c.id === "L1" ? { ...c, value: 15 } : c)) }), /either "value" or "rated"/);
});

test("answers:false keeps the givens of the new symbols and hides what they solve", () => {
  const led = expandCircuit({ ...load("led-series-resistor.json"), answers: false });
  assert.equal(marksOf(led).find((m) => m.id === "D1")!.fill, "#FCFBF7", "an LED is not drawn lit when that is the question");
  assert.ok(blocksOf(led).some((b) => b.label === "Vf = 2 V"));
  assert.deepEqual(answerIds(led), []);
  const src = expandCircuit({ ...load("source-internal-resistance.json"), answers: false, show: { terminal: true, power: true } });
  assert.deepEqual(answerIds(src), []);
  assert.ok(blocksOf(src).some((b) => b.label === "r = 0,5 Ω"));
  const sym = expandCircuit({ ...load("symbolic-series-parallel.json"), answers: false });
  assert.deepEqual(answerIds(sym), []);
  assert.ok(blocksOf(sym).some((b) => b.label === "2R"));
});
