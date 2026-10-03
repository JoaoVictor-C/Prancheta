/**
 * construction extensions (ADR 0067): the pure geometry of sectors, rings,
 * belts, semicircles, boundary regions, direction arrows and dimension lines.
 *
 * Everything here is a function of already-computed points and radii -- no
 * frame, no locale, no typed measure. A shape is a closed chain of PIECES (a
 * straight line, or an arc about a centre by a signed angle); its outline is
 * sampled from them, and its area is Green's theorem over the same pieces, so
 * the number a label prints and the polygon the area check measures are two
 * evaluations of one definition. Exported so tests hold each of them against a
 * closed form without rendering.
 */

import * as vec from "../../geometry/vec.ts";
import type { Circle2, Vec2 } from "../../geometry/vec.ts";

export const TAU = 2 * Math.PI;

/** A piece of a closed outline: a straight run, or an arc about `c` from angle `a0` by `span` (signed, counter-clockwise positive). */
export type Piece = { kind: "line"; a: Vec2; b: Vec2 } | { kind: "arc"; c: Vec2; r: number; a0: number; span: number };

export const arcPoint = (c: Vec2, r: number, t: number): Vec2 => [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];

/** Where a piece starts and ends. */
export const pieceStart = (p: Piece): Vec2 => (p.kind === "line" ? p.a : arcPoint(p.c, p.r, p.a0));
export const pieceEnd = (p: Piece): Vec2 => (p.kind === "line" ? p.b : arcPoint(p.c, p.r, p.a0 + p.span));

/** Samples to an arc: at most 2° apart, so the chord is within 0,02 px of the arc at the sizes drawn. */
export function arcSamples(span: number): number {
  return Math.max(2, Math.ceil(Math.abs(span) / (Math.PI / 90)));
}

/** The arc's points, ends included. */
export function sampleArc(c: Vec2, r: number, a0: number, span: number): Vec2[] {
  const n = arcSamples(span);
  return Array.from({ length: n + 1 }, (_, k) => arcPoint(c, r, a0 + (span * k) / n));
}

/** A closed chain of pieces as a polygon: each piece's points, the shared joints once, the closing point dropped. */
export function samplePieces(pieces: Piece[]): Vec2[] {
  const out: Vec2[] = [];
  for (const piece of pieces) {
    const pts = piece.kind === "line" ? [piece.a, piece.b] : sampleArc(piece.c, piece.r, piece.a0, piece.span);
    pts.forEach((p, i) => {
      if (i === 0 && out.length > 0) return; // the joint was the previous piece's last point
      out.push(p);
    });
  }
  if (out.length > 1 && vec.approxEqual(out[0]!, out[out.length - 1]!, 1e-9)) out.pop();
  return out;
}

/**
 * The area a closed chain of pieces encloses, exactly: ½∮(x dy − y dx), a line
 * contributing ½(x₁y₂ − x₂y₁) and an arc ½[r²Δθ + cₓ r(sin θ₁ − sin θ₀) − c_y r(cos θ₁ − cos θ₀)].
 */
export function piecesArea(pieces: Piece[]): number {
  let twice = 0;
  for (const p of pieces) {
    if (p.kind === "line") {
      twice += p.a[0] * p.b[1] - p.b[0] * p.a[1];
    } else {
      const t1 = p.a0 + p.span;
      twice += p.r * p.r * p.span + p.c[0] * p.r * (Math.sin(t1) - Math.sin(p.a0)) - p.c[1] * p.r * (Math.cos(t1) - Math.cos(p.a0));
    }
  }
  return Math.abs(twice) / 2;
}

/** The arc length of every arc piece in a chain. */
export function piecesArcLength(pieces: Piece[]): number {
  return pieces.reduce((s, p) => s + (p.kind === "arc" ? p.r * Math.abs(p.span) : 0), 0);
}

/** Is the chain closed -- does each piece begin where the one before it ended, and the last where the first began? */
export function chainGap(pieces: Piece[]): number {
  let worst = 0;
  pieces.forEach((p, i) => {
    const next = pieces[(i + 1) % pieces.length]!;
    worst = Math.max(worst, vec.distance(pieceEnd(p), pieceStart(next)));
  });
  return worst;
}

// ---- sector, ring, semicircle ---------------------------------------------------

/** A circular sector: its two radii and its arc, closed. `span` is positive (a clockwise sector is described from its other radius). */
export function sectorPieces(c: Vec2, r: number, a0: number, span: number): Piece[] {
  const p0 = arcPoint(c, r, a0);
  const p1 = arcPoint(c, r, a0 + span);
  return [
    { kind: "line", a: c, b: p0 },
    { kind: "arc", c, r, a0, span },
    { kind: "line", a: p1, b: c },
  ];
}

/** The annular sector between radii `rIn` < `rOut` over `span` from `a0`: outer arc, a radial side, inner arc back, the other radial side. */
export function annularSectorPieces(c: Vec2, rIn: number, rOut: number, a0: number, span: number): Piece[] {
  return [
    { kind: "arc", c, r: rOut, a0, span },
    { kind: "line", a: arcPoint(c, rOut, a0 + span), b: arcPoint(c, rIn, a0 + span) },
    { kind: "arc", c, r: rIn, a0: a0 + span, span: -span },
    { kind: "line", a: arcPoint(c, rIn, a0), b: arcPoint(c, rOut, a0) },
  ];
}

/** A full ring as ONE outline: the outer circle, a hairline bridge in, the inner circle the other way round, the bridge back. Its shoelace area is πR² − πr². */
export function ringOutline(c: Vec2, rIn: number, rOut: number, bridgeAngle = 0): Vec2[] {
  const outer = sampleArc(c, rOut, bridgeAngle, TAU);
  const inner = sampleArc(c, rIn, bridgeAngle, -TAU);
  // outer: starts and ends at the bridge point; inner: likewise, reversed. Closing returns to the outer start.
  return [...outer.slice(0, -1), outer[outer.length - 1]!, ...inner.slice(0, -1), inner[inner.length - 1]!];
}

/** The half-disc on segment AB as a diameter, bulging to the left (`side` +1) or right (-1) of A→B. */
export function semicirclePieces(a: Vec2, b: Vec2, side: 1 | -1): { pieces: Piece[]; centre: Vec2; r: number } {
  const centre = vec.lerp(a, b, 0.5);
  const r = vec.distance(a, b) / 2;
  const psi = Math.atan2(b[1] - a[1], b[0] - a[0]);
  // From B counter-clockwise by 180° passes the left normal; from A counter-clockwise by 180° passes the right one.
  const start = side > 0 ? b : a;
  const end = side > 0 ? a : b;
  return { pieces: [{ kind: "arc", c: centre, r, a0: side > 0 ? psi : psi + Math.PI, span: Math.PI }, { kind: "line", a: end, b: start }], centre, r };
}

// ---- belt ------------------------------------------------------------------------

export type BeltGeometry = {
  /** The two straight runs, each as [point on circle 1, point on circle 2]. */
  tangents: [[Vec2, Vec2], [Vec2, Vec2]];
  /** The wrapped arcs, one on each circle. */
  arcs: [Extract<Piece, { kind: "arc" }>, Extract<Piece, { kind: "arc" }>];
  /** The straight length of one tangent segment. */
  tangentLength: number;
  /** The whole belt: both tangent segments and both wrapped arcs. */
  length: number;
  /** The half-angle φ at the centres between the line of centres and the radius to a tangent point. */
  phi: number;
};

/**
 * The belt around two circles, from the circles alone.
 *
 * External: the radii to the tangent points make cos φ = (r₁ − r₂)/d with the
 * line of centres; each tangent segment is √(d² − (r₁ − r₂)²) long and the
 * belt wraps 2π − 2φ of circle 1 and 2φ of circle 2. Crossed: cos φ =
 * (r₁ + r₂)/d, the segments √(d² − (r₁ + r₂)²), and each circle is wrapped
 * through 2π − 2φ.
 */
export function beltGeometry(c1: Circle2, c2: Circle2, mode: "external" | "crossed"): BeltGeometry {
  const d = vec.distance(c1.center, c2.center);
  const base = Math.atan2(c2.center[1] - c1.center[1], c2.center[0] - c1.center[0]);
  const phi = Math.acos((mode === "external" ? c1.radius - c2.radius : c1.radius + c2.radius) / d);
  const tangentLength = Math.sqrt(d * d - (mode === "external" ? (c1.radius - c2.radius) ** 2 : (c1.radius + c2.radius) ** 2));
  const up = base + phi; // normal of the first tangent, from circle 1's centre
  const down = base - phi;
  const r2 = mode === "external" ? c2.radius : -c2.radius;
  const t1: [Vec2, Vec2] = [arcPoint(c1.center, c1.radius, up), arcPoint(c2.center, r2, up)];
  const t2: [Vec2, Vec2] = [arcPoint(c1.center, c1.radius, down), arcPoint(c2.center, r2, down)];
  // Circle 1 is wrapped on the side away from circle 2: from `up` the long way round to `down`.
  const arc1 = { kind: "arc" as const, c: c1.center, r: c1.radius, a0: up, span: TAU - 2 * phi };
  const arc2 =
    mode === "external"
      ? { kind: "arc" as const, c: c2.center, r: c2.radius, a0: down, span: 2 * phi }
      : { kind: "arc" as const, c: c2.center, r: c2.radius, a0: up + Math.PI, span: TAU - 2 * phi };
  const length = 2 * tangentLength + c1.radius * arc1.span + c2.radius * arc2.span;
  return { tangents: [t1, t2], arcs: [arc1, arc2], tangentLength, length, phi };
}

// ---- hatching -----------------------------------------------------------------------

type P2 = { x: number; y: number };

/**
 * Parallel hatch lines `gap` apart at `angleDeg`, clipped to a closed polygon
 * by the even-odd rule -- the lines of a hatch are the polygon's own scan
 * lines, so a hole (a ring's inner disc) is left bare. Works in whatever space
 * `poly` is in; the presets pass canvas pixels so `gap` is a pixel gap.
 */
export function hatchLines(poly: P2[], angleDeg: number, gap: number): [P2, P2][] {
  const t = (angleDeg * Math.PI) / 180;
  const d = { x: Math.cos(t), y: -Math.sin(t) }; // up-right in canvas space for a positive angle
  const n = { x: -d.y, y: d.x };
  const s = poly.map((p) => p.x * n.x + p.y * n.y);
  const lo = Math.min(...s);
  const hi = Math.max(...s);
  const out: [P2, P2][] = [];
  // Offset by an irrational fraction of a gap so no scan line runs through a vertex.
  for (let k = Math.ceil((lo - 0.318) / gap); ; k += 1) {
    const level = k * gap + 0.318;
    if (level > hi) break;
    const hits: number[] = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const sa = s[i]!;
      const sb = s[(i + 1) % poly.length]!;
      if (sa <= level === sb <= level) continue;
      const f = (level - sa) / (sb - sa);
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      hits.push(p.x * d.x + p.y * d.y);
    }
    hits.sort((p, q) => p - q);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const u0 = hits[i]!;
      const u1 = hits[i + 1]!;
      if (u1 - u0 < 2) continue;
      out.push([
        { x: n.x * level + d.x * u0, y: n.y * level + d.y * u0 },
        { x: n.x * level + d.x * u1, y: n.y * level + d.y * u1 },
      ]);
    }
  }
  return out;
}

// ---- arrowheads and dimension lines -----------------------------------------------------

/** A solid arrowhead: the triangle whose tip is `tip` and whose axis points along `dir` (a unit vector in canvas space). */
export function arrowHead(tip: P2, dir: P2, length = 10, halfWidth = 3.6): P2[] {
  const n = { x: -dir.y, y: dir.x };
  const base = { x: tip.x - dir.x * length, y: tip.y - dir.y * length };
  return [tip, { x: base.x + n.x * halfWidth, y: base.y + n.y * halfWidth }, { x: base.x - n.x * halfWidth, y: base.y - n.y * halfWidth }];
}

/**
 * A dimension line in plan coordinates: the run parallel to AB at `offset`
 * along its left normal (`side` +1) or right (-1), the same length as AB, with
 * the two extension lines that reach from just off the measured points to just
 * past it. Distances are in plan units; the caller turns the architectural
 * gap and overshoot into units for the scale it drew at.
 */
export function dimensionGeometry(a: Vec2, b: Vec2, offset: number, side: 1 | -1, gap: number, overshoot: number): { line: [Vec2, Vec2]; extensions: [Vec2, Vec2][]; normal: Vec2 } {
  const u = vec.normalize(vec.sub(b, a));
  const normal: Vec2 = [-u[1] * side, u[0] * side];
  const along = (p: Vec2, k: number): Vec2 => [p[0] + normal[0] * k, p[1] + normal[1] * k];
  return {
    line: [along(a, offset), along(b, offset)],
    extensions: [
      [along(a, gap), along(a, offset + overshoot)],
      [along(b, gap), along(b, offset + overshoot)],
    ],
    normal,
  };
}

/** Where along a run a path's direction arrow sits, so it never lands on a joint or a label's usual spot. */
export const ARROW_AT = 0.5;
