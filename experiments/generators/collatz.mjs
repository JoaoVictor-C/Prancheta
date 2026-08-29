/*
 * "The Hailstone Count" -- Collatz total stopping times.
 *
 * For each n, iterate n -> n/2 when even, 3n+1 when odd, and count the steps
 * to reach 1. Nobody has proved that count is always finite. The picture is
 * the data: every n below 1500 plotted against its own step count, coloured by
 * how high the trajectory climbed before it fell.
 *
 * Written against the page builder only -- see README.md. It is also the
 * acceptance test for that library: a two-panel poster with real axes had
 * previously cost 340 lines (zeta-conformal, conjugacy).
 */
import { page, makeRamp } from "./lib.mjs";

const p = page({ theme: "midnight" });
const heat = makeRamp([
  [0.0, "#3B4B8C"], [0.35, "#5FA8C7"], [0.6, "#EBCB74"], [1.0, "#E8674F"],
]);

/** Steps to reach 1, and the highest value seen on the way. */
function trajectory(n) {
  const seen = [n];
  let v = n;
  let peak = n;
  while (v !== 1) {
    v = v % 2 === 0 ? v / 2 : 3 * v + 1;
    peak = Math.max(peak, v);
    seen.push(v);
  }
  return { steps: seen.length - 1, peak, seen };
}

const N = 1500;
const runs = Array.from({ length: N }, (_, i) => trajectory(i + 1));
const maxSteps = Math.max(...runs.map((r) => r.steps));
const maxPeak = Math.max(...runs.map((r) => Math.log2(r.peak)));

// --- the field: n against its stopping time --------------------------------
const main = p.panel({
  x: 150, y: 132, width: 660, height: 430,
  xDomain: [0, N], yDomain: [0, maxSteps + 8],
  pitch: 4.4,
});
main.ticks({
  x: [0, 300, 600, 900, 1200, 1500],
  y: [0, 50, 100, 150],
  format: (v) => String(v),
});

// The panel's own lattice keeps one mark per cell: many n share a step count,
// and two discs at one spot is a real overlap failure, not a cosmetic one.
for (const [i, run] of runs.entries()) {
  main.dot(i + 1, run.steps, 3.4, heat(Math.log2(run.peak) / maxPeak));
}
main.caption(`n = 1 … ${N}  ·  vertical is the step count  ·  colour is log₂ of the highest value reached`);

// --- the inset: one trajectory, the famous one -----------------------------
const ORBIT = 27;
const orbit = trajectory(ORBIT);
const inset = p.panel({
  x: 500, y: 640, width: 310, height: 168,
  xDomain: [0, orbit.steps], yDomain: [0, Math.log2(orbit.peak) + 1],
  pitch: 3.2,
});
inset.ticks({ x: [0, 50, 100], y: [0, 5, 10], format: (v) => String(v), fs: 10 });
for (const [step, v] of orbit.seen.entries()) {
  inset.dot(step, Math.log2(v), 2.6, heat(Math.log2(v) / maxPeak));
}
inset.caption(`n = ${ORBIT}: ${orbit.steps} steps, peaking at ${orbit.peak.toLocaleString("en")}`, 10.5);

const peakAt = orbit.seen.indexOf(orbit.peak);
p.text(150, 664, 280, "One orbit, plotted as log₂ of its value", 13.5, "body", "start");
p.text(150, 700, 280,
  `27 is the smallest start whose flight runs this long. It reaches ${orbit.peak.toLocaleString("en")} ` +
    `at step ${peakAt} — ${Math.round(orbit.peak / ORBIT)} times where it began — and only then falls.`,
  11.5, "faint", "start");

p.poster({
  name: "collatz",
  eyebrow: "C  O  L  L  A  T  Z",
  title: "The Hailstone Count",
  caption:
    "Halve it if even, treble it and add one if odd, and every number tested so far\n" +
    "eventually falls to 1. The bands are real: stopping times cluster because the\n" +
    "trajectories merge, and once two orbits meet they never part again.",
  footnote: `${N} starting values  ·  longest flight ${maxSteps} steps  ·  no proof that any of them terminate`,
  ramp: heat,
});
