/**
 * Attaching `categoryGroup` to a figure that has already been laid out.
 *
 * Same shape as effects/apply.ts and for the same reason: `categoryGroup` is
 * not a measured property -- nothing about it changes layout, and routing it
 * through the HTML mirror and back out through getComputedStyle would be
 * measuring a value that was never rendered as anything Chromium can see.
 * It is carried directly from the spec onto the already-placed figure,
 * matched by id, after layout has finished.
 */

import type { Block, FigureNode, FigureSpec, LaidOutFigure } from "../ir/types.ts";

/** Block id -> categoryGroup, for every block that declared one. */
export function collectCategoryGroups(spec: FigureSpec): Map<string, string> {
  const groups = new Map<string, string>();
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
    if (block.categoryGroup !== undefined) groups.set(id, block.categoryGroup);
  };

  visit(spec.root);
  return groups;
}

export function attachCategoryGroups(figure: LaidOutFigure, spec: FigureSpec): LaidOutFigure {
  const groups = collectCategoryGroups(spec);
  if (groups.size === 0) return figure;

  const elements = figure.elements.map((element) => {
    if (element.kind !== "box") return element;
    const categoryGroup = groups.get(element.id);
    return categoryGroup === undefined ? element : { ...element, categoryGroup };
  });

  return { ...figure, elements };
}
