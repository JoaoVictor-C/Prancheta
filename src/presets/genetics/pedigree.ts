/**
 * The pedigree (heredograma). Individuals, who their parents are, who is
 * married: nothing about where anything goes. The generations, the order
 * within each generation, the x positions and every line are computed.
 *
 * Generations: an individual's generation is one more than its parents'; a
 * partner with no parents in the chart joins its spouse's generation.
 * Labels ("II-3") are DERIVED from the layout: the generation's Roman numeral
 * and the individual's place in that row, left to right.
 *
 * Order within a generation: sibships follow the order of their parents;
 * within a sibship, individuals who bring a spouse stand at its ends with the
 * spouse beside them (so the marriage line is a short horizontal segment and
 * the siblings' bar is not cut by a partner).
 *
 * Positions: each row is a sequence with a minimum spacing; positions solve a
 * least-squares problem -- children centred under their parents' marriage,
 * parents over their children, partners one spacing apart -- subject to the
 * spacing (pool-adjacent-violators), alternating down and up the generations.
 *
 * Lines are orthogonal: a marriage is a horizontal line between partners
 * (double when consanguineous: the partners share an ancestor in the chart, or
 * it is marked), a drop from its middle to a sibship bar, and a drop from the
 * bar to each child.
 */

import type { FigureSpec, TextRun } from "../../ir/types.ts";
import { SpecError, parseSpec } from "../../ir/types.ts";
import { Board } from "../function-graph/board.ts";
import { layoutPanel, rich } from "../shared/panel.ts";
import type { PanelLineInput } from "../shared/panel.ts";
import { decimalText, fractionText } from "../probability-tree/fraction.ts";
import { allelesRich, parseGenotype } from "./alleles.ts";
import { MODE_NAME, analyse, parseMode, supportText } from "./analysis.ts";
import type { AnalysisResult, Person, Query } from "./analysis.ts";
import { runsLabel } from "./draw.ts";
import { ACCENT, INK, PAPER, SOFT } from "./types.ts";
import type { CarrierStyle, PedigreeInput } from "./types.ts";

const M = 28;
const S = 38;
const GAP = 96;
const NUMERAL_COL = 62;
const FILL = "#2B3038";
const LINE = 2;
const PANEL_SIZE = 14;
const PANEL_LINE = 26;

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const romanOf = (g: number): string => ROMAN[g] ?? String(g);

type Union = { a: number; b: number; children: number[]; consanguineous: boolean };

// ---- the structure --------------------------------------------------------------------------------

export type Layout = {
  gen: number[];
  rows: number[][];
  x: number[];
  label: string[];
  unions: Union[];
};

function buildStructure(input: PedigreeInput): { ids: string[]; unions: Union[]; parentsOf: ([number, number] | undefined)[]; birthUnion: (Union | undefined)[] } {
  const path = "genetics.individuals";
  const ids = input.individuals.map((p) => p.id);
  const index = new Map<string, number>();
  ids.forEach((id, i) => {
    if (index.has(id)) throw new SpecError(`${path}: id ${JSON.stringify(id)} is used twice.`);
    index.set(id, i);
  });
  const need = (id: string, at: string): number => {
    const i = index.get(id);
    if (i === undefined) throw new SpecError(`${at}: ${JSON.stringify(id)} is not an individual (ids: ${ids.join(", ")}).`);
    return i;
  };
  const unions = new Map<string, Union>();
  const unionOf = (a: number, b: number): Union => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo},${hi}`;
    let u = unions.get(key);
    if (u === undefined) {
      u = { a: lo, b: hi, children: [], consanguineous: false };
      unions.set(key, u);
    }
    return u;
  };
  const parentsOf: ([number, number] | undefined)[] = [];
  const birthUnion: (Union | undefined)[] = [];
  input.individuals.forEach((p, i) => {
    if (p.parents === undefined) {
      parentsOf.push(undefined);
      birthUnion.push(undefined);
      return;
    }
    const a = need(p.parents[0], `${path}[${i}] (${p.id}).parents[0]`);
    const b = need(p.parents[1], `${path}[${i}] (${p.id}).parents[1]`);
    if (a === b) throw new SpecError(`${path}[${i}] (${p.id}).parents: the same individual twice.`);
    if (a === i || b === i) throw new SpecError(`${path}[${i}] (${p.id}).parents: an individual cannot be its own parent.`);
    parentsOf.push([a, b]);
    const u = unionOf(a, b);
    u.children.push(i);
    birthUnion.push(u);
  });
  (input.marriages ?? []).forEach((m, k) => {
    const a = need(m.between[0], `genetics.marriages[${k}].between[0]`);
    const b = need(m.between[1], `genetics.marriages[${k}].between[1]`);
    if (a === b) throw new SpecError(`genetics.marriages[${k}]: an individual cannot marry itself.`);
    const u = unionOf(a, b);
    if (m.consanguineous === true) u.consanguineous = true;
  });
  const list = [...unions.values()];
  // Consanguinity found from the chart: the partners share an ancestor.
  const ancestors = (i: number): Set<number> => {
    const out = new Set<number>();
    const walk = (j: number, depth: number): void => {
      if (depth > input.individuals.length) throw new SpecError(`genetics.individuals: ${ids[j]} is its own ancestor.`);
      for (const q of parentsOf[j] ?? []) {
        out.add(q);
        walk(q, depth + 1);
      }
    };
    walk(i, 0);
    return out;
  };
  for (const u of list) {
    if (u.consanguineous) continue;
    const A = ancestors(u.a);
    for (const q of ancestors(u.b)) if (A.has(q)) u.consanguineous = true;
  }
  return { ids, unions: list, parentsOf, birthUnion };
}

function generations(n: number, ids: string[], unions: Union[], parentsOf: ([number, number] | undefined)[]): number[] {
  const gen = new Array<number>(n).fill(1);
  let changed = true;
  let rounds = 0;
  while (changed) {
    changed = false;
    rounds += 1;
    if (rounds > 3 * n + 3) throw new SpecError("genetics.individuals: the parents form a cycle.");
    for (let p = 0; p < n; p += 1) {
      const par = parentsOf[p];
      if (par === undefined) continue;
      const g = Math.max(gen[par[0]]!, gen[par[1]]!) + 1;
      if (gen[p]! < g) {
        gen[p] = g;
        changed = true;
      }
    }
    for (const u of unions) {
      const g = Math.max(gen[u.a]!, gen[u.b]!);
      if (gen[u.a]! !== g || gen[u.b]! !== g) {
        gen[u.a] = g;
        gen[u.b] = g;
        changed = true;
      }
    }
  }
  for (let p = 0; p < n; p += 1) {
    const par = parentsOf[p];
    if (par === undefined) continue;
    if (gen[par[0]]! !== gen[par[1]]!) {
      throw new SpecError(`genetics.individuals: ${ids[par[0]]} (generation ${romanOf(gen[par[0]]!)}) and ${ids[par[1]]} (generation ${romanOf(gen[par[1]]!)}) are parents of ${ids[p]} but would sit in different generations; a couple's generation is the later one -- check who their own parents are.`);
    }
    if (gen[p]! !== gen[par[0]]! + 1) {
      throw new SpecError(`genetics.individuals: ${ids[p]} is a child of ${ids[par[0]]} and ${ids[par[1]]} (generation ${romanOf(gen[par[0]]!)}) but marriage places it in generation ${romanOf(gen[p]!)}; children are in the generation after their parents.`);
    }
  }
  return gen;
}

// ---- order within each row ---------------------------------------------------------------------------

function orderRows(n: number, ids: string[], gen: number[], unions: Union[], parentsOf: ([number, number] | undefined)[], birthUnion: (Union | undefined)[]): number[][] {
  const maxGen = Math.max(...gen);
  const spouses: number[][] = Array.from({ length: n }, () => []);
  for (const u of unions) {
    spouses[u.a]!.push(u.b);
    spouses[u.b]!.push(u.a);
  }
  const rows: number[][] = [];
  for (let g = 1; g <= maxGen; g += 1) {
    const members = [...Array(n).keys()].filter((p) => gen[p] === g);
    const placed = new Set<number>();
    const seq: number[] = [];
    // The union component of p inside the row, as a path.
    const pathOf = (p: number): number[] => {
      const comp = new Set<number>();
      const stack = [p];
      while (stack.length > 0) {
        const q = stack.pop()!;
        if (comp.has(q)) continue;
        comp.add(q);
        for (const s of spouses[q]!) stack.push(s);
      }
      const nodes = [...comp];
      for (const q of nodes) if (spouses[q]!.length > 2) throw new SpecError(`genetics: ${ids[q]} has ${spouses[q]!.length} partners; at most two per individual are drawn.`);
      if (nodes.length === 1) return nodes;
      const ends = nodes.filter((q) => spouses[q]!.length === 1);
      if (ends.length !== 2) throw new SpecError(`genetics: the marriages among ${nodes.map((q) => ids[q]).join(", ")} form a loop; they cannot be drawn on one row.`);
      const first = [...ends].sort((x, y) => x - y)[0]!;
      const out = [first];
      let prev = -1;
      let cur = first;
      for (;;) {
        const next = spouses[cur]!.find((s) => s !== prev);
        if (next === undefined) break;
        out.push(next);
        prev = cur;
        cur = next;
      }
      return out;
    };
    const putPath = (path: number[], anchor: number, side: "left" | "right"): void => {
      // The anchor stands next to its siblings, its partners outward.
      let ordered = path;
      const at = path.indexOf(anchor);
      // left of the sibs: partners first, the sibling last; right of the sibs: the sibling first
      if (path.length > 1 && (at === 0 || at === path.length - 1)) {
        const wantLast = side === "left";
        if ((at === path.length - 1) !== wantLast) ordered = [...path].reverse();
      }
      for (const q of ordered) if (!placed.has(q)) {
        placed.add(q);
        seq.push(q);
      }
    };
    if (g === 1) {
      for (const p of members) {
        if (placed.has(p)) continue;
        for (const q of pathOf(p)) if (!placed.has(q)) {
          placed.add(q);
          seq.push(q);
        }
      }
    } else {
      const prev = rows[g - 2]!;
      const prevIndex = new Map(prev.map((p, i) => [p, i]));
      const sibships = new Map<Union, number[]>();
      for (const p of members) {
        const u = birthUnion[p];
        if (u === undefined) continue;
        if (!sibships.has(u)) sibships.set(u, []);
        sibships.get(u)!.push(p);
      }
      const sorted = [...sibships.entries()].sort(([ua, ma], [ub, mb]) => {
        const ka = ((prevIndex.get(ua.a) ?? 0) + (prevIndex.get(ua.b) ?? 0)) / 2;
        const kb = ((prevIndex.get(ub.a) ?? 0) + (prevIndex.get(ub.b) ?? 0)) / 2;
        return ka !== kb ? ka - kb : ma[0]! - mb[0]!;
      });
      for (const [, sibs] of sorted) {
        const own = sibs.filter((p) => !placed.has(p));
        const married = own.filter((p) => spouses[p]!.some((s) => !sibs.includes(s) && !placed.has(s)));
        const plain = own.filter((p) => !married.includes(p));
        const leftMarried = married.slice(0, Math.floor(married.length / 2));
        const rightMarried = married.slice(leftMarried.length);
        for (const p of leftMarried) putPath(pathOf(p), p, "left");
        for (const p of plain) if (!placed.has(p)) {
          // a sibling already placed through a cousin marriage stays where it is; others stand in the middle
          const path = pathOf(p);
          for (const q of path) if (!placed.has(q)) {
            placed.add(q);
            seq.push(q);
          }
        }
        for (const p of rightMarried) putPath(pathOf(p), p, "right");
      }
      for (const p of members) {
        if (placed.has(p)) continue;
        for (const q of pathOf(p)) if (!placed.has(q)) {
          placed.add(q);
          seq.push(q);
        }
      }
    }
    rows.push(seq);
  }
  return rows;
}

// ---- positions ---------------------------------------------------------------------------------------------

/** Weighted least squares with x[i+1] - x[i] >= gap, by pooling adjacent violators. */
function projectRow(targets: number[], weights: number[], gap: number): number[] {
  const n = targets.length;
  const u = targets.map((t, i) => t - i * gap);
  type Block = { sum: number; w: number; count: number };
  const blocks: Block[] = [];
  for (let i = 0; i < n; i += 1) {
    blocks.push({ sum: u[i]! * weights[i]!, w: weights[i]!, count: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!;
      const a = blocks[blocks.length - 2]!;
      if (a.sum / a.w <= b.sum / b.w) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, w: a.w + b.w, count: a.count + b.count });
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.count; k += 1) out.push(b.sum / b.w + out.length * gap);
  return out;
}

function placeRows(n: number, rows: number[][], unions: Union[], birthUnion: (Union | undefined)[]): number[] {
  const x = new Array<number>(n).fill(0);
  rows.forEach((row) => row.forEach((p, i) => (x[p] = i * GAP)));
  const unionsOf: Union[][] = Array.from({ length: n }, () => []);
  for (const u of unions) {
    unionsOf[u.a]!.push(u);
    unionsOf[u.b]!.push(u);
  }
  const span = (ps: number[]): number => (Math.min(...ps.map((p) => x[p]!)) + Math.max(...ps.map((p) => x[p]!))) / 2;
  const solve = (r: number, wParents: number, wChildren: number): void => {
    const row = rows[r]!;
    const pos = new Map(row.map((p, i) => [p, i]));
    const targets: number[] = [];
    const weights: number[] = [];
    for (const p of row) {
      let sum = x[p]! * 0.1;
      let w = 0.1;
      const add = (t: number, wt: number): void => {
        sum += t * wt;
        w += wt;
      };
      const bu = birthUnion[p];
      if (bu !== undefined) add(x[p]! + (x[bu.a]! + x[bu.b]!) / 2 - span(bu.children), wParents);
      for (const u of unionsOf[p]!) {
        if (u.children.length > 0) add(x[p]! + span(u.children) - (x[u.a]! + x[u.b]!) / 2, wChildren);
        const q = u.a === p ? u.b : u.a;
        if (pos.has(q)) add(x[q]! + (pos.get(q)! > pos.get(p)! ? -GAP : GAP), 4);
      }
      targets.push(sum / w);
      weights.push(w);
    }
    const solved = projectRow(targets, weights, GAP);
    row.forEach((p, i) => (x[p] = solved[i]!));
  };
  for (let it = 0; it < 30; it += 1) {
    for (let r = 0; r < rows.length; r += 1) solve(r, 4, 0.5);
    for (let r = rows.length - 1; r >= 0; r -= 1) solve(r, 0.5, 4);
  }
  for (let r = 0; r < rows.length; r += 1) solve(r, 4, 0.2);
  const min = Math.min(...x);
  return x.map((v) => v - min);
}

// ---- the symbols -----------------------------------------------------------------------------------------------

type SymbolSpec = { sex: "M" | "F" | "?"; affected: boolean; carrier: boolean; deceased: boolean };

const halfWidth = (sex: "M" | "F" | "?", size: number): number => (sex === "?" ? size * 0.66 : size / 2);

function drawSymbol(board: Board, id: string, cx: number, cy: number, size: number, s: SymbolSpec, style: CarrierStyle): void {
  const r = size / 2;
  const fill = s.affected ? FILL : "#FFFFFF";
  const shape = (inset: number, half: boolean): { x: number; y: number }[] => {
    if (s.sex === "M") {
      const l = cx - r + inset;
      const t = cy - r + inset;
      const b = cy + r - inset;
      return half ? [{ x: l, y: t }, { x: cx, y: t }, { x: cx, y: b }, { x: l, y: b }] : [{ x: l, y: t }, { x: cx + r - inset, y: t }, { x: cx + r - inset, y: b }, { x: l, y: b }];
    }
    const d = size * 0.66 - inset * 1.4;
    return half ? [{ x: cx, y: cy - d }, { x: cx, y: cy + d }, { x: cx - d, y: cy }] : [{ x: cx, y: cy - d }, { x: cx + d, y: cy }, { x: cx, y: cy + d }, { x: cx - d, y: cy }];
  };
  if (s.sex === "F") board.circle({ x: cx, y: cy }, r, { stroke: INK, width: LINE, fill, id });
  else board.poly(shape(0, false), { stroke: INK, width: LINE, fill, close: true, id });
  if (s.carrier && !s.affected) {
    if (style === "dot") {
      board.circle({ x: cx, y: cy }, size * 0.13, { stroke: "none", width: 0, fill: FILL, id: `${id}-dot` });
    } else if (s.sex === "F") {
      const rr = r - 1;
      const at = (deg: number): { x: number; y: number } => ({ x: cx + rr * Math.cos((deg * Math.PI) / 180), y: cy - rr * Math.sin((deg * Math.PI) / 180) });
      board.marks.push({ id: `${id}-half`, from: at(90), segments: [{ arc: at(180), centre: { x: cx, y: cy } }, { arc: at(270), centre: { x: cx, y: cy } }], close: true, fill: FILL, stroke: "none", strokeWidth: 0 });
    } else {
      board.poly(shape(1.5, true), { stroke: "none", width: 0, fill: FILL, close: true, id: `${id}-half` });
    }
  }
  if (s.deceased) {
    const e = (s.sex === "?" ? size * 0.66 : r) + 6;
    board.poly([{ x: cx - e, y: cy + e }, { x: cx + e, y: cy - e }], { stroke: INK, width: LINE, id: `${id}-slash` });
  }
}

const roman = romanOf;

// ---- the figure -------------------------------------------------------------------------------------------------

type Built = {
  layout: Layout;
  persons: Person[];
  analysis: AnalysisResult | undefined;
  mode: ReturnType<typeof parseMode> | undefined;
};

function genderWord(sex: "M" | "F" | "?", masculine: string, feminine: string, neutral: string): string {
  return sex === "M" ? masculine : sex === "F" ? feminine : neutral;
}

export function layoutPedigree(input: PedigreeInput): Layout {
  const { ids, unions, parentsOf, birthUnion } = buildStructure(input);
  const n = ids.length;
  const gen = generations(n, ids, unions, parentsOf);
  const rows = orderRows(n, ids, gen, unions, parentsOf, birthUnion);
  for (const u of unions) {
    const row = rows[gen[u.a]! - 1]!;
    if (Math.abs(row.indexOf(u.a) - row.indexOf(u.b)) !== 1) {
      throw new SpecError(`genetics: ${ids[u.a]} and ${ids[u.b]} are married but cannot stand side by side (other individuals sit between them in generation ${roman(gen[u.a]!)}); check the marriages and parents around them.`);
    }
  }
  const label = new Array<string>(n).fill("");
  rows.forEach((row, r) => row.forEach((p, i) => (label[p] = `${roman(r + 1)}-${i + 1}`)));
  ids.forEach((id, p) => {
    if (/^[IVX]+-\d+$/.test(id) && id !== label[p]) {
      throw new SpecError(`genetics.individuals: id ${JSON.stringify(id)} looks like a label, but the layout numbers this individual ${label[p]} (generations are counted from the founders, numbers run left to right); rename the id or reorder the individuals.`);
    }
  });
  const x = placeRows(n, rows, unions, birthUnion);
  return { gen, rows, x, label, unions };
}

function buildAnalysis(input: PedigreeInput, layout: Layout, parentsOf: ([number, number] | undefined)[]): Built["analysis"] & object {
  const a = input.analysis!;
  const mode = parseMode(a.mode, "genetics.analysis.mode");
  const people: Person[] = input.individuals.map((p, i) => ({
    id: p.id,
    label: layout.label[i]!,
    sex: p.sex,
    affected: p.affected === true,
    carrier: p.carrier === true,
    parents: parentsOf[i],
    genotype: p.genotype,
  }));
  const index = (id: string, at: string): number => {
    const i = input.individuals.findIndex((p) => p.id === id);
    if (i < 0) throw new SpecError(`${at}: ${JSON.stringify(id)} is not an individual.`);
    return i;
  };
  const queries: Query[] = (a.queries ?? []).map((q, k) => {
    const at = `genetics.analysis.queries[${k}]`;
    if ("childOf" in q) {
      const ia = index(q.childOf[0], `${at}.childOf[0]`);
      const ib = index(q.childOf[1], `${at}.childOf[1]`);
      const adj = q.is === "affected" ? genderWord(q.sex ?? "?", "afetado", "afetada", "afetada") : genderWord(q.sex ?? "?", "portador", "portadora", "portadora");
      const who = q.sex === undefined ? `criança de ${layout.label[ia]} e ${layout.label[ib]} ser ${adj}` : `criança de ${layout.label[ia]} e ${layout.label[ib]} ser ${q.sex === "M" ? "menino" : "menina"} e ${adj}`;
      const text = q.label ?? `P(${who})`;
      return { id: `q${k}`, text, kind: { type: "child", a: ia, b: ib, is: q.is, sex: q.sex } };
    }
    const i = index(q.of, `${at}.of`);
    const sex = people[i]!.sex;
    if (q.is === "genotype") {
      const loci = parseGenotype(q.genotype, `${at}.genotype`);
      const text = q.label ?? `P(${layout.label[i]} ter genótipo ${allelesRich(loci.flatMap((l) => l.alleles))})`;
      return { id: `q${k}`, text, kind: { type: "genotype", person: i, s: -1 } };
    }
    const adj = q.is === "carrier" ? genderWord(sex, "portador", "portadora", "portador(a)") : q.is === "affected" ? genderWord(sex, "afetado", "afetada", "afetado(a)") : genderWord(sex, "não afetado", "não afetada", "não afetado(a)");
    const text = q.label ?? `P(${layout.label[i]} ser ${adj})`;
    return { id: `q${k}`, text, kind: { type: "of", person: i, is: q.is } };
  });
  // genotype queries need the mode to turn the typed genotype into a state
  return runAnalysis(input, mode, people, layout, queries);
}

import { stateOfGenotype } from "./analysis.ts";

function runAnalysis(input: PedigreeInput, mode: ReturnType<typeof parseMode>, people: Person[], layout: Layout, queries: Query[]): AnalysisResult {
  const a = input.analysis!;
  queries.forEach((q, k) => {
    if (q.kind.type === "genotype") {
      const spec = a.queries![k]! as { genotype: string };
      q.kind.s = stateOfGenotype(mode, people[q.kind.person]!.sex, spec.genotype, `genetics.analysis.queries[${k}].genotype`);
    }
  });
  const order = [...people.keys()].sort((p, q) => layout.gen[p]! - layout.gen[q]! || p - q);
  return analyse(mode, people, order, queries, a.frequency);
}

export function expandPedigree(input: PedigreeInput): FigureSpec {
  const answers = input.answers !== false;
  const style: CarrierStyle = input.carrierStyle ?? "dot";
  const layout = layoutPedigree(input);
  const { parentsOf } = buildStructure(input);
  const n = input.individuals.length;
  const analysis = input.analysis === undefined ? undefined : buildAnalysis(input, layout, parentsOf);
  const mode = input.analysis === undefined ? undefined : parseMode(input.analysis.mode, "genetics.analysis.mode");

  // Lines of text under each symbol: label, then (answers) the genotype, then a name.
  const genoText: (string | undefined)[] = input.individuals.map((p, i) => {
    if (!answers || analysis === undefined || mode === undefined) return undefined;
    return supportText(mode, p.sex, analysis.support[i]!);
  });
  const linesOf = input.individuals.map((p, i) => 1 + (genoText[i] === undefined ? 0 : 1) + (p.name === undefined ? 0 : 1));
  const maxLines = Math.max(...linesOf);
  const LINE_H = 23;
  const labelH = maxLines * LINE_H;
  const rowH = S + 8 + labelH + 22 + 46;

  // The panel.
  const panel: PanelLineInput[] = [];
  if (answers && analysis !== undefined && mode !== undefined) {
    panel.push({ text: `O heredograma é compatível com ${MODE_NAME[mode]}.`, emphasis: "soft", id: "consistent" });
    analysis.answers.forEach((q, i) => {
      const pct = decimalText(q.p, "pt-BR", { percent: true });
      const eq = q.p.d === 1n ? "" : `  ${pct.exact ? "=" : "≈"} ${pct.text}`;
      panel.push({ text: `${q.text} = ${fractionText(q.p)}${eq}`, emphasis: "accent", colour: ACCENT, id: `q-${i}`, gap: i === 0 ? 6 : 0 });
    });
  }

  // The legend: only what the chart uses.
  const used = {
    M: input.individuals.some((p) => p.sex === "M"),
    F: input.individuals.some((p) => p.sex === "F"),
    "?": input.individuals.some((p) => p.sex === "?"),
    affected: input.individuals.some((p) => p.affected === true),
    carrier: input.individuals.some((p) => p.carrier === true && p.affected !== true),
    deceased: input.individuals.some((p) => p.deceased === true),
    consanguineous: layout.unions.some((u) => u.consanguineous),
  };
  type Key = { sym?: SymbolSpec; text: string; double?: boolean };
  const keyItems: Key[] = [];
  const base = { affected: false, carrier: false, deceased: false };
  if (used.M) keyItems.push({ sym: { sex: "M", ...base }, text: "homem" });
  if (used.F) keyItems.push({ sym: { sex: "F", ...base }, text: "mulher" });
  if (used["?"]) keyItems.push({ sym: { sex: "?", ...base }, text: "sexo não informado" });
  if (used.affected) keyItems.push({ sym: { sex: used.F && !used.M ? "F" : "M", ...base, affected: true }, text: "afetado(a)" });
  if (used.carrier) keyItems.push({ sym: { sex: "F", ...base, carrier: true }, text: "portador(a)" });
  if (used.deceased) keyItems.push({ sym: { sex: "M", ...base, deceased: true }, text: "falecido(a)" });
  if (used.consanguineous) keyItems.push({ text: "casamento consanguíneo", double: true });
  const showLegend = input.legend !== false && keyItems.length > 0;
  const probe = new Board(10, 10, PAPER);
  const KEY = 20;
  const KEY_FONT = 13;
  const keyWidths = keyItems.map((k) => (k.sym === undefined ? 34 : KEY + 4) + 8 + probe.measure(k.text, KEY_FONT));
  const legendW = keyWidths.reduce((s, w) => s + w, 0) + Math.max(0, keyItems.length - 1) * 26;

  // Geometry.
  const rowsN = layout.rows.length;
  const maxX = Math.max(...layout.x);
  const left = M + NUMERAL_COL;
  const treeW = left + maxX + 60 + M;
  const readingPanel = layoutPanel(panel, { width: Math.max(treeW - 2 * M, 520), size: PANEL_SIZE, lineHeight: PANEL_LINE });
  const rowY = (r: number): number => M + 6 + S / 2 + r * rowH;
  const treeBottom = rowY(rowsN - 1) + S / 2 + 8 + labelH;
  const legendTop = treeBottom + 30;
  const afterLegend = showLegend ? legendTop + KEY + 10 : treeBottom;
  const panelTop = afterLegend + (readingPanel.empty ? 0 : 22);
  const width = Math.ceil(Math.max(treeW, showLegend ? legendW + 2 * M : 0, readingPanel.width + 2 * M));
  const height = Math.ceil(panelTop + readingPanel.height + M - (readingPanel.empty ? 0 : 6));
  const board = new Board(width, height, PAPER);
  const px = (p: number): number => left + layout.x[p]!;
  const py = (p: number): number => rowY(layout.gen[p]! - 1);

  // Generation numerals.
  layout.rows.forEach((_, r) => {
    board.label(roman(r + 1), M + 14, rowY(r), { size: 16, weight: 700, colour: SOFT, freeStanding: true, id: `generation-${r + 1}` });
  });

  // Marriages and sibships first, symbols over them.
  const topOf = (p: number): number => (input.individuals[p]!.sex === "?" ? S * 0.66 : S / 2);
  layout.unions.forEach((u, k) => {
    const [l, r] = px(u.a) < px(u.b) ? [u.a, u.b] : [u.b, u.a];
    const y = py(l);
    const x1 = px(l) + halfWidth(input.individuals[l]!.sex, S);
    const x2 = px(r) - halfWidth(input.individuals[r]!.sex, S);
    const xm = (px(l) + px(r)) / 2;
    if (u.consanguineous) {
      board.poly([{ x: x1, y: y - 2.6 }, { x: x2, y: y - 2.6 }], { stroke: INK, width: LINE, id: `union-${k}-a` });
      board.poly([{ x: x1, y: y + 2.6 }, { x: x2, y: y + 2.6 }], { stroke: INK, width: LINE, id: `union-${k}-b` });
    } else {
      board.poly([{ x: x1, y }, { x: x2, y }], { stroke: INK, width: LINE, id: `union-${k}` });
    }
    if (u.children.length === 0) return;
    const barY = y + S / 2 + 8 + labelH + 22;
    const xs = u.children.map(px);
    const lo = Math.min(xm, ...xs);
    const hi = Math.max(xm, ...xs);
    board.poly([{ x: xm, y: y + (u.consanguineous ? 2.6 : 0) }, { x: xm, y: barY }], { stroke: INK, width: LINE, id: `drop-${k}` });
    if (hi > lo) board.poly([{ x: lo, y: barY }, { x: hi, y: barY }], { stroke: INK, width: LINE, id: `bar-${k}` });
    u.children.forEach((c) => {
      board.poly([{ x: px(c), y: barY }, { x: px(c), y: py(c) - topOf(c) }], { stroke: INK, width: LINE, id: `child-${k}-${c}` });
    });
  });

  // Symbols, labels.
  input.individuals.forEach((p, i) => {
    const x = px(i);
    const y = py(i);
    const id = `sym-${i}`;
    drawSymbol(board, id, x, y, S, { sex: p.sex, affected: p.affected === true, carrier: p.carrier === true, deceased: p.deceased === true }, style);
    const top = y + topOf(i) + 14 - (p.sex === "?" ? 0 : 0);
    let cy = top + (p.sex === "?" ? 2 : 0);
    board.label(layout.label[i]!, x, cy, { size: 13, weight: 600, annotates: id, claim: false, id: `label-${i}` });
    if (genoText[i] !== undefined) {
      cy += LINE_H;
      const runs: TextRun[] = rich(genoText[i]!);
      runsLabel(board, runs, x, cy, { size: 13, weight: 700, colour: ACCENT, annotates: id, claim: false, id: `genotype-${i}` });
    }
    if (p.name !== undefined) {
      cy += LINE_H;
      board.label(p.name, x, cy, { size: 12.5, colour: SOFT, annotates: id, claim: false, id: `name-${i}` });
    }
    if (p.proband === true) {
      const half = halfWidth(p.sex, S);
      const tip = { x: x - half - 3, y: y + half + 3 };
      const tail = { x: tip.x - 26, y: tip.y + 18 };
      const ang = Math.atan2(tip.y - tail.y, tip.x - tail.x);
      const head = (da: number): { x: number; y: number } => ({ x: tip.x - 9 * Math.cos(ang + da), y: tip.y - 9 * Math.sin(ang + da) });
      board.poly([tail, tip], { stroke: INK, width: LINE, id: `proband-${i}` });
      board.poly([head(0.45), tip, head(-0.45)], { stroke: INK, width: LINE, id: `proband-head-${i}` });
    }
  });

  // Legend.
  if (showLegend) {
    let x = Math.max(M, (width - legendW) / 2);
    const y = legendTop + KEY / 2;
    keyItems.forEach((k, i) => {
      if (k.sym !== undefined) {
        drawSymbol(board, `key-${i}`, x + KEY / 2 + 2, y, KEY, k.sym, style);
        x += KEY + 4 + 8;
      } else {
        board.poly([{ x, y: y - 2.6 }, { x: x + 34, y: y - 2.6 }], { stroke: INK, width: LINE, id: `key-${i}-a` });
        board.poly([{ x, y: y + 2.6 }, { x: x + 34, y: y + 2.6 }], { stroke: INK, width: LINE, id: `key-${i}-b` });
        x += 34 + 8;
      }
      const w = probe.measure(k.text, KEY_FONT);
      board.label(k.text, x + w / 2, y, { size: KEY_FONT, colour: SOFT, freeStanding: true, id: `key-text-${i}`, width: w });
      x += w + 26;
    });
  }

  readingPanel.draw(board, { left: M, top: panelTop, cut: afterLegend + 8 });
  void n;
  return parseSpec(board.spec(input.title ?? "heredograma"));
}
