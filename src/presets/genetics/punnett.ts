/**
 * The Punnett square. Parents' genotypes in; the gametes of each (independent
 * assortment), the grid of offspring genotypes (alleles dominant first), the
 * phenotype of every cell under the stated dominance, and the proportions as
 * exact fractions and ratios -- all COMPUTED. See ADR 0070.
 */

import type { FigureSpec, TextRun } from "../../ir/types.ts";
import { SpecError, parseSpec, runsText } from "../../ir/types.ts";
import { Board } from "../function-graph/board.ts";
import { layoutPanel, rich } from "../shared/panel.ts";
import type { PanelLineInput } from "../shared/panel.ts";
import { ONE, ZERO, add, decimalText, eq, frac, fractionText, mul, withSign } from "../probability-tree/fraction.ts";
import type { Fraction } from "../probability-tree/fraction.ts";
import { gcdBig } from "../../math/integer.ts";
import { WILD, allelesRich, alleleKey, genotypeRuns, isRecessiveAllele, isX, isY, parseGenotype, sameAllele, tokenize } from "./alleles.ts";
import type { Allele, Locus } from "./alleles.ts";
import { runsLabel, widthOf } from "./draw.ts";
import { ACCENT, INK, LIGHT, PAPER, RULE, SOFT, SWATCHES, TINTS } from "./types.ts";
import type { Dominance, PunnettInput } from "./types.ts";

const M = 28;
const CELL_H = 46;
const MARGIN_H = 56;
const GAMETE_SIZE = 17;
const CELL_SIZE = 16;
const HEAD_SIZE = 15;
const PANEL_SIZE = 14;
const PANEL_LINE = 26;

// ---- the cross -----------------------------------------------------------------------------------

type Gamete = { alleles: Allele[]; w: Fraction };

type LocusInfo = {
  key: string;
  kind: "autosomal" | "x";
  mode: Dominance;
  /** Alleles in the order the cross meets them, recessive ones last. */
  order: Allele[];
  names: Map<string, string>;
  dominant: Allele | undefined;
  recessive: Allele | undefined;
  /** Complete dominance: the two names given, if any. */
  dominantName: string | undefined;
  recessiveName: string | undefined;
};

type Cross = {
  loci: LocusInfo[];
  parents: [Locus[], Locus[]];
  gametes: [Gamete[], Gamete[]];
  sexLinked: boolean;
};

function rankOf(info: LocusInfo, a: Allele): number {
  if (isY(a)) return 9000;
  const i = info.order.findIndex((o) => sameAllele(o, a));
  return (isRecessiveAllele(a) ? 1000 : 0) + (i < 0 ? 500 : i);
}

const sortPair = (info: LocusInfo, pair: Allele[]): Allele[] => [...pair].sort((a, b) => rankOf(info, a) - rankOf(info, b));

function genotypeKeyOf(info: LocusInfo, pair: Allele[]): string {
  return sortPair(info, pair).map(alleleKey).join("|");
}

function gametesOf(loci: Locus[], infos: LocusInfo[]): Gamete[] {
  let out: Gamete[] = [{ alleles: [], w: ONE }];
  loci.forEach((locus, li) => {
    const sorted = sortPair(infos[li]!, locus.alleles);
    const distinct = sorted.filter((a, i) => sorted.findIndex((b) => sameAllele(a, b)) === i);
    const each = frac(1n, BigInt(distinct.length));
    const next: Gamete[] = [];
    for (const g of out) for (const a of distinct) next.push({ alleles: [...g.alleles, a], w: mul(g.w, each) });
    out = next;
  });
  return out;
}

function readDominance(input: PunnettInput, key: string): Dominance {
  const d = input.dominance;
  if (d === undefined) return "complete";
  if (typeof d === "string") return d;
  return d[key] ?? "complete";
}

export function buildCross(input: PunnettInput): Cross {
  const a = parseGenotype(input.parents[0], "genetics.parents[0]");
  const b = parseGenotype(input.parents[1], "genetics.parents[1]");
  const keys = (l: Locus[]): string => l.map((x) => x.key).join(",");
  if (keys(a) !== keys(b)) {
    throw new SpecError(`genetics.parents: the parents are not typed at the same loci (${input.parents[0]} has ${keys(a)}, ${input.parents[1]} has ${keys(b)}); give both parents a pair for each locus, in the same order.`);
  }
  const seen = new Set<string>();
  for (const l of a) {
    if (seen.has(l.key)) throw new SpecError(`genetics.parents: locus ${l.key} appears twice in ${input.parents[0]}; linked or repeated loci are not drawn.`);
    seen.add(l.key);
  }
  const sexLinked = a.some((l) => l.kind === "x");
  if (sexLinked) {
    const xa = a.find((l) => l.kind === "x")!;
    const xb = b.find((l) => l.kind === "x")!;
    const males = [xa, xb].filter((l) => isY(l.alleles[1])).length;
    if (males !== 1) throw new SpecError(`genetics.parents: a sex-linked cross needs one XX parent and one XY parent, got ${input.parents[0]} and ${input.parents[1]}.`);
  }
  for (const key of Object.keys(input.phenotypes ?? {})) if (!a.some((l) => l.key === key)) throw new SpecError(`genetics.phenotypes.${key}: no locus ${key} in the cross (loci: ${keys(a)}).`);
  if (typeof input.dominance === "object") {
    for (const key of Object.keys(input.dominance)) if (!a.some((l) => l.key === key)) throw new SpecError(`genetics.dominance.${key}: no locus ${key} in the cross (loci: ${keys(a)}).`);
  }

  const infos: LocusInfo[] = a.map((la, i) => {
    const lb = b[i]!;
    const mode = readDominance(input, la.key);
    const all: Allele[] = [];
    // recessive alleles last; otherwise the order the cross meets them
    for (const al of [...la.alleles, ...lb.alleles]) if (!isY(al) && !all.some((o) => sameAllele(o, al))) all.push(al);
    all.sort((p, q) => Number(isRecessiveAllele(p)) - Number(isRecessiveAllele(q)));
    const dominants = all.filter((al) => !isRecessiveAllele(al));
    const recessives = all.filter((al) => isRecessiveAllele(al));
    if (all.length > 2 && mode !== "codominance") {
      throw new SpecError(`genetics: locus ${la.key} has ${all.length} alleles in this cross; with more than two, set dominance.${la.key} to "codominance" (the ABO system) -- complete and incomplete dominance describe two alleles.`);
    }
    if (mode === "complete" && dominants.length > 1) {
      throw new SpecError(`genetics: locus ${la.key}: ${dominants.map(alleleKey).join(" and ")} are both capital letters, so neither is recessive; for complete dominance one allele must be lower case ("A", "a"). Use dominance "incomplete" or "codominance".`);
    }
    if (mode === "complete" && recessives.length > 1) throw new SpecError(`genetics: locus ${la.key} has two recessive alleles; use dominance "codominance".`);
    const info: LocusInfo = {
      key: la.key,
      kind: la.kind,
      mode,
      order: all,
      names: new Map(),
      dominant: dominants[0],
      recessive: recessives[0],
      dominantName: undefined,
      recessiveName: undefined,
    };
    const named = input.phenotypes?.[la.key];
    if (named !== undefined) {
      for (const [k, v] of Object.entries(named)) {
        if (mode === "complete") {
          if (k === "dominant") info.dominantName = v;
          else if (k === "recessive") info.recessiveName = v;
          else throw new SpecError(`genetics.phenotypes.${la.key}.${k}: with complete dominance a locus has two phenotypes, "dominant" and "recessive".`);
        } else {
          const alleles = tokenize(k, `genetics.phenotypes.${la.key}.${k}`);
          for (const al of alleles) {
            if (!isY(al) && !all.some((o) => sameAllele(o, al))) throw new SpecError(`genetics.phenotypes.${la.key}.${k}: ${alleleKey(al)} is not an allele of this cross (${all.map(alleleKey).join(", ")}).`);
          }
          info.names.set(genotypeKeyOf(info, alleles), v);
        }
      }
    }
    return info;
  });
  return { loci: infos, parents: [a, b], gametes: [gametesOf(a, infos), gametesOf(b, infos)], sexLinked };
}

// ---- phenotypes -----------------------------------------------------------------------------------

type Phenotype = { label: string; named: boolean };

function locusPhenotype(info: LocusInfo, pair: Allele[]): Phenotype {
  const expressed = pair.filter((a) => !isY(a));
  const key = genotypeKeyOf(info, pair);
  if (info.mode === "complete") {
    const dominant = expressed.some((a) => !isRecessiveAllele(a));
    if (dominant) {
      if (info.dominantName !== undefined) return { label: info.dominantName, named: true };
      const d = allelesRich([info.dominant!]);
      return { label: info.kind === "x" ? d : `${d}_`, named: false };
    }
    if (info.recessiveName !== undefined) return { label: info.recessiveName, named: true };
    const r = allelesRich([info.recessive!]);
    return { label: info.kind === "x" ? r : `${r}${r}`, named: false };
  }
  const given = info.names.get(key);
  if (given !== undefined) return { label: given, named: true };
  if (info.mode === "incomplete") return { label: allelesRich(sortPair(info, expressed)), named: false };
  // codominance: every non-recessive allele present is expressed
  const shown = sortPair(info, expressed).filter((a, i, arr) => !isRecessiveAllele(a) && arr.findIndex((o) => sameAllele(o, a)) === i);
  if (info.key === "I" && shown.every((a) => a.sup !== "")) {
    return { label: shown.length === 0 ? "O" : shown.map((a) => a.sup.toUpperCase()).join(""), named: false };
  }
  if (shown.length === 0) {
    const r = allelesRich([info.recessive!]);
    return { label: `${r}${r}`, named: false };
  }
  return { label: shown.map((a) => allelesRich([a])).join(" e "), named: false };
}

// ---- the grid --------------------------------------------------------------------------------------

type Cell = {
  alleles: Allele[][];
  genotypeKey: string;
  genotypeRichText: string;
  runs: TextRun[];
  sex: "F" | "M" | undefined;
  phenotype: string;
  w: Fraction;
};

function buildCells(cross: Cross, sexWords: { F: string; M: string }): Cell[][] {
  const [rowsG, colsG] = cross.gametes;
  return rowsG.map((rg) =>
    colsG.map((cg) => {
      const loci = cross.loci.map((info, i) => sortPair(info, [rg.alleles[i]!, cg.alleles[i]!]));
      const flat = loci.flat();
      const x = cross.loci.findIndex((l) => l.kind === "x");
      const sex = x < 0 ? undefined : isY(loci[x]![1]!) ? "M" : "F";
      const parts = cross.loci.map((info, i) => locusPhenotype(info, loci[i]!));
      const anyNamed = parts.some((p) => p.named);
      let phenotype = parts.map((p) => p.label).join(anyNamed ? " e " : "");
      if (sex !== undefined) phenotype = `${sexWords[sex]} ${phenotype}`;
      return {
        alleles: loci,
        genotypeKey: flat.map(alleleKey).join("|"),
        genotypeRichText: allelesRich(flat),
        runs: genotypeRuns(flat),
        sex,
        phenotype,
        w: mul(rg.w, cg.w),
      };
    }),
  );
}

/** Integer ratio of weights: the smallest whole numbers in proportion. */
export function ratioOf(ws: Fraction[]): string {
  let d = 1n;
  for (const w of ws) d = (d * w.d) / gcdBig(d, w.d);
  const counts = ws.map((w) => (w.n * d) / w.d);
  let g = 0n;
  for (const c of counts) g = gcdBig(g, c);
  return counts.map((c) => (c / (g || 1n)).toString()).join(" : ");
}

// ---- patterns for "highlight" -------------------------------------------------------------------

function matchesPattern(pattern: Locus[], cell: Cell, cross: Cross): boolean {
  if (pattern.length !== cross.loci.length) return false;
  return pattern.every((p, i) => {
    if (p.key !== cross.loci[i]!.key && p.key !== WILD) return false;
    const [p1, p2] = p.alleles;
    const [g1, g2] = cell.alleles[i]! as [Allele, Allele];
    const ok = (x: Allele, g: Allele): boolean => x.base === WILD || sameAllele(x, g);
    return (ok(p1, g1) && ok(p2, g2)) || (ok(p1, g2) && ok(p2, g1));
  });
}

// ---- the figure --------------------------------------------------------------------------------------

const plain = (rich_: string): string => runsText(rich(rich_));

export function expandPunnett(input: PunnettInput): FigureSpec {
  const answers = input.answers !== false;
  const cross = buildCross(input);
  const sexWords = input.sexWords ?? { F: "filha", M: "filho" };
  const cells = buildCells(cross, sexWords);
  const rows = cells.length;
  const cols = cells[0]!.length;

  // Parents' names and the header.
  const sexOf = (l: Locus[]): "F" | "M" | undefined => {
    const x = l.find((q) => q.kind === "x");
    return x === undefined ? undefined : isY(x.alleles[1]) ? "M" : "F";
  };
  const names: [string, string] = input.names ?? [0, 1].map((i) => {
    const s = sexOf(cross.parents[i]!);
    return s === "F" ? "Mãe" : s === "M" ? "Pai" : `Genitor ${i + 1}`;
  }) as [string, string];
  const sortedParent = (i: 0 | 1): TextRun[] => genotypeRuns(cross.loci.flatMap((info, li) => sortPair(info, cross.parents[i][li]!.alleles)));
  const headRuns: TextRun[] = [{ text: `${names[0]} ` }, ...sortedParent(0), { text: `  ×  ${names[1]} ` }, ...sortedParent(1)];

  // Phenotype classes in order of proportion, for tints.
  type Class = { label: string; w: Fraction; first: number };
  const classes = new Map<string, Class>();
  cells.flat().forEach((c, i) => {
    const k = c.phenotype;
    const cur = classes.get(k);
    if (cur === undefined) classes.set(k, { label: k, w: c.w, first: i });
    else cur.w = add(cur.w, c.w);
  });
  const sortedClasses = [...classes.values()].sort((p, q) => {
    const d = p.w.n * q.w.d - q.w.n * p.w.d;
    return d === 0n ? p.first - q.first : d > 0n ? -1 : 1;
  });
  const tintOf = new Map(sortedClasses.map((c, i) => [c.label, i % TINTS.length]));

  // Genotype classes in dominance order.
  const rankKey = (c: Cell): number[] => c.alleles.flatMap((pair, li) => pair.map((a) => rankOf(cross.loci[li]!, a)));
  const genotypes = new Map<string, { rich: string; w: Fraction; rank: number[] }>();
  for (const c of cells.flat()) {
    const cur = genotypes.get(c.genotypeKey);
    if (cur === undefined) genotypes.set(c.genotypeKey, { rich: c.genotypeRichText, w: c.w, rank: rankKey(c) });
    else cur.w = add(cur.w, c.w);
  }
  const sortedGenotypes = [...genotypes.values()].sort((p, q) => {
    for (let i = 0; i < p.rank.length; i += 1) if (p.rank[i] !== q.rank[i]) return p.rank[i]! - q.rank[i]!;
    return 0;
  });

  // ---- highlights ----
  const highlights: { text: string; match: (c: Cell) => boolean }[] = [];
  for (const h of input.highlight ?? []) {
    const byName = [...classes.keys()].find((k) => plain(k).toLowerCase() === h.toLowerCase());
    if (byName !== undefined) {
      highlights.push({ text: h, match: (c) => c.phenotype === byName });
      continue;
    }
    let pattern: Locus[];
    try {
      pattern = parseGenotype(h, `genetics.highlight "${h}"`, true);
    } catch {
      throw new SpecError(`genetics.highlight: ${JSON.stringify(h)} is neither a genotype pattern of this cross ("A_bb", "aabb") nor one of its phenotypes (${[...classes.keys()].map((k) => JSON.stringify(plain(k))).join(", ")}).`);
    }
    if (pattern.length !== cross.loci.length) {
      throw new SpecError(`genetics.highlight: ${JSON.stringify(h)} names ${pattern.length} loci, the cross has ${cross.loci.length}.`);
    }
    highlights.push({ text: allelesRich(pattern.flatMap((l) => l.alleles)), match: (c) => matchesPattern(pattern, c, cross) });
  }

  // ---- panel ----
  const panel: PanelLineInput[] = [];
  if (answers) {
    const fracs = (ws: Fraction[]): string => ratioOf(ws);
    panel.push({ lead: "Genótipos", text: sortedGenotypes.map((g) => `${fractionText(g.w)} ${g.rich}`).join("  ·  "), id: "genotypes", emphasis: "normal" });
    panel.push({ lead: "Proporção", text: fracs(sortedGenotypes.map((g) => g.w)), id: "genotype-ratio", emphasis: "strong" });
    panel.push({
      text: `Fenótipos  —  proporção ${fracs(sortedClasses.map((c) => c.w))}`,
      emphasis: "strong",
      id: "phenotypes",
      gap: 6,
    });
    sortedClasses.forEach((c, i) => {
      panel.push({ text: `${fractionText(c.w)}   ${c.label}`, swatch: SWATCHES[i % SWATCHES.length]!, id: `class-${i}`, emphasis: "normal" });
    });
    highlights.forEach((h, i) => {
      const p = cells.flat().filter(h.match).reduce((s, c) => add(s, c.w), ZERO);
      const pct = decimalText(p, "pt-BR", { percent: true });
      panel.push({ text: `P(${h.text}) = ${fractionText(p)}  ${pct.exact ? "=" : "≈"} ${pct.text}`, emphasis: "accent", colour: ACCENT, id: `p-${i}`, gap: i === 0 ? 6 : 0 });
    });
  }

  // ---- geometry ----
  const probe = new Board(10, 10, PAPER);
  const gameteRuns = (g: Gamete): TextRun[] => genotypeRuns(g.alleles);
  const rowRuns = cross.gametes[0].map(gameteRuns);
  const colRuns = cross.gametes[1].map(gameteRuns);
  const cellW = Math.max(74, ...cells.flat().map((c) => widthOf(c.runs, CELL_SIZE, 500) + 26), ...colRuns.map((r) => widthOf(r, GAMETE_SIZE, 700) + 26));
  const n1 = widthOf([{ text: names[0] }], 12.5, 600);
  const n2 = widthOf([{ text: names[1] }], 12.5, 600);
  const rmW = Math.max(100, n1 + n2 + 34, ...rowRuns.map((r) => widthOf(r, GAMETE_SIZE, 700) + 30));
  const headW = widthOf(headRuns, HEAD_SIZE, 600);
  const tableW = rmW + cols * cellW;
  const tableH = MARGIN_H + rows * CELL_H;
  const panelMax = Math.max(tableW, headW, 560);
  const reading = layoutPanel(panel, { width: panelMax, size: PANEL_SIZE, lineHeight: PANEL_LINE });
  const headBlock = 34;
  const width = Math.ceil(Math.max(tableW, headW, reading.width) + 2 * M);
  const x0 = M;
  const y0 = M + headBlock;
  const panelTop = y0 + tableH + (reading.empty ? 0 : 24);
  const height = Math.ceil(panelTop + reading.height + M - (reading.empty ? 0 : 6));
  void probe;

  const board = new Board(width, height, PAPER);
  const colX = (c: number): number => x0 + rmW + c * cellW;
  const rowY = (r: number): number => y0 + MARGIN_H + r * CELL_H;
  const right = x0 + tableW;
  const bottom = y0 + tableH;

  // Tints under the cells (surfaces, no stroke).
  if (answers) {
    cells.forEach((row, r) =>
      row.forEach((c, k) => {
        const t = tintOf.get(c.phenotype)!;
        board.marks.push({
          id: `tint-${r}-${k}`,
          from: { x: colX(k), y: rowY(r) },
          segments: [{ line: { x: colX(k) + cellW, y: rowY(r) } }, { line: { x: colX(k) + cellW, y: rowY(r) + CELL_H } }, { line: { x: colX(k), y: rowY(r) + CELL_H } }],
          close: true,
          fill: TINTS[t]!,
          stroke: "none",
          strokeWidth: 0,
        });
      }),
    );
  }

  // Lines: frame, the heavy margins, light cell rules.
  board.poly([{ x: x0, y: y0 }, { x: right, y: y0 }, { x: right, y: bottom }, { x: x0, y: bottom }], { stroke: RULE, width: 1.6, close: true });
  board.poly([{ x: x0 + rmW, y: y0 }, { x: x0 + rmW, y: bottom }], { stroke: INK, width: 1.8 });
  board.poly([{ x: x0, y: y0 + MARGIN_H }, { x: right, y: y0 + MARGIN_H }], { stroke: INK, width: 1.8 });
  for (let k = 1; k < cols; k += 1) board.poly([{ x: colX(k), y: y0 }, { x: colX(k), y: bottom }], { stroke: LIGHT, width: 1.2 });
  for (let r = 1; r < rows; r += 1) board.poly([{ x: x0, y: rowY(r) }, { x: right, y: rowY(r) }], { stroke: LIGHT, width: 1.2 });
  // The corner's diagonal, with the parent named on each side of it.
  board.poly([{ x: x0, y: y0 }, { x: x0 + rmW, y: y0 + MARGIN_H }], { stroke: RULE, width: 1.2 });

  runsLabel(board, headRuns, x0 + tableW / 2, M + 12, { size: HEAD_SIZE, weight: 600, freeStanding: true, id: "head" });
  board.label(names[1], x0 + rmW - n2 / 2 - 6, y0 + 13, { size: 12.5, weight: 600, colour: SOFT, freeStanding: true, id: "corner-cols", width: n2 });
  board.label(names[0], x0 + n1 / 2 + 6, y0 + MARGIN_H - 13, { size: 12.5, weight: 600, colour: SOFT, freeStanding: true, id: "corner-rows", width: n1 });

  // Gametes on the margins.
  colRuns.forEach((runs, k) => runsLabel(board, runs, colX(k) + cellW / 2, y0 + MARGIN_H / 2, { size: GAMETE_SIZE, weight: 700, colour: ACCENT, freeStanding: true, id: `gamete-col-${k}` }));
  rowRuns.forEach((runs, r) => runsLabel(board, runs, x0 + rmW / 2, rowY(r) + CELL_H / 2, { size: GAMETE_SIZE, weight: 700, colour: ACCENT, freeStanding: true, id: `gamete-row-${r}` }));

  // Cells.
  if (answers) {
    cells.forEach((row, r) =>
      row.forEach((c, k) => {
        runsLabel(board, c.runs, colX(k) + cellW / 2, rowY(r) + CELL_H / 2, { size: CELL_SIZE, weight: 500, freeStanding: true, id: `cell-${r}-${k}` });
      }),
    );
    highlights.forEach((h, hi) =>
      cells.forEach((row, r) =>
        row.forEach((c, k) => {
          if (!h.match(c)) return;
          const x = colX(k) + 4;
          const y = rowY(r) + 4;
          board.poly([{ x, y }, { x: x + cellW - 8, y }, { x: x + cellW - 8, y: y + CELL_H - 8 }, { x, y: y + CELL_H - 8 }], { stroke: ACCENT, width: 2.6, close: true, id: `highlight-${hi}-${r}-${k}` });
        }),
      ),
    );
  }

  reading.draw(board, { left: x0, top: panelTop, cut: y0 + tableH + 8 });
  return parseSpec(board.spec(input.title ?? "quadro de Punnett"));
}

/** The numbers the figure prints, for tests and the answer key: genotype and phenotype weights. */
export function punnettTallies(input: PunnettInput): { genotypes: Map<string, Fraction>; phenotypes: Map<string, Fraction>; cells: string[][] } {
  const cross = buildCross(input);
  const cells = buildCells(cross, input.sexWords ?? { F: "filha", M: "filho" });
  const genotypes = new Map<string, Fraction>();
  const phenotypes = new Map<string, Fraction>();
  for (const c of cells.flat()) {
    genotypes.set(c.genotypeRichText, add(genotypes.get(c.genotypeRichText) ?? ZERO, c.w));
    const p = plain(c.phenotype);
    phenotypes.set(p, add(phenotypes.get(p) ?? ZERO, c.w));
  }
  const total = [...genotypes.values()].reduce(add, ZERO);
  if (!eq(total, ONE)) throw new Error(`genetics: the cells sum to ${fractionText(total)}, not 1`);
  return { genotypes, phenotypes, cells: cells.map((r) => r.map((c) => plain(c.genotypeRichText))) };
}

void isX;
void withSign;
