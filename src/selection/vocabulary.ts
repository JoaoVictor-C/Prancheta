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

export type Structure = (typeof STRUCTURE)[number];
export type Idiom = (typeof IDIOM)[number];

export type PresetId = "labelled-blocks" | "graph" | "mindmap" | "annotated-figure" | "chart";

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
  /** Preserved verbatim, never scored. Their presence is a vocabulary signal. */
  unknown?: string[];
};

export function isStructure(value: string): value is Structure {
  return (STRUCTURE as readonly string[]).includes(value);
}

export function isIdiom(value: string): value is Idiom {
  return (IDIOM as readonly string[]).includes(value);
}

/**
 * Split caller-supplied predicate strings into the known vocabulary and the
 * unknown remainder. Nothing is dropped; the remainder is carried forward.
 */
export function partitionPredicates(input: {
  structure?: string[];
  idiom?: string[];
}): Predicates {
  const structure: Structure[] = [];
  const idiom: Idiom[] = [];
  const unknown: string[] = [];

  for (const value of input.structure ?? []) {
    if (isStructure(value)) structure.push(value);
    else unknown.push(`structure:${value}`);
  }
  for (const value of input.idiom ?? []) {
    if (isIdiom(value)) idiom.push(value);
    else unknown.push(`idiom:${value}`);
  }

  return unknown.length > 0 ? { structure, idiom, unknown } : { structure, idiom };
}
