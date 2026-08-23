import { createNavigationControlDiagram } from "./test-navigation-diagram-fixed.ts";
import { render } from "./src/index.ts";
import { writeFileSync } from "node:fs";

async function main() {
  const spec = createNavigationControlDiagram();
  const result = await render(spec);

  writeFileSync("out/navigation-control-diagram-fixed.svg", result.svg, "utf-8");
  console.log("✓ Generated: out/navigation-control-diagram-fixed.svg");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
