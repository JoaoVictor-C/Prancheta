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
 */
export const STRUCTURE = ["graph", "hierarchy", "series", "scene", "set", "function", "interval", "vector", "angle", "construction", "space", "solid", "surface", "revolution", "field", "sequence"] as const;

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
  | "sequence";

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
    summary: "Points, vectors, lines and planes in R³ on three axes: intersections, distances and angles computed, what is behind a plane dashed.",
  },
  {
    id: "solid",
    implemented: true,
    summary: "School solids -- cube, box, prisms, pyramids, cylinder, cone, sphere -- from their dimensions: hidden edges dashed, silhouettes computed, diagonals, slant heights, volumes and areas exact.",
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
    summary: "Slope fields, vector fields and level curves: dy/dx = f(x, y), (P, Q), f(x, y) = c, with solution and flow curves integrated by RK4 and gradients computed.",
  },
  {
    id: "sequence",
    implemented: true,
    summary: "Sequences aₙ and partial sums Sₙ as unjoined dots on a numbered plane, each limit computed and drawn as its own dashed line, exact when it snaps.",
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
