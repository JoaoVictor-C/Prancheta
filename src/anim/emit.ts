/**
 * CSS-@keyframes SVG emission (ADR 0012, M11).
 *
 * CSS animation over SMIL: this project's whole portability discipline
 * (font embedding, PDF export, check:independent's second-opinion render)
 * already depends on a plain browser/SVG surface, and CSS keyframes are a
 * strict subset of that surface, where SMIL's status is the only one ever
 * in question. Choosing the side that is not in question resolves the
 * choice rather than leaving it open.
 *
 * Renders the AFTER state as the base SVG (via the existing toSvg) and
 * overlays a <style> block that animates each moved/appeared element's own
 * `<g id="...">` wrapper -- every box and text element already gets exactly
 * one, from render/svg.ts's `wrapElement`, so no change to svg.ts was
 * needed to make elements individually targetable.
 *
 * Scope, matching ADR 0012: only `moved` (translate) and `appeared`
 * (opacity fade-in) are animated. `disappeared` elements are not in the
 * AFTER figure's SVG at all and are not re-injected in M11 -- they vanish
 * at t=0 rather than fading, a disclosed simplification, not a claim this
 * ADR's checks depend on (the transition check only reasons about boxes
 * present in BOTH states).
 */

import type { LaidOutFigure, PlacedBox, PlacedText } from "../ir/types.ts";
import type { AnimationTimeline } from "./timeline.ts";

export type EmitAnimatedSvgOptions = {
  /** Total transition length. Default 500ms. */
  durationMs?: number;
};

export function emitAnimatedSvg(
  afterSvg: string,
  after: LaidOutFigure,
  timeline: AnimationTimeline,
  options: EmitAnimatedSvgOptions = {},
): string {
  const durationMs = options.durationMs ?? 500;
  const boxesById = new Map(
    after.elements.filter((e): e is PlacedBox => e.kind === "box").map((b) => [b.id, b]),
  );
  const textByOwner = new Map<string, PlacedText[]>();
  for (const element of after.elements) {
    if (element.kind !== "text" || element.ownerId === null) continue;
    const existing = textByOwner.get(element.ownerId);
    if (existing) existing.push(element);
    else textByOwner.set(element.ownerId, [element]);
  }

  const keyframeBlocks: string[] = [];
  const rules: string[] = [];

  for (const move of timeline.moved) {
    const box = boxesById.get(move.id);
    if (box === undefined) continue;
    const dx = move.from.x - move.to.x;
    const dy = move.from.y - move.to.y;
    // A box already carries a static rotate() on its own <g> when rotateBox
    // set one (ADR 0012's guard requires it to be identical in both states,
    // so it is safe to reapply unchanged here). CSS `animation` replaces a
    // presentation `transform` attribute outright, so the rotation has to be
    // composed INTO every keyframe, not left to combine with it.
    const rotate =
      box.rotation === undefined || box.rotationCenter === undefined
        ? ""
        : `rotate(${num(box.rotation)}, ${num(box.rotationCenter.x)}, ${num(box.rotationCenter.y)}) `;
    const name = `pr-move-${cssSafe(move.id)}`;
    keyframeBlocks.push(
      `@keyframes ${name} { from { transform: ${rotate}translate(${num(dx)}px, ${num(dy)}px); } ` +
        `to { transform: ${rotate}translate(0, 0); } }`,
    );
    const targets = [move.id, ...(textByOwner.get(move.id)?.map((t) => t.id) ?? [])];
    for (const targetId of targets) {
      rules.push(`#${cssId(targetId)} { animation: ${name} ${durationMs}ms linear forwards; }`);
    }
  }

  for (const fade of timeline.faded) {
    if (fade.direction !== "in") continue; // "out" elements aren't in this SVG; see module docs.
    const name = `pr-fade-in-${cssSafe(fade.id)}`;
    keyframeBlocks.push(`@keyframes ${name} { from { opacity: 0; } to { opacity: 1; } }`);
    rules.push(`#${cssId(fade.id)} { animation: ${name} ${durationMs}ms linear forwards; }`);
  }

  if (keyframeBlocks.length === 0 && rules.length === 0) return afterSvg;

  const style = `<style>${[...keyframeBlocks, ...rules].join(" ")}</style>`;
  return afterSvg.replace(/^(<svg[^>]*>)/, `$1\n${style}`);
}

function num(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** SVG/HTML ids may contain characters CSS identifiers cannot start or contain unescaped; this project's own ids are always simple, but escape defensively. */
function cssSafe(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function cssId(id: string): string {
  // CSS.escape would be the real answer; this project's ids are always
  // author-chosen simple tokens (validated indirectly by JSON key rules),
  // so a defensive escape of the few characters that matter is enough.
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
