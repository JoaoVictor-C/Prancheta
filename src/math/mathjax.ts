/**
 * Math typesetting via MathJax (M8, stage 5, step 28).
 *
 * Embeds mathematical notation as SVG paths (not fonts), making it portable
 * and measurable. MathJax generates SVG from LaTeX/MathML, we measure its
 * bbox, and treat it as a measured group — the same discipline the module
 * protocol (decision 0005) uses for external SVG.
 *
 * Why SVG paths over KaTeX HTML: portability. An HTML <span> with CSS-positioned
 * glyphs depends on font files and CSS layout, both of which break when the
 * figure is opened in Illustrator or converted to PDF. SVG paths are self-
 * contained geometry that renders identically everywhere.
 */

export type MathNode = {
  /** LaTeX source (e.g., "E = mc^2", "\\frac{a}{b}", "\\int_0^\\infty"). */
  latex: string;
  /** Unique id for this math element. */
  id: string;
  /** Position in canvas coordinates. */
  x: number;
  y: number;
  /** Font size in pt (affects rendered size). */
  fontSize?: number;
  /** Color (hex). */
  color?: string;
};

export type RenderedMath = {
  /** SVG markup for the math (paths only, no <text>). */
  svg: string;
  /** Measured bounding box in canvas coordinates. */
  box: { x: number; y: number; width: number; height: number };
  /** Baseline offset from top of box (for alignment). */
  baseline: number;
};

/**
 * Render LaTeX to SVG paths using MathJax.
 *
 * This is a placeholder implementation that returns a simple box with the
 * latex string. Full MathJax integration requires:
 * 1. Installing mathjax-full or mathjax-node
 * 2. Configuring MathJax to output SVG (not HTML)
 * 3. Extracting <path> elements from MathJax output
 * 4. Measuring the bbox from the SVG
 *
 * For now, this returns a mock so the type system and tests can be written.
 */
export async function renderMath(node: MathNode): Promise<RenderedMath> {
  const fontSize = node.fontSize ?? 16;
  const color = node.color ?? "#E6E9EF";

  // TODO: Real MathJax integration
  // const mjAPI = require('mathjax-node');
  // const result = await mjAPI.typeset({
  //   math: node.latex,
  //   format: "TeX",
  //   svg: true,
  // });
  // Extract paths from result.svg, measure bbox, return.

  // Mock implementation: render latex as text in a box
  const width = node.latex.length * fontSize * 0.6;
  const height = fontSize * 1.2;

  const svg = `<g data-pr-id="${node.id}" transform="translate(${node.x}, ${node.y})">
  <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="2,2"/>
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="serif" font-size="${fontSize}" fill="${color}">${escapeXml(node.latex)}</text>
</g>`;

  return {
    svg,
    box: {
      x: node.x,
      y: node.y,
      width,
      height,
    },
    baseline: height * 0.8, // Approximate baseline position
  };
}

/**
 * Render multiple math nodes as a group.
 */
export async function renderMathGroup(nodes: MathNode[]): Promise<{
  svg: string;
  boxes: Map<string, { x: number; y: number; width: number; height: number }>;
}> {
  const rendered = await Promise.all(nodes.map(renderMath));

  const svgParts = rendered.map((r) => r.svg);
  const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();

  for (let i = 0; i < nodes.length; i++) {
    boxes.set(nodes[i]!.id, rendered[i]!.box);
  }

  return {
    svg: svgParts.join("\n"),
    boxes,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
