/**
 * The two-state diff — M4's second probe.
 *
 * Animation is deferred, but the question it rests on can be answered now
 * without rendering a single frame: author one figure as two states, lay both
 * out, and see whether the difference between them is EXPRESSIBLE. If every
 * element that persists can be matched across states and every change falls
 * into a named category, the IR can carry time. If elements cannot be matched,
 * no amount of tweening engine will help — you would be cross-fading two
 * unrelated pictures.
 *
 * So the real subject here is IDENTITY, not motion. Matching is by id, which
 * makes `normalise` assigning stable ids the load-bearing property: an element
 * that changes its id between states has, as far as any animation is
 * concerned, died and been replaced by a stranger.
 */

import type { LaidOutFigure, PlacedBox, PlacedElement, PlacedText, Rect } from "../ir/types.ts";

export type DeltaKind =
  | "appeared"
  | "disappeared"
  | "moved"
  | "resized"
  | "restyled"
  | "retexted"
  | "unchanged";

export type Delta = {
  id: string;
  kind: DeltaKind;
  /** What changed, in the terms an animator would need. */
  detail?: string;
  from?: Rect;
  to?: Rect;
};

export type FigureDiff = {
  deltas: Delta[];
  counts: Record<DeltaKind, number>;
  /** Ids present in both states. The population an animation can actually tween. */
  persisted: number;
  /**
   * True when every element in both states was matched or explained. False
   * means the IR could not express the transition and the probe has failed.
   */
  expressible: boolean;
  unexplained: string[];
};

const MOVE_EPSILON = 0.5;

export function diffFigures(before: LaidOutFigure, after: LaidOutFigure): FigureDiff {
  const beforeById = new Map(before.elements.map((element) => [element.id, element]));
  const afterById = new Map(after.elements.map((element) => [element.id, element]));

  const deltas: Delta[] = [];
  const unexplained: string[] = [];

  for (const [id, element] of beforeById) {
    if (!afterById.has(id)) {
      deltas.push({ id, kind: "disappeared", from: boxOf(element) });
    }
  }

  for (const [id, next] of afterById) {
    const previous = beforeById.get(id);
    if (previous === undefined) {
      deltas.push({ id, kind: "appeared", to: boxOf(next) });
      continue;
    }
    if (previous.kind !== next.kind) {
      // Same id, different kind: not a transition, an identity collision.
      unexplained.push(`${id} changed kind from ${previous.kind} to ${next.kind}`);
      continue;
    }
    deltas.push(compare(id, previous, next));
  }

  const counts = {
    appeared: 0,
    disappeared: 0,
    moved: 0,
    resized: 0,
    restyled: 0,
    retexted: 0,
    unchanged: 0,
  } as Record<DeltaKind, number>;
  for (const delta of deltas) counts[delta.kind] += 1;

  const persisted = [...afterById.keys()].filter((id) => beforeById.has(id)).length;

  return {
    deltas,
    counts,
    persisted,
    expressible: unexplained.length === 0,
    unexplained,
  };
}

function compare(id: string, previous: PlacedElement, next: PlacedElement): Delta {
  const from = boxOf(previous);
  const to = boxOf(next);

  if (previous.kind === "text" && next.kind === "text") {
    const before = (previous as PlacedText).lines.map((line) => line.text).join("\n");
    const after = (next as PlacedText).lines.map((line) => line.text).join("\n");
    if (before !== after) {
      return { id, kind: "retexted", from, to, detail: `"${truncate(before)}" -> "${truncate(after)}"` };
    }
  }

  if (previous.kind === "box" && next.kind === "box") {
    const a = previous as PlacedBox;
    const b = next as PlacedBox;
    if (a.fill !== b.fill || a.stroke !== b.stroke) {
      return {
        id,
        kind: "restyled",
        from,
        to,
        detail: `fill ${a.fill} -> ${b.fill}, stroke ${a.stroke} -> ${b.stroke}`,
      };
    }
  }

  const sizeChanged =
    Math.abs(from.width - to.width) > MOVE_EPSILON ||
    Math.abs(from.height - to.height) > MOVE_EPSILON;
  if (sizeChanged) {
    return {
      id,
      kind: "resized",
      from,
      to,
      detail:
        `${round(from.width)}x${round(from.height)} -> ${round(to.width)}x${round(to.height)}`,
    };
  }

  const movedBy = Math.hypot(to.x - from.x, to.y - from.y);
  if (movedBy > MOVE_EPSILON) {
    return {
      id,
      kind: "moved",
      from,
      to,
      detail: `by ${round(movedBy)}px`,
    };
  }

  return { id, kind: "unchanged", from, to };
}

function boxOf(element: PlacedElement): Rect {
  if (element.kind === "box") {
    return { x: element.x, y: element.y, width: element.width, height: element.height };
  }
  if (element.kind === "connector" || element.kind === "mark") {
    return union(element.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })));
  }
  return union(element.lines.map((line) => line.box));
}

function union(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function truncate(value: string): string {
  return value.length <= 28 ? value : `${value.slice(0, 28)}…`;
}
