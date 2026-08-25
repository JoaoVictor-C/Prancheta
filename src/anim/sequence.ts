/**
 * N-state animation sequences (ADR 0016, M14).
 *
 * ADR 0014 and 0015 recorded "multi-keyframe timelines" as a non-goal on a
 * genre argument: two authored states are the right primitive, and more would
 * turn `animate` into a presentation tool. That bundled two things that fail
 * DIFFERENT halves of this project's own test. A camera fails checkability --
 * there is no check for "is this legible at this zoom", and inventing one is
 * a research problem. A sequence of states does not: every state is already
 * checked statically by the six existing checks, and M13 already proved that
 * hold-ramp-hold motion is piecewise affine, so the closed-form solver in
 * src/anim/checks.ts runs once per SEGMENT with no change to its own code.
 *
 * What generalises for free, reused verbatim per consecutive pair of states:
 * `diffFigures`, `validateAnimationSpecs`'s two guards, `buildTimeline`,
 * `renderedTrajectories`, `requireLinearWhenStaggered`, and
 * `boxesDoNotOverlapDuringTransition`. Every scene boundary is an
 * independently rendered, statically checked frame, so the two-state
 * "delegate to the finished figure, delegate to the first state" rule
 * generalises into one rule: every boundary delegates to its own frame, and
 * the motion check owns only what is interior to a transition.
 *
 * What does NOT generalise for free, and is refused rather than guessed:
 *
 *   - An element that disappears and later reappears under the same id. Its
 *     departure is drawn once, injected at the position it left from; a
 *     reappearance would need a second DOM node with the same id, which is
 *     not supported. Refused with a named SpecError rather than silently
 *     drawing the wrong thing.
 *   - Two consecutive states that share no element by id at all. That is not
 *     one figure evolving, it is two unrelated figures back to back -- the
 *     genre half of the original ADR's test, restated as something this
 *     project already computes (`diffFigures`'s own `persisted` count)
 *     rather than as a feeling.
 */

import { readFile } from "node:fs/promises";
import type { Check } from "../checks.ts";
import type { FigureSpec, LaidOutFigure, MotionWindow, PlacedBox, PlacedText } from "../ir/types.ts";
import { SpecError, parseSpec } from "../ir/types.ts";
import { checkRect } from "../checks.ts";
import { expand, isPresetInput } from "../presets/index.ts";
import { render } from "../pipeline.ts";
import type { RenderResult } from "../pipeline.ts";
import { toSvg } from "../render/svg.ts";
import { diffFigures } from "./diff.ts";
import type { FigureDiff } from "./diff.ts";
import { buildTimeline, validateAnimationSpecs } from "./timeline.ts";
import type { AnimationTimeline } from "./timeline.ts";
import { isStaggered, renderedTrajectories, requireLinearWhenStaggered } from "./trajectory.ts";
import type { Trajectory } from "./trajectory.ts";
import {
  boxesDoNotOverlapDuringTransition,
  connectorsClearOfBoxesDuringTransition,
} from "./checks.ts";
import { pathData, pointsAt, renderedRoutes } from "./route.ts";
import type { RouteTrajectory } from "./route.ts";
import { cssId, cssSafe, num, pct } from "./emit.ts";

export type State = { spec: FigureSpec; rendered: RenderResult };

export async function loadState(path: string): Promise<State> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const spec = isPresetInput(parsed) ? expand(parsed) : parseSpec(parsed);
  // Repair disabled, same reasoning as the two-state command: repair moves
  // boxes for reasons that have nothing to do with the author's states, and
  // animating a repair artefact would confuse the thing this exists to verify.
  const rendered = await render(spec, { repair: false });
  return { spec, rendered };
}

export type Segment = {
  /** This segment runs from state[index] to state[index+1]. */
  index: number;
  diff: FigureDiff;
  timeline: AnimationTimeline;
  /** LOCAL to this segment: window fractions are relative to THIS transition. */
  trajectories: Map<string, Trajectory>;
  /** Connector routes, same locality (ADR 0017). */
  routes: Map<string, RouteTrajectory>;
  transitionChecks: Check[];
};

/**
 * One consecutive pair, entirely through the existing M11.1-M13 machinery.
 * Nothing here is new math; it is the two-state pipeline, called once per
 * boundary rather than once for the whole run.
 */
export function buildSegment(index: number, before: State, after: State): Segment {
  const diff = diffFigures(before.rendered.figure, after.rendered.figure);

  // The genre half of the bound, made concrete: two states with nothing in
  // common are not one figure evolving. Checkability alone cannot see this --
  // a slideshow of unrelated figures is perfectly checkable and still wrong
  // to have built silently.
  if (diff.persisted === 0) {
    throw new SpecError(
      `animate: states ${index} and ${index + 1} share no element by id -- refusing to treat two ` +
        `unrelated figures as one evolving sequence. Every consecutive pair needs at least one ` +
        `persisting element (ADR 0016). If these two states really are unrelated, render them ` +
        `separately instead of animating between them`,
    );
  }

  validateAnimationSpecs(before.spec, after.spec, diff, before.rendered.figure, after.rendered.figure);
  const timeline = buildTimeline(diff, before.rendered.figure, after.rendered.figure);
  const trajectories = renderedTrajectories(
    after.rendered.figure,
    timeline,
    before.rendered.figure,
  );
  const routes = renderedRoutes(after.rendered.figure, before.rendered.figure);
  const frames = { after: after.rendered.figure, before: before.rendered.figure };
  const transitionChecks = [
    ...boxesDoNotOverlapDuringTransition(trajectories, frames),
    ...connectorsClearOfBoxesDuringTransition(routes, trajectories, frames),
  ];

  return { index, diff, timeline, trajectories, routes, transitionChecks };
}

export type AnimateSequenceOptions = {
  /** Length of EACH transition, in milliseconds. Total run time is this times the segment count. */
  durationMs?: number;
  /** Held before the whole sequence starts. Applied once, not per segment. */
  delayMs?: number;
  /** A validated CSS timing function; see src/anim/easing.ts. Default "linear". */
  easing?: string;
  /** Repeat the whole sequence forever instead of settling on the last state. */
  loop?: boolean;
};

export type SequenceResult = {
  states: State[];
  segments: Segment[];
  svg: string;
  /** transitionChecks flattened across every segment, detail prefixed with the segment it belongs to. */
  transitionChecks: Check[];
  disclosed: { hardCut: string[]; clippedOnExit: string[] };
  ok: boolean;
};

export async function animateSequence(
  paths: string[],
  options: AnimateSequenceOptions = {},
): Promise<SequenceResult> {
  if (paths.length < 2) {
    throw new SpecError(`animate: needs at least 2 states, got ${paths.length}`);
  }

  const states = await Promise.all(paths.map(loadState));
  const segmentCount = states.length - 1;

  const segments: Segment[] = [];
  for (let i = 0; i < segmentCount; i += 1) {
    segments.push(buildSegment(i, states[i]!, states[i + 1]!));
  }

  const easing = options.easing ?? "linear";
  for (const segment of segments) requireLinearWhenStaggered(segment.trajectories, easing);

  // Reappearance guard: an id that disappears (fades out, not present in the
  // finished figure of ITS OWN segment) but IS present in the final state was
  // absent somewhere in the middle and came back -- a second life under the
  // same id, which the merged SVG cannot express as one DOM node.
  const finalIds = new Set(
    states[states.length - 1]!.rendered.figure.elements
      .filter((element): element is PlacedBox => element.kind === "box")
      .map((box) => box.id),
  );
  for (const segment of segments) {
    for (const trajectory of segment.trajectories.values()) {
      if (trajectory.fade === "out" && !trajectory.inFinishedFigure && finalIds.has(trajectory.id)) {
        throw new SpecError(
          `animate: "${trajectory.id}" disappears after state ${segment.index} and is present again ` +
            `in the final state -- reappearing under the same id is not supported (ADR 0016). A ` +
            `departing element is drawn once, at the position it left from`,
        );
      }
    }
  }

  const { svg, hardCut, clippedOnExit } = emitSequenceSvg(states, segments, {
    durationMs: options.durationMs ?? 500,
    delayMs: options.delayMs ?? 0,
    easing,
    loop: options.loop === true,
  });

  const transitionChecks: Check[] = segments.flatMap((segment) =>
    segment.transitionChecks.map((check) => ({
      ...check,
      detail:
        check.detail === undefined
          ? undefined
          : `[state ${segment.index} -> ${segment.index + 1}] ${check.detail}`,
    })),
  );

  const ok =
    states.every((state) => state.rendered.manifest.ok) &&
    transitionChecks.every((check) => check.status !== "fail");

  return { states, segments, svg, transitionChecks, disclosed: { hardCut, clippedOnExit }, ok };
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

type EmitOptions = { durationMs: number; delayMs: number; easing: string; loop: boolean };

/** Local-time points at which an explicit keyframe stop is needed for one window. */
function localStopPoints(window: MotionWindow): number[] {
  const points = new Set<number>([0, 1]);
  if (window.start > 0) points.add(window.start);
  if (window.end < 1) points.add(window.end);
  return [...points].sort((a, b) => a - b);
}

/** Opacity at local time p under the same hold-ramp-hold shape rectAt already uses. */
function fadeValueAt(trajectory: Trajectory, p: number): number {
  const { start, end } = trajectory.window;
  const s = p <= start ? 0 : p >= end ? 1 : (p - start) / (end - start);
  return trajectory.fade === "in" ? s : 1 - s;
}

type GlobalStop = { frac: number; value: string };

function emitSequenceSvg(
  states: State[],
  segments: Segment[],
  options: EmitOptions,
): { svg: string; hardCut: string[]; clippedOnExit: string[] } {
  const segmentCount = segments.length;
  const totalDurationMs = options.durationMs * segmentCount;
  const count = options.loop ? "infinite" : "1";
  const timing = `${totalDurationMs}ms ${options.easing} ${options.delayMs}ms ${count} both`;

  const finalState = states[states.length - 1]!;

  // Every id that ever fades out and is not present in the final state departs
  // for good somewhere along the way (the reappearance guard already refused
  // the other case). Drawn once, at the position it left from, exactly the
  // way the two-state command re-injects a disappearing element.
  const departedByOwner = new Map<string, LaidOutFigure["elements"]>();
  for (const segment of segments) {
    const leavingIds = new Set(
      segment.timeline.faded.filter((fade) => fade.direction === "out").map((fade) => fade.id),
    );
    if (leavingIds.size === 0) continue;
    const before = states[segment.index]!.rendered.figure;
    const leaving = before.elements.filter((element) => leavingIds.has(element.id));
    for (const element of leaving) {
      if (element.kind === "box" && departedByOwner.has(element.id)) continue;
      const bucket = departedByOwner.get(element.id) ?? [];
      bucket.push(element);
      departedByOwner.set(element.id, bucket);
    }
  }
  const departed = [...departedByOwner.values()].flat();

  const drawn: LaidOutFigure = {
    ...finalState.rendered.figure,
    elements: [...departed, ...finalState.rendered.figure.elements],
  };
  const baseSvg =
    departed.length === 0
      ? finalState.rendered.svg
      : toSvg(drawn, finalState.rendered.effectiveSpec.title);

  const boxesById = new Map(
    drawn.elements.filter((e): e is PlacedBox => e.kind === "box").map((b) => [b.id, b]),
  );
  const textByOwner = new Map<string, PlacedText[]>();
  for (const element of drawn.elements) {
    if (element.kind !== "text" || element.ownerId === null) continue;
    const existing = textByOwner.get(element.ownerId);
    if (existing) existing.push(element);
    else textByOwner.set(element.ownerId, [element]);
  }
  const withLabels = (id: string): string[] => [
    id,
    ...(textByOwner.get(id)?.map((text) => text.id) ?? []),
  ];

  // Every box that is a participant in at least one segment, in stable order.
  const ids = new Set<string>();
  for (const segment of segments) for (const id of segment.trajectories.keys()) ids.add(id);

  const keyframeBlocks: string[] = [];
  const rules: string[] = [];
  const stilled: string[] = [];
  const hidden: string[] = [];
  const hardCut = new Set<string>();
  const clippedOnExit = new Set<string>();
  let seq = 0;

  for (const id of ids) {
    const box = boxesById.get(id);
    const participations = segments
      .filter((segment) => segment.trajectories.has(id))
      .map((segment) => ({ segment, trajectory: segment.trajectories.get(id)! }));

    const drawnRect = box !== undefined ? checkRect(box) : departedRect(departedByOwner, id);

    // -- move track ---------------------------------------------------------
    const moveStops: GlobalStop[] = [];
    const rotate =
      box?.rotation === undefined || box.rotationCenter === undefined
        ? ""
        : `rotate(${num(box.rotation)}, ${num(box.rotationCenter.x)}, ${num(box.rotationCenter.y)}) `;
    for (const { segment, trajectory } of participations) {
      for (const p of localStopPoints(trajectory.window)) {
        const rect = rectAtLocal(trajectory, p);
        const dx = rect.x - drawnRect.x;
        const dy = rect.y - drawnRect.y;
        const globalFrac = (segment.index + p) / segmentCount;
        moveStops.push({
          frac: globalFrac,
          value: `transform: ${rotate}translate(${num(dx)}px, ${num(dy)}px);`,
        });
      }
    }
    const moves = moveStops.some((stop) => !/translate\(0px, 0px\)/.test(stop.value));
    if (moves) {
      const suffix = `${cssSafe(id)}-${seq++}`;
      const name = `pr-seq-move-${suffix}`;
      keyframeBlocks.push(`@keyframes ${name} { ${renderStops(moveStops)} }`);
      for (const target of withLabels(id)) {
        rules.push(`#${cssId(target)} { animation: ${name} ${timing}; }`);
        stilled.push(`#${cssId(target)}`);
      }
      // Disclosure, generalised from ADR 0013: a jump between two segments'
      // drawn positions where nothing was actually tweened between them --
      // the same "moved but also changed size, style or text" hard-cut, just
      // possibly several scenes apart.
      for (const { trajectory } of participations) {
        if (
          !trajectory.tweened &&
          (trajectory.from.x !== trajectory.to.x || trajectory.from.y !== trajectory.to.y)
        ) {
          hardCut.add(id);
        }
      }
    }

    // -- fade track -----------------------------------------------------
    const fadeStops: GlobalStop[] = [];
    let lastFadeDirection: "in" | "out" | null = null;
    for (const { segment, trajectory } of participations) {
      if (trajectory.fade === null) continue;
      lastFadeDirection = trajectory.fade;
      for (const p of localStopPoints(trajectory.window)) {
        const globalFrac = (segment.index + p) / segmentCount;
        fadeStops.push({ frac: globalFrac, value: `opacity: ${num(fadeValueAt(trajectory, p))};` });
      }
      if (trajectory.fade === "out") {
        const rect = trajectory.from;
        if (
          rect.x < 0 ||
          rect.y < 0 ||
          rect.x + rect.width > drawn.width ||
          rect.y + rect.height > drawn.height
        ) {
          clippedOnExit.add(id);
        }
      }
    }
    if (fadeStops.length > 0) {
      const suffix = `${cssSafe(id)}-${seq++}`;
      const name = `pr-seq-fade-${suffix}`;
      keyframeBlocks.push(`@keyframes ${name} { ${renderStops(fadeStops)} }`);
      for (const target of withLabels(id)) {
        rules.push(`#${cssId(target)} { animation: ${name} ${timing}; }`);
        (lastFadeDirection === "out" ? hidden : stilled).push(`#${cssId(target)}`);
      }
    }
  }

  // -- route tracks (ADR 0017) ------------------------------------------
  //
  // A connector's own geometry, not a transform on it: `d` is animated so the
  // polyline is redrawn each frame, which is the only way a line whose
  // endpoints move can stay attached to them. The selector reaches PAST the
  // element's group to the <path> itself, since `d` means nothing on a <g>,
  // and stops at the direct child so an arrowhead sibling is left alone.
  const routeIds = new Set<string>();
  for (const segment of segments) for (const id of segment.routes.keys()) routeIds.add(id);

  for (const id of routeIds) {
    const participations = segments
      .filter((segment) => segment.routes.has(id))
      .map((segment) => ({ segment, route: segment.routes.get(id)! }));
    if (!participations.some(({ route }) => route.tweened)) continue;

    const routeStops: GlobalStop[] = [];
    for (const { segment, route } of participations) {
      for (const p of localStopPoints(route.window)) {
        routeStops.push({
          frac: (segment.index + p) / segmentCount,
          value: `d: path("${pathData(pointsAt(route, p))}");`,
        });
      }
    }

    const suffix = `${cssSafe(id)}-${seq++}`;
    const name = `pr-seq-route-${suffix}`;
    keyframeBlocks.push(`@keyframes ${name} { ${renderStops(routeStops)} }`);
    const selector = `#${cssId(id)} > path`;
    rules.push(`${selector} { animation: ${name} ${timing}; }`);
    stilled.push(selector);
  }

  if (keyframeBlocks.length === 0 && rules.length === 0) {
    return { svg: baseSvg, hardCut: [], clippedOnExit: [] };
  }

  const reduced: string[] = [];
  if (stilled.length > 0) reduced.push(`${unique(stilled).join(", ")} { animation: none; }`);
  if (hidden.length > 0) reduced.push(`${unique(hidden).join(", ")} { animation: none; opacity: 0; }`);
  const reducedBlock =
    reduced.length === 0 ? "" : ` @media (prefers-reduced-motion: reduce) { ${reduced.join(" ")} }`;

  const style = `<style>${[...keyframeBlocks, ...rules].join(" ")}${reducedBlock}</style>`;
  const svg = baseSvg.replace(/^(<svg[^>]*>)/, `$1\n${style}`);

  return {
    svg,
    hardCut: [...hardCut].sort(),
    clippedOnExit: [...clippedOnExit].sort(),
  };
}

function rectAtLocal(trajectory: Trajectory, p: number) {
  const { start, end } = trajectory.window;
  const s = p <= start ? 0 : p >= end ? 1 : (p - start) / (end - start);
  return {
    x: trajectory.from.x + (trajectory.to.x - trajectory.from.x) * s,
    y: trajectory.from.y + (trajectory.to.y - trajectory.from.y) * s,
    width: trajectory.to.width,
    height: trajectory.to.height,
  };
}

function departedRect(
  departedByOwner: Map<string, LaidOutFigure["elements"]>,
  id: string,
): { x: number; y: number; width: number; height: number } {
  const bucket = departedByOwner.get(id);
  const box = bucket?.find((element): element is PlacedBox => element.kind === "box");
  if (box === undefined) {
    // Only reachable if a text-only id somehow became a trajectory participant,
    // which renderedTrajectories never does (box-only) -- kept as a named
    // refusal rather than a silent zero-rect, per this project's convention.
    throw new SpecError(`animate: internal error -- no drawn position found for "${id}"`);
  }
  return checkRect(box);
}

/**
 * If a track's first or last explicit stop does not reach the very edge of
 * the whole run, CSS synthesises the missing 0%/100% keyframe from the
 * property's UNANIMATED default -- opacity 1, no transform -- not from the
 * track's own last value. For an element that departs mid-sequence that
 * synthesis silently ramps it back to fully visible after its fade-out ends;
 * for one that appears mid-sequence it would be visible from t=0. Anchoring
 * both edges explicitly is what makes `animation-fill-mode: both` hold the
 * track's OWN boundary value rather than the browser's default one.
 */
function padToFullRange(stops: GlobalStop[]): GlobalStop[] {
  if (stops.length === 0) return stops;
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  const out = [...stops];
  if (first.frac > 1e-9) out.unshift({ frac: 0, value: first.value });
  if (last.frac < 1 - 1e-9) out.push({ frac: 1, value: last.value });
  return out;
}

function renderStops(stops: GlobalStop[]): string {
  return padToFullRange(stops)
    .map((stop) => `${pct(stop.frac)} { ${stop.value} }`)
    .join(" ");
}

function unique(selectors: string[]): string[] {
  return [...new Set(selectors)];
}

// Re-exported so a consumer can check whether a sequence used stagger at all,
// without reaching into every segment's trajectories itself.
export { isStaggered };
