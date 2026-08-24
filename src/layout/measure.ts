/**
 * The measurement oracle.
 *
 * Everything in `measureInPage` runs inside Chromium, in the same engine that
 * will rasterise the result. It reads back:
 *   - the absolute rect and content box of every block, and
 *   - one rect per *wrapped line* of every label, with its true baseline.
 *
 * Baselines are the delicate part. SVG positions text on its baseline, and the
 * relationship between a line's client rect and its baseline is not something
 * the spec pins down. So instead of assuming, we measure: a zero-sized
 * inline-block with `vertical-align: baseline` has its bottom edge *on* the
 * baseline, which gives an exact offset from the line rect's top.
 */

export type PageMeasurement = {
  figure: { width: number; height: number };
  boxes: MeasuredBox[];
  texts: MeasuredText[];
  /** Scene origins, needed to lift scene-local coordinates into page space. */
  scenes: { id: string; x: number; y: number; width: number; height: number }[];
  fontWarnings: string[];
};

export type MeasuredBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  borderWidth: number;
  content: { x: number; y: number; width: number; height: number };
  /** Read back from computed style, so what was measured is what gets drawn. */
  fill: string;
  stroke: string;
  lineStyle?: string;
  radius: number;
  /** Where the label sits down the box, as the browser resolved it. */
  verticalAlign?: "start" | "center" | "end";
};

export type MeasuredText = {
  id: string;
  ownerId: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;
  color: string;
  anchor: "start" | "center" | "end";
  lines: MeasuredLine[];
};

export type MeasuredLine = {
  text: string;
  /** Anchor x, consistent with `anchor`. */
  x: number;
  /** Baseline y, measured not guessed. */
  y: number;
  box: { x: number; y: number; width: number; height: number };
  /**
   * True when this line's box height differs from the probe's, which means a
   * fallback font with different metrics rendered it and the baseline offset
   * may be slightly off. Surfaced rather than hidden.
   */
  baselineUncertain: boolean;
};

/**
 * Runs in the page. Must be self-contained: no imports, no closure over
 * anything in this module.
 */
export function measureInPage(): PageMeasurement {
  const round = (n: number): number => Math.round(n * 100) / 100;
  const fontWarnings: string[] = [];

  const root = document.getElementById("pr-root");
  if (!root) throw new Error("pr-root missing");
  const rootRect = root.getBoundingClientRect();

  const boxes: MeasuredBox[] = [];
  for (const el of Array.from(document.querySelectorAll("[data-pr-box]"))) {
    const id = el.getAttribute("data-pr-box") ?? "";
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const bt = parseFloat(style.borderTopWidth) || 0;
    const br = parseFloat(style.borderRightWidth) || 0;
    const bb = parseFloat(style.borderBottomWidth) || 0;
    const bl = parseFloat(style.borderLeftWidth) || 0;
    const pt = parseFloat(style.paddingTop) || 0;
    const pr = parseFloat(style.paddingRight) || 0;
    const pb = parseFloat(style.paddingBottom) || 0;
    const pl = parseFloat(style.paddingLeft) || 0;
    // "double"/"ridge"/"groove" are native CSS border-style keywords, read back
    // verbatim like "dashed"/"dotted"/"solid" always have been. "dashdot" has
    // no CSS equivalent (the mirror draws it as "dashed", see html.ts), so it
    // is not distinguishable here -- a pre-existing limitation of reading the
    // dash pattern back from computed style rather than carrying it from the
    // spec, not something this change introduces or fixes.
    const lineStyle =
      style.borderStyle === "dashed" ||
      style.borderStyle === "dotted" ||
      style.borderStyle === "solid" ||
      style.borderStyle === "double" ||
      style.borderStyle === "ridge" ||
      style.borderStyle === "groove"
        ? style.borderStyle
        : undefined;
    // Read back rather than copied from the spec: the repair loop has to know
    // whether a label overflowing *upward* is legitimate, and the only
    // trustworthy answer is what the engine actually applied.
    const column = style.display === "flex" && style.flexDirection === "column";
    const verticalAlign: MeasuredBox["verticalAlign"] = !column
      ? "start"
      : style.justifyContent === "center" ? "center"
      : style.justifyContent === "flex-end" ? "end"
      : "start";
    boxes.push({
      id,
      x: round(rect.left),
      y: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
      borderWidth: bt,
      content: {
        x: round(rect.left + bl + pl),
        y: round(rect.top + bt + pt),
        width: round(rect.width - bl - br - pl - pr),
        height: round(rect.height - bt - bb - pt - pb),
      },
      fill: style.backgroundColor,
      stroke: style.borderTopColor,
      lineStyle,
      radius: parseFloat(style.borderTopLeftRadius) || 0,
      verticalAlign,
    });
  }

  const scenes: PageMeasurement["scenes"] = [];
  for (const el of Array.from(document.querySelectorAll("[data-pr-scene]"))) {
    const rect = el.getBoundingClientRect();
    scenes.push({
      id: el.getAttribute("data-pr-scene") ?? "",
      x: round(rect.left),
      y: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
    });
  }

  const texts: MeasuredText[] = [];
  for (const el of Array.from(document.querySelectorAll("[data-pr-text]"))) {
    const span = el as HTMLElement;
    const ownerId = span.getAttribute("data-pr-text") ?? "";
    const textNode = span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
    const content = textNode.textContent ?? "";
    if (content.length === 0) continue;

    const style = getComputedStyle(span);
    const fontSize = parseFloat(style.fontSize) || 0;
    const fontWeight = parseFloat(style.fontWeight) || undefined;
    const align = style.textAlign;
    const anchor: "start" | "center" | "end" =
      align === "center" ? "center" : align === "right" || align === "end" ? "end" : "start";

    // --- per-character rects, grouped into lines ------------------------------
    const range = document.createRange();
    type CharRect = {
      ch: string;
      left: number;
      right: number;
      top: number;
      bottom: number;
      key: number;
    };
    const chars: CharRect[] = [];
    for (let i = 0; i < content.length; i += 1) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rects = range.getClientRects();
      if (rects.length === 0) continue; // collapsed whitespace at a wrap point
      const r = rects[rects.length - 1]!;
      if (r.width === 0 && r.height === 0) continue;
      // A run of spaces is collapsed by CSS to one rendered space: the second
      // and third get a rect with zero width but a full line's height, so the
      // test above lets them through. They must not, because they are drawn.
      // The exported SVG carries xml:space="preserve" — a space kept here is
      // measured as nothing and then drawn at full width, and the label ends
      // up wider than the box that was measured for it. Every check downstream
      // agrees with the measurement and none of them can see it.
      //
      // The rule this restores is the one everything else rests on: the string
      // that was measured is the string that gets drawn. Whitespace only —
      // a zero-width non-space is a combining mark or a joiner, which really
      // is part of the glyph and really was measured with it.
      if (r.width === 0 && /\s/.test(content[i]!)) continue;
      chars.push({
        ch: content[i]!,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        key: Math.round(r.top),
      });
    }

    const groups = new Map<number, CharRect[]>();
    for (const c of chars) {
      const bucket = groups.get(c.key);
      if (bucket) bucket.push(c);
      else groups.set(c.key, [c]);
    }

    // --- baseline probe: bottom of a zero-size inline-block IS the baseline ---
    const probe = document.createElement("span");
    probe.setAttribute("data-pr-probe", "1");
    probe.style.whiteSpace = "nowrap";
    const probeText = document.createTextNode("x");
    probe.appendChild(probeText);
    const marker = document.createElement("i");
    marker.style.display = "inline-block";
    marker.style.width = "0";
    marker.style.height = "0";
    marker.style.verticalAlign = "baseline";
    probe.appendChild(marker);
    span.parentElement?.appendChild(probe);

    const probeRange = document.createRange();
    probeRange.setStart(probeText, 0);
    probeRange.setEnd(probeText, 1);
    const probeLineRect = probeRange.getBoundingClientRect();
    const baselineOffset = marker.getBoundingClientRect().bottom - probeLineRect.top;
    const probeLineHeight = probeLineRect.height;
    probe.remove();

    const lines: MeasuredLine[] = [];
    const keys = Array.from(groups.keys()).sort((a, b) => a - b);
    for (const key of keys) {
      const group = groups.get(key)!;
      let start = 0;
      let end = group.length - 1;
      while (start <= end && /\s/.test(group[start]!.ch)) start += 1;
      while (end >= start && /\s/.test(group[end]!.ch)) end -= 1;
      if (start > end) continue;
      const kept = group.slice(start, end + 1);

      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      let text = "";
      for (const c of kept) {
        left = Math.min(left, c.left);
        right = Math.max(right, c.right);
        top = Math.min(top, c.top);
        bottom = Math.max(bottom, c.bottom);
        text += c.ch;
      }

      const height = bottom - top;
      const uncertain = Math.abs(height - probeLineHeight) > 1;
      if (uncertain) {
        fontWarnings.push(
          `line "${text.slice(0, 24)}" rendered with different metrics than the probe ` +
            `(line box ${round(height)}px vs ${round(probeLineHeight)}px); a fallback font was used`,
        );
      }

      const anchorX = anchor === "center" ? (left + right) / 2 : anchor === "end" ? right : left;
      lines.push({
        text,
        x: round(anchorX),
        y: round(top + baselineOffset),
        box: { x: round(left), y: round(top), width: round(right - left), height: round(height) },
        baselineUncertain: uncertain,
      });
    }

    texts.push({
      id: `${ownerId}--label`,
      ownerId,
      fontFamily: style.fontFamily,
      fontSize: round(fontSize),
      fontWeight,
      color: style.color,
      anchor,
      lines,
    });
  }

  return {
    figure: { width: round(rootRect.width), height: round(rootRect.height) },
    boxes,
    texts,
    scenes,
    fontWarnings,
  };
}
