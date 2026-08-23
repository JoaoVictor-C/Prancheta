/**
 * Render triangle test to verify shape works.
 */

import { createTriangleTest } from "./test-triangle-shape.ts";
import { render } from "./src/index.ts";
import { writeFileSync } from "node:fs";

async function main() {
  const spec = createTriangleTest();
  const result = await render(spec);

  writeFileSync("out/triangle-test.svg", result.svg, "utf-8");
  console.log("✓ Generated: out/triangle-test.svg");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
