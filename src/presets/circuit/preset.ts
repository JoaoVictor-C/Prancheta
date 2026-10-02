/**
 * circuit -- DC circuit diagrams for Física 3 / Circuitos (Halliday, Ramalho)
 * and the school physics of ENEM: "calcule a corrente em cada resistor",
 * "qual a ddp entre A e B", Kirchhoff, series and parallel, the Wheatstone
 * bridge, an LED with its series resistor, a real source with internal
 * resistance, a resistive wire with taps, an appliance as a labelled box.
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
 * current source in series with an open circuit, a diode circuit whose
 * on/off states are ambiguous or contradictory).
 *
 * ADR 0069 adds, all solved and none typed:
 *
 *  - LEDs and diodes with a forward drop (every on/off state is solved and
 *    only the self-consistent one kept; an LED that conducts is drawn lit);
 *  - a battery with internal resistance r, drawn as the battery and r in
 *    series inside a dashed box, its terminal voltage U = ε − r·i computed;
 *  - symbolic values -- every resistance a multiple of ONE symbol and every
 *    EMF a multiple of ANOTHER -- solved by scale, printed "i = E/(3R)";
 *  - a resistive wire with taps at given fractions of its length, the tap
 *    nodes placed by the preset (and nodes placed relative to them);
 *  - a load box, a labelled rectangle with a resistance or a rated power.
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
 *  - junction dots only where three or more runs meet at a node (and at a tap);
 *  - node names for nodes named by a capital letter (A, B, C′);
 *  - a panel of the potential differences asked for ("U_AB = V_A − V_B =
 *    6 V", subscripts set small and low), node potentials and powers.
 *
 * Drawing order: wires and symbols, current arrowheads, labels (each
 * anchored to what it names, ADR 0035), junction dots last.
 */

import type { Block, FigureSpec, Mark, MarkSegment, Point, Scene, TextRun } from "../../ir/types.ts";
import { SpecError, parseSpec, runsText } from "../../ir/types.ts";
import { LOCALES, formatNumber, snapExact } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { MARGIN as PLACE_MARGIN, Placer, aroundPoint } from "../construction/place.ts";
import { CircuitError, solveWithDiodes } from "./mna.ts";
import type { DiodeSolution, MnaDiode, MnaElement, MnaKind } from "./mna.ts";
import { TERMINAL_R, halfLength, halfWidth, internalParts, samplePath, switchTerminals, symbolPaths } from "./symbols.ts";
import type { Op, SymbolExtras, SymbolKind } from "./symbols.ts";
import { rectAt } from "../../geometry/hit.ts";
import { hasScripts, layoutPanel, rich, runsWidth } from "../shared/panel.ts";
import type { PanelLineInput } from "../shared/panel.ts";

// ---- input ------------------------------------------------------------------------

export const KINDS = [
  "resistor",
  "lamp",
  "battery",
  "voltage-source",
  "current-source",
  "wire",
  "switch",
  "ammeter",
  "voltmeter",
  "led",
  "diode",
  "load",
  "potentiometer",
] as const;
export type ComponentKind = (typeof KINDS)[number];

/** A number, or a multiple of one symbol: "R", "2R", "0,2 R_c", "E". */
export type Quantity = number | string;

/** A tap on a potentiometer: a node at a fraction `at` (0 < at < 1, or "1/6") of its length from `from`. */
export type TapSpec = { node: string; at: number | string };

/** A node's place: grid coordinates, or an offset from another node (a tap included). */
export type NodeSpec = [number, number] | { at: string; dx?: number; dy?: number };

export type CircuitComponent = {
  /** Required for every kind but `wire`. */
  id?: string;
  kind: ComponentKind;
  from: string;
  to: string;
  /** The corner of an L-shaped run, in grid coordinates. */
  via?: [number, number];
  /**
   * Ω for resistor, lamp, load and potentiometer (its total), V for battery and
   * voltage-source (+ at `to`), A for current-source (flowing from `from` to
   * `to` through it). A string is a multiple of one symbol ("2R", "0,2 R_c").
   */
  value?: Quantity;
  /** A battery only: its internal resistance. The battery is then drawn with r in series inside a dashed box. */
  r?: Quantity;
  /** An LED or diode: its forward voltage in V (default 0, an ideal diode). Current flows from `from` (anode) to `to` (cathode). */
  vf?: number;
  /** A load only: the text inside the box. Default "aparelho". */
  label?: string;
  /** A load only: its rated power (W) and voltage (V), instead of `value`; R = U²/P is derived. */
  rated?: { power: number; voltage: number };
  /** A potentiometer only: the taps, `[{ node, at }]` or `{ equal: ["A", "B", "C"] }` for equal divisions. */
  taps?: TapSpec[] | { equal: string[] };
  /** Draw no value beside the component (a figure whose resistances are the unknown). Default false. */
  hideValue?: boolean;
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
  /** Print each non-ideal source's terminal voltage: U = ε − r·i. Default false. */
  terminal?: boolean;
  /** Print whether each LED/diode conducts and its current. Default true when the circuit has one. */
  states?: boolean;
};

export type CircuitInput = {
  /** Grid coordinates, y upward. */
  nodes: Record<string, NodeSpec>;
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
const LIT = "#F2C94C"; // an LED that conducts
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
const PANEL_LINE_H = 24;
const POT_HALF = 5;

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

/** A current: in mA below 0,1 A ("20 mA"), where the school problems with LEDs live; otherwise in A. */
export function ampere(value: number, locale: Locale): { rel: "=" | "≈"; text: string } {
  if (value !== 0 && Math.abs(value) < 0.1) {
    const q = quantity(value * 1000, locale);
    return { rel: q.rel, text: `${q.text} mA` };
  }
  return withUnit(value, "A", locale);
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

// ---- symbolic quantities -----------------------------------------------------------------

/** A parsed value: `coef` times the symbol `sym` (rich markup, "R" or "R_{c}"), or a plain number. */
export type Qty = { coef: number; sym?: string };

const SYMBOLIC = /^\s*(\d+(?:[.,]\d+)?)?\s*[*·×]?\s*([A-Za-zΑ-Ωα-ω])(?:_\{?([A-Za-z0-9]+)\}?)?\s*$/;

/** A number as is; a string as a multiple of one symbol. Refuses anything else, naming where. */
export function parseQty(raw: unknown, path: string): Qty {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new SpecError(`${path} must be a finite number`);
    return { coef: raw };
  }
  if (typeof raw !== "string") throw new SpecError(`${path} must be a number or a multiple of one symbol such as "2R", got ${JSON.stringify(raw)}`);
  const m = SYMBOLIC.exec(raw);
  if (m === null) throw new SpecError(`${path} ${JSON.stringify(raw)} is neither a number nor a multiple of one symbol -- write "R", "2R" or "0,2 R_c"`);
  const coef = m[1] === undefined ? 1 : Number(m[1].replace(",", "."));
  if (!(coef > 0)) throw new SpecError(`${path} ${JSON.stringify(raw)}: the multiple must be positive`);
  return { coef, sym: m[3] === undefined ? m[2]! : `${m[2]}_{${m[3]}}` };
}

/** How a quantity is written: "12", "R", "2R", "0,2 R_c" (as rich markup). */
function qtyText(q: Qty, locale: Locale): string {
  if (q.sym === undefined) return formatNumber(q.coef, locale);
  if (q.coef === 1) return q.sym;
  return `${formatNumber(q.coef, locale)}${Number.isInteger(q.coef) ? "" : " "}${q.sym}`;
}

/** k·num/den as a reader writes it: E/(3R), 2E/(3R), 2E/3, 5E²/(11R); "≈" when k is no small fraction. */
function symExpr(k: number, num: string, den: string, locale: Locale): { rel: "=" | "≈"; text: string } {
  if (Math.abs(k) < 1e-12) return { rel: "=", text: "0" };
  const sign = k < 0 ? "−" : "";
  const a = Math.abs(k);
  let p = 0;
  let q = 0;
  for (let qq = 1; qq <= 400; qq += 1) {
    const pp = Math.round(a * qq);
    if (pp > 0 && Math.abs(a * qq - pp) <= 1e-9 * Math.max(1, a * qq)) {
      p = pp;
      q = qq;
      break;
    }
  }
  if (q === 0) {
    const dec = quantity(a, locale);
    return { rel: "≈", text: `${sign}${dec.text} ${num}${den === "" ? "" : `/${den}`}` };
  }
  const numer = `${p === 1 ? "" : p}${num}`;
  if (den === "") return { rel: "=", text: q === 1 ? `${sign}${numer}` : `${sign}${numer}/${q}` };
  return { rel: "=", text: `${sign}${numer}/${q === 1 ? den : `(${q}${den})`}` };
}

// ---- the netlist ------------------------------------------------------------------------

export function mnaKindOf(c: CircuitComponent): MnaKind | null {
  switch (c.kind) {
    case "resistor":
    case "lamp":
    case "load":
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
    case "led":
    case "diode":
    case "potentiometer":
      return null;
  }
}

type Comp = CircuitComponent & { id: string; index: number };

function normalise(input: CircuitInput): Comp[] {
  let w = 0;
  return input.components.map((c, index) => ({ ...c, id: c.id ?? `w${(w += 1)}`, index }));
}

const compPath = (c: Comp): string => `circuit.components[${c.index}] (${c.id})`;

type Tap = { node: string; at: number };

function parseFraction(raw: number | string, path: string): number {
  if (typeof raw === "number") return raw;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+(?:[.,]\d+)?))?\s*$/.exec(raw);
  if (m === null) throw new SpecError(`${path} ${JSON.stringify(raw)} must be a number between 0 and 1 or a fraction such as "1/6"`);
  const a = Number(m[1]!.replace(",", "."));
  return m[2] === undefined ? a : a / Number(m[2].replace(",", "."));
}

function tapsOf(c: Comp): Tap[] {
  if (c.taps === undefined) return [];
  const path = `${compPath(c)}.taps`;
  let taps: Tap[];
  if (Array.isArray(c.taps)) {
    taps = c.taps.map((t, i) => ({ node: t.node, at: parseFraction(t.at, `${path}[${i}].at`) }));
  } else {
    const names = c.taps.equal;
    taps = names.map((node, i) => ({ node, at: (i + 1) / (names.length + 1) }));
  }
  taps.sort((a, b) => a.at - b.at);
  taps.forEach((t, i) => {
    if (!(t.at > 0 && t.at < 1)) throw new SpecError(`${path}: tap ${t.node} is at ${t.at}, but a tap lies strictly between the two ends (0 < at < 1)`);
    if (i > 0 && t.at - taps[i - 1]!.at < 1e-9) throw new SpecError(`${path}: taps ${taps[i - 1]!.node} and ${t.node} are at the same place`);
  });
  return taps;
}

type Prepared = {
  comps: Comp[];
  /** Every node's grid position: the given ones, those placed relative to another, and the taps. */
  nodes: Record<string, [number, number]>;
  taps: Map<string, Tap[]>;
  tapNodes: Set<string>;
};

/** The components, and every node resolved to a grid position (taps from their wire, offsets from their base). */
export function prepare(input: CircuitInput): Prepared {
  const comps = normalise(input);
  const taps = new Map<string, Tap[]>();
  const owner = new Map<string, { comp: Comp; at: number }>();
  for (const c of comps) {
    if (c.kind !== "potentiometer") continue;
    const list = tapsOf(c);
    taps.set(c.id, list);
    for (const t of list) {
      if (t.node in input.nodes) throw new SpecError(`${compPath(c)}.taps: ${t.node} is also in "nodes" -- a tap's place is derived from its wire, so leave it out of "nodes"`);
      if (owner.has(t.node)) throw new SpecError(`${compPath(c)}.taps: node ${t.node} is a tap of two potentiometers`);
      owner.set(t.node, { comp: c, at: t.at });
    }
  }
  const nodes: Record<string, [number, number]> = {};
  const stack: string[] = [];
  const resolve = (name: string): [number, number] => {
    const done = nodes[name];
    if (done !== undefined) return done;
    if (stack.includes(name)) throw new SpecError(`circuit.nodes: ${[...stack.slice(stack.indexOf(name)), name].join(" → ")} place each other in a cycle`);
    stack.push(name);
    let at: [number, number];
    const tap = owner.get(name);
    if (tap !== undefined) {
      if (!(tap.comp.from in input.nodes) && !owner.has(tap.comp.from)) throw new SpecError(`${compPath(tap.comp)}: unknown node ${JSON.stringify(tap.comp.from)}`);
      if (!(tap.comp.to in input.nodes) && !owner.has(tap.comp.to)) throw new SpecError(`${compPath(tap.comp)}: unknown node ${JSON.stringify(tap.comp.to)}`);
      const a = resolve(tap.comp.from);
      const b = resolve(tap.comp.to);
      at = [a[0] + (b[0] - a[0]) * tap.at, a[1] + (b[1] - a[1]) * tap.at];
    } else {
      const spec = input.nodes[name];
      if (spec === undefined) throw new SpecError(`circuit: unknown node ${JSON.stringify(name)}`);
      if (Array.isArray(spec)) at = [spec[0], spec[1]];
      else {
        if (!(spec.at in input.nodes) && !owner.has(spec.at)) throw new SpecError(`circuit.nodes.${name}: "at" refers to node ${JSON.stringify(spec.at)}, which does not exist`);
        const base = resolve(spec.at);
        at = [base[0] + (spec.dx ?? 0), base[1] + (spec.dy ?? 0)];
      }
    }
    stack.pop();
    nodes[name] = at;
    return at;
  };
  for (const name of [...Object.keys(input.nodes), ...owner.keys()]) resolve(name);
  const ordered: Record<string, [number, number]> = {};
  for (const name of [...Object.keys(input.nodes), ...owner.keys()]) ordered[name] = nodes[name]!;
  return { comps, nodes: ordered, taps, tapNodes: new Set(owner.keys()) };
}

type Item = { id: string; from: string; to: string; kind: MnaKind; comp: string };

export type Net = {
  /** Every node of the solved system: the named ones, plus the junction inside each non-ideal source. */
  nodes: string[];
  elements: MnaElement[];
  diodes: MnaDiode[];
  /** What carries a branch current: each conducting component (its terminals), the segments of a potentiometer. */
  items: Item[];
  /** The resistance each resistive element was solved with (in units of the symbol, when symbolic), by element id. */
  resistance: Map<string, number>;
  /** Set when values are multiples of symbols: the resistance symbol and the EMF symbol (rich markup). Solved with each symbol = 1. */
  symbolic: { r: string; e: string } | null;
  prep: Prepared;
};

const describeList = (xs: string[]): string => (xs.length <= 3 ? xs.join(", ") : `${xs.slice(0, 3).join(", ")}, …`);

/** The solver's netlist: every component as MNA elements, and the symbolic scale if any value is a symbol. */
export function buildNet(input: CircuitInput, prep: Prepared = prepare(input)): Net {
  const comps = prep.comps;
  type Entry = { c: Comp; q: Qty };
  const resist: Entry[] = [];
  const emf: Entry[] = [];
  const parsed = new Map<string, { value?: Qty; r?: Qty }>();
  for (const c of comps) {
    const value = c.value === undefined ? undefined : parseQty(c.value, `${compPath(c)}.value`);
    const r = c.r === undefined ? undefined : parseQty(c.r, `${compPath(c)}.r`);
    parsed.set(c.id, { ...(value === undefined ? {} : { value }), ...(r === undefined ? {} : { r }) });
    if (value !== undefined && (c.kind === "resistor" || c.kind === "lamp" || c.kind === "potentiometer" || c.kind === "load")) resist.push({ c, q: value });
    if (value !== undefined && (c.kind === "battery" || c.kind === "voltage-source")) emf.push({ c, q: value });
    if (r !== undefined) resist.push({ c, q: r });
  }
  const anySym = [...resist, ...emf].some((e) => e.q.sym !== undefined);
  let symbolic: Net["symbolic"] = null;
  if (anySym) {
    const numeric = (list: Entry[]): string[] => list.filter((e) => e.q.sym === undefined).map((e) => e.c.id);
    if (numeric(resist).length > 0) throw new SpecError(`circuit: resistances mix symbols and numbers (${describeList(numeric(resist))} ${numeric(resist).length === 1 ? "is" : "are"} numeric) -- give every resistance as a multiple of the same symbol, or none of them`);
    if (numeric(emf).length > 0) throw new SpecError(`circuit: EMFs mix symbols and numbers (${describeList(numeric(emf))} ${numeric(emf).length === 1 ? "is" : "are"} numeric) -- give every EMF as a multiple of the same symbol, or none of them`);
    if (resist.length === 0 || emf.length === 0) throw new SpecError("circuit: a symbolic circuit needs both its resistances and its EMFs as multiples of a symbol (resistances of R, EMFs of E)");
    const rs = [...new Set(resist.map((e) => e.q.sym!))];
    const es = [...new Set(emf.map((e) => e.q.sym!))];
    if (rs.length > 1) throw new SpecError(`circuit: more than one resistance symbol (${rs.join(", ")}) -- the solver scales by ONE: write every resistance as a multiple of ${rs[0]}`);
    if (es.length > 1) throw new SpecError(`circuit: more than one EMF symbol (${es.join(", ")}) -- the solver scales by ONE: write every EMF as a multiple of ${es[0]}`);
    if (rs[0] === es[0]) throw new SpecError(`circuit: the resistances and the EMFs both use the symbol ${rs[0]} -- they are different quantities`);
    for (const c of comps) {
      if (c.kind === "current-source") throw new SpecError(`${compPath(c)}: a current source cannot be combined with symbolic values (its amperes would be a third scale)`);
      if ((c.kind === "led" || c.kind === "diode") && (c.vf ?? 0) > 0) throw new SpecError(`${compPath(c)}: a forward voltage in volts cannot be combined with symbolic values -- use an ideal diode (no vf) or numbers throughout`);
      if (c.kind === "load" && c.rated !== undefined) throw new SpecError(`${compPath(c)}: a rated load (W, V) cannot be combined with symbolic values -- give its resistance as a multiple of the symbol`);
    }
    symbolic = { r: rs[0]!, e: es[0]! };
  }

  const nodes = Object.keys(prep.nodes);
  const elements: MnaElement[] = [];
  const diodes: MnaDiode[] = [];
  const items: Item[] = [];
  const resistance = new Map<string, number>();
  const addR = (id: string, a: string, b: string, value: number): void => {
    elements.push({ id, kind: "R", a, b, value });
    resistance.set(id, value);
  };
  for (const c of comps) {
    const q = parsed.get(c.id)!;
    const value = q.value?.coef ?? 0;
    switch (c.kind) {
      case "resistor":
      case "lamp":
        addR(c.id, c.from, c.to, value);
        items.push({ id: c.id, from: c.from, to: c.to, kind: "R", comp: c.id });
        break;
      case "load": {
        const R = c.rated === undefined ? value : c.rated.voltage ** 2 / c.rated.power;
        addR(c.id, c.from, c.to, R);
        items.push({ id: c.id, from: c.from, to: c.to, kind: "R", comp: c.id });
        break;
      }
      case "battery":
      case "voltage-source":
        if (q.r === undefined) {
          elements.push({ id: c.id, kind: "V", a: c.from, b: c.to, value });
        } else {
          // The EMF, then r, in series towards the + terminal: from → (EMF) → inside → (r) → to.
          const inside = `${c.id}#i`;
          nodes.push(inside);
          elements.push({ id: c.id, kind: "V", a: c.from, b: inside, value });
          addR(`${c.id}#r`, inside, c.to, q.r.coef);
        }
        items.push({ id: c.id, from: c.from, to: c.to, kind: "V", comp: c.id });
        break;
      case "current-source":
        elements.push({ id: c.id, kind: "I", a: c.from, b: c.to, value });
        items.push({ id: c.id, from: c.from, to: c.to, kind: "I", comp: c.id });
        break;
      case "wire":
        elements.push({ id: c.id, kind: "W", a: c.from, b: c.to, value: 0 });
        break;
      case "switch":
        if (c.closed === true) elements.push({ id: c.id, kind: "W", a: c.from, b: c.to, value: 0 });
        break;
      case "ammeter":
        elements.push({ id: c.id, kind: "A", a: c.from, b: c.to, value: 0 });
        items.push({ id: c.id, from: c.from, to: c.to, kind: "A", comp: c.id });
        break;
      case "voltmeter":
        break;
      case "led":
      case "diode":
        diodes.push({ id: c.id, a: c.from, b: c.to, vf: c.vf ?? 0 });
        break;
      case "potentiometer": {
        const list = prep.taps.get(c.id) ?? [];
        const stops = [{ node: c.from, at: 0 }, ...list, { node: c.to, at: 1 }];
        for (let k = 0; k < stops.length - 1; k += 1) {
          const id = `${c.id}.${k + 1}`;
          addR(id, stops[k]!.node, stops[k + 1]!.node, value * (stops[k + 1]!.at - stops[k]!.at));
          items.push({ id, from: stops[k]!.node, to: stops[k + 1]!.node, kind: "R", comp: c.id });
        }
        break;
      }
    }
  }
  return { nodes, elements, diodes, items, resistance, symbolic, prep };
}

export type CircuitSolution = DiodeSolution & { net: Net };

/** Solve the circuit. Exported so a test can read the numbers without drawing. */
export function solveCircuit(input: CircuitInput): CircuitSolution {
  const net = buildNet(input);
  try {
    const sol = solveWithDiodes({ nodes: net.nodes, elements: net.elements, ...(input.ground === undefined ? {} : { ground: input.ground }) }, net.diodes);
    // A diode's own current runs anode → cathode, whatever the solver's internal element said.
    for (const [id, st] of sol.diodes) sol.current.set(id, st.current);
    return { ...sol, net };
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
export function checkLayout(input: CircuitInput, comps: Comp[], locale: Locale, prep: Prepared = prepare(input)): void {
  const nodes = prep.nodes;
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
      if (c.kind === "potentiometer") {
        // A potentiometer's run is split at its taps: a wire may meet it there.
        const stops = [p, ...(prep.taps.get(c.id) ?? []).map((t) => nodes[t.node]!), q];
        for (let s = 0; s < stops.length - 1; s += 1) legs.push({ comp: c.id, p: stops[s]!, q: stops[s + 1]! });
      } else legs.push({ comp: c.id, p, q });
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
    const own = new Set([c.from, c.to, ...(prep.taps.get(c.id) ?? []).map((t) => t.node)]);
    for (const name of names) {
      if (own.has(name)) continue;
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

function markFrom(id: string, start: Point, ops: Op[], stroke: string, width: number, fill?: string, close?: boolean, dashed?: boolean): Mark {
  const segments: MarkSegment[] = ops.map((op) => ("arc" in op ? { arc: op.arc, centre: op.centre } : { line: op.line }));
  return { id, from: start, segments, close: close ?? false, fill: fill ?? "none", stroke, strokeWidth: width, ...(dashed === true ? { lineStyle: "dashed" as const } : {}) };
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

// ---- branches -----------------------------------------------------------------------------------

export type Branch = {
  /** Item ids in input order (a component's id; a potentiometer's segments are `P1.1`, `P1.2`, …); every one carries the same current. */
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
 * An ideal voltmeter, an open switch and a diode that does not conduct carry
 * nothing and join nothing.
 */
export function analyseBranches(input: CircuitInput, sol: CircuitSolution): Branch[] {
  const items: Item[] = [...sol.net.items];
  for (const c of sol.net.prep.comps) {
    if ((c.kind === "led" || c.kind === "diode") && sol.diodes.get(c.id)?.on === true) items.push({ id: c.id, from: c.from, to: c.to, kind: "V", comp: c.id });
  }
  const order = new Map(sol.net.prep.comps.map((c, i) => [c.id, i]));
  items.sort((a, b) => order.get(a.comp)! - order.get(b.comp)! || (a.id < b.id ? -1 : 1));
  void input;
  const byRoot = new Map<string, string[]>();
  for (const c of items) {
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
  for (const c of items) {
    const r = find(c.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(c.id);
  }
  const scale = Math.max(1e-12, ...items.map((c) => Math.abs(sol.current.get(c.id) ?? 0)));
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
  const prep = prepare(input);
  const comps = prep.comps;
  checkLayout(input, comps, locale, prep);
  const sol = solveCircuit(input);
  const net = sol.net;
  const symbolic = net.symbolic;
  const I = (id: string): number => sol.current.get(id) ?? 0;
  const V = (node: string, path: string): number => {
    const p = sol.potential.get(node);
    if (p === undefined) throw new SpecError(`${path}: node ${node} is connected to nothing that conducts, so its potential is undetermined`);
    return p;
  };
  /** Values of one quantity as printed: numbers with their unit, or -- in a symbolic circuit -- multiples of E/R, E, E²/R. */
  const fmt = (value: number, unit: "A" | "V" | "W"): { rel: "=" | "≈"; text: string } => {
    if (symbolic === null) return unit === "A" ? ampere(value, locale) : withUnit(value, unit, locale);
    if (unit === "A") return symExpr(value, symbolic.e, symbolic.r, locale);
    if (unit === "V") return symExpr(value, symbolic.e, "", locale);
    return symExpr(value, `${symbolic.e}^{2}`, symbolic.r, locale);
  };
  const withRel = (value: number, unit: "A" | "V" | "W"): string => {
    const q = fmt(value, unit);
    return `${q.rel} ${q.text}`;
  };

  // ---- the page -------------------------------------------------------------------------
  const nodes = prep.nodes;
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
  const panel: PanelLineInput[] = [];
  const branches = analyseBranches(input, sol);
  if (answers && currentsIn === "panel" && show.currents !== false) {
    const items = branches.map((b) => {
      const q = fmt(Math.abs(b.current), "A");
      return `${b.name} ${q.rel} ${q.text}`;
    });
    for (let k = 0; k < items.length; k += 3) panel.push({ text: items.slice(k, k + 3).join(" ".repeat(5)), id: `currents-${k / 3 + 1}`, wrap: false });
  }
  const diodeComps = comps.filter((c) => c.kind === "led" || c.kind === "diode");
  if (answers && diodeComps.length > 0 && show.states !== false) {
    diodeComps.forEach((c) => {
      const st = sol.diodes.get(c.id)!;
      const word = c.kind === "led" ? (st.on ? "aceso" : "apagado") : st.on ? "conduz" : "não conduz";
      panel.push({ text: st.on ? `${displayName(c.id)}: ${word}, i ${withRel(st.current, "A")}` : `${displayName(c.id)}: ${word}`, id: `state-${c.id}`, wrap: false });
    });
  }
  (show.voltages ?? []).forEach(([a, b], i) => {
    if (!answers) return;
    const path = `circuit.show.voltages[${i}]`;
    for (const n of [a, b]) if (!(n in nodes)) throw new SpecError(`${path}: unknown node ${JSON.stringify(n)}`);
    const u = V(a, path) - V(b, path);
    panel.push({ text: [{ text: "U" }, { text: `${a}${b}`, script: "sub" }, { text: " = V" }, { text: a, script: "sub" }, { text: " − V" }, { text: b, script: "sub" }, ...rich(` ${withRel(u, "V")}`)], id: `u-${i + 1}`, wrap: false });
  });
  if (show.terminal === true && answers) {
    for (const c of comps) {
      if (c.kind !== "battery" || c.r === undefined) continue;
      const i = I(c.id);
      const u = V(c.to, compPath(c)) - V(c.from, compPath(c));
      const head = `U_{${c.id}} = ε − r·i`;
      if (symbolic !== null) {
        panel.push({ text: `${head} ${withRel(u, "V")}`, id: `terminal-${c.id}`, wrap: false });
        continue;
      }
      const e = parseQty(c.value, "").coef;
      const r = parseQty(c.r, "").coef;
      const qi = quantity(i, locale);
      const arith = qi.rel === "=" ? ` = ${formatNumber(e, locale)} − ${formatNumber(r, locale)} · ${i < 0 ? `(${qi.text})` : qi.text}` : "";
      panel.push({ text: `${head}${arith} ${withRel(u, "V")}`, id: `terminal-${c.id}`, wrap: false });
    }
  }
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
      panel.push({ text: [{ text: "V" }, { text: n, script: "sub" }, ...rich(` ${sol.merged.get(n) === sol.merged.get(sol.ground) ? "= 0 (referência)" : withRel(pot, "V")}`)], id: `v-${n}`, wrap: false });
    }
  }
  if (show.power === true && answers) {
    const R = (id: string): number => net.resistance.get(id) ?? 0;
    for (const c of comps) {
      let p: number;
      let role = "";
      let tag = c.id;
      if (c.kind === "resistor" || c.kind === "lamp" || c.kind === "load") p = I(c.id) ** 2 * R(c.id);
      else if (c.kind === "potentiometer") p = net.items.filter((it) => it.comp === c.id).reduce((s, it) => s + I(it.id) ** 2 * R(it.id), 0);
      else if (c.kind === "battery" || c.kind === "voltage-source") {
        p = parseQty(c.value, "").coef * I(c.id);
        role = p >= 0 ? " (fornecida)" : " (recebida)";
        if (c.r !== undefined) {
          const pr = I(c.id) ** 2 * R(`${c.id}#r`);
          panel.push({ text: [{ text: "P" }, { text: `${c.id},r`, script: "sub" }, ...rich(` ${withRel(pr, "W")}`)], id: `p-${c.id}-r`, wrap: false });
        }
      } else if (c.kind === "current-source") {
        p = c.value! as number * (V(c.to, "power") - V(c.from, "power"));
        role = p >= 0 ? " (fornecida)" : " (recebida)";
      } else if (c.kind === "led" || c.kind === "diode") {
        p = (c.vf ?? 0) * I(c.id);
        if (Math.abs(p) < 1e-12) continue;
        role = " (recebida)";
        tag = c.id;
      } else continue;
      const q = fmt(Math.abs(p), "W");
      panel.push({ text: [{ text: "P" }, { text: tag, script: "sub" }, ...rich(` ${Math.abs(p) < 1e-12 ? `${q.rel} ${q.text}` : `${q.rel} ${q.text}${role}`}`)], id: `p-${c.id}`, wrap: false });
    }
  }
  const readingPanel = layoutPanel(panel, { width: Infinity, size: PANEL_SIZE, lineHeight: PANEL_LINE_H });
  const panelW = readingPanel.width;
  const panelH = readingPanel.empty ? 0 : readingPanel.height + 16;
  const width = Math.max(plotW, Math.ceil(panelW + 2 * 40));
  const height = plotH + panelH;
  const ox = (width - plotW) / 2 + MARGIN_X;
  const oy = MARGIN_Y;
  const X = (p: [number, number]): Point => ({ x: ox + (p[0] - xmin) * unit, y: oy + (ymax - p[1]) * unit });
  const K = { x: ox + ((xmax - xmin) * unit) / 2, y: oy + ((ymax - ymin) * unit) / 2 };

  const board = new Board(width, height, PAPER);
  const placer = new Placer({ x: 8, y: 8, width: width - 16, height: plotH - 12 });

  const draw = (id: string, start: Point, ops: Op[], stroke: string, w: number, fill?: string, close?: boolean, dashed?: boolean): void => {
    board.marks.push(markFrom(id, start, ops, stroke, w, fill, close, dashed));
    const sampled = samplePath(start, ops);
    const ink = close === true ? [...sampled, start] : sampled;
    board.trace(ink, stroke, w, id);
    placer.addInk(id, ink, true);
  };

  // Labels whose text may carry sub/superscripts (`R_{c}`, `E^{2}`): measured as runs, drawn as one block.
  type Style = { size: number; weight: number; colour: string };
  const extentOf = (text: string, style: Style): { w: number; h: number } => {
    const runs = rich(text);
    const plain = runsText(runs);
    const plainBox = board.extent(plain, style);
    return hasScripts(runs) ? { w: runsWidth(runs, style.size, style.weight), h: plainBox.h } : plainBox;
  };
  const putLabel = (text: string, centre: Point, style: Style, w: number, claim: { annotates?: string; annotatesPlace?: Point }, id: string): void => {
    const runs: TextRun[] = rich(text);
    const block: Block = board.label(runsText(runs), centre.x, centre.y, { ...style, width: w, ...claim, id });
    if (hasScripts(runs)) block.runs = runs;
  };
  const valueStyle: Style = { size: LABEL_SIZE, weight: 400, colour: INK };

  // ---- components ---------------------------------------------------------------------------
  const laid: Laid[] = [];
  const segLaid: Laid[] = [];
  for (const c of comps) {
    const pts = gridPath(c, nodes).map(X);
    if (c.kind === "wire") {
      draw(c.id, pts[0]!, pts.slice(1).map((p) => ({ line: p })), INK, 2);
      const hosts = pts.slice(1).map((p, k) => ({ a: pts[k]!, b: p }));
      laid.push({ comp: c, pts, mainId: c.id, hosts });
      continue;
    }
    if (c.kind === "potentiometer") {
      // A resistive wire: a long thin box from end to end, its taps marked by dots on its axis.
      const a = pts[0]!;
      const b = pts[1]!;
      const d = unitVec(a, b);
      const n = { x: -d.y, y: d.x };
      const cen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const facing = n.x * (cen.x - K.x) + n.y * (cen.y - K.y);
      const outside: 1 | -1 = Math.abs(facing) > 1 ? (facing > 0 ? 1 : -1) : n.y < -0.5 || n.x > 0.5 ? 1 : -1;
      const corner = (along: number, across: number): Point => ({ x: a.x + (b.x - a.x) * along + n.x * across, y: a.y + (b.y - a.y) * along + n.y * across });
      // The axis is part of the same mark, so a tap on it lies ON the wire (what makes the place, ADR 0035).
      draw(c.id, corner(0, 0), [{ line: corner(0, POT_HALF) }, { line: corner(1, POT_HALF) }, { line: corner(1, -POT_HALF) }, { line: corner(0, -POT_HALF) }, { line: corner(0, 0) }, { line: corner(1, 0) }], INK, 2, PAPER, true);
      laid.push({ comp: c, pts, sym: { k: 0, c: cen, d, n, hl: Math.hypot(b.x - a.x, b.y - a.y) / 2, hw: POT_HALF, outside, kind: "resistor" }, mainId: c.id, hosts: [] });
      const stops = [{ node: c.from, at: 0 }, ...(prep.taps.get(c.id) ?? []), { node: c.to, at: 1 }];
      for (let k = 0; k < stops.length - 1; k += 1) {
        const p0 = corner(stops[k]!.at, 0);
        const p1 = corner(stops[k + 1]!.at, 0);
        const ds = unitVec(p0, p1);
        const seg: Comp = { kind: "resistor", id: `${c.id}.${k + 1}`, from: stops[k]!.node, to: stops[k + 1]!.node, index: c.index };
        segLaid.push({
          comp: seg,
          pts: [p0, p1],
          sym: { k: 0, c: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, d: ds, n: { x: -ds.y, y: ds.x }, hl: 0, hw: POT_HALF, outside, kind: "resistor" },
          mainId: c.id,
          hosts: [{ a: p0, b: p1 }],
        });
      }
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
    const d = unitVec(a, b);
    const n = { x: -d.y, y: d.x };
    const extras: SymbolExtras = { internal: c.kind === "battery" && c.r !== undefined };
    const loadText = c.label ?? "aparelho";
    if (kind === "load") {
      const e = extentOf(loadText, valueStyle);
      const horizontal = Math.abs(d.x) > 0.5;
      extras.load = horizontal ? { al: Math.max(e.w / 2 + 10, 24), ac: e.h / 2 + 6 } : { al: Math.max(e.h / 2 + 8, 16), ac: e.w / 2 + 10 };
    }
    const hl = halfLength(kind, extras);
    if (legLen < 2 * hl + 2 * MIN_LEAD) {
      throw new SpecError(`circuit.components[${c.index}] (${c.id}): its longest straight run is ${Math.round(legLen)} px, too short for a ${c.kind} symbol (needs ${2 * hl + 2 * MIN_LEAD} px) -- move its nodes further apart`);
    }
    const cen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const facing = n.x * (cen.x - K.x) + n.y * (cen.y - K.y);
    const outside: 1 | -1 = Math.abs(facing) > 1 ? (facing > 0 ? 1 : -1) : n.y < -0.5 || n.x > 0.5 ? 1 : -1;
    const bodyStart = { x: cen.x - d.x * hl, y: cen.y - d.y * hl };
    const bodyEnd = { x: cen.x + d.x * hl, y: cen.y + d.y * hl };
    const lead = [...pts.slice(0, k + 1), bodyStart];
    const tail = pts.slice(k + 1);
    const lit = answers && (kind === "led" || kind === "diode") && sol.diodes.get(c.id)?.on === true;
    for (const path of symbolPaths(kind, cen, d, lead, tail, { iec, closed: c.closed === true, outside, ...(extras.internal === true ? { internal: true } : {}), ...(extras.load === undefined ? {} : { load: extras.load }), lit })) {
      const fill = path.fill === "ink" ? INK : path.fill === "paper" ? PAPER : path.fill === "lit" ? LIT : path.fill;
      draw(`${c.id}${path.part}`, path.start, path.ops, INK, path.width, fill, path.close, path.dashed);
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
    laid.push({ comp: c, pts, sym: { k, c: cen, d, n, hl, hw: halfWidth(kind, c.kind === "switch" && c.closed !== true, extras), outside, kind }, mainId: c.id, hosts });
    if (kind === "load") {
      const e = extentOf(loadText, valueStyle);
      putLabel(loadText, cen, valueStyle, e.w, { annotates: c.id }, `label-${c.id}-name`);
      placer.commit(rectAt(cen, e.w, e.h));
    }
  }

  // ---- junctions: three or more runs meeting at a node; and every tap -------------------------
  const ends = new Map<string, number>();
  for (const c of comps) for (const t of [c.from, c.to]) ends.set(t, (ends.get(t) ?? 0) + 1);
  const junctions = names.filter((n) => (ends.get(n) ?? 0) >= 3 || prep.tapNodes.has(n));
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
  const placeBeside = (claim: string, text: string, style: Style, p: Point, d: Point, hw: number, side: 1 | -1, alongs: number[], id: string): void => {
    const { w, h } = extentOf(text, style);
    const best = placer.choose({ kind: "element", id: claim }, w, h, beside(p, d, hw, w, h, alongs, side));
    putLabel(text, best.centre, style, w, { annotates: claim }, id);
    placer.commit(rectAt(best.centre, w, h));
  };
  for (const l of laid) {
    const c = l.comp;
    const s = l.sym;
    if (s === undefined) continue;
    let text: string | undefined;
    const valuePath = compPath(c);
    const q = c.value === undefined ? undefined : parseQty(c.value, `${valuePath}.value`);
    if (c.kind === "resistor" || c.kind === "lamp" || c.kind === "potentiometer") text = `${qtyText(q!, locale)}${q!.sym === undefined ? " Ω" : ""}`;
    else if (c.kind === "load") text = c.rated === undefined ? `${qtyText(q!, locale)}${q!.sym === undefined ? " Ω" : ""}` : `${formatNumber(c.rated.power, locale)} W, ${formatNumber(c.rated.voltage, locale)} V`;
    else if (c.kind === "battery" || c.kind === "voltage-source") text = `${qtyText(q!, locale)}${q!.sym === undefined ? " V" : ""}`;
    else if (c.kind === "current-source") text = `${formatNumber(q!.coef, locale)} A`;
    else if ((c.kind === "led" || c.kind === "diode") && (c.vf ?? 0) > 0) text = `V_{f} = ${formatNumber(c.vf!, locale)} V`;
    if (c.hideValue === true) text = undefined;
    else if (show.names === true && c.kind !== "ammeter" && c.kind !== "voltmeter") {
      if (c.kind === "led" || c.kind === "diode") text = text === undefined ? displayName(c.id) : `${displayName(c.id)} (${text})`;
      else text = text === undefined ? displayName(c.id) : `${displayName(c.id)} = ${text}`;
    }
    const internal = c.kind === "battery" && c.r !== undefined;
    // The battery's label sits by the long plate, the one it names.
    const alongs = c.kind === "battery" ? [4] : [0, -6, 6];
    const anchor = internal ? internalParts(s.c, s.d).battery : s.c;
    if (text !== undefined) placeBeside(internal ? `${l.mainId}-box` : l.mainId, text, valueStyle, anchor, s.d, s.hw, s.outside, alongs, `label-${c.id}`);
    if (internal && c.hideValue !== true) {
      const rq = parseQty(c.r, `${valuePath}.r`);
      const rText = `r = ${qtyText(rq, locale)}${rq.sym === undefined ? " Ω" : ""}`;
      placeBeside(`${l.mainId}-box`, rText, valueStyle, internalParts(s.c, s.d).resistor, s.d, s.hw, s.outside, [0, -6, 6], `label-${c.id}-r`);
    }
    if (c.kind === "ammeter" || c.kind === "voltmeter") {
      const letter = c.kind === "ammeter" ? "A" : "V";
      board.label(letter, s.c.x, s.c.y, { size: 14, weight: 700, colour: INK, width: 14, annotates: l.mainId, id: `label-${c.id}-letter` });
      placer.commit(rectAt(s.c, 14, 18));
      if (!answers) continue;
      const reading = c.kind === "ammeter" ? Math.abs(I(c.id)) : V(c.to, valuePath) - V(c.from, valuePath);
      const rq = fmt(reading, c.kind === "ammeter" ? "A" : "V");
      const readText = `${rq.rel === "≈" ? "≈ " : ""}${rq.text === "0" ? `0 ${c.kind === "ammeter" ? "A" : "V"}` : rq.text}`;
      placeBeside(l.mainId, show.names === true ? `${displayName(c.id)}: ${readText}` : readText, { size: LABEL_SIZE, weight: 700, colour: INK }, s.c, s.d, s.hw, s.outside, [0, -6, 6], `label-${c.id}-reading`);
    }
  }

  // ---- branch currents ------------------------------------------------------------------------
  let crowded = false;
  if (answers && show.currents !== false) drawCurrents();

  function drawCurrents(): void {
    const root = (n: string): string => sol.merged.get(n)!;
    const byId = new Map([...laid, ...segLaid].map((l) => [l.comp.id, l]));
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
        const host = branch.find((l) => l.comp.kind === "resistor" || l.comp.kind === "lamp" || l.comp.kind === "load") ?? branch[0]!;
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
      const q = fmt(Math.abs(i0), "A");
      const text = currentsIn === "panel" ? name : `${name} ${q.rel} ${q.text}`;
      const style = { size: LABEL_SIZE, weight: 600, colour: CURRENT };
      const { w, h } = extentOf(text, style);
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
      putLabel(text, best.centre, style, w, { annotates: id }, `${id}-label`);
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
  readingPanel.draw(board, { top: plotH + 8, cut: plotH, align: "center" });

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

/** A node is [x, y] or { at: <node>, dx?, dy? }. */
function nodeSpec(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    gridPoint(value, path);
    return;
  }
  if (typeof value !== "object" || value === null) throw new SpecError(`${path} must be [x, y] or { "at": "<node>", "dx": …, "dy": … }, got ${JSON.stringify(value)}`);
  const o = value as Record<string, unknown>;
  for (const key of Object.keys(o)) if (!["at", "dx", "dy"].includes(key)) throw new SpecError(`${path}.${key} is not a field of a relative node; the fields are at, dx, dy`);
  v.requiredString(o, "at", path);
  for (const key of ["dx", "dy"]) v.optionalNumber(o, key, path);
}

export function validateCircuitInput(raw: Record<string, unknown>): void {
  const path = "circuit";
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalEnum(raw, "symbols", path, ["zigzag", "iec"]);
  const nodes = v.object(raw.nodes, `${path}.nodes`);
  const nodeNames = Object.keys(nodes);
  if (nodeNames.length < 2) throw new SpecError(`${path}.nodes must name at least two nodes, each with grid coordinates [x, y]`);
  for (const n of nodeNames) nodeSpec(nodes[n], `${path}.nodes.${n}`);
  const known = new Set(nodeNames);
  const comps = v.nonEmptyArray(raw, "components", path, "components");
  // Tap nodes exist from the start: other components may connect to them.
  comps.forEach((item, i) => {
    if (typeof item !== "object" || item === null) return;
    const c = item as Record<string, unknown>;
    if (c.kind !== "potentiometer" || c.taps === undefined) return;
    const at = `${path}.components[${i}].taps`;
    if (Array.isArray(c.taps)) {
      c.taps.forEach((t, k) => {
        const o = v.object(t, `${at}[${k}]`);
        known.add(v.requiredString(o, "node", `${at}[${k}]`));
        if (typeof o.at !== "number" && typeof o.at !== "string") throw new SpecError(`${at}[${k}].at must be a number between 0 and 1 or a fraction such as "1/6"`);
      });
    } else {
      const o = v.object(c.taps, at);
      for (const key of Object.keys(o)) if (key !== "equal") throw new SpecError(`${at}.${key} is not a field of taps; give a list of { node, at } or { "equal": ["A", "B"] }`);
      v.array(o, "equal", at, "node names").forEach((name, k) => known.add(v.requiredString({ name }, "name", `${at}.equal[${k}]`)));
    }
  });
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
    const needsValue: Record<string, string> = { resistor: "its resistance in Ω", lamp: "its resistance in Ω", battery: "its EMF in V", "voltage-source": "its voltage in V", "current-source": "its current in A", potentiometer: "its total resistance in Ω" };
    const resistive = kind === "resistor" || kind === "lamp" || kind === "load" || kind === "potentiometer";
    const check = (key: "value" | "r"): void => {
      const q = parseQty(c[key], `${at}.${key}`);
      if (!(q.coef > 0)) throw new SpecError(`${at}.${key} must be positive, got ${String(c[key])}${key === "value" && !resistive ? " -- to reverse it, swap from and to" : ""}`);
      if (q.sym !== undefined && kind === "current-source") throw new SpecError(`${at}.${key}: a current source takes a number of amperes, not a symbol`);
    };
    if (kind === "load") {
      if (c.value === undefined && c.rated === undefined) throw new SpecError(`${at}: a load needs its resistance in Ω ("value") or its rated power and voltage ("rated": { "power": W, "voltage": V })`);
      if (c.value !== undefined && c.rated !== undefined) throw new SpecError(`${at}: give a load either "value" or "rated", not both -- R = U²/P is derived from the rating`);
      if (c.value !== undefined) check("value");
    } else if (needsValue[kind] !== undefined) {
      if (c.value === undefined) throw new SpecError(`${at}.value is required for a ${kind}: ${needsValue[kind]}`);
      check("value");
    } else if (c.value !== undefined) {
      throw new SpecError(
        `${at}.value has no meaning for a ${kind}${kind === "ammeter" || kind === "voltmeter" ? " -- its reading is computed, never typed" : kind === "led" || kind === "diode" ? " -- its forward voltage is `vf`" : ""}`,
      );
    }
    if (c.r !== undefined) {
      if (kind !== "battery") throw new SpecError(`${at}.r applies only to a battery: the internal resistance of the source`);
      check("r");
    }
    if (c.vf !== undefined) {
      if (kind !== "led" && kind !== "diode") throw new SpecError(`${at}.vf applies only to an led or a diode: its forward voltage in V`);
      const vf = v.requiredNumber(c, "vf", at);
      if (!(vf >= 0)) throw new SpecError(`${at}.vf must be zero (an ideal diode) or positive, got ${vf}`);
    }
    if (c.label !== undefined) {
      if (kind !== "load") throw new SpecError(`${at}.label applies only to a load: the text inside its box`);
      v.optionalString(c, "label", at);
    }
    if (c.rated !== undefined) {
      if (kind !== "load") throw new SpecError(`${at}.rated applies only to a load`);
      const r = v.object(c.rated, `${at}.rated`);
      for (const key of Object.keys(r)) if (key !== "power" && key !== "voltage") throw new SpecError(`${at}.rated.${key} is not a field; the fields are power (W) and voltage (V)`);
      for (const key of ["power", "voltage"]) {
        const x = v.requiredNumber(r, key, `${at}.rated`);
        if (!(x > 0)) throw new SpecError(`${at}.rated.${key} must be positive, got ${x}`);
      }
    }
    if (c.taps !== undefined && kind !== "potentiometer") throw new SpecError(`${at}.taps applies only to a potentiometer`);
    if (kind === "potentiometer" && c.via !== undefined) throw new SpecError(`${at}: a potentiometer is one straight run from its first end to its last -- it takes no via`);
    v.optionalBoolean(c, "hideValue", at);
    const closed = v.optionalBoolean(c, "closed", at);
    if (closed !== undefined && kind !== "switch") throw new SpecError(`${at}.closed applies only to a switch`);
  });
  v.unique(ids, "component");
  if (raw.ground !== undefined) v.knownId(v.requiredString(raw, "ground", path), known, `${path}.ground`, "node");
  if (raw.show !== undefined) {
    const show = v.object(raw.show, `${path}.show`);
    const flags = ["currents", "nodeVoltages", "power", "names", "terminal", "states"];
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
