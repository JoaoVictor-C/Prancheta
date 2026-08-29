/**
 * "The times table on a circle": N points evenly spaced on a circle, each one
 * joined to its own multiple, on a schedule that CLOSES so the run is seamless.
 *
 * At x2 the chords envelope a cardioid, at x3 a nephroid, at x4 a three-cusped
 * epicycloid. Nothing draws those curves. They are the ENVELOPE of 143 straight
 * lines, so the figure's whole subject is lines moving -- which is precisely
 * what could not be drawn here until M15 (ADR 0017) let a connector animate its
 * own `d`. Before that a connector was pinned to its second-state route, and
 * this figure would have rendered as 143 lines standing perfectly still.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SCHEDULE IS SHAPED THE WAY IT IS
 *
 * `--loop` repeats the run forever, but a run only looks endless if its last
 * state flows into its first. The obvious way to get that is to sweep the
 * multiplier until the figure comes back to itself, and the period is exact and
 * provable: Figure(m) equals Figure(m + N), because (m + N)k = mk + Nk and
 * Nk = 0 (mod N) for every integer k. Nothing smaller works -- Figure(m) and
 * Figure(m') agree only if (m - m')k = 0 (mod N) for ALL k, and k = 1 already
 * forces m - m' to be a multiple of N. So the period is exactly N = 144, and at
 * the step size the sagitta budget allows that is about 3,600 states. Out of
 * reach: hours of rendering and tens of megabytes of stylesheet.
 *
 * So the run closes a different way, on TWO clocks that both come home at once:
 *
 *   - The MULTIPLIER breathes: 2.02 out to 4.02 and back -- cardioid out through
 *     nephroid to the three-cusped epicycloid, and home again. A palindrome
 *     returns to its own first state by construction, at any step size.
 *
 *   - The PHASE turns exactly one full lattice turn over the whole run. Phase
 *     is periodic with period N in its own right, so it also lands where it
 *     started -- and because it does, the return leg is ROTATED rather than
 *     retraced. Without it the second half would rewind the first half frame
 *     for frame, which reads as a bounce and gives the loop away. With it the
 *     figure never repeats a picture until the run closes.
 *
 * The two together are what makes it endless rather than merely repeating.
 *
 * PERIOD IS N, and that is the natural choice rather than a coincidence. The
 * phase advances N/PERIOD lattice units per state, so PERIOD = N makes that
 * exactly ONE: every state's targets are the previous state's rotated by exactly
 * one point position. It also buys the widest sweep for the least bow -- the
 * full x2..x4 range at 2.5px, better than a 77-state run managed over half the
 * range -- and it costs about six minutes, which only became affordable once
 * `animateSequence` stopped launching one browser per state concurrently.
 * ---------------------------------------------------------------------------
 *
 * Four things the engine's refusals dictated, none of them cosmetic:
 *
 *   1. THE STEP SIZE IS SET BY A SAGITTA BUDGET, not by taste. Endpoint k
 *      travels (dm*k + dphi) lattice units per state -- and the engine tweens in
 *      STRAIGHT LINES, so that endpoint cuts the chord of its own arc instead of
 *      riding the circle. The bow depth is the sagitta R(1 - cos(theta/2)). 77
 *      states hold it under 4px on R = 430, under one percent of the radius; the
 *      script measures and prints the realised worst case rather than asserting
 *      it, over all PERIOD transitions. The restart needs no budget of its own:
 *      it lands on an identically rendered state, so nothing travels across it.
 *
 *   2. NO ARROWHEADS. A moving route carrying one is refused by name
 *      (requireNoArrowhead): the head is a sibling <polygon> and `points` is
 *      not CSS-animatable, so it would stand still while its line travelled.
 *      Chords want no heads anyway -- the refusal costs this figure nothing,
 *      which is the honest reason to pick a figure like this to show it off.
 *
 *   3. THE POINTS ARE BOXES AND THE TARGETS ARE NOT. A connector's `from` must
 *      be a block; its `to` may be a bare coordinate. So the 144 dots are real
 *      elements -- they persist across every state, which is the identity
 *      continuity ADR 0016 requires of a sequence -- and the travelling ends
 *      are coordinates, which is why `boxes-do-not-overlap-during-transition`
 *      has nothing to fail on. `allowOverlap` would NOT have excused it
 *      (ADR 0017 keeps that check standing on purpose), so the figure is built
 *      so the question never arises.
 *
 *   4. `padding: 0` ON EVERY DOT. theme.block.padding is 14 and box-sizing is
 *      border-box, so an 8px dot silently clamps to 30px without it -- and 144
 *      dots at 30px on a 430px circle collide with their own neighbours.
 *
 * `allowConnectorCrossing` is on and is load-bearing rather than a way of
 * quieting something: every chord starts ON a point of the wheel and sweeps
 * across the dots on the far side. Those incidences are the figure being
 * correct. ADR 0017 stands the transition check down with the toggle named.
 */

import { mkdir, writeFile } from "node:fs/promises";

const N = 144;
const R = 430;
const CX = 500;
const CY = 500;
const W = 1000;
const H = 1200;

const DOT = 8;

/**
 * The closed schedule. PERIOD is the number of STEPS in one turn of the loop;
 * the run authors PERIOD + 1 states, because the last one has to BE the first.
 *
 * `--loop` restarts the keyframes at 100% instantaneously -- it does not tween
 * the last state back to the first. So a schedule that merely comes back round
 * still shows a seam: every other step takes 340ms and that one takes none. The
 * fix is to author the returning state explicitly. State PERIOD has phase N and
 * multiplier M_LO, which is state 0 to the last decimal place, so the restart
 * jumps between two identical pictures and cannot be seen.
 *
 * PERIOD must be even so the multiplier palindrome has a turning state.
 */
const PERIOD = N;
const STATES = PERIOD + 1;
const HALF = PERIOD / 2;
const M_LO = 2.02;
const M_HI = 4.02;

/**
 * A constant offset on every target, and it is not decoration.
 *
 * The map k -> m k + phi has a fixed point wherever (m - 1)k + phi is a whole
 * number of turns, and with 143 indices and 145 phases SOME pair lands on it --
 * a chord whose two ends coincide has no direction for the router to clip
 * against. No offset removes the near-fixed point (nothing can; it is a real
 * feature of the map), but the offset decides whether the closest approach is
 * exactly zero or merely small. 0.84 was chosen by scanning the whole schedule
 * for the offset that maximises the realised minimum, and the script asserts
 * that minimum rather than trusting the argument.
 */
const PHASE = 0.84;

/** The scale along the foot of the sheet, which is where the multiplier is read. */
const SCALE_LEFT = 380;
const SCALE_RIGHT = 900;
const SCALE_Y = 1108;
const MARKER = 14;
// The domain is a little wider than the sweep so that the x2 and x3 ticks sit
// inside the rule rather than on its ends.
const SCALE_FROM = 1.97;
const SCALE_TO = 4.07;
const scaleX = (m) => SCALE_LEFT + ((SCALE_RIGHT - SCALE_LEFT) * (m - SCALE_FROM)) / (SCALE_TO - SCALE_FROM);

const ang = (k) => (2 * Math.PI * k) / N;
const px = (a) => CX + R * Math.cos(a - Math.PI / 2);
const py = (a) => CY + R * Math.sin(a - Math.PI / 2);

/** Multiplier and phase for state i, both in lattice units for the phase. */
function scheduleAt(i) {
  const triangle = i <= HALF ? i / HALF : (2 * HALF - i) / HALF;
  return { m: M_LO + (M_HI - M_LO) * triangle, phi: (N * i) / PERIOD };
}

/**
 * A cyclic palette, so hue wraps seamlessly at k = N rather than cutting from
 * red back to blue at the twelve o'clock point. Keyed to INDEX and nothing
 * else: a colour that varied with the multiplier would make every chord
 * `restyled` rather than moved, and diff.ts gives an element one delta kind per
 * segment (ADR 0013) -- the wheel would sit still.
 */
function wheelColour(k, alpha) {
  // HSL with a full turn of hue, so the wheel's colour closes on itself exactly
  // where the geometry does. An earlier version interpolated four RGB stops and
  // had a visibly grey arc where amber blended back to blue -- the shortest RGB
  // path between two saturated colours runs through the desaturated middle.
  const h = (360 * k) / N;
  return `hsl(${h.toFixed(1)}, 72%, 66%, ${alpha})`;
}

const dot = (k) => {
  const a = ang(k);
  return {
    type: "block",
    id: `p${k}`,
    shape: "circle",
    x: Math.round(px(a) - DOT / 2),
    y: Math.round(py(a) - DOT / 2),
    width: DOT,
    height: DOT,
    padding: 0,
    fill: wheelColour(k, 1),
    stroke: wheelColour(k, 1),
    strokeWidth: 1,
  };
};

/**
 * A caption, not a box: `fill` and `stroke` are "none" so what lands on the
 * canvas is the text alone. The block is still a real element -- it is measured,
 * `text-fits-box` still holds it to its bounds, and `title` persisting across
 * every state is part of what makes this one figure evolving rather than 120
 * unrelated ones (ADR 0016) -- it simply has no chrome of its own to draw.
 */
const caption = (id, x, y, w, h, label) => ({
  type: "block",
  id,
  x,
  y,
  width: w,
  height: h,
  fill: "none",
  stroke: "none",
  label,
});

/**
 * Worst bow of an endpoint away from the circle, over every transition
 * INCLUDING the closing one, and the shortest chord anywhere in the run.
 */
let worstSagitta = 0;
let shortestChord = Infinity;
for (let i = 0; i < PERIOD; i += 1) {
  const here = scheduleAt(i);
  const next = scheduleAt(i + 1);
  for (let k = 1; k < N; k += 1) {
    const raw = next.m * k + next.phi - (here.m * k + here.phi);
    const swept = Math.abs((((raw % N) + N + N / 2) % N) - N / 2);
    worstSagitta = Math.max(worstSagitta, R * (1 - Math.cos((swept * Math.PI) / N)));
    shortestChord = Math.min(
      shortestChord,
      2 * R * Math.abs(Math.sin(((here.m * k + here.phi + PHASE - k) * Math.PI) / N)),
    );
  }
}

function state(index) {
  const { m, phi } = scheduleAt(index);
  const children = [
    caption("title", 40, 1026, 320, 52, "The times table on a circle"),
    // NO NUMERIC READOUT, and the reason is a measured limitation rather than a
    // preference. Per-state readouts crossfade, and two numbers at 50% opacity
    // in one place is not a number -- sampled mid-transition it read "2.54"
    // overstruck with "2.58". The obvious fix, one readout with a stable id
    // whose label changes, is worse and silently so: diff classifies it
    // `retexted`, nothing tweens text, and the emitted DOM carries the LAST
    // state's text for the whole run -- a counter frozen on its final value,
    // absent from `disclosed.hardCut` because it never moved. So the scale
    // below IS the readout: the marker's position on it is the multiplier, and
    // a position is something this engine can actually animate and check.
    //
    // The scale's own end, so the rule has a block to leave. 1x1 and invisible.
    {
      type: "block",
      id: "scale-anchor",
      x: SCALE_LEFT,
      y: SCALE_Y,
      width: 1,
      height: 1,
      padding: 0,
      fill: "none",
      stroke: "none",
    },
    // The one box in the figure that travels. It rides the scale while the
    // chords sweep, so the two halves of the motor -- a tweened box and 143
    // tweened routes -- are visibly on the same clock. It also makes the
    // palindrome legible: the marker turning round at x4 is the run announcing
    // what it is doing rather than hiding it.
    {
      type: "block",
      id: "marker",
      shape: "circle",
      x: Math.round(scaleX(m) - MARKER / 2),
      y: SCALE_Y - MARKER / 2,
      width: MARKER,
      height: MARKER,
      padding: 0,
      fill: "#E8EAF0",
      stroke: "#E8EAF0",
      strokeWidth: 1,
    },
  ];
  // Tick labels sit BELOW the rule and the marker rides ON it, so their y ranges
  // are disjoint and the marker can pass over every one of them without the
  // overlap check having anything to say. Overlap needs both axes.
  for (const tick of [2, 3, 4]) {
    children.push(caption(`tick-${tick}`, Math.round(scaleX(tick) - 32), 1126, 64, 52, `×${tick}`));
  }
  // k = 0 is omitted in EVERY state, not skipped conditionally: it maps to
  // itself for every multiplier, so its chord has zero length. Omitting it in
  // some states and not others would make a connector appear mid-run.
  for (let k = 1; k < N; k += 1) children.push(dot(k));
  children.push(dot(0));

  const connectors = [];
  for (let k = 1; k < N; k += 1) {
    const target = ang(m * k + phi + PHASE);
    connectors.push({
      id: `c${k}`,
      from: `p${k}`,
      to: { x: Math.round(px(target) * 100) / 100, y: Math.round(py(target) * 100) / 100 },
      arrow: "none",
      stroke: wheelColour(k, 0.5),
      strokeWidth: 1.1,
    });
  }

  connectors.push({
    id: "scale-rule",
    from: "scale-anchor",
    to: { x: SCALE_RIGHT, y: SCALE_Y },
    arrow: "none",
    stroke: "rgba(232, 234, 240, 0.28)",
    strokeWidth: 1,
  });

  return {
    version: 1,
    title: `The times table on a circle, x${m.toFixed(2)}`,
    canvas: {
      padding: 24,
      background: "#0A0C11",
      vignette: 0.4,
      constraints: { allowConnectorCrossing: true },
    },
    root: { type: "scene", layout: "absolute", width: W, height: H, children, connectors },
  };
}

if (!(shortestChord > 0)) {
  throw new Error(`degenerate chord: shortest is ${shortestChord}px, so some chord has coincident ends`);
}

// The loop is seamless only if the LAST authored state is the first one. Assert
// it on the rendered geometry rather than on the schedule that produced it:
// every connector target of the last state must equal the first state's.
const firstTargets = JSON.stringify(state(0).root.connectors);
const lastTargets = JSON.stringify(state(PERIOD).root.connectors);
if (firstTargets !== lastTargets) {
  throw new Error(`the loop is not seamless: state ${PERIOD} does not render as state 0`);
}

await mkdir("experiments/timestable/states", { recursive: true });
const pad = (i) => String(i).padStart(3, "0");
for (let i = 0; i < STATES; i += 1) {
  await writeFile(`experiments/timestable/states/ts-${pad(i)}.json`, JSON.stringify(state(i), null, 2) + "\n");
}

console.log(
  `wrote ${STATES} states  N=${N} points, ${N - 1} chords  ` +
    `m ${M_LO} -> ${M_HI} -> ${M_LO}, phase one full turn\n` +
    `seamless: state ${PERIOD} renders byte-identically to state 0, so the restart is invisible\n` +
    `worst endpoint sagitta ${worstSagitta.toFixed(2)}px on R=${R} ` +
    `(${((worstSagitta / R) * 100).toFixed(2)}% of the radius, over ${PERIOD} transitions)\n` +
    `shortest chord ${shortestChord.toFixed(2)}px`,
);
