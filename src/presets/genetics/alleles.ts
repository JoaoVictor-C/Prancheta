/**
 * Genotype notation for the genetics preset: reading "Aa", "AaBb", "XᴬXᵃ",
 * "X^A Y", "IᴬIᴮ" into alleles and loci, and writing them back as runs with
 * real superscripts (ADR 0062). One module so a Punnett cross and a pedigree
 * analysis read a genotype the same way.
 *
 * An ALLELE is a base letter and an optional superscript: A, a, Xᴬ, Iᴮ, i, Cᴿ.
 * Y (the Y chromosome) carries no allele. A genotype is read as consecutive
 * PAIRS of alleles, one pair per locus; the sex chromosomes are the pair X+X
 * or X+Y. "_" stands for "any allele" in a pattern.
 */

import { SpecError } from "../../ir/types.ts";
import type { TextRun } from "../../ir/types.ts";

export type Allele = { base: string; sup: string };

export type Locus = {
  /** A: the base letter upper-cased, "X" for the sex chromosomes. */
  key: string;
  kind: "autosomal" | "x";
  /** Two alleles; for kind "x" the second may be the Y chromosome (base "Y"). */
  alleles: [Allele, Allele];
};

const SUPERSCRIPT_LETTERS: Record<string, string> = {
  ᴬ: "A", ᴮ: "B", ᴰ: "D", ᴱ: "E", ᴳ: "G", ᴴ: "H", ᴵ: "I", ᴶ: "J", ᴷ: "K", ᴸ: "L", ᴹ: "M", ᴺ: "N", ᴼ: "O", ᴾ: "P", ᴿ: "R", ᵀ: "T", ᵁ: "U", ᵂ: "W",
  ᵃ: "a", ᵇ: "b", ᶜ: "c", ᵈ: "d", ᵉ: "e", ᶠ: "f", ᵍ: "g", ʰ: "h", ⁱ: "i", ʲ: "j", ᵏ: "k", ˡ: "l", ᵐ: "m", ⁿ: "n", ᵒ: "o", ᵖ: "p", ʳ: "r", ˢ: "s", ᵗ: "t", ᵘ: "u", ᵛ: "v", ʷ: "w", ˣ: "x", ʸ: "y", ᶻ: "z",
};

export const alleleKey = (a: Allele): string => (a.sup === "" ? a.base : `${a.base}^${a.sup}`);
export const isY = (a: Allele): boolean => a.base === "Y";
export const isX = (a: Allele): boolean => a.base === "X";
export const WILD = "_";

/** Lower case in the letter that names the allele (the superscript if there is one): a, i, Xᵃ. Y is never recessive. */
export function isRecessiveAllele(a: Allele): boolean {
  if (isY(a)) return false;
  const id = a.sup !== "" ? a.sup : a.base;
  return id === id.toLowerCase() && id !== id.toUpperCase();
}

/** Tokens of a genotype string: a letter, then a superscript written "^A", "^{A}" or as a modifier letter. */
export function tokenize(text: string, path: string, allowWild = false): Allele[] {
  const chars = [...text.replace(/[\s·.,×]/g, "")];
  const out: Allele[] = [];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i]!;
    if (allowWild && c === WILD) {
      out.push({ base: WILD, sup: "" });
      i += 1;
      continue;
    }
    if (!/^[A-Za-z]$/.test(c)) {
      throw new SpecError(`${path}: ${JSON.stringify(text)} is not a genotype -- unexpected ${JSON.stringify(c)}; write letters in pairs ("Aa", "AaBb"), sex-linked as "X^A X^a" or "XᴬXᵃ".`);
    }
    i += 1;
    let sup = "";
    const next = chars[i];
    if (next === "^") {
      i += 1;
      if (chars[i] === "{") {
        const close = chars.indexOf("}", i);
        if (close < 0) throw new SpecError(`${path}: ${JSON.stringify(text)} has an unclosed "^{".`);
        sup = chars.slice(i + 1, close).join("");
        i = close + 1;
      } else {
        sup = chars[i] ?? "";
        i += 1;
      }
      if (!/^[A-Za-z0-9]+$/.test(sup)) throw new SpecError(`${path}: ${JSON.stringify(text)} has an empty or odd superscript.`);
    } else if (next !== undefined && SUPERSCRIPT_LETTERS[next] !== undefined) {
      sup = SUPERSCRIPT_LETTERS[next]!;
      i += 1;
    }
    out.push({ base: c, sup });
  }
  return out;
}

/** Read a genotype into loci; `wild` lets "_" stand for an unknown allele (a pattern). */
export function parseGenotype(text: string, path: string, wild = false): Locus[] {
  const tokens = tokenize(text, path, wild);
  if (tokens.length === 0) throw new SpecError(`${path}: a genotype is empty`);
  const loci: Locus[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    const u = tokens[i + 1];
    if (u === undefined) throw new SpecError(`${path}: ${JSON.stringify(text)} ends with the lone allele ${alleleKey(t)} -- a locus has two alleles ("Aa", "XᴬY").`);
    if (isX(t) || isY(t)) {
      if (!(isX(u) || isY(u)) && !(wild && u.base === WILD)) throw new SpecError(`${path}: ${JSON.stringify(text)}: ${alleleKey(t)} is a sex chromosome and must be paired with X or Y.`);
      if (isY(t) && isY(u)) throw new SpecError(`${path}: ${JSON.stringify(text)}: YY is not a genotype.`);
      if (isY(t)) loci.push({ key: "X", kind: "x", alleles: [u, t] });
      else loci.push({ key: "X", kind: "x", alleles: [t, u] });
    } else {
      const wildPair = wild && (t.base === WILD || u.base === WILD);
      if (!wildPair && t.base.toUpperCase() !== u.base.toUpperCase()) {
        throw new SpecError(`${path}: ${JSON.stringify(text)}: ${alleleKey(t)} and ${alleleKey(u)} are not alleles of one locus (same letter, either case).`);
      }
      const key = (t.base === WILD ? u.base : t.base).toUpperCase();
      if (!wildPair && (t.base.toUpperCase() === "X" || t.base.toUpperCase() === "Y")) throw new SpecError(`${path}: X and Y are the sex chromosomes; name an autosomal allele with another letter.`);
      loci.push({ key, kind: "autosomal", alleles: [t, u] });
    }
    i += 2;
  }
  return loci;
}

// ---- writing ----------------------------------------------------------------------------------

export const alleleRuns = (a: Allele): TextRun[] => (a.sup === "" ? [{ text: a.base }] : [{ text: a.base }, { text: a.sup, script: "sup" }]);

/** A genotype as runs: Xᴬ Xᵃ as X, A(sup), X, a(sup). */
export function genotypeRuns(alleles: readonly Allele[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const a of alleles) {
    for (const r of alleleRuns(a)) {
      const last = runs[runs.length - 1];
      if (last !== undefined && last.script === r.script) last.text += r.text;
      else runs.push({ ...r });
    }
  }
  return runs;
}

/** The same allele as the rich string the panel reads: "X^{A}". */
export const alleleRich = (a: Allele): string => (a.sup === "" ? a.base : `${a.base}^{${a.sup}}`);
export const allelesRich = (alleles: readonly Allele[]): string => alleles.map(alleleRich).join("");

export const sameAllele = (a: Allele, b: Allele): boolean => a.base === b.base && a.sup === b.sup;
