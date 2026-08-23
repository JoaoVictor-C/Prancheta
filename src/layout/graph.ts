/**
 * ELK ingest.
 *
 * Decision 0001 said: delegate the graph skeleton, ingest its geometry, own
 * everything layered on top. This is that boundary. ELK decides where nodes go
 * and how edges run between them; it is told the REAL sizes of those nodes,
 * measured in the browser with their actual text, so it is never laying out
 * guesses.
 *
 * The ordering matters and is the whole trick: measure -> ELK -> place ->
 * measure again. The repair loop then runs on top, and since repairs only ever
 * grow a node and ELK is deterministic given sizes, re-running it each pass
 * cannot make the loop oscillate.
 */

import ELK from "elkjs/lib/elk.bundled.js";
import type { Connector, GraphOptions, Point, Scene } from "../ir/types.ts";

export type NodeSize = { id: string; width: number; height: number };

export type GraphLayout = {
  width: number;
  height: number;
  /** Scene-local positions, by block id. */
  positions: Record<string, Point>;
  /** Scene-local polylines, by connector id. */
  routes: Record<string, Point[]>;
};

type ElkPort = {
  layout(graph: unknown): Promise<{
    width?: number;
    height?: number;
    children?: { id: string; x?: number; y?: number }[];
    edges?: {
      id: string;
      sections?: {
        startPoint: Point;
        endPoint: Point;
        bendPoints?: Point[];
      }[];
    }[];
  }>;
};

const elk = new (ELK as unknown as new () => ElkPort)();

export async function layoutGraph(
  scene: Scene,
  sizes: NodeSize[],
  connectorIds: Map<Connector, string>,
): Promise<GraphLayout> {
  const options = scene.graph ?? {};
  const edges = [...connectorIds.entries()]
    // A connector aimed at a bare point is a callout, not a graph edge; ELK
    // must not see it or it would try to route to a node that does not exist.
    .filter(([connector]) => typeof connector.to === "string")
    .map(([connector, id]) => ({
      id,
      sources: [connector.from],
      targets: [connector.to as string],
    }));

  const result = await elk.layout({
    id: "root",
    layoutOptions: elkOptions(options),
    children: sizes.map((size) => ({ id: size.id, width: size.width, height: size.height })),
    edges,
  });

  const positions: Record<string, Point> = {};
  for (const child of result.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }

  const routes: Record<string, Point[]> = {};
  for (const edge of result.edges ?? []) {
    const section = edge.sections?.[0];
    if (!section) continue;
    routes[edge.id] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
  }

  return {
    width: result.width ?? 0,
    height: result.height ?? 0,
    positions,
    routes,
  };
}

function elkOptions(options: GraphOptions): Record<string, string> {
  const algorithm = options.algorithm ?? "layered";
  const spacing = String(options.spacing ?? 40);
  const layerSpacing = String(options.layerSpacing ?? 60);
  const base: Record<string, string> = {
    "elk.algorithm": algorithm,
    "elk.spacing.nodeNode": spacing,
    "elk.padding": "[top=0,left=0,bottom=0,right=0]",
  };
  if (algorithm === "layered") {
    base["elk.direction"] = options.direction ?? "RIGHT";
    base["elk.layered.spacing.nodeNodeBetweenLayers"] = layerSpacing;
    // Orthogonal routes read as deliberate; splines read as decoration.
    base["elk.edgeRouting"] = "ORTHOGONAL";
  }
  if (algorithm === "mrtree") {
    base["elk.direction"] = options.direction ?? "DOWN";
    base["elk.mrtree.searchOrder"] = "DFS";
  }
  if (algorithm === "radial") {
    base["elk.radial.radius"] = layerSpacing;
  }
  return base;
}
