/*
 * CHEMISTRY 1 -- a weak acid titrated with a strong base.
 *
 * The curve is not a sigmoid drawn to look right. At every titrant volume the
 * hydrogen-ion concentration is solved from the full charge balance
 *
 *     [Na⁺] + [H⁺] = [OH⁻] + [A⁻]
 *
 * by bisection on log h, with [A⁻] = Ca·Ka/(Ka+h) and dilution taken into
 * account. Every landmark is then FOUND on that solved curve rather than
 * placed on it: the half-equivalence point is where the solved pH actually
 * reaches pKa, the equivalence point is where dpH/dV is actually greatest, and
 * the buffer band is where [A⁻]/[HA] is actually between 1/10 and 10.
 *
 * The inset is the second representation. It is differentiated NUMERICALLY
 * from the same plotted samples -- not from the analytic form -- so it reaches
 * the page by a different route from a shared input, and its peak has to land
 * on the equivalence volume marked above it. If the solver drifted, the two
 * would disagree visibly.
 *
 *   node experiments/exercises/chem-titration.mjs
 */
import { Plate, INK, SOFT, FAINT, RULE, ASK, KEY, WARM } from "./sheet.mjs";

// ---- stated ---------------------------------------------------------------
const KA = 1.8e-5;         // the acid, unnamed on the sheet on purpose
const KW = 1.0e-14;
const CA0 = 0.100;         // mol/L in the flask
const VA = 25.0;           // mL of it
const CB = 0.100;          // mol/L in the burette

const PKA = -Math.log10(KA);

/** [H⁺] after V mL of base, from the charge balance. Bisection on log h. */
function protons(V) {
  const Vt = VA + V;
  const Ca = (CA0 * VA) / Vt;
  const Cb = (CB * V) / Vt;
  const f = (h) => Cb + h - KW / h - (Ca * KA) / (KA + h);
  let lo = 1e-14;
  let hi = 1;
  for (let i = 0; i < 200; i += 1) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return Math.sqrt(lo * hi);
}
const pHat = (V) => -Math.log10(protons(V));

// ---- the curve, and everything read back off it ---------------------------
const VMAX = 50;
const N = 1000;
const curve = Array.from({ length: N + 1 }, (_, i) => {
  const V = (VMAX * i) / N;
  return { V, pH: pHat(V) };
});

// The equivalence point: the steepest place on the curve that was drawn.
let eq = curve[1];
let steepest = 0;
const slope = [];
for (let i = 1; i < curve.length - 1; i += 1) {
  const d = (curve[i + 1].pH - curve[i - 1].pH) / (curve[i + 1].V - curve[i - 1].V);
  slope.push({ V: curve[i].V, d });
  if (d > steepest) {
    steepest = d;
    eq = curve[i];
  }
}

// The half-equivalence point: where the SOLVED pH reaches pKa.
let half = curve[0];
for (const q of curve) if (Math.abs(q.pH - PKA) < Math.abs(half.pH - PKA)) half = q;

// The buffer band: where the ratio really is between a tenth and ten.
const buffered = curve.filter((q) => Math.abs(q.pH - PKA) <= 1);
const bufLo = buffered[0];
const bufHi = buffered[buffered.length - 1];

const p = new Plate({ subject: "Chemistry", title: "Reading a titration curve", height: 880 });

// ==========================================================================
const S = p.plane("titr", {
  x: 168, y: 596, xUnit: 17.2, yUnit: 30.4,
  grid: {
    x: { from: 0, to: 50, step: 5, labelEvery: 2 },
    y: { from: 0, to: 14, step: 1, labelEvery: 2 },
  },
});
const at = S.at;
// The inset sits in the plot's empty upper left -- under a titration curve
// that region carries no ink until well past the equivalence point -- and its
// whole footprint including the caption is reserved BEFORE anything is placed.
const INSET = { x: 252, y: 150, w: 268, h: 112 };
p.reserve(INSET.x + INSET.w / 2, INSET.y + INSET.h / 2 + 18, INSET.w + 24, INSET.h + 78);
p.reserve(at(-1.6, 7).x, at(-1.6, 7).y, 60, 440);   // keep labels off the y-axis numbers
p.reserve(at(25, -0.9).x, at(25, -0.9).y, 900, 40); // and off the x-axis numbers

// the buffer band, as wide as the ratio makes it
p.poly(
  [at(bufLo.V, 0), at(bufHi.V, 0), at(bufHi.V, 14), at(bufLo.V, 14)],
  { fill: "rgba(15,115,96,0.09)", stroke: "none", width: 0, close: true },
);
p.place("buffer region", at((bufLo.V + bufHi.V) / 2, 2.1).x, at((bufLo.V + bufHi.V) / 2, 2.1).y,
  [{ x: 0, y: 1 }, { x: 0, y: -1 }], { size: 12.5, colour: WARM, weight: 600 });

// the solved curve
p.poly(curve.filter((_, i) => i % 2 === 0).map((q) => at(q.V, q.pH)), { stroke: KEY, width: 2.2 });

// axis titles
p.label("volume of 0.100 M NaOH added  /  mL", at(25, 0).x, at(25, 0).y + 54, { size: 13, colour: SOFT });
p.label("pH", at(0, 7).x - 52, at(0, 7).y, { size: 13, colour: SOFT, rotation: -90 });

// ---- the landmarks, each found on the curve rather than placed on it ------
function landmark(q, text, dirs, colour) {
  const c = at(q.V, q.pH);
  p.seg({ x: c.x, y: at(q.V, 0).y }, c, { stroke: colour, width: 0.9, lineStyle: "dashed" });
  p.seg({ x: at(0, q.pH).x, y: c.y }, c, { stroke: colour, width: 0.9, lineStyle: "dashed" });
  p.disc(c, 5, colour);
  // The marker is a filled disc in the very colour the label is set in, so the
  // label must START clear of it -- otherwise contrast-sufficient scores the
  // text against its own ink and reports 1:1.
  p.reserve(c.x, c.y, 22, 22);
  const d0 = dirs[0];
  p.place(text, c.x + d0.x * 30, c.y + d0.y * 30, dirs, { size: 13, colour, weight: 600 });
  return c;
}
landmark(half, "half-equivalence\npH here = pKa = ?", [{ x: -0.4, y: -1 }, { x: -1, y: -0.3 }], ASK);
landmark(eq, "equivalence\nV = ?", [{ x: 1, y: -0.35 }, { x: 1, y: 0.4 }], ASK);

// ---- the second representation: the same samples, differentiated ----------
{
  const { x: ix, y: iy, w: IW, h: IH } = INSET;
  const maxD = Math.max(...slope.map((s) => s.d));
  const gx = (V) => ix + (V / VMAX) * IW;
  const gy = (d) => iy + IH - (d / maxD) * (IH - 14);
  p.poly([{ x: ix, y: iy }, { x: ix + IW, y: iy }, { x: ix + IW, y: iy + IH }, { x: ix, y: iy + IH }],
    { stroke: RULE, width: 1, fill: "rgba(255,255,255,0.86)", close: true });
  // Shaded under the trace: the derivative of a titration curve is a spike on
  // a flat floor, and an unshaded spike one pixel wide reads as an empty panel.
  const trace = slope.filter((_, i) => i % 2 === 0).map((s) => ({ x: gx(s.V), y: gy(s.d) }));
  p.poly([{ x: gx(0), y: iy + IH }, ...trace, { x: gx(VMAX), y: iy + IH }], {
    fill: "rgba(108,63,168,0.18)", stroke: "none", width: 0, close: true,
  });
  p.poly(trace, { stroke: "#6C3FA8", width: 1.8 });
  p.seg({ x: gx(eq.V), y: iy + 6 }, { x: gx(eq.V), y: iy + IH }, { stroke: ASK, width: 1, lineStyle: "dashed" });
  p.label("dpH / dV", ix + 52, iy + 16, { size: 12, colour: "#6C3FA8", weight: 600 });
  p.label("differentiated from the plotted points,\nnot from the formula — its peak must\nland on the volume marked above",
    ix + IW / 2, iy + IH + 30, { size: 11.5, colour: FAINT });
  p.reserve(ix + IW / 2, iy + IH / 2, IW, IH);
}

// ---- what is asked --------------------------------------------------------
// Just the marker: the flask's volume is already stated in the question
// below, and a longer explanatory line here has nowhere wide enough to sit
// between the half-equivalence and equivalence drop lines that bracket this
// low corner of the plot -- no position clears both, because the gap between
// them (215px) is narrower than the line would need (239px).
p.ask("Ca = ?", at(2.5, 1.2).x + 30, at(2.5, 1.2).y, [{ x: 1, y: 0 }, { x: 1, y: -0.6 }]);

p.question([
  "A 25.00 mL sample of a monoprotic weak acid is titrated with 0.100 M sodium hydroxide. The curve is the measured one.",
  "(a)  Read the pKa off the graph. Which single point gives it, and why that point?      (b)  Find the equivalence volume.",
  "(c)  Hence find the concentration of the acid in the flask.      (d)  Why is the equivalence pH above 7 and not equal to it?",
  "(e)  Over what volume range would this solution resist a change in pH, and what is happening chemically there?",
]);

p.write(process.argv[2] ?? "experiments/exercises/chem-titration.json");
console.log(`  pKa ${PKA.toFixed(2)} found at V = ${half.V.toFixed(2)} mL; steepest at V = ${eq.V.toFixed(2)} mL, pH ${eq.pH.toFixed(2)}`);
console.log(`  buffer band ${bufLo.V.toFixed(2)} to ${bufHi.V.toFixed(2)} mL`);
