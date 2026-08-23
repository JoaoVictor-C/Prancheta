/**
 * mindmap — a single-rooted tree.
 *
 * Structurally the cheapest preset in the repertoire: the same ELK ingest as
 * `graph`, with a tree algorithm and edges derived from nesting instead of
 * listed by hand. The difficulty in a mindmap was never the rendering, it is
 * deciding what belongs in it — which is the author's problem, not ours.
 *
 * Depth carries meaning here, so it carries style: the root is primary, first
 * branches keep full contrast, everything deeper is muted. A mindmap where
 * every node shouts is a mindmap nobody can read.
 */

import type { Block, Connector, FigureSpec, Scene } from "../../ir/types.ts";
import type { BlockRole } from "../../ir/types.ts";

export type MindmapNode = {
  label: string;
  id?: string;
  children?: MindmapNode[];
};

export type MindmapInput = {
  title?: string;
  root: MindmapNode;
  /** "mrtree" lays out downward; "radial" spreads around the root. */
  shape?: "tree" | "radial";
  spacing?: number;
};

export function expandMindmap(input: MindmapInput): FigureSpec {
  const children: Block[] = [];
  const connectors: Connector[] = [];
  let counter = 0;

  const roleForDepth = (depth: number): BlockRole =>
    depth === 0 ? "primary" : depth === 1 ? "default" : "muted";

  const visit = (node: MindmapNode, depth: number, parentId: string | null): void => {
    counter += 1;
    const id = node.id ?? `node-${counter}`;
    children.push({
      type: "block",
      id,
      label: node.label,
      role: roleForDepth(depth),
      maxWidth: depth === 0 ? 240 : 190,
      textAlign: depth === 0 ? "center" : "start",
      fontSize: depth === 0 ? 17 : undefined,
    });
    if (parentId !== null) {
      connectors.push({
        id: `${parentId}--${id}`,
        from: parentId,
        to: id,
        // A branch is a containment relation, not a flow: no arrowhead.
        arrow: "none",
      });
    }
    for (const child of node.children ?? []) visit(child, depth + 1, id);
  };

  visit(input.root, 0, null);

  const scene: Scene = {
    type: "scene",
    id: "mindmap",
    layout: "graph",
    children,
    connectors,
    graph: {
      algorithm: input.shape === "radial" ? "radial" : "mrtree",
      direction: "DOWN",
      spacing: input.spacing ?? 28,
      layerSpacing: 70,
    },
  };

  return { version: 1, title: input.title, root: scene };
}
