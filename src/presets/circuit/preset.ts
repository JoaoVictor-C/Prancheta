/**
 * circuit -- DC circuit diagrams for Física 3 / Circuitos (Halliday, Ramalho):
 * "calcule a corrente em cada resistor", "qual a ddp entre A e B", Kirchhoff,
 * series and parallel, the Wheatstone bridge.
 *
 * The LAYOUT IS GIVEN, not computed (ADR 0053; circuit auto-layout from a
 * netlist is out of scope, docs/PLAN-COVERAGE.md "Not building"): every node
 * has grid coordinates, and every component -- wires included -- runs
 * between two nodes on a horizontal or vertical straight run, or on an L
 * through a stated `via` corner. A layout that would mislead a reader is
 * refused rather than drawn: a run through a node it does not connect to,
 * two runs that overlap, and two runs that cross where there is no node
 * (a crossing is how a reader misreads a connection, dot or no dot).
 *
 * The ELECTRICAL values are all DERIVED. The input states resistances,
 * EMFs and source currents; every current, every potential difference,
 * every meter reading and every power printed comes from Modified Nodal
 * Analysis (`mna.ts`), which also refuses, by name, the netlists that have
 * no answer (a shorted source, a loop of sources, a floating subcircuit, a
 * current source in series with an open circuit).
 *
 * What is drawn:
 *
 *  - conventional symbols (`symbols.ts`), each component's value beside it
 *    ("10 Ω", "12 V"), preferring the outside of the circuit;
 *  - one arrowhead per distinct branch current, on a wire of that branch
 *    when one is long enough (else on a component's lead), pointing the way
 *    conventional current actually flows, labelled "i₁ = 0,5 A" -- exact
 *    when the value snaps (2/3 A), "≈" and three significant figures when
 *    it does not. Components in series share a branch and one number;
 *  - junction dots only where three or more runs meet at a node;
 *  - node names for nodes named by a capital letter (A, B, C′);
 *  - a panel of the potential differences asked for ("U_AB = V_A − V_B =
 *    6 V", subscripts set small and low), node potentials and powers.
 *
 * Drawing order: wires and symbols, current arrowheads, labels (each
 * anchored to what it names, ADR 0035), junction dots last.
 */

import type { FigureSpec, Mark, MarkSegment, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES, formatNumber, snapExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { MARGIN as PLACE_MARGIN, Placer, aroundPoint, rectAt } from "../construction/place.ts";
import { CircuitError, solveMna } from "./mna.ts";
import type { MnaElement, MnaKind, MnaSolution } from "./mna.ts";
import { TERMINAL_R, halfLength, halfWidth, samplePath, switchTerminals, symbolPaths } from "./symbols.ts";
import type { Op, SymbolKind } from "./symbols.ts";

// ---- input ------------------------------------------------------------------------

export const KINDS = ["resistor", "lamp", "battery", "voltage-source", "current-source", "wire", "switch", "ammeter", "voltmeter"] as const;
export type ComponentKind = (typeof KINDS)[number];

export type CircuitComponent = {
  /** Required for every kind but `wire`. */
  id?: string;
  kind: ComponentKind;
  from: string;
  to: string;
  /** The corner of an L-shaped run, in grid coordinates. */
  via?: [number, number];
  /** Ω for resistor and lamp, V for battery and voltage-source (+ at `to`), A for current-source (flowing from `from` to `to` through it). */
  value?: number;
  /** A switch only. Default false (open). */
  closed?: boolean;
};

export type CircuitShow = {
  /** Branch currents on the drawing. Default true. */
  currents?: boolean;
  /** Potential differences to print, [A, B] → U_AB = V_A − V_B. */
  voltages?: [string, string][];
  /** Print the potential of every named node, and draw the ground. */
  nodeVoltages?: boolean;
  /** Print the power of each component. */
  power?: boolean;
  /** Put the component's name before its value: "R₁ = 10 Ω". Default false. */
  names?: boolean;
  /** Which node names to print: capital letters (default), all, none, or a list. */
  nodeNames?: "letters" | "all" | "none" | string[];
  /** Where current VALUES go: beside the arrows, in the panel, or "auto" (default): beside them unless the circuit is too crowded. */
  currentValues?: "auto" | "drawing" | "panel";
};

export type CircuitInput = {
  /** Grid coordinates, y upward. */
  nodes: Record<string, [number, number]>;
  components: CircuitComponent[];
  /** The reference node. Default: the − terminal of the first battery or voltage source. Drawn when given. */
  ground?: string;
  show?: CircuitShow;
  /** "zigzag" (default, the Brazilian textbook resistor) or "iec" (a rectangle). */
  symbols?: "zigzag" | "iec";
  title?: string;
  locale?: Locale;
  /** false: draw what the exercise gives, none of what it asks (no arrows, readings, U, V or P). Default true. */
  answers?: boolean;
};

// ---- palette and geometry ------------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const CURRENT = "#A63A0B"; // rust -- a derived current: its arrowhead and its label
const MARGIN_X = 120;
const MARGIN_Y = 72;
const PLOT_TARGET_PX = 440;
const MIN_UNIT = 70;
const MAX_UNIT = 120;
const MIN_LEAD = 10;
const ARROW_HALF = 5.5;
const ARROW_WIDTH = 4.5;
const DOT_R = 3.6;
const LABEL_SIZE = 13;
const PANEL_SIZE = 13;
const SUB_SIZE = 9.5;
const PANEL_LINE_H = 24;

// ---- numbers -------------------------------------------------------------------------

/** "0,5", "11,52", "2/3" -- exact when it is a short decimal or snaps to a small fraction; otherwise three significant figures and flagged. */
export function quantity(value: number, locale: Locale): { rel: "=" | "≈"; text: string } {
  const short = Number(value.toFixed(3));
  if (Math.abs(short - value) <= 1e-9 * Math.max(1, Math.abs(value))) return { rel: "=", text: formatNumber(short, locale) };
  const e = snapExact(value, 1e-9);
  if (e.exact && e.form === "rational") return { rel: "=", text: formatNumber(e.value, locale) };
  const mag = Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.max(0, 2 - mag);
  return { rel: "≈", text: formatNumber(Number(value.toFixed(decimals)), locale, { decimals }) };
}

/** A value with its unit: "0,5 A", "0" for zero. */
export function withUnit(value: number, unit: string, locale: Locale): { rel: "=" | "≈"; text: string } {
  const q = quantity(value, locale);
  return q.text === "0" ? q : { rel: q.rel, text: `${q.text} ${unit}` };
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
/** "R1" → "R₁", "E12" → "E₁₂": trailing digits set as subscripts. */
export function displayName(id: string): string {
  const m = /^(.*?)(\d+)$/.exec(id);
  if (m === null || m[1] === "") return id;
  return m[1] + [...m[2]!].map((ch) => SUBSCRIPT_DIGITS[Number(ch)]).join("");
}

/** i₁, i₂, … -- or plain "i" when there is only one current. */
export function currentName(k: number, total: number): string {
  return total === 1 ? "i" : `i${[...String(k)].map((ch) => SUBSCRIPT_DIGITS[Number(ch)]).join("")}`;
}

// ---- the netlist ------------------------------------------------------------------------

export function mnaKindOf(c: CircuitComponent): MnaKind | null {
  switch (c.kind) {
    case "resistor":
    case "lamp":
      return "R";
    case "battery":
    case "voltage-source":
      return "V";
    case "current-source":
      return "I";
    case "ammeter":
      return "A";
    case "wire":
      return "W";
    case "switch":
      return c.closed === true ? "W" : null;
    case "voltmeter":
      return null;
  }
}

type Comp = CircuitComponent & { id: string; index: number };

function normalise(input: CircuitInput): Comp[] {
  let w = 0;
  return input.components.map((c, index) => ({ ...c, id: c.id ?? `w${(w += 1)}`, index }));
}

/** Solve the circuit. Exported so a test can read the numbers without drawing. */
export function solveCircuit(input: CircuitInput): MnaSolution {
  const comps = normalise(input);
  const elements: MnaElement[] = [];
  for (const c of comps) {
    const kind = mnaKindOf(c);
    if (kind === null) continue;
    elements.push({ id: c.id, kind, a: c.from, b: c.to, value: c.value ?? 0 });
  }
  try {
    return solveMna({ nodes: Object.keys(input.nodes), elements, ...(input.ground === undefined ? {} : { ground: input.ground }) });
  } catch (e) {
    if (e instanceof CircuitError) throw new SpecError(`circuit: ${e.message}`);
    throw e;
  }
}

// ---- layout checks (grid coordinates) --------------------------------------------------------

type GLeg = { comp: string; p: [number, number]; q: [number, number] };
const EPS = 1e-9;
const same = (a: [number, number], b: [number, number]): boolean => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
const fmtG = (p: [number, number], locale: Locale): string => `(${formatNumber(p[0], locale)}; ${formatNumber(p[1], locale)})`;

function gridPath(c: Comp, nodes: Record<string, [number, number]>): [number, number][] {
  const a = nodes[c.from]!;
  const b = nodes[c.to]!;
  return c.via === undefined ? [a, b] : [a, c.via, b];
}

function onLeg(p: [number, number], leg: GLeg, inclusive: boolean): boolean {
  const [x0, y0] = leg.p;
  const [x1, y1] = leg.q;
  const within = (t: number, a: number, b: number): boolean =>
    inclusive ? t >= Math.min(a, b) - EPS && t <= Math.max(a, b) + EPS : t > Math.min(a, b) + EPS && t < Math.max(a, b) - EPS;
  if (Math.abs(y0 - y1) < EPS) return Math.abs(p[1] - y0) < EPS && within(p[0], x0, x1);
  return Math.abs(p[0] - x0) < EPS && within(p[1], y0, y1);
}

/** Refuse a layout a reader would misread. Exported for its own tests. */
export function checkLayout(input: CircuitInput, comps: Comp[], locale: Locale): void {
  const nodes = input.nodes;
  const names = Object.keys(nodes);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      if (same(nodes[names[i]!]!, nodes[names[j]!]!)) throw new SpecError(`circuit.nodes: ${names[i]} and ${names[j]} are both at ${fmtG(nodes[names[i]!]!, locale)} -- one place is one node`);
    }
  }
  const legs: GLeg[] = [];
  for (const c of comps) {
    const path = `circuit.components[${c.index}] (${c.id})`;
    if (c.from === c.to) throw new SpecError(`${path}: from and to are both ${c.from}`);
    const pts = gridPath(c, nodes);
    for (let k = 0; k < pts.length - 1; k += 1) {
      const p = pts[k]!;
      const q = pts[k + 1]!;
      if (same(p, q)) throw new SpecError(`${path}: a run of zero length ${c.via === undefined ? "" : "-- the via corner coincides with an end"}`);
      if (Math.abs(p[0] - q[0]) > EPS && Math.abs(p[1] - q[1]) > EPS) {
        throw new SpecError(
          c.via === undefined
            ? `${path}: ${c.from} ${fmtG(p, locale)} to ${c.to} ${fmtG(q, locale)} is neither horizontal nor vertical -- give it a "via" corner, e.g. [${q[0]}, ${p[1]}]`
            : `${path}: the run through via ${fmtG(c.via, locale)} is not two horizontal/vertical legs`,
        );
      }
      legs.push({ comp: c.id, p, q });
    }
    if (pts.length === 3) {
      const h0 = Math.abs(pts[0]![1] - pts[1]![1]) < EPS;
      const h1 = Math.abs(pts[1]![1] - pts[2]![1]) < EPS;
      if (h0 === h1) throw new SpecError(`${path}: via ${fmtG(c.via!, locale)} is not a corner -- both legs run the same way`);
    }
  }
  // A run through a node it does not connect to.
  for (const leg of legs) {
    const c = comps.find((x) => x.id === leg.comp)!;
    for (const name of names) {
      if (name === c.from || name === c.to) continue;
      if (onLeg(nodes[name]!, leg, true)) {
        throw new SpecError(`circuit: ${c.id}'s run passes through node ${name} without connecting to it -- a reader would take it as connected; reroute it with "via" or split it at ${name}`);
      }
    }
  }
  // Two runs that overlap or cross away from a shared node.
  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      const a = legs[i]!;
      const b = legs[j]!;
      if (a.comp === b.comp) continue;
      const aH = Math.abs(a.p[1] - a.q[1]) < EPS;
      const bH = Math.abs(b.p[1] - b.q[1]) < EPS;
      let meet: [number, number] | null = null;
      if (aH === bH) {
        const axis = aH ? 0 : 1;
        const other = 1 - axis;
        if (Math.abs(a.p[other]! - b.p[other]!) > EPS) continue;
        const lo = Math.max(Math.min(a.p[axis]!, a.q[axis]!), Math.min(b.p[axis]!, b.q[axis]!));
        const hi = Math.min(Math.max(a.p[axis]!, a.q[axis]!), Math.max(b.p[axis]!, b.q[axis]!));
        if (hi < lo - EPS) continue;
        if (hi > lo + EPS) throw new SpecError(`circuit: ${a.comp} and ${b.comp} run on top of each other -- two components between the same nodes need their own runs (use "via")`);
        meet = aH ? [lo, a.p[1]] : [a.p[0], lo];
      } else {
        const h = aH ? a : b;
        const vv = aH ? b : a;
        const x = vv.p[0];
        const y = h.p[1];
        if (!onLeg([x, y], h, true) || !onLeg([x, y], vv, true)) continue;
        meet = [x, y];
      }
      const isEnd = (leg: GLeg): boolean => same(meet!, leg.p) || same(meet!, leg.q);
      const atNode = names.some((n) => same(nodes[n]!, meet!));
      if (!(atNode && isEnd(a) && isEnd(b))) {
        throw new SpecError(`circuit: ${a.comp} and ${b.comp} cross at ${fmtG(meet, locale)}, where there is no node they both end at -- a crossing is read as a connection or as none; reroute one of them`);
      }
    }
  }
}

// ---- drawing -----------------------------------------------------------------------------

type Laid = {
  comp: Comp;
  pts: Point[];
  /** Present for everything but a wire. */
  sym?: { k: number; c: Point; d: Point; n: Point; hl: number; hw: number; outside: 1 | -1; kind: SymbolKind };
  /** The mark a value label names. */
  mainId: string;
  /** Straight pieces of this component's path outside its symbol, oriented from `from` to `to`: where a current arrow may sit. */
  hosts: { a: Point; b: Point }[];
};

function unitVec(a: Point, b: Point): Point {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

function markFrom(id: string, start: Point, ops: Op[], stroke: string, width: number, fill?: string, close?: boolean): Mark {
  const segments: MarkSegment[] = ops.map((op) => ("arc" in op ? { arc: op.arc, centre: op.centre } : { line: op.line }));
  return { id, from: start, segments, close: close ?? false, fill: fill ?? "none", stroke, strokeWidth: width };
}

/** Candidates for a label beside a straight run at `p` (direction `d`), clear of ink reaching `hw` across it; the preferred side first. */
function beside(p: Point, d: Point, hw: number, w: number, h: number, alongs: number[], side: 1 | -1): Point[] {
  const n = { x: -d.y, y: d.x };
  const clearance = Math.abs(n.x) * (w / 2) + Math.abs(n.y) * (h / 2) + hw + PLACE_MARGIN + 3;
  const out: Point[] = [];
  for (const extra of [0, 4, 9, 15, 22, 30]) {
    for (const s of [side, -side]) {
      for (const along of alongs) out.push({ x: p.x + d.x * along + n.x * s * (clearance + extra), y: p.y + d.y * along + n.y * s * (clearance + extra) });
    }
  }
  return out;
}

// ---- the panel: text with subscripts, one block per run ----------------------------------------

type Run = { text: string; sub?: boolean };

/** Advance widths (em) for the panel's sans, rounded up: good enough to pack runs tightly, never so tight a run overflows. */
function runWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) {
    if (ch === " " || ch === "\u00a0") em += 0.3;
    else if (/[0-9]/.test(ch)) em += 0.58;
    else if (/[A-Z]/.test(ch)) em += 0.7;
    else if (/[a-z]/.test(ch)) em += 0.56;
    else if (ch === "," || ch === "." || ch === ":") em += 0.3;
    else if (ch === "(" || ch === ")") em += 0.34;
    else em += 0.68;
  }
  return Math.ceil(em * size + 2);
}

function lineWidth(runs: Run[]): number {
  return runs.reduce((s, r) => s + runWidth(r.text, r.sub ? SUB_SIZE : PANEL_SIZE) + 1, 0);
}

function drawRuns(board: Board, rawRuns: Run[], left: number, y: number, id: string): void {
  // A run set against its subscript is end-aligned, so its width estimate's
  // surplus lands on its LEFT. Only the base letter needs that alignment:
  // " = V" before "A" is split into " = " (start-aligned, surplus to the
  // right, a few pixels) and "V", so "U_AB = V_A" does not open a gap
  // before every "=" and "−".
  const runs: Run[] = rawRuns.flatMap((r, i) => {
    if (r.sub || rawRuns[i + 1]?.sub !== true) return [r];
    const cut = r.text.lastIndexOf(" ");
    if (cut < 0 || cut === r.text.length - 1) return [r];
    return [{ text: r.text.slice(0, cut + 1) }, { text: r.text.slice(cut + 1) }];
  });
  let x = left;
  runs.forEach((r, i) => {
    const size = r.sub ? SUB_SIZE : PANEL_SIZE;
    // A block collapses a run's leading and trailing spaces, which the width
    // estimate still counted -- a gap where no space was drawn. Non-breaking
    // spaces are drawn, at about the width the estimate gives them.
    const text = r.text.replace(/ /g, " ");
    const w = runWidth(text, size);
    const nextIsSub = runs[i + 1]?.sub === true;
    // A run is set against the run that follows it when that is a subscript,
    // so "V" and its "A" touch; every other run starts at its left edge.
    const align = !r.sub && nextIsSub ? "end" : "start";
    board.label(text, x + w / 2, y + (r.sub ? 4 : 0), { size, width: w, colour: INK, align, id: `${id}-${i}`, claim: false, freeStanding: true });
    x += w + 1;
  });
}

// ---- branches -----------------------------------------------------------------------------------

export type Branch = {
  /** Component ids in input order; every one carries the same current. */
  members: string[];
  /** Current through members[0], from its `from` to its `to`. */
  current: number;
  /** i₁, i₂, … (or i). */
  name: string;
  zero: boolean;
};

/**
 * The distinct branch currents: components in series -- joined at a node
 * where exactly two conducting terminals meet, wires and closed switches
 * making several named nodes one -- share one current and one name.
 * An ideal voltmeter and an open switch conduct nothing and join nothing.
 */
export function analyseBranches(input: CircuitInput, sol: MnaSolution): Branch[] {
  const comps = normalise(input).filter((c) => {
    const k = mnaKindOf(c);
    return k === "R" || k === "V" || k === "A" || k === "I";
  });
  const byRoot = new Map<string, string[]>();
  for (const c of comps) {
    for (const node of [c.from, c.to]) {
      const r = sol.merged.get(node)!;
      if (!byRoot.has(r)) byRoot.set(r, []);
      byRoot.get(r)!.push(c.id);
    }
  }
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const ids of byRoot.values()) if (ids.length === 2) parent.set(find(ids[0]!), find(ids[1]!));
  const groups = new Map<string, string[]>();
  for (const c of comps) {
    const r = find(c.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(c.id);
  }
  const scale = Math.max(1e-12, ...comps.map((c) => Math.abs(sol.current.get(c.id) ?? 0)));
  const list = [...groups.values()];
  return list.map((members, i) => {
    const current = sol.current.get(members[0]!) ?? 0;
    return { members, current, name: currentName(i + 1, list.length), zero: Math.abs(current) <= 1e-9 * scale };
  });
}

// ---- entry point -----------------------------------------------------------------------------

/**
 * Where the current values go. "drawing": "i₁ = 0,5 A" beside each arrow.
 * "panel": only "i₁" beside the arrow, and the values listed below the
 * circuit. "auto" (default) draws them on the circuit, and moves them to
 * the panel when one of them cannot sit right beside its own arrow -- a
 * dense circuit (a bridge) has short leads between crowded labels.
 */
export function expandCircuit(input: CircuitInput): FigureSpec {
  const mode = input.show?.currentValues ?? "auto";
  if (mode === "panel") return layout(input, "panel").spec;
  const first = layout(input, "drawing");
  if (mode === "drawing" || !first.crowded) return first.spec;
  return layout(input, "panel").spec;
}

function layout(input: CircuitInput, currentsIn: "drawing" | "panel"): { spec: FigureSpec; crowded: boolean } {
  const locale = input.locale ?? "pt-BR";
  const title = input.title ?? "circuito elétrico";
  const answers = input.answers !== false;
  const show = input.show ?? {};
  const iec = input.symbols === "iec";
  const comps = normalise(input);
  checkLayout(input, comps, locale);
  const sol = solveCircuit(input);
  const I = (id: string): number => sol.current.get(id) ?? 0;
  const V = (node: string, path: string): number => {
    const p = sol.potential.get(node);
    if (p === undefined) throw new SpecError(`${path}: node ${node} is connected to nothing that conducts, so its potential is undetermined`);
    return p;
  };

  // ---- the page -------------------------------------------------------------------------
  const nodes = input.nodes;
  const names = Object.keys(nodes);
  const allPts = [...names.map((n) => nodes[n]!), ...comps.flatMap((c) => (c.via === undefined ? [] : [c.via]))];
  const xmin = Math.min(...allPts.map((p) => p[0]));
  const xmax = Math.max(...allPts.map((p) => p[0]));
  const ymin = Math.min(...allPts.map((p) => p[1]));
  const ymax = Math.max(...allPts.map((p) => p[1]));
  const span = Math.max(xmax - xmin, ymax - ymin, 1);
  const unit = Math.round(Math.min(MAX_UNIT, Math.max(MIN_UNIT, PLOT_TARGET_PX / span)));
  const plotW = Math.ceil((xmax - xmin) * unit + 2 * MARGIN_X);
  const plotH = Math.ceil((ymax - ymin) * unit + 2 * MARGIN_Y);

  // ---- the panel's text first: its width and height decide the canvas ---------------------------
  const panel: Run[][] = [];
  const unitText = (value: number, u: string): string => {
    const q = withUnit(value, u, locale);
    return `${q.rel} ${q.text}`;
  };
  const branches = analyseBranches(input, sol);
  if (answers && currentsIn === "panel" && show.currents !== false) {
    const items = branches.map((b) => {
      const q = withUnit(Math.abs(b.current), "A", locale);
      return `${b.name} ${q.rel} ${q.text}`;
    });
    for (let k = 0; k < items.length; k += 3) panel.push([{ text: items.slice(k, k + 3).join("\u00a0".repeat(5)) }]);
  }
  (show.voltages ?? []).forEach(([a, b], i) => {
    if (!answers) return;
    const path = `circuit.show.voltages[${i}]`;
    for (const n of [a, b]) if (!(n in nodes)) throw new SpecError(`${path}: unknown node ${JSON.stringify(n)}`);
    const u = V(a, path) - V(b, path);
    panel.push([{ text: "U" }, { text: `${a}${b}`, sub: true }, { text: " = V" }, { text: a, sub: true }, { text: ` ${"−"} V` }, { text: b, sub: true }, { text: ` ${unitText(u, "V")}` }]);
  });
  const shownNodes = names.filter((n) => {
    const rule = show.nodeNames ?? "letters";
    if (Array.isArray(rule)) return rule.includes(n);
    if (rule === "none") return false;
    if (rule === "all") return true;
    return /^[A-Z][′']?$/.test(n);
  });
  if (Array.isArray(show.nodeNames)) {
    show.nodeNames.forEach((n, i) => {
      if (!(n in nodes)) throw new SpecError(`circuit.show.nodeNames[${i}]: unknown node ${JSON.stringify(n)}`);
    });
  }
  const drawGround = input.ground !== undefined || show.nodeVoltages === true;
  if (show.nodeVoltages === true && answers) {
    const listed = shownNodes.filter((n) => sol.potential.has(n)).sort();
    for (const n of listed) {
      const pot = V(n, "circuit.show.nodeVoltages");
      panel.push([{ text: "V" }, { text: n, sub: true }, { text: ` ${sol.merged.get(n) === sol.merged.get(sol.ground) ? "= 0 (referência)" : unitText(pot, "V")}` }]);
    }
  }
  if (show.power === true && answers) {
    for (const c of comps) {
      let p: number;
      let role = "";
      if (c.kind === "resistor" || c.kind === "lamp") p = I(c.id) ** 2 * c.value!;
      else if (c.kind === "battery" || c.kind === "voltage-source") {
        p = c.value! * I(c.id);
        role = p >= 0 ? " (fornecida)" : " (recebida)";
      } else if (c.kind === "current-source") {
        p = c.value! * (V(c.to, "power") - V(c.from, "power"));
        role = p >= 0 ? " (fornecida)" : " (recebida)";
      } else continue;
      panel.push([{ text: "P" }, { text: c.id, sub: true }, { text: ` ${unitText(Math.abs(p), "W")}${Math.abs(p) < 1e-12 ? "" : role}` }]);
    }
  }
  const panelW = Math.max(0, ...panel.map(lineWidth));
  const panelH = panel.length === 0 ? 0 : panel.length * PANEL_LINE_H + 16;
  const width = Math.max(plotW, Math.ceil(panelW + 2 * 40));
  const height = plotH + panelH;
  const ox = (width - plotW) / 2 + MARGIN_X;
  const oy = MARGIN_Y;
  const X = (p: [number, number]): Point => ({ x: ox + (p[0] - xmin) * unit, y: oy + (ymax - p[1]) * unit });
  const K = { x: ox + ((xmax - xmin) * unit) / 2, y: oy + ((ymax - ymin) * unit) / 2 };

  const board = new Board(width, height, PAPER);
  const placer = new Placer({ x: 8, y: 8, width: width - 16, height: plotH - 12 });

  const draw = (id: string, start: Point, ops: Op[], stroke: string, w: number, fill?: string, close?: boolean): void => {
    board.marks.push(markFrom(id, start, ops, stroke, w, fill, close));
    const sampled = samplePath(start, ops);
    const ink = close === true ? [...sampled, start] : sampled;
    board.trace(ink, stroke, w, id);
    placer.addInk(id, ink, true);
  };

  // ---- components ---------------------------------------------------------------------------
  const laid: Laid[] = [];
  for (const c of comps) {
    const pts = gridPath(c, nodes).map(X);
    if (c.kind === "wire") {
      draw(c.id, pts[0]!, pts.slice(1).map((p) => ({ line: p })), INK, 2);
      const hosts = pts.slice(1).map((p, k) => ({ a: pts[k]!, b: p }));
      laid.push({ comp: c, pts, mainId: c.id, hosts });
      continue;
    }
    const kind = c.kind as SymbolKind;
    let k = 0;
    for (let j = 1; j < pts.length - 1; j += 1) {
      if (Math.hypot(pts[j + 1]!.x - pts[j]!.x, pts[j + 1]!.y - pts[j]!.y) > Math.hypot(pts[k + 1]!.x - pts[k]!.x, pts[k + 1]!.y - pts[k]!.y) + 1e-6) k = j;
    }
    const a = pts[k]!;
    const b = pts[k + 1]!;
    const legLen = Math.hypot(b.x - a.x, b.y - a.y);
    const hl = halfLength(kind);
    if (legLen < 2 * hl + 2 * MIN_LEAD) {
      throw new SpecError(`circuit.components[${c.index}] (${c.id}): its longest straight run is ${Math.round(legLen)} px, too short for a ${c.kind} symbol (needs ${2 * hl + 2 * MIN_LEAD} px) -- move its nodes further apart`);
    }
    const d = unitVec(a, b);
    const n = { x: -d.y, y: d.x };
    const cen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const facing = n.x * (cen.x - K.x) + n.y * (cen.y - K.y);
    const outside: 1 | -1 = Math.abs(facing) > 1 ? (facing > 0 ? 1 : -1) : n.y < -0.5 || n.x > 0.5 ? 1 : -1;
    const bodyStart = { x: cen.x - d.x * hl, y: cen.y - d.y * hl };
    const bodyEnd = { x: cen.x + d.x * hl, y: cen.y + d.y * hl };
    const lead = [...pts.slice(0, k + 1), bodyStart];
    const tail = pts.slice(k + 1);
    for (const path of symbolPaths(kind, cen, d, lead, tail, { iec, closed: c.closed === true, outside })) {
      draw(`${c.id}${path.part}`, path.start, path.ops, INK, path.width, path.fill === "ink" ? INK : path.fill, path.close);
    }
    if (kind === "switch") {
      switchTerminals(cen, d).forEach((t, i) => {
        const id = `${c.id}-t${i + 1}`;
        board.circle(t, TERMINAL_R, { stroke: INK, width: 1.6, fill: PAPER, id });
        placer.addInk(id, Array.from({ length: 13 }, (_, s) => ({ x: t.x + TERMINAL_R * Math.cos((s * Math.PI) / 6), y: t.y + TERMINAL_R * Math.sin((s * Math.PI) / 6) })), true);
      });
    }
    const hosts: { a: Point; b: Point }[] = [];
    for (let j = 0; j < k; j += 1) hosts.push({ a: pts[j]!, b: pts[j + 1]! });
    hosts.push({ a, b: bodyStart }, { a: bodyEnd, b });
    for (let j = k + 1; j < pts.length - 1; j += 1) hosts.push({ a: pts[j]!, b: pts[j + 1]! });
    laid.push({ comp: c, pts, sym: { k, c: cen, d, n, hl, hw: halfWidth(kind, c.kind === "switch" && c.closed !== true), outside, kind }, mainId: c.id, hosts });
  }

  // ---- junctions: three or more runs meeting at a node ----------------------------------------
  const ends = new Map<string, number>();
  for (const c of comps) for (const t of [c.from, c.to]) ends.set(t, (ends.get(t) ?? 0) + 1);
  const junctions = names.filter((n) => (ends.get(n) ?? 0) >= 3);
  for (const n of junctions) placer.addInk(`dot-${n}`, [X(nodes[n]!)], false, { c: X(nodes[n]!), r: DOT_R });

  // ---- ground --------------------------------------------------------------------------------
  if (drawGround) {
    const gName = input.ground ?? sol.ground;
    const g = X(nodes[gName]!);
    const used = laid.flatMap((l) => {
      const out: Point[] = [];
      const p0 = l.pts[0]!;
      const pN = l.pts[l.pts.length - 1]!;
      if (Math.hypot(p0.x - g.x, p0.y - g.y) < 0.5) out.push(unitVec(g, l.pts[1]!));
      if (Math.hypot(pN.x - g.x, pN.y - g.y) < 0.5) out.push(unitVec(g, l.pts[l.pts.length - 2]!));
      return out;
    });
    const dirs = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
    const dir = dirs.find((dd) => !used.some((u) => u.x * dd.x + u.y * dd.y > 0.9));
    if (dir === undefined) throw new SpecError(`circuit.ground: node ${gName} has runs leaving it in all four directions -- no room to draw the ground symbol; choose another node`);
    const m = { x: -dir.y, y: dir.x };
    const s = { x: g.x + dir.x * 14, y: g.y + dir.y * 14 };
    draw("ground", g, [{ line: s }, { line: { x: s.x - m.x * 11, y: s.y - m.y * 11 } }, { line: { x: s.x + m.x * 11, y: s.y + m.y * 11 } }], INK, 2);
    [7, 3].forEach((half, i) => {
      const q = { x: s.x + dir.x * 4 * (i + 1), y: s.y + dir.y * 4 * (i + 1) };
      draw(`ground-${i + 2}`, { x: q.x - m.x * half, y: q.y - m.y * half }, [{ line: { x: q.x + m.x * half, y: q.y + m.y * half } }], INK, 2);
    });
  }

  for (const n of shownNodes) placer.addPlace(`node-${n}`, X(nodes[n]!));

  // ---- value labels ---------------------------------------------------------------------------
  const placeBeside = (claim: string, text: string, style: { size: number; weight: number; colour: string }, p: Point, d: Point, hw: number, side: 1 | -1, alongs: number[], id: string): void => {
    const { w, h } = board.extent(text, style);
    const best = placer.choose({ kind: "element", id: claim }, w, h, beside(p, d, hw, w, h, alongs, side));
    board.label(text, best.centre.x, best.centre.y, { ...style, width: w, annotates: claim, id });
    placer.commit(rectAt(best.centre, w, h));
  };
  const valueStyle = { size: LABEL_SIZE, weight: 400, colour: INK };
  for (const l of laid) {
    const c = l.comp;
    const s = l.sym;
    if (s === undefined) continue;
    let text: string | undefined;
    const valuePath = `circuit.components[${c.index}] (${c.id})`;
    if (c.kind === "resistor" || c.kind === "lamp") text = `${formatNumber(c.value!, locale)} Ω`;
    else if (c.kind === "battery" || c.kind === "voltage-source") text = `${formatNumber(c.value!, locale)} V`;
    else if (c.kind === "current-source") text = `${formatNumber(c.value!, locale)} A`;
    if (show.names === true && c.kind !== "ammeter" && c.kind !== "voltmeter") text = text === undefined ? displayName(c.id) : `${displayName(c.id)} = ${text}`;
    // The battery's label sits by the long plate, the one it names.
    const alongs = c.kind === "battery" ? [4] : [0, -6, 6];
    if (text !== undefined) placeBeside(l.mainId, text, valueStyle, s.c, s.d, s.hw, s.outside, alongs, `label-${c.id}`);
    if (c.kind === "ammeter" || c.kind === "voltmeter") {
      const letter = c.kind === "ammeter" ? "A" : "V";
      board.label(letter, s.c.x, s.c.y, { size: 14, weight: 700, colour: INK, width: 14, annotates: l.mainId, id: `label-${c.id}-letter` });
      placer.commit(rectAt(s.c, 14, 18));
      if (!answers) continue;
      const reading = c.kind === "ammeter" ? Math.abs(I(c.id)) : V(c.to, valuePath) - V(c.from, valuePath);
      const q = withUnit(reading, c.kind === "ammeter" ? "A" : "V", locale);
      const readText = `${q.rel === "≈" ? "≈ " : ""}${q.text === "0" ? `0 ${c.kind === "ammeter" ? "A" : "V"}` : q.text}`;
      placeBeside(l.mainId, show.names === true ? `${displayName(c.id)}: ${readText}` : readText, { size: LABEL_SIZE, weight: 700, colour: INK }, s.c, s.d, s.hw, s.outside, [0, -6, 6], `label-${c.id}-reading`);
    }
  }

  // ---- branch currents ------------------------------------------------------------------------
  let crowded = false;
  if (answers && show.currents !== false) drawCurrents();

  function drawCurrents(): void {
    const root = (n: string): string => sol.merged.get(n)!;
    const byId = new Map(laid.map((l) => [l.comp.id, l]));
    type Term = { l: Laid; node: string; role: "from" | "to" };
    const byRoot = new Map<string, Term[]>();
    for (const b of branches) {
      for (const id of b.members) {
        const l = byId.get(id)!;
        for (const role of ["from", "to"] as const) {
          const node = l.comp[role];
          const r = root(node);
          if (!byRoot.has(r)) byRoot.set(r, []);
          byRoot.get(r)!.push({ l, node, role });
        }
      }
    }
    const wireLike = laid.filter((l) => mnaKindOf(l.comp) === "W");

    branches.forEach((br, bi) => {
      const branch = br.members.map((id) => byId.get(id)!);
      const name = br.name;
      const i0 = br.current;
      if (br.zero) {
        const host = branch.find((l) => l.comp.kind === "resistor" || l.comp.kind === "lamp") ?? branch[0]!;
        const s = host.sym!;
        placeBeside(host.mainId, currentsIn === "panel" ? name : `${name} = 0`, { size: LABEL_SIZE, weight: 600, colour: CURRENT }, s.c, s.d, s.hw, s.outside === 1 ? -1 : 1, [0, -8, 8], `current-${bi + 1}-label`);
        return;
      }
      // Where the arrow may sit, each with the direction current flows along it.
      const candidates: { a: Point; b: Point; wire: boolean }[] = [];
      const members = new Set(branch.map((l) => l.comp.id));
      for (const terms of byRoot.values()) {
        if (terms.length !== 2 || !members.has(terms[0]!.l.comp.id)) continue;
        const [t1, t2] = terms as [Term, Term];
        const inflow = t1.role === "to" ? I(t1.l.comp.id) : -I(t1.l.comp.id);
        const [src, dst] = inflow >= 0 ? [t1.node, t2.node] : [t2.node, t1.node];
        for (const step of wirePath(wireLike, src, dst)) {
          if (step.l.comp.kind !== "wire") continue;
          const pts = step.forward ? step.l.pts : [...step.l.pts].reverse();
          for (let j = 0; j < pts.length - 1; j += 1) candidates.push({ a: pts[j]!, b: pts[j + 1]!, wire: true });
        }
      }
      for (const l of branch) {
        const flow = I(l.comp.id) >= 0;
        for (const h of l.hosts) candidates.push(flow ? { a: h.a, b: h.b, wire: false } : { a: h.b, b: h.a, wire: false });
      }
      const len = (h: { a: Point; b: Point }): number => Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y);
      const usable = candidates
        .filter((h) => len(h) >= (h.wire ? 0.75 * unit : 26))
        .sort((p, q) => Number(q.wire) - Number(p.wire) || len(q) - len(p));
      const q = withUnit(Math.abs(i0), "A", locale);
      const text = currentsIn === "panel" ? name : `${name} ${q.rel} ${q.text}`;
      const style = { size: LABEL_SIZE, weight: 600, colour: CURRENT };
      const { w, h } = board.extent(text, style);
      const id = `current-${bi + 1}`;
      let best: { host: { a: Point; b: Point }; centre: Point; cost: number; near: boolean } | undefined;
      for (const host of usable) {
        const tri = arrowAt(host);
        placer.addInk(id, [...tri, tri[0]!], true);
        const d = unitVec(host.a, host.b);
        const n = { x: -d.y, y: d.x };
        const base = { x: (tri[1]!.x + tri[2]!.x) / 2, y: (tri[1]!.y + tri[2]!.y) / 2 };
        const facing = n.x * (base.x - K.x) + n.y * (base.y - K.y);
        const side: 1 | -1 = facing >= 0 ? 1 : -1;
        const spots = beside(base, d, ARROW_WIDTH, w, h, [0, -3], side);
        const choice = placer.choose({ kind: "element", id }, w, h, spots);
        placer.removeInk(id);
        // Near: an honest spot within 9 px of the closest one (the first three rings of `beside`).
        const near = choice.cost === 0 && spots.findIndex((p) => p.x === choice.centre.x && p.y === choice.centre.y) < 12;
        if (best === undefined || (near && !best.near) || (near === best.near && choice.cost < best.cost)) best = { host, ...choice, near };
        if (near) break;
      }
      if (best === undefined) {
        throw new SpecError(`circuit: branch current ${name} (through ${branch.map((l) => l.comp.id).join(", ")}) has no wire or lead long enough to carry its arrow -- lengthen a run in that branch`);
      }
      if (!best.near) crowded = true;
      const tri = arrowAt(best.host);
      draw(id, tri[0]!, [{ line: tri[1]! }, { line: tri[2]! }], CURRENT, 1, CURRENT, true);
      board.label(text, best.centre.x, best.centre.y, { ...style, width: w, annotates: id, id: `${id}-label` });
      placer.commit(rectAt(best.centre, w, h));
    });
  }

  // ---- node names --------------------------------------------------------------------------------
  for (const n of shownNodes) {
    const at = X(nodes[n]!);
    const style = { size: 14, weight: 700, colour: INK };
    const { w, h } = board.extent(n, style);
    const out = unitVec(K, at);
    const best = placer.choose({ kind: "place", id: `node-${n}`, at }, w, h, aroundPoint(at, w, h, placer.incident(at), out));
    board.label(n, best.centre.x, best.centre.y, { ...style, width: w, annotatesPlace: at, id: `node-${n}` });
    placer.commit(rectAt(best.centre, w, h));
  }

  // ---- dots last ------------------------------------------------------------------------------
  for (const n of junctions) board.circle(X(nodes[n]!), DOT_R, { fill: INK, id: `dot-${n}` });

  // ---- panel ------------------------------------------------------------------------------------
  const left = (width - panelW) / 2;
  panel.forEach((runs, i) => drawRuns(board, runs, left, plotH + 8 + i * PANEL_LINE_H + PANEL_LINE_H / 2, `panel-${i}`));

  const spec = board.spec(title);
  const scene = spec.root as Scene;
  scene.connectors = [];
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return { spec: parseSpec(spec), crowded };
}

/** The arrowhead at the middle of a run, pointing from a to b: tip, then the two base corners. */
function arrowAt(host: { a: Point; b: Point }): Point[] {
  const d = unitVec(host.a, host.b);
  const n = { x: -d.y, y: d.x };
  const m = { x: (host.a.x + host.b.x) / 2, y: (host.a.y + host.b.y) / 2 };
  const tip = { x: m.x + d.x * ARROW_HALF, y: m.y + d.y * ARROW_HALF };
  const base = { x: m.x - d.x * ARROW_HALF, y: m.y - d.y * ARROW_HALF };
  return [tip, { x: base.x + n.x * ARROW_WIDTH, y: base.y + n.y * ARROW_WIDTH }, { x: base.x - n.x * ARROW_WIDTH, y: base.y - n.y * ARROW_WIDTH }];
}

/** The wire-like components on the path from node `src` to node `dst`, each with whether it is walked from its `from` to its `to`. */
function wirePath(wires: Laid[], src: string, dst: string): { l: Laid; forward: boolean }[] {
  const prev = new Map<string, { node: string; l: Laid; forward: boolean } | null>([[src, null]]);
  const queue = [src];
  while (queue.length > 0) {
    const x = queue.shift()!;
    if (x === dst) break;
    for (const l of wires) {
      const fwd = l.comp.from === x;
      const y = fwd ? l.comp.to : l.comp.to === x ? l.comp.from : undefined;
      if (y === undefined || prev.has(y)) continue;
      prev.set(y, { node: x, l, forward: fwd });
      queue.push(y);
    }
  }
  if (!prev.has(dst)) return [];
  const out: { l: Laid; forward: boolean }[] = [];
  let at = dst;
  while (at !== src) {
    const p = prev.get(at)!;
    out.push({ l: p!.l, forward: p!.forward });
    at = p!.node;
  }
  return out.reverse();
}

// ---- validation ------------------------------------------------------------------------------

function gridPoint(value: unknown, path: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new SpecError(`${path} must be [x, y], got ${JSON.stringify(value)}`);
  return [v.finite(value[0], `${path}[0]`), v.finite(value[1], `${path}[1]`)];
}

export function validateCircuitInput(raw: Record<string, unknown>): void {
  const path = "circuit";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalEnum(raw, "symbols", path, ["zigzag", "iec"]);
  const nodes = v.object(raw.nodes, `${path}.nodes`);
  const nodeNames = Object.keys(nodes);
  if (nodeNames.length < 2) throw new SpecError(`${path}.nodes must name at least two nodes, each with grid coordinates [x, y]`);
  for (const n of nodeNames) gridPoint(nodes[n], `${path}.nodes.${n}`);
  const known = new Set(nodeNames);
  const comps = v.nonEmptyArray(raw, "components", path, "components");
  const ids: { id: string; at: string }[] = [];
  comps.forEach((item, i) => {
    const at = `${path}.components[${i}]`;
    const c = v.object(item, at);
    const kind = v.optionalEnum(c, "kind", at, KINDS);
    if (kind === undefined) throw new SpecError(`${at}.kind is required: one of ${KINDS.join(", ")}`);
    const id = v.optionalString(c, "id", at);
    if (id === undefined && kind !== "wire") throw new SpecError(`${at}.id is required for a ${kind} (e.g. "R1", "E1") -- only a wire may go unnamed`);
    if (id !== undefined) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) throw new SpecError(`${at}.id ${JSON.stringify(id)} must be a letter followed by letters, digits or _`);
      ids.push({ id, at });
    }
    for (const key of ["from", "to"]) v.knownId(v.requiredString(c, key, at), known, `${at}.${key}`, "node");
    if (c.via !== undefined) gridPoint(c.via, `${at}.via`);
    const value = v.optionalNumber(c, "value", at);
    const needsValue: Record<string, string> = { resistor: "its resistance in Ω", lamp: "its resistance in Ω", battery: "its EMF in V", "voltage-source": "its voltage in V", "current-source": "its current in A" };
    if (needsValue[kind] !== undefined) {
      if (value === undefined) throw new SpecError(`${at}.value is required for a ${kind}: ${needsValue[kind]}`);
      if (!(value > 0)) throw new SpecError(`${at}.value must be positive, got ${value}${kind === "resistor" || kind === "lamp" ? "" : " -- to reverse it, swap from and to"}`);
    } else if (value !== undefined) {
      throw new SpecError(`${at}.value has no meaning for a ${kind}${kind === "ammeter" || kind === "voltmeter" ? " -- its reading is computed, never typed" : ""}`);
    }
    const closed = v.optionalBoolean(c, "closed", at);
    if (closed !== undefined && kind !== "switch") throw new SpecError(`${at}.closed applies only to a switch`);
  });
  v.unique(ids, "component");
  if (raw.ground !== undefined) v.knownId(v.requiredString(raw, "ground", path), known, `${path}.ground`, "node");
  if (raw.show !== undefined) {
    const show = v.object(raw.show, `${path}.show`);
    const flags = ["currents", "nodeVoltages", "power", "names"];
    for (const key of Object.keys(show)) {
      if (![...flags, "voltages", "nodeNames", "currentValues"].includes(key)) throw new SpecError(`${path}.show.${key} is not a flag; the flags are ${[...flags, "voltages", "nodeNames", "currentValues"].join(", ")}`);
    }
    for (const f of flags) v.optionalBoolean(show, f, `${path}.show`);
    if (show.voltages !== undefined) {
      v.array(show, "voltages", `${path}.show`, "node pairs").forEach((pair, i) => {
        const at = `${path}.show.voltages[${i}]`;
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string") throw new SpecError(`${at} must be a pair of node names, e.g. ["A", "B"]`);
        v.knownId(pair[0], known, `${at}[0]`, "node");
        v.knownId(pair[1], known, `${at}[1]`, "node");
      });
    }
    v.optionalEnum(show, "currentValues", `${path}.show`, ["auto", "drawing", "panel"]);
    if (show.nodeNames !== undefined && !Array.isArray(show.nodeNames)) v.optionalEnum(show, "nodeNames", `${path}.show`, ["letters", "all", "none"]);
  }
  expandCircuit(raw as unknown as CircuitInput);
}

