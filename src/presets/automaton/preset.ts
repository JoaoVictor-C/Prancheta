/**
 * automaton -- finite automata, drawn Sipser style, and what they do to words.
 *
 * A DFA or NFA is a graph whose meaning is its RUNS: which word it accepts.
 * The drawing is the easy half; the half that goes wrong in a hand-made
 * figure is the claim printed beside it ("aab é aceita"). Here that claim is
 * never typed. Every word in `words` is RUN through the automaton -- a DFA
 * walks one state per symbol, an NFA carries the set of states it could be in
 * and takes the ε-closure after every step -- and the panel prints the path
 * or the sequence of sets it computed, and "aceita" / "rejeita" from whether
 * the last state (or any state of the last set) is accepting.
 *
 * Drawn: states as circles with the name centred (q₀), accepting states as
 * double circles, the start state with an arrow out of nowhere; edges as
 * straight arrows, two opposite edges as two gently curved arcs, self-loops as
 * a loop turned away from the rest of the automaton, several symbols on one
 * edge merged into one label "a, b". Every arrowhead ends ON the target's
 * circle, not at its centre: each edge is trimmed against the circle by the
 * exact intersection of the arc (or line) with it.
 *
 * Pure helpers exported for testing: `runDfa`, `runNfa`, `epsilonClosure`,
 * `subsetConstruction`.
 */

import type { FigureSpec, Mark, MarkSegment, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { Placer, besidePolyline, pointToPolyline, rectAt } from "../construction/place.ts";
import type { Rect } from "../construction/place.ts";

// ---- input ------------------------------------------------------------------

export type AutomatonKind = "dfa" | "nfa";
export const EPSILON = "ε";

export type TransitionInput = { from: string; on: string | string[]; to: string };
export type LayoutInput = "line" | "circle" | Record<string, [number, number]>;

export type AutomatonInput = {
  title?: string;
  kind: AutomatonKind;
  alphabet: string[];
  states: string[];
  start: string;
  accept: string[];
  transitions: TransitionInput[];
  /** DFA only: missing transitions go to an implicit dead state instead of being refused. */
  partial?: boolean;
  layout?: LayoutInput;
  words?: string[];
  /** false: the diagram and the word list only; no path, no verdict. Default true. */
  answers?: boolean;
};

/** A validated automaton with one symbol per transition. */
export type Automaton = {
  kind: AutomatonKind;
  alphabet: string[];
  states: string[];
  start: string;
  accept: string[];
  transitions: { from: string; on: string; to: string }[];
  partial?: boolean;
};

// ---- the automaton itself (pure) ----------------------------------------------

/** The states reachable from `from` by ε-transitions alone, `from` included, in the automaton's state order. */
export function epsilonClosure(a: Automaton, from: readonly string[]): string[] {
  const seen = new Set<string>(from);
  const stack = [...from];
  while (stack.length > 0) {
    const s = stack.pop()!;
    for (const t of a.transitions) {
      if (t.from === s && t.on === EPSILON && !seen.has(t.to)) {
        seen.add(t.to);
        stack.push(t.to);
      }
    }
  }
  return a.states.filter((s) => seen.has(s));
}

/** The states an NFA can reach from `from` by reading `symbol` (no closure). */
function moveOn(a: Automaton, from: readonly string[], symbol: string): string[] {
  const out = new Set<string>();
  for (const t of a.transitions) if (t.on === symbol && from.includes(t.from)) out.add(t.to);
  return a.states.filter((s) => out.has(s));
}

export type DfaRun = {
  /** The states visited, starting with the start state. */
  path: string[];
  /** The symbols read, one per step taken. */
  symbols: string[];
  accepted: boolean;
  /** A partial DFA fell into its implicit dead state on the LAST symbol read; `path` has one fewer state than `symbols` has symbols + 1. */
  dead: boolean;
};

/** Run a DFA on a word. A missing transition (partial DFA) ends the run in the implicit dead state. */
export function runDfa(a: Automaton, word: string): DfaRun {
  let state = a.start;
  const path = [state];
  const symbols: string[] = [];
  for (const symbol of [...word]) {
    if (!a.alphabet.includes(symbol)) throw new SpecError(`runDfa: symbol "${symbol}" of the word "${word}" is not in the alphabet {${a.alphabet.join(", ")}}`);
    const step = a.transitions.find((t) => t.from === state && t.on === symbol);
    symbols.push(symbol);
    if (step === undefined) return { path, symbols, accepted: false, dead: true };
    state = step.to;
    path.push(state);
  }
  return { path, symbols, accepted: a.accept.includes(state), dead: false };
}

export type NfaRun = {
  /** The set of states after each step, the first being the ε-closure of the start. */
  sets: string[][];
  symbols: string[];
  accepted: boolean;
};

/** Run an NFA on a word by carrying the set of possible states, closing under ε at every step. */
export function runNfa(a: Automaton, word: string): NfaRun {
  let set = epsilonClosure(a, [a.start]);
  const sets = [set];
  const symbols: string[] = [];
  for (const symbol of [...word]) {
    if (!a.alphabet.includes(symbol)) throw new SpecError(`runNfa: symbol "${symbol}" of the word "${word}" is not in the alphabet {${a.alphabet.join(", ")}}`);
    set = epsilonClosure(a, moveOn(a, set, symbol));
    sets.push(set);
    symbols.push(symbol);
  }
  return { sets, symbols, accepted: set.some((s) => a.accept.includes(s)) };
}

/** The name the subset construction gives a set of NFA states: "{q0,q1}", and "∅" for the empty set. */
export function subsetName(set: readonly string[]): string {
  return set.length === 0 ? "∅" : `{${set.join(",")}}`;
}

/**
 * The subset construction: a total DFA equivalent to the NFA, with only the
 * subsets reachable from the closure of the start state, in the order they
 * are discovered (breadth first, alphabet order).
 */
export function subsetConstruction(nfa: Automaton): Automaton {
  const startSet = epsilonClosure(nfa, [nfa.start]);
  const sets: string[][] = [startSet];
  const key = (s: readonly string[]): string => s.join("\u0000");
  const index = new Map<string, number>([[key(startSet), 0]]);
  const transitions: Automaton["transitions"] = [];
  for (let i = 0; i < sets.length; i += 1) {
    for (const symbol of nfa.alphabet) {
      const next = epsilonClosure(nfa, moveOn(nfa, sets[i]!, symbol));
      if (!index.has(key(next))) {
        index.set(key(next), sets.length);
        sets.push(next);
      }
      transitions.push({ from: subsetName(sets[i]!), on: symbol, to: subsetName(next) });
    }
  }
  return {
    kind: "dfa",
    alphabet: [...nfa.alphabet],
    states: sets.map(subsetName),
    start: subsetName(startSet),
    accept: sets.filter((s) => s.some((q) => nfa.accept.includes(q))).map(subsetName),
    transitions,
  };
}

// ---- reading the input ------------------------------------------------------------

const KEYS = ["preset", "title", "kind", "alphabet", "states", "start", "accept", "transitions", "partial", "layout", "words", "answers", "style", "theme", "type"];
const MAX_STATES = 14;
const MAX_WORDS = 10;
const MAX_WORD = 40;

function stringList(raw: unknown, path: string, what: string): string[] {
  if (!Array.isArray(raw)) throw new SpecError(`${path} must be an array of ${what}, got ${JSON.stringify(raw)}`);
  return raw.map((s, i) => {
    if (typeof s !== "string") throw new SpecError(`${path}[${i}] must be a string, got ${JSON.stringify(s)}`);
    return s;
  });
}

/** Validate an input and reduce it to an `Automaton` (one symbol per transition). Throws `SpecError` naming the path. */
export function normaliseAutomaton(raw: Record<string, unknown>): Automaton {
  const path = "automaton";
  for (const k of Object.keys(raw)) {
    if (!KEYS.includes(k)) throw new SpecError(`${path}.${k} is not a field of this preset (known: ${KEYS.filter((x) => !["preset", "style", "theme", "type"].includes(x)).join(", ")})`);
  }
  const kind = v.optionalEnum(raw, "kind", path, ["dfa", "nfa"] as const);
  if (kind === undefined) throw new SpecError(`${path}.kind is required: "dfa" or "nfa"`);
  v.optionalString(raw, "title", path);
  const partial = v.optionalBoolean(raw, "partial", path);
  if (partial === true && kind !== "dfa") throw new SpecError(`${path}.partial applies to a DFA only; an NFA is already allowed to lack transitions`);

  const alphabet = stringList(v.nonEmptyArray(raw, "alphabet", path, "symbols"), `${path}.alphabet`, "symbols");
  alphabet.forEach((s, i) => {
    if ([...s].length !== 1 || /\s/.test(s)) throw new SpecError(`${path}.alphabet[${i}] must be a single visible character, got ${JSON.stringify(s)}`);
    if (s === EPSILON) throw new SpecError(`${path}.alphabet[${i}]: ε is the empty word, not a symbol -- it is written only on an NFA's transitions and is never in the alphabet`);
    if (alphabet.indexOf(s) !== i) throw new SpecError(`${path}.alphabet lists "${s}" twice`);
  });

  const states = stringList(v.nonEmptyArray(raw, "states", path, "state names"), `${path}.states`, "state names");
  if (states.length > MAX_STATES) throw new SpecError(`${path}.states has ${states.length} states, the most drawn is ${MAX_STATES}`);
  states.forEach((s, i) => {
    if (s.trim() === "") throw new SpecError(`${path}.states[${i}] is empty`);
    if (states.indexOf(s) !== i) throw new SpecError(`${path}.states lists "${s}" twice`);
  });
  const start = v.requiredString(raw, "start", path);
  if (!states.includes(start)) throw new SpecError(`${path}.start "${start}" is not one of the states (${states.join(", ")})`);
  const accept = stringList(v.array(raw, "accept", path, "state names"), `${path}.accept`, "state names");
  accept.forEach((s, i) => {
    if (!states.includes(s)) throw new SpecError(`${path}.accept[${i}] "${s}" is not one of the states (${states.join(", ")})`);
    if (accept.indexOf(s) !== i) throw new SpecError(`${path}.accept lists "${s}" twice`);
  });

  const list = v.array(raw, "transitions", path, "transitions");
  const transitions: Automaton["transitions"] = [];
  list.forEach((entry, i) => {
    const p = `${path}.transitions[${i}]`;
    const t = v.object(entry, p);
    for (const k of Object.keys(t)) if (!["from", "on", "to"].includes(k)) throw new SpecError(`${p}.${k} is not a field of a transition (from, on, to)`);
    const from = v.requiredString(t, "from", p);
    const to = v.requiredString(t, "to", p);
    if (!states.includes(from)) throw new SpecError(`${p}.from "${from}" is not one of the states (${states.join(", ")})`);
    if (!states.includes(to)) throw new SpecError(`${p}.to "${to}" is not one of the states (${states.join(", ")})`);
    const on = t.on;
    const symbols = typeof on === "string" ? [on] : Array.isArray(on) ? stringList(on, `${p}.on`, "symbols") : undefined;
    if (symbols === undefined || symbols.length === 0) throw new SpecError(`${p}.on must be a symbol, "ε" or a non-empty array of them, got ${JSON.stringify(on)}`);
    for (const s of symbols) {
      if (s === EPSILON) {
        if (kind === "dfa") throw new SpecError(`${p}.on: ε-transitions exist only in an NFA -- a DFA reads a symbol at every step (use kind "nfa")`);
      } else if (!alphabet.includes(s)) {
        throw new SpecError(`${p}.on "${s}" is not in the alphabet {${alphabet.join(", ")}}`);
      }
      if (transitions.some((u) => u.from === from && u.on === s && u.to === to)) continue;
      transitions.push({ from, on: s, to });
    }
  });

  if (kind === "dfa") {
    const missing: string[] = [];
    for (const s of states) {
      for (const symbol of alphabet) {
        const found = transitions.filter((t) => t.from === s && t.on === symbol);
        if (found.length > 1) {
          throw new SpecError(`${path}.transitions: state "${s}" has ${found.length} transitions on "${symbol}" (to ${found.map((t) => `"${t.to}"`).join(" and ")}) -- a DFA is deterministic; use kind "nfa" for a choice`);
        }
        if (found.length === 0) missing.push(`"${s}" on "${symbol}"`);
      }
    }
    if (missing.length > 0 && partial !== true) {
      throw new SpecError(`${path}.transitions: a DFA must have a transition for every state and symbol; missing ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? `, and ${missing.length - 6} more` : ""} (add them, or set "partial": true to send them to an implicit dead state)`);
    }
  }

  const a: Automaton = { kind, alphabet, states, start, accept, transitions, ...(partial === true ? { partial: true } : {}) };

  const words = raw.words;
  if (words !== undefined) {
    const ws = stringList(words, `${path}.words`, "words");
    if (ws.length > MAX_WORDS) throw new SpecError(`${path}.words has ${ws.length} words, the most printed is ${MAX_WORDS}`);
    ws.forEach((w, i) => {
      if ([...w].length > MAX_WORD) throw new SpecError(`${path}.words[${i}] is longer than ${MAX_WORD} symbols`);
      for (const s of [...w]) {
        if (!alphabet.includes(s)) throw new SpecError(`${path}.words[${i}] ${JSON.stringify(w)} contains "${s}", which is not in the alphabet {${alphabet.join(", ")}}`);
      }
    });
  }

  const layout = raw.layout;
  if (layout !== undefined && layout !== "line" && layout !== "circle") {
    const l = v.object(layout, `${path}.layout`);
    for (const k of Object.keys(l)) {
      if (!states.includes(k)) throw new SpecError(`${path}.layout.${k} is not one of the states (${states.join(", ")})`);
    }
    for (const s of states) {
      const at = l[s];
      if (at === undefined) throw new SpecError(`${path}.layout gives no position for state "${s}" -- a placed layout places every state`);
      if (!Array.isArray(at) || at.length !== 2) throw new SpecError(`${path}.layout.${s} must be [x, y], got ${JSON.stringify(at)}`);
      v.finite(at[0], `${path}.layout.${s}[0]`);
      v.finite(at[1], `${path}.layout.${s}[1]`);
    }
    const seen = new Map<string, string>();
    for (const s of states) {
      const at = l[s] as [number, number];
      const k = `${at[0]},${at[1]}`;
      if (seen.has(k)) throw new SpecError(`${path}.layout puts "${seen.get(k)}" and "${s}" at the same place`);
      seen.set(k, s);
    }
  } else if (layout !== undefined && typeof layout !== "string") {
    throw new SpecError(`${path}.layout must be "line", "circle" or {state: [x, y]}`);
  }
  return a;
}

export function validateAutomatonInput(raw: Record<string, unknown>): void {
  normaliseAutomaton(raw);
  expandAutomaton(raw as unknown as AutomatonInput);
}

// ---- names and text -------------------------------------------------------------------

const SUB = "₀₁₂₃₄₅₆₇₈₉";

/** "q0" is set as q₀, "{q0,q1}" as {q₀,q₁}: digits after a letter become subscripts. */
export function prettyName(name: string): string {
  return name.replace(/([A-Za-z])(\d+)/g, (_, letter: string, digits: string) => letter + [...digits].map((d) => SUB[Number(d)]!).join(""));
}

const setText = (set: readonly string[]): string => (set.length === 0 ? "∅" : `{${set.map(prettyName).join(", ")}}`);
const wordText = (w: string): string => (w === "" ? EPSILON : w);

/** The sentence a DFA run prints: "q₀ →a q₁ →b q₂: aceita". */
export function dfaRunTokens(run: DfaRun): string[] {
  const tokens = [prettyName(run.path[0]!)];
  run.symbols.forEach((sym, i) => {
    const to = run.path[i + 1];
    tokens.push(`→${sym} ${to === undefined ? "morto" : prettyName(to)}`);
  });
  tokens[tokens.length - 1] += `: ${run.accepted ? "aceita" : "rejeita"}`;
  return tokens;
}

/** The sentence an NFA run prints: "{q₀} →a {q₀, q₁}: aceita". */
export function nfaRunTokens(run: NfaRun): string[] {
  const tokens = [setText(run.sets[0]!)];
  run.symbols.forEach((sym, i) => tokens.push(`→${sym} ${setText(run.sets[i + 1]!)}`));
  tokens[tokens.length - 1] += `: ${run.accepted ? "aceita" : "rejeita"}`;
  return tokens;
}

// ---- geometry --------------------------------------------------------------------------

const INK = "#181B21";
const PAPER = "#FCFBF7";
const EDGE_W = 1.6;
const NAME_SIZE = 15;
const LABEL_SIZE = 14;
const PANEL_SIZE = 14;
const ARROW_LEN = 10;
const ARROW_HALF = 4.2;
const START_LEN = 36;
const RIVAL_CLEARANCE = 30;

const TAU = Math.PI * 2;
const wrapPi = (a: number): number => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
};
const dist = (p: Point, q: Point): number => Math.hypot(p.x - q.x, p.y - q.y);
const unit = (p: Point, q: Point): Point => {
  const d = dist(p, q) || 1;
  return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
};

/** A straight run, or a circular arc parameterised by t in [0, 1]. */
type Shape = { kind: "line"; a: Point; b: Point } | { kind: "arc"; c: Point; r: number; th0: number; sweep: number };

function at(s: Shape, t: number): Point {
  if (s.kind === "line") return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
  const th = s.th0 + s.sweep * t;
  return { x: s.c.x + s.r * Math.cos(th), y: s.c.y + s.r * Math.sin(th) };
}

/** An arc from `a` to `b` bulging by `sag` toward `bulge` (a unit vector across the chord). */
function bowed(a: Point, b: Point, sag: number, bulge: Point): Shape {
  const L = dist(a, b);
  const rho = (L * L / 4 + sag * sag) / (2 * sag);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const c = { x: mid.x + bulge.x * (sag - rho), y: mid.y + bulge.y * (sag - rho) };
  const peak = { x: mid.x + bulge.x * sag, y: mid.y + bulge.y * sag };
  const th0 = Math.atan2(a.y - c.y, a.x - c.x);
  const half = wrapPi(Math.atan2(peak.y - c.y, peak.x - c.x) - th0);
  return { kind: "arc", c, r: rho, th0, sweep: 2 * half };
}

const arclen = (s: Shape): number => (s.kind === "line" ? dist(s.a, s.b) : s.r * Math.abs(s.sweep));

type Edge = {
  id: string;
  from: string;
  to: string;
  symbols: string[];
  shape: Shape;
  t0: number;
  t1: number;
  loop: boolean;
  /** Where a label goes first: away from this point (the outside of the curve, or of the automaton). */
  outwardFrom: Point;
  /** For a loop: the unit vector from the state centre to the loop's far side. */
  u?: Point;
};

/** Trim a shape against the circles of radius R about its two ends: the arrowhead lands ON the target's boundary. */
function trim(s: Shape, R: number): [number, number] {
  if (s.kind === "line") {
    const L = dist(s.a, s.b);
    return [R / L, 1 - R / L];
  }
  const phi = 2 * Math.asin(Math.min(1, R / (2 * s.r)));
  const t = phi / Math.abs(s.sweep);
  return [t, 1 - t];
}

/** Points along the trimmed run, dense enough that a label search sees the curve. */
function sample(s: Shape, t0: number, t1: number): Point[] {
  if (s.kind === "line") return [at(s, t0), at(s, t1)];
  const n = Math.max(4, Math.ceil((Math.abs(s.sweep) * (t1 - t0)) / (Math.PI / 36)));
  return Array.from({ length: n + 1 }, (_, i) => at(s, t0 + ((t1 - t0) * i) / n));
}

function segmentsOf(s: Shape, t0: number, t1: number): MarkSegment[] {
  if (s.kind === "line") return [{ line: at(s, t1) }];
  const k = Math.max(1, Math.ceil((Math.abs(s.sweep) * (t1 - t0)) / (Math.PI / 3)));
  return Array.from({ length: k }, (_, i) => ({ arc: at(s, t0 + ((t1 - t0) * (i + 1)) / k), centre: s.c }));
}

/** The arrowhead: a filled triangle whose tip is the end of the run and whose base sits on the run. */
function arrowhead(s: Shape, t1: number): Point[] {
  const tip = at(s, t1);
  const back = t1 - ARROW_LEN / arclen(s);
  const base = at(s, back);
  const d = unit(base, tip);
  const n = { x: -d.y, y: d.x };
  return [tip, { x: base.x + n.x * ARROW_HALF, y: base.y + n.y * ARROW_HALF }, { x: base.x - n.x * ARROW_HALF, y: base.y - n.y * ARROW_HALF }];
}

/** Circle sampled for ink. */
const ring = (c: Point, r: number): Point[] => Array.from({ length: 73 }, (_, i) => ({ x: c.x + r * Math.cos((i * TAU) / 72), y: c.y + r * Math.sin((i * TAU) / 72) }));

type LayoutKind = "line" | "circle" | "placed";

/** Breadth-first order from the start state along the transitions, then whatever is unreachable. */
export function stateOrder(a: Automaton): string[] {
  const order = [a.start];
  for (let i = 0; i < order.length; i += 1) {
    for (const s of a.states) {
      if (!order.includes(s) && a.transitions.some((t) => t.from === order[i] && t.to === s)) order.push(s);
    }
  }
  for (const s of a.states) if (!order.includes(s)) order.push(s);
  return order;
}

/** True when every edge joins states adjacent in `order` (or is a loop): the automaton is a chain. */
function isChain(a: Automaton, order: string[]): boolean {
  return a.transitions.every((t) => t.from === t.to || Math.abs(order.indexOf(t.from) - order.indexOf(t.to)) === 1);
}

type Geometry = {
  centres: Map<string, Point>;
  edges: Edge[];
  start: { from: Point; to: Point };
};

export function expandAutomaton(input: AutomatonInput): FigureSpec {
  const a = normaliseAutomaton(input as unknown as Record<string, unknown>);
  const words = input.words ?? [];

  // ---- sizes ----------------------------------------------------------------
  const probe = new Board(10, 10, PAPER);
  const nameW = Math.max(...a.states.map((s) => probe.extent(prettyName(s), { size: NAME_SIZE, weight: 500 }).w));
  const anyAccept = a.accept.length > 0;
  const R = Math.max(24, Math.ceil(nameW / 2) + (anyAccept ? 15 : 10));
  const INNER = R - 5;
  const spacing = 2 * R + 88;

  // ---- where the states go ------------------------------------------------------
  const order = stateOrder(a);
  const layoutIn = input.layout;
  const layoutKind: LayoutKind =
    typeof layoutIn === "object" ? "placed" : layoutIn === "line" ? "line" : layoutIn === "circle" ? "circle" : a.states.length <= 4 && isChain(a, order) ? "line" : "circle";
  const base = new Map<string, Point>();
  if (layoutKind === "line") {
    order.forEach((s, i) => base.set(s, { x: i * spacing, y: 0 }));
  } else if (layoutKind === "circle") {
    const n = order.length;
    const r = n === 1 ? 0 : Math.max(spacing / (2 * Math.sin(Math.PI / n)), 1.3 * R);
    order.forEach((s, i) => base.set(s, { x: r * Math.cos(Math.PI + (i * TAU) / n), y: r * Math.sin(Math.PI + (i * TAU) / n) }));
  } else {
    const l = layoutIn as Record<string, [number, number]>;
    for (const s of a.states) base.set(s, { x: l[s]![0] * (spacing * 0.95), y: -l[s]![1] * (spacing * 0.95) });
  }

  // ---- edges -----------------------------------------------------------------------
  const groups: { from: string; to: string; symbols: string[] }[] = [];
  for (const t of a.transitions) {
    let g = groups.find((x) => x.from === t.from && x.to === t.to);
    if (g === undefined) {
      g = { from: t.from, to: t.to, symbols: [] };
      groups.push(g);
    }
    g.symbols.push(t.on);
  }
  const rank = (s: string): number => (s === EPSILON ? 1e6 : a.alphabet.indexOf(s));
  for (const g of groups) g.symbols.sort((p, q) => rank(p) - rank(q));

  const geometry = (centres: Map<string, Point>): Geometry => {
    const centroid = {
      x: [...centres.values()].reduce((s, p) => s + p.x, 0) / centres.size,
      y: [...centres.values()].reduce((s, p) => s + p.y, 0) / centres.size,
    };
    const edges: Edge[] = [];
    groups.forEach((g, i) => {
      if (g.from === g.to) return;
      const pa = centres.get(g.from)!;
      const pb = centres.get(g.to)!;
      const L = dist(pa, pb);
      const d = unit(pa, pb);
      const paired = groups.some((h) => h.from === g.to && h.to === g.from);
      const skip = layoutKind === "line" && Math.abs(order.indexOf(g.from) - order.indexOf(g.to)) > 1;
      let shape: Shape;
      let outwardFrom: Point;
      if (paired || skip) {
        const left = { x: d.y, y: -d.x };
        const sag = skip ? Math.min(0.3 * L, 110) : Math.min(Math.max(0.2 * L, 16), 34);
        shape = bowed(pa, pb, sag, left);
        outwardFrom = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      } else {
        shape = { kind: "line", a: pa, b: pb };
        outwardFrom = layoutKind === "line" ? { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 + 1000 } : centroid;
      }
      const [t0, t1] = trim(shape, R);
      edges.push({ id: `edge-${i + 1}`, from: g.from, to: g.to, symbols: g.symbols, shape, t0, t1, loop: false, outwardFrom });
    });

    // Angles at which ink already leaves each state.
    const occupied = new Map<string, { angle: number; half: number }[]>();
    for (const s of a.states) occupied.set(s, []);
    for (const e of edges) {
      const pa = centres.get(e.from)!;
      const pb = centres.get(e.to)!;
      const s0 = at(e.shape, e.t0);
      const s1 = at(e.shape, e.t1);
      occupied.get(e.from)!.push({ angle: Math.atan2(s0.y - pa.y, s0.x - pa.x), half: 0 });
      occupied.get(e.to)!.push({ angle: Math.atan2(s1.y - pb.y, s1.x - pb.x), half: 0 });
    }
    const outward = (p: Point): number => (dist(p, centroid) < 1 ? -Math.PI / 2 : Math.atan2(p.y - centroid.y, p.x - centroid.x));
    const pick = (s: string, prefer: number, half: number, minGap: number): number => {
      const occ = occupied.get(s)!;
      const gap = (ang: number): number => Math.min(Math.PI, ...occ.map((o) => Math.max(0, Math.abs(wrapPi(ang - o.angle)) - o.half - half)));
      if (gap(prefer) >= minGap) return prefer;
      let best = prefer;
      let bestScore = -Infinity;
      for (let k = 0; k < 36; k += 1) {
        const ang = (k * TAU) / 36;
        const score = Math.min(gap(ang), (60 * Math.PI) / 180) / ((60 * Math.PI) / 180) + 0.5 * ((1 + Math.cos(ang - prefer)) / 2);
        if (score > bestScore) {
          bestScore = score;
          best = ang;
        }
      }
      return best;
    };

    const rl = 0.55 * R;
    const LOOP_HALF = (20 * Math.PI) / 180;
    const D = 1.25 * R;
    const cosB = (D * D + rl * rl - R * R) / (2 * D * rl);
    const beta = Math.acos(cosB);
    groups.forEach((g, i) => {
      if (g.from !== g.to) return;
      const c = centres.get(g.from)!;
      const prefer = layoutKind === "circle" || layoutKind === "placed" ? outward(c) : -Math.PI / 2;
      const psi = pick(g.from, prefer, LOOP_HALF, (8 * Math.PI) / 180);
      occupied.get(g.from)!.push({ angle: psi, half: LOOP_HALF });
      const lc = { x: c.x + Math.cos(psi) * D, y: c.y + Math.sin(psi) * D };
      const shape: Shape = { kind: "arc", c: lc, r: rl, th0: psi + Math.PI + beta, sweep: TAU - 2 * beta };
      edges.push({ id: `edge-${i + 1}`, from: g.from, to: g.to, symbols: g.symbols, shape, t0: 0, t1: 1, loop: true, outwardFrom: c, u: { x: Math.cos(psi), y: Math.sin(psi) } });
    });

    const sc = centres.get(a.start)!;
    const sAngle = pick(a.start, layoutKind === "circle" ? outward(sc) : Math.PI, 0, (30 * Math.PI) / 180);
    const dir = { x: Math.cos(sAngle), y: Math.sin(sAngle) };
    return {
      centres,
      edges,
      start: { from: { x: sc.x + dir.x * (R + START_LEN), y: sc.y + dir.y * (R + START_LEN) }, to: { x: sc.x + dir.x * R, y: sc.y + dir.y * R } },
    };
  };

  // Measure the drawing first, then move it so it sits in its canvas with room for labels.
  const bounds = (g: Geometry): { x0: number; y0: number; x1: number; y1: number } => {
    const pts: Point[] = [g.start.from];
    for (const c of g.centres.values()) pts.push({ x: c.x - R, y: c.y - R }, { x: c.x + R, y: c.y + R });
    for (const e of g.edges) pts.push(...sample(e.shape, e.t0, e.t1));
    return {
      x0: Math.min(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)),
      x1: Math.max(...pts.map((p) => p.x)),
      y1: Math.max(...pts.map((p) => p.y)),
    };
  };
  const b0 = bounds(geometry(base));
  const PAD_X = 34;
  const PAD_Y = 44;
  const PANEL_MIN_W = 620;
  const W = Math.max(Math.ceil(b0.x1 - b0.x0 + 2 * PAD_X), PANEL_MIN_W);
  const diagramH = Math.ceil(b0.y1 - b0.y0 + 2 * PAD_Y);
  const shiftX = (W - (b0.x1 - b0.x0)) / 2 - b0.x0;
  const shiftY = PAD_Y - b0.y0;
  const centres = new Map<string, Point>();
  for (const [s, p] of base) centres.set(s, { x: p.x + shiftX, y: p.y + shiftY });
  const geo = geometry(centres);

  // ---- the panel's text decides the canvas height ------------------------------------------
  const panelLeft = 30;
  const panelRight = W - 30;
  const probeWidth = (t: string, weight = 400): number => probe.extent(t, { size: PANEL_SIZE, weight }).w;
  const lineH = 25;
  type Laid = { text: string; x: number; y: number; weight: number };
  const laid: Laid[] = [];
  let y = diagramH + 26;
  const ruleY = diagramH + 4;
  const put = (text: string, x: number, weight: number): void => {
    laid.push({ text, x, y, weight });
  };
  const wrap = (tokens: string[], maxW: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const tok of tokens) {
      const next = line === "" ? tok : `${line} ${tok}`;
      if (line !== "" && probeWidth(next) > maxW) {
        lines.push(line);
        line = tok;
      } else line = next;
    }
    lines.push(line);
    return lines;
  };

  put(`${a.kind === "dfa" ? "AFD" : "AFN"}:  Σ = {${a.alphabet.join(", ")}},  estado inicial ${prettyName(a.start)},  F = ${setText(a.accept)}`, panelLeft, 600);

  if (a.partial === true) {
    const missing: string[] = [];
    for (const s of a.states) for (const sym of a.alphabet) if (!a.transitions.some((t) => t.from === s && t.on === sym)) missing.push(`${prettyName(s)} com ${sym}`);
    if (missing.length > 0) {
      const shown = missing.length > 6 ? `${missing.slice(0, 6).join("; ")}; …` : missing.join("; ");
      const text = `Estado morto implícito, não desenhado: as transições que faltam (${shown}) levam a um estado de rejeição do qual não se sai.`;
      y += 6;
      for (const line of wrap(text.split(" "), panelRight - panelLeft)) {
        y += lineH;
        put(line, panelLeft, 400);
      }
    }
  }

  const runs = words.map((w) => ({
    word: w,
    tokens: input.answers === false ? ["?"] : a.kind === "dfa" ? dfaRunTokens(runDfa(a, w)) : nfaRunTokens(runNfa(a, w)),
  }));
  if (runs.length > 0) {
    y += lineH + 8;
    put(input.answers === false ? "Palavras, uma por linha:" : "Execuções, uma palavra por linha:", panelLeft, 600);
    const wordCol = Math.max(...runs.map((r) => probeWidth(wordText(r.word), 600))) + 16;
    for (const r of runs) {
      y += lineH + 2;
      put(input.answers === false ? `${wordText(r.word)}:` : wordText(r.word), panelLeft, 600);
      wrap(r.tokens, panelRight - panelLeft - wordCol).forEach((line, k) => {
        if (k > 0) y += lineH;
        put(line, panelLeft + wordCol, 400);
      });
    }
  }
  const panelY = y;
  const H = Math.ceil(panelY + lineH / 2 + 18);

  // ---- drawing ------------------------------------------------------------------------------
  const board = new Board(W, H, PAPER);
  const placer = new Placer({ x: 6, y: 6, width: W - 12, height: diagramH - 6 });

  // States.
  a.states.forEach((s, i) => {
    const c = geo.centres.get(s)!;
    const id = `state-${i + 1}`;
    board.circle(c, R, { stroke: INK, width: EDGE_W, id });
    placer.addInk(id, ring(c, R));
    if (a.accept.includes(s)) {
      board.circle(c, INNER, { stroke: INK, width: EDGE_W, id: `${id}-inner` });
      placer.addInk(`${id}-inner`, ring(c, INNER));
    }
  });

  // Edges.
  const inkOf = new Map<string, Point[]>();
  for (const e of geo.edges) {
    const pts = sample(e.shape, e.t0, e.t1);
    const from = at(e.shape, e.t0);
    board.marks.push({
      id: e.id,
      from,
      segments: segmentsOf(e.shape, e.t0, e.t1),
      close: false,
      fill: "none",
      stroke: INK,
      strokeWidth: EDGE_W,
    } satisfies Mark);
    board.trace(pts, INK, EDGE_W, e.id);
    const head = arrowhead(e.shape, e.t1);
    board.poly(head, { stroke: INK, width: 1, fill: INK, close: true, id: `${e.id}-head` });
    inkOf.set(e.id, pts);
    inkOf.set(`${e.id}-head`, [...head, head[0]!]);
    placer.addInk(e.id, pts);
    placer.addInk(`${e.id}-head`, inkOf.get(`${e.id}-head`)!);
  }
  // The start arrow, out of nowhere.
  {
    const shape: Shape = { kind: "line", a: geo.start.from, b: geo.start.to };
    board.poly([geo.start.from, geo.start.to], { stroke: INK, width: EDGE_W, id: "start-arrow" });
    const head = arrowhead(shape, 1);
    board.poly(head, { stroke: INK, width: 1, fill: INK, close: true, id: "start-arrow-head" });
    placer.addInk("start-arrow", [geo.start.from, geo.start.to, ...head, head[0]!]);
  }

  // State names, centred in their circles (subscripted digits).
  a.states.forEach((s, i) => {
    const c = geo.centres.get(s)!;
    const text = prettyName(s);
    const { w, h } = board.extent(text, { size: NAME_SIZE, weight: 500 });
    board.label(text, c.x, c.y, { size: NAME_SIZE, weight: 500, annotates: a.accept.includes(s) ? `state-${i + 1}-inner` : `state-${i + 1}`, claim: false, width: w });
    placer.reserve({ x: c.x - w / 2, y: c.y - h / 2, width: w, height: h });
  });

  // Edge labels: beside the edge's midpoint, on the outside of its curve.
  const labelFor = (e: Edge): void => {
    const text = e.symbols.join(", ");
    const { w, h } = board.extent(text, { size: LABEL_SIZE });
    const pts = sample(e.shape, e.t0, e.t1);
    let centres: Point[];
    if (e.loop && e.u !== undefined) {
      const c = geo.centres.get(e.from)!;
      const lc = e.shape.kind === "arc" ? e.shape.c : c;
      const rl = e.shape.kind === "arc" ? e.shape.r : 0;
      centres = [];
      for (const extra of [0, 3, 8, 14]) {
        for (const dev of [0, 0.35, -0.35, 0.7, -0.7]) {
          const ang = Math.atan2(e.u.y, e.u.x) + dev;
          const dx = Math.cos(ang);
          const dy = Math.sin(ang);
          const reach = Math.abs(dx) * (w / 2) + Math.abs(dy) * (h / 2);
          centres.push({ x: lc.x + dx * (rl + reach + 2 + extra), y: lc.y + dy * (rl + reach + 5 + extra) });
        }
      }
    } else {
      centres = besidePolyline(pts, w, h, [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82], e.outwardFrom);
    }
    const claim = { kind: "element", id: e.id } as const;
    // Prefer a spot clear of every rule AND well away from every other edge, so two labels
    // between crossing edges are never mistaken for each other's.
    const own = inkOf.get(e.id)!;
    const rival = (c: Point): number => Math.min(Infinity, ...[...inkOf].filter(([id]) => id !== e.id).map(([, ink]) => pointToPolyline(c, ink)));
    const ambiguous = (c: Point): boolean => rival(c) < Math.max(RIVAL_CLEARANCE, 1.7 * pointToPolyline(c, own));
    // Outside the curve first (or away from the automaton, for a straight edge), then inside.
    const outside = (c: Point): boolean => {
      const near = pts.reduce((best, q) => (dist(q, c) < dist(best, c) ? q : best));
      return dist(c, e.outwardFrom) > dist(near, e.outwardFrom);
    };
    const clean = centres.filter((c) => placer.cost(claim, rectAt(c, w, h), 4) === 0);
    const lists = [clean.filter(outside), clean.filter((c) => !outside(c))];
    // Among the clean spots on the preferred side, the one best separated from every other edge
    // relative to its own; ties (nothing else nearby) keep the caller's order, i.e. the midpoint.
    const score = (c: Point): number => Math.min(rival(c), 60) - 1.2 * pointToPolyline(c, own);
    const best = (l: Point[]): Point | undefined => l.reduce<Point | undefined>((b, c) => (b === undefined || (!e.loop && score(c) > score(b) + 0.5) ? c : b), undefined);
    const chosen = best(lists[0]!.filter((c) => !ambiguous(c))) ?? best(lists[1]!.filter((c) => !ambiguous(c)));
    let pick: { centre: Point };
    if (chosen !== undefined) pick = { centre: chosen };
    else if (clean.length > 0) pick = { centre: best(lists[0]!.length > 0 ? lists[0]! : lists[1]!)! };
    else pick = placer.choose(claim, w, h, centres);
    const r: Rect = { x: pick.centre.x - w / 2, y: pick.centre.y - h / 2, width: w, height: h };
    placer.commit(r);
    board.label(text, pick.centre.x, pick.centre.y, { size: LABEL_SIZE, annotates: e.id, claim: false, width: w });
  };
  // Loops first: their room is the tightest.
  for (const e of geo.edges.filter((x) => x.loop)) labelFor(e);
  for (const e of geo.edges.filter((x) => !x.loop)) labelFor(e);

  // The panel.
  board.poly([{ x: 24, y: ruleY }, { x: W - 24, y: ruleY }], { stroke: "#C9CED6", width: 1, id: "panel-rule" });
  laid.forEach((row, i) => {
    const w = probeWidth(row.text, row.weight);
    board.label(row.text, row.x + w / 2, row.y, { size: PANEL_SIZE, weight: row.weight, align: "start", width: w, freeStanding: true, id: `panel-${i + 1}`, claim: false });
  });

  const spec = board.spec(input.title ?? (a.kind === "dfa" ? "autômato finito determinístico" : "autômato finito não determinístico"));
  const scene = spec.root as Scene;
  scene.connectors = [];
  return parseSpec(spec);
}

