/**
 * Test missing features for accurate diagram replication:
 * - Font weight (fontWeight on Block)
 * - Dashed block borders (lineStyle on Block)
 * - Triangle/diamond shapes for antenna symbols
 * - Path primitives for braces
 */

import type { FigureSpec } from "./src/ir/types.ts";

export function createMissingFeaturesTest(): FigureSpec {
  return {
    version: 1,
    canvas: {
      padding: 20,
      background: "#FFFFFF",
    },
    root: {
      type: "stack",
      direction: "column",
      gap: 20,
      children: [
        // Font weight test
        {
          type: "block",
          label: "Normal Weight",
          fontWeight: 400,
          fontSize: 16,
          fill: "#FFFFFF",
          stroke: "#000000",
          strokeWidth: 1,
        },
        {
          type: "block",
          label: "Bold Weight",
          fontWeight: 700,
          fontSize: 16,
          fill: "#FFFFFF",
          stroke: "#000000",
          strokeWidth: 1,
        },

        // Dashed border test
        {
          type: "block",
          label: "Dashed Border",
          lineStyle: "dashed",
          fill: "#FFCCCC",
          stroke: "#FF0000",
          strokeWidth: 1,
        },

        // Triangle for antenna
        {
          type: "block",
          label: "",
          shape: "triangle",
          width: 30,
          height: 30,
          fill: "#000000",
        },

        // Diamond for antenna
        {
          type: "block",
          label: "",
          shape: "diamond",
          width: 30,
          height: 30,
          fill: "#000000",
        },
      ],
    },
  };
}
