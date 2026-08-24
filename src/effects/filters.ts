/**
 * Effect chains -> SVG `<filter>` elements.
 *
 * Everything here is desugared to SVG 1.1 filter primitives on purpose.
 * `feDropShadow` would replace six lines with one and is supported by every
 * browser — and by noticeably fewer of the tools a figure actually gets opened
 * in, where an unsupported filter does not degrade, it renders the element as
 * nothing. This is render/svg.ts's argument against `<marker>` applied one
 * layer up: a missing arrowhead reverses a diagram's meaning, and a missing
 * filter deletes the element the diagram was about. `feGaussianBlur`,
 * `feOffset`, `feFlood`, `feComposite`, `feMerge`, `feColorMatrix`,
 * `feComponentTransfer`, `feTurbulence` and `feSpecularLighting` are SVG 1.1
 * and are implemented everywhere.
 *
 * One further rule: every primitive names its input explicitly. `SourceAlpha`
 * is only meaningful for the *source*, so a chain that reached for it after
 * the second effect would silently shadow the original element instead of the
 * blurred, tinted thing the chain had built by then. Alpha is extracted with
 * an explicit `feColorMatrix` from whatever the previous step produced.
 *
 * Filters are content-addressed: two elements with the same chain and the same
 * region share one definition, and ids are handed out in first-use order so
 * the same spec always produces byte-identical SVG.
 */

import type { Gradient, Rect } from "../ir/types.ts";
import { filterRegion, needsFilter, sigmaOf } from "./bleed.ts";
import type { Bleed } from "./bleed.ts";
import type { ResolvedEffect } from "./types.ts";

/** Collects the `<defs>` a figure needs, deduplicating by content. */
export class DefsRegistry {
  private readonly byContent = new Map<string, string>();
  private readonly ordered: string[] = [];

  /**
   * Register a filter for one element and get the id to point at, or null if
   * the chain needs no filter (a sheen-only chain is painted, not filtered).
   */
  filter(effects: readonly ResolvedEffect[], box: Rect, bleed: Bleed): string | null {
    if (effects.length === 0 || !needsFilter(effects)) return null;
    const region = filterRegion(box, bleed);
    const body = buildPrimitives(effects);
    const shape =
      `filterUnits="userSpaceOnUse" x="${num(region.x)}" y="${num(region.y)}" ` +
      `width="${num(region.width)}" height="${num(region.height)}" ` +
      // Linear light is what the filter maths assumes, but it is also the one
      // colour-space choice browsers and standalone renderers disagree on by
      // default. Naming it means the PNG from Chromium and the PNG from resvg
      // are the same picture rather than two plausible ones.
      `color-interpolation-filters="sRGB"`;
    return this.intern("pr-fx", `${shape}\n${body}`, (id) => `<filter id="${id}" ${shape}>\n${body}\n</filter>`);
  }

  /** Register the gradient a `sheen` paints with. */
  sheenGradient(strength: number, direction: "down" | "up" | "left" | "right"): string {
    const [x1, y1, x2, y2] =
      direction === "down"
        ? [0, 0, 0, 1]
        : direction === "up"
          ? [0, 1, 0, 0]
          : direction === "left"
            ? [1, 0, 0, 0]
            : [0, 0, 1, 0];
    const body =
      `<stop offset="0" stop-color="#FFFFFF" stop-opacity="${num(strength)}"/>` +
      `<stop offset="0.55" stop-color="#FFFFFF" stop-opacity="${num(strength * 0.18)}"/>` +
      `<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>`;
    const shape = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
    return this.intern(
      "pr-sheen",
      `${shape}|${body}`,
      (id) => `<linearGradient id="${id}" ${shape}>${body}</linearGradient>`,
    );
  }

  /**
   * The radial wash a canvas vignette paints with.
   *
   * `objectBoundingBox` units here, unlike every filter above, and for the
   * opposite reason: the vignette's object *is* the canvas, so a box-relative
   * gradient is exactly right and stays right at any figure size.
   */
  vignetteGradient(strength: number): string {
    const body =
      `<stop offset="0.45" stop-color="#000000" stop-opacity="0"/>` +
      `<stop offset="0.78" stop-color="#000000" stop-opacity="${num(strength * 0.45)}"/>` +
      `<stop offset="1" stop-color="#000000" stop-opacity="${num(strength)}"/>`;
    const shape = `cx="0.5" cy="0.5" r="0.75"`;
    return this.intern(
      "pr-vignette",
      `${shape}|${body}`,
      (id) => `<radialGradient id="${id}" ${shape}>${body}</radialGradient>`,
    );
  }

  /**
   * Register the gradient a Block's `fill`/`stroke` paints with (see
   * ir/types.ts's `Gradient`/`Paint`). Unlike `sheenGradient`, this is a
   * gradient the SPEC AUTHOR wrote, not one this project's design system
   * generates -- so it carries the author's own stops and direction/shape
   * verbatim rather than the fixed white-diagonal wash a sheen always is.
   * Kept as a distinct method rather than folded into `sheenGradient` because
   * the two answer different questions: a sheen is a highlight this project
   * paints over an element regardless of what asked for it; a Paint gradient
   * IS the element's own colour.
   */
  gradient(g: Gradient): string {
    const stops = g.stops
      .map((stop) => {
        const opacity = stop.opacity === undefined ? "" : ` stop-opacity="${num(stop.opacity)}"`;
        // Not escaped: ir/types.ts's validatePaint already restricts a stop's
        // colour to the same hex-or-keyword shape effects/types.ts requires,
        // so it cannot contain a quote or any other attribute-breaking
        // character, the same reasoning floodOf below already relies on.
        return `<stop offset="${num(stop.offset)}" stop-color="${stop.color}"${opacity}/>`;
      })
      .join("");
    if (g.kind === "radial") {
      const shape = `cx="0.5" cy="0.5" r="0.5"`;
      return this.intern(
        "pr-grad",
        `radial|${shape}|${stops}`,
        (id) => `<radialGradient id="${id}" ${shape}>${stops}</radialGradient>`,
      );
    }
    // objectBoundingBox (the default gradientUnits), like sheenGradient: the
    // gradient is defined relative to the shape's own box, so it stays right
    // at any size rather than being computed in absolute user units.
    const angle = ((g.angle ?? 90) * Math.PI) / 180;
    // A vector of unit length from the box's own centre, converted into the
    // x1/y1 -> x2/y2 pair objectBoundingBox units expect (0..1 each axis).
    const dx = Math.sin(angle) * 0.5;
    const dy = -Math.cos(angle) * 0.5;
    const shape = `x1="${num(0.5 - dx)}" y1="${num(0.5 - dy)}" x2="${num(0.5 + dx)}" y2="${num(0.5 + dy)}"`;
    return this.intern(
      "pr-grad",
      `linear|${shape}|${stops}`,
      (id) => `<linearGradient id="${id}" ${shape}>${stops}</linearGradient>`,
    );
  }

  private intern(prefix: string, key: string, build: (id: string) => string): string {
    const cacheKey = `${prefix}|${key}`;
    const existing = this.byContent.get(cacheKey);
    if (existing !== undefined) return existing;
    const id = `${prefix}-${this.ordered.length + 1}`;
    this.byContent.set(cacheKey, id);
    this.ordered.push(build(id));
    return id;
  }

  isEmpty(): boolean {
    return this.ordered.length === 0;
  }

  /** The `<defs>` block, or "" when the figure needs none. */
  toSvg(): string {
    if (this.ordered.length === 0) return "";
    return `<defs>\n${this.ordered.join("\n")}\n</defs>`;
  }
}

/**
 * Turn a chain into primitives, threading each step's result into the next.
 *
 * `input` starts as SourceGraphic and becomes a named result thereafter. A
 * step that produces nothing (a sheen) passes its input straight through.
 */
function buildPrimitives(effects: readonly ResolvedEffect[]): string {
  const parts: string[] = [];
  let input = "SourceGraphic";
  let counter = 0;
  const next = (): string => {
    counter += 1;
    return `pr${counter}`;
  };

  for (const effect of effects) {
    input = emit(effect, input, parts, next);
  }

  // The last primitive must be the filter's result, and SVG takes the last
  // one listed as exactly that — but only if something was emitted at all. A
  // filter with no primitives renders the element as transparent black, which
  // is why needsFilter() gates this whole path.
  return parts.join("\n");
}

function emit(
  effect: ResolvedEffect,
  input: string,
  parts: string[],
  next: () => string,
): string {
  switch (effect.kind) {
    case "shadow": {
      const alpha = next();
      const offset = next();
      const blurred = next();
      const flood = next();
      const coloured = next();
      const out = next();
      parts.push(alphaOf(input, alpha));
      parts.push(
        `<feOffset in="${alpha}" dx="${num(effect.dx)}" dy="${num(effect.dy)}" result="${offset}"/>`,
      );
      parts.push(gaussian(offset, effect.blur, blurred));
      parts.push(floodOf(effect.color, effect.opacity, flood));
      parts.push(`<feComposite in="${flood}" in2="${blurred}" operator="in" result="${coloured}"/>`);
      // Shadow under, element over. The other order would bury the figure
      // under its own shadow — visible immediately on a light shadow colour,
      // and easy to miss on a black one until someone changes the palette.
      parts.push(
        `<feMerge result="${out}"><feMergeNode in="${coloured}"/><feMergeNode in="${input}"/></feMerge>`,
      );
      return out;
    }
    case "glow": {
      const alpha = next();
      const blurred = next();
      const flood = next();
      const coloured = next();
      const out = next();
      parts.push(alphaOf(input, alpha));
      parts.push(gaussian(alpha, effect.radius, blurred));
      parts.push(floodOf(effect.color, effect.intensity, flood));
      parts.push(`<feComposite in="${flood}" in2="${blurred}" operator="in" result="${coloured}"/>`);
      // Twice, so the halo has a core rather than fading out uniformly from
      // the edge — one pass of a Gaussian reads as fog, two reads as light.
      parts.push(
        `<feMerge result="${out}"><feMergeNode in="${coloured}"/><feMergeNode in="${coloured}"/>` +
          `<feMergeNode in="${input}"/></feMerge>`,
      );
      return out;
    }
    case "blur": {
      const out = next();
      parts.push(gaussian(input, effect.radius, out));
      return out;
    }
    case "occlusion": {
      const alpha = next();
      const offset = next();
      const blurred = next();
      const rim = next();
      const flood = next();
      const coloured = next();
      const out = next();
      parts.push(alphaOf(input, alpha));
      parts.push(
        `<feOffset in="${alpha}" dx="${num(effect.dx)}" dy="${num(effect.dy)}" result="${offset}"/>`,
      );
      parts.push(gaussian(offset, effect.radius, blurred));
      // alpha minus its own blurred, offset copy: the band just inside the
      // edge the light does not reach. Subtracting this way keeps the result
      // inside the original alpha by construction, so an inner shadow cannot
      // leak outside the shape no matter what offset is asked for.
      parts.push(
        `<feComposite in="${alpha}" in2="${blurred}" operator="arithmetic" ` +
          `k1="0" k2="1" k3="-1" k4="0" result="${rim}"/>`,
      );
      parts.push(floodOf(effect.color, effect.opacity, flood));
      parts.push(`<feComposite in="${flood}" in2="${rim}" operator="in" result="${coloured}"/>`);
      parts.push(
        `<feMerge result="${out}"><feMergeNode in="${input}"/><feMergeNode in="${coloured}"/></feMerge>`,
      );
      return out;
    }
    case "brightness": {
      const out = next();
      const slope = num(effect.amount);
      parts.push(
        `<feComponentTransfer in="${input}" result="${out}">` +
          `<feFuncR type="linear" slope="${slope}"/>` +
          `<feFuncG type="linear" slope="${slope}"/>` +
          `<feFuncB type="linear" slope="${slope}"/>` +
          `</feComponentTransfer>`,
      );
      return out;
    }
    case "saturate": {
      const out = next();
      parts.push(
        `<feColorMatrix in="${input}" type="saturate" values="${num(effect.amount)}" result="${out}"/>`,
      );
      return out;
    }
    case "tint": {
      const flood = next();
      const clipped = next();
      const out = next();
      parts.push(floodOf(effect.color, 1, flood));
      parts.push(`<feComposite in="${flood}" in2="${input}" operator="in" result="${clipped}"/>`);
      // A weighted average of the two, not a blend mode: the weights are the
      // author's `amount` exactly, and arithmetic composite is the one mixing
      // primitive whose maths is identical in every renderer.
      parts.push(
        `<feComposite in="${input}" in2="${clipped}" operator="arithmetic" ` +
          `k1="0" k2="${num(1 - effect.amount)}" k3="${num(effect.amount)}" k4="0" result="${out}"/>`,
      );
      return out;
    }
    case "grain": {
      const noise = next();
      const mono = next();
      const shaped = next();
      const out = next();
      parts.push(
        `<feTurbulence type="fractalNoise" baseFrequency="${num(effect.scale)}" ` +
          `numOctaves="3" seed="${num(effect.seed)}" result="${noise}"/>`,
      );
      parts.push(`<feColorMatrix in="${noise}" type="saturate" values="0" result="${mono}"/>`);
      // Centre the noise on 1.0 and force it opaque, so multiplying by it
      // modulates the element instead of darkening or erasing it.
      parts.push(
        `<feComponentTransfer in="${mono}" result="${shaped}">` +
          `<feFuncR type="linear" slope="${num(effect.amount)}" intercept="${num(1 - effect.amount / 2)}"/>` +
          `<feFuncG type="linear" slope="${num(effect.amount)}" intercept="${num(1 - effect.amount / 2)}"/>` +
          `<feFuncB type="linear" slope="${num(effect.amount)}" intercept="${num(1 - effect.amount / 2)}"/>` +
          `<feFuncA type="linear" slope="0" intercept="1"/>` +
          `</feComponentTransfer>`,
      );
      // k1 only: a pure product. The element's own alpha survives untouched,
      // so grain never spreads past the shape it is texturing.
      parts.push(
        `<feComposite in="${input}" in2="${shaped}" operator="arithmetic" ` +
          `k1="1" k2="0" k3="0" k4="0" result="${out}"/>`,
      );
      return out;
    }
    case "bevel": {
      const alpha = next();
      const height = next();
      const lit = next();
      const clipped = next();
      const out = next();
      parts.push(alphaOf(input, alpha));
      // The blurred alpha is the height field: a hard edge would light as a
      // hard edge, which is a white outline, not a bevel.
      parts.push(gaussian(alpha, effect.depth, height));
      parts.push(
        `<feSpecularLighting in="${height}" surfaceScale="${num(effect.depth)}" ` +
          `specularConstant="${num(effect.strength)}" specularExponent="20" ` +
          `lighting-color="#FFFFFF" result="${lit}">` +
          `<feDistantLight azimuth="${num(effect.azimuth)}" elevation="${num(effect.elevation)}"/>` +
          `</feSpecularLighting>`,
      );
      parts.push(`<feComposite in="${lit}" in2="${alpha}" operator="in" result="${clipped}"/>`);
      parts.push(
        `<feComposite in="${input}" in2="${clipped}" operator="arithmetic" ` +
          `k1="0" k2="1" k3="1" k4="0" result="${out}"/>`,
      );
      return out;
    }
    case "sheen":
      // Painted by render/svg.ts as a clipped overlay, not filtered.
      return input;
    case "outline": {
      const alpha = next();
      const dilated = next();
      const rim = next();
      const flood = next();
      const coloured = next();
      const out = next();
      parts.push(alphaOf(input, alpha));
      // feMorphology "dilate" grows the alpha outward by exactly `radius` --
      // a hard edge, unlike gaussian()'s soft one, which is the whole point:
      // an outline is a silhouette, not a glow.
      parts.push(
        `<feMorphology in="${alpha}" operator="dilate" radius="${num(effect.width)}" result="${dilated}"/>`,
      );
      // Dilated alpha minus the original alpha: the ring outside the shape's
      // own edge, exactly `width` wide. Same subtraction occlusion.ts uses to
      // keep an inner shadow inside its shape, mirrored to keep this ring
      // outside it.
      parts.push(
        `<feComposite in="${dilated}" in2="${alpha}" operator="arithmetic" ` +
          `k1="0" k2="1" k3="-1" k4="0" result="${rim}"/>`,
      );
      parts.push(floodOf(effect.color, effect.opacity, flood));
      parts.push(`<feComposite in="${flood}" in2="${rim}" operator="in" result="${coloured}"/>`);
      // Outline under, element over -- same reasoning as shadow: the source
      // shape's own edge should sit crisply on top of the ring around it.
      parts.push(
        `<feMerge result="${out}"><feMergeNode in="${coloured}"/><feMergeNode in="${input}"/></feMerge>`,
      );
      return out;
    }
    case "hue-rotate": {
      const out = next();
      parts.push(
        `<feColorMatrix in="${input}" type="hueRotate" values="${num(effect.angle)}" result="${out}"/>`,
      );
      return out;
    }
    default: {
      const exhaustive: never = effect;
      return exhaustive;
    }
  }
}

/**
 * The alpha channel of an arbitrary intermediate result, as a black matte.
 *
 * `SourceAlpha` does this for the source only. Reaching for it mid-chain is
 * the single most common bug in hand-written SVG filter chains, because it
 * does not error — it silently uses the wrong picture.
 */
function alphaOf(input: string, result: string): string {
  return (
    `<feColorMatrix in="${input}" type="matrix" ` +
    `values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="${result}"/>`
  );
}

function gaussian(input: string, blurRadius: number, result: string): string {
  return `<feGaussianBlur in="${input}" stdDeviation="${num(sigmaOf(blurRadius))}" result="${result}"/>`;
}

function floodOf(colour: string, opacity: number, result: string): string {
  return `<feFlood flood-color="${colour}" flood-opacity="${num(opacity)}" result="${result}"/>`;
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
