/**
 * CSS-@keyframes SVG emission (ADR 0012, M11; extended by ADR 0014, M11.2).
 *
 * CSS animation over SMIL: this project's whole portability discipline
 * (font embedding, PDF export, check:independent's second-opinion render)
 * already depends on a plain browser/SVG surface, and CSS keyframes are a
 * strict subset of that surface, where SMIL's status is the only one ever
 * in question. Choosing the side that is not in question resolves the
 * choice rather than leaving it open.
 *
 * The base SVG is rendered from the second state PLUS the elements that
 * disappear, re-injected at their first-state position (M11.2 -- before that
 * they were dropped at t=0 while ADR 0012 claimed they faded, one of the
 * three false disclosures ADR 0013 corrected). Each element's own
 * `<g id="...">` wrapper is the animation target; render/svg.ts's
 * `wrapElement` already gives every box and text exactly one, so svg.ts never
 * needed changing to make them individually targetable.
 *
 * Nothing here decides what moves. The trajectories come from
 * src/anim/trajectory.ts, which the motion check reads too, so the animation
 * that ships and the animation that is verified cannot be different ones --
 * the defect ADR 0013 exists to close.
 *
 * Connectors are still not animated: one is pinned to its second-state route
 * for the whole transition while its endpoints glide toward it. Visibly
 * imperfect, honestly described, and M12's job to fix.
 *
 * Stagger (ADR 0015) is emitted as KEYFRAME STOPS, never as animation-delay.
 * Every element keeps one duration and one clock; an element that moves only
 * during [0.2, 0.7] gets `0%, 20% { ...start } 70%, 100% { ...end }`. That
 * distinction is not cosmetic: a delay would put elements on different clocks
 * and break the argument that one shared monotone reparametrisation of time
 * leaves the motion check exact. A keyframe stop leaves it intact.
 */

import type { LaidOutFigure, MotionWindow, PlacedBox, PlacedText } from "../ir/types.ts";
import type { Trajectory } from "./trajectory.ts";
import type { RouteTrajectory } from "./route.ts";
import { pathData } from "./route.ts";

export type EmitAnimatedSvgOptions = {
  /** Total transition length. Default 500ms. */
  durationMs?: number;
  /** Held before the transition starts. Default 0. */
  delayMs?: number;
  /** A validated CSS timing function; see src/anim/easing.ts. Default "linear". */
  easing?: string;
  /** Repeat forever instead of settling on the second state. Default false. */
  loop?: boolean;
};

export function emitAnimatedSvg(
  baseSvg: string,
  drawn: LaidOutFigure,
  trajectories: Map<string, Trajectory>,
  routes: Map<string, RouteTrajectory>,
  options: EmitAnimatedSvgOptions = {},
): string {
  const durationMs = options.durationMs ?? 500;
  const delayMs = options.delayMs ?? 0;
  const easing = options.easing ?? "linear";
  const count = options.loop === true ? "infinite" : "1";
  // `both`, not `forwards`. With a delay, `forwards` alone leaves each element
  // in its natural resting state during the hold -- which for a mover is where
  // it ENDS -- so the transition would begin by snapping backwards. `both`
  // applies the `from` keyframe through the delay as well, which is what a
  // hold on the first state has to mean.
  const timing = `${durationMs}ms ${easing} ${delayMs}ms ${count} both`;

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

  const keyframeBlocks: string[] = [];
  const rules: string[] = [];
  // Under reduced motion every element jumps straight to where the transition
  // would have left it. For a mover or a newcomer that is its natural resting
  // state, so switching the animation off is enough; a box on its way out has
  // to be told, since its natural state is still visible.
  const stilled: string[] = [];
  const hidden: string[] = [];

  // Index-suffixed so two ids that differ only in characters CSS cannot carry
  // (`a.b` and `a_b` both slug to `a_b`) cannot collide onto one @keyframes
  // name, where the second would silently win and animate the first box from
  // the wrong place.
  let seq = 0;

  for (const trajectory of trajectories.values()) {
    const suffix = `${cssSafe(trajectory.id)}-${seq++}`;

    if (trajectory.tweened) {
      const box = boxesById.get(trajectory.id)!;
      const dx = trajectory.from.x - trajectory.to.x;
      const dy = trajectory.from.y - trajectory.to.y;
      // A box already carries a static rotate() on its own <g> when rotateBox
      // set one (ADR 0012's guard requires it to be identical in both states,
      // so it is safe to reapply unchanged here). CSS `animation` replaces a
      // presentation `transform` attribute outright, so the rotation has to be
      // composed INTO every keyframe, not left to combine with it.
      const rotate =
        box.rotation === undefined || box.rotationCenter === undefined
          ? ""
          : `rotate(${num(box.rotation)}, ${num(box.rotationCenter.x)}, ${num(box.rotationCenter.y)}) `;
      const name = `pr-move-${suffix}`;
      const held = `transform: ${rotate}translate(${num(dx)}px, ${num(dy)}px);`;
      const arrived = `transform: ${rotate}translate(0, 0);`;
      keyframeBlocks.push(`@keyframes ${name} { ${stops(trajectory, held, arrived)} }`);
      for (const target of withLabels(trajectory.id)) {
        rules.push(`#${cssId(target)} { animation: ${name} ${timing}; }`);
        stilled.push(`#${cssId(target)}`);
      }
      continue;
    }

    if (trajectory.fade === null) continue;

    const [from, to] = trajectory.fade === "in" ? [0, 1] : [1, 0];
    const name = `pr-fade-${trajectory.fade}-${suffix}`;
    keyframeBlocks.push(
      `@keyframes ${name} { ${stops(trajectory, `opacity: ${from};`, `opacity: ${to};`)} }`,
    );
    for (const target of withLabels(trajectory.id)) {
      rules.push(`#${cssId(target)} { animation: ${name} ${timing}; }`);
      (trajectory.fade === "out" ? hidden : stilled).push(`#${cssId(target)}`);
    }
  }

  // Route tracks (ADR 0017). A connector's own `d` is animated rather than a
  // transform on its group: only redrawing the polyline keeps a line attached
  // to endpoints that are themselves moving. `> path` reaches past the group,
  // where `d` would mean nothing, and stops short of any arrowhead sibling.
  for (const route of routes.values()) {
    if (!route.tweened) continue;
    const suffix = `${cssSafe(route.id)}-${seq++}`;
    const name = `pr-route-${suffix}`;
    const held = `d: path("${pathData(route.from)}");`;
    const arrived = `d: path("${pathData(route.to)}");`;
    keyframeBlocks.push(`@keyframes ${name} { ${stops(route, held, arrived)} }`);
    const selector = `#${cssId(route.id)} > path`;
    rules.push(`${selector} { animation: ${name} ${timing}; }`);
    stilled.push(selector);
  }

  if (keyframeBlocks.length === 0 && rules.length === 0) return baseSvg;

  // A figure is a document, and this project already holds itself to WCAG AA
  // on contrast. Motion someone has asked their system not to show is the
  // same kind of claim on a reader, so it is honoured the same way.
  const reduced: string[] = [];
  if (stilled.length > 0) reduced.push(`${unique(stilled).join(", ")} { animation: none; }`);
  if (hidden.length > 0) {
    reduced.push(`${unique(hidden).join(", ")} { animation: none; opacity: 0; }`);
  }
  const reducedBlock =
    reduced.length === 0 ? "" : ` @media (prefers-reduced-motion: reduce) { ${reduced.join(" ")} }`;

  const style = `<style>${[...keyframeBlocks, ...rules].join(" ")}${reducedBlock}</style>`;
  return baseSvg.replace(/^(<svg[^>]*>)/, `$1\n${style}`);
}

/**
 * The keyframe body for one element, holding at `held` until its window opens
 * and at `arrived` after it closes. An unstaggered element collapses to the
 * plain from/to pair it always emitted.
 */
function stops(trajectory: { window: MotionWindow }, held: string, arrived: string): string {
  const { start, end } = trajectory.window;
  if (start <= 0 && end >= 1) return `from { ${held} } to { ${arrived} }`;
  const open = start <= 0 ? "0%" : `0%, ${pct(start)}`;
  const close = end >= 1 ? "100%" : `${pct(end)}, 100%`;
  return `${open} { ${held} } ${close} { ${arrived} }`;
}

/**
 * Keyframe percentage, rounded to 6 decimal places rather than num()'s 2.
 * A stop at k/segmentCount*100 is only exact when segmentCount divides 100 --
 * for segmentCount=3 that is 33.333...%, and 2 decimals (33.33%) puts the
 * ACTUAL keyframe far enough from the intended instant that sampling exactly
 * at that fraction of the duration lands just short of it (opacity 0.9999
 * instead of 1, found by a browser test rather than assumed safe). Pixel and
 * opacity values stay at num()'s coarser rounding; only the keyframe's own
 * position on the timeline needs this much precision.
 */
export function pct(fraction: number): string {
  return `${(Math.round(fraction * 100 * 1e6) / 1e6).toString()}%`;
}

function unique(selectors: string[]): string[] {
  return [...new Set(selectors)];
}

export function num(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** SVG/HTML ids may contain characters CSS identifiers cannot start or contain unescaped; this project's own ids are always simple, but escape defensively. */
export function cssSafe(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function cssId(id: string): string {
  // CSS.escape would be the real answer; this project's ids are always
  // author-chosen simple tokens (validated indirectly by JSON key rules),
  // so a defensive escape of the few characters that matter is enough.
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
