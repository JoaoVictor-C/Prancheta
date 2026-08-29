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
import * as v from "../validate.ts";
import { SpecError } from "../../ir/types.ts";

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

/**
 * Preconditions expandAnnotatedFigure relies on.
 *
 * The interesting line in this whole layer runs through this preset, three
 * keys apart. A callout whose `points` names a part that was never declared is
 * OURS: a reference cannot be repaired into existence. A part declared taller
 * than the canvas is NOT: repair grows boxes and canvas padding for a living,
 * and refusing that here would turn a figure this project can fix into one it
 * refuses to draw. Statically knowable is not the test; statically knowable
 * AND beyond repair's reach is.
 */
export function validateAnnotatedFigureInput(
  input: Record<string, unknown>,
  path = "annotated-figure",
): void {
  v.optionalString(input, "title", path);
  v.requiredNumber(input, "width", path);
  v.requiredNumber(input, "height", path);

  const ids: { id: string; at: string }[] = [];
  if (input.parts !== undefined) {
    const parts = v.array(input, "parts", path, "parts");
    for (const [i, raw] of parts.entries()) {
      const at = `${path}.parts[${i}]`;
      const part = v.object(raw, at);
      ids.push({ id: v.requiredString(part, "id", at), at });
      v.optionalString(part, "label", at);
      v.requiredNumber(part, "x", at);
      v.requiredNumber(part, "y", at);
      v.requiredNumber(part, "width", at);
      v.requiredNumber(part, "height", at);
      v.optionalEnum(part, "role", at, v.ROLES);
      v.optionalNumber(part, "radius", at);
    }
    v.unique(ids, "part");
  }

  const declared = new Set(ids.map((entry) => entry.id));
  const callouts = v.nonEmptyArray(input, "callouts", path, "callouts");
  for (const [i, raw] of callouts.entries()) {
    const at = `${path}.callouts[${i}]`;
    const callout = v.object(raw, at);
    v.optionalString(callout, "id", at);
    v.requiredString(callout, "text", at);
    v.point(callout.at, `${at}.at`);
    v.optionalNumber(callout, "width", at);
    const points = callout.points;
    if (points === undefined) {
      throw new SpecError(
        `${at}.points is required: a part id, or a bare {x, y} on the figure. ` +
          `A callout with nothing to point at is a floating label, which this preset ` +
          `deliberately cannot draw.`,
      );
    }
    if (typeof points === "string") v.knownId(points, declared, `${at}.points`, "part");
    else v.point(points, `${at}.points`);
  }
}
