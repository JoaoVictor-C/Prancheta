/**
 * Simple test to render the Navigation Control diagram.
 */

import { writeFileSync } from "node:fs";
import { createNavigationControlDiagram } from "./test-navigation-diagram.ts";

// Write the spec to a JSON file
const spec = createNavigationControlDiagram();
writeFileSync("out/navigation-diagram-spec.json", JSON.stringify(spec, null, 2), "utf-8");

console.log("✓ Generated: out/navigation-diagram-spec.json");
console.log("\nTo render to SVG, run:");
console.log("  npm run cli render out/navigation-diagram-spec.json -o out");
