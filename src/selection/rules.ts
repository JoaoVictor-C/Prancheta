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

  // --- construction ------------------------------------------------------
  {
    id: "S-construction-favours-construction",
    axis: "structure",
    when: "construction",
    preset: "construction",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A geometric construction is drawn by the construction preset: every point, line and circle computed from its definition, every printed length and angle measured against the drawing.",
  },
  {
    id: "S-construction-disqualifies-graph",
    axis: "structure",
    when: "construction",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "A construction is not a node-and-edge graph: its points have coordinates and its lines have directions that must be drawn to scale.",
  },

  // --- space ---------------------------------------------------------------
  {
    id: "S-space-favours-space",
    axis: "structure",
    when: "space",
    preset: "space",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A configuration in R³ is drawn by the space preset: every derived point, line and plane computed with the vector algebra, what passes behind a plane dashed by depth.",
  },
  {
    id: "S-space-disqualifies-vectors",
    axis: "structure",
    when: "space",
    preset: "vectors",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "The vectors preset draws R² on a grid; a vector in space has a third component it cannot draw.",
  },
  {
    id: "S-space-disqualifies-graph",
    axis: "structure",
    when: "space",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "Lines and planes in space are not nodes and edges: their positions are coordinates, projected.",
  },

  // --- solid ---------------------------------------------------------------
  {
    id: "S-solid-favours-solid",
    axis: "structure",
    when: "solid",
    preset: "solid",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A school solid is drawn by the solid preset: every vertex, edge, rim and silhouette computed from its dimensions, hidden edges dashed by which faces the reader sees, every measure printed exact.",
  },
  {
    id: "S-solid-disqualifies-space",
    axis: "structure",
    when: "solid",
    preset: "space",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "The space preset draws points, lines and planes on axes; it has no faces, rims or silhouettes to draw a cylinder, cone or sphere.",
  },
  {
    id: "S-solid-disqualifies-graph",
    axis: "structure",
    when: "solid",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement: "A solid's edges are not a graph's edges: their lengths and directions are the geometry, projected.",
  },

  // --- surface ---------------------------------------------------------------
  {
    id: "S-surface-favours-surface",
    axis: "structure",
    when: "surface",
    preset: "surface",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "The graph of z = f(x, y) is drawn by the surface preset: every mesh height is f, cells painted far to near, level curves found where f = c, the tangent plane from the partial derivatives.",
  },
  {
    id: "S-surface-disqualifies-function-graph",
    axis: "structure",
    when: "surface",
    preset: "function-graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "function-graph draws y = f(x) on a plane; a function of two variables needs a third axis.",
  },
  {
    id: "S-surface-disqualifies-space",
    axis: "structure",
    when: "surface",
    preset: "space",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "The space preset draws points, lines and planes; it has no curved surface and no hidden-surface order.",
  },

  // --- revolution ------------------------------------------------------------
  {
    id: "S-revolution-favours-revolution",
    axis: "structure",
    when: "revolution",
    preset: "revolution",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A solid of revolution is drawn by the revolution preset: the region from its bounding functions, the silhouette and rims swept about the axis, the disc, washer or shell sampled from R(x) and r(x), and the volume integral evaluated and printed exact.",
  },
  {
    id: "S-revolution-disqualifies-solid",
    axis: "structure",
    when: "revolution",
    preset: "solid",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "The solid preset builds bodies from a few dimensions; it has no region, no bounding function and no volume integral.",
  },
  {
    id: "S-revolution-disqualifies-space",
    axis: "structure",
    when: "revolution",
    preset: "space",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "The space preset draws points, lines and planes; a swept region has a curved silhouette it cannot draw.",
  },

  // --- field -----------------------------------------------------------------
  {
    id: "S-field-favours-field",
    axis: "structure",
    when: "field",
    preset: "field",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A slope field, a vector field or a family of level curves is drawn by the field preset: every mark evaluated at its lattice point, every solution or flow curve integrated by RK4, every level curve found where f = c.",
  },
  {
    id: "S-field-disqualifies-function-graph",
    axis: "structure",
    when: "field",
    preset: "function-graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "function-graph draws curves it is given; a field's curves are integrated from the field, and its marks cover the whole plane.",
  },
  {
    id: "S-field-disqualifies-vectors",
    axis: "structure",
    when: "field",
    preset: "vectors",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "The vectors preset draws a few arrows to scale; a field is a direction at every point, drawn on a lattice and never to one scale.",
  },

  // --- sequence --------------------------------------------------------------
  {
    id: "S-sequence-favours-sequence",
    axis: "structure",
    when: "sequence",
    preset: "sequence",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A sequence or a series is drawn by the sequence preset: every term and partial sum evaluated at its n, never joined, and each limit computed by the numeric kit and drawn at its own height.",
  },
  {
    id: "S-sequence-disqualifies-function-graph",
    axis: "structure",
    when: "sequence",
    preset: "function-graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "function-graph joins its samples into a curve; a sequence has nothing between n and n + 1.",
  },
  {
    id: "S-sequence-disqualifies-chart",
    axis: "structure",
    when: "sequence",
    preset: "chart",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A chart draws the values it is handed and has no limit to compute; a sequence's terms come from its formula.",
  },

  // --- linear-map ------------------------------------------------------------
  {
    id: "S-linear-map-favours-linear-map",
    axis: "structure",
    when: "linear-map",
    preset: "linear-map",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A linear map of the plane is drawn by the linear-map preset: the matrix computed from the map, the lattice, the basis and the unit square carried through it, |det A| measured against the parallelogram drawn, eigen-lines from the characteristic polynomial.",
  },
  {
    id: "S-linear-map-disqualifies-vectors",
    axis: "structure",
    when: "linear-map",
    preset: "vectors",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "The vectors preset adds and scales arrows; it cannot carry a lattice or a region through a matrix.",
  },
  {
    id: "S-linear-map-disqualifies-graph",
    axis: "structure",
    when: "linear-map",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A graph has no coordinates; a transformation of the plane is nothing but coordinates.",
  },

  // --- electric-field --------------------------------------------------------
  {
    id: "S-electric-field-favours-field",
    axis: "structure",
    when: "electric-field",
    preset: "field",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "The field lines of point charges are drawn by the field preset: each charge seeds lines in proportion to |q|, every line is integrated by RK4 and ends on a charge of the other sign, at the box, or where E = 0.",
  },
  {
    id: "S-electric-field-disqualifies-function-graph",
    axis: "structure",
    when: "electric-field",
    preset: "function-graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "function-graph draws curves y = f(x); a field line is integrated from the charges and is generally not a graph over x.",
  },
  {
    id: "S-electric-field-disqualifies-vectors",
    axis: "structure",
    when: "electric-field",
    preset: "vectors",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "The vectors preset draws a few arrows to scale; field lines are curves that carry a direction, and their number is the charge.",
  },

  // --- circuit ---------------------------------------------------------------
  {
    id: "S-circuit-favours-circuit",
    axis: "structure",
    when: "circuit",
    preset: "circuit",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A DC circuit is drawn by the circuit preset: symbols on the given layout, every current, reading and ddp solved by nodal analysis, and arrows pointing the way current actually flows.",
  },
  {
    id: "S-circuit-disqualifies-graph",
    axis: "structure",
    when: "circuit",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A graph lays out its own nodes and knows no Ohm's law; a circuit's drawing is given and its numbers are solved.",
  },
  {
    id: "S-circuit-disqualifies-annotated-figure",
    axis: "structure",
    when: "circuit",
    preset: "annotated-figure",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "Callouts on a hand-drawn circuit would type the currents instead of solving them, and nothing would check which way an arrow points.",
  },

  // --- optics ----------------------------------------------------------------
  {
    id: "S-optics-favours-optics",
    axis: "structure",
    when: "optics",
    preset: "optics",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A ray diagram of a lens, a mirror or a plane interface is drawn by the optics preset, which computes the image and the refracted angle and constructs every ray from its own rule.",
  },
  {
    id: "S-optics-disqualifies-vectors",
    axis: "structure",
    when: "optics",
    preset: "vectors",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "Rays are not vectors to add or decompose; a figure of rays and images is never drawn with vectors.",
  },
  {
    id: "S-optics-disqualifies-annotated-figure",
    axis: "structure",
    when: "optics",
    preset: "annotated-figure",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "Hand-placed rays can be drawn to miss their own image; the optics preset makes that impossible.",
  },

  // --- automaton -------------------------------------------------------------
  {
    id: "S-automaton-favours-automaton",
    axis: "structure",
    when: "automaton",
    preset: "automaton",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "States with a start state, accepting states and transitions on symbols are drawn by the automaton preset, and whether a word is accepted is computed by running it, never typed.",
  },
  {
    id: "S-automaton-disqualifies-graph",
    axis: "structure",
    when: "automaton",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "An automaton is a graph whose meaning is its runs; the graph preset has no start arrow, no accepting states and no simulation.",
  },
  {
    id: "S-automaton-disqualifies-labelled-blocks",
    axis: "structure",
    when: "automaton",
    preset: "labelled-blocks",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "States joined by labelled transitions are not stacked boxes.",
  },

  // --- boolean and logic-circuit ---------------------------------------------
  {
    id: "S-boolean-favours-truth-table",
    axis: "structure",
    when: "boolean",
    preset: "truth-table",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A boolean function's values, classification, equivalence or minterms are a truth table, every cell computed from the expression.",
  },
  {
    id: "S-boolean-disqualifies-value-table",
    axis: "structure",
    when: "boolean",
    preset: "value-table",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "value-table evaluates real functions at chosen points; a boolean function has every assignment of its variables, and V/F or 0/1 values.",
  },
  {
    id: "S-logic-circuit-favours-logic-circuit",
    axis: "structure",
    when: "logic-circuit",
    preset: "logic-circuit",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A request to draw, implement or simulate a boolean function with gates is drawn by the logic-circuit preset, gates laid out from the expression tree.",
  },
  {
    id: "S-logic-circuit-disqualifies-graph",
    axis: "structure",
    when: "logic-circuit",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "Gates are not nodes: each has a shape that is its function, and wires run orthogonally to named pins.",
  },

  // --- data ------------------------------------------------------------------
  {
    id: "S-data-favours-statistics",
    axis: "structure",
    when: "data",
    preset: "statistics",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "Raw observations to group into classes or split at quartiles are summarised by the statistics preset: every frequency, quartile, mean and spread computed from the data.",
  },
  {
    id: "S-data-disqualifies-chart",
    axis: "structure",
    when: "data",
    preset: "chart",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A chart plots values it is handed as separated bars; a histogram's touching bars are counts computed from the data.",
  },

  // --- distribution ----------------------------------------------------------
  {
    id: "S-distribution-favours-distribution",
    axis: "structure",
    when: "distribution",
    preset: "distribution",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A probability law with an event is drawn by the distribution preset: the region shaded, its probability computed and measured against the area drawn, and the standardisation printed.",
  },
  {
    id: "S-distribution-disqualifies-function-graph",
    axis: "structure",
    when: "distribution",
    preset: "function-graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A density typed into function-graph leaves the bounds, the curve and the number free to disagree, and nothing does the standardisation.",
  },
  {
    id: "S-distribution-disqualifies-chart",
    axis: "structure",
    when: "distribution",
    preset: "chart",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A chart draws data; the mass function of a named law with an event highlighted is computed from the law.",
  },

  // --- probability-tree ------------------------------------------------------
  {
    id: "S-probability-tree-favours-probability-tree",
    axis: "structure",
    when: "probability-tree",
    preset: "probability-tree",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A sequence of random stages is drawn by the probability-tree preset, which checks that each node's branches sum to 1 and computes the path products, event sums and conditionals.",
  },
  {
    id: "S-probability-tree-disqualifies-mindmap",
    axis: "structure",
    when: "probability-tree",
    preset: "mindmap",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A mindmap lays out a tree but does no arithmetic on it.",
  },
  {
    id: "S-probability-tree-disqualifies-graph",
    axis: "structure",
    when: "probability-tree",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A graph gives a tree layout without the arithmetic; the branch probabilities and path products are the whole point.",
  },

  // --- set-relations ---------------------------------------------------------
  {
    id: "S-set-relations-favours-venn",
    axis: "structure",
    when: "set-relations",
    preset: "venn",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "Overlapping sets, their unions, intersections, differences and head-counts by region are a Venn diagram, every region shaded or counted by computation.",
  },
  {
    id: "S-set-relations-disqualifies-blocks",
    axis: "structure",
    when: "set-relations",
    preset: "labelled-blocks",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A stack of blocks cannot show that two sets share members.",
  },
  {
    id: "S-set-relations-disqualifies-number-line",
    axis: "structure",
    when: "set-relations",
    preset: "number-line",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "Overlapping sets are not a subset of the real line; intervals are drawn by number-line.",
  },

  // --- acid-base-equilibrium -------------------------------------------------
  {
    id: "S-acid-base-favours-acid-base",
    axis: "structure",
    when: "acid-base-equilibrium",
    preset: "acid-base",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A titration curve, a species-distribution diagram or the pH scale is drawn by acid-base: every point is computed from the equilibrium (equivalence, half-equivalence, pKa crossings, pH from [H⁺]), never typed.",
  },
  {
    id: "S-acid-base-disqualifies-function-graph",
    axis: "structure",
    when: "acid-base-equilibrium",
    preset: "function-graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A titration curve typed into function-graph leaves the curve, the equivalence point and the pKa read at half-equivalence free to disagree, and a weak acid's curve has no closed form.",
  },
  {
    id: "S-acid-base-disqualifies-chart",
    axis: "structure",
    when: "acid-base-equilibrium",
    preset: "chart",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A chart draws values it is handed; the pH along a titration is the root of a balance at every volume.",
  },

  // --- table -----------------------------------------------------------------
  {
    id: "S-table-favours-data-table",
    axis: "structure",
    when: "table",
    preset: "data-table",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "Rows and columns of given values are drawn by data-table: numbers written pt-BR and aligned on the comma, derived columns and totals computed from the data, blanks to fill.",
  },
  {
    id: "S-table-disqualifies-labelled-blocks",
    axis: "structure",
    when: "table",
    preset: "labelled-blocks",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A stack of blocks has no columns: a table's meaning is which value sits in which row and column.",
  },

  // --- genetics --------------------------------------------------------------
  {
    id: "S-genetics-favours-genetics",
    axis: "structure",
    when: "genetics",
    preset: "genetics",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "A Punnett square or a pedigree is drawn by genetics: gametes, cells and ratios computed from the genotypes, a pedigree laid out by generation and checked against its mode of inheritance.",
  },
  {
    id: "S-genetics-disqualifies-graph",
    axis: "structure",
    when: "genetics",
    preset: "graph",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A pedigree is not nodes and edges: two parents per child, marriages and generations carry the inheritance a graph layout would lose.",
  },
  {
    id: "S-genetics-disqualifies-mindmap",
    axis: "structure",
    when: "genetics",
    preset: "mindmap",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A family tree has two parents per child; a mindmap has one root and one parent per node.",
  },

  // --- pictogram -------------------------------------------------------------
  {
    id: "S-pictogram-favours-pictogram",
    axis: "structure",
    when: "pictogram",
    preset: "pictogram",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "Repeated icons or dot figures are drawn by pictogram: how many icons are filled, and how many dots each figure has, are computed from the data.",
  },
  {
    id: "S-pictogram-disqualifies-chart",
    axis: "structure",
    when: "pictogram",
    preset: "chart",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A pictogram is read by counting icons, not by comparing lengths: bars would answer a different question.",
  },

  // --- forces ----------------------------------------------------------------
  {
    id: "S-forces-favours-mechanics",
    axis: "structure",
    when: "forces",
    preset: "mechanics",
    effect: "favour",
    weight: 4,
    priority: 55,
    statement:
      "Forces on a body -- a pulley system, a block on a slope -- are drawn by mechanics: the forces are solved from the situation and every arrow is drawn to one scale.",
  },
  {
    id: "S-forces-disqualifies-vectors",
    axis: "structure",
    when: "forces",
    preset: "vectors",
    effect: "disqualify",
    weight: 0,
    priority: 90,
    statement:
      "A force diagram has a body, a rope, a slope: free vectors in the plane would lose what the forces act on and what fixes them.",
  },
];

export function ruleById(id: string): Rule | undefined {
  return RULES.find((rule) => rule.id === id);
}
