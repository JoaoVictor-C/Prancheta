/**
 * Attaching `shape` to a figure that has already been laid out.
 *
 * Same pattern as colour/apply.ts's `categoryGroup`, for the same reason:
 * `shape` never changes layout -- the mirror lays out a plain rectangular
 * div regardless of which shape a block asked for -- so it is not a measured
 * property, and it is carried directly from the spec onto the already-placed
 * figure, matched by id, after layout has finished.
 */

import type { Block, FigureNode, FigureSpec, LaidOutFigure } from "../ir/types.ts";
import type { ShapeKind } from "./shapes.ts";

/** Block id -> shape, for every block that declared one other than the "rect" default. */
export function collectShapes(spec: FigureSpec): Map<string, ShapeKind> {
  const shapes = new Map<string, ShapeKind>();
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
    if (block.shape !== undefined && block.shape !== "rect") shapes.set(id, block.shape);
  };

  visit(spec.root);
  return shapes;
}

export function attachShapes(figure: LaidOutFigure, spec: FigureSpec): LaidOutFigure {
  const shapes = collectShapes(spec);
  if (shapes.size === 0) return figure;

  const elements = figure.elements.map((element) => {
    if (element.kind !== "box") return element;
    const shape = shapes.get(element.id);
    return shape === undefined ? element : { ...element, shape };
  });

  return { ...figure, elements };
}
