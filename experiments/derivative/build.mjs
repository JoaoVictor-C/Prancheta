/**
 * "What a derivative is", as five authored states of one figure.
 *
 * The pedagogy is standard: a secant through P and a nearby Q, with Q brought
 * closer and closer until the secant is the tangent. What is worth recording
 * is how much of the DESIGN was forced by the engine's honesty constraints.
 *
 * THE FIRST VERSION OF THIS FILE DREW EVERY LINE AS A ROW OF DOTS. Not by
 * choice: connectors were pinned to their second-state route for the whole
 * run (the M12 debt), so a line joining two moving points would have sat
 * still while its own endpoints slid out from under it. Boxes were the only
 * thing that moved, so anything that had to move had to be built out of
 * boxes. That is a workaround wearing the costume of a design decision, and
 * the figure looked like it: a parabola stippled out of 18 dots and a secant
 * stippled out of 8 more.
 *
 * M15 (ADR 0017) retired the debt -- a connector's `d` is now animated, and
 * `connector-clear-of-boxes-during-transition` constrains the new freedom --
 * so the curve is one real curve and the secant is one real line.
 *
 * What survives from the dotted version, because it was never about dots:
 *
 *   - The secant PIVOTS about P. Its two halves are connectors leaving P, so
 *     the far ends travel while P does not, which is what a hinge is.
 *
 *   - P and Q are dots authored with `padding: 0`. Without it a 13px box is
 *     not 13px: theme.block.padding is 14, and under box-sizing: border-box
 *     the box clamps up to padding+border = 30px. Every static state failed
 *     until this was read out of the rendered manifest rather than assumed.
 *
 *   - Q does not slide, and that is still the checker's finding rather than a
 *     preference -- though the reason has moved. It used to be that Q travels
 *     the CHORD (the engine tweens in straight lines) which for y = x^2 sits
 *     above the curve by (x-a)(b-x), grazing every curve dot it passed. There
 *     are no curve dots now, but the chord is still not the curve: a sliding
 *     Q would visibly leave the parabola and cut across it. So each step gets
 *     its own Q and consecutive Qs crossfade -- the one exemption the motion
 *     check grants by name.
 *
 * `allowConnectorCrossing` is on, and it is load-bearing rather than a way of
 * quieting something. P and Q are points ON the curve, and the secant is a
 * line THROUGH both of them; every one of those incidences is a connector
 * crossing a box it does not join. That is the figure being correct, not the
 * figure being wrong, and it is exactly the case the toggle documents.
 *
 * The parabola is framed to include its vertex. An earlier version showed only
 * x in [0.1, 2.9], where y = x^2 is visually near-indistinguishable from a
 * straight line, so the whole figure read as one diagonal.
 */

import { writeFile } from "node:fs/promises";

// f(x) = x^2, so f'(1) = 2. The secant through P=(1,1) and Q=(1+h,(1+h)^2)
// has slope exactly 2 + h -- which is why the readout converges on 2 in a way
// a reader can verify by eye rather than take on trust.
const f = (x) => x * x;
const OX = 300;
const SX = 150;
const OY = 496;
const SY = 56;
const sx = (x) => OX + SX * x;
const sy = (y) => OY - SY * y;
/** A point on the parabola, in scene coordinates. */
const on = (x) => ({ x: sx(x), y: sy(f(x)) });

const POINT_DOT = 13;

const CURVE_FROM = -1.0;
const CURVE_TO = 2.7;

// The secant is drawn only across the span that carries the argument: from
// just left of P out past the furthest Q. An earlier version ran it from
// x = 0.1, where at slope 3.5 it plunges below the parabola's vertex.
const SEC_LEFT = 0.6;
const SEC_RIGHT = 2.68;

const H_STEPS = [1.5, 0.9, 0.5, 0.1];

/**
 * y = x^2 as ONE cubic bezier, exactly rather than approximately.
 *
 * A parabolic arc IS a quadratic bezier: its control point is where the
 * tangents at the two ends meet, which for y = x^2 between a and b is
 * ((a+b)/2, ab). Every quadratic bezier is a cubic with the two controls at
 * P0 + 2/3 (Q - P0) and P2 + 2/3 (Q - P2), so what the reader sees is the
 * parabola itself and not a fit to it. (The engine then flattens this to a
 * polyline at layout time, so that what every check reads is what the
 * renderer draws.)
 */
function parabolaControls(a, b) {
  const p0 = on(a);
  const p2 = on(b);
  const q = { x: sx((a + b) / 2), y: sy(a * b) };
  const third = (p, t) => ({ x: p.x + (2 / 3) * (t.x - p.x), y: p.y + (2 / 3) * (t.y - p.y) });
  return [third(p0, q), third(p2, q)];
}

const dot = (id, cx, cy, size, fill) => ({
  type: "block",
  id,
  shape: "circle",
  x: Math.round(cx - size / 2),
  y: Math.round(cy - size / 2),
  width: size,
  height: size,
  padding: 0,
  fill,
  stroke: fill,
  strokeWidth: 1,
});

const panel = (id, x, y, w, h, label) => ({ type: "block", id, x, y, width: w, height: h, label });

const CURVE_COLOUR = "rgb(110, 143, 208)";
const SECANT_COLOUR = "rgb(255, 196, 92)";

/** One authored state. `h === null` is the limiting case: Q is gone. */
function state(index, h) {
  const slope = h === null ? 2 : 2 + h;
  // The secant's own y at a given x, which is what its far endpoints ride.
  const secant = (x) => ({ x: sx(x), y: sy(f(1) + slope * (x - 1)) });

  const children = [
    panel("title", 60, 28, 420, 54, "The derivative at P"),
    // A connector's `from` is a block, so the curve has to leave something. A
    // 1px transparent anchor at the parabola's left end costs one invisible
    // element and no visible clipping.
    {
      type: "block",
      id: "curve-start",
      x: Math.round(sx(CURVE_FROM)),
      y: Math.round(sy(f(CURVE_FROM))),
      width: 1,
      height: 1,
      padding: 0,
      fill: "none",
      stroke: "none",
    },
    dot("P", sx(1), sy(f(1)), POINT_DOT, "rgb(235, 238, 244)"),
  ];

  if (h !== null) {
    const qx = 1 + h;
    children.push(dot(`Q-${index}`, sx(qx), sy(f(qx)), POINT_DOT, "rgb(255, 132, 110)"));
  }

  children.push(panel(`h-${index}`, 740, 372, 320, 56, h === null ? "h -> 0" : `h = ${h}`));
  children.push(panel(`m-${index}`, 740, 452, 320, 56, `slope = ${slope.toFixed(2)}`));

  return {
    version: 1,
    title: `The derivative at P, state ${index}`,
    canvas: {
      padding: 20,
      // Load-bearing: P and Q are points ON the curve, and the secant is a
      // line THROUGH them. See the header.
      constraints: { allowConnectorCrossing: true, allowCurvedConnectors: true },
    },
    root: {
      type: "scene",
      layout: "absolute",
      width: 1100,
      height: 540,
      children,
      connectors: [
        {
          id: "curve",
          from: "curve-start",
          to: on(CURVE_TO),
          arrow: "none",
          stroke: CURVE_COLOUR,
          strokeWidth: 2.5,
          curve: { kind: "bezier", control: parabolaControls(CURVE_FROM, CURVE_TO) },
        },
        // Two halves rather than one line, because both leave P: that is what
        // makes the far ends travel while P stays put.
        {
          id: "sec-left",
          from: "P",
          to: secant(SEC_LEFT),
          arrow: "none",
          stroke: SECANT_COLOUR,
          strokeWidth: 3,
        },
        {
          id: "sec-right",
          from: "P",
          to: secant(SEC_RIGHT),
          arrow: "none",
          stroke: SECANT_COLOUR,
          strokeWidth: 3,
        },
      ],
    },
  };
}

// Narration for the HOST page, not for the figure. An earlier version drew
// these as a 320x110 panel per state. Because consecutive captions must
// crossfade, mid-transition showed two paragraphs of prose at 50% opacity on
// top of each other -- legible at every state boundary and mush for the third
// of each transition in between. Found by sampling mid-transition rather than
// at the boundaries, which is exactly where the figure looked fine.
const captions = [
  "P is fixed. Q sits h to its right, also on the curve. The line through both is a secant.",
  "Slide Q closer to P. The secant pivots about P, and its slope falls.",
  "Closer still. The slope keeps falling, but it is slowing down.",
  "Very close now. The secant is almost resting on the curve at P.",
  "In the limit the secant IS the tangent. Its slope, 2, is the derivative at P.",
];

const states = [
  state(0, H_STEPS[0]),
  state(1, H_STEPS[1]),
  state(2, H_STEPS[2]),
  state(3, H_STEPS[3]),
  state(4, null),
];

for (const [i, doc] of states.entries()) {
  await writeFile(`experiments/derivative/deriv-${i}.json`, JSON.stringify(doc, null, 2) + "\n");
}

// The narration is consumed by the host page (see the note on `captions`).
await writeFile("experiments/derivative/captions.json", JSON.stringify(captions, null, 2) + "\n");

console.log(
  `wrote 5 states  curve: one cubic bezier, x in [${CURVE_FROM}, ${CURVE_TO}]  ` +
    `secant: two connectors leaving P  ` +
    `slopes ${H_STEPS.map((h) => (2 + h).toFixed(2)).join(" -> ")} -> 2.00`,
);
