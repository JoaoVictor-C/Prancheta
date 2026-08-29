/**
 * labelled-blocks — the plain case, and it must stay reachable.
 *
 * "Just show me the three inputs and the one output" should not escalate into
 * a graph. Half of selection's job is refusing to over-draw.
 */

import type { Block, FigureSpec, Stack } from "../../ir/types.ts";
import type { BlockRole } from "../../ir/types.ts";
import * as v from "../validate.ts";
import { SHAPE_KINDS } from "../../geometry/shapes.ts";
import type { ShapeKind } from "../../geometry/shapes.ts";

export type LabelledBlocksInput = {
  title?: string;
  items: { id?: string; label: string; role?: BlockRole; shape?: ShapeKind }[];
  direction?: "row" | "column";
  width?: number;
  gap?: number;
};

export function expandLabelledBlocks(input: LabelledBlocksInput): FigureSpec {
  const children: Block[] = input.items.map((item, index) => ({
    type: "block",
    id: item.id ?? `item-${index + 1}`,
    label: item.label,
    role: item.role ?? "default",
    ...(item.shape === undefined ? {} : { shape: item.shape }),
    width: input.width ?? 320,
  }));

  const root: Stack = {
    type: "stack",
    id: "items",
    direction: input.direction ?? "column",
    gap: input.gap ?? 16,
    align: "stretch",
    children,
  };

  return { version: 1, title: input.title, root };
}

/** Preconditions expandLabelledBlocks relies on. See src/presets/validate.ts. */
export function validateLabelledBlocksInput(
  input: Record<string, unknown>,
  path = "labelled-blocks",
): void {
  v.optionalString(input, "title", path);
  v.optionalEnum(input, "direction", path, ["row", "column"] as const);
  v.optionalNumber(input, "width", path);
  v.optionalNumber(input, "gap", path);

  const items = v.nonEmptyArray(input, "items", path, "items");
  const ids: { id: string; at: string }[] = [];
  for (const [i, raw] of items.entries()) {
    const at = `${path}.items[${i}]`;
    const item = v.object(raw, at);
    v.requiredString(item, "label", at);
    v.optionalEnum(item, "role", at, v.ROLES);
    v.optionalEnum(item, "shape", at, SHAPE_KINDS);
    const id = v.optionalString(item, "id", at);
    if (id !== undefined) ids.push({ id, at });
  }
  v.unique(ids, "item");
}
