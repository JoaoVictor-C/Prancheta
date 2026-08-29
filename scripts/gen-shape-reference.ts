/**
 * Shape/arrowhead-reference generator (M5 stage 3, step 18).
 *
 * Renders `docs/design/GEOMETRY.generated.md` so this new vocabulary gets the
 * same "generated, never hand-typed" treatment the palette and effect tables
 * already have. Every number below is computed, not transcribed:
 *
 * - Each shape's inscribed-area fraction is a real grid sample of
 *   `containsPoint` -- the exact function `label-within-shape` calls at
 *   check time -- over a canonical box, not a formula copied from memory
 *   that could silently stop matching the code.
 * - Each arrowhead's size and each line style's dash pattern are read live
 *   from `theme.ts` and `render/svg.ts`'s own `DASH_PATTERNS`, so a change to
 *   either place updates this file the next time it is regenerated, and
 *   `--check` catches the case where nobody did.
 *
 * What a shape or arrowhead is *for* stays hand-written prose here (there is
 * no function to compute "why choose crowsfoot"), same split PALETTE and
 * EFFECTS already draw between generated numbers and narrative.
 *
 *   node scripts/gen-shape-reference.ts
 *   node scripts/gen-shape-reference.ts --check   exit 1 if the file is stale
 */

import { readFile, writeFile } from "node:fs/promises";
import { containsPoint, SHAPE_KINDS } from "../src/geometry/shapes.ts";
import type { ShapeKind } from "../src/geometry/shapes.ts";
import { ARROW_STYLES, LINE_STYLES } from "../src/ir/types.ts";
import type { ArrowStyle, LineStyle } from "../src/ir/types.ts";
import { DASH_PATTERNS } from "../src/render/svg.ts";
import { connector as connectorTheme } from "../src/theme.ts";

const OUTPUT = "docs/design/GEOMETRY.generated.md";

const SHAPE_DESCRIPTIONS: Record<ShapeKind, string> = {
  rect: "The original, only shape before M5 stage 3. Fills its own bounding box exactly.",
  circle: "Inscribed at the SMALLER of the box's two dimensions, centred -- a true circle even in a non-square box, with the remaining space empty.",
  ellipse: "Hugs the full box on both axes. Distinct from `circle` on purpose: choosing one over the other in a wide box is a real, different claim.",
  diamond: "The box's own edge midpoints, joined -- `|x-cx|/halfW + |y-cy|/halfH <= 1`.",
  hexagon: "A flat-topped, elongated hexagon (BPMN/flowchart convention, not a regular polygon): two vertical sides, corner cuts a quarter of the box width on each side.",
  stadium: "A rectangle with fully rounded ends; the radius is half the shorter side, so a near-square box degrades toward a circle rather than self-intersecting.",
  triangle: "An upward triangle on the box's own base: apex at the top edge's midpoint, base along the bottom edge.",
  parallelogram: "A rectangle sheared horizontally by a sixth of its width -- the flowchart convention for input and output.",
  trapezoid: "Narrower at the top than the bottom (the flowchart \"manual operation\"). Both parallel sides are kept, so a label still has a full-width baseline.",
  chevron: "A rightward process arrow with a notched tail, so a row of them interlocks exactly without overlapping. Point and notch are the same depth.",
  cross: "A plus with arms a third of each dimension. Genuinely concave -- all four box corners are outside it, which is why containment is tested by winding.",
  star: "A five-pointed star, inner radius 0.382 of the outer. At 27.6% of its bounding box it is the least capacious shape here: a marker, not a container.",
  note: "A page with its top-right corner turned back -- the conventional note or document annotation. The fold is a fifth of the width, clamped to half the height.",
};

const ARROW_DESCRIPTIONS: Record<ArrowStyle, string> = {
  closed: "A filled triangle -- the original, default shape.",
  open: "A chevron: two strokes meeting at the tip, no closing third side, so the shaft stays visible through the middle.",
  diamond: "A filled rhombus straddling the line, tip at the connector's endpoint.",
  circle: "A filled dot centred just back from the tip.",
  crowsfoot: "ERD \"many\" notation: two strokes fanning WIDE from the tip, short rather than long -- the conventional two-pronged crow's foot, not a redundant third line retracing the shaft.",
  half: "Only the near-side wedge of the closed triangle, filled -- the conventional asymmetric arrow (UML async messages) where the closed triangle's symmetry would overstate the relationship.",
};

const LINE_DESCRIPTIONS: Record<LineStyle, string> = {
  solid: "No `stroke-dasharray` attribute at all.",
  dashed: "Long dashes, even gaps.",
  dotted: "Short dashes read as dots at typical stroke widths.",
  dashdot: "One long dash, one short dash, repeating.",
  double: "Two thin bands (strokeWidth/3 each) with a gap between, drawn as two stroke passes over the box's own path rather than as a dash pattern.",
  ridge: "Two bands of strokeWidth/2 with no gap, one lighter and one darker than the block's own stroke colour, lit from the OUTSIDE -- the classic CSS 3D border, held to the theme's own colours.",
  groove: "The ridge lit from the INSIDE: the same two bands with the darker one outermost.",
};

/** Grid-samples containsPoint over `box` and returns the fraction of sample points inside the shape. */
function inscribedAreaFraction(shape: ShapeKind, box: { x: number; y: number; width: number; height: number }): number {
  const steps = 200;
  let inside = 0;
  let total = 0;
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const point = { x: box.x + (box.width * i) / steps, y: box.y + (box.height * j) / steps };
      total += 1;
      if (containsPoint(shape, box, point)) inside += 1;
    }
  }
  return inside / total;
}

const CANONICAL_BOX = { x: 0, y: 0, width: 120, height: 80 };
const CORNERS = [
  { name: "top-left", point: { x: CANONICAL_BOX.x, y: CANONICAL_BOX.y } },
  { name: "top-right", point: { x: CANONICAL_BOX.x + CANONICAL_BOX.width, y: CANONICAL_BOX.y } },
  { name: "bottom-left", point: { x: CANONICAL_BOX.x, y: CANONICAL_BOX.y + CANONICAL_BOX.height } },
  { name: "bottom-right", point: { x: CANONICAL_BOX.x + CANONICAL_BOX.width, y: CANONICAL_BOX.y + CANONICAL_BOX.height } },
];

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const lines: string[] = [];

lines.push("<!-- GENERATED FILE. Do not hand-edit. -->");
lines.push(
  "<!-- Generated by scripts/gen-shape-reference.ts from src/geometry/shapes.ts, src/ir/types.ts, src/render/svg.ts and src/theme.ts. -->",
);
lines.push("");
lines.push("# Shape & arrowhead reference");
lines.push("");
lines.push(
  "This file is generated with `node scripts/gen-shape-reference.ts`; do not edit it by hand. " +
    "Every inscribed-area fraction below is a real grid sample of `containsPoint` -- the same " +
    "function [`label-within-shape`](../decisions/0005-module-protocol.md) checks a label " +
    `against at render time -- over a canonical ${CANONICAL_BOX.width}x${CANONICAL_BOX.height} box.`,
);
lines.push("");

lines.push("## Block shapes (`Block.shape`)");
lines.push("");
lines.push(
  `Every shape shares the block's own axis-aligned bounding box exactly -- see [step 14](../PLAN-NEXT.md) ` +
    "and [src/geometry/shapes.ts](../../src/geometry/shapes.ts).",
);
lines.push("");
lines.push("| shape | inscribed area (of bbox) | top-left | top-right | bottom-left | bottom-right | what it is |");
lines.push("| --- | --- | --- | --- | --- | --- | --- |");
for (const shape of SHAPE_KINDS) {
  const fraction = inscribedAreaFraction(shape, CANONICAL_BOX);
  const cells = CORNERS.map((c) => (containsPoint(shape, CANONICAL_BOX, c.point) ? "in" : "out"));
  lines.push(
    `| \`${shape}\` | ${round(fraction * 100)}% | ${cells[0]} | ${cells[1]} | ${cells[2]} | ${cells[3]} | ${SHAPE_DESCRIPTIONS[shape]} |`,
  );
}
lines.push("");

lines.push("## Arrowheads (`Connector.arrowStyle`)");
lines.push("");
lines.push(
  `All six share one geometric frame: a \`size\` of ${connectorTheme.arrowSize}px along the connector's own ` +
    `direction, and a back-corner half-width of ${round(connectorTheme.arrowSize * 0.3)}px perpendicular to it -- ` +
    "drawn as an explicit `<path>`/`<circle>`, never `<marker>` (portability: marker support varies across the " +
    "tools a figure actually gets opened in). See [src/render/svg.ts](../../src/render/svg.ts)'s `arrowHead`.",
);
lines.push("");
lines.push("| style | what it is |");
lines.push("| --- | --- |");
for (const style of ARROW_STYLES) {
  lines.push(`| \`${style}\` | ${ARROW_DESCRIPTIONS[style]} |`);
}
lines.push("");

lines.push("## Line styles (`Connector.lineStyle`)");
lines.push("");
lines.push(
  "`dashed: true` (the boolean predecessor) and `lineStyle: \"dashed\"` draw byte-identically; " +
    "`lineStyle` is a superset and supersedes the boolean when both are given.",
);
lines.push("");
lines.push("| style | `stroke-dasharray` | what it is |");
lines.push("| --- | --- | --- |");
lines.push(`| \`solid\` | (none) | ${LINE_DESCRIPTIONS.solid} |`);
for (const style of LINE_STYLES) {
  if (style === "solid") continue;
  // double/ridge/groove are not dash patterns at all -- they are two stroke
  // passes over the box's own path, and they apply to a Block's border only:
  // a Connector carrying one draws solid, since dashPattern() has nothing to
  // give it. Printing DASH_PATTERNS[style] for them put `undefined` in this
  // column, the same defect SHAPE_DESCRIPTIONS had for `triangle`.
  const pattern =
    style in DASH_PATTERNS
      ? `\`${DASH_PATTERNS[style as keyof typeof DASH_PATTERNS]}\``
      : "(none -- two stroke passes, `Block` borders only)";
  lines.push(`| \`${style}\` | ${pattern} | ${LINE_DESCRIPTIONS[style]} |`);
}
lines.push("");

const content = `${lines.join("\n")}\n`;
const summary = `${SHAPE_KINDS.length} shapes, ${ARROW_STYLES.length} arrowheads, ${LINE_STYLES.length} line styles`;

if (process.argv.includes("--check")) {
  const existing = await readFile(OUTPUT, "utf8").catch(() => null);
  if (existing === content) {
    console.log(`up to date  ${OUTPUT} (${summary})`);
  } else {
    console.error(
      `STALE  ${OUTPUT}\n` +
        "  The shape/arrowhead/line-style vocabulary changed and this reference was not regenerated.\n" +
        "  Run: node scripts/gen-shape-reference.ts",
    );
    process.exit(1);
  }
} else {
  await writeFile(OUTPUT, content);
  console.log(`Wrote ${OUTPUT} (${summary}).`);
}
