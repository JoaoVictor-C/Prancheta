/**
 * Colourblind-safety distance (decision 0007).
 *
 * `contrast-sufficient` asks whether ink is readable against its own
 * background. This asks a different question: whether two colours that are
 * supposed to mean two different things (two chart series, two legend
 * entries) still look different to a reader who does not see colour the way
 * the author does.
 *
 * The simulation is the Coblis / Machado-family simplified dichromacy
 * matrices — a linear transform in gamma-corrected sRGB space, not a full
 * cone-response model. It is a deliberately simple, well-known approximation
 * rather than a novel one: the point is a repeatable, explainable number, not
 * research-grade colour science. Distance is plain Euclidean distance in the
 * simulated 0-255 RGB cube, which is crude compared to a perceptual space
 * like CIEDE2000 but is monotonic in the right direction and costs nothing to
 * verify by hand.
 */

import { parseColour } from "./contrast.ts";

export type DichromacyKind = "deuteranopia" | "protanopia";

/** Simplified simulation matrices (Coblis), applied directly in sRGB space. */
const MATRICES: Record<DichromacyKind, readonly [number, number, number][]> = {
  protanopia: [
    [0.567, 0.433, 0],
    [0.558, 0.442, 0],
    [0, 0.242, 0.758],
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
};

/** How a dichromat would see this colour, as 0-255 RGB. Null for unparsable input. */
export function simulate(
  hex: string,
  kind: DichromacyKind,
): { r: number; g: number; b: number } | null {
  const rgb = parseColour(hex);
  if (rgb === null) return null;
  const matrix = MATRICES[kind];
  const [row0, row1, row2] = matrix;
  const apply = (row: readonly [number, number, number]): number =>
    clamp255(row[0] * rgb.r + row[1] * rgb.g + row[2] * rgb.b);
  return { r: apply(row0!), g: apply(row1!), b: apply(row2!) };
}

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, value));
}

/** Euclidean RGB distance after simulating `kind`. Null if either colour is unparsable. */
export function simulatedDistance(a: string, b: string, kind: DichromacyKind): number | null {
  const sa = simulate(a, kind);
  const sb = simulate(b, kind);
  if (sa === null || sb === null) return null;
  return Math.hypot(sa.r - sb.r, sa.g - sb.g, sa.b - sb.b);
}

/**
 * The minimum simulated RGB distance this project treats as "still
 * distinguishable". Chosen empirically against the design system's own
 * palette (see the generated colour reference): every existing role pair
 * clears it by a wide margin, and two colours that only differ by hue at
 * matched lightness (the case dichromacy actually collapses) fall well
 * under it. Not a standard; a documented, checkable choice.
 */
export const MIN_DISTINGUISHABLE_DISTANCE = 40;

export const DICHROMACY_KINDS: readonly DichromacyKind[] = ["deuteranopia", "protanopia"];
