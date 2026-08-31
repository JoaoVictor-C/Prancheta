/**
 * IR -> HTML mirror.
 *
 * The browser is the layout oracle (decision 0001). This module builds the
 * page it lays out. The mirror is never exported and never shown to anyone:
 * it exists only so Chromium can compute flow, wrapping and text metrics in
 * the same engine that will draw the final pixels.
 *
 * Every element carries a stable `data-pr-*` id so measurements can be mapped
 * back onto the IR.
 */

import type {
  Block,
  FigureNode,
  FigureSpec,
  LineStyle,
  Paint,
  PerSideBorder,
  Point,
  Scene,
  Stack,
} from "../ir/types.ts";
import { resolveTheme, theme } from "../theme.ts";
import type { RoleColours, Role } from "../theme.ts";
import { BUNDLED_FONT_FAMILY, bundledFontFaceCssSync } from "../export/fonts.ts";

export type IdAssignment = {
  html: string;
  /** Ids in document order, for stable output. */
  boxIds: string[];
};

export type FontEmbedMode = "none" | "embed" | "outline";

export type HtmlOptions = {
  /**
   * Where a scene's children go, by block id. Absent means this is the
   * MEASURE pass: scene children are laid out loosely so their intrinsic
   * sizes can be read and handed to ELK. Present means the PLACE pass.
   */
  placements?: Record<string, Point>;
  /** Scene extents, by scene id, known only after placement. */
  sceneSizes?: Record<string, { width: number; height: number }>;
  /**
   * "embed" and "outline" both need Chromium to MEASURE against the bundled
   * font, not just draw it later -- decision 0001's invariant applies to this
   * feature exactly as it does everywhere else, so the mirror switches fonts
   * here rather than the switch happening only at SVG emission.
   */
  fontEmbed?: FontEmbedMode;
};

export function buildHtml(spec: FigureSpec, options: HtmlOptions = {}): IdAssignment {
  const boxIds: string[] = [];
  let counter = 0;
  const nextId = (node: FigureNode): string => {
    counter += 1;
    return node.id ?? `${node.type}-${counter}`;
  };

  // Resolved once per build and threaded through the closure below, not
  // re-imported by `renderBlock`, so a repaint of the same spec under a
  // different theme can never mix roles from two palettes.
  const active = resolveTheme(spec.canvas?.theme);

  const renderNode = (node: FigureNode): string => {
    if (node.type === "stack") return renderStack(node, nextId(node), renderNode);
    if (node.type === "scene") {
      const sceneId = nextId(node);
      const inner = node.children
        .map((child) => {
          const id = nextId(child);
          boxIds.push(id);
          const placement = options.placements?.[id];
          return renderBlock(child, id, active.roles, placement);
        })
        .join("");
      return renderScene(node, sceneId, inner, options);
    }
    const id = nextId(node);
    boxIds.push(id);
    return renderBlock(node, id, active.roles);
  };

  // Ids must be assigned in the same order every pass, and a scene assigns its
  // own id before its children, so the walk order here is part of the contract.
  const body = renderNode(spec.root);
  const padding = spec.canvas?.padding ?? active.canvas.padding;
  const background = spec.canvas?.background ?? active.canvas.background;

  const fontEmbed = options.fontEmbed ?? "none";
  // Both modes measure against the bundled font, never only the system stack
  // -- prepended, not replacing it, so a character the bundled font does not
  // cover (see export/fonts.ts) still falls back to a real installed face
  // rather than measuring against nothing.
  const bodyFontFamily =
    fontEmbed === "none" ? active.text.family : `"${BUNDLED_FONT_FAMILY}", ${active.text.family}`;
  const bundledFontFace = fontEmbed === "none" ? "" : `${bundledFontFaceCssSync()}\n  `;
  // outline mode sums each glyph's own advance width to position the next
  // one (render/svg.ts); Chromium's kerning would then measure narrower or
  // wider than that sum for character pairs a font kerns, so kerning is
  // switched off here to keep the two in agreement. embed mode draws real
  // <text> and never sums anything by hand, so kerning stays on for it.
  const kerning = fontEmbed === "outline" ? "font-kerning: none;" : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${bundledFontFace}html, body { margin: 0; padding: 0; background: ${background}; }
  body {
    font-family: ${bodyFontFamily};
    font-size: ${active.text.size}px;
    line-height: ${active.text.lineHeight};
    color: ${active.text.color};
    /* Keep glyph advances integral to what we measure. */
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
    ${kerning}
  }
  #pr-root { display: inline-block; padding: ${padding}px; }
  [data-pr-box] { box-sizing: border-box; }
  [data-pr-text] {
    /* Break between words, never inside one.

       Intra-word breaking used to be the global default here, chosen so a
       long unbreakable string would wrap rather than overflow and so
       min-content width would stay small for an auto-width block. Both
       effects were real; the cost was not worth them. Applied to EVERY
       label, a three-glyph one that missed its box by 2px came apart into
       "3" / "0" / "°" -- and the repair loop could not undo it, because once
       a label has wrapped each line fits horizontally by construction, so
       text-fits-box reports a DOWNWARD overflow and only the height branch
       ever fires. The box grew 153% taller around mangled text instead of
       12% wider around intact text.

       Leaving the word whole makes the overflow horizontal, which is the one
       signal planRepairs can act on: it grows the width, and if the budget
       will not stretch that far it reports the node as unrepaired and says
       so. A wide box or an honest refusal, never silently shattered text.
       Block.wrap opts a genuinely unbreakable run back in, per label.

       (No backticks in this comment: it lives inside a template literal.) */
    overflow-wrap: normal;
    word-break: normal;
  }
</style></head>
<body><div id="pr-root">${body}</div></body></html>`;

  return { html, boxIds };
}

function renderStack(
  node: Stack,
  id: string,
  renderNode: (child: FigureNode) => string,
): string {
  const align = node.align ?? "stretch";
  const alignItems =
    align === "start" ? "flex-start" : align === "end" ? "flex-end" : align;
  const style = [
    "display: flex",
    `flex-direction: ${node.direction}`,
    `gap: ${node.gap ?? 16}px`,
    `align-items: ${alignItems}`,
  ].join("; ");
  const children = node.children.map(renderNode).join("");
  return `<div data-pr-stack="${escapeAttr(id)}" style="${style}">${children}</div>`;
}

/**
 * A scene is `position: relative` once placed, so its children's absolute
 * coordinates are scene-local — the same space ELK works in, which removes a
 * whole class of off-by-an-origin bugs.
 *
 * On the measure pass it is a plain wrapping row instead: children sit in
 * normal flow at their intrinsic size, which is exactly what ELK needs to be
 * told before it can place anything.
 */
function renderScene(node: Scene, id: string, inner: string, options: HtmlOptions): string {
  const placed = options.placements !== undefined;
  const size = options.sceneSizes?.[id];
  const style = placed
    ? [
        "position: relative",
        `width: ${size?.width ?? node.width ?? 0}px`,
        `height: ${size?.height ?? node.height ?? 0}px`,
      ].join("; ")
    : "display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start";
  return `<div data-pr-scene="${escapeAttr(id)}" style="${style}">${inner}</div>`;
}

/** "dashdot" has no single-line CSS equivalent; "dashed" is close enough for a mirror never shown to anyone. Structural styles (double/ridge/groove) map to their literal CSS equivalents -- also never drawn from here, only measured. */
function cssBorderStyle(lineStyle: LineStyle): string {
  switch (lineStyle) {
    case "solid":
      return "solid";
    case "dashed":
    case "dashdot":
      return "dashed";
    case "dotted":
      return "dotted";
    case "double":
      return "double";
    case "ridge":
      return "ridge";
    case "groove":
      return "groove";
    default: {
      const exhaustive: never = lineStyle;
      return exhaustive;
    }
  }
}

/**
 * What the HTML mirror paints when a Block's fill/stroke is a gradient.
 *
 * The mirror is measurement-only and never exported (decision 0001's rule for
 * effects applies here too): a gradient changes zero geometry, so any solid
 * stand-in is fine for layout purposes. The gradient itself is resolved only
 * at SVG emission, from the same Gradient object carried through untouched by
 * paint/apply.ts -- this stand-in exists purely so Chromium has a valid CSS
 * colour to lay out against.
 */
function paintToMirrorColour(paint: Paint | undefined, fallback: string): string {
  if (paint === undefined) return fallback;
  if (typeof paint === "string") return paint;
  return paint.stops[0]?.color ?? fallback;
}

/** Four independent border shorthands, one per side, falling back to the block's own uniform stroke on any side left unset. */
function borderSidesToCss(
  border: PerSideBorder,
  strokeWidth: number,
  borderStyle: string,
  strokeColour: string,
): string {
  const sides: { css: string; side: keyof PerSideBorder }[] = [
    { css: "border-top", side: "top" },
    { css: "border-right", side: "right" },
    { css: "border-bottom", side: "bottom" },
    { css: "border-left", side: "left" },
  ];
  return sides
    .map(({ css, side }) => {
      const entry = border[side];
      const width = entry?.width ?? strokeWidth;
      const style = entry?.style !== undefined ? cssBorderStyle(entry.style) : borderStyle;
      const colour = entry?.color ?? strokeColour;
      return `${css}: ${width}px ${style} ${colour}`;
    })
    .join("; ");
}

function renderBlock(
  node: Block,
  id: string,
  roles: Record<Role, RoleColours>,
  placement?: Point,
): string {
  const strokeWidth = node.strokeWidth ?? theme.block.strokeWidth;
  const role = roles[node.role ?? "default"];

  // Build border style string
  const lineStyle = node.lineStyle ?? "solid";
  const borderStyle = cssBorderStyle(lineStyle);
  const strokeColour = paintToMirrorColour(node.stroke, role.stroke);

  const style = [
    placement !== undefined
      ? `position: absolute; left: ${placement.x}px; top: ${placement.y}px`
      : "",
    // A per-side border reserves different width on each edge, which changes
    // the measured content box under `box-sizing: border-box` -- so it has to
    // be real CSS the mirror lays out against, not just something render/svg.ts
    // draws afterward. Sides left unset fall back to the block's own uniform
    // stroke, exactly what render/svg.ts falls back to for the same side.
    node.border !== undefined
      ? borderSidesToCss(node.border, strokeWidth, borderStyle, strokeColour)
      : `border: ${strokeWidth}px ${borderStyle} ${strokeColour}`,
    `background: ${paintToMirrorColour(node.fill, role.fill)}`,
    `border-radius: ${node.radius ?? theme.block.radius}px`,
    `padding: ${node.padding ?? theme.block.padding}px`,
    `text-align: ${node.textAlign ?? "start"}`,
    // Flow layout puts a label at the top of the padding box, which is only
    // right when the box hugs its text. A column flex context lets the label
    // sit anywhere down a fixed-height box; the label still stretches across
    // the cross axis, so `text-align` keeps working untouched.
    //
    // Emitted only when asked for, so every block that does not use it
    // produces byte-identical HTML to before.
    ...(node.verticalAlign !== undefined && node.verticalAlign !== "start"
      ? [
          "display: flex",
          "flex-direction: column",
          `justify-content: ${node.verticalAlign === "center" ? "center" : "flex-end"}`,
        ]
      : []),
    node.width !== undefined ? `width: ${node.width}px` : "",
    node.maxWidth !== undefined ? `max-width: ${node.maxWidth}px` : "",
    node.minWidth !== undefined ? `min-width: ${node.minWidth}px` : "",
    node.height !== undefined ? `height: ${node.height}px` : "",
    // A fixed height must not stretch to fit its content, or the defect this
    // exists to expose would quietly repair itself and hide the bug.
    node.height !== undefined ? "flex: none" : "",
    // Overflow stays visible: a clipped defect is an undetected defect.
    "overflow: visible",
    node.fontSize !== undefined ? `font-size: ${node.fontSize}px` : "",
    node.fontFamily !== undefined ? `font-family: ${node.fontFamily}` : "",
    node.fontWeight !== undefined ? `font-weight: ${node.fontWeight}` : "",
    // Tracking goes into the MIRROR, not just the SVG. Chromium measures the
    // tracked run, so advance widths stay honest and text-fits-box keeps
    // meaning what it says. Emitting it only at draw time would make the
    // measured width and the drawn width disagree.
    node.letterSpacing !== undefined ? `letter-spacing: ${node.letterSpacing}px` : "",
    `color: ${node.textColor ?? role.text}`,
  ]
    .filter(Boolean)
    .join("; ");

  // `pre-line` keeps a newline in a label as a hard break while collapsing
  // runs of spaces exactly as `normal` did -- so the invariant that the string
  // measured is the string drawn is untouched (see measure.ts), and only the
  // break becomes expressible. Before this there was no way to ask for one:
  // the newline was collapsed to a space, silently, with nothing to report.
  //
  // `wrap: "none"` forbids *wrapping*, which an explicit break is not. The
  // legacy shorthand cannot say "keep breaks, never wrap", so it is written
  // first as a fallback and then narrowed by the two longhands.
  //
  // "anywhere" is the third case and it is per-label on purpose: as a global
  // rule it broke every short label that missed its box, and as a per-label
  // one it stays available for the run that genuinely needs it.
  const labelStyle =
    node.wrap === "none"
      ? ' style="white-space: nowrap; white-space-collapse: preserve-breaks;' +
        ' text-wrap-mode: nowrap; overflow-wrap: normal"'
      : node.wrap === "anywhere"
        ? ' style="white-space: pre-line; overflow-wrap: anywhere"'
        : ' style="white-space: pre-line"';
  const label =
    node.label === undefined || node.label === ""
      ? ""
      : `<span data-pr-text="${escapeAttr(id)}"${labelStyle}>${escapeHtml(node.label)}</span>`;

  return `<div data-pr-box="${escapeAttr(id)}" style="${style}">${label}</div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
