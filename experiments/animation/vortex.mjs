/**
 * The vortex: a phyllotaxis disc that blooms outward while twisting
 * differentially — core turning hard, rim barely.
 *
 * Two rules this generator exists to enforce, both learned the hard way:
 *
 *   1. Seed SIZE and COLOUR are functions of INDEX, never of radius. Radius is
 *      exactly what changes between the two states, so a size or fill keyed to
 *      it would differ across states, and diff.ts would classify every seed as
 *      `resized`/`restyled` rather than `moved` — which means never tweened at
 *      all. The disc would sit perfectly still.
 *
 *   2. Separation must exceed sqrt(2) times each pair's own half-extent sum.
 *      The motion check tests axis-aligned overlap, not distance, so a pair
 *      clear along an axis can be carried into overlap at 45 degrees with its
 *      separation unchanged. Below that threshold no bloom-twist composition
 *      is feasible at all; the generator reports the realised ratio so this is
 *      never assumed.
 */

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function vortex({
  n = 260,
  c = 22,
  minSeed = 12,
  maxSeed = 22,
  bloom = 1.0,
  coreTwist = 0,
  falloff = 2,
  canvas = 1360,
  // Ripple: each seed moves during only part of the transition, its window
  // opening later the further out it sits, so the gesture travels outward from
  // the core. `span` is how much of the transition each seed gets. A span of 1
  // is no stagger at all, which is what every seed did before M13.
  span = 1,
} = {}) {
  const centre = canvas / 2;
  const R = c * Math.sqrt(n);

  const children = Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    const r0 = c * Math.sqrt(i + 1);
    const r = r0 * bloom;
    // Twist decays from the core outward: a whirlpool, not a turntable. The
    // core barely translates, so angular work is cheap there; the rim is
    // already travelling far under the bloom, so it is left alone.
    const twist = coreTwist * Math.pow(1 - r0 / R, falloff);
    const a = (i + 1) * GOLDEN + twist;
    const size = minSeed + (maxSeed - minSeed) * k; // index, not radius
    const open = (r0 / R) * (1 - span);
    return {
      type: "block",
      id: `s${i}`,
      shape: "circle",
      x: Math.round(centre + r * Math.cos(a) - size / 2),
      y: Math.round(centre + r * Math.sin(a) - size / 2),
      width: size,
      height: size,
      fill: seedColour(k), // index, not radius
      stroke: seedColour(k),
      strokeWidth: 1,
      ...(span < 1
        ? { motion: { start: round4(open), end: round4(Math.min(1, open + span)) } }
        : {}),
    };
  });

  return {
    version: 1,
    title: "Vortex",
    canvas: { padding: 20 },
    root: { type: "scene", layout: "absolute", width: canvas, height: canvas, children },
  };
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

/** Amber at the core through to a cold blue at the rim. Keyed to index. */
function seedColour(k) {
  const stops = [
    [255, 196, 92],
    [244, 122, 96],
    [176, 106, 179],
    [92, 133, 214],
    [86, 199, 210],
  ];
  const x = k * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const mix = (a, b) => Math.round(a + (b - a) * f);
  const [r, g, b] = stops[i].map((v, j) => mix(v, stops[i + 1][j]));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Worst separation / half-extent-sum ratio over every pair. Must clear sqrt(2). */
export function tightestRatio(spec) {
  const seeds = spec.root.children.map((b) => ({
    cx: b.x + b.width / 2,
    cy: b.y + b.height / 2,
    half: b.width / 2,
  }));
  let worst = Infinity;
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const d = Math.hypot(seeds[i].cx - seeds[j].cx, seeds[i].cy - seeds[j].cy);
      worst = Math.min(worst, d / (seeds[i].half + seeds[j].half));
    }
  }
  return worst;
}
