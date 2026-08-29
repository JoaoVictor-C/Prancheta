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
import * as v from "../validate.ts";
import { SHAPE_KINDS } from "../../geometry/shapes.ts";
import type { ShapeKind } from "../../geometry/shapes.ts";

export type GraphInput = {
  title?: string;
  nodes: { id: string; label: string; role?: BlockRole; width?: number; shape?: ShapeKind }[];
  edges: { from: string; to: string; dashed?: boolean; arrow?: "none" | "end" | "both" }[];
  /** "RIGHT" for a pipeline, "DOWN" for a call tree. */
  direction?: "RIGHT" | "LEFT" | "DOWN" | "UP";
  spacing?: number;
  layerSpacing?: number;
  /** Wrap a long chain onto several rows rather than one very wide row. */
  wrapping?: "off" | "single-edge" | "multi-edge";
  /** Target width-to-height ratio for that wrap. 1 asks for a square. */
  aspectRatio?: number;
};

export function expandGraph(input: GraphInput): FigureSpec {
  const children: Block[] = input.nodes.map((node) => ({
    type: "block",
    id: node.id,
    label: node.label,
    role: node.role ?? "default",
    ...(node.shape === undefined ? {} : { shape: node.shape }),
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
      ...(input.wrapping === undefined ? {} : { wrapping: input.wrapping }),
      ...(input.aspectRatio === undefined ? {} : { aspectRatio: input.aspectRatio }),
    },
  };

  return { version: 1, title: input.title, root: scene };
}

/**
 * Preconditions expandGraph and ELK rely on. Co-located with the expander it
 * guards, per ADR 0002: a preset is code plus prose in one directory, and the
 * rule about its input belongs with the code that consumes it.
 *
 * The dangling edge reference is the reason this exists. `{"to": "zzz"}` used
 * to reach ELK and come back as fifteen frames of minified bundle saying
 * "Referenced shape does not exist" -- true, and useless, because ELK has no
 * idea the caller wrote `edges[0].to`.
 */
export function validateGraphInput(input: Record<string, unknown>, path = "graph"): void {
  v.optionalString(input, "title", path);
  v.optionalEnum(input, "direction", path, ["RIGHT", "LEFT", "DOWN", "UP"] as const);
  v.optionalNumber(input, "spacing", path);
  v.optionalNumber(input, "layerSpacing", path);
  v.optionalEnum(input, "wrapping", path, ["off", "single-edge", "multi-edge"] as const);
  v.optionalNumber(input, "aspectRatio", path);

  const nodes = v.nonEmptyArray(input, "nodes", path, "nodes");
  const ids: { id: string; at: string }[] = [];
  for (const [i, raw] of nodes.entries()) {
    const node = v.object(raw, `${path}.nodes[${i}]`);
    ids.push({ id: v.requiredString(node, "id", `${path}.nodes[${i}]`), at: `${path}.nodes[${i}]` });
    v.requiredString(node, "label", `${path}.nodes[${i}]`);
    v.optionalEnum(node, "role", `${path}.nodes[${i}]`, v.ROLES);
    v.optionalNumber(node, "width", `${path}.nodes[${i}]`);
    v.optionalEnum(node, "shape", `${path}.nodes[${i}]`, SHAPE_KINDS);
  }
  v.unique(ids, "node");

  const declared = new Set(ids.map((entry) => entry.id));
  const edges = v.array(input, "edges", path, "edges");
  for (const [i, raw] of edges.entries()) {
    const at = `${path}.edges[${i}]`;
    const edge = v.object(raw, at);
    v.knownId(v.requiredString(edge, "from", at), declared, `${at}.from`, "node");
    v.knownId(v.requiredString(edge, "to", at), declared, `${at}.to`, "node");
    v.optionalBoolean(edge, "dashed", at);
    v.optionalEnum(edge, "arrow", at, ["none", "end", "both"] as const);
  }
}
