/**
 * Quick test of triangle shape rendering.
 */

import type { FigureSpec } from "./src/ir/types.ts";

export function createTriangleTest(): FigureSpec {
  return {
    version: 1,
    canvas: {
      padding: 20,
      background: "#FFFFFF",
    },
    root: {
      type: "stack",
      direction: "row",
      gap: 20,
      children: [
        {
          type: "block",
          label: "Antenna",
          shape: "triangle",
          width: 40,
          height: 40,
          fill: "#000000",
          stroke: "#000000",
          strokeWidth: 1,
        },
        {
          type: "block",
          label: "Diamond",
          shape: "diamond",
          width: 40,
          height: 40,
          fill: "#000000",
          stroke: "#000000",
          strokeWidth: 1,
        },
      ],
    },
  };
}
