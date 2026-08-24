/**
 * Effects: the visual layer, and the rules that keep it honest.
 *
 * Three constraints shape everything in this directory, and they are what
 * separates this from "add a drop shadow and hope":
 *
 *   1. AN EFFECT NEVER MOVES ANYTHING. Effects are resolved after layout and
 *      applied only at SVG emission. They are absent from the HTML mirror on
 *      purpose (layout/html.ts) — a CSS `filter` or `box-shadow` there would
 *      change what Chromium reports as the element's size, and the browser is
 *      this project's layout oracle. An oracle you have quietly perturbed is
 *      not an oracle. Geometry measured with effects off is the geometry
 *      drawn with effects on, exactly.
 *
 *   2. AN EFFECT'S REACH IS COMPUTED, NOT GUESSED. A shadow is ink outside the
 *      shape that cast it. Every effect declares how far it spreads (bleed.ts),
 *      that spread is checked against the canvas like any other geometry, and
 *      a halo sliced off by the canvas edge is a defect the repair loop fixes
 *      by growing the padding.
 *
 *   3. AN EFFECT MUST SURVIVE LEAVING THE BROWSER. No `feDropShadow`
 *      shorthand, no CSS filter functions, no `backdrop-filter` — the same
 *      portability rule render/svg.ts applies to markers and foreignObject.
 *      Everything here desugars to filter primitives from SVG 1.1 that resvg,
 *      librsvg, Inkscape and Illustrator all implement.
 *
 * Roles, not looks: a spec should say a block is `raised-2` or `recede`, and
 * the design system decides what that means — the same argument theme.ts makes
 * for colour. Inline effects exist for the cases the vocabulary does not cover.
 */

/** A named effect from the design system, or a literal one. */
export type EffectRef = string | Effect;

export type Effect =
  /**
   * Ink cast outside the shape, offset and blurred. The elevation cue.
   * `blur` is a CSS-style radius (roughly twice the Gaussian sigma), so a
   * value carried over from a CSS design token means the same thing here.
   */
  | { kind: "shadow"; dx?: number; dy?: number; blur?: number; color?: string; opacity?: number }
  /** A coloured halo around the shape, drawn under it. Emphasis, not elevation. */
  | { kind: "glow"; radius?: number; color?: string; intensity?: number }
  /** Gaussian blur of the whole element. Depth of field: pushes a thing back. */
  | { kind: "blur"; radius?: number }
  /**
   * Contact shadow *inside* the shape's own edges — ambient occlusion, the
   * darkening where two surfaces meet. Clipped to the source alpha, so unlike
   * every other shadow here it spreads nothing and costs no bleed.
   */
  | {
      kind: "occlusion";
      radius?: number;
      dx?: number;
      dy?: number;
      color?: string;
      opacity?: number;
    }
  /** Linear intensity scaling. Above 1 brightens, below 1 darkens. Alpha untouched. */
  | { kind: "brightness"; amount?: number }
  /** Colour intensity. 0 is greyscale, 1 unchanged, above 1 pushed. */
  | { kind: "saturate"; amount?: number }
  /** Wash the element toward a colour, keeping its own alpha. */
  | { kind: "tint"; color: string; amount?: number }
  /** Fractal noise composited into the element. Paper tooth, not television static. */
  | { kind: "grain"; amount?: number; scale?: number; seed?: number }
  /** Lit relief from the element's alpha edges. Emboss, held to a schematic strength. */
  | { kind: "bevel"; depth?: number; azimuth?: number; elevation?: number; strength?: number }
  /**
   * A light gradient laid over the shape's own area — the sheen on a surface
   * lit from one side. NOT a filter: it is a second painted rect clipped to
   * the shape, so it applies to boxes only and is ignored elsewhere.
   */
  | { kind: "sheen"; strength?: number; direction?: "down" | "up" | "left" | "right" }
  /**
   * A hard-edged flat-coloured halo the width of the shape's own alpha,
   * dilated outward. Figure-ground separation: the cue for "this shape reads
   * against any background", not elevation (that is `glow`, which blurs) and
   * not focus (`emphasis`, a glow preset) — an outline says the shape's own
   * silhouette is what matters, on a busy scene or a background whose colour
   * is not fixed. Zero blur by construction, so its bleed is exactly `width`.
   */
  | { kind: "outline"; width?: number; color?: string; opacity?: number }
  /**
   * Rotates every pixel's hue by `angle` degrees, alpha and lightness
   * untouched. Pure colour remap — zero bleed, like `saturate`/`tint`.
   * Categorical recolouring: the same shape drawn once and reused across a
   * legend with a different hue per entry, without a second `fill` per copy.
   */
  | { kind: "hue-rotate"; angle?: number };

export type EffectKind = Effect["kind"];

/** An effect with every default filled in. What bleed.ts and filters.ts consume. */
export type ResolvedEffect =
  | { kind: "shadow"; dx: number; dy: number; blur: number; color: string; opacity: number }
  | { kind: "glow"; radius: number; color: string; intensity: number }
  | { kind: "blur"; radius: number }
  | { kind: "occlusion"; radius: number; dx: number; dy: number; color: string; opacity: number }
  | { kind: "brightness"; amount: number }
  | { kind: "saturate"; amount: number }
  | { kind: "tint"; color: string; amount: number }
  | { kind: "grain"; amount: number; scale: number; seed: number }
  | { kind: "bevel"; depth: number; azimuth: number; elevation: number; strength: number }
  | { kind: "sheen"; strength: number; direction: "down" | "up" | "left" | "right" }
  | { kind: "outline"; width: number; color: string; opacity: number }
  | { kind: "hue-rotate"; angle: number };

export class EffectError extends Error {}

/**
 * Does this effect follow a block's label, or stop at its surface?
 *
 * A block is drawn as two independent SVG elements — the rect, then the label
 * over it — because pipeline.ts layers connectors *between* them. Wrapping the
 * pair in a filtered `<g>` would fix the question by changing the answer, and
 * would put every label back on top of every connector.
 *
 * So the chain is split by what the effect *means*:
 *
 *   SURFACE effects describe the block as an object — how it is lit, how far
 *   off the page it sits, where it touches. They belong to the rect alone. A
 *   label with its own drop shadow is not a card, it is embossed lettering,
 *   and the two shadows fight at every glyph edge.
 *
 *   APPEARANCE effects describe the block's *whole appearance* — out of focus,
 *   drained of colour, dimmed. A `recede` that blurred the box and left the
 *   label sharp would not read as depth, it would read as a bug.
 */
export function appliesToLabel(kind: EffectKind): boolean {
  switch (kind) {
    case "blur":
    case "brightness":
    case "saturate":
    case "tint":
    case "grain":
    case "hue-rotate":
      return true;
    case "shadow":
    case "glow":
    case "occlusion":
    case "bevel":
    case "sheen":
    case "outline":
      return false;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** The part of a chain that follows the label. May be empty. */
export function labelChain(effects: readonly ResolvedEffect[]): ResolvedEffect[] {
  return effects.filter((effect) => appliesToLabel(effect.kind));
}

/**
 * Effects a spec can ask for by name.
 *
 * Each is a *chain*: effects compose in order, the output of one feeding the
 * next, which is why `lit` can be a sheen plus the occlusion that makes the
 * sheen read as a lit surface rather than as a pale stripe.
 */
export const EFFECT_PRESETS: Record<string, readonly Effect[]> = {
  /** Barely off the page. A card, a chip. */
  "raised-1": [{ kind: "shadow", dy: 1, blur: 3, opacity: 0.35 }],
  /** Clearly a layer above. The default for anything that overlaps. */
  "raised-2": [{ kind: "shadow", dy: 3, blur: 8, opacity: 0.4 }],
  /** Floating: a callout, a tooltip, a modal over a scene. */
  "raised-3": [{ kind: "shadow", dy: 8, blur: 20, opacity: 0.45 }],
  /** Seated in the page rather than on it — occlusion with no cast shadow. */
  seated: [{ kind: "occlusion", radius: 4, dy: 2, opacity: 0.5 }],
  /** Pressed in. Occlusion from above plus a hint of shading. */
  inset: [
    { kind: "occlusion", radius: 5, dy: 2, opacity: 0.65 },
    { kind: "brightness", amount: 0.92 },
  ],
  /** The thing being talked about: a halo in the accent colour. */
  emphasis: [{ kind: "glow", radius: 10, color: "#5B8DEF", intensity: 0.9 }],
  /** A warning that should catch the eye without changing the palette. */
  alarm: [{ kind: "glow", radius: 9, color: "#E76F51", intensity: 0.95 }],
  /** Backgrounded: pushed out of focus and drained of colour. */
  recede: [
    { kind: "blur", radius: 2 },
    { kind: "saturate", amount: 0.55 },
    { kind: "brightness", amount: 0.8 },
  ],
  /** Out of focus entirely — context behind a foreground layer. */
  "depth-of-field": [{ kind: "blur", radius: 5 }],
  /** Lit from above: sheen on top, occlusion under the top edge, shadow beneath. */
  lit: [
    { kind: "sheen", strength: 0.1 },
    { kind: "occlusion", radius: 6, dy: -2, opacity: 0.35 },
    { kind: "shadow", dy: 4, blur: 10, opacity: 0.4 },
  ],
  /** Cut into the surface. Bevel at schematic strength, no cast shadow. */
  etched: [{ kind: "bevel", depth: 1.5, strength: 0.5 }],
  /** Printed rather than rendered: paper tooth over flat ink. */
  printed: [{ kind: "grain", amount: 0.16, scale: 0.85 }],
  /** Dimmed to the back of the stack without blurring — for dense figures. */
  ghost: [
    { kind: "saturate", amount: 0.3 },
    { kind: "brightness", amount: 0.7 },
  ],
  /** Reads against any background: a hard flat halo the width of the shape's own silhouette. */
  outlined: [{ kind: "outline", width: 2, color: "#FFFFFF", opacity: 0.9 }],
};

/** Every effect a spec may name, for error messages and for `effects` listings. */
export const EFFECT_NAMES: string[] = Object.keys(EFFECT_PRESETS).sort();

const DEFAULT_SHADOW_COLOUR = "#000000";

/**
 * Resolve what a spec wrote into a chain with every default filled in.
 *
 * Throws rather than ignoring an unknown name: a silently dropped effect is
 * the failure mode where an author believes a figure carries depth cues it
 * does not carry, and nothing in the manifest would ever mention it.
 */
export function resolveEffects(
  ref: EffectRef | readonly EffectRef[] | undefined,
): ResolvedEffect[] {
  if (ref === undefined) return [];
  const refs = Array.isArray(ref) ? (ref as readonly EffectRef[]) : [ref as EffectRef];
  const out: ResolvedEffect[] = [];
  for (const entry of refs) {
    if (typeof entry === "string") {
      const preset = EFFECT_PRESETS[entry];
      if (preset === undefined) {
        throw new EffectError(
          `unknown effect "${entry}"; known effects are ${EFFECT_NAMES.join(", ")}`,
        );
      }
      for (const effect of preset) out.push(withDefaults(effect));
      continue;
    }
    if (typeof entry !== "object" || entry === null) {
      throw new EffectError(`an effect must be a name or an object, got ${JSON.stringify(entry)}`);
    }
    out.push(withDefaults(entry));
  }
  return out;
}

function withDefaults(effect: Effect): ResolvedEffect {
  switch (effect.kind) {
    case "shadow":
      return {
        kind: "shadow",
        dx: num(effect.dx, 0, "shadow.dx"),
        dy: num(effect.dy, 2, "shadow.dy"),
        blur: positive(effect.blur, 6, "shadow.blur"),
        color: colour(effect.color, DEFAULT_SHADOW_COLOUR, "shadow.color"),
        opacity: unit(effect.opacity, 0.4, "shadow.opacity"),
      };
    case "glow":
      return {
        kind: "glow",
        radius: positive(effect.radius, 8, "glow.radius"),
        color: colour(effect.color, "#5B8DEF", "glow.color"),
        intensity: unit(effect.intensity, 0.85, "glow.intensity"),
      };
    case "blur":
      return { kind: "blur", radius: positive(effect.radius, 3, "blur.radius") };
    case "occlusion":
      return {
        kind: "occlusion",
        radius: positive(effect.radius, 5, "occlusion.radius"),
        dx: num(effect.dx, 0, "occlusion.dx"),
        dy: num(effect.dy, 2, "occlusion.dy"),
        color: colour(effect.color, DEFAULT_SHADOW_COLOUR, "occlusion.color"),
        opacity: unit(effect.opacity, 0.55, "occlusion.opacity"),
      };
    case "brightness":
      return { kind: "brightness", amount: positive(effect.amount, 1.15, "brightness.amount") };
    case "saturate":
      return { kind: "saturate", amount: positive(effect.amount, 1.2, "saturate.amount") };
    case "tint":
      return {
        kind: "tint",
        color: colour(effect.color, undefined, "tint.color"),
        amount: unit(effect.amount, 0.3, "tint.amount"),
      };
    case "grain":
      return {
        kind: "grain",
        amount: unit(effect.amount, 0.15, "grain.amount"),
        scale: positive(effect.scale, 0.8, "grain.scale"),
        // Seeded by default: the same spec must produce byte-identical SVG on
        // every machine, and feTurbulence is only deterministic given a seed.
        seed: num(effect.seed, 7, "grain.seed"),
      };
    case "bevel":
      return {
        kind: "bevel",
        depth: positive(effect.depth, 2, "bevel.depth"),
        azimuth: num(effect.azimuth, 235, "bevel.azimuth"),
        elevation: num(effect.elevation, 45, "bevel.elevation"),
        strength: unit(effect.strength, 0.6, "bevel.strength"),
      };
    case "sheen":
      return {
        kind: "sheen",
        strength: unit(effect.strength, 0.12, "sheen.strength"),
        direction: direction(effect.direction),
      };
    case "outline":
      return {
        kind: "outline",
        width: positive(effect.width, 2, "outline.width"),
        color: colour(effect.color, "#FFFFFF", "outline.color"),
        opacity: unit(effect.opacity, 1, "outline.opacity"),
      };
    case "hue-rotate":
      return { kind: "hue-rotate", angle: num(effect.angle, 0, "hue-rotate.angle") };
    default: {
      const unknown = effect as { kind?: unknown };
      throw new EffectError(`unknown effect kind ${JSON.stringify(unknown.kind)}`);
    }
  }
}

function direction(value: unknown): "down" | "up" | "left" | "right" {
  if (value === undefined) return "down";
  if (value === "down" || value === "up" || value === "left" || value === "right") return value;
  throw new EffectError(
    `sheen.direction must be "down", "up", "left" or "right", got ${JSON.stringify(value)}`,
  );
}

/**
 * Colours go into an SVG attribute verbatim, so they are checked here rather
 * than escaped at emission: a value that is not a colour is an authoring
 * mistake worth a message, not something to smuggle into the output.
 */
function colour(value: string | undefined, fallback: string | undefined, where: string): string {
  if (value === undefined) {
    if (fallback === undefined) throw new EffectError(`${where} is required`);
    return fallback;
  }
  if (typeof value !== "string" || !/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(value)) {
    throw new EffectError(
      `${where} must be a hex colour or a colour keyword, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function num(value: number | undefined, fallback: number, where: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EffectError(`${where} must be a finite number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function positive(value: number | undefined, fallback: number, where: string): number {
  const resolved = num(value, fallback, where);
  if (resolved < 0) throw new EffectError(`${where} must not be negative, got ${resolved}`);
  return resolved;
}

function unit(value: number | undefined, fallback: number, where: string): number {
  const resolved = num(value, fallback, where);
  if (resolved < 0 || resolved > 1) {
    throw new EffectError(`${where} must be between 0 and 1, got ${resolved}`);
  }
  return resolved;
}
