/**
 * Scene placement: the two-phase dance that lets a third-party layout engine
 * and our own measurement oracle work on the same figure.
 *
 *   1. MEASURE   — render scene children in loose flow, read their real sizes
 *                  (with their real text, wrapped as it will actually wrap)
 *   2. PLACE     — hand those sizes to ELK, or take the author's coordinates,
 *                  and decide where everything goes
 *   3. RE-MEASURE — render again, absolutely positioned, and measure properly
 *   4. CONNECT   — lift ELK's scene-local routes into page space, or compute
 *                  straight callout lines ourselves
 *
 * Step 1 is what stops ELK laying out guesses, and step 3 is what keeps text
 * measurement ours. Neither engine has to know about the other.
 */

import type { Block, Connector, FigureNode, FigureSpec, Point, Scene } from "../ir/types.ts";
import type { PlacedBox, PlacedConnector, PlacedMark } from "../ir/types.ts";
import type { PathCommand } from "../geometry/paths.ts";
import { flattenPath } from "../geometry/paths.ts";
import { layoutGraph } from "./graph.ts";
import type { NodeSize } from "./graph.ts";
import {
  curveRoute,
  liftCurve,
  routeBetweenBoxes,
  sweepCommands,
  routeSelfLoop,
  routeFromPoint,
  routePointToPoint,
  routeToPoint,
  trimRoute,
} from "./connectors.ts";
import { connector as connectorTheme } from "../theme.ts";
import type { HtmlOptions } from "./html.ts";
import type { PageMeasurement } from "./measure.ts";

/** A scene whose origin was not measured is treated as sitting at the page origin. */
const ZERO: Point = { x: 0, y: 0 };

export type SceneRecord = {
  id: string;
  scene: Scene;
  /** Child block ids in document order. */
  childIds: string[];
  /** Connector id per connector, assigned once and kept stable. */
  connectorIds: Map<Connector, string>;
};

/** Walk the spec assigning the same ids `buildHtml` will assign. */
export function collectScenes(spec: FigureSpec): SceneRecord[] {
  const scenes: SceneRecord[] = [];
  let counter = 0;
  const nextId = (node: FigureNode | Block): string => {
    counter += 1;
    return node.id ?? `${node.type ?? "block"}-${counter}`;
  };

  const visit = (node: FigureNode): void => {
    if (node.type === "stack") {
      nextId(node);
      node.children.forEach(visit);
      return;
    }
    if (node.type === "scene") {
      const sceneId = nextId(node);
      const childIds = node.children.map((child) => nextId(child));
      const connectorIds = new Map<Connector, string>();
      (node.connectors ?? []).forEach((connector, index) => {
        connectorIds.set(connector, connector.id ?? `${sceneId}-edge-${index + 1}`);
      });
      scenes.push({ id: sceneId, scene: node, childIds, connectorIds });
      return;
    }
    nextId(node);
  };

  visit(spec.root);
  return scenes;
}

export type PlacementResult = {
  htmlOptions: HtmlOptions;
  /** Scene-local routes from ELK, by connector id. Empty for absolute scenes. */
  routes: Record<string, Point[]>;
};

/** Phase 2: decide where every scene child goes, from measured intrinsic sizes. */
export async function placeScenes(
  scenes: SceneRecord[],
  measured: PageMeasurement,
): Promise<PlacementResult> {
  const placements: Record<string, Point> = {};
  const sceneSizes: Record<string, { width: number; height: number }> = {};
  const routes: Record<string, Point[]> = {};
  const sizeOf = new Map(measured.boxes.map((box) => [box.id, box]));

  for (const record of scenes) {
    const sizes: NodeSize[] = record.childIds.map((id) => {
      const box = sizeOf.get(id);
      return { id, width: box?.width ?? 0, height: box?.height ?? 0 };
    });

    if (record.scene.layout === "graph") {
      const layout = await layoutGraph(record.scene, sizes, record.connectorIds);
      for (const [id, point] of Object.entries(layout.positions)) placements[id] = point;
      for (const [id, points] of Object.entries(layout.routes)) routes[id] = points;
      sceneSizes[record.id] = { width: layout.width, height: layout.height };
      continue;
    }

    // Absolute: the author placed things. The scene is as big as its contents
    // unless it was given an explicit size.
    let right = 0;
    let bottom = 0;
    record.scene.children.forEach((child, index) => {
      const id = record.childIds[index]!;
      const point = { x: child.x ?? 0, y: child.y ?? 0 };
      placements[id] = point;
      const size = sizes[index]!;
      right = Math.max(right, point.x + size.width);
      bottom = Math.max(bottom, point.y + size.height);
    });
    sceneSizes[record.id] = {
      width: record.scene.width ?? right,
      height: record.scene.height ?? bottom,
    };
  }

  return { htmlOptions: { placements, sceneSizes }, routes };
}

/** Phase 4: turn routes and box geometry into absolute, page-space polylines. */
export function buildConnectors(
  scenes: SceneRecord[],
  measured: PageMeasurement,
  routes: Record<string, Point[]>,
  boxes: PlacedBox[],
): PlacedConnector[] {
  const boxById = new Map(boxes.map((box) => [box.id, box]));
  const sceneById = new Map(measured.scenes.map((scene) => [scene.id, scene]));
  const placed: PlacedConnector[] = [];

  for (const record of scenes) {
    const origin = sceneById.get(record.id);
    for (const [connector, id] of record.connectorIds) {
      const from = typeof connector.from === "string" ? boxById.get(connector.from) : undefined;
      if (typeof connector.from === "string" && !from) continue;
      const toBox = typeof connector.to === "string" ? boxById.get(connector.to) : undefined;
      if (typeof connector.to === "string" && !toBox) continue;

      // A stated endpoint is scene-local, exactly as `to` already was, so it
      // is lifted into page space before anything routes against it.
      const lift = (point: Point): Point =>
        origin === undefined ? point : { x: point.x + origin.x, y: point.y + origin.y };
      const fromPoint =
        typeof connector.from === "string" ? undefined : lift(connector.from as Point);

      let points: Point[];
      const route = routes[id];
      if (fromPoint !== undefined) {
        // ELK never routed this edge -- it keys on node ids and this one has
        // no source node -- so a stated origin always takes the direct route.
        points =
          toBox === undefined
            ? routePointToPoint(fromPoint, lift(connector.to as Point))
            : routeFromPoint(fromPoint, toBox);
      } else if (from !== undefined && toBox !== undefined && toBox.id === from.id) {
        // A box joined to itself: both ends would clip against the same border
        // from the same centre and collapse to a point. See routeSelfLoop.
        points = routeSelfLoop(from);
      } else if (from !== undefined && route !== undefined && origin !== undefined) {
        // ELK works scene-local; lift into page space, then pull the ends back
        // off the borders it routed to.
        const lifted = route.map((point) => ({ x: point.x + origin.x, y: point.y + origin.y }));
        points = trimRoute(lifted, from, toBox ?? null);
      } else if (from !== undefined && toBox !== undefined) {
        points = routeBetweenBoxes(from, toBox);
      } else if (from !== undefined) {
        points = routeToPoint(from, lift(connector.to as Point));
      } else {
        continue;
      }

      // Bend the route before anything else sees it, so the polyline every
      // check reads is the one the renderer draws (decision 0010). The curve
      // is lifted into page space first, for the same reason the route was.
      // Lifted once and kept, not lifted and thrown away. `points` are in
      // page space, so a curve carried alongside them in SCENE space is a
      // trap for anything that reads both: `sweep-matches-its-label` compared
      // a page-space arc against a scene-space centre and measured 21.4
      // degrees for an arc that subtends exactly 30.
      const lifted =
        connector.curve === undefined ? undefined : liftCurve(connector.curve, origin ?? ZERO);
      if (lifted !== undefined) {
        points = curveRoute(points, lifted);
      }

      placed.push({
        kind: "connector",
        id,
        fromId: typeof connector.from === "string" ? connector.from : null,
        toId: typeof connector.to === "string" ? connector.to : null,
        points,
        curve: lifted,
        arrow: connector.arrow ?? "end",
        arrowStyle: connector.arrowStyle ?? "closed",
        dashed: connector.dashed ?? false,
        lineStyle: connector.lineStyle ?? (connector.dashed ? "dashed" : "solid"),
        stroke: connector.stroke ?? connectorTheme.stroke,
        strokeWidth: connector.strokeWidth ?? connectorTheme.strokeWidth,
      });
    }
  }

  return placed;
}

/**
 * A scene's marks, flattened into the polylines every check reads.
 *
 * Flattening happens HERE and once, for the same reason `curveRoute` does it
 * for connectors: the renderer emits these very points, so a filled region
 * cannot bulge through something a check just cleared. The arc segments reuse
 * `sweepCommands`, so a mark's curvature is derived from its ends and centre
 * exactly as an angle mark's is.
 */
export function buildMarks(scenes: SceneRecord[], measured: PageMeasurement): PlacedMark[] {
  const sceneById = new Map(measured.scenes.map((scene) => [scene.id, scene as Point]));
  const placed: PlacedMark[] = [];
  for (const record of scenes) {
    const origin = sceneById.get(record.id) ?? ZERO;
    for (const [i, mark] of (record.scene.marks ?? []).entries()) {
      const lift = (point: Point): Point => ({ x: point.x + origin.x, y: point.y + origin.y });
      const start = lift(mark.from as Point);
      const commands: PathCommand[] = [{ kind: "M", x: start.x, y: start.y }];
      const arcCentres: { centre: Point; from: Point; to: Point }[] = [];
      let cursor = start;
      for (const segment of mark.segments) {
        if ("line" in segment) {
          const to = lift(segment.line as Point);
          commands.push({ kind: "L", x: to.x, y: to.y });
          cursor = to;
          continue;
        }
        const to = lift(segment.arc as Point);
        const centre = lift(segment.centre as Point);
        arcCentres.push({ centre, from: cursor, to });
        // [0] is the M that sweepCommands emits for its own start, which this
        // path already has; only the A is wanted.
        commands.push(...sweepCommands(cursor, to, centre).slice(1));
        cursor = to;
      }
      const closed = mark.close ?? mark.fill !== undefined;
      if (closed) commands.push({ kind: "Z" });
      const points = flattenPath(commands);
      placed.push({
        kind: "mark",
        id: mark.id ?? `${record.id}-mark-${i + 1}`,
        points,
        closed,
        fill: mark.fill ?? "none",
        stroke: mark.stroke ?? "none",
        strokeWidth: mark.strokeWidth ?? 0,
        lineStyle: mark.lineStyle ?? "solid",
        arcCentres,
      });
    }
  }
  return placed;
}
