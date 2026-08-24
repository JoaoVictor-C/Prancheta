/**
 * Attaching `fill`/`stroke` gradients and per-side `border` to a figure that
 * has already been laid out.
 *
 * Same pattern as geometry/apply.ts's `shape` and colour/apply.ts's
 * `categoryGroup`: none of these ever change layout. A gradient fill paints
 * the same pixels a flat colour would have painted, and a per-side border's
 * WIDTH already reserved its own space in the mirror (html.ts emits it as
 * real per-side CSS so the browser's own box-sizing measures it), so only the
 * gradient/border *values themselves* are carried, unmeasured, from the spec
 * onto the already-placed figure, matched by id, after layout has finished --
 * the same "measure with it off, apply at emission" move the effects layer
 * makes for bleed.
 */

import type { Block, FigureNode, FigureSpec, Gradient, LaidOutFigure, PerSideBorder } from "../ir/types.ts";

type PaintEntry = { fillPaint?: Gradient; strokePaint?: Gradient; border?: PerSideBorder };

/** Block id -> gradient paint / per-side border, for every block that declared one. */
export function collectPaints(spec: FigureSpec): Map<string, PaintEntry> {
  const paints = new Map<string, PaintEntry>();
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
    const entry: PaintEntry = {};
    if (typeof block.fill === "object") entry.fillPaint = block.fill;
    if (typeof block.stroke === "object") entry.strokePaint = block.stroke;
    if (block.border !== undefined) entry.border = block.border;
    if (entry.fillPaint !== undefined || entry.strokePaint !== undefined || entry.border !== undefined) {
      paints.set(id, entry);
    }
  };

  visit(spec.root);
  return paints;
}

export function attachPaints(figure: LaidOutFigure, spec: FigureSpec): LaidOutFigure {
  const paints = collectPaints(spec);
  if (paints.size === 0) return figure;

  const elements = figure.elements.map((element) => {
    if (element.kind !== "box") return element;
    const entry = paints.get(element.id);
    return entry === undefined ? element : { ...element, ...entry };
  });

  return { ...figure, elements };
}
