/**
 * Non-rectangular block shapes (M5 stage 3): the geometry, kept apart from
 * drawing it.
 *
 * The reason this is cheap rather than architecturally deep is that every
 * shape here shares its BLOCK's axis-aligned bounding box exactly. The
 * mirror keeps laying out a plain rectangular div -- Chromium never learns a
 * shape exists -- so every existing check that reasons about boxes
 * (text-fits-box, boxes-do-not-overlap, content-within-canvas) keeps working
 * completely unchanged. What is new is a second, finer question this module
 * answers: given a point relative to that same bounding box, is it actually
 * INSIDE the shape drawn there, not just inside the box around it. That is
 * what `label-within-shape` (checks.ts) needs and a rectangle's own bounding
 * box cannot answer for anything that is not a rectangle.
 *
 * Every function takes the bounding `Rect` a shape is inscribed in and
 * answers containment analytically -- no path sampling, no approximation --
 * so a check built on this is exact, not probabilistic.
 */

import type { Point, Rect } from "../ir/types.ts";

export type ShapeKind = "rect" | "circle" | "ellipse" | "diamond" | "hexagon" | "stadium" | "triangle";

export const SHAPE_KINDS: readonly ShapeKind[] = [
  "rect",
  "circle",
  "ellipse",
  "diamond",
  "hexagon",
  "stadium",
  "triangle",
];

/** True when `point` lies inside `shape`, inscribed in bounding box `box`. */
export function containsPoint(shape: ShapeKind, box: Rect, point: Point): boolean {
  switch (shape) {
    case "rect":
      return (
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height
      );
    case "circle":
      return inEllipse(box, point, minRadius(box), minRadius(box));
    case "ellipse":
      return inEllipse(box, point, box.width / 2, box.height / 2);
    case "diamond":
      return inDiamond(box, point);
    case "hexagon":
      return inPolygon(hexagonVertices(box), point);
    case "stadium":
      return inStadium(box, point);
    case "triangle":
      return inPolygon(triangleVertices(box), point);
    default: {
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}

/**
 * "circle" is inscribed at the SMALLER of the box's two dimensions, centred
 * -- a true circle even in a non-square box, with the remaining space empty.
 * "ellipse" instead hugs the full box on both axes. Distinct on purpose: a
 * spec author choosing "circle" over "ellipse" in a wide box is asking for
 * that distinction, not a synonym.
 */
function minRadius(box: Rect): number {
  return Math.min(box.width, box.height) / 2;
}

function inEllipse(box: Rect, point: Point, rx: number, ry: number): boolean {
  if (rx <= 0 || ry <= 0) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const nx = (point.x - cx) / rx;
  const ny = (point.y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function inDiamond(box: Rect, point: Point): boolean {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  if (halfW <= 0 || halfH <= 0) return false;
  return Math.abs(point.x - cx) / halfW + Math.abs(point.y - cy) / halfH <= 1;
}

/**
 * Analytic vertices for shapes drawable as a polygon. Allows rendering the
 * shape in SVG (render/svg.ts) and point-in-polygon containment testing above.
 */
export function shapeVertices(shape: ShapeKind, box: Rect): Point[] | null {
  switch (shape) {
    case "diamond":
      return diamondVertices(box);
    case "hexagon":
      return hexagonVertices(box);
    case "triangle":
      return triangleVertices(box);
    default:
      return null;
  }
}

export function diamondVertices(box: Rect): Point[] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return [
    { x: cx, y: box.y },
    { x: box.x + box.width, y: cy },
    { x: cx, y: box.y + box.height },
    { x: box.x, y: cy },
  ];
}

/**
 * A flat-topped, elongated hexagon: two vertical sides, four angled corner
 * cuts -- the conventional diagram hexagon (BPMN, flowcharts), not the
 * regular (all-sides-equal) polygon a mathematician would default to. The
 * corner cut is a quarter of the box width on each side.
 */
export function hexagonVertices(box: Rect): Point[] {
  const cut = box.width * 0.25;
  const cy = box.y + box.height / 2;
  return [
    { x: box.x + cut, y: box.y },
    { x: box.x + box.width - cut, y: box.y },
    { x: box.x + box.width, y: cy },
    { x: box.x + box.width - cut, y: box.y + box.height },
    { x: box.x + cut, y: box.y + box.height },
    { x: box.x, y: cy },
  ];
}

/** Standard ray-casting point-in-polygon, for hexagon's six vertices. */
function inPolygon(vertices: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const a = vertices[i]!;
    const b = vertices[j]!;
    const crosses = a.y > point.y !== b.y > point.y;
    if (!crosses) continue;
    const xAtY = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < xAtY) inside = !inside;
  }
  return inside;
}

/**
 * A rectangle with fully rounded ends -- radius is half the shorter side, so
 * a stadium in a near-square box degrades gracefully toward a circle rather
 * than producing a self-intersecting shape.
 */
export function stadiumRadius(box: Rect): number {
  return Math.min(box.width, box.height) / 2;
}

function inStadium(box: Rect, point: Point): boolean {
  const r = stadiumRadius(box);
  if (r <= 0) return false;
  const cy = box.y + box.height / 2;
  const horizontal = box.width >= box.height;

  if (horizontal) {
    const leftCentre = box.x + r;
    const rightCentre = box.x + box.width - r;
    if (point.x >= leftCentre && point.x <= rightCentre) {
      return point.y >= box.y && point.y <= box.y + box.height;
    }
    const capCentreX = point.x < leftCentre ? leftCentre : rightCentre;
    return inEllipse({ x: capCentreX - r, y: cy - r, width: r * 2, height: r * 2 }, point, r, r);
  }
  const cx = box.x + box.width / 2;
  const topCentre = box.y + r;
  const bottomCentre = box.y + box.height - r;
  if (point.y >= topCentre && point.y <= bottomCentre) {
    return point.x >= box.x && point.x <= box.x + box.width;
  }
  const capCentreY = point.y < topCentre ? topCentre : bottomCentre;
  return inEllipse({ x: cx - r, y: capCentreY - r, width: r * 2, height: r * 2 }, point, r, r);
}

/** Upward-pointing triangle inscribed in the bounding box. */
export function triangleVertices(box: Rect): Point[] {
  const cx = box.x + box.width / 2;
  return [
    { x: cx, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}
