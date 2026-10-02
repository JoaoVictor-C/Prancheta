/**
 * logic-circuit: the graph is built from the expression tree, the drawing is
 * decoded back the way a reviewer with a ruler would (marks, not the layout's
 * own bookkeeping), and the simulation is checked against the evaluator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { buildCircuit, expandLogicCircuit, gateCounts, simulate, validateLogicCircuitInput } from "../src/presets/logic-circuit/preset.ts";
import type { LogicCircuitInput } from "../src/presets/logic-circuit/preset.ts";
import { equivalent, evalBool, formatBool, parseBool, simplify, sopToExpr, truthRows, variablesOf } from "../src/math/boolean.ts";
import type { BoolExpr } from "../src/math/boolean.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/logic-circuit/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

const circuitOf = (source: string, order?: string[]) => {
  const e = parseBool(source);
  return buildCircuit(e, order ?? variablesOf(e), "S");
};
const kinds = (source: string): string[] =>
  circuitOf(source)
    .nodes.filter((n) => !["input", "const", "out", "dummy"].includes(n.kind))
    .map((n) => n.kind)
    .sort();

// ---- the graph is the expression tree ------------------------------------------------

test("(A·B) + C′ is one AND, one NOT and one OR", () => {
  assert.deepEqual(kinds("(A and B) or not C"), ["and", "not", "or"]);
});

test("a chain of one kind is ONE gate with that many inputs", () => {
  const c = circuitOf("A and B and C");
  const gates = c.nodes.filter((n) => n.kind === "and");
  assert.equal(gates.length, 1);
  assert.equal(gates[0]!.ins.length, 3);
  const four = circuitOf("A + B + C + D").nodes.filter((n) => n.kind === "or");
  assert.equal(four.length, 1);
  assert.equal(four[0]!.ins.length, 4);
});

test("more than four inputs become a tree of gates of at most four", () => {
  const c = circuitOf("A B C D E");
  const ands = c.nodes.filter((n) => n.kind === "and");
  assert.equal(ands.length, 2);
  assert.ok(ands.every((g) => g.ins.length <= 4));
  assert.deepEqual(ands.map((g) => g.ins.length).sort(), [2, 4]);
  const nine = circuitOf("A + B + C + D + E + G + H + J + K").nodes.filter((n) => n.kind === "or");
  assert.ok(nine.every((g) => g.ins.length <= 4));
  assert.equal(nine.length, 3, "groups of 4, 4 and 1, and one gate joining them");
});

test("not(and) is a NAND, not(or) a NOR, and the binary nand/nor operators are too", () => {
  assert.deepEqual(kinds("not (A and B)"), ["nand"]);
  assert.deepEqual(kinds("(A B C)'"), ["nand"]);
  assert.equal(circuitOf("(A B C)'").nodes.find((n) => n.kind === "nand")!.ins.length, 3);
  assert.deepEqual(kinds("not (A or B)"), ["nor"]);
  assert.deepEqual(kinds("A nand B"), ["nand"]);
  assert.deepEqual(kinds("A nor B"), ["nor"]);
  assert.deepEqual(kinds("not (A xor B)"), ["xnor"]);
  assert.deepEqual(kinds("A <-> B"), ["xnor"]);
  assert.deepEqual(kinds("A xor B"), ["xor"]);
  assert.deepEqual(kinds("A -> B"), ["not", "or"]);
  assert.deepEqual(kinds("A'"), ["not"]);
  assert.deepEqual(kinds("A''"), ["not", "not"], "a double negation is drawn, not silently cancelled");
});

test("an identical subexpression is one gate, fanned out; each variable is one line", () => {
  const c = circuitOf("(A and B) or (A and B)' or C");
  assert.equal(c.inputs.length, 3);
  assert.equal(c.nodes.filter((n) => n.kind === "and").length, 1, "the AND of the two variables is drawn once");
  assert.equal(c.nodes.filter((n) => n.kind === "nand").length, 1);
  const d = circuitOf("A'B + AB'");
  assert.equal(d.nodes.filter((n) => n.kind === "input").length, 2);
  assert.equal(d.nodes.filter((n) => n.kind === "not").length, 2);
  const shared = circuitOf("A'B + A'C");
  assert.equal(shared.nodes.filter((n) => n.kind === "not").length, 1, "A′ is drawn once");
  assert.equal(gateCounts(shared).text, "1 NOT, 2 AND, 1 OR");
});

test("layers: inputs are 0, a gate is one past its deepest input, the output is last", () => {
  const c = circuitOf("(A and B) or not C");
  const byKind = (k: string) => c.nodes.find((n) => n.kind === k)!;
  assert.deepEqual(c.inputs.map((n) => n.layer), [0, 0, 0]);
  assert.equal(byKind("and").layer, 1);
  assert.equal(byKind("not").layer, 1);
  assert.equal(byKind("or").layer, 2);
  assert.equal(c.out.layer, 3);
  // a wire that skips a layer gets a lane in each layer it passes
  const skip = circuitOf("(A and B) or C");
  const lane = skip.nodes.filter((n) => n.kind === "dummy");
  assert.equal(lane.length, 1);
  assert.equal(lane[0]!.layer, 1);
});

test("the input lines are in order of first appearance", () => {
  assert.deepEqual(circuitOf("B or A and C").inputs.map((n) => n.name), ["B", "A", "C"]);
});

// ---- simulation --------------------------------------------------------------------------

const asBool = (v: unknown): boolean => v === true;

function checkSimulation(source: string): void {
  const e = parseBool(source);
  const vars = variablesOf(e);
  const c = buildCircuit(e, vars, "S");
  for (const row of truthRows(e, vars)) {
    const env: Record<string, boolean> = {};
    vars.forEach((v, i) => {
      env[v] = row.values[i]!;
    });
    const out = simulate(c, env);
    assert.equal(out, evalBool(e, env), `${source} at ${JSON.stringify(env)}`);
    // and every gate really is its own function of its inputs
    for (const n of c.nodes) {
      const a = n.ins.map((i) => asBool(i.value));
      const want: Record<string, boolean | undefined> = {
        not: !a[0],
        and: a.every(Boolean),
        or: a.some(Boolean),
        nand: !a.every(Boolean),
        nor: !a.some(Boolean),
        xor: a[0] !== a[1],
        xnor: a[0] === a[1],
      };
      if (n.kind in want) assert.equal(n.value, want[n.kind], `${source}: ${n.kind} gate`);
    }
  }
}

test("the simulated output equals evalBool on every row, and every gate computes its own function", () => {
  for (const s of [
    "(A and B) or not C",
    "A'B + AB'",
    "not (A and B) and (C nand D)",
    "(p -> q) <-> (not q -> not p)",
    "A xor B xor C",
    "A B C D + A' B' C' D'",
    "(A nor B) or (A and not B and C) or (D nand A)",
    "A B C D E + A' + (B + C + D + E)'",
    "A",
    "A or 1",
  ]) {
    checkSimulation(s);
  }
});

test("the simulation holds on random expressions", () => {
  let seed = 31;
  const rand = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const names = ["A", "B", "C", "D"];
  const ops = ["and", "or", "xor", "nand", "nor", "imp", "iff"] as const;
  const gen = (depth: number): BoolExpr => {
    if (depth === 0 || rand(5) === 0) return { kind: "var", name: names[rand(4)]! };
    if (rand(4) === 0) return { kind: "not", arg: gen(depth - 1) };
    return { kind: "bin", op: ops[rand(ops.length)]!, left: gen(depth - 1), right: gen(depth - 1) };
  };
  for (let k = 0; k < 150; k += 1) {
    const e = gen(4);
    const vars = variablesOf(e);
    if (vars.length === 0) continue;
    const c = buildCircuit(e, vars, "S");
    for (const row of truthRows(e, vars)) {
      const env: Record<string, boolean> = {};
      vars.forEach((v, i) => {
        env[v] = row.values[i]!;
      });
      assert.equal(simulate(c, env), row.result);
    }
  }
});

// ---- decoding the drawing ------------------------------------------------------------------

/** A block as the presets place it: id and box always present. */
type Placed = Block & { id: string; x: number; y: number; width: number; height: number };
const blocksOf = (spec: { root: unknown }): Placed[] => (spec.root as Scene).children as Placed[];
const marksOf = (spec: { root: unknown }): Mark[] => (spec.root as Scene).marks ?? [];

function arcPoints(from: Point, to: Point, centre: Point): Point[] {
  const a0 = Math.atan2(from.y - centre.y, from.x - centre.x);
  const a1 = Math.atan2(to.y - centre.y, to.x - centre.x);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const r = Math.hypot(from.x - centre.x, from.y - centre.y);
  return Array.from({ length: 24 }, (_, i) => ({ x: centre.x + r * Math.cos(a0 + (d * (i + 1)) / 24), y: centre.y + r * Math.sin(a0 + (d * (i + 1)) / 24) }));
}

function polyline(m: Mark): Point[] {
  const pts: Point[] = [m.from as Point];
  let cur = m.from as Point;
  for (const s of m.segments) {
    if ("line" in s) {
      pts.push(s.line as Point);
      cur = s.line as Point;
    } else {
      pts.push(...arcPoints(cur, s.arc as Point, s.centre as Point));
      cur = s.arc as Point;
    }
  }
  if (m.close === true) pts.push(m.from as Point);
  return pts;
}

type Drawing = {
  wires: { id: string; pts: Point[]; stroke: string }[];
  gates: Map<number, { poly: Point[]; extra: Point[]; bubble: { c: Point; r: number } | undefined }>;
  dots: Point[];
};

function decodeDrawing(spec: { root: unknown }): Drawing {
  const wires: Drawing["wires"] = [];
  const gates: Drawing["gates"] = new Map();
  const dots: Point[] = [];
  const gate = (n: number) => {
    if (!gates.has(n)) gates.set(n, { poly: [], extra: [], bubble: undefined });
    return gates.get(n)!;
  };
  for (const m of marksOf(spec)) {
    let hit: RegExpExecArray | null;
    if (/^wire-\d+-\d+$/.test(m.id)) wires.push({ id: m.id, pts: polyline(m), stroke: m.stroke ?? "" });
    else if ((hit = /^gate-(\d+)$/.exec(m.id)) !== null) gate(Number(hit[1])).poly = polyline(m);
    else if ((hit = /^gate-(\d+)-curve$/.exec(m.id)) !== null) gate(Number(hit[1])).extra = polyline(m);
    else if ((hit = /^gate-(\d+)-bubble$/.exec(m.id)) !== null) {
      const seg = m.segments[0] as { arc: Point; centre: Point };
      const c = seg.centre;
      gate(Number(hit[1])).bubble = { c, r: Math.hypot((m.from as Point).x - c.x, (m.from as Point).y - c.y) };
    } else if (m.id.startsWith("dot-")) dots.push((m.segments[0] as { centre: Point }).centre);
  }
  return { wires, gates, dots };
}

const distToSegment = (p: Point, a: Point, b: Point): number => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
};
const distToPolyline = (p: Point, pts: Point[]): number => Math.min(...pts.slice(1).map((q, i) => distToSegment(p, pts[i]!, q)));

function inside(p: Point, poly: Point[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

const CIRCUITS = [
  "(A and B) or not C",
  "A'B + AB'",
  "A B + Cx (A xor B)",
  "A B C D E + A' B' + not (C or D or E) + G",
  "(p -> q) <-> (not q -> not p)",
  "(A nor B) or (A and not B and C) or (D nand A)",
  "A'BC + AB'C + ABC' + ABC",
  "not (A and B) and (C nand D)",
  "(A xor B) xor (C xor D)",
  "A B C D + A' B' + not (C or D or A) + G",
];

test("every wire is horizontal or vertical runs only", () => {
  for (const source of CIRCUITS) {
    const d = decodeDrawing(expandLogicCircuit({ expr: source }));
    assert.ok(d.wires.length > 0);
    for (const w of d.wires) {
      for (let i = 1; i < w.pts.length; i += 1) {
        const a = w.pts[i - 1]!;
        const b = w.pts[i]!;
        assert.ok(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6, `${source}: ${w.id} has a diagonal run`);
      }
    }
  }
});

test("no two wires lie on one another or within 6px of it (they may cross, never overlap)", () => {
  for (const source of CIRCUITS) {
    const d = decodeDrawing(expandLogicCircuit({ expr: source }));
    const runs = d.wires.flatMap((w) => w.pts.slice(1).map((b, i) => ({ id: w.id, a: w.pts[i]!, b })));
    for (let i = 0; i < runs.length; i += 1) {
      for (let j = i + 1; j < runs.length; j += 1) {
        const p = runs[i]!;
        const q = runs[j]!;
        const ph = Math.abs(p.a.y - p.b.y) < 1e-6;
        const qh = Math.abs(q.a.y - q.b.y) < 1e-6;
        if (ph !== qh) continue;
        if (ph && Math.abs(p.a.y - q.a.y) < 6) {
          const lo = Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x));
          const hi = Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x));
          assert.ok(hi - lo <= 0.5, `${source}: ${p.id} and ${q.id} overlap on a horizontal by ${hi - lo}`);
        }
        if (!ph && Math.abs(p.a.x - q.a.x) < 6) {
          const lo = Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y));
          const hi = Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y));
          assert.ok(hi - lo <= 0.5, `${source}: ${p.id} and ${q.id} overlap on a vertical by ${hi - lo}`);
        }
      }
    }
  }
});

test("no wire passes through a gate", () => {
  for (const source of CIRCUITS) {
    const d = decodeDrawing(expandLogicCircuit({ expr: source }));
    for (const w of d.wires) {
      for (let i = 1; i < w.pts.length; i += 1) {
        const a = w.pts[i - 1]!;
        const b = w.pts[i]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let s = 0; s <= len; s += 1) {
          const p = { x: a.x + ((b.x - a.x) * s) / Math.max(len, 1), y: a.y + ((b.y - a.y) * s) / Math.max(len, 1) };
          for (const [n, g] of d.gates) {
            if (!inside(p, g.poly)) continue;
            // a pin's wire ends ON the outline; anything deeper inside is a crossing
            assert.ok(distToPolyline(p, g.poly) <= 1.5, `${source}: ${w.id} runs through gate ${n} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
          }
        }
      }
    }
  }
});

test("every gate has one wire ending on it per input and one leaving it", () => {
  for (const source of CIRCUITS) {
    const e = parseBool(source);
    const c = buildCircuit(e, variablesOf(e), "S");
    const d = decodeDrawing(expandLogicCircuit({ expr: source }));
    const ends = d.wires.flatMap((w) => [w.pts[0]!, w.pts[w.pts.length - 1]!]);
    for (const [id, g] of d.gates) {
      const node = c.nodes[id]!;
      const touching = new Set<string>();
      for (const p of ends) {
        const onBody = distToPolyline(p, g.poly) <= 2 || (g.extra.length > 0 && distToPolyline(p, g.extra) <= 2);
        const onBubble = g.bubble !== undefined && Math.abs(Math.hypot(p.x - g.bubble.c.x, p.y - g.bubble.c.y) - g.bubble.r) <= 2;
        if (onBody || onBubble) touching.add(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
      // the output leaves from the tip (or the bubble's far side); pins end on the outline
      assert.equal(touching.size, node.ins.length + 1, `${source}: gate ${id} (${node.kind}) has ${touching.size} wire ends on it, wanted ${node.ins.length + 1}`);
    }
    assert.equal(d.gates.size, c.nodes.filter((n) => !["input", "const", "out", "dummy"].includes(n.kind)).length);
  }
});

test("the drawing runs left to right: a gate is right of every gate that feeds it", () => {
  for (const source of CIRCUITS) {
    const e = parseBool(source);
    const c = buildCircuit(e, variablesOf(e), "S");
    const d = decodeDrawing(expandLogicCircuit({ expr: source }));
    const left = (id: number): number => Math.min(...d.gates.get(id)!.poly.map((p) => p.x));
    const right = (id: number): number => Math.max(...d.gates.get(id)!.poly.map((p) => p.x));
    for (const [id] of d.gates) {
      for (const input of c.nodes[id]!.ins) {
        if (d.gates.has(input.id)) assert.ok(right(input.id) < left(id), `${source}: gate ${input.id} feeds gate ${id} but is not to its left`);
      }
    }
  }
});

test("junction dots sit exactly where three or more wire ends meet, and nowhere else", () => {
  for (const source of CIRCUITS) {
    const d = decodeDrawing(expandLogicCircuit({ expr: source }));
    const count = new Map<string, number>();
    for (const w of d.wires) {
      for (const p of [w.pts[0]!, w.pts[w.pts.length - 1]!]) {
        const k = `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    const meets = [...count].filter(([, n]) => n >= 3).map(([k]) => k).sort();
    const dots = d.dots.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).sort();
    assert.deepEqual(dots, meets, source);
  }
  // fan-out draws dots; a circuit with none draws none
  assert.ok(decodeDrawing(expandLogicCircuit({ expr: "A'B + AB'" })).dots.length >= 2);
  assert.equal(decodeDrawing(expandLogicCircuit({ expr: "A and B" })).dots.length, 0);
  assert.equal(decodeDrawing(expandLogicCircuit({ expr: "(A and B) or (C and D)" })).dots.length, 0);
});

// ---- the simulation, as drawn ---------------------------------------------------------------------

test("with inputs, every wire carries its computed 0/1 and the output value is printed", () => {
  const input: LogicCircuitInput = { expr: "not (A and B) and (C nand D)", output: "Y", inputs: { A: 1, B: 1, C: 1, D: 0 } };
  const spec = expandLogicCircuit(input);
  const blocks = blocksOf(spec);
  const marks = new Map(marksOf(spec).map((m) => [m.id, m]));
  const want = evalBool(parseBool(input.expr), { A: true, B: true, C: true, D: false });
  assert.equal(want, false);
  assert.ok(blocks.some((b) => b.label === "Y = 0"), "the output label carries the computed value");
  // a value label agrees with the colour of the wire it names
  const values = blocks.filter((b) => b.label === "0" || b.label === "1");
  assert.ok(values.length >= 5, `${values.length} value labels`);
  for (const b of values) {
    const wire = marks.get(b.annotates!)!;
    assert.ok(wire !== undefined && wire.id.startsWith("wire-"), `${b.id} names a wire`);
    assert.equal(wire.stroke === "#1D4E89", b.label === "1", `${b.id}: label ${b.label} against the wire's colour ${wire.stroke}`);
  }
  // the inputs' own values: A=1, B=1, C=1 high, D=0 low; the input name is nearest the line it names
  const panel = blocks.map((b) => b.label ?? "").join("\n");
  assert.match(panel, /A = 1, B = 1, C = 1, D = 0 {2}→ {2}Y = 0/);
});

test("value labels are off the wire they name", () => {
  const spec = expandLogicCircuit({ expr: "A'B + AB'", inputs: { A: 0, B: 1 } });
  const marks = new Map(marksOf(spec).map((m) => [m.id, m]));
  for (const b of blocksOf(spec).filter((x) => x.label === "0" || x.label === "1")) {
    const wire = marks.get(b.annotates!)!;
    const centre = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const distance = distToPolyline(centre, polyline(wire));
    assert.ok(distance > b.height / 2, `${b.id} sits on its wire (${distance.toFixed(1)}px)`);
    assert.ok(distance < 30, `${b.id} is far from its wire`);
  }
});

test("without inputs nothing is simulated: no 0/1 labels, no output value", () => {
  const spec = expandLogicCircuit({ expr: "(A and B) or not C" });
  const labels = blocksOf(spec).map((b) => b.label);
  assert.ok(!labels.includes("0") && !labels.includes("1"));
  assert.ok(labels.includes("S"));
});

test("inputs: the panel line is computed", () => {
  const spec = expandLogicCircuit({ expr: "A xor B", output: "X", inputs: { A: true, B: 0 } });
  assert.ok(blocksOf(spec).some((b) => (b.label ?? "").includes("A = 1, B = 0") && (b.label ?? "").includes("X = 1")));
});

// ---- simplify ---------------------------------------------------------------------------------------

test("simplify draws the minimal sum of products and prints both expressions", () => {
  const source = "A'BC + AB'C + ABC' + ABC";
  const spec = expandLogicCircuit({ expr: source, output: "M", simplify: true });
  const panel = blocksOf(spec).filter((b) => b.id.startsWith("panel-")).map((b) => b.label ?? "");
  assert.ok(panel.some((l) => l === "M = A′·B·C + A·B′·C + A·B·C′ + A·B·C"), panel.join(" | "));
  assert.ok(panel.some((l) => l === "Simplificada (Quine–McCluskey): M = A·B + A·C + B·C"), panel.join(" | "));
  assert.ok(panel.some((l) => /Original: 8 portas.*Simplificada: 4 portas/.test(l)) || panel.join(" ").includes("Original: 8 portas"), panel.join(" | "));
  // what is drawn is the simplified circuit: 3 ANDs and an OR, and no NOT
  const d = decodeDrawing(spec);
  assert.equal(d.gates.size, 4);
  const min = simplify(parseBool(source));
  const drawn = buildCircuit(sopToExpr(min), ["A", "B", "C"], "M");
  assert.equal(gateCounts(drawn).text, "3 AND, 1 OR");
  assert.ok(equivalent(parseBool(source), sopToExpr(min)));
});

test("simplify keeps the original variables in their order, and drops the ones the minimal form does not use", () => {
  const spec = expandLogicCircuit({ expr: "A B + A B'", simplify: true });
  const names = blocksOf(spec).filter((b) => b.annotates?.startsWith("wire-") && (b.label === "A" || b.label === "B")).map((b) => b.label);
  assert.deepEqual(names, ["A"]);
  const flat = expandLogicCircuit({ expr: "A + A'", simplify: true });
  assert.ok(blocksOf(flat).some((b) => b.label === "1"), "a tautology is the constant 1");
});

// ---- refusals ---------------------------------------------------------------------------------------------

function bad(input: Record<string, unknown>, pattern: RegExp): void {
  assert.throws(() => validateLogicCircuitInput(input), (e: unknown) => e instanceof SpecError && pattern.test(e.message), `expected ${pattern}`);
}

test("input errors name the path; a parse error shows where", () => {
  bad({}, /logic-circuit.expr is required/);
  bad({ expr: "A and" }, /logic-circuit.expr: falta um operando depois de "and" \(posição 6\)\n {2}A and\n {2} {5}\^/);
  bad({ expr: "A $ B" }, /caractere inesperado/);
  bad({ expr: "A", output: "" }, /output must be a short name/);
  bad({ expr: "A", output: "MUITO_LONGO" }, /output must be a short name/);
  bad({ expr: "A", simplify: "yes" }, /simplify must be true or false/);
  bad({ expr: "A", notation: "x" }, /notation must be one of/);
  bad({ expr: "A and B", inputs: { A: 1 } }, /no value for B/);
  bad({ expr: "A and B", inputs: { A: 1, B: 1, C: 0 } }, /C is not a variable of the expression/);
  bad({ expr: "A and B", inputs: { A: 1, B: 2 } }, /inputs.B must be 0, 1, true or false/);
});

// ---- fixtures -------------------------------------------------------------------------------------------------

test("there are at least four fixtures, covering the required kinds", () => {
  assert.ok(fixtures.length >= 4, `${fixtures.length} fixtures`);
  const names = fixtures.join(" ");
  for (const needle of ["and-or-not", "xor", "majority", "nand"]) assert.ok(names.includes(needle), `no ${needle} fixture`);
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "logic-circuit");
    const { preset: _preset, ...input } = raw;
    validateLogicCircuitInput(input);
    const spec = expandLogicCircuit(input as unknown as LogicCircuitInput);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
  });
});

test("the stress circuits render clean too (dummy lanes, a five-input AND, constants, a bare wire)", async () => {
  for (const input of [
    { expr: "A B + C (A xor B)" },
    { expr: "A B C D E + A' B' + not (C or D or E) + G" },
    { expr: "(A nor B) or (A and not B and C) or (D nand A)", inputs: { A: 1, B: 0, C: 1, D: 1 } },
    { expr: "A", inputs: { A: 1 } },
    { expr: "A or 1", simplify: true },
    { expr: "(p -> q) <-> (not q -> not p)", notation: "logic" as const },
  ]) {
    const result = await render(expandLogicCircuit(input as LogicCircuitInput), { maxPasses: 3, raster: false });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${input.expr}: ${check.id} ${check.status}: ${check.detail}`);
    }
  }
});

// ---- random circuits: the same geometry, on expressions nobody chose -------------------------------------

test("random expressions lay out with orthogonal, non-overlapping wires that never cross a gate", () => {
  let seed = 2024;
  const rand = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const names = ["A", "B", "C", "D", "E"];
  const ops = ["and", "or", "xor", "nand", "nor", "imp", "iff"] as const;
  const gen = (depth: number): BoolExpr => {
    if (depth === 0 || rand(6) === 0) return { kind: "var", name: names[rand(5)]! };
    if (rand(4) === 0) return { kind: "not", arg: gen(depth - 1) };
    return { kind: "bin", op: ops[rand(ops.length)]!, left: gen(depth - 1), right: gen(depth - 1) };
  };
  for (let k = 0; k < 80; k += 1) {
    const e = gen(4);
    if (variablesOf(e).length === 0) continue;
    const source = formatBoolDigital(e);
    const spec = expandLogicCircuit({ expr: source, simplify: k % 5 === 0 });
    const d = decodeDrawing(spec);
    const runs = d.wires.flatMap((w) => w.pts.slice(1).map((b, i) => ({ id: w.id, a: w.pts[i]!, b })));
    for (const r of runs) assert.ok(Math.abs(r.a.x - r.b.x) < 1e-6 || Math.abs(r.a.y - r.b.y) < 1e-6, `${source}: diagonal`);
    for (let i = 0; i < runs.length; i += 1) {
      for (let j = i + 1; j < runs.length; j += 1) {
        const p = runs[i]!;
        const q = runs[j]!;
        const ph = Math.abs(p.a.y - p.b.y) < 1e-6;
        if (ph !== (Math.abs(q.a.y - q.b.y) < 1e-6)) continue;
        const fixed = ph ? Math.abs(p.a.y - q.a.y) < 6 : Math.abs(p.a.x - q.a.x) < 6;
        if (!fixed) continue;
        const [pl, ph2] = ph ? [Math.min(p.a.x, p.b.x), Math.max(p.a.x, p.b.x)] : [Math.min(p.a.y, p.b.y), Math.max(p.a.y, p.b.y)];
        const [ql, qh] = ph ? [Math.min(q.a.x, q.b.x), Math.max(q.a.x, q.b.x)] : [Math.min(q.a.y, q.b.y), Math.max(q.a.y, q.b.y)];
        assert.ok(Math.min(ph2, qh) - Math.max(pl, ql) <= 0.5, `${source}: ${p.id} lies on ${q.id}`);
      }
    }
    for (const w of d.wires) {
      for (let i = 1; i < w.pts.length; i += 1) {
        const a = w.pts[i - 1]!;
        const b = w.pts[i]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let s = 0; s <= len; s += 2) {
          const p = { x: a.x + ((b.x - a.x) * s) / Math.max(len, 1), y: a.y + ((b.y - a.y) * s) / Math.max(len, 1) };
          for (const [n, g] of d.gates) {
            if (inside(p, g.poly)) assert.ok(distToPolyline(p, g.poly) <= 1.5, `${source}: ${w.id} runs through gate ${n}`);
          }
        }
      }
    }
  }
});

const formatBoolDigital = (e: BoolExpr): string => formatBool(e, "digital");

// ---- answers: false ------------------------------------------------------------------------------

const loadFixture = (name: string): LogicCircuitInput => {
  const { preset: _p, ...input } = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
  return input as unknown as LogicCircuitInput;
};
const labelsOf = (spec: { root: unknown }): string[] => ((spec.root as Scene).children as Block[]).map((b) => b.label ?? "");

fixtures.forEach((filename) => {
  test(`answers:false ${filename}: no gate count, no wire values, no output value, every check passes`, async () => {
    const input = loadFixture(filename);
    const spec = expandLogicCircuit({ ...input, answers: false });
    const text = labelsOf(spec).join("\n");
    assert.ok(!/porta|Simplificada|→|Original/.test(text), `${filename}: ${text}`);
    assert.ok(text.includes(`${input.output ?? "S"} = `) || labelsOf(spec).some((t) => t.startsWith(`${input.output ?? "S"} =`)));
    assert.ok(!labelsOf(spec).some((t) => t === `${input.output ?? "S"} = 0` || t === `${input.output ?? "S"} = 1`), "no output value");
    const result = await render(spec, { maxPasses: 3, raster: false });
    for (const check of result.manifest.checks) assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
  });
});

test("answers:false with inputs keeps the input values and hides every other wire and the output", () => {
  const input = loadFixture("nand-simulation.json");
  const off = labelsOf(expandLogicCircuit({ ...input, answers: false }));
  const on = labelsOf(expandLogicCircuit(input));
  assert.ok(on.includes("Y = 0") || on.includes("Y = 1"), "answers:true prints the output value");
  assert.ok(off.includes("Y") && !off.some((t) => /^Y = [01]$/.test(t)), "the output is a bare name");
  const digits = (l: string[]): number => l.filter((t) => t === "0" || t === "1").length;
  // 4 variables: A, B, C, D each carry their given value (a fan-out input may carry it on more than one wire).
  assert.ok(digits(off) >= 4 && digits(off) < digits(on), `${digits(off)} vs ${digits(on)}`);
  assert.ok(off.some((t) => t === "A = 1, B = 1, C = 1, D = 0"), "the givens are listed");
  assert.ok(!off.some((t) => t.includes("→")));
});

test("answers:false with simplify draws the original circuit and hides the simplified expression", async () => {
  const input = loadFixture("majority-simplified.json");
  const off = expandLogicCircuit({ ...input, answers: false });
  const on = expandLogicCircuit(input);
  const orig = expandLogicCircuit({ ...input, simplify: false, answers: false });
  assert.ok(!labelsOf(off).join("\n").includes("Simplificada"));
  assert.ok(labelsOf(on).join("\n").includes("Simplificada"));
  assert.deepEqual(off, orig, "the same drawing as the unsimplified original");
  assert.notDeepEqual(off, on);
});

test("answers:true is the default and unchanged", () => {
  const input = loadFixture("majority-simplified.json");
  assert.deepEqual(expandLogicCircuit({ ...input, answers: true }), expandLogicCircuit(input));
});
