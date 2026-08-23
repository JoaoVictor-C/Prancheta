/**
 * Rotated text (M5 stage 3, step 16): the geometry, kept apart from drawing
 * it -- the same split shapes.ts made for non-rect shapes.
 *
 * The mirror never rotates anything: measurement (layout/measure.ts) reads
 * back each wrapped line's box exactly as CSS laid it out, unrotated. This
 * module is what turns that unrotated measurement into the truth once a
 * block declares a `rotation` -- it rotates every corner of every line's box
 * analytically around the label's own centre and takes the axis-aligned
 * bounding rect of the result, exact arithmetic rather than a browser
 * re-measuring transformed glyphs. render/svg.ts then draws the same
 * unrotated glyphs under an SVG `rotate()` transform around that identical
 * centre, so the box every check reasons about is the box that actually gets
 * drawn -- the same "measure with it off, apply at emission" move the
 * effects layer already makes for bleed.
 */

import type { Block, FigureNode, FigureSpec, LaidOutFigure, Point, Rect } from "../ir/types.ts";
import { unionRects } from "../effects/bleed.ts";

/** Block id -> rotation in degrees, for every block that declared a nonzero one. */
export function collectRotations(spec: FigureSpec): Map<string, number> {
  const rotations = new Map<string, number>();
  let counter = 0;

  const visit = (node: FigureNode): void => {
    counter += 1;
    const id = node.id ?? `${node.type}-${counter}`;
    if (node.type === "stack") {
      node.children.forEach(visit);
      return;
    }
    if (node.type === "scene") {
      node.children.forEach(visit);
      return;
    }
    const block = node as Block;
    if (block.rotation !== undefined && block.rotation % 360 !== 0) rotations.set(id, block.rotation);
  };

  visit(spec.root);
  return rotations;
}

/** Rotates `point` by `degrees` clockwise around `centre`. */
export function rotatePoint(point: Point, centre: Point, degrees: number): Point {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return {
    x: centre.x + dx * cos - dy * sin,
    y: centre.y + dx * sin + dy * cos,
  };
}

/** The axis-aligned bounding rect of `rect` after rotating it `degrees` clockwise around `centre`. */
export function rotatedBounds(rect: Rect, centre: Point, degrees: number): Rect {
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ].map((corner) => rotatePoint(corner, centre, degrees));

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function attachRotations(figure: LaidOutFigure, spec: FigureSpec): LaidOutFigure {
  const rotations = collectRotations(spec);
  if (rotations.size === 0) return figure;

  const elements = figure.elements.map((element) => {
    if (element.kind !== "text" || element.ownerId === null) return element;
    const degrees = rotations.get(element.ownerId);
    if (degrees === undefined) return element;

    const centre = rectCentre(unionRects(element.lines.map((line) => line.box)));
    const lines = element.lines.map((line) => ({
      ...line,
      box: rotatedBounds(line.box, centre, degrees),
    }));
    return { ...element, lines, rotation: degrees, rotationCenter: centre };
  });

  return { ...figure, elements };
}

function rectCentre(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
