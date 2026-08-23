/**
 * annotated-figure — a scene with callouts on leader lines.
 *
 * This is the figure class the survey found nobody serves: a shape, a
 * cross-section, a photograph's worth of structure, with labels pinned to
 * specific places on it. Every competitor ships whiteboard-and-architecture
 * genres; this is the one that needs a real coordinate system.
 *
 * Callouts carry no fill or border of their own — they sit ON the figure, and a
 * boxed label floating over a diagram reads as a sticky note. The leader line
 * does the pointing, so the label does not have to.
 */

import type { Block, Connector, FigureSpec, Point, Scene } from "../../ir/types.ts";
import type { BlockRole } from "../../ir/types.ts";
import { typeScale } from "../../theme.ts";

export type AnnotatedFigureInput = {
  title?: string;
  /** Canvas the callouts are positioned within. */
  width: number;
  height: number;
  /** Shapes making up the figure itself. */
  parts?: {
    id: string;
    label?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    role?: BlockRole;
    radius?: number;
  }[];
  /** Labels pinned to a point, joined to it by a leader line. */
  callouts: {
    id?: string;
    text: string;
    /** Where the label sits. */
    at: Point;
    /** What it points at — a part id, or a bare coordinate on the figure. */
    points: string | Point;
    width?: number;
  }[];
};

export function expandAnnotatedFigure(input: AnnotatedFigureInput): FigureSpec {
  const children: Block[] = [];
  const connectors: Connector[] = [];

  for (const part of input.parts ?? []) {
    children.push({
      type: "block",
      id: part.id,
      label: part.label,
      role: part.role ?? "default",
      x: part.x,
      y: part.y,
      width: part.width,
      height: part.height,
      radius: part.radius,
      textAlign: "center",
    });
  }

  input.callouts.forEach((callout, index) => {
    const id = callout.id ?? `callout-${index + 1}`;
    children.push({
      type: "block",
      id,
      label: callout.text,
      role: "callout",
      x: callout.at.x,
      y: callout.at.y,
      width: callout.width ?? 170,
      // No border, no padding: the leader line is the pointer, the label is
      // just words on the figure.
      strokeWidth: 0,
      padding: 0,
      fontSize: typeScale.annotation,
    });
    connectors.push({
      id: `${id}--leader`,
      from: id,
      to: callout.points,
      arrow: "end",
    });
  });

  const scene: Scene = {
    type: "scene",
    id: "figure",
    layout: "absolute",
    width: input.width,
    height: input.height,
    children,
    connectors,
  };

  return { version: 1, title: input.title, root: scene };
}
