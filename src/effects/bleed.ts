/**
 * How far past its own edges does an effect actually put ink?
 *
 * This is the part of an effects layer that is normally skipped, and skipping
 * it produces the two defects everybody has seen and nobody can name:
 *
 *   - A shadow with a flat, straight edge, because the filter region defaulted
 *     to the SVG 1.1 `-10% / +120%` box and quietly guillotined the halo. The
 *     figure does not look broken, it looks *cheap*, and no check that only
 *     examines shapes will ever report it.
 *   - A glow sliced off by the canvas edge, because the canvas was sized to
 *     the geometry and the glow is not geometry.
 *
 * Both are geometry questions with exact answers, so this module answers them
 * exactly and hands the numbers to checks.ts, which treats a clipped halo as
 * the defect it is.
 *
 * A `Bleed` is four outward margins from an element's own bounding box, in SVG
 * user units. Never negative: an effect that pulls ink inward reaches nothing.
 */

import type { Rect } from "../ir/types.ts";
import type { ResolvedEffect } from "./types.ts";

export type Bleed = { left: number; top: number; right: number; bottom: number };

export const NO_BLEED: Bleed = { left: 0, top: 0, right: 0, bottom: 0 };

/**
 * Where a Gaussian is treated as having stopped.
 *
 * A Gaussian never actually reaches zero, so any filter region is a truncation
 * and the only question is where to cut. The SVG filter spec's own guidance is
 * three standard deviations, which leaves under 0.3% of the mass outside — far
 * below one step of 8-bit alpha, so the cut is invisible rather than merely
 * small. `stdDeviation` is what SVG wants; a `blur` radius in this IR is the
 * CSS-style figure (about twice sigma) so that a value lifted from a CSS
 * design token keeps its meaning.
 */
export const GAUSSIAN_EXTENT_SIGMAS = 3;

export function sigmaOf(blurRadius: number): number {
  return blurRadius / 2;
}

export function gaussianExtent(blurRadius: number): number {
  return sigmaOf(blurRadius) * GAUSSIAN_EXTENT_SIGMAS;
}

/**
 * The reach of a whole chain.
 *
 * Order matters and composing is not the same as taking a maximum: a blur
 * placed after a shadow blurs the shadow as well, so it spreads from the
 * shadow's already-offset edge rather than from the element's. The running
 * bleed is therefore threaded through the chain, exactly as the filter
 * primitives thread their results through each other.
 */
export function bleedOf(effects: readonly ResolvedEffect[]): Bleed {
  let bleed = NO_BLEED;
  for (const effect of effects) bleed = advance(bleed, effect);
  return bleed;
}

function advance(current: Bleed, effect: ResolvedEffect): Bleed {
  switch (effect.kind) {
    case "shadow": {
      // The cast copy is everything drawn so far, moved and blurred; the
      // result keeps the original too, so the reach is the union of both.
      const extent = gaussianExtent(effect.blur);
      const cast: Bleed = {
        left: current.left + extent - effect.dx,
        top: current.top + extent - effect.dy,
        right: current.right + extent + effect.dx,
        bottom: current.bottom + extent + effect.dy,
      };
      return union(current, cast);
    }
    case "glow": {
      const extent = gaussianExtent(effect.radius);
      return grow(current, extent);
    }
    case "blur":
      return grow(current, gaussianExtent(effect.radius));
    case "occlusion":
      // Composited back inside the source alpha. An inner shadow that escaped
      // its own shape would not be an inner shadow.
      return current;
    case "brightness":
    case "saturate":
    case "tint":
    case "grain":
    case "bevel":
    case "hue-rotate":
      // Colour and lighting operations. They repaint the pixels that are
      // already there and produce none outside them.
      return current;
    case "sheen":
      // Painted geometry clipped to the box, not a filter at all.
      return current;
    case "outline":
      // Hard-edged, zero blur by construction: the dilated alpha reaches
      // exactly `width` past the source, no Gaussian tail to account for.
      return grow(current, effect.width);
    default: {
      const exhaustive: never = effect;
      return exhaustive;
    }
  }
}

function grow(bleed: Bleed, by: number): Bleed {
  return {
    left: bleed.left + by,
    top: bleed.top + by,
    right: bleed.right + by,
    bottom: bleed.bottom + by,
  };
}

export function union(a: Bleed, b: Bleed): Bleed {
  return {
    left: Math.max(0, a.left, b.left),
    top: Math.max(0, a.top, b.top),
    right: Math.max(0, a.right, b.right),
    bottom: Math.max(0, a.bottom, b.bottom),
  };
}

export function isEmpty(bleed: Bleed): boolean {
  return bleed.left <= 0 && bleed.top <= 0 && bleed.right <= 0 && bleed.bottom <= 0;
}

/**
 * The smallest rectangle covering all of `rects`; empty for an empty list.
 *
 * Lives here rather than in checks.ts because effects need it before any check
 * runs — a filter region is computed at emission time. checks.ts's `unionOf`
 * is this function, so the two can never drift apart and start disagreeing
 * about where an element is.
 */
export function unionRects(rects: readonly Rect[]): Rect {
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

/** The rectangle an element's ink occupies once its effects are applied. */
export function inkBounds(box: Rect, bleed: Bleed): Rect {
  return {
    x: box.x - bleed.left,
    y: box.y - bleed.top,
    width: box.width + bleed.left + bleed.right,
    height: box.height + bleed.top + bleed.bottom,
  };
}

/**
 * The `<filter>` region, in user space.
 *
 * Deliberately `userSpaceOnUse` with explicit numbers rather than the default
 * bounding-box percentages. Percentages of *what* is the trap: an element one
 * pixel tall gets a region a tenth of a pixel of slack, so the same shadow
 * that looks right on a card is sheared off a rule or a thin connector. An
 * absolute region computed from the effect's own reach behaves the same at
 * every size.
 *
 * The extra pad covers rounding at emission (coordinates are written to two
 * decimals) and antialiasing at the region boundary.
 */
export const REGION_PAD = 2;

export function filterRegion(box: Rect, bleed: Bleed): Rect {
  const region = inkBounds(box, bleed);
  return {
    x: region.x - REGION_PAD,
    y: region.y - REGION_PAD,
    width: region.width + REGION_PAD * 2,
    height: region.height + REGION_PAD * 2,
  };
}

/**
 * Does this chain need a `<filter>` at all?
 *
 * `sheen` is drawn as painted geometry, so a block whose only effect is a
 * sheen must not be wrapped in an empty filter — an empty filter is not a
 * no-op in SVG, it makes the element render as nothing.
 */
export function needsFilter(effects: readonly ResolvedEffect[]): boolean {
  return effects.some((effect) => effect.kind !== "sheen");
}
