/**
 * logic-circuit -- a gate diagram drawn FROM THE EXPRESSION TREE, in the
 * distinctive-shape (ANSI/IEEE) symbols of Tocci: AND (a D), OR (a shield),
 * NOT (a triangle and a bubble), NAND/NOR (the same with a bubble), XOR/XNOR
 * (an extra curve). See ADR 0057.
 *
 * The expression is parsed by `src/math/boolean.ts` (the same grammar and the
 * same evaluator as `truth-table`), turned into a DAG of gates, and laid out
 * in layers:
 *
 *   - inputs are named lines on the left, in order of first appearance;
 *   - a gate sits in the layer of its deepest input plus one, so the output
 *     is the right-most column and depth reads left to right;
 *   - within a layer the order comes from barycentre sweeps (fewest wire
 *     crossings) and the height from an isotonic fit to the gate's own inputs;
 *   - a wire that must pass over layers gets a dummy slot in each, so it runs
 *     in a lane no gate occupies -- a wire never crosses a gate;
 *   - every wire is horizontal and vertical runs only. Each net (one output
 *     and all it feeds) has its vertical trunk on its own track in the channel
 *     between two layers; tracks are ordered by exhaustive search for the
 *     fewest crossings, with any two wires lying on the same line at the same
 *     place ruled out. A fan-out gets a junction DOT where it splits; two
 *     wires that merely cross get none.
 *
 * Flattening and sharing: a chain of one kind (A·B·C) is one gate of up to
 * four inputs (more are built as a tree), not(and) is a NAND, not(or) a NOR,
 * p → q is ¬p ∨ q, p ↔ q an XNOR, and an identical subexpression is drawn
 * once and fanned out.
 *
 * With `inputs` the circuit is SIMULATED: every net's value is computed from
 * the gates, printed beside the wire, and the output value is printed. The
 * simulation is then checked against `evalBool` on the expression, so the two
 * cannot disagree silently. With `simplify`, the Quine–McCluskey minimal
 * sum of products is what is drawn, and both expressions are in the panel.
 */

import type { FigureSpec, Mark, MarkSegment, Point } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import {
  BoolParseError,
  evalBool,
  formatBool,
  formatSop,
  equivalent,
  parseBool,
  simplify,
  sopToExpr,
  variablesOf,
} from "../../math/boolean.ts";
import type { BoolExpr, Notation } from "../../math/boolean.ts";
import * as v from "../validate.ts";
import { distanceToSegmentXY } from "../../geometry/hit.ts";
import { Board } from "../function-graph/board.ts";
import { wrapText } from "../shared/text.ts";

// ---- input ---------------------------------------------------------------

export type LogicCircuitInput = {
  title?: string;
  /** The expression the circuit computes (`(A and B) or not C`, `A'B + AB'`, `p -> q`). */
  expr: string;
  /** The output's name. Default "S". */
  output?: string;
  /** Draw the Quine–McCluskey minimal sum of products instead, and print both expressions. */
  simplify?: boolean;
  /** Input values to simulate: `{ "A": 1, "B": 0 }`. Every variable of the expression must be given. */
  inputs?: Record<string, 0 | 1 | boolean>;
  /** false: the exercise's figure -- with `simplify` the ORIGINAL circuit only; with `inputs` the values on the input lines but no wire or output value; no gate count, no simplified form. Default true. */
  answers?: boolean;
  /** How the panel writes expressions: "digital" (· + ′, default) or "logic" (∧ ∨ ¬). */
  notation?: Notation;
};

// ---- palette and sizes ------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const ON = "#1D4E89";
const OFF = "#5F6875";
const GATE_FILL = "#FFFFFF";

const M = 28;
const STROKE = 1.8;
const WIRE = 1.7;
const BUBBLE = 4.5;
const DOT = 3.4;
const NOT_W = 36;
const NOT_H = 17;
const INPUT_STUB = 46;
const OUT_STUB = 46;
const CHANNEL_MARGIN = 16;
const TRACK = 12;
const XOR_GAP = 8;
const BACK_BULGE = 10;
const GAP = 16;
const INPUT_SPACING = 56;
const SNAP = 16;

// ---- the circuit graph ---------------------------------------------------------

type GateKind = "not" | "and" | "or" | "xor" | "nand" | "nor" | "xnor";
type Kind = GateKind | "input" | "const" | "out" | "dummy";

type GNode = {
  id: number;
  kind: Kind;
  /** Input name, constant text or output name. */
  name: string;
  /** The nodes whose values this gate combines. */
  ins: GNode[];
  layer: number;
  /** The node in layer − 1 each input wire actually leaves from (the gate itself or a dummy lane). */
  srcs: GNode[];
  succs: GNode[];
  /** Dummies carrying this node's wire across layers, layer + 1 first. */
  chain: GNode[];
  /** For a dummy: the real node whose wire it carries. */
  netOf: GNode | undefined;
  order: number;
  y: number;
  /** y of each input pin, aligned with `srcs`. */
  pinY: number[];
  x0: number;
  value: boolean | undefined;
};

const GATE_KINDS: readonly GateKind[] = ["not", "and", "or", "xor", "nand", "nor", "xnor"];
const isGate = (k: Kind): k is GateKind => (GATE_KINDS as readonly string[]).includes(k);
const isReal = (k: Kind): boolean => k !== "dummy";

const MAX_GATE_INPUTS = 4;

export type Circuit = { nodes: GNode[]; inputs: GNode[]; root: GNode; out: GNode };

const POSITIVE: Record<GateKind, GateKind> = { not: "not", and: "and", or: "or", xor: "xor", nand: "and", nor: "or", xnor: "xor" };

/** The gate graph of `expr`. `order` lists the variables in the order their lines are drawn. */
export function buildCircuit(expr: BoolExpr, order: string[], outputName: string): Circuit {
  const nodes: GNode[] = [];
  const memo = new Map<string, GNode>();
  const make = (kind: Kind, name: string, ins: GNode[]): GNode => {
    const ids = ins.map((n) => n.id);
    const commutative = kind !== "not" && kind !== "input" && kind !== "const";
    const key = kind === "input" || kind === "const" ? `${kind}:${name}` : `${kind}(${(commutative ? [...ids].sort((a, b) => a - b) : ids).join(",")})`;
    const known = memo.get(key);
    if (known !== undefined && kind !== "out") return known;
    const node: GNode = {
      id: nodes.length,
      kind,
      name,
      ins,
      layer: 0,
      srcs: [],
      succs: [],
      chain: [],
      netOf: undefined,
      order: 0,
      y: 0,
      pinY: [],
      x0: 0,
      value: undefined,
    };
    nodes.push(node);
    memo.set(key, node);
    return node;
  };

  const inputs: GNode[] = [];
  for (const name of order) if (variablesOf(expr).includes(name)) inputs.push(make("input", name, []));

  /** Gates of `kind` over `ops`, splitting past four inputs into a tree. */
  const wide = (kind: GateKind, ops: GNode[]): GNode => {
    if (ops.length <= MAX_GATE_INPUTS) return make(kind, "", ops);
    const groups: GNode[] = [];
    for (let i = 0; i < ops.length; i += MAX_GATE_INPUTS) {
      const chunk = ops.slice(i, i + MAX_GATE_INPUTS);
      groups.push(chunk.length === 1 ? chunk[0]! : make(POSITIVE[kind], "", chunk));
    }
    return wide(kind, groups);
  };

  const operands = (e: BoolExpr, op: "and" | "or"): BoolExpr[] =>
    e.kind === "bin" && e.op === op ? [...operands(e.left, op), ...operands(e.right, op)] : [e];

  const build = (e: BoolExpr): GNode => {
    switch (e.kind) {
      case "const":
        return make("const", e.value ? "1" : "0", []);
      case "var":
        return make("input", e.name, []);
      case "not": {
        const a = e.arg;
        if (a.kind === "bin" && (a.op === "and" || a.op === "or")) return wide(a.op === "and" ? "nand" : "nor", operands(a, a.op).map(build));
        if (a.kind === "bin" && a.op === "xor") return make("xnor", "", [build(a.left), build(a.right)]);
        if (a.kind === "bin" && a.op === "iff") return make("xor", "", [build(a.left), build(a.right)]);
        return make("not", "", [build(a)]);
      }
      case "bin":
        switch (e.op) {
          case "and":
          case "or":
            return wide(e.op, operands(e, e.op).map(build));
          case "xor":
            return make("xor", "", [build(e.left), build(e.right)]);
          case "nand":
          case "nor":
            return make(e.op, "", [build(e.left), build(e.right)]);
          case "imp":
            return make("or", "", [make("not", "", [build(e.left)]), build(e.right)]);
          case "iff":
            return make("xnor", "", [build(e.left), build(e.right)]);
        }
    }
  };

  const root = build(expr);
  const out = make("out", outputName, [root]);

  // Layers: an input is 0, a gate is one past its deepest input.
  for (const n of nodes) {
    n.layer = n.ins.length === 0 ? 0 : 1 + Math.max(...n.ins.map((i) => i.layer));
    for (const i of n.ins) if (!i.succs.includes(n)) i.succs.push(n);
  }

  // Dummy lanes for wires that pass over layers.
  const real = [...nodes];
  for (const u of real) {
    if (u.succs.length === 0) continue;
    const far = Math.max(...u.succs.map((s) => s.layer));
    for (let layer = u.layer + 1; layer < far; layer += 1) {
      const prev: GNode = layer === u.layer + 1 ? u : u.chain[layer - u.layer - 2]!;
      const d: GNode = {
        id: nodes.length,
        kind: "dummy",
        name: "",
        ins: [],
        layer,
        srcs: [prev],
        succs: [],
        chain: [],
        netOf: u,
        order: 0,
        y: 0,
        pinY: [],
        x0: 0,
        value: undefined,
      };
      nodes.push(d);
      u.chain.push(d);
    }
  }
  const rep = (u: GNode, layer: number): GNode => (layer === u.layer ? u : u.chain[layer - u.layer - 1]!);
  for (const n of real) n.srcs = n.ins.map((i) => rep(i, n.layer - 1));
  // succs, from here on, are the layer + 1 consumers of each wire's end (the upward barycentre sweep).
  for (const n of nodes) n.succs = [];
  for (const n of nodes) for (const s of n.srcs) if (!s.succs.includes(n)) s.succs.push(n);

  return { nodes, inputs, root, out };
}

/** Evaluate every node from input values; fills `value` and returns the output's. */
export function simulate(circuit: Circuit, values: Record<string, boolean>): boolean {
  for (const n of circuit.nodes) {
    if (n.kind === "dummy") continue;
    const a = n.ins.map((i) => i.value === true);
    switch (n.kind) {
      case "input": {
        const val = values[n.name];
        if (val === undefined) throw new Error(`entrada ${n.name} sem valor`);
        n.value = val;
        break;
      }
      case "const":
        n.value = n.name === "1";
        break;
      case "not":
        n.value = !a[0];
        break;
      case "and":
        n.value = a.every(Boolean);
        break;
      case "or":
        n.value = a.some(Boolean);
        break;
      case "nand":
        n.value = !a.every(Boolean);
        break;
      case "nor":
        n.value = !a.some(Boolean);
        break;
      case "xor":
        n.value = a[0] !== a[1];
        break;
      case "xnor":
        n.value = a[0] === a[1];
        break;
      case "out":
        n.value = a[0];
        break;
    }
  }
  for (const n of circuit.nodes) if (n.kind === "dummy") n.value = n.netOf!.value;
  return circuit.out.value === true;
}

const KIND_NAME: Record<GateKind, string> = { not: "NOT", and: "AND", or: "OR", xor: "XOR", nand: "NAND", nor: "NOR", xnor: "XNOR" };

/** "2 AND, 1 OR, 1 NOT" and the total. */
export function gateCounts(circuit: Circuit): { total: number; text: string } {
  const counts = new Map<GateKind, number>();
  for (const n of circuit.nodes) if (isGate(n.kind)) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const parts = GATE_KINDS.filter((k) => counts.has(k)).map((k) => `${counts.get(k)} ${KIND_NAME[k]}`);
  const total = [...counts.values()].reduce((s, c) => s + c, 0);
  return { total, text: parts.join(", ") };
}

// ---- gate geometry -----------------------------------------------------------------

const PIN_OFFSETS: Record<number, number[]> = { 1: [0], 2: [-12, 12], 3: [-18, 0, 18], 4: [-27, -9, 9, 27] };

const halfHeight = (n: GNode): number => {
  if (n.kind === "not") return NOT_H;
  if (isGate(n.kind)) return { 2: 24, 3: 30, 4: 36 }[n.ins.length] ?? 24;
  if (n.kind === "dummy") return 4;
  return 9;
};

const bodyWidth = (n: GNode): number => (n.kind === "not" ? NOT_W : 40 + halfHeight(n));

const hasBubble = (k: Kind): boolean => k === "not" || k === "nand" || k === "nor" || k === "xnor";

/** Distance from the gate's left edge to where its output wire leaves. */
const gateWidth = (n: GNode): number => bodyWidth(n) + (hasBubble(n.kind) ? 2 * BUBBLE : 0);

const backCurve = (h: number): { radius: number; d: number } => {
  const radius = (h * h + BACK_BULGE * BACK_BULGE) / (2 * BACK_BULGE);
  return { radius, d: radius - BACK_BULGE };
};

/** Where an input wire at height `off` from the gate's centre touches it, relative to x0. */
function pinLocalX(n: GNode, off: number): number {
  if (n.kind === "or" || n.kind === "nor" || n.kind === "xor" || n.kind === "xnor") {
    const { radius, d } = backCurve(halfHeight(n));
    const x = -d + Math.sqrt(radius * radius - off * off);
    return n.kind === "xor" || n.kind === "xnor" ? x - XOR_GAP : x;
  }
  return 0;
}

type Seg = MarkSegment;

function arcSample(from: Point, to: Point, centre: Point): Point[] {
  const a0 = Math.atan2(from.y - centre.y, from.x - centre.x);
  const a1 = Math.atan2(to.y - centre.y, to.x - centre.x);
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const r = Math.hypot(from.x - centre.x, from.y - centre.y);
  const steps = 16;
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const a = a0 + (delta * i) / steps;
    pts.push(i === steps ? to : { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) });
  }
  return pts;
}

function addOutline(board: Board, id: string, from: Point, segs: Seg[], close: boolean, fill: string): void {
  const pts: Point[] = [from];
  let cur = from;
  for (const s of segs) {
    if ("line" in s) {
      const p = s.line as Point;
      pts.push(p);
      cur = p;
    } else {
      pts.push(...arcSample(cur, s.arc as Point, s.centre as Point));
      cur = s.arc as Point;
    }
  }
  board.trace(close ? [...pts, from] : pts, INK, STROKE, id);
  const mark: Mark = { id, from, segments: segs, close, fill, stroke: INK, strokeWidth: STROKE };
  board.marks.push(mark);
}

/** Draw one gate's symbol with its left edge at x0 and centre line at y. */
function drawGate(board: Board, n: GNode): void {
  const x0 = n.x0;
  const y = n.y;
  const h = halfHeight(n);
  const W = bodyWidth(n);
  const P = (dx: number, dy: number): Point => ({ x: x0 + dx, y: y + dy });
  const id = `gate-${n.id}`;
  const positive = POSITIVE[n.kind as GateKind];
  if (positive === "not") {
    addOutline(board, id, P(0, -h), [{ line: P(W, 0) }, { line: P(0, h) }], true, GATE_FILL);
  } else if (positive === "and") {
    addOutline(
      board,
      id,
      P(0, -h),
      [{ line: P(W - h, -h) }, { arc: P(W, 0), centre: P(W - h, 0) }, { arc: P(W - h, h), centre: P(W - h, 0) }, { line: P(0, h) }],
      true,
      GATE_FILL,
    );
  } else {
    const rf = (W * W + h * h) / (2 * h);
    const { radius, d } = backCurve(h);
    void radius;
    addOutline(
      board,
      id,
      P(0, -h),
      [{ arc: P(W, 0), centre: P(0, -h + rf) }, { arc: P(0, h), centre: P(0, h - rf) }, { arc: P(0, -h), centre: P(-d, 0) }],
      true,
      GATE_FILL,
    );
    if (positive === "xor") {
      addOutline(board, `${id}-curve`, P(-XOR_GAP, h), [{ arc: P(-XOR_GAP, -h), centre: P(-XOR_GAP - d, 0) }], false, "none");
    }
  }
  if (hasBubble(n.kind)) {
    board.circle({ x: x0 + W + BUBBLE, y }, BUBBLE, { stroke: INK, width: STROKE, fill: GATE_FILL, id: `${id}-bubble` });
  }
}

// ---- layout ------------------------------------------------------------------

/** Least-squares nondecreasing fit (pool adjacent violators). */
function isotonic(values: number[]): number[] {
  const blocks: { sum: number; n: number }[] = [];
  for (const val of values) {
    blocks.push({ sum: val, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!;
      const a = blocks[blocks.length - 2]!;
      if (a.sum / a.n <= b.sum / b.n) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, n: a.n + b.n });
    }
  }
  return blocks.flatMap((b) => Array.from({ length: b.n }, () => b.sum / b.n));
}

function crossings(layers: GNode[][]): number {
  let total = 0;
  for (let l = 1; l < layers.length; l += 1) {
    const edges: [number, number][] = [];
    for (const n of layers[l]!) for (const s of n.srcs) edges.push([s.order, n.order]);
    for (let i = 0; i < edges.length; i += 1) {
      for (let j = i + 1; j < edges.length; j += 1) {
        const a = edges[i]!;
        const b = edges[j]!;
        if ((a[0] - b[0]) * (a[1] - b[1]) < 0) total += 1;
      }
    }
  }
  return total;
}

function reindex(layer: GNode[]): void {
  layer.forEach((n, i) => {
    n.order = i;
  });
}

function orderLayers(layers: GNode[][]): void {
  layers.forEach(reindex);
  const snapshot = (): GNode[][] => layers.map((l) => [...l]);
  let best = snapshot();
  let bestCost = crossings(layers);
  const sortBy = (layer: GNode[], score: (n: GNode) => number): void => {
    const keyed = layer.map((n) => ({ n, s: score(n), o: n.order }));
    keyed.sort((a, b) => a.s - b.s || a.o - b.o);
    keyed.forEach((k, i) => {
      layer[i] = k.n;
    });
    reindex(layer);
  };
  const mean = (xs: number[], fallback: number): number => (xs.length === 0 ? fallback : xs.reduce((s, x) => s + x, 0) / xs.length);
  for (let sweep = 0; sweep < 8; sweep += 1) {
    for (let l = 1; l < layers.length; l += 1) sortBy(layers[l]!, (n) => mean(n.srcs.map((s) => s.order), n.order));
    for (let l = layers.length - 2; l >= 1; l -= 1) sortBy(layers[l]!, (n) => mean(n.succs.map((s) => s.order), n.order));
    const cost = crossings(layers);
    if (cost < bestCost) {
      bestCost = cost;
      best = snapshot();
    }
  }
  best.forEach((l, i) => {
    layers[i] = l;
    reindex(l);
  });
}

/** A gate's input pins, top to bottom, meet the sources that are top to bottom. */
function setPins(n: GNode): void {
  if (n.srcs.length === 0) return;
  if (!isGate(n.kind)) {
    n.pinY = n.srcs.map(() => n.y);
    return;
  }
  const offs = PIN_OFFSETS[n.srcs.length]!;
  const idx = n.srcs.map((_s, i) => i).sort((a, b) => n.srcs[a]!.y - n.srcs[b]!.y || a - b);
  n.pinY = [];
  idx.forEach((si, k) => {
    n.pinY[si] = n.y + offs[k]!;
  });
}

/** Where a node's own inputs say it should be: every pin level with its source. */
function wantedFromSources(n: GNode): number {
  if (!isGate(n.kind)) return n.srcs.reduce((s, x) => s + x.y, 0) / n.srcs.length;
  const offs = PIN_OFFSETS[n.srcs.length]!;
  const sorted = [...n.srcs].map((s, i) => ({ s, i })).sort((a, b) => a.s.y - b.s.y || a.i - b.i);
  const level = sorted.map((e, k) => e.s.y - offs[k]!);
  const mean = level.reduce((a, b) => a + b, 0) / level.length;
  // A jog of a few pixels reads as a mistake, a jog of a third of the gate as a bend:
  // when one pin can be made dead straight for a small move, do that.
  let snap = mean;
  let least = SNAP;
  for (const at of level) {
    if (Math.abs(at - mean) < least) {
      least = Math.abs(at - mean);
      snap = at;
    }
  }
  return snap;
}

/** Where a node's consumers say it should be: its wire level with each pin it feeds. */
function wantedFromConsumers(n: GNode): number | undefined {
  const wants: number[] = [];
  for (const w of n.succs) w.srcs.forEach((s, k) => s === n && wants.push(w.pinY[k]!));
  return wants.length === 0 ? undefined : wants.reduce((a, b) => a + b, 0) / wants.length;
}

function placeLayer(layer: GNode[], desired: number[], gap: number): void {
  const offsets: number[] = [0];
  for (let i = 1; i < layer.length; i += 1) offsets.push(offsets[i - 1]! + halfHeight(layer[i - 1]!) + halfHeight(layer[i]!) + gap);
  const fit = isotonic(desired.map((d, i) => d - offsets[i]!));
  layer.forEach((n, i) => {
    n.y = fit[i]! + offsets[i]!;
  });
}

function assignY(layers: GNode[][]): void {
  layers[0]!.forEach((n, i) => {
    n.y = i * INPUT_SPACING;
  });
  const forward = (): void => {
    for (let l = 1; l < layers.length; l += 1) {
      const layer = layers[l]!;
      placeLayer(layer, layer.map(wantedFromSources), GAP);
      layer.forEach(setPins);
    }
  };
  forward();
  // Alternate: consumers pull a layer toward the pins they read, then sources pull back.
  for (let round = 0; round < 6; round += 1) {
    for (let l = layers.length - 2; l >= 0; l -= 1) {
      const layer = layers[l]!;
      placeLayer(layer, layer.map((n) => wantedFromConsumers(n) ?? n.y), l === 0 ? 26 : GAP);
      // consumers' pins were computed against the old y; recompute for the layer above
      layers[l + 1]!.forEach(setPins);
    }
    forward();
  }
}

type Target = { node: GNode; pin: number; /** where the wire runs (level with its source when nearly so) */ ty: number; /** where the pin is */ py: number };
type Net = { src: GNode; targets: Target[]; trunk: boolean; lo: number; hi: number; rank: number };

/** A run this close to level is drawn level: a jog of a pixel is a mistake, not a bend. */
const STRAIGHT = 3.5;
const same = (a: number, b: number): boolean => Math.abs(a - b) < STRAIGHT;
/** Two parallel runs closer than this read as one wire. */
const NEAR = 9;

/**
 * The cost of a left-to-right order of trunks: crossings (a plain crossing is
 * legal, so it costs one), and heavily any two different wires lying on, or
 * within `NEAR` of, the same horizontal line over the same stretch. A net
 * with no trunk is one straight run across the whole channel.
 */
function orderCost(nets: Net[]): number {
  let cost = 0;
  for (const i of nets) {
    for (const j of nets) {
      if (i === j) continue;
      if (i.trunk) {
        const inSpan = (y: number): boolean => y > i.lo + 0.5 && y < i.hi - 0.5;
        if ((!j.trunk || i.rank < j.rank) && inSpan(j.src.y)) cost += 1;
        if (j.trunk && i.rank > j.rank) for (const t of j.targets) if (inSpan(t.ty)) cost += 1;
      }
      // i's horizontal into a pin against j's horizontal out of its source
      for (const t of i.targets) {
        if (Math.abs(t.ty - j.src.y) < NEAR && (!i.trunk || !j.trunk || i.rank <= j.rank)) cost += 100;
      }
    }
  }
  return cost;
}

/** The nets of every channel (layer c to c + 1), trunks ranked. */
function buildNets(layers: GNode[][]): Net[][] {
  const out: Net[][] = [];
  for (let c = 0; c < layers.length - 1; c += 1) {
    const nets: Net[] = [];
    for (const u of layers[c]!) {
      const targets: Target[] = [];
      for (const w of layers[c + 1]!) w.srcs.forEach((s, k) => s === u && targets.push({ node: w, pin: k, ty: same(w.pinY[k]!, u.y) ? u.y : w.pinY[k]!, py: w.pinY[k]! }));
      if (targets.length === 0) continue;
      const ys = [u.y, ...targets.map((t) => t.ty)];
      const trunk = targets.some((t) => !same(t.ty, u.y));
      nets.push({ src: u, targets, trunk, lo: Math.min(...ys), hi: Math.max(...ys), rank: 0 });
    }
    rankNets(nets);
    out.push(nets);
  }
  return out;
}

/** A wire into a pin that shares a stretch of horizontal with another wire out of its source, however the trunks are ordered. */
function firstViolation(all: Net[][]): { source: GNode; pinY: number } | undefined {
  for (const nets of all) {
    for (const i of nets) {
      for (const j of nets) {
        if (i === j) continue;
        for (const t of i.targets) {
          if (Math.abs(t.ty - j.src.y) < NEAR && (!i.trunk || !j.trunk || i.rank <= j.rank)) return { source: j.src, pinY: t.ty };
        }
      }
    }
  }
  return undefined;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) out.push([item, ...rest]);
  });
  return out;
}

function rankNets(nets: Net[]): void {
  const trunks = nets.filter((n) => n.trunk).sort((a, b) => a.src.y - b.src.y);
  trunks.forEach((n, i) => {
    n.rank = i;
  });
  if (trunks.length <= 1) return;
  const evaluated = trunks.length <= 7 ? permutations(trunks) : [trunks];
  let best = Infinity;
  let bestOrder = trunks;
  for (const order of evaluated) {
    order.forEach((n, i) => {
      n.rank = i;
    });
    const c = orderCost(nets);
    if (c < best) {
      best = c;
      bestOrder = order;
    }
  }
  bestOrder.forEach((n, i) => {
    n.rank = i;
  });
}

// ---- wires ---------------------------------------------------------------------

type Pt = { x: number; y: number };
const r2 = (n: number): number => Math.round(n * 100) / 100;
const keyOf = (p: Pt): string => `${r2(p.x)},${r2(p.y)}`;

type Chain = { id: string; pts: Pt[] };

/** Split a net's straight runs at every point that lands on them, and cut the tree into polylines. */
function decompose(netId: number, segs: [Pt, Pt][], start: Pt): { chains: Chain[]; dots: Pt[] } {
  const pts = new Map<string, Pt>();
  const add = (p: Pt): void => {
    pts.set(keyOf(p), { x: r2(p.x), y: r2(p.y) });
  };
  for (const [a, b] of segs) {
    add(a);
    add(b);
  }
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const [a0, b0] of segs) {
    const a = { x: r2(a0.x), y: r2(a0.y) };
    const b = { x: r2(b0.x), y: r2(b0.y) };
    const on = [...pts.values()].filter((p) => {
      if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
      if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
      return false;
    });
    if (a.y === b.y) on.sort((p, q) => p.x - q.x);
    else on.sort((p, q) => p.y - q.y);
    for (let i = 1; i < on.length; i += 1) link(keyOf(on[i - 1]!), keyOf(on[i]!));
  }
  const seen = new Set<string>();
  const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const chains: Chain[] = [];
  const walk = (from: string, to: string): void => {
    const path = [from, to];
    seen.add(edgeKey(from, to));
    let prev = from;
    let cur = to;
    while (adj.get(cur)!.size === 2) {
      const next = [...adj.get(cur)!].find((k) => k !== prev)!;
      if (seen.has(edgeKey(cur, next))) break;
      seen.add(edgeKey(cur, next));
      path.push(next);
      prev = cur;
      cur = next;
    }
    // drop collinear middle points
    const P = path.map((k) => pts.get(k)!);
    const slim = P.filter((p, i) => {
      if (i === 0 || i === P.length - 1) return true;
      const a = P[i - 1]!;
      const b = P[i + 1]!;
      return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
    });
    chains.push({ id: `wire-${netId}-${chains.length}`, pts: slim });
  };
  const startKey = keyOf(start);
  for (const nb of adj.get(startKey) ?? []) if (!seen.has(edgeKey(startKey, nb))) walk(startKey, nb);
  for (const [k, ns] of adj) {
    if (ns.size < 3) continue;
    for (const nb of ns) if (!seen.has(edgeKey(k, nb))) walk(k, nb);
  }
  const dots = [...adj].filter(([, ns]) => ns.size >= 3).map(([k]) => pts.get(k)!);
  return { chains, dots };
}

// ---- label placement ------------------------------------------------------------------

/** Distance from a point to each owner's ink, the least per owner. */
function nearestByOwner(board: Board, px: number, py: number): Map<string, number> {
  const best = new Map<string, number>();
  for (const s of board.ink) {
    if (s.owner === undefined) continue;
    const d = distanceToSegmentXY(px, py, s.ax, s.ay, s.bx, s.by);
    if (d < (best.get(s.owner) ?? Infinity)) best.set(s.owner, d);
  }
  return best;
}

/**
 * Put a small label beside a net's wire, off it: above (or below) a horizontal
 * run, right (or left) of a vertical one, at the first spot that is clear of
 * ink and of other labels AND where that run is the nearest ink -- the
 * label's `annotates` is the mark it sits beside.
 */
function placeBeside(board: Board, text: string, chains: Chain[], opts: { size: number; weight: number; colour: string; minRun?: number }): boolean {
  const { w, h } = board.extent(text, { size: opts.size });
  const gap = 3.5;
  const minRun = opts.minRun ?? Math.max(w + 6, 24);
  const tries: { cx: number; cy: number; id: string }[] = [];
  for (const chain of chains) {
    for (let i = 1; i < chain.pts.length; i += 1) {
      const a = chain.pts[i - 1]!;
      const b = chain.pts[i]!;
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (len < minRun) continue;
      const horizontal = a.y === b.y;
      for (const t of [0.5, 0.35, 0.65, 0.25, 0.75]) {
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        const sides = horizontal ? [-1, 1] : [1, -1];
        for (const side of sides) {
          if (horizontal) tries.push({ cx: px, cy: py + side * (h / 2 + gap), id: chain.id });
          else tries.push({ cx: px + side * (w / 2 + gap), cy: py, id: chain.id });
        }
      }
    }
  }
  let fallback: { cx: number; cy: number; id: string; n: number } | undefined;
  for (const c of tries) {
    const box = board.box(c.cx, c.cy, w, h);
    if (c.cx - box.hw < 6 || c.cy - box.hh < 6 || c.cx + box.hw > board.W - 6 || c.cy + box.hh > board.H - 6) continue;
    const near = nearestByOwner(board, c.cx, c.cy);
    const own = near.get(c.id) ?? Infinity;
    const rivals = [...near].filter(([id, d]) => id !== c.id && d <= own + 0.5).length;
    const inks = board.inkThrough(box, 1);
    const boxes = board.taken.filter((t) => board.hits(box, t, 1)).length;
    if (inks === 0 && boxes === 0 && rivals === 0) {
      board.label(text, c.cx, c.cy, { size: opts.size, weight: opts.weight, colour: opts.colour, annotates: c.id, width: w });
      return true;
    }
    const n = inks * 3 + boxes * 3 + rivals * 2;
    if (fallback === undefined || n < fallback.n) fallback = { ...c, n };
  }
  if (fallback !== undefined) {
    board.label(text, fallback.cx, fallback.cy, { size: opts.size, weight: opts.weight, colour: opts.colour, annotates: fallback.id, width: w });
    return true;
  }
  return false;
}

// ---- the build ---------------------------------------------------------------

function parseOrThrow(source: string, path: string): BoolExpr {
  try {
    return parseBool(source);
  } catch (error) {
    if (error instanceof BoolParseError) throw new SpecError(`${path}: ${error.message}\n${error.excerpt()}`);
    throw error;
  }
}

export function expandLogicCircuit(input: LogicCircuitInput): FigureSpec {
  const notation: Notation = input.notation ?? "digital";
  const outName = input.output ?? "S";
  const answers = input.answers !== false;
  const original = parseOrThrow(input.expr, "logic-circuit.expr");
  const originalVars = variablesOf(original);

  // What is drawn: the expression itself, or its minimal sum of products.
  let drawn = original;
  let minimal: { text: string; expr: BoolExpr } | undefined;
  if (input.simplify === true) {
    const min = simplify(original, originalVars);
    const back = sopToExpr(min);
    if (!equivalent(original, back)) throw new Error("logic-circuit: the simplified expression disagrees with the original");
    if (answers) drawn = back;
    minimal = { text: formatSop(min, notation), expr: back };
  }

  const circuit = buildCircuit(drawn, originalVars, outName);
  const { nodes, out } = circuit;

  // Simulation.
  let outputValue: boolean | undefined;
  let valuesText: string | undefined;
  if (input.inputs !== undefined) {
    const env: Record<string, boolean> = {};
    for (const [name, raw] of Object.entries(input.inputs)) env[name] = raw === 1 || raw === true;
    for (const name of originalVars) {
      if (env[name] === undefined) throw new SpecError(`logic-circuit.inputs: no value for ${name}; give every variable of the expression (${originalVars.join(", ")}).`);
    }
    outputValue = simulate(circuit, env);
    if (outputValue !== evalBool(original, env)) throw new Error("logic-circuit: the simulated output disagrees with evalBool");
    valuesText = `${originalVars.map((n) => `${n} = ${env[n] ? 1 : 0}`).join(", ")}  →  ${outName} = ${outputValue ? 1 : 0}`;
  }
  const simulated = outputValue !== undefined && answers;
  const givenInputs = outputValue !== undefined;

  // ---- layout ---------------------------------------------------------------
  const probe = new Board(10, 10, PAPER);
  const maxLayer = out.layer;
  const layers: GNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  const inputNodes = nodes.filter((n) => n.kind === "input" || n.kind === "const");
  // inputs in the variables' order, constants after
  inputNodes.sort((a, b) => {
    const ia = a.kind === "input" ? originalVars.indexOf(a.name) : 1000 + a.id;
    const ib = b.kind === "input" ? originalVars.indexOf(b.name) : 1000 + b.id;
    return ia - ib;
  });
  layers[0] = inputNodes;
  for (const n of nodes) if (n.layer > 0) layers[n.layer]!.push(n);
  orderLayers(layers);
  assignY(layers);

  // ---- vertical placement -------------------------------------------------------------
  const normalise = (): void => {
    const top = Math.min(...nodes.map((n) => n.y - (n.kind === "dummy" ? 0 : halfHeight(n))));
    const dy = M + 6 - top;
    for (const n of nodes) {
      n.y += dy;
      n.pinY = n.pinY.map((p) => p + dy);
    }
  };
  normalise();

  // Channels: which nets need a vertical trunk, and in what order. Two different
  // wires that end up on one line over the same stretch (a source level with a
  // pin it does not feed) cannot be told apart, and no order of trunks cures a
  // pair that swap places -- so the source is moved clear of the pin.
  let channelNets = buildNets(layers);
  for (let pass = 0; pass < 16; pass += 1) {
    const clash = firstViolation(channelNets);
    if (clash === undefined) break;
    const source = clash.source;
    const layer = layers[source.layer]!;
    const gap = clash.pinY - source.y;
    const dir = gap > 0 ? -1 : 1;
    const amount = NEAR + 3 - Math.abs(gap);
    for (const n of layer) if (dir > 0 ? n.order >= source.order : n.order <= source.order) n.y += dir * amount;
    for (const l of [source.layer, source.layer + 1]) layers[l]?.forEach(setPins);
    channelNets = buildNets(layers);
  }
  normalise();
  channelNets = buildNets(layers);
  const circuitBottom = Math.max(...nodes.map((n) => n.y + (n.kind === "dummy" ? 0 : halfHeight(n))));
  const chanWidth = channelNets.map((nets) => {
    const n = nets.filter((x) => x.trunk).length;
    return 2 * CHANNEL_MARGIN + TRACK * Math.max(0, n - 1) + (n === 0 ? 12 : 0);
  });

  // x positions.
  const inputLabelW = Math.max(...inputNodes.map((n) => probe.extent(n.name, { size: 15, weight: 700 }).w));
  const xIn = M + inputLabelW + 10;
  const right: number[] = [xIn + INPUT_STUB];
  const left: number[] = [xIn];
  for (let l = 1; l <= maxLayer; l += 1) {
    left[l] = right[l - 1]! + chanWidth[l - 1]!;
    const widths = layers[l]!.filter((n) => isGate(n.kind)).map(gateWidth);
    if (l === maxLayer) right[l] = left[l]! + OUT_STUB;
    else right[l] = left[l]! + 8 + Math.max(0, ...widths);
    for (const n of layers[l]!) n.x0 = left[l]! + 8;
  }

  // ---- wires, as segments per net --------------------------------------------------
  const netOf = (n: GNode): GNode => (n.kind === "out" ? n.ins[0]! : n.netOf ?? n);
  const segs = new Map<number, [Pt, Pt][]>();
  const push = (n: GNode, a: Pt, b: Pt): void => {
    const root = netOf(n).id;
    if (!segs.has(root)) segs.set(root, []);
    segs.get(root)!.push([a, b]);
  };
  const outX = (n: GNode, layer: number): number => {
    if (n.kind === "input" || n.kind === "const") return right[0]!;
    if (n.kind === "dummy") return right[layer]!;
    return n.x0 + gateWidth(n);
  };
  for (const n of nodes) {
    if (n.kind === "input" || n.kind === "const") push(n, { x: xIn, y: n.y }, { x: right[0]!, y: n.y });
    if (n.kind === "dummy") push(n, { x: left[n.layer]!, y: n.y }, { x: right[n.layer]!, y: n.y });
    if (n.kind === "out") push(n, { x: left[n.layer]!, y: n.y }, { x: right[n.layer]!, y: n.y });
  }
  channelNets.forEach((nets, c) => {
    const chanLeft = right[c]!;
    for (const net of nets) {
      const u = net.src;
      const ox = outX(u, c);
      const ys = u.y;
      const pinX = (t: Target): number => (isGate(t.node.kind) ? t.node.x0 + pinLocalX(t.node, t.ty - t.node.y) : left[c + 1]!);
      if (!net.trunk) {
        for (const t of net.targets) push(u, { x: ox, y: ys }, { x: pinX(t), y: t.ty });
        continue;
      }
      const tx = chanLeft + CHANNEL_MARGIN + TRACK * net.rank;
      push(u, { x: ox, y: ys }, { x: tx, y: ys });
      push(u, { x: tx, y: net.lo }, { x: tx, y: net.hi });
      for (const t of net.targets) push(u, { x: tx, y: t.ty }, { x: pinX(t), y: t.ty });
    }
  });

  // ---- text sizes for the panel, then the canvas -------------------------------------------
  const panel: { text: string; weight: number; colour: string }[] = [];
  const say = (text: string, weight = 500, colour: string = INK): void => {
    panel.push({ text, weight, colour });
  };
  const originalCircuit = input.simplify === true && answers ? buildCircuit(original, originalVars, outName) : circuit;
  const origCount = gateCounts(originalCircuit);
  const portas = (c: { total: number; text: string }): string => `${c.total} ${c.total === 1 ? "porta" : "portas"}${c.text === "" ? "" : `: ${c.text}`}`;
  say(`${outName} = ${formatBool(original, notation)}`, 700);
  if (!answers) {
    if (givenInputs) say(originalVars.map((n) => `${n} = ${input.inputs![n] === 1 || input.inputs![n] === true ? 1 : 0}`).join(", "), 500, INK);
  } else if (minimal !== undefined) {
    const mc = gateCounts(circuit);
    say(`Simplificada (Quine–McCluskey): ${outName} = ${minimal.text}`, 700, ON);
    say(`Original: ${portas(origCount)}. Simplificada: ${portas(mc)}.`, 500, SOFT);
  } else {
    say(portas(origCount), 500, SOFT);
  }
  if (valuesText !== undefined && answers) say(valuesText, 700, ON);

  const circuitRight = right[maxLayer]! + 10 + probe.extent(simulated ? `${outName} = 1` : outName, { size: 16, weight: 700 }).w;
  const panelMax = Math.max(circuitRight - M, 520);
  const panelLines = panel.flatMap((p) => wrapText(p.text, panelMax, (t) => probe.measure(t, 14)).map((text) => ({ ...p, text })));
  const panelW = Math.max(...panelLines.map((l) => probe.measure(l.text, 14)));
  const width = Math.ceil(Math.max(circuitRight, M + panelW) + M);
  const PANEL_LINE = 26;
  const panelTop = circuitBottom + 34;
  const height = Math.ceil(panelTop + panelLines.length * PANEL_LINE + M - 4);
  const board = new Board(width, height, PAPER);

  // ---- draw ---------------------------------------------------------------------------
  for (const n of nodes) if (isGate(n.kind)) drawGate(board, n);

  type NetInk = { root: GNode; chains: Chain[]; dots: Pt[] };
  const nets: NetInk[] = [];
  for (const root of nodes) {
    if (root.kind === "dummy" || root.kind === "out" || !segs.has(root.id)) continue;
    const d = decompose(root.id, segs.get(root.id)!, root.kind === "input" || root.kind === "const" ? { x: xIn, y: root.y } : { x: outX(root, root.layer), y: root.y });
    nets.push({ root, chains: d.chains, dots: d.dots });
  }
  const colourOf = (n: GNode): string => (simulated ? (n.value ? ON : OFF) : INK);
  for (const net of nets) {
    const stroke = colourOf(net.root);
    for (const chain of net.chains) board.poly(chain.pts, { stroke, width: WIRE, id: chain.id });
  }
  for (const net of nets) {
    const stroke = colourOf(net.root);
    net.dots.forEach((p, i) => board.circle(p, DOT, { stroke: "none", width: 0, fill: stroke, id: `dot-${net.root.id}-${i}` }));
  }

  // Names first (they claim their room), then the values.
  const chainAtStart = (net: NetInk, p: Pt): Chain => net.chains.find((c) => c.pts.some((q) => q.x === r2(p.x) && q.y === r2(p.y))) ?? net.chains[0]!;
  for (const net of nets) {
    const n = net.root;
    if (n.kind === "input" || n.kind === "const") {
      const label = board.extent(n.name, { size: 15, weight: 700 });
      const chain = chainAtStart(net, { x: xIn, y: n.y });
      board.label(n.name, xIn - 8 - label.w / 2, n.y, {
        size: 15,
        weight: 700,
        serif: n.kind === "input",
        colour: INK,
        annotates: chain.id,
        width: label.w,
      });
    }
  }
  {
    const net = nets.find((x) => x.root === circuit.root)!;
    const text = simulated ? `${outName} = ${outputValue ? 1 : 0}` : outName;
    const label = board.extent(text, { size: 16, weight: 700 });
    const chain = chainAtStart(net, { x: right[maxLayer]!, y: out.y });
    board.label(text, right[maxLayer]! + 8 + label.w / 2, out.y, {
      size: 16,
      weight: 700,
      colour: simulated ? colourOf(circuit.root) : INK,
      annotates: chain.id,
      width: label.w,
    });
  }
  if (givenInputs) {
    for (const net of nets) {
      if (!answers && net.root.kind !== "input") continue;
      if (net.root.kind === "const" || (net.root === circuit.root && isGate(net.root.kind))) continue;
      placeBeside(board, net.root.value ? "1" : "0", net.chains, { size: 11, weight: 700, colour: colourOf(net.root) });
    }
  }

  // Panel.
  panelLines.forEach((l, i) => {
    board.label(l.text, M + panelW / 2, panelTop + i * PANEL_LINE + PANEL_LINE / 2, {
      freeStanding: true,
      size: 14,
      weight: l.weight,
      colour: l.colour,
      align: "start",
      width: panelW,
      id: `panel-${i}`,
    });
  });

  return parseSpec(board.spec(input.title ?? `circuito lógico: ${outName} = ${formatBool(original, notation)}`));
}

// ---- validation ---------------------------------------------------------------

export function validateLogicCircuitInput(raw: Record<string, unknown>): void {
  const path = "logic-circuit";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "notation", path, ["logic", "digital"] as const);
  v.optionalBoolean(raw, "simplify", path);
  const output = v.optionalString(raw, "output", path);
  if (output !== undefined && (output.trim() === "" || output.length > 8)) throw new SpecError(`${path}.output must be a short name (1 to 8 characters), got ${JSON.stringify(output)}`);
  const source = v.requiredString(raw, "expr", path);
  const e = parseOrThrow(source, `${path}.expr`);
  const vars = variablesOf(e);
  if (raw.inputs !== undefined) {
    const inputs = v.object(raw.inputs, `${path}.inputs`);
    for (const [name, value] of Object.entries(inputs)) {
      if (!vars.includes(name)) throw new SpecError(`${path}.inputs.${name} is not a variable of the expression (${vars.join(", ")}).`);
      if (!(value === 0 || value === 1 || value === true || value === false)) {
        throw new SpecError(`${path}.inputs.${name} must be 0, 1, true or false, got ${JSON.stringify(value)}`);
      }
    }
    for (const name of vars) if (!(name in inputs)) throw new SpecError(`${path}.inputs: no value for ${name}; give every variable (${vars.join(", ")}).`);
  }
  expandLogicCircuit(raw as unknown as LogicCircuitInput);
}
