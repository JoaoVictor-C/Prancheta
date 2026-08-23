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

import type { Block, FigureNode, FigureSpec, Point, Scene, Stack } from "../ir/types.ts";
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
    /* Long unbreakable strings must wrap rather than overflow their box.
       "anywhere" (not "break-word") also shrinks min-content width, so an
       auto-width block is not forced wide by a single long URL. */
    overflow-wrap: anywhere;
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
  const borderStyle = lineStyle === "solid" ? "solid" :
                      lineStyle === "dashed" ? "dashed" :
                      lineStyle === "dotted" ? "dotted" :
                      lineStyle === "dashdot" ? "dashed" : "solid";

  const style = [
    placement !== undefined
      ? `position: absolute; left: ${placement.x}px; top: ${placement.y}px`
      : "",
    `border: ${strokeWidth}px ${borderStyle} ${node.stroke ?? role.stroke}`,
    `background: ${node.fill ?? role.fill}`,
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
  const labelStyle =
    node.wrap === "none"
      ? ' style="white-space: nowrap; white-space-collapse: preserve-breaks;' +
        ' text-wrap-mode: nowrap; overflow-wrap: normal"'
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
