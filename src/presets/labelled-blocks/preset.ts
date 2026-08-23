/**
 * labelled-blocks — the plain case, and it must stay reachable.
 *
 * "Just show me the three inputs and the one output" should not escalate into
 * a graph. Half of selection's job is refusing to over-draw.
 */

import type { Block, FigureSpec, Stack } from "../../ir/types.ts";
import type { BlockRole } from "../../ir/types.ts";

export type LabelledBlocksInput = {
  title?: string;
  items: { id?: string; label: string; role?: BlockRole }[];
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
