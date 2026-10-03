/**
 * probability-tree -- a tree diagram of successive random stages, for
 * Probabilidade and ENEM ("uma urna tem 3 bolas vermelhas e 2 azuis;
 * retiram-se duas sem reposição", "um teste tem 95% de sensibilidade...").
 *
 * The tree is either typed (`root`, each branch with its probability) or BUILT
 * from an urn (`urn`, `draws`, `replacement`), in which case every branch
 * probability is computed from the counts left in the urn. Everything printed
 * is computed from those numbers, in exact rational arithmetic (`fraction.ts`):
 *
 *  - the children of every node must sum to exactly 1, or the node is named;
 *  - a leaf's path probability is the product of its branch probabilities,
 *    written out ("P(V ∩ A) = 3/5 · 2/4 = 3/10");
 *  - an event is a set of leaves (listed paths, "*" for any outcome, or a count
 *    of one outcome); P(E) is the sum of their products, written out, and their
 *    branches are drawn in the event's colour;
 *  - a conditional P(A | B) is P(A ∩ B) / P(B), each computed from leaves.
 *
 * Drawn: root on the left, levels evenly spaced, leaves evenly spaced
 * vertically, straight branches. A branch's probability is set beside its
 * middle, ABOVE an upward or level branch and BELOW a downward one; the outcome
 * name is bold text at the branch's end; the path products stand in one aligned
 * column at the right. Every label is placed after all the ink is down and
 * declares the branch it names (ADR 0035).
 */

import type { FigureSpec, Point, Scene } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { LOCALES } from "../../locale/format.ts";
import type { Locale } from "../../locale/format.ts";
import * as v from "../validate.ts";
import { Board } from "../function-graph/board.ts";
import { MARGIN as CLEAR, Placer } from "../construction/place.ts";
import { ONE, ZERO, cmp, decimalText, div, eq, frac, fractionText, isZero, parseProbability, product, sub, sum, withSign } from "./fraction.ts";
import type { Form, Fraction } from "./fraction.ts";
import type { Rect } from "../../ir/types.ts";
import { rectAt } from "../../geometry/hit.ts";
import { layoutPanel } from "../shared/panel.ts";
import type { PanelLineInput } from "../shared/panel.ts";
import type { WrapRules } from "../shared/text.ts";

// ---- input --------------------------------------------------------------------

export type ProbabilityValue = number | string;

export type TreeNodeInput = { label: string; p?: ProbabilityValue; children?: TreeNodeInput[] };

export type EventInput = {
  name: string;
  /** Leaf paths, by outcome name; a shorter path takes every leaf beneath it and "*" matches any outcome. */
  paths?: string[][];
  /** The leaves where an outcome occurs a given number of times. */
  count?: { of: string; is?: number; atLeast?: number; atMost?: number };
};

export type GivenInput = { event: string; given: string };

export type ProbabilityTreeInput = {
  title?: string;
  locale?: Locale;
  /** A heading over each level, left to right. */
  stages?: string[];
  root?: { children: TreeNodeInput[] };
  urn?: Record<string, number>;
  draws?: number;
  replacement?: boolean;
  events?: EventInput[];
  given?: GivenInput | GivenInput[];
  /** How probabilities are written on the branches and in the products. Default: as the input wrote them. */
  notation?: Form;
  /** Also print each result in this notation. */
  also?: "percent" | "decimal";
  /** false: the figure of the QUESTION -- the tree and its given branch probabilities, none of the computed ones, no path products, events or conditionals (see PRESET.md). Default true. */
  answers?: boolean;
};

// ---- palette and metrics ---------------------------------------------------------

const PAPER = "#FCFBF7";
const INK = "#181B21";
const SOFT = "#4E5763";
const BRANCH = "#5B6675";
const RULE = "#D5D8DE";
const EVENT_COLOURS: { line: string; text: string }[] = [
  { line: "#B3400C", text: "#9A3508" },
  { line: "#2C6BB5", text: "#1E528E" },
  { line: "#1E7A46", text: "#17603A" },
];

const MARGIN = 28;
const NODE_FONT = 15;
const PROB_FONT = 13;
const LEAF_FONT = 14;
const PANEL_FONT = 14;
const HEADER_FONT = 13;
const PANEL_LINE_H = 26;
const MIN_WIDTH = 520;
const MAX_LEAVES = 32;
const MAX_DEPTH = 6;
const ROOT_R = 4.5;

// ---- the tree ------------------------------------------------------------------------

type TNode = {
  id: number;
  label: string;
  p: Fraction;
  /** The numerator and denominator as written, for a fraction ("2/4" stays 2/4 on its branch). */
  written: { n: bigint; d: bigint } | undefined;
  form: Form | undefined;
  /** The probability was not typed: it is 1 minus its siblings, or the count of an urn over what is left in it. */
  computed: boolean;
  where: string;
  depth: number;
  parent: TNode | null;
  children: TNode[];
  // layout
  cx: number;
  cy: number;
  w: number;
};

type Leaf = { node: TNode; labels: string[]; factors: TNode[]; value: Fraction };

function buildExplicit(rootIn: unknown, counter: { n: number; leaves: number }): TNode {
  const root: TNode = { id: 0, label: "", p: ONE, written: undefined, form: undefined, computed: false, where: "root", depth: 0, parent: null, children: [], cx: 0, cy: 0, w: 0 };
  const rootObj = v.object(rootIn, "probability-tree.root");
  const grow = (parent: TNode, kids: unknown, path: string): void => {
    if (!Array.isArray(kids) || kids.length === 0) throw new SpecError(`${path} must be a non-empty array of branches`);
    if (parent.depth + 1 > MAX_DEPTH) throw new SpecError(`${path}: the tree is more than ${MAX_DEPTH} levels deep; the drawing would not stay legible`);
    const seen = new Set<string>();
    const made: { node: TNode; sub: unknown; missing: boolean; at: string }[] = [];
    kids.forEach((raw, i) => {
      const at = `${path}[${i}]`;
      const o = v.object(raw, at);
      const label = v.requiredString(o, "label", at).trim();
      if (label === "") throw new SpecError(`${at}.label must not be empty`);
      if (seen.has(label)) throw new SpecError(`${at}: two branches out of ${parent.depth === 0 ? "the root" : `"${parent.label}"`} are both named "${label}"; an event's path could not tell them apart`);
      seen.add(label);
      counter.n += 1;
      const node: TNode = { id: counter.n, label, p: ZERO, written: undefined, form: undefined, computed: false, where: at, depth: parent.depth + 1, parent, children: [], cx: 0, cy: 0, w: 0 };
      const missing = o.p === undefined;
      if (!missing) {
        const parsed = parseProbability(o.p, `${at}.p`);
        node.p = parsed.value;
        node.written = parsed.written;
        node.form = parsed.form;
      }
      made.push({ node, sub: o.children, missing, at });
    });
    const gaps = made.filter((m) => m.missing);
    if (gaps.length > 1) throw new SpecError(`${path}: ${gaps.length} branches have no p; at most one can be left to be 1 minus the others`);
    if (gaps.length === 1) {
      const known = sum(made.filter((m) => !m.missing).map((m) => m.node.p));
      if (cmp(known, ONE) > 0) throw new SpecError(`${path}: the other branches already sum to ${fractionText(known)}, more than 1, so ${gaps[0]!.at} has no probability left`);
      gaps[0]!.node.p = sub(ONE, known);
      gaps[0]!.node.computed = true;
    }
    checkSum(parent, made.map((m) => m.node), path);
    for (const m of made) {
      parent.children.push(m.node);
      if (m.sub !== undefined && !(Array.isArray(m.sub) && m.sub.length === 0)) grow(m.node, m.sub, `${m.at}.children`);
      else counter.leaves += 1;
      if (counter.leaves > MAX_LEAVES) throw new SpecError(`probability-tree: more than ${MAX_LEAVES} leaves; the paths would no longer fit legibly`);
    }
  };
  grow(root, rootObj.children, "probability-tree.root.children");
  return root;
}

/** The children of `parent` sum to exactly 1, or the node is named with the sum it has. */
function checkSum(parent: TNode, kids: TNode[], path: string): void {
  const total = sum(kids.map((k) => k.p));
  if (eq(total, ONE)) return;
  const who = parent.depth === 0 ? "the root" : `the node "${parent.label}" (${parent.where})`;
  throw new SpecError(
    `probability-tree: the branches out of ${who} have probabilities ${kids.map((k) => `${k.label} = ${fractionText(k.p)}`).join(", ")}, which sum to ${fractionText(total)}, not 1 (${path})`,
  );
}

function buildUrn(urn: Record<string, number>, draws: number, replacement: boolean, counter: { n: number; leaves: number }): TNode {
  const colours = Object.keys(urn);
  const total = colours.reduce((s, k) => s + urn[k]!, 0);
  if (!replacement && draws > total) throw new SpecError(`probability-tree.draws: ${draws} draws without replacement from an urn of ${total} balls`);
  const root: TNode = { id: 0, label: "", p: ONE, written: undefined, form: undefined, computed: false, where: "root", depth: 0, parent: null, children: [], cx: 0, cy: 0, w: 0 };
  const grow = (parent: TNode, left: Record<string, number>, remaining: number): void => {
    if (remaining === 0) {
      counter.leaves += 1;
      if (counter.leaves > MAX_LEAVES) throw new SpecError(`probability-tree: this urn draws more than ${MAX_LEAVES} paths; the tree would no longer fit legibly`);
      return;
    }
    const N = Object.values(left).reduce((s, k) => s + k, 0);
    for (const colour of colours) {
      const k = left[colour]!;
      if (k === 0) continue; // an exhausted colour has probability 0: no branch
      counter.n += 1;
      const node: TNode = {
        id: counter.n,
        label: colour,
        p: frac(BigInt(k), BigInt(N)),
        written: { n: BigInt(k), d: BigInt(N) },
        form: "fraction",
        computed: true,
        where: `draw ${parent.depth + 1}`,
        depth: parent.depth + 1,
        parent,
        children: [],
        cx: 0,
        cy: 0,
        w: 0,
      };
      parent.children.push(node);
      grow(node, replacement ? left : { ...left, [colour]: k - 1 }, remaining - 1);
    }
    checkSum(parent, parent.children, "urn");
  };
  grow(root, { ...urn }, draws);
  return root;
}

function leavesOf(root: TNode): Leaf[] {
  const out: Leaf[] = [];
  const walk = (n: TNode, labels: string[], factors: TNode[]): void => {
    if (n.children.length === 0) {
      out.push({ node: n, labels, factors, value: product(factors.map((f) => f.p)) });
      return;
    }
    for (const c of n.children) walk(c, [...labels, c.label], [...factors, c]);
  };
  for (const c of root.children) walk(c, [c.label], [c]);
  return out;
}

// ---- events -------------------------------------------------------------------------------

type ResolvedEvent = { name: string; leaves: Set<Leaf>; value: Fraction; index: number };

function matchesPath(leaf: Leaf, path: string[]): boolean {
  if (path.length > leaf.labels.length) return false;
  return path.every((step, i) => step === "*" || step === leaf.labels[i]);
}

function resolveEvents(input: EventInput[] | undefined, leaves: Leaf[]): ResolvedEvent[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new SpecError("probability-tree.events must be an array");
  const names = new Set<string>();
  return input.map((raw, index) => {
    const at = `probability-tree.events[${index}]`;
    const o = v.object(raw, at);
    const name = v.requiredString(o, "name", at).trim();
    if (name === "") throw new SpecError(`${at}.name must not be empty`);
    if (names.has(name)) throw new SpecError(`${at}: the event name "${name}" is used twice`);
    names.add(name);
    if ((o.paths === undefined) === (o.count === undefined)) throw new SpecError(`${at} ("${name}"): give exactly one of \`paths\` (a list of paths) or \`count\``);
    const chosen = new Set<Leaf>();
    if (o.paths !== undefined) {
      if (!Array.isArray(o.paths) || o.paths.length === 0) throw new SpecError(`${at}.paths must be a non-empty list of paths, e.g. [["V", "A"], ["A", "V"]]`);
      o.paths.forEach((p, j) => {
        if (!Array.isArray(p) || p.length === 0 || p.some((s) => typeof s !== "string")) throw new SpecError(`${at}.paths[${j}] must be a list of outcome names, e.g. ["V", "A"]`);
        for (const leaf of leaves) if (matchesPath(leaf, p as string[])) chosen.add(leaf);
      });
    } else {
      const c = v.object(o.count, `${at}.count`);
      const of = v.requiredString(c, "of", `${at}.count`);
      const bounds = (["is", "atLeast", "atMost"] as const).filter((k) => c[k] !== undefined);
      if (bounds.length === 0) throw new SpecError(`${at}.count needs \`is\`, \`atLeast\` or \`atMost\``);
      for (const k of bounds) v.requiredNumber(c, k, `${at}.count`);
      for (const leaf of leaves) {
        const n = leaf.labels.filter((l) => l === of).length;
        const ok = (c.is === undefined || n === c.is) && (c.atLeast === undefined || n >= (c.atLeast as number)) && (c.atMost === undefined || n <= (c.atMost as number));
        if (ok) chosen.add(leaf);
      }
    }
    if (chosen.size === 0) {
      throw new SpecError(`${at} ("${name}") matches no leaf; the paths are ${leaves.map((l) => l.labels.join("-")).join(", ")}`);
    }
    return { name, leaves: chosen, value: sum([...chosen].map((l) => l.value)), index };
  });
}

// ---- writing numbers ---------------------------------------------------------------------------

type Writer = {
  mode: Form;
  /** A branch's probability as printed on it. */
  branch: (n: TNode) => string;
  /** A computed value: fractions reduced, decimals and percents exact or rounded. */
  num: (f: Fraction) => string;
  /** "= 3/5", plus the `also` spelling; "≈" where the value is not exact. */
  tail: (f: Fraction, also?: "percent" | "decimal" | undefined) => string;
  rounded: boolean;
};

function makeWriter(mode: Form, also: "percent" | "decimal" | undefined, locale: Locale): Writer {
  const w: Writer = {
    mode,
    rounded: false,
    branch: (n) => {
      if (mode === "fraction") return n.written !== undefined ? `${n.written.n}${n.written.d === 1n ? "" : `/${n.written.d}`}` : fractionText(n.p);
      const t = decimalText(n.p, locale, { percent: mode === "percent" });
      if (!t.exact) w.rounded = true;
      return t.text;
    },
    num: (f) => {
      if (mode === "fraction") return fractionText(f);
      const t = decimalText(f, locale, { percent: mode === "percent" });
      if (!t.exact) w.rounded = true;
      return t.text;
    },
    tail: (f, alsoOverride) => {
      const parts: string[] = [];
      if (mode === "fraction") parts.push(`= ${fractionText(f)}`);
      else {
        const t = decimalText(f, locale, { percent: mode === "percent" });
        if (!t.exact) w.rounded = true;
        parts.push(withSign(t));
      }
      const extra = alsoOverride ?? also;
      if (extra !== undefined && !(extra === "percent" && mode === "percent") && !(extra === "decimal" && mode === "decimal")) {
        const t = decimalText(f, locale, { percent: extra === "percent" });
        // A fraction that is not a short decimal is rounded: the tail says so.
        parts.push(withSign(t));
      }
      return parts.join(" ");
    },
  };
  return w;
}

const paren = (w: Writer, f: Fraction, text: string): string => (w.mode === "fraction" && f.d !== 1n ? `(${text})` : text);

// ---- layout ----------------------------------------------------------------------------------------


/** "=" and "≈" stay with the word after, "+", "·", "∩", "|" and "/" with the word before. */
const TREE_RULES: WrapRules = {
  joinsPrevious: (w) => ["+", "·", "∩", "|", "/"].includes(w),
  joinsNext: (w) => w === "=" || w === "≈",
};

export function expandProbabilityTree(input: ProbabilityTreeInput): FigureSpec {
  const locale = input.locale ?? "pt-BR";
  const answers = input.answers !== false;
  if ((input.root === undefined) === (input.urn === undefined)) throw new SpecError("probability-tree: give exactly one of `root` (a typed tree) or `urn` (a tree built from an urn)");

  // ---- the tree ---------------------------------------------------------------
  const counter = { n: 0, leaves: 0 };
  let root: TNode;
  let autoStages: string[] | undefined;
  if (input.urn !== undefined) {
    const urn = v.object(input.urn, "probability-tree.urn") as Record<string, unknown>;
    const colours = Object.keys(urn);
    if (colours.length === 0) throw new SpecError("probability-tree.urn must name at least one colour, e.g. { \"V\": 3, \"A\": 2 }");
    for (const k of colours) {
      const n = urn[k];
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new SpecError(`probability-tree.urn.${k} must be a whole number of balls (0 or more), got ${JSON.stringify(n)}`);
      if (k.trim() === "") throw new SpecError("probability-tree.urn: a colour needs a name");
    }
    if (colours.every((k) => urn[k] === 0)) throw new SpecError("probability-tree.urn has no balls");
    const draws = input.draws;
    if (typeof draws !== "number" || !Number.isInteger(draws) || draws < 1 || draws > MAX_DEPTH) throw new SpecError(`probability-tree.draws must be a whole number from 1 to ${MAX_DEPTH}, got ${JSON.stringify(draws)}`);
    if (input.replacement !== undefined && typeof input.replacement !== "boolean") throw new SpecError("probability-tree.replacement must be true or false");
    root = buildUrn(urn as Record<string, number>, draws, input.replacement === true, counter);
    autoStages = Array.from({ length: draws }, (_, i) => (locale === "pt-BR" ? `${i + 1}ª retirada` : `draw ${i + 1}`));
  } else {
    root = buildExplicit(input.root, counter);
  }
  const leaves = leavesOf(root);
  const depth = Math.max(...leaves.map((l) => l.labels.length));

  // ---- stages -----------------------------------------------------------------------
  let stages = input.stages ?? autoStages;
  if (input.stages !== undefined) {
    if (!Array.isArray(input.stages) || input.stages.some((s) => typeof s !== "string")) throw new SpecError("probability-tree.stages must be a list of headings, one per level");
    if (input.stages.length > depth) throw new SpecError(`probability-tree.stages has ${input.stages.length} headings but the tree has ${depth} levels`);
    stages = input.stages;
  }

  // ---- notation ---------------------------------------------------------------------------
  const forms: Form[] = [];
  const collect = (n: TNode): void => {
    for (const c of n.children) {
      if (c.form !== undefined) forms.push(c.form);
      collect(c);
    }
  };
  collect(root);
  let mode: Form = "fraction";
  if (input.notation !== undefined) mode = input.notation;
  else if (forms.length > 0 && forms.every((f) => f === "percent")) mode = "percent";
  else if (forms.length > 0 && forms.every((f) => f === "decimal")) mode = "decimal";
  const write = makeWriter(mode, input.also, locale);

  // ---- events and conditionals ---------------------------------------------------------------
  // under answers:false the events are still checked (a bad path is still a bad input) but nothing of them is drawn
  const resolved = resolveEvents(input.events, leaves);
  const events = answers ? resolved : [];
  if (events.length > EVENT_COLOURS.length) throw new SpecError(`probability-tree.events: at most ${EVENT_COLOURS.length} events can be highlighted at once, got ${events.length}`);
  const givens0: GivenInput[] = input.given === undefined ? [] : Array.isArray(input.given) ? input.given : [input.given];
  const givens: GivenInput[] = answers ? givens0 : [];
  const byName = new Map(resolved.map((e) => [e.name, e]));
  givens0.forEach((g, i) => {
    const at = `probability-tree.given[${i}]`;
    const o = v.object(g, at);
    for (const key of ["event", "given"] as const) {
      const name = v.requiredString(o, key, at);
      if (!byName.has(name)) throw new SpecError(`${at}.${key}: "${name}" is not a declared event (${resolved.length === 0 ? "declare events first" : resolved.map((e) => `"${e.name}"`).join(", ")})`);
    }
  });

  // ---- sizes ---------------------------------------------------------------------------------------
  const board0 = new Board(MIN_WIDTH, 100, PAPER); // measuring only
  const textW = (t: string, size: number, weight = 400): number => board0.extent(t, { size, weight }).w;
  const walk = (n: TNode, f: (n: TNode) => void): void => {
    for (const c of n.children) {
      f(c);
      walk(c, f);
    }
  };
  const nodes: TNode[] = [];
  walk(root, (n) => nodes.push(n));
  for (const n of nodes) n.w = textW(n.label, NODE_FONT, 700);
  const probText = new Map<TNode, string>();
  // a probability the exercise asks for (1 minus the others, or a fraction of an urn's counts) is not on the question's tree
  const shown = (n: TNode): boolean => answers || !n.computed;
  for (const n of nodes) probText.set(n, shown(n) ? write.branch(n) : "");
  const maxProbW = Math.max(...nodes.map((n) => textW(probText.get(n)!, PROB_FONT)));
  const levelHalf = (k: number): number => (k === 0 ? ROOT_R + 2 : Math.max(...nodes.filter((n) => n.depth === k).map((n) => n.w / 2), 0));
  const maxBranching = Math.max(...[root, ...nodes].map((n) => n.children.length));
  // In a fan of three or more the middle branch is level and its neighbours rise and fall from the same node: a label
  // above the level branch is clear of the rising one only if that line is still above the label's top at the label's
  // near end, i.e. gap · (1/2 − w/2L) ≥ ~44. A short label ("2/5") manages it with the default spacing; a wide one
  // ("2999/6499", counts in the thousands) needs a longer branch and a taller gap, or it sits on its neighbour.
  const wideFan = maxBranching >= 3 && maxProbW > 40;
  const minBranch = wideFan ? Math.max(96, maxProbW + 46, 2 * maxProbW + 20) : Math.max(96, maxProbW + 46);
  let dx = 0;
  for (let k = 1; k <= depth; k += 1) dx = Math.max(dx, levelHalf(k - 1) + levelHalf(k) + 4 + minBranch);
  const fanGap = wideFan ? Math.min(110, Math.ceil(44 / Math.max(0.2, 1 - maxProbW / minBranch))) : 0;
  const gap = maxBranching >= 3 ? Math.max(54, fanGap) : leaves.length > 8 ? 42 : 48;

  const headers = stages !== undefined && stages.length > 0;
  const top0 = headers ? 58 : 26;
  const x0 = MARGIN + ROOT_R + 4;
  const colX = (k: number): number => x0 + k * dx;

  // Positions: leaves evenly down the page; a parent is centred on its children.
  let leafIndex = 0;
  const place = (n: TNode): void => {
    if (n.children.length === 0) {
      n.cy = top0 + (leafIndex + 0.5) * gap;
      leafIndex += 1;
    } else {
      n.children.forEach(place);
      n.cy = (n.children[0]!.cy + n.children[n.children.length - 1]!.cy) / 2;
    }
    n.cx = colX(n.depth);
  };
  root.children.forEach(place);
  root.cx = x0;
  root.cy = (root.children[0]!.cy + root.children[root.children.length - 1]!.cy) / 2;
  const treeBottom = top0 + leaves.length * gap;

  // ---- what each leaf and each event says ---------------------------------------------------------------
  const eventOfLeaf = new Map<Leaf, number>();
  for (const e of events) for (const leaf of e.leaves) if (!eventOfLeaf.has(leaf)) eventOfLeaf.set(leaf, e.index);
  const branchEvent = new Map<TNode, number>();
  for (const leaf of leaves) {
    const idx = eventOfLeaf.get(leaf);
    if (idx === undefined) continue;
    for (const f of leaf.factors) branchEvent.set(f, Math.min(idx, branchEvent.get(f) ?? idx));
  }

  const leafText = (leaf: Leaf): string => {
    const head = `P(${leaf.labels.join(" ∩ ")})`;
    const factors = leaf.factors.map((f) => probText.get(f)!);
    const tail = write.tail(leaf.value);
    return leaf.factors.length === 1 ? `${head} ${tail}` : `${head} = ${factors.join(" · ")} ${tail}`;
  };
  const leafTexts = answers ? leaves.map(leafText) : [];
  const leafW = answers ? Math.max(...leafTexts.map((t) => textW(t, LEAF_FONT, 400))) + 6 : 0;
  // Clear of the last node AND of the last stage's heading, which is wider than a node.
  const lastHeading = stages !== undefined && stages.length >= depth ? textW(stages[depth - 1]!, HEADER_FONT, 700) / 2 : 0;
  const leafX = colX(depth) + Math.max(levelHalf(depth) + 34, lastHeading + 20);
  const W = Math.max(MIN_WIDTH, Math.ceil(leafX + leafW + MARGIN));

  // Panel lines (built now: their number decides the canvas height).
  // An event's line in its own colour behind its swatch; a result strong; a note soft.
  const lines: PanelLineInput[] = [];
  const pushWrapped = (text: string, colour: string, swatch?: string, weight?: number): void => {
    const emphasis = swatch !== undefined ? "accent" : colour === SOFT ? "soft" : weight === 700 ? "strong" : "normal";
    lines.push({ text: [{ text }], emphasis, ...(emphasis === "accent" ? { colour } : {}), ...(swatch === undefined ? {} : { swatch }) });
  };
  events.forEach((e) => {
    const set = leaves.filter((l) => e.leaves.has(l));
    pushWrapped(singleTerm(`P(${e.name})`, set, e.value, write), EVENT_COLOURS[e.index]!.text, EVENT_COLOURS[e.index]!.line, 700);
  });
  givens.forEach((g) => {
    const a = byName.get(g.event)!;
    const b = byName.get(g.given)!;
    const both = leaves.filter((l) => a.leaves.has(l) && b.leaves.has(l));
    const nameAB = `${a.name} ∩ ${b.name}`;
    const pAB = sum(both.map((l) => l.value));
    if (isZero(b.value)) throw new SpecError(`probability-tree.given: P(${b.name}) is 0, so P(${a.name} | ${b.name}) is undefined`);
    if (both.length === 0) pushWrapped(`P(${nameAB}) = 0`, INK);
    else pushWrapped(singleTerm(`P(${nameAB})`, both, pAB, write), INK);
    const q = div(pAB, b.value);
    const alsoDefault = write.mode === "fraction" ? "percent" : undefined;
    pushWrapped(`P(${a.name} | ${b.name}) = P(${nameAB}) / P(${b.name})`, INK, undefined, 700);
    pushWrapped(`= ${paren(write, pAB, write.num(pAB))} / ${paren(write, b.value, write.num(b.value))} ${write.tail(q, alsoDefault).replace(/^= /, "= ")}`, INK, undefined, 700);
  });
  if (!answers && input.urn !== undefined) {
    const contents = Object.entries(input.urn).filter(([, k]) => k > 0).map(([c, k]) => `${k} ${c}`).join(" · ");
    const how = input.replacement === true ? (locale === "pt-BR" ? "com reposição" : "with replacement") : locale === "pt-BR" ? "sem reposição" : "without replacement";
    pushWrapped(`${locale === "pt-BR" ? "urna" : "urn"}: ${contents} · ${how}`, SOFT);
  }
  if (write.rounded) pushWrapped(locale === "pt-BR" ? "≈ indica valor decimal arredondado" : "≈ marks a rounded decimal value", SOFT);

  const readingPanel = layoutPanel(lines, { width: W - 2 * MARGIN - 6, size: PANEL_FONT, lineHeight: PANEL_LINE_H, rules: TREE_RULES });
  const panelTop = treeBottom + 33;
  const H = Math.ceil(readingPanel.empty ? treeBottom + 22 : panelTop + readingPanel.height + 13);

  // ---- ink first -------------------------------------------------------------------------------------------------
  const board = new Board(W, H, PAPER);
  const placer = new Placer({ x: 4, y: 4, width: W - 8, height: treeBottom + 14 });
  const idOf = (n: TNode): string => `branch-${n.id}`;
  const branchPts = (n: TNode): Point[] => {
    const p = n.parent!;
    const start = p.depth === 0 ? p.cx + ROOT_R + 2 : p.cx + p.w / 2 + 3;
    return [
      { x: start, y: p.cy },
      { x: n.cx - n.w / 2 - 1, y: n.cy },
    ];
  };
  for (const n of nodes) {
    const e = branchEvent.get(n);
    const pts = branchPts(n);
    board.poly(pts, { stroke: e === undefined ? BRANCH : EVENT_COLOURS[e]!.line, width: e === undefined ? 1.8 : 3, id: idOf(n) });
    placer.addInk(idOf(n), pts);
  }
  // Highlighted branches over plain ones where they meet: redraw the coloured ones last.
  // (Marks are painted in order; the plain ones were drawn first, so nothing to redo unless an event branch was first.)

  // Node names, then branch probabilities.
  const NODE_H = board0.extent("V", { size: NODE_FONT, weight: 700 }).h;
  for (const n of nodes) {
    const e = branchEvent.get(n);
    board.label(n.label, n.cx, n.cy, { size: NODE_FONT, weight: 700, colour: e === undefined ? INK : EVENT_COLOURS[e]!.text, annotates: idOf(n), claim: false, width: n.w, id: `node-${n.id}` });
    placer.reserve({ x: n.cx - n.w / 2, y: n.cy - NODE_H / 2, width: n.w, height: NODE_H });
  }
  const headerRects: Rect[] = [];
  if (headers) {
    stages!.forEach((s, i) => {
      const w = textW(s, HEADER_FONT, 700);
      const cx = colX(i + 1);
      board.label(s, cx, 26, { size: HEADER_FONT, weight: 700, colour: SOFT, freeStanding: true, claim: false, width: w, id: `stage-${i + 1}` });
      headerRects.push({ x: cx - w / 2, y: 26 - 12, width: w, height: 24 });
    });
    if (answers) {
      const hl = locale === "pt-BR" ? "probabilidade do caminho" : "path probability";
      const w = textW(hl, HEADER_FONT, 700);
      board.label(hl, leafX + w / 2, 26, { size: HEADER_FONT, weight: 700, colour: SOFT, freeStanding: true, claim: false, width: w, id: "leaf-header" });
      headerRects.push({ x: leafX, y: 14, width: w, height: 24 });
    }
  }
  headerRects.forEach((r) => placer.reserve(r));
  if (answers) leaves.forEach((leaf, i) => {
    const w = textW(leafTexts[i]!, LEAF_FONT);
    const e = eventOfLeaf.get(leaf);
    board.label(leafTexts[i]!, leafX + w / 2, leaf.node.cy, {
      size: LEAF_FONT,
      colour: e === undefined ? INK : EVENT_COLOURS[e]!.text,
      weight: e === undefined ? 400 : 700,
      align: "start",
      freeStanding: true,
      claim: false,
      width: w,
      id: `leaf-${leaf.node.id}`,
    });
    placer.reserve({ x: leafX, y: leaf.node.cy - 13, width: w, height: 26 });
  });

  const PH = board0.extent("0", { size: PROB_FONT }).h;
  for (const n of nodes) {
    const text = probText.get(n)!;
    if (text === "") continue;
    const w = textW(text, PROB_FONT);
    const [a, b] = branchPts(n) as [Point, Point];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const downward = b.y - a.y > 0.5;
    // Above an upward or level branch, below a downward one; never on the line.
    const normal = downward ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x };
    const clearance = Math.abs(normal.x) * (w / 2) + Math.abs(normal.y) * (PH / 2) + CLEAR + 1;
    const centres: Point[] = [];
    for (const extra of [0, 3, 7, 12]) {
      for (const t of [0.5, 0.56, 0.44, 0.62, 0.38, 0.68, 0.32, 0.74, 0.26, 0.8, 0.2]) {
        centres.push({ x: a.x + (b.x - a.x) * t + normal.x * (clearance + extra), y: a.y + (b.y - a.y) * t + normal.y * (clearance + extra) });
      }
    }
    const chosen = placer.choose({ kind: "element", id: idOf(n) }, w, PH, centres);
    const e = branchEvent.get(n);
    board.label(text, chosen.centre.x, chosen.centre.y, { size: PROB_FONT, colour: e === undefined ? SOFT : EVENT_COLOURS[e]!.text, weight: e === undefined ? 400 : 700, annotates: idOf(n), claim: false, width: w, id: `p-${n.id}` });
    placer.commit(rectAt(chosen.centre, w, PH));
  }

  // The reading panel: what the highlighted paths add up to.
  if (lines.length > 0) {
    board.poly(
      [
        { x: MARGIN, y: treeBottom + 22 },
        { x: W - MARGIN, y: treeBottom + 22 },
      ],
      { stroke: RULE, width: 1, id: "panel-rule" },
    );
  }
  readingPanel.draw(board, { left: MARGIN, top: panelTop, cut: treeBottom + 14 });

  // The root and the dots, last, so no line covers them.
  board.circle({ x: x0, y: root.cy }, ROOT_R, { stroke: INK, width: 1, fill: INK, id: "root" });

  const title = input.title ?? "árvore de probabilidades";
  const spec = board.spec(title);
  const scene = spec.root as Scene;
  scene.connectors = [];
  spec.canvas = { ...spec.canvas, constraints: { allowOverlap: true, allowConnectorCrossing: true, allowCurvedConnectors: true } };
  return parseSpec(spec);
}

/** "P(E) = 3/10 + 3/10 = 3/5"; one term is not repeated: "P(E) = 3/10". */
function singleTerm(head: string, set: Leaf[], value: Fraction, w: Writer): string {
  if (set.length === 1) return `${head} ${w.tail(value)}`;
  return `${head} = ${set.map((l) => w.num(l.value)).join(" + ")} ${w.tail(value)}`;
}

// ---- validation -----------------------------------------------------------------------------------------------------

const KEYS = ["preset", "title", "locale", "stages", "root", "urn", "draws", "replacement", "events", "given", "notation", "also", "answers"];

export function validateProbabilityTreeInput(raw: Record<string, unknown>): void {
  const path = "probability-tree";
  for (const key of Object.keys(raw)) {
    if (!KEYS.includes(key)) throw new SpecError(`${path}.${key} is not a field; use ${KEYS.filter((k) => k !== "preset").join(", ")}`);
  }
  v.optionalString(raw, "title", path);
  v.optionalEnum(raw, "locale", path, LOCALES);
  v.optionalEnum(raw, "notation", path, ["fraction", "decimal", "percent"] as const);
  v.optionalEnum(raw, "also", path, ["percent", "decimal"] as const);
  // The tree, the arithmetic and every reference are exercised by building the figure.
  v.probe(() => expandProbabilityTree(raw as unknown as ProbabilityTreeInput));
}
