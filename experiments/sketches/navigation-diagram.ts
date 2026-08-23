/**
 * Render the Navigation Control diagram to SVG.
 */

import { createNavigationControlDiagram } from "./test-navigation-diagram.ts";
import { parseSpec } from "./src/ir/parse.ts";
import { layout } from "./src/layout/layout.ts";
import { toSvg } from "./src/render/svg.ts";
import { writeFileSync } from "node:fs";

async function main() {
  const spec = createNavigationControlDiagram();

  // Parse and validate the spec
  const parsed = parseSpec(spec);

  // Layout the figure
  const laidOut = await layout(parsed);

  // Render to SVG
  const svg = toSvg(laidOut);

  // Write to out folder
  writeFileSync("out/navigation-control-diagram.svg", svg, "utf-8");

  console.log("✓ Generated: out/navigation-control-diagram.svg");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
