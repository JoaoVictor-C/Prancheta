/**
 * The rule table.
 *
 * Flat by design. Rules never reference other rules: the moment behaviour
 * lives in the composition of rules rather than in any single rule, the
 * narrative can cite every rule id and still fail to describe what happens,
 * and the citation check stops meaning anything.
 *
 * Every rule carries an explicit priority. Without it, an org chart — where
 * both the hierarchy rule and the graph rule fire, because a tree IS a graph —
 * resolves by whatever order the array happens to be in. Stable on one engine,
 * arbitrary in principle, untested either way.
 *
 * DISQUALIFY rules are the anti-default machinery. The documented industry
 * failure is not "picks a slightly worse preset", it is "returns a flowchart
 * no matter what was asked". That is a statement about what selection must
 * REFUSE, and refusal is what these express.
 */

import type { Domain, Idiom, ModuleId, PresetId, Structure } from "./vocabulary.ts";

export type Rule = {
  id: string;
  axis: "structure" | "idiom" | "domain";
  /** The predicate value this rule reacts to. */
  when: Structure | Idiom | Domain;
  preset: PresetId;
  effect: "favour" | "disqualify";
  /** Only meaningful for "favour". */
  weight: number;
  /** Breaks score ties. Higher wins. */
  priority: number;
  /** One line, quoted verbatim into the generated rule reference. */
  statement: string;
};

/** A candidate must reach this to be offered at all. Never tuned per preset. */
export const FLOOR = 2;

/**
 * Delegation rules: which figure module a domain reaches.
 *
 * A separate table, not more rows in RULES, because the target is a different
 * kind of thing -- a process on the far side of decision 0005's boundary, not
 * a preset the core expands. Keeping them apart means `Rule.preset` stays
 * honestly typed and the generated preset reference stays about presets.
 *
 * They share the FLOOR with everything else, and they tie with nothing:
 * a domain predicate is read by no preset rule, so a delegate's score and a
 * preset's score are never computed from the same evidence.
 */
export type DelegateRule = {
  id: string;
  when: Domain;
  module: ModuleId;
  weight: number;
  priority: number;
  statement: string;
};

export const DELEGATE_RULES: DelegateRule[] = [
  {
    id: "D-cartographic-delegates-map",
    when: "cartographic",
    module: "map",
    weight: 4,
    priority: 60,
    statement:
      "Content stated in longitude and latitude is delegated to the map module; a projection is not something the core can compute.",
  },
  {
    id: "D-molecular-delegates-molecule",
    when: "molecular",
    module: "molecule",
    weight: 4,
    priority: 60,
    statement:
      "A chemical structure is delegated to the molecule module; which bonds are wedges falls out of stereocentre perception, not layout.",
  },
  {
    id: "D-crystallographic-delegates-crystal",
    when: "crystallographic",
    module: "crystal",
    weight: 4,
    priority: 60,
    statement:
      "A unit cell is delegated to the crystal module; the cell is built from real lattice vectors and drawn through a depth sort.",
  },
];

export const RULES: Rule[] = [
  // --- domain refusals -----------------------------------------------------
  // The same move S-nograph-disqualifies-graph makes, one level deeper. A
  // molecule really is a graph and a map really is a set of regions, so
  // without these the graph preset would score well on a request the core
  // cannot honestly serve -- and it would render beautifully, which is the
  // failure mode this whole table exists to refuse.
  {
    id: "D-molecular-disqualifies-graph",
    axis: "domain",
    when: "molecular",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 95,
    statement:
      "A molecule is a graph and must still not be drawn as one; nodes and edges destroy the geometry that makes it a structure.",
  },
  {
    id: "D-cartographic-disqualifies-blocks",
    axis: "domain",
    when: "cartographic",
    preset: "labelled-blocks",
    effect: "disqualify",
    weight: 0,
    priority: 95,
    statement: "Territory is not a stack of boxes; labelled-blocks is refused for cartographic content.",
  },
  // --- graph ---------------------------------------------------------------
  {
    id: "S-graph-favours-graph",
    axis: "structure",
    when: "graph",
    preset: "graph",
    effect: "favour",
    weight: 4,
    priority: 50,
    statement: "Content that is a graph is drawn by the graph preset.",
  },
  {
    id: "S-nograph-disqualifies-graph",
    axis: "structure",
    when: "scene",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "A scene is not a graph; the graph preset is refused for it however well it would render.",
  },
  {
    id: "S-series-disqualifies-graph",
    axis: "structure",
    when: "series",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "A series is not a graph; nodes and edges misrepresent ordered values.",
  },

  // --- hierarchy / mindmap -------------------------------------------------
  {
    id: "S-hierarchy-favours-mindmap",
    axis: "structure",
    when: "hierarchy",
    preset: "mindmap",
    effect: "favour",
    weight: 4,
    priority: 60,
    statement: "A single-rooted hierarchy is drawn as a mindmap rather than a general graph.",
  },
  {
    id: "S-hierarchy-favours-graph-weakly",
    axis: "structure",
    when: "hierarchy",
    preset: "graph",
    effect: "favour",
    // Exactly FLOOR, and deliberately so: a tree genuinely IS a graph, so the
    // graph preset must stay a viable, offered alternative for a hierarchy —
    // never winning (mindmap scores 4), never refused either. This is the one
    // place the anti-default rule does not apply, because drawing a hierarchy
    // as a graph is a defensible choice rather than a misrepresentation.
    // Contrast I-plain-flow-favours-blocks, which sits BELOW the floor.
    weight: 2,
    priority: 40,
    statement:
      "A hierarchy is also a graph, so the graph preset stays a viable but weaker candidate — offered, never chosen over the mindmap.",
  },

  // --- scene / annotated figure --------------------------------------------
  {
    id: "S-scene-favours-annotated",
    axis: "structure",
    when: "scene",
    preset: "annotated-figure",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement: "A spatial scene is drawn as a figure with callouts, not as boxes and arrows.",
  },
  {
    id: "I-annotated-favours-annotated",
    axis: "idiom",
    when: "annotated",
    preset: "annotated-figure",
    effect: "favour",
    weight: 3,
    priority: 45,
    statement: "A request for callouts or labelled parts asks for the annotated-figure preset.",
  },
  {
    id: "I-cross-section-favours-annotated",
    axis: "idiom",
    when: "cross-section",
    preset: "annotated-figure",
    effect: "favour",
    weight: 3,
    priority: 45,
    statement: "A cross-section is an annotated figure with a sectioning convention.",
  },

  // --- idiom constrains, it does not restructure ---------------------------
  {
    id: "I-substrate-does-not-disqualify-structure",
    axis: "idiom",
    when: "substrate",
    preset: "graph",
    effect: "favour",
    weight: 1,
    priority: 30,
    statement:
      "A substrate idiom (subway map, floor plan) constrains how a figure is drawn, never what its content is.",
  },
  {
    id: "I-substrate-disqualifies-plain-blocks",
    axis: "idiom",
    when: "substrate",
    preset: "labelled-blocks",
    effect: "disqualify",
    weight: 0,
    priority: 80,
    statement: "Stacked blocks cannot express a substrate; the idiom refuses them.",
  },

  // --- plain flow / labelled blocks ----------------------------------------
  {
    id: "S-set-favours-blocks",
    axis: "structure",
    when: "set",
    preset: "labelled-blocks",
    effect: "favour",
    weight: 3,
    priority: 35,
    statement: "An unordered set of items with no relations is a stack of labelled blocks.",
  },
  {
    id: "I-plain-flow-favours-blocks",
    axis: "idiom",
    when: "plain-flow",
    preset: "labelled-blocks",
    effect: "favour",
    // Deliberately below the floor on its own. "Plain flow" is the ABSENCE of a
    // special idiom, not a signal, and a rule table that treated it as evidence
    // composed a graph with a stack of blocks for every ordinary flowchart.
    weight: 1,
    priority: 25,
    statement:
      "A plain-flow idiom is the absence of an idiom: it nudges towards labelled blocks but never carries a figure on its own.",
  },

  // --- chart -----------------------------------------------------------
  {
    // Still refuses graph for a chart idiom — that part of the original
    // rule's judgement was never wrong. Only its name and premise ("not in
    // this repertoire") stopped being true the day the chart preset shipped;
    // the id is kept rather than renamed, because SELECTION.md and
    // fixtures/selection/phrasings.json cite it and a rename would be a
    // distinction without a difference to anything that reads this table.
    id: "I-chart-disqualifies-everything",
    axis: "idiom",
    when: "chart",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 85,
    statement: "A chart idiom must not be drawn as a graph; nodes and edges are not a scale.",
  },
  {
    id: "I-chart-favours-chart",
    axis: "idiom",
    when: "chart",
    preset: "chart",
    effect: "favour",
    weight: 4,
    priority: 50,
    statement: "A chart idiom is drawn by the chart preset.",
  },
  {
    id: "S-series-favours-chart",
    axis: "structure",
    when: "series",
    preset: "chart",
    effect: "favour",
    weight: 4,
    priority: 50,
    statement: "A series of values with a scale is drawn as a chart, not as unordered blocks or a graph.",
  },
  {
    id: "S-series-disqualifies-blocks",
    axis: "structure",
    when: "series",
    preset: "labelled-blocks",
    effect: "disqualify",
    weight: 0,
    priority: 85,
    statement: "A series needs a scale; labelled blocks would show values as unordered text.",
  },

  // --- function ----------------------------------------------------------
  {
    id: "S-function-favours-function-graph",
    axis: "structure",
    when: "function",
    preset: "function-graph",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A function over a continuum is drawn by function-graph: evaluated from its expression, on a numbered plane.",
  },
  {
    id: "S-function-disqualifies-graph",
    axis: "structure",
    when: "function",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "A function is not a graph of nodes and edges; the word \"graph\" is the only thing they share.",
  },
  {
    id: "S-function-disqualifies-chart",
    axis: "structure",
    when: "function",
    preset: "chart",
    effect: "disqualify",
    weight: 0,
    priority: 85,
    statement:
      "A function is not a list of values: a chart joins the samples it was given, and a curve's tangent, root or hole is not among them.",
  },
  {
    id: "S-function-disqualifies-blocks",
    axis: "structure",
    when: "function",
    preset: "labelled-blocks",
    effect: "disqualify",
    weight: 0,
    priority: 85,
    statement: "A function needs a plane; labelled blocks have none.",
  },
  {
    id: "S-function-favours-sign-chart-weakly",
    axis: "structure",
    when: "function",
    preset: "sign-chart",
    effect: "favour",
    // Exactly FLOOR, like S-hierarchy-favours-graph-weakly: the sign table
    // is a second view of the same function -- offered alongside the graph,
    // never chosen over it.
    weight: 2,
    priority: 40,
    statement:
      "A function's sign table is offered beside its graph: the same expression, read as intervals instead of a curve.",
  },
  {
    id: "S-function-favours-value-table-weakly",
    axis: "structure",
    when: "function",
    preset: "value-table",
    effect: "favour",
    // FLOOR, like the sign table: a third view of the same expression,
    // offered when the question is "what are its values at these points".
    weight: 2,
    priority: 40,
    statement:
      "A function's table of values is offered beside its graph: every cell computed from the same expression.",
  },

  // --- interval ----------------------------------------------------------
  {
    id: "S-interval-favours-number-line",
    axis: "structure",
    when: "interval",
    preset: "number-line",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "An interval or the solution set of an inequality is drawn on the number line: endpoints open or closed, unions and intersections computed.",
  },
  {
    id: "S-interval-disqualifies-blocks",
    axis: "structure",
    when: "interval",
    preset: "labelled-blocks",
    effect: "disqualify",
    weight: 0,
    priority: 85,
    statement: "An interval is a stretch of a continuum; labelled blocks have no line to stretch along.",
  },

  // --- vector ------------------------------------------------------------
  {
    id: "S-vector-favours-vectors",
    axis: "structure",
    when: "vector",
    preset: "vectors",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "Vectors are drawn by the vectors preset: on a numbered plane, with sums, components and projections derived from the vectors themselves.",
  },
  {
    id: "S-vector-disqualifies-graph",
    axis: "structure",
    when: "vector",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "A vector is not an edge: an edge joins two things, a vector has a length and a direction that must be drawn to scale.",
  },

  // --- angle -------------------------------------------------------------
  {
    id: "S-angle-favours-unit-circle",
    axis: "structure",
    when: "angle",
    preset: "unit-circle",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "An angle on the trigonometric circle is drawn by unit-circle: its point, cos and sin computed from the angle, never placed by hand.",
  },
];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((rule) => rule.id === id);
}
