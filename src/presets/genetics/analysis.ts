/**
 * The pedigree analysis: given a mode of inheritance, which genotypes each
 * individual can have and how likely each is, in exact arithmetic.
 *
 * Every individual's state is s = the number of copies of the DISEASE allele
 * (0, 1 or 2; 0 or 1 for a male's single X). The pedigree is enumerated
 * exactly: a joint assignment of states to everyone, weighted by the founders'
 * prior and by Mendelian transmission to each child, keeping only assignments
 * where each person's state shows the phenotype drawn (affected or not, and a
 * marked carrier is heterozygous). Marginals and the printed probabilities are
 * sums of those weights over their total. Weights are integers (transmission
 * is in quarters), so nothing is ever rounded.
 *
 * A pedigree with no assignment is INCONSISTENT with the mode, and the first
 * individual (generation by generation) whose phenotype makes it so is named.
 *
 * A founder's genotype is not determined by the pedigree unless the pedigree
 * forces it; its prior is then the population's, which the pedigree does not
 * contain. A probability that changes with that prior is refused unless the
 * allele frequency is given.
 */

import { SpecError } from "../../ir/types.ts";
import { ZERO, frac } from "../probability-tree/fraction.ts";
import type { Fraction } from "../probability-tree/fraction.ts";
import { alleleKey, parseGenotype, isY } from "./alleles.ts";

export type Mode = "AR" | "AD" | "XR" | "XD";

export const MODE_NAME: Record<Mode, string> = {
  AR: "herança autossômica recessiva",
  AD: "herança autossômica dominante",
  XR: "herança recessiva ligada ao X",
  XD: "herança dominante ligada ao X",
};

export function parseMode(text: string, path: string): Mode {
  const s = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const x = /(^|[^a-z])x([^a-z]|$)/.test(s) || /ligad[ao]/.test(s) || /sex/.test(s);
  const autosomal = /auto/.test(s);
  const recessive = /recess|recessive/.test(s);
  const dominant = /domin/.test(s);
  if (x === autosomal || recessive === dominant) {
    throw new SpecError(
      `${path}: ${JSON.stringify(text)} is not a mode of inheritance; write "autosomal recessive", "autosomal dominant", "X-linked recessive" or "X-linked dominant" (or "autossômica recessiva", "ligada ao X dominante"...).`,
    );
  }
  return x ? (recessive ? "XR" : "XD") : recessive ? "AR" : "AD";
}

export type Person = {
  id: string;
  /** What messages call it. */
  label: string;
  sex: "M" | "F" | "?";
  affected: boolean;
  carrier: boolean;
  /** Indices of the two parents in the people list. */
  parents: [number, number] | undefined;
  /** A genotype the exercise gives ("Aa"), if any. */
  genotype: string | undefined;
};

export type Query = {
  id: string;
  text: string;
  kind:
    | { type: "of"; person: number; is: "carrier" | "affected" | "unaffected" }
    | { type: "genotype"; person: number; s: number }
    | { type: "child"; a: number; b: number; is: "affected" | "carrier"; sex: "M" | "F" | undefined };
};

const isX = (mode: Mode): boolean => mode === "XR" || mode === "XD";
const ploidy = (mode: Mode, sex: "M" | "F" | "?"): number => (isX(mode) && sex === "M" ? 1 : 2);
const recessiveMode = (mode: Mode): boolean => mode === "AR" || mode === "XR";

export function affectedState(mode: Mode, sex: "M" | "F" | "?", s: number): boolean {
  if (ploidy(mode, sex) === 1) return s === 1;
  return recessiveMode(mode) ? s === 2 : s >= 1;
}

/** The genotype for state s, as the rich string the panel reads. */
export function genotypeText(mode: Mode, sex: "M" | "F" | "?", s: number): string {
  const dominantDisease = mode === "AD" || mode === "XD";
  if (!isX(mode)) {
    const copiesOfA = dominantDisease ? s : 2 - s; // the capital letter is the disease allele in AD, the normal one in AR
    return "A".repeat(copiesOfA) + "a".repeat(2 - copiesOfA);
  }
  const copiesOfA = dominantDisease ? s : (sex === "M" ? 1 : 2) - s;
  const total = sex === "M" ? 1 : 2;
  const xs = "X^{A}".repeat(copiesOfA) + "X^{a}".repeat(total - copiesOfA);
  return sex === "M" ? `${xs}Y` : xs;
}

/** The posterior supports written compactly: "A_" for {AA, Aa}, otherwise the possibilities joined by "ou". */
export function supportText(mode: Mode, sex: "M" | "F" | "?", support: number[]): string {
  if (support.length === 1) return genotypeText(mode, sex, support[0]!);
  if (!isX(mode) && support.length === 2) {
    const lo = Math.min(...support);
    const hi = Math.max(...support);
    if (mode === "AR" && lo === 0 && hi === 1) return "A_";
    if (mode === "AD" && lo === 1 && hi === 2) return "A_";
  }
  return [...support].sort((a, b) => a - b).map((s) => genotypeText(mode, sex, s)).join(" ou ");
}

/** The state a given genotype string means for this person, or a SpecError. */
export function stateOfGenotype(mode: Mode, sex: "M" | "F" | "?", text: string, path: string): number {
  const loci = parseGenotype(text, path);
  const diseaseBase = mode === "AR" || mode === "XR" ? "a" : "A";
  const normalBase = diseaseBase === "a" ? "A" : "a";
  if (loci.length !== 1) throw new SpecError(`${path}: ${JSON.stringify(text)} must be a single locus for ${MODE_NAME[mode]}.`);
  const l = loci[0]!;
  if (isX(mode)) {
    if (l.kind !== "x") throw new SpecError(`${path}: ${JSON.stringify(text)} is not an X-linked genotype ("XᴬXᵃ", "XᵃY").`);
    const male = isY(l.alleles[1]);
    if (male !== (sex === "M")) throw new SpecError(`${path}: ${JSON.stringify(text)} is ${male ? "male" : "female"}, but the individual is ${sex === "M" ? "male" : "female"}.`);
    const xs = l.alleles.filter((a) => !isY(a));
    for (const a of xs) if (a.sup !== diseaseBase && a.sup !== normalBase) throw new SpecError(`${path}: ${JSON.stringify(text)} uses the allele ${alleleKey(a)}; this analysis names them X^A and X^a.`);
    return xs.filter((a) => a.sup === diseaseBase).length;
  }
  if (l.kind !== "autosomal" || l.key !== "A") throw new SpecError(`${path}: ${JSON.stringify(text)} is not a genotype of the locus A ("AA", "Aa", "aa").`);
  for (const a of l.alleles) if (a.base !== diseaseBase && a.base !== normalBase) throw new SpecError(`${path}: ${JSON.stringify(text)} uses the allele ${alleleKey(a)}; this analysis names them A and a.`);
  return l.alleles.filter((a) => a.base === diseaseBase).length;
}

// ---- transmission ------------------------------------------------------------------------------------

/** Weights (in quarters) of each state of a child, given the parents' states and the child's sex. */
function childWeights(mode: Mode, sFather: number, sMother: number, childSex: "M" | "F" | "?"): number[] {
  if (!isX(mode)) {
    const f = sFather;
    const m = sMother;
    return [(2 - f) * (2 - m), f * (2 - m) + (2 - f) * m, f * m];
  }
  if (childSex === "M") return [2 * (2 - sMother), 2 * sMother];
  const w = [0, 0, 0];
  w[sFather] = 2 * (2 - sMother);
  w[sFather + 1] = 2 * sMother;
  return w;
}

/** Which of two parents is the father: by sex for X-linked modes, in listed order otherwise. */
function parentRoles(mode: Mode, people: Person[], child: Person): { father: number; mother: number } {
  const [a, b] = child.parents!;
  if (!isX(mode)) return { father: a, mother: b };
  const sexA = people[a]!.sex;
  const sexB = people[b]!.sex;
  if (sexA === "M" && sexB === "F") return { father: a, mother: b };
  if (sexA === "F" && sexB === "M") return { father: b, mother: a };
  throw new SpecError(`genetics.analysis: ${people[a]!.label} and ${people[b]!.label} are the parents of ${child.label}; for an X-linked mode one must be male (M) and one female (F).`);
}

// ---- the enumeration --------------------------------------------------------------------------------------

type Prior = { kind: "uniform" } | { kind: "frequency"; n: bigint; d: bigint };

const NODE_LIMIT = 4_000_000;

type Enumeration = { total: bigint; marginal: bigint[][]; pairs: Map<string, bigint>[] };

function enumerate(mode: Mode, people: Person[], order: number[], constrainedCount: number, prior: Prior, pairQueries: [number, number][], pinned: (number | undefined)[]): Enumeration {
  const N = people.length;
  const rank = new Map(order.map((p, i) => [p, i]));
  const state: number[] = new Array(N).fill(-1);
  const marginal = people.map((p) => new Array<bigint>(ploidy(mode, p.sex) + 1).fill(0n));
  const pairs = pairQueries.map(() => new Map<string, bigint>());
  let total = 0n;
  let nodes = 0;

  const allowed = (p: Person, s: number, constrained: boolean, idx: number): boolean => {
    if (!constrained) return true;
    if (affectedState(mode, p.sex, s) !== p.affected) return false;
    if (p.carrier && !(s === 1 && ploidy(mode, p.sex) === 2)) return false;
    const pin = pinned[idx];
    return pin === undefined || pin === s;
  };

  const priorWeight = (p: Person, s: number): bigint => {
    if (prior.kind === "uniform") return 1n;
    const q = prior.n;
    const pp = prior.d - prior.n;
    if (ploidy(mode, p.sex) === 1) return s === 1 ? q : pp;
    return s === 0 ? pp * pp : s === 1 ? 2n * pp * q : q * q;
  };

  const recurse = (k: number, weight: bigint): void => {
    nodes += 1;
    if (nodes > NODE_LIMIT) throw new SpecError(`genetics.analysis: the pedigree has too many unknowns to enumerate (${N} individuals); analyse a smaller pedigree.`);
    if (k === N) {
      total += weight;
      for (let i = 0; i < N; i += 1) marginal[i]![state[i]!]! += weight;
      pairQueries.forEach(([a, b], qi) => {
        const key = `${state[a]},${state[b]}`;
        pairs[qi]!.set(key, (pairs[qi]!.get(key) ?? 0n) + weight);
      });
      return;
    }
    const idx = order[k]!;
    const p = people[idx]!;
    const constrained = (rank.get(idx) ?? 0) < constrainedCount;
    const states = ploidy(mode, p.sex) + 1;
    if (p.parents === undefined) {
      for (let s = 0; s < states; s += 1) if (allowed(p, s, constrained, idx)) {
        state[idx] = s;
        recurse(k + 1, weight * priorWeight(p, s));
      }
    } else {
      const roles = parentRoles(mode, people, p);
      const w = childWeights(mode, state[roles.father]!, state[roles.mother]!, p.sex);
      for (let s = 0; s < states; s += 1) {
        const t = w[s] ?? 0;
        if (t === 0 || !allowed(p, s, constrained, idx)) continue;
        state[idx] = s;
        recurse(k + 1, weight * BigInt(t));
      }
    }
    state[idx] = -1;
  };
  recurse(0, 1n);
  return { total, marginal, pairs };
}

// ---- the analysis ------------------------------------------------------------------------------------------

export type AnalysisResult = {
  mode: Mode;
  /** Per person: the states with positive probability. */
  support: number[][];
  /** Per query, in order. */
  answers: { text: string; p: Fraction }[];
};

function parseFrequency(text: string, path: string): { n: bigint; d: bigint } {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text);
  if (m === null) throw new SpecError(`${path}: ${JSON.stringify(text)} is not a frequency; write it as a fraction of 0 to 1, like "1/100".`);
  const n = BigInt(m[1]!);
  const d = BigInt(m[2]!);
  if (d === 0n || n > d) throw new SpecError(`${path}: ${JSON.stringify(text)} is outside [0, 1].`);
  return { n, d };
}

export function analyse(mode: Mode, people: Person[], order: number[], queries: Query[], frequencyText: string | undefined): AnalysisResult {
  const N = people.length;
  const pinned: (number | undefined)[] = people.map((p) => (p.genotype === undefined ? undefined : stateOfGenotype(mode, p.sex, p.genotype, `genetics.individuals "${p.id}".genotype`)));
  for (const [i, p] of people.entries()) {
    if (isX(mode) && p.sex === "?") throw new SpecError(`genetics.analysis: ${p.label} has no sex; an X-linked mode needs M or F for everyone.`);
    if (p.carrier) {
      if (!recessiveMode(mode)) throw new SpecError(`genetics.analysis: ${p.label} is marked carrier, but ${MODE_NAME[mode]} has no unaffected carriers.`);
      if (ploidy(mode, p.sex) === 1) throw new SpecError(`genetics.analysis: ${p.label} is a male marked carrier; with one X he is affected or not, never a carrier.`);
      if (p.affected) throw new SpecError(`genetics.analysis: ${p.label} is marked both affected and carrier.`);
    }
    void i;
  }
  const pairQueries: [number, number][] = [];
  for (const q of queries) if (q.kind.type === "child") pairQueries.push([q.kind.a, q.kind.b]);

  const hw = frequencyText === undefined ? undefined : parseFrequency(frequencyText, "genetics.analysis.frequency");
  const primary: Prior = hw === undefined ? { kind: "uniform" } : { kind: "frequency", n: hw.n, d: hw.d };
  const run = (prior: Prior): Enumeration => enumerate(mode, people, order, N, prior, pairQueries, pinned);
  const first = run(primary);

  if (first.total === 0n) {
    // Name the first individual whose phenotype makes the pedigree impossible.
    for (let k = 1; k <= N; k += 1) {
      const e = enumerate(mode, people, order, k, primary, [], pinned);
      if (e.total === 0n) {
        const p = people[order[k - 1]!]!;
        const what = p.affected ? "affected" : p.carrier ? "a carrier" : "unaffected";
        const above = k > 1 ? `, given the individuals before it (${order.slice(0, k - 1).map((i) => people[i]!.label).join(", ")})` : "";
        throw new SpecError(`genetics.analysis: this pedigree is not consistent with ${MODE_NAME[mode]}: ${p.label} (${what}) cannot be explained${above}.`);
      }
    }
    throw new SpecError(`genetics.analysis: this pedigree is not consistent with ${MODE_NAME[mode]}.`);
  }

  const support = first.marginal.map((m) => m.flatMap((w, s) => (w > 0n ? [s] : [])));

  const evaluate = (e: Enumeration): Fraction[] =>
    queries.map((q, qi) => {
      const k = q.kind;
      if (k.type === "of") {
        const p = people[k.person]!;
        const m = e.marginal[k.person]!;
        let num = 0n;
        m.forEach((w, s) => {
          const aff = affectedState(mode, p.sex, s);
          if (k.is === "carrier" ? s === 1 : k.is === "affected" ? aff : !aff) num += w;
        });
        return frac(num, e.total);
      }
      if (k.type === "genotype") {
        return frac(e.marginal[k.person]![k.s] ?? 0n, e.total);
      }
      const pairIndex = queries.filter((x, j) => j < qi && x.kind.type === "child").length;
      const table = e.pairs[pairIndex]!;
      const sexes: ("M" | "F")[] = isX(mode) ? (k.sex === undefined ? ["M", "F"] : [k.sex]) : ["M"];
      let num = 0n;
      let den = 4n * e.total;
      // Weights in quarters; each sex of an X-linked child has probability 1/2, so a sex-specific question adds a factor 1/2.
      for (const [key, w] of table) {
        const [sa, sb] = key.split(",").map(Number) as [number, number];
        const pa = people[k.a]!;
        const pb = people[k.b]!;
        const roles = isX(mode) ? (pa.sex === "M" ? { f: sa, m: sb } : { f: sb, m: sa }) : { f: sa, m: sb };
        for (const sex of sexes) {
          const cw = childWeights(mode, roles.f, roles.m, sex);
          cw.forEach((t, s) => {
            const aff = affectedState(mode, sex, s);
            if (k.is === "carrier" ? s === 1 && ploidy(mode, sex) === 2 : aff) num += w * BigInt(t);
          });
        }
      }
      // Every counted child has the sex its weights were drawn for: the average over sexes is 1/2 each; a fixed sex is the joint with it (x 1/2).
      den *= isX(mode) ? 2n : 1n;
      if (!isX(mode)) den *= k.sex === undefined ? 1n : 2n;
      return frac(num, den);
    });

  const main = evaluate(first);
  if (hw === undefined && queries.length > 0) {
    const other = evaluate(run({ kind: "frequency", n: 1n, d: 10n }));
    queries.forEach((q, i) => {
      if (main[i]!.n * other[i]!.d !== other[i]!.n * main[i]!.d) {
        const open = people.flatMap((p, pi) => (p.parents === undefined && support[pi]!.length > 1 ? [p.label] : []));
        throw new SpecError(
          `genetics.analysis: ${q.text} depends on the genotype of individuals the pedigree does not determine (${open.join(", ")}), which is a matter of how common the allele is. Give analysis.frequency (the disease allele's frequency, e.g. "1/100"), or state the genotype of those individuals ("genotype": "AA").`,
        );
      }
    });
  }
  void ZERO;
  return { mode, support, answers: queries.map((q, i) => ({ text: q.text, p: main[i]! })) };
}
