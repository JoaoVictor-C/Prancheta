/**
 * Stable identity for every node.
 *
 * The repair loop edits nodes by id, so ids cannot be invented during
 * rendering — a node must answer to the same name before layout, after
 * layout, and in the manifest the caller reads. `normalise` deep-copies the
 * spec and fills in any missing id, deterministically and in document order.
 *
 * It copies rather than mutates because the caller's spec is theirs: repairs
 * are reported as edits (see repair.ts), never applied behind their back.
 */

import type { FigureNode, FigureSpec } from "./types.ts";

export type NodeIndex = Map<string, FigureNode>;

export function normalise(spec: FigureSpec): { spec: FigureSpec; index: NodeIndex } {
  let counter = 0;
  const index: NodeIndex = new Map();

  const visit = (node: FigureNode): FigureNode => {
    counter += 1;
    const id = node.id ?? `${node.type}-${counter}`;
    if (node.type === "stack") {
      const copy: FigureNode = { ...node, id, children: node.children.map(visit) };
      index.set(id, copy);
      return copy;
    }
    if (node.type === "scene") {
      // Scene children MUST be visited. They were not, once, and the effect was
      // silent: the repair loop kept re-emitting the same edit every pass
      // because applyEdits could not find the node to change. A monotone,
      // provably terminating loop still gets nowhere if its edits never land.
      const copy: FigureNode = {
        ...node,
        id,
        children: node.children.map((child) => visit(child) as typeof child),
        connectors: node.connectors?.map((connector, index_) => ({
          ...connector,
          id: connector.id ?? `${id}-edge-${index_ + 1}`,
        })),
      };
      index.set(id, copy);
      return copy;
    }
    const copy: FigureNode = { ...node, id };
    index.set(id, copy);
    return copy;
  };

  const root = visit(spec.root);
  return { spec: { ...spec, root }, index };
}

/** Deep-copy a normalised spec, keeping ids and returning a fresh index. */
export function cloneNormalised(spec: FigureSpec): { spec: FigureSpec; index: NodeIndex } {
  const index: NodeIndex = new Map();
  const visit = (node: FigureNode): FigureNode => {
    let copy: FigureNode;
    if (node.type === "stack") {
      copy = { ...node, children: node.children.map(visit) };
    } else if (node.type === "scene") {
      copy = {
        ...node,
        children: node.children.map((child) => visit(child) as typeof child),
        connectors: node.connectors?.map((connector) => ({ ...connector })),
      };
    } else {
      copy = { ...node };
    }
    if (copy.id !== undefined) index.set(copy.id, copy);
    return copy;
  };
  const root = visit(spec.root);
  return { spec: { ...spec, root }, index };
}
