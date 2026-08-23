/**
 * graph — nodes and edges, skeleton laid out by ELK.
 *
 * Prancheta does not reimplement graph layout. ELK has been doing it well for
 * years, and anything written here would be worse. What Prancheta keeps is the
 * part ELK cannot do: measuring the real text inside each node, repairing a
 * node that turns out too small, and layering anything else over the result.
 */

import type { Block, Connector, FigureSpec, Scene } from "../../ir/types.ts";
import type { BlockRole } from "../../ir/types.ts";

export type GraphInput = {
  title?: string;
  nodes: { id: string; label: string; role?: BlockRole; width?: number }[];
  edges: { from: string; to: string; dashed?: boolean; arrow?: "none" | "end" | "both" }[];
  /** "RIGHT" for a pipeline, "DOWN" for a call tree. */
  direction?: "RIGHT" | "LEFT" | "DOWN" | "UP";
  spacing?: number;
  layerSpacing?: number;
};

export function expandGraph(input: GraphInput): FigureSpec {
  const children: Block[] = input.nodes.map((node) => ({
    type: "block",
    id: node.id,
    label: node.label,
    role: node.role ?? "default",
    // A cap rather than a fixed width: nodes size to their text, but one long
    // label must not stretch a whole rank.
    maxWidth: node.width ?? 220,
    textAlign: "center",
  }));

  // Edge ids are derived from their ENDPOINTS, never from position in the list.
  // A positional id is not identity: delete one edge and add another, and
  // `edge-5` silently becomes a different edge. The two-state diff then reports
  // a resize where one edge actually died and another was born — and an
  // animation built on that would morph the dead-letter path into the cache
  // path. Content-based ids make identity survive editing.
  const seen = new Map<string, number>();
  const connectors: Connector[] = input.edges.map((edge) => {
    const base = `${edge.from}--${edge.to}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return {
      id: count === 1 ? base : `${base}#${count}`,
      from: edge.from,
      to: edge.to,
      arrow: edge.arrow ?? "end",
      dashed: edge.dashed ?? false,
    };
  });

  const scene: Scene = {
    type: "scene",
    id: "graph",
    layout: "graph",
    children,
    connectors,
    graph: {
      algorithm: "layered",
      direction: input.direction ?? "RIGHT",
      spacing: input.spacing ?? 40,
      layerSpacing: input.layerSpacing ?? 70,
    },
  };

  return { version: 1, title: input.title, root: scene };
}
