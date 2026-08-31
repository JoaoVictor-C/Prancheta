/**
 * Connector geometry.
 *
 * Two sources of route. A graph scene gets its polyline from ELK, already
 * routed around the nodes. An absolute scene — a callout pointing at a place
 * on a figure — gets a straight line computed here.
 *
 * In both cases the line is clipped to the boxes it joins and pulled back by a
 * small gap, because a line that touches a border reads as a join, and a line
 * that overlaps it reads as a mistake.
 */

import type { ConnectorCurve, PlacedBox, Point, Rect } from "../ir/types.ts";
import type { PathCommand } from "../geometry/paths.ts";
import { flattenPath } from "../geometry/paths.ts";
import { shapeVertices } from "../geometry/shapes.ts";
import { connector as connectorTheme } from "../theme.ts";

/** Straight route between two boxes, clipped to both borders. */
export function routeBetweenBoxes(from: PlacedBox, to: PlacedBox): Point[] {
  const start = centreOf(from);
  const end = centreOf(to);
  return [
    clipToBox(start, end, from, connectorTheme.gap),
    clipToBox(end, start, to, connectorTheme.gap),
  ];
}

/** Straight route from a box to a bare point — the callout case. */
export function routeToPoint(from: PlacedBox, target: Point): Point[] {
  const start = centreOf(from);
  return [clipToBox(start, target, from, connectorTheme.gap), target];
}

/**
 * Straight route from a bare point INTO a box — routeToPoint reversed.
 *
 * Only the box end is clipped, exactly as in routeToPoint: a stated point is
 * a place the author chose, and pulling it back off itself would move the
 * arrow away from the coordinate the figure claims it starts at.
 */
export function routeFromPoint(source: Point, to: PlacedBox): Point[] {
  const end = centreOf(to);
  return [source, clipToBox(end, source, to, connectorTheme.gap)];
}

/**
 * A free vector: both ends stated, neither clipped.
 *
 * This is what several forces sharing one application point need. It joins no
 * box, so `connector-clear-of-boxes` grants it no endpoint exemption -- a
 * vector drawn out of the middle of a block is crossing that block, and the
 * figure has to say so with `allowConnectorCrossing` rather than have it
 * excused silently.
 */
export function routePointToPoint(source: Point, target: Point): Point[] {
  return [source, target];
}

/** How far above a box a self-loop reaches, in px. */
const SELF_LOOP_HEIGHT = 26;

/**
 * A connector from a box back to itself.
 *
 * `routeBetweenBoxes` cannot serve this case: both ends clip against the same
 * box from the same centre, so the route collapses to a single point and is
 * drawn as a zero-length stub — invisible, and with no direction for its
 * arrowhead. Every check passes it, because there is no ink anywhere to be
 * wrong. A state machine's self-transition silently disappearing is exactly
 * the class of defect this tool exists to catch, so the loop gets a real
 * route.
 *
 * The route is orthogonal, out of the top edge and back into it. Straight
 * runs, deliberately: a self-loop is a route, not a `curve`, so it must not
 * smuggle in curvature that `allowCurvedConnectors` was not asked for. A
 * `curve` on top of it bends it exactly as it bends any other route — and
 * `spline` is the one that suits it, since the corners are where a loop wants
 * rounding.
 *
 * Above rather than beside because the label sits inside the box and the run
 * of a stack is usually vertical, so the space over a node is the space most
 * likely to be free — and when it is not, the loop overlaps something visibly
 * and gets reported, which is the outcome to prefer over vanishing.
 */
export function routeSelfLoop(box: PlacedBox, height = SELF_LOOP_HEIGHT): Point[] {
  const gap = connectorTheme.gap;
  // A quarter of the width either side of centre: wide enough to read as a
  // loop, narrow enough that it stays over its own box rather than a neighbour.
  const left = box.x + box.width * 0.25;
  const right = box.x + box.width * 0.75;
  const top = box.y - gap;
  const crest = box.y - gap - height;
  return [
    { x: left, y: top },
    { x: left, y: crest },
    { x: right, y: crest },
    { x: right, y: top },
  ];
}

/**
 * Translate a curve's authored coordinates into page space.
 *
 * Only `bezier` carries any: its control points are authored in the scene's
 * own coordinates, the same frame as a callout's `to` point, and the route
 * they bend has already been lifted out of that frame. Leaving them behind
 * put the control point at the scene's origin offset from where it was
 * written — invisible in a scene at the origin, and wrong by exactly the
 * canvas padding everywhere else.
 *
 * `arc` and `spline` need nothing: both are derived from the route itself,
 * which is why they are the two that survive being re-routed.
 */
export function liftCurve(curve: ConnectorCurve, origin: Point): ConnectorCurve {
  if (origin.x === 0 && origin.y === 0) return curve;
  if (curve.kind === "bezier") {
    return {
      kind: "bezier",
      control: curve.control.map((point) => ({ x: point.x + origin.x, y: point.y + origin.y })),
    };
  }
  // A sweep's centre is a coordinate in the same scene-local space as the
  // endpoints, so it travels with them.
  if (curve.kind === "sweep") {
    return { kind: "sweep", centre: { x: curve.centre.x + origin.x, y: curve.centre.y + origin.y } };
  }
  return curve;
}

/**
 * Trim a polyline that already exists (ELK's) so its ends stop short of the
 * boxes. ELK routes to the node border, which is exactly where the stroke of
 * that border already is.
 */
export function trimRoute(points: Point[], from: PlacedBox, to: PlacedBox | null): Point[] {
  if (points.length < 2) return points;
  const trimmed = [...points];
  trimmed[0] = pullBack(trimmed[0]!, trimmed[1]!, connectorTheme.gap);
  if (to !== null) {
    const last = trimmed.length - 1;
    trimmed[last] = pullBack(trimmed[last]!, trimmed[last - 1]!, connectorTheme.gap);
  }
  void from;
  return trimmed;
}

export function centreOf(box: PlacedBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Walk from `inside` towards `towards` and return the point where the ray
 * leaves the box, pushed out by `gap`.
 *
 * `box.shape` decides which boundary "leaves the box" means. Most shapes here
 * (diamond, hexagon, triangle, ...) are polygons whose vertices are the exact
 * outline `svg.ts` draws, via `shapeVertices` -- so a connector aimed at a
 * triangle stops on the triangle's slanted edge, not on the rectangle that
 * would bound it. "circle" and "ellipse" also return null from
 * `shapeVertices` but are knowingly left on the rectangular path below: an
 * exact ellipse-ray intersection is a different computation, and closing that
 * gap is out of scope for this fix. "rect" and "stadium" are rectangular by
 * definition and were never wrong.
 */
function clipToBox(inside: Point, towards: Point, box: PlacedBox, gap: number): Point {
  const dx = towards.x - inside.x;
  const dy = towards.y - inside.y;
  if (dx === 0 && dy === 0) return inside;

  const vertices = box.shape === undefined ? null : shapeVertices(box.shape, box);
  if (vertices !== null) {
    const clipped = clipToPolygon(inside, dx, dy, vertices, gap);
    if (clipped !== null) return clipped;
  }

  const halfWidth = box.width / 2 + gap;
  const halfHeight = box.height / 2 + gap;
  const centre = centreOf(box);

  // Scale the direction until it hits whichever edge comes first.
  const scaleX = dx === 0 ? Infinity : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

/**
 * Cast the ray `origin + t * (dx, dy)` against a polygon's edges and return
 * the point where it first leaves, pushed out by `gap` along the same
 * direction. Returns null when the ray meets no edge (degenerate polygon, or
 * `origin` already outside it), so the caller can fall back to the
 * rectangular clip rather than draw an endpoint at `origin` itself.
 *
 * Takes the minimum positive `t` rather than assuming convexity, because
 * "cross" and "star" are not convex: for a shape like that the ray can cross
 * more than one edge, and the first crossing is the one that is actually the
 * shape's boundary as seen from an interior point.
 */
function clipToPolygon(origin: Point, dx: number, dy: number, vertices: Point[], gap: number): Point | null {
  let bestT = Infinity;
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const denom = dx * edgeY - dy * edgeX;
    if (denom === 0) continue; // Parallel to this edge -- no single crossing.

    const qpx = a.x - origin.x;
    const qpy = a.y - origin.y;
    const t = (qpx * edgeY - qpy * edgeX) / denom;
    const u = (qpx * dy - qpy * dx) / denom;
    if (t > 1e-9 && u >= 0 && u <= 1 && t < bestT) bestT = t;
  }
  if (!Number.isFinite(bestT)) return null;

  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const pushed = bestT + gap / length;
  return { x: origin.x + dx * pushed, y: origin.y + dy * pushed };
}

/** Move `point` towards `towards` by `distance`. */
function pullBack(point: Point, towards: Point, distance: number): Point {
  const dx = towards.x - point.x;
  const dy = towards.y - point.y;
  const length = Math.hypot(dx, dy);
  if (length === 0 || length <= distance) return point;
  return {
    x: point.x + (dx / length) * distance,
    y: point.y + (dy / length) * distance,
  };
}

/**
 * Does a polyline segment cross a rectangle? Used by the connector check.
 *
 * Takes a plain `Rect` rather than a `PlacedBox` so the caller decides which
 * rect a box means -- for a rotated box that is its exact rotated bounding
 * box (checks.ts's `checkRect`), never the box's own unrotated x/y/width/height.
 */
export function polylineIntersectsBox(points: Point[], box: Rect, epsilon = 0.5): boolean {
  const left = box.x + epsilon;
  const top = box.y + epsilon;
  const right = box.x + box.width - epsilon;
  const bottom = box.y + box.height - epsilon;
  if (right <= left || bottom <= top) return false;

  for (let i = 0; i < points.length - 1; i += 1) {
    if (segmentIntersectsRect(points[i]!, points[i + 1]!, left, top, right, bottom)) return true;
  }
  return false;
}

function segmentIntersectsRect(
  a: Point,
  b: Point,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  // Liang–Barsky: clip the segment against the rectangle; any surviving span
  // means the segment passes through it.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tests: [number, number][] = [
    [-dx, a.x - left],
    [dx, right - a.x],
    [-dy, a.y - top],
    [dy, bottom - a.y],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t1 > t0;
}

/**
 * Bend a routed polyline according to its `curve` (decision 0010).
 *
 * The result is a polyline, not a path: it replaces `points` on the placed
 * connector, so every check reads the bent geometry and the renderer draws
 * exactly the coordinates that were checked. See flattenPath.
 *
 * Endpoints are preserved exactly. Routing has already clipped them to the
 * boxes and pulled them back off the borders, and a curve that moved them
 * would undo that.
 */
/**
 * The SVG arc commands for a circular sweep from `first` to `last` about
 * `centre`, taking the shorter way round.
 *
 * The radius is the mean of the two arms. They should be equal -- an author
 * computing both from one angle gets that for free -- and when they are not,
 * `sweep-is-circular` says so rather than this quietly drawing an ellipse
 * that matches neither arm.
 */
export function sweepCommands(first: Point, last: Point, centre: Point): PathCommand[] {
  const r1 = Math.hypot(first.x - centre.x, first.y - centre.y);
  const r2 = Math.hypot(last.x - centre.x, last.y - centre.y);
  const radius = (r1 + r2) / 2;
  if (radius === 0) return [{ kind: "M", x: first.x, y: first.y }];
  return [
    { kind: "M", x: first.x, y: first.y },
    {
      kind: "A",
      rx: radius,
      ry: radius,
      rotation: 0,
      largeArc: false,
      // SVG's sweep flag means "drawn in the direction of INCREASING angle".
      // Endpoint parameterisation offers two centres for the same pair of
      // points and radius, and picking the wrong one silently draws an arc
      // about the mirror centre -- the points still sit at the stated radius,
      // just not from the centre that was asked for. The cross product of the
      // two arms says which way the shorter path runs.
      sweep: crossSign(first, last, centre) > 0,
      x: last.x,
      y: last.y,
    },
  ];
}

function crossSign(first: Point, last: Point, centre: Point): number {
  const ax = first.x - centre.x;
  const ay = first.y - centre.y;
  const bx = last.x - centre.x;
  const by = last.y - centre.y;
  return ax * by - ay * bx;
}

/** The angle the two arms subtend at `centre`, in degrees, always 0..180. */
export function sweptDegrees(first: Point, last: Point, centre: Point): number {
  const ax = first.x - centre.x;
  const ay = first.y - centre.y;
  const bx = last.x - centre.x;
  const by = last.y - centre.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) return 0;
  const cosine = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function curveRoute(points: Point[], curve: ConnectorCurve): Point[] {
  if (points.length < 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  if (curve.kind === "spline") {
    // Two points have no corner to round, so a spline over them is the line.
    if (points.length === 2) return points;
    return withEnds(
      flattenPath(roundCorners(points, curve.radius ?? SPLINE_RADIUS)),
      first,
      last,
    );
  }

  if (curve.kind === "bezier") {
    const [c1, c2] = curve.control;
    const commands: PathCommand[] =
      c2 === undefined
        ? [
            { kind: "M", x: first.x, y: first.y },
            { kind: "Q", x1: c1!.x, y1: c1!.y, x: last.x, y: last.y },
          ]
        : [
            { kind: "M", x: first.x, y: first.y },
            { kind: "C", x1: c1!.x, y1: c1!.y, x2: c2.x, y2: c2.y, x: last.x, y: last.y },
          ];
    return withEnds(flattenPath(commands), first, last);
  }

  if (curve.kind === "sweep") {
    // A real circular arc, not a bowed chord: the sweep is whatever the two
    // endpoints subtend at `centre`, so it cannot disagree with the geometry
    // that produced them. Flattened through the same adaptive flattener every
    // other curve uses, so what the checks walk is what the renderer draws.
    return withEnds(flattenPath(sweepCommands(first, last, curve.centre)), first, last);
  }

  // "arc": bow the chord by `bulge` of its own length. Intermediate waypoints
  // are deliberately ignored — an arc is defined by its two ends, and a route
  // that needs its waypoints honoured wants "spline".
  const bulge = curve.bulge ?? 0.25;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length === 0 || bulge === 0) return [first, last];
  // A quadratic passes through its control point's midpoint at t = 0.5, so the
  // control sits at twice the intended apex offset to make the curve's apex
  // land exactly `bulge * length` off the chord.
  const control = {
    x: (first.x + last.x) / 2 + (-dy / length) * (2 * bulge * length),
    y: (first.y + last.y) / 2 + (dx / length) * (2 * bulge * length),
  };
  const commands: PathCommand[] = [
    { kind: "M", x: first.x, y: first.y },
    { kind: "Q", x1: control.x, y1: control.y, x: last.x, y: last.y },
  ];
  return withEnds(flattenPath(commands), first, last);
}

/** Pin a sampled polyline's ends back onto the exact routed endpoints. */
function withEnds(sampled: Point[], first: Point, last: Point): Point[] {
  if (sampled.length < 2) return [first, last];
  const out = [...sampled];
  out[0] = first;
  out[out.length - 1] = last;
  return out;
}

/** How far back from a corner a spline starts to turn when none is asked for, in px. */
const SPLINE_RADIUS = 16;

/**
 * Round the corners of a routed polyline, keeping its straight runs straight.
 *
 * A graph route from ELK is orthogonal, and the corners are the only place a
 * curve belongs: bending the straight runs too would make the edge wander away
 * from the lane ELK reserved for it, and into whatever is beside that lane.
 *
 * Each corner is replaced by a quadratic whose control point IS the corner, so
 * the curve is tangent to both runs and stays inside the corner's own elbow.
 * The fillet is clamped to half of each adjacent run, which is what keeps two
 * corners on a short segment from overrunning each other and cusping — the
 * defect that a midpoint-control spline produces on exactly this input.
 */
function roundCorners(points: Point[], radius: number): PathCommand[] {
  const commands: PathCommand[] = [{ kind: "M", x: points[0]!.x, y: points[0]!.y }];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const corner = points[i]!;
    const next = points[i + 1]!;

    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (inLen === 0 || outLen === 0) continue;

    const r = Math.min(radius, inLen / 2, outLen / 2);
    const enter = {
      x: corner.x + ((prev.x - corner.x) / inLen) * r,
      y: corner.y + ((prev.y - corner.y) / inLen) * r,
    };
    const leave = {
      x: corner.x + ((next.x - corner.x) / outLen) * r,
      y: corner.y + ((next.y - corner.y) / outLen) * r,
    };

    commands.push({ kind: "L", x: enter.x, y: enter.y });
    commands.push({ kind: "Q", x1: corner.x, y1: corner.y, x: leave.x, y: leave.y });
  }

  const end = points[points.length - 1]!;
  commands.push({ kind: "L", x: end.x, y: end.y });
  return commands;
}
