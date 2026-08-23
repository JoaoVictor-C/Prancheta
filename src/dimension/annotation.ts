/**
 * Dimension annotation and figure scale (M8, stage 5, step 29).
 *
 * Maps real-world measurements to canvas coordinates and renders dimension lines
 * with extension lines, arrows, and annotated measurements. Unlocks the drafting
 * genre — architectural plans, mechanical drawings, maps with scale bars.
 *
 * Reuses the scale abstraction (step 25): a dimension is just a linear scale
 * from real-world units to canvas pixels with one tick at each endpoint.
 */

import type { Scale } from "../scales.ts";
import { createLinearScale } from "../scales.ts";

export type Unit = "mm" | "cm" | "m" | "in" | "ft" | "px";

export type FigureScale = {
  /** Real-world distance represented by one canvas pixel. */
  realWorldPerPixel: number;
  /** Unit of measurement. */
  unit: Unit;
  /** Human-readable scale description (e.g., "1:50", "1\" = 10'"). */
  description: string;
};

export type DimensionLine = {
  /** Start point in canvas coordinates. */
  start: { x: number; y: number };
  /** End point in canvas coordinates. */
  end: { x: number; y: number };
  /** Real-world measurement to display. */
  measurement: number;
  /** Unit of measurement. */
  unit: Unit;
  /** Offset distance for the dimension line from the actual edge (in pixels). */
  offset?: number;
  /** Extension line length beyond the dimension line (in pixels). */
  extensionOverhang?: number;
  /** Label position: "above", "below", "inline" (default: "inline"). */
  labelPosition?: "above" | "below" | "inline";
};

/**
 * Create a figure scale from a ratio (e.g., 1:50 means 1 canvas unit = 50 real units).
 */
export function createFigureScale(ratio: number, unit: Unit): FigureScale {
  return {
    realWorldPerPixel: ratio,
    unit,
    description: `1:${ratio}`,
  };
}

/**
 * Create a scale that maps real-world coordinates to canvas coordinates.
 */
export function createRealWorldScale(
  realWorldDomain: [number, number],
  canvasRange: [number, number],
  unit: Unit,
): Scale & { figureScale: FigureScale } {
  const [r0, r1] = realWorldDomain;
  const [c0, c1] = canvasRange;
  const realWorldSpan = r1 - r0;
  const canvasSpan = c1 - c0;
  const realWorldPerPixel = realWorldSpan / canvasSpan;

  const scale = createLinearScale(realWorldDomain, canvasRange);

  return {
    ...scale,
    figureScale: {
      realWorldPerPixel,
      unit,
      description: `1:${realWorldPerPixel.toFixed(2)}`,
    },
  };
}

/**
 * Render a dimension line with extension lines, arrows, and measurement label.
 */
export function renderDimensionLine(dim: DimensionLine): string {
  const { start, end, measurement, unit, offset = 20, extensionOverhang = 5, labelPosition = "inline" } = dim;

  // Vector from start to end
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    return ""; // Degenerate dimension line
  }

  // Normalized direction vector
  const ux = dx / length;
  const uy = dy / length;

  // Perpendicular vector (for offset)
  const px = -uy;
  const py = ux;

  // Dimension line endpoints (offset from actual edge)
  const dimStart = {
    x: start.x + px * offset,
    y: start.y + py * offset,
  };
  const dimEnd = {
    x: end.x + px * offset,
    y: end.y + py * offset,
  };

  // Extension lines
  const extStart1 = { x: start.x - px * extensionOverhang, y: start.y - py * extensionOverhang };
  const extEnd1 = { x: start.x + px * (offset + extensionOverhang), y: start.y + py * (offset + extensionOverhang) };

  const extStart2 = { x: end.x - px * extensionOverhang, y: end.y - py * extensionOverhang };
  const extEnd2 = { x: end.x + px * (offset + extensionOverhang), y: end.y + py * (offset + extensionOverhang) };

  // Arrow heads (simple triangles)
  const arrowSize = 6;
  const arrow1 = `M ${dimStart.x},${dimStart.y} l ${ux * arrowSize - px * (arrowSize / 2)},${uy * arrowSize - py * (arrowSize / 2)} l ${px * arrowSize},${py * arrowSize} Z`;
  const arrow2 = `M ${dimEnd.x},${dimEnd.y} l ${-ux * arrowSize - px * (arrowSize / 2)},${-uy * arrowSize - py * (arrowSize / 2)} l ${px * arrowSize},${py * arrowSize} Z`;

  // Label
  const labelX = (dimStart.x + dimEnd.x) / 2;
  const labelY = (dimStart.y + dimEnd.y) / 2;
  const labelOffset = labelPosition === "above" ? -8 : labelPosition === "below" ? 16 : 0;
  const labelText = `${measurement.toFixed(2)} ${unit}`;

  const svg = `<g class="dimension-line">
  <line x1="${extStart1.x}" y1="${extStart1.y}" x2="${extEnd1.x}" y2="${extEnd1.y}" stroke="#888" stroke-width="1"/>
  <line x1="${extStart2.x}" y1="${extStart2.y}" x2="${extEnd2.x}" y2="${extEnd2.y}" stroke="#888" stroke-width="1"/>
  <line x1="${dimStart.x}" y1="${dimStart.y}" x2="${dimEnd.x}" y2="${dimEnd.y}" stroke="#888" stroke-width="1.5"/>
  <path d="${arrow1}" fill="#888"/>
  <path d="${arrow2}" fill="#888"/>
  <text x="${labelX}" y="${labelY + labelOffset}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="11" fill="#888">${labelText}</text>
</g>`;

  return svg;
}

/**
 * Format a measurement with appropriate precision based on magnitude.
 */
export function formatMeasurement(value: number, unit: Unit): string {
  const precision = value < 1 ? 2 : value < 10 ? 1 : 0;
  return `${value.toFixed(precision)} ${unit}`;
}

/**
 * Convert between units.
 */
export function convertUnits(value: number, from: Unit, to: Unit): number {
  const toMm: Record<Unit, number> = {
    mm: 1,
    cm: 10,
    m: 1000,
    in: 25.4,
    ft: 304.8,
    px: 0.264583, // 96 DPI standard
  };

  const valueInMm = value * toMm[from];
  return valueInMm / toMm[to];
}
