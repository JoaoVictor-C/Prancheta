/**
 * LaidOutFigure -> SVG.
 *
 * Three rules, from decision 0001, and they are not negotiable:
 *   1. Absolute coordinates only. Layout already happened.
 *   2. One <text> element per wrapped line, positioned on its measured
 *      baseline. No dominant-baseline, no tspan wrapping, no reflow.
 *   3. No foreignObject, ever. resvg does not render it and librsvg,
 *      Inkscape and Illustrator are unreliable with it — a figure that opens
 *      blank in the tool the user actually opens is worthless.
 *
 * Effects (effects/) are the fourth thing this file does and the only one that
 * adds markup an element did not ask for: a `<defs>` block, a `filter`
 * attribute, and — for a sheen or a vignette — one extra painted rect. A
 * figure with no effects emits exactly the SVG it emitted before they existed.
 *
 * Structure (decision 0008) is the fifth thing, and the last one that changes
 * what gets emitted rather than just how it looks. Every element gets its own
 * `<g id="...">`, carrying a `<title>`/`<desc>` built from relationship data
 * the manifest already has (a label's owner, a connector's endpoints) — no
 * new computation, only new emission — and the three kinds sit in three named
 * layer groups, `pr-boxes`, `pr-connectors`, `pr-text`, in that order.
 *
 * That order is not cosmetic: it is the SAME painter's order pipeline.ts
 * already enforces (boxes, then connectors over them, then text over both),
 * preserved exactly rather than re-derived, because getting it wrong here
 * reopens the defect the order exists to prevent — a label crossed by a
 * connector line. A box and ITS OWN label are deliberately not grouped
 * together for the same reason: an arrowhead terminating on a box can
 * legitimately overlap that box's own edge, so every label must still render
 * after every connector, including ones that touch its own box. Grouping by
 * kind is what "structured" can safely mean without relitigating that.
 */

import type {
  ArrowStyle,
  LaidOutFigure,
  LineStyle,
  PlacedBox,
  PlacedConnector,
  PlacedText,
  Point,
  Rect,
} from "../ir/types.ts";
import { connector as connectorTheme } from "../theme.ts";
import { DefsRegistry } from "../effects/filters.ts";
import { NO_BLEED, unionRects } from "../effects/bleed.ts";
import type { ResolvedEffect } from "../effects/types.ts";
import type { FontEmbedMode } from "../layout/html.ts";
import { hexagonVertices, stadiumRadius, shapeVertices } from "../geometry/shapes.ts";
import type { ShapeKind } from "../geometry/shapes.ts";
import {
  BUNDLED_FONT_FAMILY,
  bundledFontFaceCssSync,
  lineNeedsTextFallback,
  loadOutlineFont,
  outlineForChar,
} from "../export/fonts.ts";

export type ToSvgOptions = {
  fontEmbed?: FontEmbedMode;
};

export function toSvg(figure: LaidOutFigure, title?: string, options: ToSvgOptions = {}): string {
  const defs = new DefsRegistry();
  const fontEmbed = options.fontEmbed ?? "none";

  // Built once, up front: a box's accessible name comes from the label(s)
  // that own it, and a label is a *separate* top-level element from its box
  // (painter's order is exactly why they cannot be one node — see above), so
  // the relationship has to be looked up rather than read off the box itself.
  const labelsByOwner = new Map<string, string[]>();
  for (const element of figure.elements) {
    if (element.kind !== "text" || element.ownerId === null) continue;
    const text = element.lines.map((line) => line.text).join(" ");
    if (text === "") continue;
    const existing = labelsByOwner.get(element.ownerId);
    if (existing) existing.push(text);
    else labelsByOwner.set(element.ownerId, [text]);
  }

  const boxesOut: string[] = [];
  const connectorsOut: string[] = [];
  const textOut: string[] = [];

  for (const element of figure.elements) {
    if (element.kind === "box") {
      boxesOut.push(boxToSvg(element, defs, labelsByOwner.get(element.id)));
    } else if (element.kind === "connector") {
      connectorsOut.push(connectorToSvg(element, defs));
    } else {
      textOut.push(textToSvg(element, defs, fontEmbed));
    }
  }

  const body: string[] = [];
  if (boxesOut.length > 0) body.push(layerGroup("pr-boxes", boxesOut));
  if (connectorsOut.length > 0) body.push(layerGroup("pr-connectors", connectorsOut));
  if (textOut.length > 0) body.push(layerGroup("pr-text", textOut));

  // The vignette is painted over everything, so it stays outside every layer
  // group, after all three, and its gradient joins the same defs block.
  const vignette = vignetteToSvg(figure, defs);
  if (vignette !== "") body.push(vignette);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(figure.width)}" height="${num(
      figure.height,
    )}" viewBox="0 0 ${num(figure.width)} ${num(figure.height)}">`,
  );
  if (title !== undefined && title !== "") parts.push(`<title>${escapeText(title)}</title>`);
  // "embed" is the only mode needing this: "outline" carries the glyph
  // shapes as plain paths and depends on no font at all, and "none" behaves
  // exactly as this file did before decision 0008.
  if (fontEmbed === "embed") {
    parts.push(`<style>${bundledFontFaceCssSync()}</style>`);
  }
  const definitions = defs.toSvg();
  if (definitions !== "") parts.push(definitions);
  parts.push(
    `<rect x="0" y="0" width="${num(figure.width)}" height="${num(
      figure.height,
    )}" fill="${attr(figure.background)}"/>`,
  );
  parts.push(...body);
  parts.push("</svg>");
  return parts.join("\n");
}

function layerGroup(id: string, children: string[]): string {
  return `<g id="${id}">\n${children.join("\n")}\n</g>`;
}

/**
 * Wraps one element's markup in its own `<g id="...">`, with an optional
 * `<title>`/`<desc>` and an optional effect filter folded onto the SAME tag
 * rather than nested in a second `<g>` — one wrapper per element, always,
 * whether or not it carries an effect.
 */
function wrapElement(options: {
  id: string;
  titleText?: string;
  descText?: string;
  filterId?: string | null;
  transform?: string;
  inner: string;
}): string {
  const attrs = [`id="${attr(options.id)}"`];
  if (options.filterId !== null && options.filterId !== undefined) {
    attrs.push(`filter="url(#${options.filterId})"`);
  }
  if (options.transform !== undefined) {
    attrs.push(`transform="${attr(options.transform)}"`);
  }
  const meta: string[] = [];
  if (options.titleText !== undefined && options.titleText !== "") {
    meta.push(`<title>${escapeText(options.titleText)}</title>`);
  }
  if (options.descText !== undefined && options.descText !== "") {
    meta.push(`<desc>${escapeText(options.descText)}</desc>`);
  }
  return `<g ${attrs.join(" ")}>\n${[...meta, options.inner].join("\n")}\n</g>`;
}

function boxToSvg(box: PlacedBox, defs: DefsRegistry, labels: string[] | undefined): string {
  // A CSS border sits inside the border box; an SVG stroke straddles the path.
  // Inset by half the stroke so the two occupy the same pixels.
  const half = box.strokeWidth / 2;
  const x = box.x + half;
  const y = box.y + half;
  const width = Math.max(0, box.width - box.strokeWidth);
  const height = Math.max(0, box.height - box.strokeWidth);
  const radius = Math.max(0, box.radius - half);

  const lineStyle = box.lineStyle ?? "solid";
  const strokeDashArray = lineStyle === "solid" ? "" : ` stroke-dasharray="${dashPattern(lineStyle)}"`;
  const stroke =
    box.strokeWidth > 0
      ? ` stroke="${attr(box.stroke)}" stroke-width="${num(box.strokeWidth)}"${strokeDashArray}`
      : "";

  const effects = box.effects ?? [];
  // The filter now lives on the OUTER accessibility group (wrapElement),
  // never on the rect itself -- one <g id> per element, always, whether or
  // not it carries an effect.
  const filterId = defs.filter(effects, outerRect(box), box.bleed ?? NO_BLEED);

  const shape = box.shape ?? "rect";
  const primary = shapeElement(box, shape, { x, y, width, height, radius }, stroke);

  // Sheen (a gradient overlay clipped to the shape's own geometry) is
  // currently only implemented for the shapes that share a rect's own inset
  // geometry -- "rect" and "stadium", which IS a rect with a forced corner
  // radius. Diamond/hexagon/circle/ellipse skip it rather than approximate a
  // clip with the wrong outline; a sheen on the wrong shape would be a worse
  // defect than no sheen.
  const sheen =
    shape === "rect" || shape === "stadium"
      ? sheenToSvg(box, effects, defs, { x, y, width, height, radius: shapeRadius(shape, box, radius, half) })
      : "";
  const inner = sheen === "" ? primary : `${primary}\n${sheen}`;

  return wrapElement({
    id: box.id,
    titleText: labels === undefined ? undefined : labels.join(" / "),
    filterId,
    inner,
  });
}

/**
 * The primary shape drawn for one box, dispatched by `PlacedBox.shape`
 * (decision: M5 stage 3, non-rect shapes). Every shape shares the box's own
 * inset geometry -- `x`/`y`/`width`/`height` computed the same way the
 * original rect-only version of this file always computed them -- so the
 * stroke-vs-CSS-border alignment `boxToSvg`'s own comment explains keeps
 * holding for every shape whose geometry is expressed as a rect
 * (`rect`, `stadium`). Diamond, hexagon, circle and ellipse are drawn as
 * `<polygon>`/`<circle>`/`<ellipse>` on their own vertex/centre-radius
 * geometry instead, which is the one place this feature accepts a known,
 * small simplification: their stroke is not inset by half its own width the
 * way a rect's is, so it straddles the nominal boundary exactly as plain SVG
 * always draws a stroke, rather than matching the CSS-border convention the
 * rest of this file works hard to preserve. A visible few pixels at most,
 * never a correctness question -- the geometry CHECKS (text-fits-box,
 * label-within-shape) read the browser-measured content box, never this
 * stroke rendering nuance.
 */
function shapeElement(
  box: PlacedBox,
  shape: ShapeKind,
  geometry: { x: number; y: number; width: number; height: number; radius: number },
  stroke: string,
): string {
  const { x, y, width, height, radius } = geometry;

  if (shape === "rect") {
    return (
      `<rect data-pr-id="${attr(box.id)}" x="${num(x)}" y="${num(y)}" ` +
      `width="${num(width)}" height="${num(height)}" rx="${num(radius)}" ` +
      `fill="${attr(box.fill)}"${stroke}/>`
    );
  }
  if (shape === "stadium") {
    // A rounded rect with the corner radius forced to half the shorter
    // side IS a stadium: no new SVG primitive needed, only a different rx.
    const stadiumR = stadiumRadius({ x, y, width, height });
    return (
      `<rect data-pr-id="${attr(box.id)}" x="${num(x)}" y="${num(y)}" ` +
      `width="${num(width)}" height="${num(height)}" rx="${num(stadiumR)}" ` +
      `fill="${attr(box.fill)}"${stroke}/>`
    );
  }
  if (shape === "circle" || shape === "ellipse") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = shape === "circle" ? Math.min(width, height) / 2 : width / 2;
    const ry = shape === "circle" ? Math.min(width, height) / 2 : height / 2;
    return (
      `<ellipse data-pr-id="${attr(box.id)}" cx="${num(cx)}" cy="${num(cy)}" ` +
      `rx="${num(rx)}" ry="${num(ry)}" fill="${attr(box.fill)}"${stroke}/>`
    );
  }
  // diamond, hexagon, triangle: a polygon over the shape's own analytic vertices.
  const vertices = shapeVertices(shape, { x, y, width, height });
  if (vertices === null) {
    throw new Error(`Unhandled shape: ${shape}`);
  }
  const points = vertices.map((point) => `${num(point.x)},${num(point.y)}`).join(" ");
  return `<polygon data-pr-id="${attr(box.id)}" points="${points}" fill="${attr(box.fill)}"${stroke}/>`;
}

/** The corner radius sheenToSvg should clip to, per shape -- only meaningful for rect/stadium. */
function shapeRadius(shape: "rect" | "stadium", box: PlacedBox, rectRadius: number, half: number): number {
  if (shape === "rect") return rectRadius;
  return stadiumRadius({ x: box.x + half, y: box.y + half, width: box.width - box.strokeWidth, height: box.height - box.strokeWidth });
}

/**
 * A sheen is painted, not filtered: a second rect over the first, filled with
 * a white-to-transparent gradient.
 *
 * Doing it with geometry rather than with a filter primitive is deliberate.
 * The filter route is `feImage` of a gradient, which is the single worst
 * supported primitive in the whole specification — resvg implements only part
 * of it and several print pipelines ignore it outright. A rect with a
 * gradient fill is the most ordinary thing in SVG.
 *
 * It reuses the inset rect's own geometry and corner radius, so the highlight
 * follows the rounded corners exactly instead of overhanging them.
 */
function sheenToSvg(
  box: PlacedBox,
  effects: readonly ResolvedEffect[],
  defs: DefsRegistry,
  geometry: { x: number; y: number; width: number; height: number; radius: number },
): string {
  const sheens = effects.filter((effect) => effect.kind === "sheen");
  if (sheens.length === 0 || geometry.width <= 0 || geometry.height <= 0) return "";
  return sheens
    .map((sheen) => {
      const gradient = defs.sheenGradient(sheen.strength, sheen.direction);
      return (
        `<rect data-pr-id="${attr(box.id)}" data-pr-sheen="1" x="${num(geometry.x)}" ` +
        `y="${num(geometry.y)}" width="${num(geometry.width)}" height="${num(geometry.height)}" ` +
        `rx="${num(geometry.radius)}" fill="url(#${gradient})"/>`
      );
    })
    .join("\n");
}

/**
 * Connectors are a polyline plus arrowheads drawn as explicit filled paths.
 *
 * NOT <marker>. Markers are the obvious way and they are a portability trap:
 * support varies across the very renderers a figure gets opened in, and a
 * missing arrowhead silently reverses the meaning of a diagram. A path is a
 * path everywhere.
 */
/** SVG `stroke-dasharray` per line style. "solid" is the absence of the attribute. */
export const DASH_PATTERNS: Record<Exclude<LineStyle, "solid">, string> = {
  dashed: "6 4",
  dotted: "1 4",
  dashdot: "6 4 1 4",
};

/** Unified dash pattern helper for both connectors and boxes. */
function dashPattern(style: LineStyle): string {
  return style === "solid" ? "" : DASH_PATTERNS[style];
}

function connectorToSvg(connector: PlacedConnector, defs: DefsRegistry): string {
  if (connector.points.length < 2) return "";
  const path = connector.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${num(point.x)} ${num(point.y)}`)
    .join(" ");
  const dash =
    connector.lineStyle === "solid" ? "" : ` stroke-dasharray="${DASH_PATTERNS[connector.lineStyle]}"`;
  const parts = [
    `<path data-pr-id="${attr(connector.id)}" d="${path}" fill="none" ` +
      `stroke="${attr(connector.stroke)}" stroke-width="${num(connector.strokeWidth)}" ` +
      `stroke-linejoin="round" stroke-linecap="round"${dash}/>`,
  ];

  const last = connector.points.length - 1;
  if (connector.arrow === "end" || connector.arrow === "both") {
    parts.push(
      arrowHead(
        connector.points[last - 1]!,
        connector.points[last]!,
        connector.stroke,
        connector.arrowStyle,
        connector.strokeWidth,
      ),
    );
  }
  if (connector.arrow === "both") {
    parts.push(
      arrowHead(
        connector.points[1]!,
        connector.points[0]!,
        connector.stroke,
        connector.arrowStyle,
        connector.strokeWidth,
      ),
    );
  }

  const filterId = defs.filter(
    connector.effects ?? [],
    connectorInk(connector),
    connector.bleed ?? NO_BLEED,
  );
  // One filter over the line and its arrowheads together, on the outer
  // accessibility group. Filtering them separately would glow the shaft and
  // the head as two objects, with a seam where they meet.
  return wrapElement({
    id: connector.id,
    descText: `Connects ${connector.fromId} to ${connector.toId ?? "a point"}`,
    filterId,
    inner: parts.join("\n"),
  });
}

/**
 * The arrowhead at `tip`, pointing away from `from`, in one of six shapes
 * (decision: the vocabulary step of M5 stage 3). Every shape is drawn as an
 * explicit `<path>`/`<circle>`, never `<marker>` -- the same portability
 * argument this file already makes for the original closed triangle: marker
 * support varies across the tools a figure actually gets opened in, and a
 * missing arrowhead silently reverses a diagram's meaning.
 *
 * All six share one geometric frame -- a unit direction vector, a `size`
 * along it, and a `half`-width perpendicular offset for the back corners --
 * so adding a shape is extending this frame, not inventing a new one.
 */
function arrowHead(
  from: Point,
  tip: Point,
  colour: string,
  style: ArrowStyle,
  strokeWidth: number,
): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return "";
  const ux = dx / length;
  const uy = dy / length;
  const size = connectorTheme.arrowSize;
  const half = size * 0.3;
  const baseX = tip.x - ux * size;
  const baseY = tip.y - uy * size;
  // Perpendicular, for the back corners.
  const px = -uy * half;
  const py = ux * half;

  switch (style) {
    case "closed":
      return (
        `<path d="M ${num(tip.x)} ${num(tip.y)} L ${num(baseX + px)} ${num(baseY + py)} ` +
        `L ${num(baseX - px)} ${num(baseY - py)} Z" fill="${attr(colour)}"/>`
      );
    case "open":
      // A chevron, not a filled wedge: two strokes meeting at the tip, no
      // third side closing it, so the line underneath stays visible through
      // the middle -- the conventional "open arrow" reading.
      return (
        `<path d="M ${num(baseX + px)} ${num(baseY + py)} L ${num(tip.x)} ${num(tip.y)} ` +
        `L ${num(baseX - px)} ${num(baseY - py)}" fill="none" stroke="${attr(colour)}" ` +
        `stroke-width="${num(strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"/>`
      );
    case "diamond": {
      // A rhombus straddling the line, tip at the connector's own tip, back
      // point one more `size` further back so the whole shape sits ahead of
      // where the shaft used to end.
      const backX = tip.x - ux * size * 2;
      const backY = tip.y - uy * size * 2;
      return (
        `<path d="M ${num(tip.x)} ${num(tip.y)} L ${num(baseX + px)} ${num(baseY + py)} ` +
        `L ${num(backX)} ${num(backY)} L ${num(baseX - px)} ${num(baseY - py)} Z" ` +
        `fill="${attr(colour)}"/>`
      );
    }
    case "circle": {
      const cx = tip.x - ux * half;
      const cy = tip.y - uy * half;
      return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(half)}" fill="${attr(colour)}"/>`;
    }
    case "crowsfoot": {
      // ERD "many" notation: two strokes fanning out from the tip, short and
      // WIDE rather than "open"'s long and narrow -- a third prong retracing
      // the shaft's own centreline was tried first and rejected: it sits
      // exactly on top of the line already there and is invisible, confirmed
      // by rendering it and finding it indistinguishable from "open" by eye
      // before this shape existed. Real ERD crow's feet are two splayed lines,
      // not three; the spread angle, not a redundant line, is what a reader
      // actually sees.
      const wideHalf = size * 0.9;
      const shortBackX = tip.x - ux * size * 0.6;
      const shortBackY = tip.y - uy * size * 0.6;
      const wpx = -uy * wideHalf;
      const wpy = ux * wideHalf;
      return (
        `<path d="M ${num(shortBackX + wpx)} ${num(shortBackY + wpy)} L ${num(tip.x)} ${num(tip.y)} ` +
        `L ${num(shortBackX - wpx)} ${num(shortBackY - wpy)}" fill="none" stroke="${attr(colour)}" ` +
        `stroke-width="${num(strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"/>`
      );
    }
    case "half":
      // Only the near-side wedge of the closed triangle, filled -- the
      // conventional asymmetric arrow (UML async messages, one-way flow
      // where symmetry would overstate the relationship).
      return (
        `<path d="M ${num(tip.x)} ${num(tip.y)} L ${num(baseX + px)} ${num(baseY + py)} ` +
        `L ${num(baseX)} ${num(baseY)} Z" fill="${attr(colour)}"/>`
      );
    default: {
      const exhaustive: never = style;
      return exhaustive;
    }
  }
}

function textToSvg(text: PlacedText, defs: DefsRegistry, fontEmbed: FontEmbedMode): string {
  const anchor =
    text.anchor === "center" ? "middle" : text.anchor === "end" ? "end" : "start";

  const drawn = text.lines
    .map((line) => {
      if (fontEmbed === "outline") {
        const outlineFont = loadOutlineFont();
        if (!lineNeedsTextFallback(outlineFont, line.text)) {
          return outlineLineToSvg(text, line, anchor, outlineFont);
        }
        // Falls through to the ordinary <text> branch below: a character the
        // bundled font does not cover (see export/fonts.ts) is drawn with the
        // real installed face the mirror measured it with, rather than a
        // blank .notdef box or a silently wrong claim of outline coverage.
      }
      const fontWeight = text.fontWeight !== undefined && text.fontWeight !== 400
        ? ` font-weight="${num(text.fontWeight)}"`
        : "";
      return (
        `<text data-pr-id="${attr(text.id)}" x="${num(line.x)}" y="${num(line.y)}" ` +
        `font-family="${attr(text.fontFamily)}" font-size="${num(text.fontSize)}"${fontWeight} ` +
        `fill="${attr(text.fill)}" text-anchor="${anchor}" ` +
        `xml:space="preserve">${escapeText(line.text)}</text>`
      );
    })
    .join("\n");

  const filterId = defs.filter(
    text.effects ?? [],
    unionRects(text.lines.map((line) => line.box)),
    text.bleed ?? NO_BLEED,
  );
  // A label wraps to several lines but is one thing to the reader, so the
  // whole label is filtered once and wrapped once, on the outer accessibility
  // group. No <title> here: the text content itself is already the
  // accessible name a screen reader reads; a <desc> naming the owner is
  // structural information a reader cannot get from the glyphs alone.
  const transform =
    text.rotation === undefined || text.rotationCenter === undefined
      ? undefined
      : `rotate(${num(text.rotation)}, ${num(text.rotationCenter.x)}, ${num(text.rotationCenter.y)})`;

  return wrapElement({
    id: text.id,
    descText: text.ownerId === null ? undefined : `Labels ${text.ownerId}`,
    filterId,
    transform,
    inner: drawn,
  });
}

/**
 * One line, drawn as filled glyph `<path>`s against the bundled outline font,
 * instead of a single `<text>` element.
 *
 * `line.x`/`line.y` are the anchor point SVG's own `text-anchor` would use --
 * meaningless to a `<path>`, which has no anchor concept and is always
 * positioned by its own absolute coordinates. So the line's true LEFT start
 * is derived here from the anchor and the summed advance of every character,
 * and each glyph is placed by walking that sum left to right. The summed
 * advances are exactly what Chromium measured too: html.ts turns off CSS
 * kerning in outline mode for precisely this reason, so no character pair
 * this project draws is ever kerned differently from how it was measured.
 */
function outlineLineToSvg(
  text: PlacedText,
  line: PlacedText["lines"][number],
  anchor: "start" | "middle" | "end",
  outlineFont: ReturnType<typeof loadOutlineFont>,
): string {
  const chars = [...line.text];
  const advances = chars.map(
    (char) => outlineForChar(outlineFont, char, 0, 0, text.fontSize).advance,
  );
  const totalWidth = advances.reduce((sum, advance) => sum + advance, 0);
  const leftStart = anchor === "middle" ? line.x - totalWidth / 2 : anchor === "end" ? line.x - totalWidth : line.x;

  const glyphs: string[] = [];
  let cursor = leftStart;
  for (let i = 0; i < chars.length; i += 1) {
    const outline = outlineForChar(outlineFont, chars[i]!, cursor, line.y, text.fontSize);
    if (outline.d !== "") {
      glyphs.push(`<path data-pr-id="${attr(text.id)}" d="${outline.d}" fill="${attr(text.fill)}"/>`);
    }
    cursor += outline.advance;
  }
  return glyphs.join("\n");
}

/**
 * Edge darkening over the finished figure.
 *
 * Canvas-wide and painted, so it is the one effect that can never clip and
 * never needs bleed: it is bounded by the canvas by construction.
 */
function vignetteToSvg(figure: LaidOutFigure, defs: DefsRegistry): string {
  const strength = figure.vignette ?? 0;
  if (strength <= 0) return "";
  const gradient = defs.vignetteGradient(strength);
  return (
    `<rect data-pr-vignette="1" x="0" y="0" width="${num(figure.width)}" ` +
    `height="${num(figure.height)}" fill="url(#${gradient})"/>`
  );
}

function outerRect(box: PlacedBox): Rect {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * The ink a connector actually lays down: its route, widened by half its own
 * stroke and by the arrowhead, which sticks out past the last point.
 *
 * The bare polyline bounds would be wrong here in a way that only shows up
 * with an effect applied — the filter region would cut the arrowhead's glow
 * off flat, on the one element in a figure whose direction is its meaning.
 */
function connectorInk(connector: PlacedConnector): Rect {
  const pad =
    connector.strokeWidth / 2 +
    (connector.arrow === "none" ? 0 : connectorTheme.arrowSize);
  const bounds = unionRects(
    connector.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
  );
  return {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
  };
}

function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
