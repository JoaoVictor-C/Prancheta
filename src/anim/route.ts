/**
 * The rendered ROUTE trajectory: what each connector's polyline actually does
 * during the transition (ADR 0017, M15).
 *
 * This retires the M12 debt. Until now a connector was pinned to its
 * second-state route for the whole run, so a line joining two boxes sat
 * perfectly still while its own endpoints slid out from under it. Anything
 * that wanted to read as a moving line therefore had to be built out of
 * BOXES -- a row of dots standing in for a stroke -- which is a workaround
 * wearing the costume of a design decision.
 *
 * Why this can be done exactly, which is the only reason it is done at all:
 *
 *   1. `d` is an animatable CSS property in SVG2, so a route tween is an
 *      ordinary `@keyframes` block like every other track here. It is NOT
 *      SMIL: SMIL animations are invisible to `document.getAnimations()`,
 *      run on their own clock, and would have put the emitted figure's two
 *      halves under two different timebases -- the exact drift M11.1 was
 *      about. Staying in CSS keeps one clock and one easing.
 *
 *   2. CSS interpolates `path()` COORDINATE-WISE when the two path data
 *      strings have the same command structure. So every vertex travels
 *      affinely in t, which is the same premise the box solver already
 *      rests on, and `src/anim/sweep.ts` can answer where a moving segment
 *      meets a moving box in closed form rather than by sampling.
 *
 *      Verified rather than assumed: with a path and a box animated over the
 *      same duration and easing, at global fraction 0.25 the path's
 *      interpolated coordinate and the box's translate were both at progress
 *      0.1292 -- one shared reparametrisation, so the easing-invariance
 *      argument in src/anim/easing.ts carries over untouched.
 *
 *   3. Same-structure is a PRECONDITION, not a hope. `requireSameStructure`
 *      refuses a route whose two states have different vertex counts, since
 *      CSS falls back to a discrete swap there -- the connector would jump
 *      rather than travel, and the check would be modelling a motion the
 *      renderer never performs. Curved connectors are flattened at layout
 *      time (see PlacedConnector.points), and a curve whose endpoints move
 *      can easily flatten to a different vertex count, so this refusal has
 *      real work to do.
 *
 * Population rule, inherited from trajectory.ts: what is DRAWN participates.
 */

import type { LaidOutFigure, MotionWindow, PlacedConnector, Point } from "../ir/types.ts";
import { SpecError } from "../ir/types.ts";
import { FULL_WINDOW } from "./trajectory.ts";

/**
 * Where a connector's polyline is at t=0 and at t=1, as the emitted SVG
 * actually draws it. `from` equals `to` for a route that never moves.
 *
 * The flags mean what they mean on `Trajectory`, and for the same reason:
 * they tell the transition check which frames a STATIC check already covers,
 * so it can delegate rather than re-report.
 */
export type RouteTrajectory = {
  id: string;
  from: Point[];
  to: Point[];
  tweened: boolean;
  /** Ids of the blocks this connector joins; the static check lets it touch those. */
  endpointIds: string[];
  inFinishedFigure: boolean;
  atFirstStatePlace: boolean;
  window: MotionWindow;
};

/** The polyline at local progress `s` within this route's own window. */
export function pointsAt(route: RouteTrajectory, tau: number): Point[] {
  const { start, end } = route.window;
  const s = tau <= start ? 0 : tau >= end ? 1 : (tau - start) / (end - start);
  return route.to.map((to, i) => {
    const from = route.from[i]!;
    return { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s };
  });
}

/**
 * `d` for a polyline, in exactly the shape render/svg.ts emits it.
 *
 * Byte-compatibility with the renderer is not cosmetic: CSS only interpolates
 * two `path()` values when their command structure matches, and the base SVG's
 * own `d` attribute is one of the values the cascade may fall back to.
 */
export function pathData(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`)
    .join(" ");
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/**
 * Every connector the emitted SVG carries, with the motion it actually
 * performs.
 *
 * A connector is matched across states by id, like everything else. Three
 * outcomes: its route is unchanged (a constant trajectory, still affine, so
 * the solver needs no special case), its route moved (a tween), or it is
 * present in only one of the two states.
 *
 * Appearing and disappearing connectors are deliberately NOT given fade
 * tracks here. The sequence emitter re-injects departed BOXES at the place
 * they left from (ADR 0014); connectors are re-derived per state by the
 * layout, so a departed connector has no stable route to be re-injected at.
 * They are carried as constant, un-tweened participants so the check still
 * sees them where they are drawn, and nothing claims they fade.
 */
export function renderedRoutes(
  after: LaidOutFigure,
  before?: LaidOutFigure,
): Map<string, RouteTrajectory> {
  const beforeById = new Map(
    (before?.elements ?? [])
      .filter((element): element is PlacedConnector => element.kind === "connector")
      .map((connector) => [connector.id, connector] as const),
  );

  const routes = new Map<string, RouteTrajectory>();

  for (const element of after.elements) {
    if (element.kind !== "connector") continue;
    const connector = element;
    const to = connector.points;
    const endpointIds = [connector.fromId, connector.toId].filter(
      (id): id is string => id !== null,
    );
    const previous = beforeById.get(connector.id);

    if (previous === undefined || samePolyline(previous.points, to)) {
      routes.set(connector.id, {
        id: connector.id,
        from: to,
        to,
        tweened: false,
        endpointIds,
        inFinishedFigure: true,
        atFirstStatePlace: previous !== undefined,
        window: FULL_WINDOW,
      });
      continue;
    }

    requireSameStructure(connector.id, previous.points, to);
    requireNoArrowhead(connector.id, connector.arrow);
    routes.set(connector.id, {
      id: connector.id,
      from: previous.points,
      to,
      tweened: true,
      endpointIds,
      inFinishedFigure: true,
      atFirstStatePlace: true,
      window: FULL_WINDOW,
    });
  }

  return routes;
}

function samePolyline(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((point, i) => point.x === b[i]!.x && point.y === b[i]!.y);
}

/**
 * CSS interpolates `path()` only between two path data strings with the same
 * command sequence; given anything else it falls back to a DISCRETE swap at
 * the midpoint. That would make the emitted figure jump while every check
 * here modelled it as travelling -- the M11.1 defect in a new place -- so the
 * mismatch is refused rather than papered over.
 */
export function requireSameStructure(id: string, from: Point[], to: Point[]): void {
  if (from.length === to.length) return;
  throw new SpecError(
    `animate: connector "${id}" is routed through ${from.length} point(s) in one state and ` +
      `${to.length} in the next, so its two routes cannot be tweened -- CSS interpolates a path ` +
      `only between equal command sequences and would swap this one abruptly at the midpoint. ` +
      `A curved connector is flattened at layout time, and moving its endpoints can change how ` +
      `many segments it flattens to; pin the route with explicit points, or give the two states ` +
      `endpoints that flatten alike`,
  );
}

/**
 * An arrowhead is a sibling `<polygon>`, and the route track animates the
 * `<path>` alone.
 *
 * There is no CSS-animatable property that would carry the head along: a
 * polygon's `points` is not one, and driving it by `transform` would mean a
 * rotation, which is precisely the transcendental term sweep.ts is built to
 * avoid. So a tweened route with an arrow would draw its line travelling and
 * its head standing still -- a figure disagreeing with itself on screen,
 * which is worse than a refusal and exactly what ADR 0013 was written about.
 *
 * Refused rather than recorded as a known limitation, because a limitation
 * this shape is indistinguishable from a rendering bug to whoever hits it.
 */
export function requireNoArrowhead(id: string, arrow: "none" | "end" | "both"): void {
  if (arrow === "none") return;
  throw new SpecError(
    `animate: connector "${id}" changes route between these two states and carries ` +
      `arrow "${arrow}", which cannot travel with it -- an arrowhead is a separate polygon and ` +
      `no CSS-animatable property moves it in step with the line, so the head would be left ` +
      `behind where the route started. Set arrow "none" on a connector whose route moves, or ` +
      `keep its endpoints fixed`,
  );
}
