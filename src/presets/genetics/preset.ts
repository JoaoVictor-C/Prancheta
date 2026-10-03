/**
 * genetics -- Punnett squares and pedigrees (heredogramas). See ADR 0070.
 *
 *   kind "punnett":  parents' genotypes -> gametes, the grid, phenotype and
 *                    genotype proportions as exact fractions and ratios.
 *   kind "pedigree": individuals, parents and marriages -> a computed layout by
 *                    generation; optionally a mode of inheritance, checked for
 *                    consistency, with each individual's possible genotypes and
 *                    requested probabilities in exact fractions.
 */

import type { FigureSpec } from "../../ir/types.ts";
import { SpecError } from "../../ir/types.ts";
import * as v from "../validate.ts";
import { expandPedigree } from "./pedigree.ts";
import { expandPunnett } from "./punnett.ts";
import type { GeneticsInput, PedigreeInput, PunnettInput } from "./types.ts";

export type { GeneticsInput, PedigreeInput, PunnettInput } from "./types.ts";

export function expandGenetics(input: GeneticsInput): FigureSpec {
  return input.kind === "punnett" ? expandPunnett(input) : expandPedigree(input);
}

function only(o: Record<string, unknown>, allowed: string[], path: string): void {
  for (const key of Object.keys(o)) {
    if (!allowed.includes(key) && key !== "preset") throw new SpecError(`${path}.${key} is not a field; the fields are ${allowed.join(", ")}`);
  }
}

function stringPair(raw: Record<string, unknown>, key: string, path: string): [string, string] {
  const a = raw[key];
  if (!Array.isArray(a) || a.length !== 2 || a.some((s) => typeof s !== "string")) throw new SpecError(`${path}.${key} must be two strings, got ${JSON.stringify(a)}`);
  return a as [string, string];
}

export function validateGeneticsInput(raw: Record<string, unknown>): void {
  const path = "genetics";
  const kind = v.optionalEnum(raw, "kind", path, ["punnett", "pedigree"] as const);
  if (kind === undefined) throw new SpecError(`${path}.kind is required: "punnett" or "pedigree"`);
  v.optionalString(raw, "title", path);
  v.optionalBoolean(raw, "answers", path);
  if (kind === "punnett") {
    only(raw, ["kind", "title", "parents", "names", "dominance", "phenotypes", "sexWords", "highlight", "answers"], path);
    stringPair(raw, "parents", path);
    if (raw.names !== undefined) stringPair(raw, "names", path);
    const d = raw.dominance;
    const modes = ["complete", "incomplete", "codominance"];
    if (d !== undefined && typeof d !== "string") {
      for (const [k, val] of Object.entries(v.object(d, `${path}.dominance`))) if (!modes.includes(val as string)) throw new SpecError(`${path}.dominance.${k} must be one of ${modes.join(", ")}`);
    } else if (typeof d === "string" && !modes.includes(d)) throw new SpecError(`${path}.dominance must be one of ${modes.join(", ")}`);
    if (raw.phenotypes !== undefined) {
      for (const [k, m] of Object.entries(v.object(raw.phenotypes, `${path}.phenotypes`))) {
        for (const [g, name] of Object.entries(v.object(m, `${path}.phenotypes.${k}`))) if (typeof name !== "string") throw new SpecError(`${path}.phenotypes.${k}.${g} must be a string`);
      }
    }
    if (raw.sexWords !== undefined) {
      const s = v.object(raw.sexWords, `${path}.sexWords`);
      v.requiredString(s, "F", `${path}.sexWords`);
      v.requiredString(s, "M", `${path}.sexWords`);
    }
    if (raw.highlight !== undefined && (!Array.isArray(raw.highlight) || raw.highlight.some((h) => typeof h !== "string"))) throw new SpecError(`${path}.highlight must be an array of strings`);
    v.probe(() => expandPunnett(raw as unknown as PunnettInput));
    return;
  }
  only(raw, ["kind", "title", "individuals", "marriages", "carrierStyle", "legend", "analysis", "answers"], path);
  v.optionalEnum(raw, "carrierStyle", path, ["half", "dot"] as const);
  v.optionalBoolean(raw, "legend", path);
  const list = v.nonEmptyArray(raw, "individuals", path, "individuals");
  list.forEach((entry, i) => {
    const at = `${path}.individuals[${i}]`;
    const o = v.object(entry, at);
    only(o, ["id", "sex", "affected", "carrier", "deceased", "proband", "parents", "name", "genotype"], at);
    v.requiredString(o, "id", at);
    v.optionalEnum(o, "sex", at, ["M", "F", "?"] as const);
    if (o.sex === undefined) throw new SpecError(`${at}.sex is required: "M", "F" or "?"`);
    for (const k of ["affected", "carrier", "deceased", "proband"]) v.optionalBoolean(o, k, at);
    v.optionalString(o, "name", at);
    v.optionalString(o, "genotype", at);
    if (o.parents !== undefined) stringPair(o, "parents", at);
  });
  (raw.marriages === undefined ? [] : v.array(raw, "marriages", path, "marriages")).forEach((entry, i) => {
    const at = `${path}.marriages[${i}]`;
    const o = v.object(entry, at);
    only(o, ["between", "consanguineous"], at);
    stringPair(o, "between", at);
    v.optionalBoolean(o, "consanguineous", at);
  });
  if (raw.analysis !== undefined) {
    const a = v.object(raw.analysis, `${path}.analysis`);
    only(a, ["mode", "frequency", "queries"], `${path}.analysis`);
    v.requiredString(a, "mode", `${path}.analysis`);
    v.optionalString(a, "frequency", `${path}.analysis`);
    if (a.queries !== undefined) {
      v.array(a, "queries", `${path}.analysis`, "queries").forEach((q, i) => {
        const at = `${path}.analysis.queries[${i}]`;
        const o = v.object(q, at);
        only(o, ["of", "childOf", "is", "genotype", "sex", "label"], at);
        v.optionalString(o, "label", at);
        if ((o.of === undefined) === (o.childOf === undefined)) throw new SpecError(`${at} needs exactly one of "of" (an individual) or "childOf" (two parents)`);
        if (o.childOf !== undefined) {
          stringPair(o, "childOf", at);
          v.optionalEnum(o, "is", at, ["affected", "carrier"] as const);
          v.optionalEnum(o, "sex", at, ["M", "F"] as const);
          if (o.is === undefined) throw new SpecError(`${at}.is is required: "affected" or "carrier"`);
        } else {
          v.requiredString(o, "of", at);
          v.optionalEnum(o, "is", at, ["carrier", "affected", "unaffected", "genotype"] as const);
          if (o.is === undefined) throw new SpecError(`${at}.is is required: "carrier", "affected", "unaffected" or "genotype"`);
          if (o.is === "genotype") v.requiredString(o, "genotype", at);
        }
      });
    }
  }
  v.probe(() => expandPedigree(raw as unknown as PedigreeInput));
}
