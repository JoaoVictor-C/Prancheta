import { createMissingFeaturesTest } from "./test-missing-features.ts";
import { render } from "./src/index.ts";
import { writeFileSync } from "node:fs";

async function main() {
  const spec = createMissingFeaturesTest();
  const result = await render(spec);

  writeFileSync("out/missing-features-test.svg", result.svg, "utf-8");
  console.log("✓ Generated: out/missing-features-test.svg");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
