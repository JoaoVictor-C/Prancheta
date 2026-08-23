/**
 * Path commands, and flattening them into the polylines connectors are made of.
 *
 * The IR itself has no path primitive: a curved connector is authored as a
 * `ConnectorCurve` and lands as a polyline (see `curveRoute`). These commands
 * are the intermediate form — the shape is expressed exactly once, as curves,
 * and sampled exactly once, here.
 */

export type PathCommand =
  | { kind: "M"; x: number; y: number } // Move to
  | { kind: "L"; x: number; y: number } // Line to
  | { kind: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number } // Cubic bezier
  | { kind: "Q"; x1: number; y1: number; x: number; y: number } // Quadratic bezier
  | { kind: "A"; rx: number; ry: number; rotation: number; largeArc: boolean; sweep: boolean; x: number; y: number } // Arc
  | { kind: "Z" }; // Close path

/**
 * How far the sampled polyline may sit from the true curve, in px.
 *
 * Every check tolerates a half-pixel EPSILON, so a sampling error anywhere
 * near that would let a curve fail or pass a check on the strength of the
 * sampling rather than of the geometry. A tenth of it is the margin.
 */
export const FLATTEN_TOLERANCE = 0.05;

/**
 * Subdivision depth cap, so a pathological input costs a bounded number of
 * points rather than an unbounded one. 2^10 segments per curve is far past
 * what the tolerance asks for at any size a figure is drawn at; reaching it
 * means the curve is degenerate, not that it needed the detail.
 */
const MAX_DEPTH = 10;

/**
 * Sample a path into a polyline.
 *
 * Connectors are checked through their `points` — `connector-clear-of-boxes`
 * walks that polyline, and the ink bounds are its extent. So a curved
 * connector is flattened here at layout time and the renderer emits these
 * same coordinates, which makes the geometry that was checked identical to
 * the geometry that is drawn. Emitting a real `C` command while checking its
 * chord would let a curve bow through a box the check had just cleared.
 *
 * Sampling is adaptive rather than a fixed number of segments per curve. A
 * fixed count is wrong in both directions: it spends the same points on a
 * barely-bowed arc as on a hairpin, and on a large enough curve it silently
 * stops meeting the tolerance it claims. Here `tolerance` is the guarantee —
 * subdivision continues until the flatness bound is under it — so the error
 * is a property of the output rather than of how big the figure happened to
 * be.
 */
export function flattenPath(
  commands: PathCommand[],
  tolerance = FLATTEN_TOLERANCE,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let cursor = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  const tol = Math.max(tolerance, 1e-6);

  const push = (p: { x: number; y: number }) => {
    const last = out[out.length - 1];
    // Consecutive duplicates would be zero-length segments: harmless to draw,
    // but they make the arrowhead's direction undefined at the tip.
    if (last === undefined || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) {
      out.push(p);
    }
  };

  for (const cmd of commands) {
    switch (cmd.kind) {
      case "M":
        cursor = { x: cmd.x, y: cmd.y };
        start = cursor;
        push(cursor);
        break;
      case "L":
        cursor = { x: cmd.x, y: cmd.y };
        push(cursor);
        break;
      case "Q": {
        // A quadratic is the cubic whose controls sit two thirds of the way
        // from each end towards it, so one subdivision routine serves both.
        const p0 = cursor;
        flattenCubic(
          p0,
          { x: p0.x + (2 / 3) * (cmd.x1 - p0.x), y: p0.y + (2 / 3) * (cmd.y1 - p0.y) },
          { x: cmd.x + (2 / 3) * (cmd.x1 - cmd.x), y: cmd.y + (2 / 3) * (cmd.y1 - cmd.y) },
          { x: cmd.x, y: cmd.y },
          tol,
          0,
          push,
        );
        cursor = { x: cmd.x, y: cmd.y };
        break;
      }
      case "C": {
        const p0 = cursor;
        flattenCubic(
          p0,
          { x: cmd.x1, y: cmd.y1 },
          { x: cmd.x2, y: cmd.y2 },
          { x: cmd.x, y: cmd.y },
          tol,
          0,
          push,
        );
        cursor = { x: cmd.x, y: cmd.y };
        break;
      }
      case "A": {
        // Endpoint-parameterised arc, converted to centre form (SVG 2 F.6.5).
        const p0 = cursor;
        const end = { x: cmd.x, y: cmd.y };
        const phi = (cmd.rotation * Math.PI) / 180;
        const cosP = Math.cos(phi);
        const sinP = Math.sin(phi);
        const dx2 = (p0.x - end.x) / 2;
        const dy2 = (p0.y - end.y) / 2;
        const x1p = cosP * dx2 + sinP * dy2;
        const y1p = -sinP * dx2 + cosP * dy2;
        let rx = Math.abs(cmd.rx);
        let ry = Math.abs(cmd.ry);
        // A radius too small to reach both endpoints is scaled up until it can,
        // which is what SVG itself does rather than dropping the arc.
        const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
        if (lambda > 1) {
          const s = Math.sqrt(lambda);
          rx *= s;
          ry *= s;
        }
        const sign = cmd.largeArc === cmd.sweep ? -1 : 1;
        const num = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p);
        const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
        const coef = den === 0 ? 0 : sign * Math.sqrt(num / den);
        const cxp = (coef * rx * y1p) / ry;
        const cyp = (-coef * ry * x1p) / rx;
        const cx = cosP * cxp - sinP * cyp + (p0.x + end.x) / 2;
        const cy = sinP * cxp + cosP * cyp + (p0.y + end.y) / 2;
        const angle = (ux: number, uy: number, vx: number, vy: number) => {
          const dot = ux * vx + uy * vy;
          const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
          const a = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)));
          return ux * vy - uy * vx < 0 ? -a : a;
        };
        const theta0 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
        let sweepAngle = angle(
          (x1p - cxp) / rx, (y1p - cyp) / ry,
          (-x1p - cxp) / rx, (-y1p - cyp) / ry,
        );
        if (!cmd.sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
        if (cmd.sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;
        // A chord subtending `step` on radius r sits r·(1 − cos(step/2)) inside
        // the arc, so the step the tolerance allows follows directly. The
        // larger radius is the one that has to satisfy it.
        const r = Math.max(rx, ry);
        const step = r <= tol ? Math.PI : 2 * Math.acos(Math.min(1, Math.max(-1, 1 - tol / r)));
        const segments = Math.min(
          1 << MAX_DEPTH,
          Math.max(1, Math.ceil(Math.abs(sweepAngle) / step)),
        );
        for (let i = 1; i <= segments; i += 1) {
          const th = theta0 + (sweepAngle * i) / segments;
          const ex = rx * Math.cos(th);
          const ey = ry * Math.sin(th);
          push({ x: cosP * ex - sinP * ey + cx, y: sinP * ex + cosP * ey + cy });
        }
        cursor = end;
        break;
      }
      case "Z":
        push(start);
        cursor = start;
        break;
    }
  }

  return out;
}

/** Perpendicular distance from `p` to the infinite line through `a` and `b`. */
function distanceToLine(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  // Coincident endpoints describe no line to measure against — a curve that
  // returns to where it started. The distance to that point is the right
  // fallback: it is what tells subdivision the loop is not flat.
  if (length === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / length;
}

/**
 * Emit the sample points of one cubic, subdividing until it is flat enough.
 *
 * The flatness bound is the standard one: a cubic never leaves the chord
 * between its endpoints by more than three quarters of the furthest its own
 * control points do. That is an upper bound on the real deviation, so a curve
 * that passes it genuinely meets the tolerance — the estimate errs towards
 * more points, never fewer.
 *
 * The start point is not emitted: the previous command already did.
 */
function flattenCubic(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  tolerance: number,
  depth: number,
  emit: (p: { x: number; y: number }) => void,
): void {
  const deviation = 0.75 * Math.max(distanceToLine(p1, p0, p3), distanceToLine(p2, p0, p3));
  if (deviation <= tolerance || depth >= MAX_DEPTH) {
    emit(p3);
    return;
  }

  // de Casteljau at t = 0.5: exact, and it splits the curve into two whose
  // control polygons each sit about a quarter as far from their own chord, so
  // the bound above falls fast enough that the depth cap is never the reason
  // subdivision stops on real geometry.
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const centre = mid(p012, p123);

  flattenCubic(p0, p01, p012, centre, tolerance, depth + 1, emit);
  flattenCubic(centre, p123, p23, p3, tolerance, depth + 1, emit);
}
