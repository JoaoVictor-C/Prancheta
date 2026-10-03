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
/**
 * "function" is a relation y = f(x) over a continuum -- a curve, its
 * tangents and secants, the points read off it. Not a "series": a series is
 * a finite list of values with a scale, and drawing a function as one plots
 * the samples someone happened to pick instead of the function.
 *
 * "interval" is a subset of the real line -- a domain, the solution set of an
 * inequality, a union or intersection of intervals. Not a "set": a set's
 * members are unordered items, and an interval's members are a continuum
 * whose only facts are its endpoints and whether each belongs.
 *
 * "vector" is a quantity with magnitude and direction in the plane -- a
 * displacement, a force, a velocity -- and what is done with it: sums,
 * multiples, components, projections, the angle between two. Not a "scene":
 * a scene is drawn as it looks, a vector as the arithmetic it obeys.
 *
 * "angle" is a rotation measured from a reference direction -- the arcs of
 * the ciclo trigonométrico and what they fix: cos and sin as projections,
 * tangent, the symmetric angles in the other quadrants. Not a "function":
 * the question is where an angle lands, not the curve sin traces over time.
 *
 * "construction" is a figure of plane geometry built from its own
 * definitions -- points, lines, circles and conics each defined from the ones
 * before it (a midpoint, an intersection, a perpendicular, a tangent, a
 * circumcircle, an ellipse from its foci) -- with lengths and angles read off
 * the construction. Not a "scene": a scene is drawn as it looks, a
 * construction as the geometry that makes it. Not a "vector": nothing is
 * added or scaled.
 *
 * "space" is a configuration in R³ -- points, vectors, lines and planes
 * with their intersections, distances and angles, drawn on three axes
 * through a camera. Not a "vector": a vector is in the plane and drawn to
 * scale on a grid; in space nothing is to scale on the page, and what is
 * drawn is which line goes behind which plane. Not a "construction": a
 * construction is plane geometry.
 *
 * "solid" is a school solid of geometria espacial -- a cube, a
 * paralelepípedo, a regular prism or pyramid, a right cylinder or cone, a
 * sphere, or one inscribed in another -- with its heights, radii,
 * diagonals, slant heights, volume and area computed from its dimensions.
 * Not "space": space is points, lines and planes on three axes, and has no
 * silhouettes; a solid is drawn as the body the exercise names, without
 * axes. Not a "scene": a scene is drawn as it looks, a solid as the
 * geometry its dimensions fix.
 *
 * "surface" is the graph of a function of two variables, z = f(x, y) --
 * a paraboloid, a saddle, a bump -- with its level curves, a point on it
 * and its tangent plane, every height computed from the expression. Not a
 * "function": a function has one variable and is drawn on a plane. Not
 * "space": space draws points, lines and planes, and a surface is none of
 * them. Not "solid": a solid is a body its dimensions fix, a surface is the
 * graph its expression fixes.
 *
 * "revolution" is a solid of revolution -- a plane region bounded by
 * y = f(x) (and possibly y = g(x)) swept about an axis -- with its disc,
 * washer or shell and the volume integral that sums them. Not a "solid": a
 * school solid is fixed by a few dimensions, a solid of revolution by the
 * functions that bound its region. Not a "function": the question is the
 * body the region sweeps and its volume, not the curve.
 *
 * "field" is a quantity attached to every point of a plane region -- a
 * slope field dy/dx = f(x, y) with its solution curves, a vector field
 * (P, Q) with its flow lines, or the level curves f(x, y) = c with the
 * gradient across them. Not a "function": nothing is a curve y = f(x);
 * the marks are sampled everywhere and every curve is integrated. Not a
 * "vector": a vector is one arrow to scale, a field is a direction at
 * every point.
 *
 * "sequence" is a list indexed by n = 1, 2, 3, ... -- the terms aₙ of a
 * sequence or the partial sums Sₙ of a series -- and where it goes as n
 * grows. Not a "function": nothing exists between n and n + 1, so the
 * points are never joined. Not a "series" in this vocabulary's sense:
 * that is data someone measured; a sequence's terms and its limit are
 * computed from its formula.
 *
 * "linear-map" is a linear map of the plane, T(v) = Av -- given by its
 * 2×2 matrix or as a rotation, reflection, shear, scale or projection --
 * and what it does: to the lattice, to the unit square (the area factor
 * |det A|), to a shape or a point, which lines it keeps (eigen-lines) and
 * which line it collapses the plane onto. Not a "vector": vectors are
 * added and scaled; here one matrix carries the whole plane.
 *
 * "electric-field" is the field of point charges -- its field lines, which
 * leave positive charges and end on negative ones in a number proportional
 * to the charge, and its equipotentials. Not a "vector": a few arrows to
 * scale are not the field. Drawn by the field preset, kind "charges".
 *
 * "circuit" is a DC electric circuit with its layout given as nodes on a
 * grid -- resistors, lamps, batteries, sources, switches, ideal meters --
 * whose currents, potential differences, readings and powers are the
 * question. Not a "graph": a graph's layout is computed and its edges
 * carry no physics; here the drawing is given and every number is solved.
 *
 * "optics" is a geometric-optics ray diagram: a thin lens or a mirror with
 * an object and the image it forms, or a ray meeting a plane boundary
 * between two media. The image, its nature and the refracted angle are
 * consequences of f, p and the indices. Not a "scene": rays drawn by hand
 * can miss their own image.
 *
 * "automaton" is a finite automaton (DFA or NFA) -- states, a start state,
 * accepting states, transitions on symbols -- whose meaning is which words
 * it accepts. Not a "graph": a graph has no start arrow, no accepting
 * states and no run on a word.
 *
 * "boolean" is a boolean function of named variables whose VALUES are
 * asked for: a truth table, a tautology, an equivalence, minterms.
 * "logic-circuit" is the same kind of function to be BUILT from gates:
 * AND, OR, NOT, NAND, NOR, XOR symbols, simplified or simulated. The tell
 * is the verb: tabular, classificar, provar equivalência vs. desenhar o
 * circuito, implementar com portas, simular.
 *
 * "data" is a list of raw observations -- heights, grades, waiting times --
 * whose distribution must be summarised: grouped into classes, split at
 * quartiles, reduced to a mean and a spread. Not a "series": a series is
 * values to plot as given; here nothing to plot is given, it is computed.
 *
 * "distribution" is a probability law -- normal, binomial, Poisson -- with an
 * event on it whose probability is the answer: an area under the bell, the
 * mass of some bars, two critical tails. Not a "function": the density is
 * named, not typed, and the answer is the region's measure.
 *
 * "probability-tree" is a sequence of random stages whose outcomes multiply
 * along a path -- urn draws, coin tosses, a diagnostic test. The content is
 * the arithmetic on the tree: branches summing to 1, path products, events
 * as sums of paths, conditionals. Not a "hierarchy": a hierarchy's tree is
 * its meaning; here the tree only carries the numbers.
 *
 * "set-relations" is how several sets overlap -- union, intersection,
 * difference, complement, head-counts by region -- drawn as circles in a
 * universe. Not a "set": that is an unordered bag of items with no relation
 * among its members. Not an "interval": a subset of the real line.
 *
 * "acid-base-equilibrium" is aqueous acid–base chemistry whose picture is
 * computed from a constant, a concentration or a pH: a titration curve
 * (pH against volume of titrant), the fraction of each species of a
 * mono-, di- or triprotic acid against pH, the pH scale with substances
 * and indicator ranges. Not a "function": the curve is the root of a
 * charge balance, not a typed expression. Not "data" or "distribution":
 * there are no observations and no probability law.
 *
 * "table" is rows and columns of GIVEN text and numbers -- a nutrition
 * label, a price list, a ranking, the properties of substances -- with
 * units, grouped headers, blanks to fill, and derived columns or totals
 * computed from the data. Not a "function": nothing is evaluated from an
 * expression (that table is value-table's). Not "data": the values are
 * read, not summarised.
 *
 * "genetics" is a cross or a family tree of a trait: a Punnett square
 * from the parents' genotypes, or a pedigree of individuals, marriages
 * and generations, with the ratios and probabilities read off it. Not a
 * "hierarchy": a pedigree has two parents per child and its meaning is the
 * inheritance, not the tree.
 *
 * "pictogram" is a count or a share shown by REPEATED icons -- "cada ícone
 * representa 5 %" -- or a sequence of figures made of dots whose count is
 * the question. Not a "series": the reader counts, not compares lengths.
 *
 * "forces" is a mechanics situation: forces on a body (pulleys, a slope, a
 * table, a spring), a launch, a track with energies, a lever, a collision, a
 * circle, an orbit. Not a "vector" sum in the plane: the bodies, ropes,
 * tracks and paths are part of what is drawn, and everything is solved from
 * the situation.
 */
export const STRUCTURE = ["graph", "hierarchy", "series", "scene", "set", "function", "interval", "vector", "angle", "construction", "space", "solid", "surface", "revolution", "field", "sequence", "linear-map", "electric-field", "circuit", "optics", "automaton", "boolean", "logic-circuit", "data", "distribution", "probability-tree", "set-relations", "acid-base-equilibrium", "table", "genetics", "pictogram", "forces"] as const;

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

export type PresetId =
  | "labelled-blocks"
  | "graph"
  | "mindmap"
  | "annotated-figure"
  | "chart"
  | "function-graph"
  | "sign-chart"
  | "value-table"
  | "number-line"
  | "vectors"
  | "unit-circle"
  | "construction"
  | "space"
  | "solid"
  | "surface"
  | "revolution"
  | "field"
  | "sequence"
  | "linear-map"
  | "circuit"
  | "optics"
  | "automaton"
  | "truth-table"
  | "logic-circuit"
  | "statistics"
  | "distribution"
  | "probability-tree"
  | "venn"
  | "acid-base"
  | "data-table"
  | "genetics"
  | "pictogram"
  | "mechanics";

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
  {
    id: "function-graph",
    implemented: true,
    summary: "Curves y = f(x) on a numbered plane, with tangents, secants and computed points.",
  },
  {
    id: "sign-chart",
    implemented: true,
    summary: "The sign table of a function: where f, f′, f″ or a product's factors are +, − or 0, and where f rises and falls.",
  },
  {
    id: "value-table",
    implemented: true,
    summary: "A table of values of one or more functions at chosen points, every cell computed from the expression.",
  },
  {
    id: "number-line",
    implemented: true,
    summary: "The real line with intervals and solution sets of inequalities; unions and intersections computed.",
  },
  {
    id: "vectors",
    implemented: true,
    summary: "Vectors in the plane with sums, multiples, components, projections and angles derived from them.",
  },
  {
    id: "unit-circle",
    implemented: true,
    summary: "The trigonometric circle: points from angles, cos and sin as projections, exact notable values, symmetric angles.",
  },
  {
    id: "construction",
    implemented: true,
    summary: "Plane and analytic geometry built from definitions: intersections, perpendiculars, bisectors, tangents, triangle centres and conics, with every length and angle computed.",
  },
  {
    id: "space",
    implemented: true,
    summary: "Points, vectors, lines and planes in R³ on three axes: intersections, distances and angles computed, what is behind a plane dashed; gridded coordinate planes, blocks with their orthogonal projections, and paths with arrows and exact lengths.",
  },
  {
    id: "solid",
    implemented: true,
    summary: "School solids -- cube, box, prisms, pyramids, cylinder, cone, sphere, frustums, hemispheres, stairs and polyhedra from face data -- from their dimensions: hidden edges by real visibility, bores, liquid to a level, inscribed and stacked solids, nets; diagonals, slant heights, volumes and areas exact.",
  },
  {
    id: "surface",
    implemented: true,
    summary: "Surfaces z = f(x, y) as a shaded mesh on three axes: hidden parts by depth, level curves on the surface and projected to a floor, a point with its tangent plane printed exact.",
  },
  {
    id: "revolution",
    implemented: true,
    summary: "Solids of revolution from a region and an axis: discs, washers or shells, silhouette computed, hidden parts dashed, the slice's R(x), r(x) and dx, and the volume integral exact (8π, 2π/15).",
  },
  {
    id: "field",
    implemented: true,
    summary: "Slope fields, vector fields and level curves: dy/dx = f(x, y), (P, Q), f(x, y) = c, with solution and flow curves integrated by RK4 and gradients computed; and the field lines and equipotentials of point charges, seeded in proportion to each charge.",
  },
  {
    id: "sequence",
    implemented: true,
    summary: "Sequences aₙ and partial sums Sₙ as unjoined dots on a numbered plane, each limit computed and drawn as its own dashed line, exact when it snaps.",
  },
  {
    id: "linear-map",
    implemented: true,
    summary: "Linear maps of the plane from a matrix or a named rotation, reflection, shear, scale or projection: the image lattice, T(e₁) and T(e₂), the unit square with |det A| measured, eigen-lines, and shapes mapped to primed vertices.",
  },
  {
    id: "circuit",
    implemented: true,
    summary: "DC circuits from a given node layout: conventional symbols, branch currents solved by nodal analysis and drawn with arrows in their true direction, meter readings, U_AB, node potentials and powers.",
  },
  {
    id: "optics",
    implemented: true,
    summary: "Geometric optics: thin lenses and spherical or plane mirrors with the image computed by Gauss and the principal rays constructed (virtual images dashed), and refraction and total internal reflection at a plane interface by Snell.",
  },
  {
    id: "automaton",
    implemented: true,
    summary: "Finite automata (DFA, NFA with ε) in Sipser style, with each listed word run through the automaton: its path or state sets and aceita/rejeita computed.",
  },
  {
    id: "truth-table",
    implemented: true,
    summary: "Truth tables of boolean expressions, every cell computed, with subexpression columns, tautology/contradiction/contingency, equivalence, and minterms with a Quine–McCluskey minimal form.",
  },
  {
    id: "logic-circuit",
    implemented: true,
    summary: "Gate diagrams built from a boolean expression in distinctive-shape symbols, with fan-out dots, optional Quine–McCluskey simplification and a simulation printing every wire's value.",
  },
  {
    id: "statistics",
    implemented: true,
    summary: "Histograms (Sturges or given classes, frequency table, polygon) and boxplots (quartiles by a stated method, 1,5·IQR whiskers, outliers, groups side by side) of raw data, with n, mean, median, mode, variance, standard deviation and IQR computed.",
  },
  {
    id: "distribution",
    implemented: true,
    summary: "Normal, binomial and Poisson laws with an event shaded: the region's area is the printed probability (measured), boundaries with x and z, two-sided tails with α/2, the normal approximation with continuity correction, and the standardisation and arithmetic computed.",
  },
  {
    id: "probability-tree",
    implemented: true,
    summary: "Probability trees from branch probabilities or an urn, in exact fractions: path products, an event's probability as a sum of highlighted paths, and Bayes conditionals computed from the leaves.",
  },
  {
    id: "venn",
    implemented: true,
    summary: "Venn diagrams of two or three sets in a universe: a set expression shaded by evaluating it on every region, survey data solved by inclusion–exclusion and printed in each region, and elements listed where they belong.",
  },
  {
    id: "acid-base",
    implemented: true,
    summary: "Acid–base equilibrium figures, every point computed: titration curves (pH against volume of titrant, by charge balance, with initial, half-equivalence and equivalence points, indicator bands and a verdict), species-distribution diagrams (α against pH, crossings at pH = pKa), and the pH scale with substances given by pH, [H⁺] or [OH⁻].",
  },
  {
    id: "data-table",
    implemented: true,
    summary: "Tables of given data: a header row with units (and grouped headers), pt-BR numbers aligned on the decimal comma, real sub/superscripts, highlights and blanks to fill; derived columns and totals rows computed, hidden under answers: false.",
  },
  {
    id: "genetics",
    implemented: true,
    summary: "Punnett squares and pedigrees: gametes, cells and phenotype ratios as exact fractions; family trees laid out by generation, checked against a mode of inheritance, with each individual's possible genotypes and requested probabilities exact.",
  },
  {
    id: "pictogram",
    implemented: true,
    summary: "Counts and shares as repeated icons -- filled icons computed from each value (a remainder fills the last icon by its fraction), outline slots for the whole -- and sequences of dot figures whose counts are the polygonal numbers, computed from the construction.",
  },
  {
    id: "mechanics",
    implemented: true,
    summary: "Force diagrams solved before they are drawn: pulley systems (each movable pulley halves the force), a block on an inclined plane (components, normal, kinetic or static friction, acceleration), two blocks over a table's edge, Atwood's machine, a spring; projectiles, energy along a track, levers, collisions, circular motion (uniform, loop, banked curve, conical pendulum), Kepler orbits and gravitation; free fall, blocks in contact, an angled pull, an elevator, springs in series and parallel, a knot on two cables, the centre of mass, oscillators; buoyancy, a hydraulic press, pressure at depth and in a U-tube, and efficiency band diagrams -- every arrow to one scale, or the figure says it is not.",
  },
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
