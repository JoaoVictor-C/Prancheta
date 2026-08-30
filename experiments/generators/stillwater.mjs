/*
 * "Still Water" -- three stones, one surface.
 *
 * Each source contributes a decaying circular wave to the surface height
 *
 *   psi(p) = sum_i  cos(k |p - s_i|) / sqrt(1 + |p - s_i| / r0)
 *
 * and the picture is nothing but that sum. What the eye reads as pattern is
 * interference: crests reinforce along some curves and cancel along others,
 * and the curves of exact cancellation are the hyperbolae that fall out of
 * |p - s_a| - |p - s_b| being a half-integer number of wavelengths.
 *
 * Two decisions carry the whole figure, and both are physical rather than
 * decorative:
 *
 *   SIZE carries |psi|, so the nodal curves draw themselves by being the only
 *   places the figure declines to put ink.
 *
 *   HUE carries the SIGN of psi. A trough is as much displacement as a crest,
 *   so drawing the dark half as absence would be a lie about the physics --
 *   troughs run cool, crests run warm, and the two temperatures meet at zero.
 *
 * The wavelength is set against the lattice pitch, not chosen for looks: at
 * fewer than about ten samples per wavelength the lattice and the wave beat
 * against each other and the fringes turn to speckle. That is aliasing, and
 * no palette rescues it.
 */
import { page } from "./lib.mjs";

const W = 1240;
const H = 1500;

const p = page({ theme: "midnight", width: W, height: H });

const PITCH = 4.6;               // lattice pitch
const DMAX = PITCH - 0.15;       // never wider than the pitch, so no two grains touch
const LAMBDA = 52;               // px per wavelength -- 11.3 samples, clear of aliasing
const K = (2 * Math.PI) / LAMBDA;
const R0 = 130;                  // where the 1/sqrt falloff starts to bite
const GAIN = 1.75;               // three sources rarely align; this is the honest normaliser

const FX = 70;
const FY = 118;
const FW = W - 2 * FX;
const FH = 1090;
const cx = FX + FW / 2;
const cy = FY + FH / 2;

const SOURCES = [0, 1, 2].map((i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
  return { x: cx + Math.cos(a) * 268, y: cy + Math.sin(a) * 268 };
});

const height = (x, y) => {
  let sum = 0;
  for (const s of SOURCES) {
    const r = Math.hypot(x - s.x, y - s.y);
    sum += Math.cos(K * r) / Math.sqrt(1 + r / R0);
  }
  return Math.max(-1, Math.min(1, sum / GAIN));
};

// Two temperatures meeting at zero: cool troughs, warm crests, and a node
// that is nearly the water itself -- though almost nothing is ever drawn
// there, because the grain has already shrunk away.
const ramp = p.ramp([
  [0.00, "#9FF2EC"],
  [0.14, "#5EC8DC"],
  [0.30, "#2F7FB4"],
  [0.42, "#1E4270"],
  [0.50, "#141C30"],
  [0.58, "#4A3457"],
  [0.70, "#9A5A66"],
  [0.86, "#E5A85E"],
  [1.00, "#FFF3DA"],
]);

let drawn = 0;
for (let gx = 0; gx <= FW; gx += PITCH) {
  for (let gy = 0; gy <= FH; gy += PITCH) {
    const x = FX + gx;
    const y = FY + gy;

    // A soft round aperture, so the field ends in water rather than a crop mark.
    const q = Math.hypot((x - cx) / (FW / 2), (y - cy) / (FH / 2));
    if (q > 1) continue;
    const edge = Math.min(1, (1 - q) / 0.13);

    // Keep clear of the stones themselves: a grain half-covering one is a
    // real partial overlap, not a cosmetic one.
    if (SOURCES.some((s) => Math.hypot(x - s.x, y - s.y) < 10)) continue;

    const a = height(x, y) * edge;
    const d = DMAX * Math.pow(Math.abs(a), 0.42);
    if (d < 0.85) continue;                     // this is where the nodes appear

    p.disc(x, y, d, ramp((a + 1) / 2));
    drawn += 1;
  }
}

// The three stones, stated rather than implied.
for (const s of SOURCES) {
  p.disc(s.x, s.y, 8, "#0A0A12");
  p.disc(s.x, s.y, 3.4, "#FFF3DA");
}

p.poster({
  name: "stillwater",
  eyebrow: "S  U  P  E  R  P  O  S  I  T  I  O  N",
  title: "Still Water",
  textTop: H - 262,
  caption:
    "Three stones, dropped together. Every point of the surface holds the sum of what reached it,\n" +
    "and the surface has no way to keep the three arrivals apart — which is why the pattern\n" +
    "belongs to none of them, and why no stone can be found by looking at it.",
  footnote:
    `ψ = Σ cos(kr) / √(1 + r/r₀)  ·  λ = ${LAMBDA} px over a ${PITCH} px lattice  ·  ${drawn.toLocaleString("en")} grains  ·  ` +
    "size carries |ψ| and hue carries its sign; the dark curves are ψ = 0",
  ramp,
});
