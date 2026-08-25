/**
 * Attaching motion windows to a figure that has already been laid out
 * (ADR 0015).
 *
 * Same shape as colour/apply.ts and geometry/apply.ts, and for the same
 * reason: a motion window changes nothing about layout. It says *when* an
 * element moves during a transition, which is a fact about a pair of states,
 * not about either one of them — so routing it through the HTML mirror and
 * back out through getComputedStyle would be measuring something Chromium was
 * never asked to render. It is carried straight from the spec onto the placed
 * figure, matched by id, after layout has finished.
 *
 * Consequently a static render is completely unaffected by it, which is the
 * property that lets `motion` sit on a Block without every other check having
 * to learn about it.
 */

import type { Block, FigureNode, FigureSpec, LaidOutFigure, MotionWindow } from "../ir/types.ts";

/** Block id -> motion window, for every block that declared one. */
export function collectMotionWindows(spec: FigureSpec): Map<string, MotionWindow> {
  const windows = new Map<string, MotionWindow>();
  let counter = 0;

  const visit = (node: FigureNode): void => {
    counter += 1;
    const id = node.id ?? `${node.type}-${counter}`;
    if (node.type === "stack" || node.type === "scene") {
      node.children.forEach(visit as (child: FigureNode) => void);
      return;
    }
    const block = node as Block;
    if (block.motion !== undefined) windows.set(id, block.motion);
  };

  visit(spec.root);
  return windows;
}

export function attachMotionWindows(figure: LaidOutFigure, spec: FigureSpec): LaidOutFigure {
  const windows = collectMotionWindows(spec);
  if (windows.size === 0) return figure;

  const elements = figure.elements.map((element) => {
    if (element.kind !== "box") return element;
    const motion = windows.get(element.id);
    return motion === undefined ? element : { ...element, motion };
  });

  return { ...figure, elements };
}
