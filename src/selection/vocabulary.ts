/**
 * The predicate vocabulary — the contract the narrative teaches and the rule
 * table keys on.
 *
 * Two axes, not one. This is the correction that made the design work:
 * "draw our microservice call graph as a subway map" is unambiguously a GRAPH
 * and unambiguously demands a SUBSTRATE idiom. A single axis forces those into
 * one slot and disqualifies the only correct answer. A substrate constrains
 * how a thing is drawn; it does not change what the thing is.
 *
 * CLOSED AT SCORING, OPEN AT RECORDING: only the values below carry weight,
 * so no caller can silently reshape the decision. But an unrecognised
 * predicate is preserved verbatim and reported, because an unknown predicate
 * is the only mechanical signal that this vocabulary is missing something.
 */

/** What the content IS. */
export const STRUCTURE = ["graph", "hierarchy", "series", "scene", "set"] as const;

/** How it must be DRAWN. */
export const IDIOM = ["plain-flow", "annotated", "cross-section", "substrate", "chart"] as const;

/**
 * A THIRD axis: the subject matter whose geometry a real library computes and
 * this core does not.
 *
 * Separate from structure and idiom because it answers a different question
 * again. "The structure of caffeine" is, if you insist, a graph -- atoms and
 * bonds -- and drawing it with the graph preset would be the exact failure
 * this whole table exists to refuse, one level deeper than a flowchart: ELK
 * would lay out a perfectly reasonable node-and-edge picture that no chemist
 * would accept, because which bonds are wedges falls out of stereocentre
 * perception and ring layout has its own literature.
 *
 * These values are what a request POSITIVELY indicates, which is why
 * delegation needs them at all: "none" is reached by exhaustion, and
 * delegation cannot be. Nothing here reads a value any preset rule reads, so
 * a domain rule ties with nothing in the table it sits beside.
 */
export const DOMAIN = ["cartographic", "molecular", "crystallographic"] as const;

export type Structure = (typeof STRUCTURE)[number];
export type Idiom = (typeof IDIOM)[number];
export type Domain = (typeof DOMAIN)[number];

export type PresetId = "labelled-blocks" | "graph" | "mindmap" | "annotated-figure" | "chart";

/**
 * A figure module the selection core may DELEGATE to (decision 0005).
 *
 * Only the modules a request names in plain words. The four compute-modules --
 * plot, dendrogram, genomic, skewt -- are reached by asking for them, not by
 * describing content, and inventing predicates nobody would asserts would make
 * this table larger without making anything more reachable.
 */
export type ModuleId = "map" | "molecule" | "crystal";

export const DELEGATES: { id: ModuleId; domain: Domain; summary: string }[] = [
  { id: "map", domain: "cartographic", summary: "Projected region and country maps; Shapely and pyproj." },
  { id: "molecule", domain: "molecular", summary: "Skeletal structures and reaction schemes from SMILES; RDKit." },
  { id: "crystal", domain: "crystallographic", summary: "One conventional unit cell, depth-sorted; ASE." },
];

export const PRESETS: { id: PresetId; implemented: boolean; summary: string }[] = [
  { id: "labelled-blocks", implemented: true, summary: "Stacked labelled boxes; the plain case." },
  { id: "graph", implemented: true, summary: "Nodes and edges, skeleton laid out by ELK." },
  { id: "mindmap", implemented: true, summary: "A single-rooted tree radiating outward." },
  {
    id: "annotated-figure",
    implemented: true,
    summary: "A shape or scene with callouts on leader lines.",
  },
  { id: "chart", implemented: true, summary: "Bar charts: values with a scale, not a graph." },
];

/**
 * What the caller asserts about the content. Both axes may carry several
 * values — a request is allowed to be two things at once.
 */
export type Predicates = {
  structure: Structure[];
  idiom: Idiom[];
  /** Subject matter no preset can compute. Empty for almost every request. */
  domain: Domain[];
  /** Preserved verbatim, never scored. Their presence is a vocabulary signal. */
  unknown?: string[];
};

export function isStructure(value: string): value is Structure {
  return (STRUCTURE as readonly string[]).includes(value);
}

export function isIdiom(value: string): value is Idiom {
  return (IDIOM as readonly string[]).includes(value);
}

export function isDomain(value: string): value is Domain {
  return (DOMAIN as readonly string[]).includes(value);
}

/**
 * Split caller-supplied predicate strings into the known vocabulary and the
 * unknown remainder. Nothing is dropped; the remainder is carried forward.
 */
export function partitionPredicates(input: {
  structure?: string[];
  idiom?: string[];
  domain?: string[];
}): Predicates {
  const structure: Structure[] = [];
  const idiom: Idiom[] = [];
  const domain: Domain[] = [];
  const unknown: string[] = [];

  for (const value of input.structure ?? []) {
    if (isStructure(value)) structure.push(value);
    else unknown.push(`structure:${value}`);
  }
  for (const value of input.idiom ?? []) {
    if (isIdiom(value)) idiom.push(value);
    else unknown.push(`idiom:${value}`);
  }
  for (const value of input.domain ?? []) {
    if (isDomain(value)) domain.push(value);
    else unknown.push(`domain:${value}`);
  }

  return unknown.length > 0
    ? { structure, idiom, domain, unknown }
    : { structure, idiom, domain };
}
