/**
 * Type packs — the third design system, and the one that was missing entirely.
 *
 * Colour has THEMES. Depth has STYLE_PACKS. Type had one family stack, one
 * size and one line-height, for everything, forever. A generator that wanted
 * typographic range had to hand-place glyphs: the Memphis probe spelled
 * tracking as placement, one block per letter, because there was no other way
 * to spell it.
 *
 * WHY A SECOND AXIS RATHER THAN REUSING `role`. Style packs key on `role`, and
 * the obvious move is for type packs to do the same. They must not, and one
 * ordinary poster shows why: its date line is the largest type on the page and
 * means nothing in particular, while a safety notice may be the smallest type
 * and mean the most. `role` answers "what does this MEAN" — primary, warning,
 * muted. Typographic rank answers "how LOUD is this" — display, body, caption.
 * Those are different questions, and any figure with a large neutral element
 * or a small urgent one separates them. Folding rank into `role` would also
 * corrupt a vocabulary two shipped systems already depend on.
 *
 * So an element declares `level` for how loud it is and `role` for what it
 * means, and the three packs compose without ever colliding:
 *
 *     role  -> fill and text colour (theme), depth (style pack)
 *     level -> family, size, weight, tracking, line-height (type pack)
 *
 * A warning caption is `{ role: "warning", level: "caption" }`, which is
 * exactly what it is.
 *
 * SAME THREE RULES AS STYLE PACKS. A pack fills only absences — an element
 * that declares its own `fontSize` keeps it. It buys no exemption: tracked,
 * resized text is measured in the mirror with its tracking applied, so
 * `text-fits-box` keeps meaning what it says. And an element with no `level`
 * takes the pack's `body` entry, so every spec written before packs existed
 * renders identically.
 */

import { BUNDLED_FONT_FAMILY, BUNDLED_FONT_STACK } from "./export/fonts.ts";

/** How loud a piece of text is. Independent of what it MEANS (`role`). */
export type TypeLevel =
  | "display"
  | "title"
  | "subtitle"
  | "body"
  | "caption"
  | "eyebrow"
  | "mono";

export const TYPE_LEVELS: readonly TypeLevel[] = [
  "display",
  "title",
  "subtitle",
  "body",
  "caption",
  "eyebrow",
  "mono",
];

/**
 * The levels that form a size LADDER, largest to smallest. `eyebrow` and
 * `mono` are deliberately outside it: an eyebrow is a small tracked line that
 * sits ABOVE a title, so it is a device rather than a step, and mono is a
 * claim about the content rather than about loudness. A test asserts the
 * ladder is monotone -- it caught the first draft, where the poster pack's
 * eyebrow had been filed as a subtitle and made the ladder non-monotone.
 */
export const TYPE_LADDER: readonly TypeLevel[] = [
  "display",
  "title",
  "subtitle",
  "body",
  "caption",
];

export type TypeStep = {
  /** CSS family stack. Always ends in a generic, so a host without the face still draws. */
  family: string;
  size: number;
  weight?: number;
  /** Tracking in px. Negative tightens, which is what display sizes usually want. */
  letterSpacing?: number;
  lineHeight?: number;
};

export type TypePack = {
  id: string;
  summary: string;
  levels: Record<TypeLevel, TypeStep>;
};

/**
 * The faces this repository actually ships (assets/fonts). Inter only, under
 * the OFL, named "Prancheta Sans" wherever it is loaded (ADR 0063) -- a stack
 * that names "Inter" asks the HOST for Inter, which is a different claim.
 * Everything else named below is a PREFERENCE inside a stack, never a
 * promise -- which is why `selfContained` is derived from this list rather than
 * asserted per pack. Asserting it by hand is how a pack ends up claiming to be
 * portable because most of its levels are.
 */
export const BUNDLED_FAMILIES: readonly string[] = [BUNDLED_FONT_FAMILY];

/** First family in a CSS stack, unquoted. */
function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/**
 * True only when EVERY level's first-choice face is bundled. A pack that is
 * self-contained everywhere except its `mono` level is not self-contained, and
 * saying otherwise would be exactly the overclaim this project avoids
 * elsewhere.
 */
export function isSelfContained(pack: TypePack): boolean {
  return Object.values(pack.levels).every((step) =>
    BUNDLED_FAMILIES.includes(firstFamily(step.family)),
  );
}

/** The levels whose first-choice face is not bundled, so a host may substitute. */
export function hostDependentLevels(pack: TypePack): TypeLevel[] {
  return TYPE_LEVELS.filter(
    (level) => !BUNDLED_FAMILIES.includes(firstFamily(pack.levels[level].family)),
  );
}

// The one face this repository actually ships (assets/fonts, OFL), which the
// mirror always loads and `embed` carries. Anything else is named as a
// preference inside a stack, never as a promise. The sans levels used to name
// "Inter" (a host face the mirror never loaded, so a machine without it drew
// Segoe UI) and "Segoe UI"; both are the bundled face now (ADR 0063).
const INTER = BUNDLED_FONT_STACK;
const SANS = BUNDLED_FONT_STACK;
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
const DIDONE = '"Didot", "Bodoni MT", "Playfair Display", Georgia, serif';
const MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';

export const TYPE_PACKS: TypePack[] = [
  {
    id: "grotesk",
    summary:
      "One sans throughout, tightening as it grows. The neutral default: it never " +
      "competes with the figure, which is what a diagram usually wants.",
    levels: {
      display: { family: INTER, size: 46, weight: 700, letterSpacing: -1.2, lineHeight: 1.1 },
      title: { family: INTER, size: 28, weight: 650, letterSpacing: -0.5, lineHeight: 1.2 },
      subtitle: { family: INTER, size: 19, weight: 550, letterSpacing: -0.2, lineHeight: 1.35 },
      body: { family: INTER, size: 15, weight: 400, lineHeight: 1.45 },
      caption: { family: INTER, size: 12.5, weight: 400, letterSpacing: 0.1, lineHeight: 1.4 },
      eyebrow: { family: INTER, size: 11.5, weight: 600, letterSpacing: 2.4, lineHeight: 1.5 },
      mono: { family: MONO, size: 13.5, weight: 400, lineHeight: 1.5 },
    },
  },
  {
    id: "editorial",
    summary:
      "Serif display over a sans body — the magazine setting. Reach for it when a " +
      "figure has a real title and something to say under it.",
    levels: {
      display: { family: SERIF, size: 48, weight: 600, letterSpacing: -0.8, lineHeight: 1.08 },
      title: { family: SERIF, size: 30, weight: 600, letterSpacing: -0.2, lineHeight: 1.2 },
      subtitle: { family: SERIF, size: 20, weight: 500, lineHeight: 1.4 },
      body: { family: SANS, size: 15, weight: 400, lineHeight: 1.5 },
      caption: { family: SANS, size: 12.5, weight: 400, letterSpacing: 0.15, lineHeight: 1.45 },
      eyebrow: { family: SANS, size: 11, weight: 600, letterSpacing: 3, lineHeight: 1.5 },
      mono: { family: MONO, size: 13, weight: 400, lineHeight: 1.5 },
    },
  },
  {
    id: "poster",
    summary:
      "Wide-tracked capitals over quiet body text — the mathematical-poster setting, " +
      "where an eyebrow is spaced across the page and the title carries the whole figure.",
    levels: {
      display: { family: DIDONE, size: 54, weight: 500, letterSpacing: -0.5, lineHeight: 1.05 },
      title: { family: DIDONE, size: 34, weight: 500, lineHeight: 1.15 },
      subtitle: { family: SANS, size: 17, weight: 500, lineHeight: 1.45 },
      body: { family: SANS, size: 13.5, weight: 400, lineHeight: 1.55 },
      caption: { family: SANS, size: 11.5, weight: 400, letterSpacing: 0.2, lineHeight: 1.45 },
      // The one place wide positive tracking is the whole point: an eyebrow
      // spaced across the page above the title. This is the chladni setting.
      eyebrow: { family: SANS, size: 12, weight: 500, letterSpacing: 6, lineHeight: 1.6 },
      mono: { family: MONO, size: 12, weight: 400, lineHeight: 1.5 },
    },
  },
  {
    id: "technical",
    summary:
      "Monospace headings over a sans body. For figures about code and systems, where " +
      "a fixed pitch is a claim about the subject rather than a style choice.",
    levels: {
      display: { family: MONO, size: 38, weight: 600, letterSpacing: -1, lineHeight: 1.15 },
      title: { family: MONO, size: 24, weight: 600, letterSpacing: -0.4, lineHeight: 1.25 },
      subtitle: { family: MONO, size: 16, weight: 500, lineHeight: 1.4 },
      body: { family: INTER, size: 14.5, weight: 400, lineHeight: 1.5 },
      caption: { family: MONO, size: 12, weight: 400, lineHeight: 1.45 },
      eyebrow: { family: MONO, size: 11, weight: 600, letterSpacing: 2.8, lineHeight: 1.5 },
      mono: { family: MONO, size: 13, weight: 400, lineHeight: 1.5 },
    },
  },
];

export const TYPE_IDS: string[] = TYPE_PACKS.map((pack) => pack.id);

export function typeById(id: string): TypePack | undefined {
  return TYPE_PACKS.find((pack) => pack.id === id);
}

/** The step a level resolves to, falling back to `body` for an undeclared level. */
export function stepFor(pack: TypePack, level: TypeLevel | undefined): TypeStep {
  return pack.levels[level ?? "body"];
}
