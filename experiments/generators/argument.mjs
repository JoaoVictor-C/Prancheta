/*
 * "FOUR INSIDE, NONE COUNTED" -- the argument principle, drawn as a field.
 *
 * f(z) = (z^2 - 1) / (z^2 + 1). Four singularities on the unit circle at the
 * compass points, alternating: zeros at +-1, poles at +-i. Every mark is the
 * value of f at that point -- a stroke TURNED to arg f and lit from tail to
 * head, coloured by |f|. Walk a closed loop and count the net turns the field
 * makes: a zero contributes +1, a pole -1, and the outer walk encloses all
 * four and counts nothing.
 *
 * WHY THIS FUNCTION. It carries its own correctness oracles, which is the
 * standard conjugacy.mjs sets: things that must land exactly where theory
 * says, so a wrong implementation is wrong VISIBLY rather than merely ugly.
 *
 *   1. The four singularities sit on the unit circle, 90 degrees apart,
 *      alternating zero/pole.
 *   2. |f| = 1 EXACTLY on the two diagonals: |z^2-1| = |z^2+1| forces z^2 onto
 *      the perpendicular bisector of +-1, i.e. Re z^2 = 0, i.e. cos 2t = 0.
 *      So the neutral band of the ramp is a pair of straight lines through the
 *      origin -- the most falsifiable feature on the plate.
 *   3. Each walk's accumulated argument lands on an exact multiple of 2pi.
 *   4. f is EVEN, so the field is unchanged by a 180-degree rotation except
 *      that every tail-to-head sense reverses. The gradient is therefore the
 *      only thing distinguishing the field from its own rotation -- which is
 *      also exactly what a winding number counts.
 *   5. f(iz) = 1/f(z) exactly, so a 90-degree turn gives the plate of 1/f:
 *      zeros and poles exchange, the ramp inverts, every index flips sign.
 *      That is why the composition is a four-fold alternating pinwheel; the
 *      alternation IS the symmetry.
 *
 * All five are asserted at build time. But note what they have in common:
 * every one is computed UPSTREAM of the drawing. A global sign error in the
 * map from arg f to screen angle passes all five while drawing a field whose
 * zero winds -1 -- the computed thing and the drawn thing diverging while
 * every check on the computed thing passes. So there is a sixth assertion,
 * and it is the only one that reads DOWNSTREAM: the winding number is
 * recomputed from the rotation values actually written into the spec. That is
 * this repository's own founding move applied to its mathematics rather than
 * to its geometry -- count what was drawn, not what was meant.
 *
 * GEOMETRY UNDER ROTATION. A rotated mark's footprint is LARGER than its
 * unrotated one, and the checks now read the true rotated bounding box, so
 * the lattice pitch has to clear the worst case rather than the mark's own
 * length. A dash L x w at angle t has AABB extents L|cos t| + w|sin t| and
 * L|sin t| + w|cos t|, both bounded by sqrt(L^2 + w^2). With L=10, w=2.4 that
 * is 10.28px, so pitch 12 leaves 1.72px of clearance at every angle the data
 * can produce -- well above the 0.5px the checks tolerate. The naive pitch
 * that would have worked for axis-aligned marks (anything over L=10) is
 * exactly the one that fails now.
 *
 * EVERY LABEL SITS OVER SPACE PROVED EMPTY. All type is emitted FIRST, each
 * label registering its own rect as a keepout, and only then is the field
 * generated into what is left. Ordering the file this way is safe because
 * render/svg.ts layers every label above every box regardless of spec order,
 * so "text first" costs nothing in paint order and buys the guarantee. The
 * generator prints how many cells each keepout consumed, so "proved empty" is
 * a number rather than a hope.
 *
 * The insets are not separate exhibits needing leader lines: inset A is the
 * zero that walk A encircles, inset B the pole that walk B encircles. The
 * letter does the registering, which is why no arrow crosses panel II.
 */
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------- parameters
const PITCH = Number(process.env.PITCH ?? 12);
const NAME = process.env.NAME ?? "argument";

const W = 1500;
const H = 2260;
const BG = "#07070E";

// Panel I: the field. Window is 4.8 x 3.36 units at 250 px/unit.
const F_X0 = 150, F_X1 = 1350;
const F_Y0 = 486, F_Y1 = 1310;
const SCALE = 250;
const ZX = (F_X0 + F_X1) / 2;
const ZY = (F_Y0 + F_Y1) / 2;

// Panel II: accumulated argument.
const P_X0 = 150, P_X1 = 1350;
const P_Y0 = 1418, P_Y1 = 1758;
const ARG_MAX = 2.45 * Math.PI;      // the traces reach +-2pi; this leaves headroom

// Insets.
const INS_Y0 = 1830, INS_H = 235, INS_W = 470;
const INS_AX = 250, INS_BX = 780;

// Marks.
const L = 10, WD = 2.4;
const HALF = Math.sqrt(L * L + WD * WD) / 2;   // worst-case rotated half-extent
const BUCKETS = 28;
const CLEAR = 34;

// ---------------------------------------------------------------- palette
// Every colour used for TYPE clears 4.5:1 against the canvas. The first draft
// used #6E74A4 for the footnotes and measured 4.49:1 -- the check caught it,
// which is the whole argument for computing contrast rather than eyeballing it.
const INK = "#F2E8D0";
const DIM = "#9AA0CC";
const FAINT = "#8288B6";
const BODY = "#8E92BC";
const FOOT = "#7A80AE";
const RULE = "#2A2750";

const hx = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const pad = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
const ramp = (stops) => (t) => {
  const u = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < stops.length - 2 && u > stops[i + 1][0]) i += 1;
  const k = (u - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
  const a = hx(stops[i][1]);
  const b = hx(stops[i + 1][1]);
  return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
};
const fade = (c, k) => {
  const a = hx(c);
  const b = hx(BG);
  return `#${a.map((v, j) => pad(v + (b[j] - v) * k)).join("")}`;
};

// Diverging on log|f|: cool where f is small (toward a zero), neutral on the
// |f| = 1 diagonals, warm where f is large (toward a pole). The midpoint is
// deliberately the dullest colour on the ramp, because the midpoint is the
// locus |f| = 1 -- so the two diagonals read as the quiet seam between a cool
// and a warm wedge rather than as a drawn line, which is what they are.
const magRamp = ramp([
  [0.00, "#2FE0D2"], [0.18, "#35A8E0"], [0.34, "#4C79DC"],
  [0.44, "#7A6FC0"],
  [0.50, "#8A82A8"],
  [0.56, "#C06894"], [0.66, "#E86A5E"], [0.82, "#FA9A3C"], [1.00, "#FFDE8C"],
]);
// Clamped to +-1.3 decades rather than +-2.2: f -> 1 at infinity, so the far
// field is neutral whatever the range, and a wider clamp spends most of the
// ramp on values the window never reaches. 1.3 puts the visible gradient where
// the singularities actually are.
const DECADES = 1.3;

// ---------------------------------------------------------------- the map
const fOf = (x, y) => {
  const zr = x * x - y * y, zi = 2 * x * y;
  const nr = zr - 1, ni = zi;
  const dr = zr + 1, di = zi;
  const den = dr * dr + di * di;
  if (den === 0) return { re: Infinity, im: Infinity, abs: Infinity, arg: 0 };
  const re = (nr * dr + ni * di) / den;
  const im = (ni * dr - nr * di) / den;
  return { re, im, abs: Math.hypot(re, im), arg: Math.atan2(im, re) };
};

const zx = (x) => ZX + x * SCALE;
const zy = (y) => ZY - y * SCALE;

const SING = [
  { x: 1, y: 0, kind: "zero" },
  { x: -1, y: 0, kind: "zero" },
  { x: 0, y: 1, kind: "pole" },
  { x: 0, y: -1, kind: "pole" },
];

const WALKS = [
  { id: "A", cx: 1, cy: 0, R: 0.34, turns: +1, colour: "#5FD6A4" },
  { id: "B", cx: 0, cy: 1, R: 0.34, turns: -1, colour: "#E8724C" },
  { id: "C", cx: 0, cy: 0, R: 1.55, turns: 0, colour: "#8FA0E8" },
];

// -------- the walks, computed first: they carry the oracles ----------------
const STEPS = 3000;

function walkTrace(w) {
  const pts = [];
  let acc = 0, prev = null, maxStep = 0;
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const a = 2 * Math.PI * t;
    const x = w.cx + w.R * Math.cos(a);
    const y = w.cy + w.R * Math.sin(a);
    const f = fOf(x, y);
    if (prev !== null) {
      let d = f.arg - prev;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      maxStep = Math.max(maxStep, Math.abs(d));
      acc += d;
    }
    prev = f.arg;
    pts.push({ t, acc });
  }
  return { pts, acc, maxStep };
}

const traces = WALKS.map((w) => ({ w, ...walkTrace(w) }));

// ---------------------------------------------------------------- ORACLES
const failures = [];
const near = (a, b, tol) => Math.abs(a - b) <= tol;

for (const s of SING) {
  const f = fOf(s.x, s.y);
  if (s.kind === "zero" && !(f.abs < 1e-12)) failures.push(`zero at (${s.x},${s.y}) has |f| = ${f.abs}`);
  if (s.kind === "pole" && !(f.abs > 1e11)) failures.push(`pole at (${s.x},${s.y}) has |f| = ${f.abs}`);
}

for (let k = 1; k <= 12; k += 1) {
  const r = k * 0.17;
  for (const t of [Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
    const f = fOf(r * Math.cos(t), r * Math.sin(t));
    if (!near(f.abs, 1, 1e-12)) failures.push(`|f| = ${f.abs} on the diagonal at r = ${r}`);
  }
  const off = fOf(r * Math.cos(Math.PI / 8), r * Math.sin(Math.PI / 8));
  if (near(off.abs, 1, 1e-3)) failures.push(`|f| = 1 off the diagonal at r = ${r}; the band is not a line`);
}

for (const tr of traces) {
  if (tr.maxStep > Math.PI / 4) {
    failures.push(`walk ${tr.w.id}: max step ${tr.maxStep.toFixed(3)} rad exceeds pi/4; unwrapping is unsafe`);
  }
  const want = tr.w.turns * 2 * Math.PI;
  if (!near(tr.acc, want, 1e-9)) {
    failures.push(`walk ${tr.w.id}: accumulated ${tr.acc.toFixed(12)}, expected ${want.toFixed(12)}`);
  }
}

for (let k = 0; k < 40; k += 1) {
  const x = -2.1 + 4.2 * ((k * 0.618) % 1);
  const y = -1.4 + 2.8 * ((k * 0.377) % 1);
  const a = fOf(x, y), b = fOf(-x, -y);
  if (!near(a.abs, b.abs, 1e-9) || !near(a.arg, b.arg, 1e-9)) {
    failures.push(`f is not even at (${x.toFixed(3)}, ${y.toFixed(3)})`);
  }
  const c = fOf(-y, x);                     // iz
  if (a.abs > 1e-6 && a.abs < 1e6 && !near(c.abs, 1 / a.abs, 1e-6 * Math.max(1, 1 / a.abs))) {
    failures.push(`f(iz) != 1/f(z) at (${x.toFixed(3)}, ${y.toFixed(3)})`);
  }
}

// THE DOWNSTREAM ONE. Every check above is computed before anything is drawn,
// and a global sign error in the map from arg f to screen angle passes all of
// them while drawing a field whose zero winds the wrong way. So the winding
// number is recomputed from the rotation values that will actually be WRITTEN
// INTO THE SPEC, unwrapped the way a reader's eye would follow them round.
const screenDegOf = (x, y) => -fOf(x, y).arg * 180 / Math.PI;   // exactly what dash() writes

function drawnWinding(w) {
  const N = 720;
  let acc = 0, prev = null;
  for (let i = 0; i <= N; i += 1) {
    const a = 2 * Math.PI * (i / N);
    const phi = -screenDegOf(w.cx + w.R * Math.cos(a), w.cy + w.R * Math.sin(a)) * Math.PI / 180;
    if (prev !== null) {
      let d = phi - prev;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      acc += d;
    }
    prev = phi;
  }
  return acc / (2 * Math.PI);
}
for (const w of WALKS) {
  const got = drawnWinding(w);
  if (!near(got, w.turns, 1e-6)) {
    failures.push(`walk ${w.id}: the DRAWN field winds ${got.toFixed(6)}, expected ${w.turns}`);
  }
}
{
  const f0 = fOf(0, 0);
  if (!near(f0.re, -1, 1e-12) || !near(f0.im, 0, 1e-12)) failures.push(`f(0) = ${f0.re}+${f0.im}i, expected -1`);
  const deg = ((screenDegOf(0, 0) % 360) + 360) % 360;
  if (!near(deg, 180, 1e-9)) failures.push(`the dash at the origin points at ${deg} deg, expected 180`);
}

if (failures.length > 0) {
  console.error("REFUSING TO WRITE -- the plate does not satisfy its own oracles:");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

// ---------------------------------------------------------------- emission
let uid = 0;
const nid = (p) => `${p}${uid++}`;
const kids = [];

const keepRects = [];
const keepDiscs = [];
const keepRings = [];
const keepTally = new Map();

const keepRect = (tag, x, y, w, h, p = 7) =>
  keepRects.push({ tag, x: x - p, y: y - p, w: w + p * 2, h: h + p * 2 });
const keepDisc = (tag, x, y, r) => keepDiscs.push({ tag, x, y, r });
const keepRing = (tag, x, y, R, half) => keepRings.push({ tag, x, y, R, half });

const tally = (tag) => keepTally.set(tag, (keepTally.get(tag) ?? 0) + 1);

/** Clear of the TYPE and framing keepouts. Every mark on the plate obeys this. */
function clearOfRects(cx, cy, half) {
  for (const r of keepRects) {
    if (cx + half > r.x && cx - half < r.x + r.w && cy + half > r.y && cy - half < r.y + r.h) {
      tally(r.tag);
      return false;
    }
  }
  return true;
}

/** Additionally clear of the singularity clearings and walk corridors. Field marks only. */
function clearForField(cx, cy) {
  if (!clearOfRects(cx, cy, HALF)) return false;
  for (const d of keepDiscs) {
    if (Math.hypot(cx - d.x, cy - d.y) < d.r + HALF) { tally(d.tag); return false; }
  }
  for (const g of keepRings) {
    if (Math.abs(Math.hypot(cx - g.x, cy - g.y) - g.R) < g.half + HALF) { tally(g.tag); return false; }
  }
  return true;
}

const lineHeight = (fs) => fs * 1.45;

function text(x, y, w, label, fs, fill, align = "start") {
  const lines = label.split("\n").length;
  const h = lines * lineHeight(fs) + 2.6;
  keepRect("type", x, y, w, h);
  kids.push({
    type: "block", id: nid("t"), x, y, width: w, height: h, label,
    fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align,
  });
}

function rect(x, y, w, h, fill) {
  kids.push({
    type: "block", id: nid("r"), x, y, width: w, height: h,
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
  });
}

function disc(cx, cy, d, fill, extra = {}) {
  kids.push({
    type: "block", id: nid("d"), x: cx - d / 2, y: cy - d / 2,
    width: d, height: d, shape: "circle",
    fill, stroke: "transparent", strokeWidth: 0, padding: 0, ...extra,
  });
}

/**
 * One field mark: a dash turned to the field direction, lit tail to head.
 *
 * `rotation` is degrees CLOCKWISE in screen space and screen y points down,
 * so the screen angle of the mathematical argument phi is -phi. The gradient
 * is declared once at bearing 90 -- "along this dash's own long axis" -- and
 * the box rotation carries it into world orientation, which is why one
 * definition per magnitude band serves every angle in the field.
 */
function dash(cx, cy, phi, bucket) {
  const head = magRamp(bucket / (BUCKETS - 1));
  kids.push({
    type: "block", id: nid("m"), x: cx - L / 2, y: cy - WD / 2,
    width: L, height: WD, radius: WD / 2, padding: 0,
    stroke: "transparent", strokeWidth: 0,
    rotation: -phi * 180 / Math.PI, rotateBox: true,
    fill: {
      kind: "linear", angle: 90,
      stops: [
        { offset: 0, color: fade(head, 0.80) },
        { offset: 0.5, color: fade(head, 0.30) },
        { offset: 1, color: head },
      ],
    },
  });
}

const bucketOf = (abs) =>
  Math.round(Math.min(1, Math.max(0, (Math.log10(abs) + DECADES) / (2 * DECADES))) * (BUCKETS - 1));

// ================================================================ TYPE FIRST
// Emitted before the field so every label can reserve its own space. Paint
// order is unaffected: render/svg.ts puts all text above all boxes.

text(940, 96, 410, "THE ARGUMENT PRINCIPLE", 12.5, DIM, "end");
text(150, 130, 760, "FOUR INSIDE,\nNONE COUNTED", 46, INK);
rect(150, 296, 120, 1, RULE);
text(150, 316, 560,
  "Every mark is the value of f at that point: a stroke turned to\n" +
  "arg f, lit from tail to head, coloured by |f|. The four singularities\n" +
  "sit on the unit circle at the compass points, alternating.", 13.5, BODY);
text(760, 316, 590,
  "Walk a closed loop and count the net turns the field makes. A zero\n" +
  "contributes +1, a pole −1. The outer walk C encloses all four\n" +
  "and counts nothing: enclosing is not counting.", 13.5, BODY);
text(150, 396, 400, "f(z)  =  (z² − 1) / (z² + 1)", 15, "#E8C87A");
text(760, 396, 590, "zeros at ±1     ·     poles at ±i", 13, FAINT);

text(F_X1 - 560, 438, 560, "I.   THE FIELD, TURNED TO arg f", 12.5, DIM, "end");

// Legend, in the corner of panel I outside the outer walk. The marker grammar
// is stated once here rather than repeated beside all four singularities.
keepRect("legend", 150, 436, 340, 26, 8);
text(174, 438, 150, "zero   ·   index +1", 11.5, "#EFE4C6");
text(346, 438, 150, "pole   ·   index −1", 11.5, "#E8823F");

// Walk labels, each just outside its own circle.
for (const w of WALKS) {
  // just outside the ring, on the side that reads cleanest for each walk
  const [ux, uy] = w.id === "C" ? [-1, 0] : [0, -1];
  const lx = zx(w.cx) + ux * (w.R * SCALE + 21) - 12;
  const ly = zy(w.cy) - uy * (w.R * SCALE + 21) - 10;
  text(lx, ly, 24, w.id, 13.5, w.colour, "center");
}

// Panel II type.
const py = (v) => (P_Y0 + P_Y1) / 2 - (v / ARG_MAX) * ((P_Y1 - P_Y0) / 2 - 12);
const px = (t) => P_X0 + 16 + t * (P_X1 - P_X0 - 34);
const GRID_X1 = 1310;                // gridlines stop short of the endpoint discs

text(P_X0, P_Y0 - 36, 560, "II.   ACCUMULATED ARGUMENT ALONG EACH WALK", 12.5, DIM);
text(P_X1 - 560, P_Y0 - 36, 560, "every trace lands on a whole turn", 12.5, FAINT, "end");
text(P_X0 + 4, P_Y1 + 12, 220, "t = 0", 11, FAINT);
text(P_X1 - 224, P_Y1 + 12, 220, "once around", 11, FAINT, "end");

// Axis labels in radians. All five clear 4.5:1 -- an earlier draft dimmed the
// odd multiples to 3.51:1 for hierarchy and the contrast check refused it, so
// the hierarchy is carried by the RULE weight instead of by the type colour.
for (const m of [-2, -1, 0, 1, 2]) {
  text(P_X0 - 96, py(m * Math.PI) - 9, 84,
    m === 0 ? "0" : `${m > 0 ? "+" : "−"}${Math.abs(m) === 1 ? "" : Math.abs(m)}π`,
    11.5, FAINT, "end");
}

// Trace end labels, reserved HERE rather than beside the traces themselves:
// their positions are known in advance (each walk lands on its own multiple of
// 2pi) and reserving them now is what lets the traces be drawn around them.
for (const w of WALKS) {
  text(px(1) - 86, py(w.turns * 2 * Math.PI) - 32, 80,
    `${w.id}  ${w.turns > 0 ? "+1" : w.turns < 0 ? "−1" : "0"}`, 13, w.colour, "end");
}

// Inset type.
text(INS_AX, INS_Y0 - 28, INS_W, "A.   THE ZERO AT z = 1", 12.5, DIM);
text(INS_BX, INS_Y0 - 28, INS_W, "B.   THE POLE AT z = i", 12.5, DIM);
text(INS_AX, INS_Y0 + INS_H + 14, INS_W,
  "The field makes one full turn with the walk.\nIndex +1.", 12, BODY);
text(INS_BX, INS_Y0 + INS_H + 14, INS_W,
  "The same rosette, turning against the walk.\nIndex −1.", 12, BODY);

// Footnotes.
text(150, 2130, 560,
  "A.  |f| = 1 exactly on the two diagonals, because |z²−1| = |z²+1| forces Re z² = 0. The\n" +
  "neutral band is a straight line through the origin, not an artefact of the ramp.\n" +
  "B.  f is even, so the FIELD is unchanged by turning it 180° — every stroke keeps its axis\n" +
  "and reverses its tail-to-head sense. That reversal is the only difference between the\n" +
  "field and its own rotation, and it is exactly what a winding number counts. The three\n" +
  "walks are laid over that symmetry, not part of it.", 10.5, FOOT);
text(770, 2130, 580,
  "C.  Turn it 90° instead and it becomes the plate of 1/f: f(iz) = 1/f(z) exactly, so zeros and\n" +
  "poles exchange, the ramp inverts, every index changes sign. The alternating pinwheel is\n" +
  "that symmetry, not an arrangement.\n" +
  `D.  No mark is drawn within ${CLEAR}px of a singularity; the field turns faster there than a\n` +
  `${PITCH}px lattice can resolve, and drawing it would be interpolation, not measurement.\n` +
  `E.  Magnitude is banded into ${BUCKETS} steps, one gradient definition each. The banding is\n` +
  "the encoding; log|f| itself is continuous.", 10.5, FOOT);

// ================================================================ KEEPOUTS
// Panel I's margin, so no rotated footprint leaves the window.
keepRect("frame", F_X0 - 60, F_Y0 - 60, (F_X1 - F_X0) + 120, 60, 0);
keepRect("frame", F_X0 - 60, F_Y1, (F_X1 - F_X0) + 120, 60, 0);
keepRect("frame", F_X0 - 60, F_Y0 - 60, 60, (F_Y1 - F_Y0) + 120, 0);
keepRect("frame", F_X1, F_Y0 - 60, 60, (F_Y1 - F_Y0) + 120, 0);

for (const s of SING) keepDisc("singularity", zx(s.x), zy(s.y), CLEAR);
for (const w of WALKS) keepRing(`walk ${w.id}`, zx(w.cx), zy(w.cy), w.R * SCALE, 7);

// ================================================================ THE FIELD
let marks = 0, cells = 0;
const cols = Math.floor((F_X1 - F_X0) / PITCH);
const rows = Math.floor((F_Y1 - F_Y0) / PITCH);
const ox = F_X0 + ((F_X1 - F_X0) - (cols - 1) * PITCH) / 2;
const oy = F_Y0 + ((F_Y1 - F_Y0) - (rows - 1) * PITCH) / 2;

for (let j = 0; j < rows; j += 1) {
  for (let i = 0; i < cols; i += 1) {
    cells += 1;
    const cx = ox + i * PITCH, cy = oy + j * PITCH;
    if (!clearForField(cx, cy)) continue;
    const f = fOf((cx - ZX) / SCALE, (ZY - cy) / SCALE);
    if (!Number.isFinite(f.abs) || f.abs === 0) continue;
    dash(cx, cy, f.arg, bucketOf(f.abs));
    marks += 1;
  }
}

// ================================================================ THE WALKS
// Discs along an analytic circle. The tick indices carry a ring INSTEAD of a
// disc rather than on top of one: two concentric marks of different size would
// be a containment the check permits, but a hair of drift would make it a
// partial overlap, and there is no reason to sail that close.
// SPACING IS SET BY THE BOUNDING BOX, NOT THE CIRCLE. A circle-shaped block is
// still a square to boxes-do-not-overlap, so two marks whose discs clear each
// other by radius can still overlap as squares -- and along a circle the worst
// case is a chord at 45 degrees, where the centre separation splits evenly
// between x and y and neither axis alone separates them. The chord therefore
// has to clear (halfA + halfB) * sqrt(2), not (halfA + halfB). The first draft
// used 8.6 against a 6.4 requirement and failed on exactly the 45-degree arcs.
const TICK_D = 8.4, WALK_D = 4.4;
const WALK_STEP = (TICK_D + WALK_D) / 2 * Math.SQRT2 + 1.9;   // ~10.9
for (const w of WALKS) {
  const n = Math.max(40, Math.round(2 * Math.PI * w.R * SCALE / WALK_STEP));
  const ticks = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((k) => Math.round(k * n / 8) % n));
  for (let i = 0; i < n; i += 1) {
    const a = 2 * Math.PI * (i / n);
    const cx = zx(w.cx + w.R * Math.cos(a));
    const cy = zy(w.cy + w.R * Math.sin(a));
    const isTick = ticks.has(i);
    if (!clearOfRects(cx, cy, (isTick ? TICK_D : WALK_D) / 2)) continue;
    if (isTick) {
      disc(cx, cy, TICK_D, "transparent", { stroke: w.colour, strokeWidth: 1.7, shape: "circle" });
    } else {
      disc(cx, cy, WALK_D, fade(w.colour, 0.6 * (1 - i / n)));
    }
  }
}

// ================================================================ MARKERS
// A zero is a point of ink; a pole is a hole. Solid disc against double ring:
// the border style states the sign of the index, it is not decoration.
for (const s of SING) {
  const cx = zx(s.x), cy = zy(s.y);
  if (s.kind === "zero") {
    disc(cx, cy, 21, "#F4EAD0", { effect: [{ kind: "outline", width: 4, color: BG, opacity: 1 }] });
  } else {
    disc(cx, cy, 22, "transparent", {
      stroke: "#E8823F", strokeWidth: 6.5, lineStyle: "double", shape: "circle",
      effect: [{ kind: "outline", width: 3, color: BG, opacity: 1 }],
    });
  }
}
// legend swatches, in the space the legend rect reserved
disc(160, 449, 14, "#F4EAD0");
disc(332, 449, 14, "transparent", { stroke: "#E8823F", strokeWidth: 4.2, lineStyle: "double", shape: "circle" });

// ================================================================ PANEL II
// L-shaped axis: left and bottom drawn, top and right at zero width. The one
// place on the plate where the four sides genuinely differ.
kids.push({
  type: "block", id: "panelII", x: P_X0, y: P_Y0,
  width: P_X1 - P_X0, height: P_Y1 - P_Y0,
  fill: "transparent", padding: 0, radius: 0,
  stroke: RULE, strokeWidth: 1.4,
  border: {
    left: { width: 1.4, color: RULE },
    bottom: { width: 1.4, color: RULE },
    top: { width: 0 },
    right: { width: 0 },
  },
});

// Traces, spaced by arc length so consecutive discs cannot touch as SQUARES:
// the same sqrt(2) argument as the walks, since a steep stretch sampled at
// uniform t runs diagonally. The endpoint disc is larger, so its neighbours
// are cleared by its own half-diagonal too.
//
// Positions are computed BEFORE anything is drawn, because the gridlines have
// to be broken around them: a trace crossing a rule is the one collision that
// cannot be designed away -- the trace has to cross, that is what it is for --
// so the rule yields instead, and to yield it must know where the trace went.
const TRACE_D = 4.6, END_D = 10;
const TRACE_GAP = TRACE_D * Math.SQRT2 + 0.9;                  // ~7.4
const END_GAP = (TRACE_D + END_D) / 2 * Math.SQRT2 + 1.6;      // ~11.9

// Occupancy is shared across all three traces, not per trace: the walks cross
// one another (they all start at 0, and C weaves between A and B), so a dot
// that clears its own predecessor can still land on another trace's. Where two
// traces genuinely coincide only one mark survives, which is the same
// collapse-to-one-mark rule the field lattice uses for a self-crossing curve.
const placed = [];
const fits = (cx, cy, d) => {
  for (const p of placed) {
    const s = (d + p.d) / 2 + 0.6;
    if (Math.abs(cx - p.x) < s && Math.abs(cy - p.y) < s) return false;
  }
  return true;
};

const traceDots = [];
// Endpoints first: they are the payload, so they win every contest for space.
for (const tr of traces) {
  const end = tr.pts[tr.pts.length - 1];
  const dot = { x: px(end.t), y: py(end.acc), d: END_D, end: true };
  placed.push(dot);
  traceDots.push({ w: tr.w, dots: [dot] });
}
traces.forEach((tr, k) => {
  const e = traceDots[k].dots[0];
  let last = null;
  for (const p of tr.pts) {
    const cx = px(p.t), cy = py(p.acc);
    if (last !== null && Math.hypot(cx - last[0], cy - last[1]) < TRACE_GAP) continue;
    if (Math.hypot(cx - e.x, cy - e.y) < END_GAP) continue;
    if (!clearOfRects(cx, cy, TRACE_D / 2)) continue;
    if (!fits(cx, cy, TRACE_D)) continue;
    const dot = { x: cx, y: cy, d: TRACE_D };
    placed.push(dot);
    traceDots[k].dots.push(dot);
    last = [cx, cy];
  }
});

/** Would an axis-aligned rect here collide with any trace dot's own box? */
function hitsTrace(cx, cy, w, h) {
  for (const g of traceDots) {
    for (const p of g.dots) {
      if (Math.abs(cx - p.x) < (w + p.d) / 2 && Math.abs(cy - p.y) < (h + p.d) / 2) return true;
    }
  }
  return false;
}

// The whole-turn lines (0 and +-2pi, where the traces must land) carry weight;
// the odd multiples of pi are hairlines. Hierarchy by rule weight, not by
// dimming type below the contrast floor. Drawn as a dotted run so each dash
// can step aside individually where a trace passes.
const DASH_W = 5, DASH_STEP = 10;
for (const m of [-2, -1, 0, 1, 2]) {
  const y = py(m * Math.PI);
  const whole = m % 2 === 0;
  const h = whole ? 1 : 0.55;
  const colour = whole ? (m === 0 ? RULE : fade(RULE, 0.12)) : fade(RULE, 0.42);
  for (let x = P_X0 + 16; x + DASH_W <= GRID_X1; x += DASH_STEP) {
    if (hitsTrace(x + DASH_W / 2, y + h / 2, DASH_W, h)) continue;
    rect(x, y, DASH_W, h, colour);
  }
}
for (let k = 0; k <= 8; k += 1) rect(px(k / 8), P_Y1 - 7, 1, 7, RULE);

for (const g of traceDots) {
  for (const p of g.dots) {
    if (p.end) {
      disc(p.x, p.y, END_D, g.w.colour, {
        effect: [{ kind: "outline", width: 3, color: BG, opacity: 1 }],
      });
    } else {
      disc(p.x, p.y, TRACE_D, g.w.colour);
    }
  }
}

// ================================================================ INSETS
// The frames inherit the marker grammar: solid for the zero, double for the
// pole, so the frame itself states which kind of singularity is inside.
function inset(x0, kind, subject) {
  const cx = x0 + INS_W / 2, cy = INS_Y0 + INS_H / 2;
  const zoom = 900;
  kids.push({
    type: "block", id: nid("ins"), x: x0, y: INS_Y0, width: INS_W, height: INS_H,
    fill: "transparent", padding: 0, radius: 2,
    stroke: kind === "zero" ? RULE : "#5C4028",
    strokeWidth: kind === "zero" ? 1.4 : 4.4,
    lineStyle: kind === "zero" ? "solid" : "double",
  });
  const P = 13;
  const c = Math.floor((INS_W - 34) / P), r = Math.floor((INS_H - 34) / P);
  const bx = cx - (c - 1) * P / 2, by = cy - (r - 1) * P / 2;
  for (let j = 0; j < r; j += 1) {
    for (let i = 0; i < c; i += 1) {
      const mx = bx + i * P, my = by + j * P;
      const x = subject[0] + (mx - cx) / zoom;
      const y = subject[1] - (my - cy) / zoom;
      if (Math.hypot(x - subject[0], y - subject[1]) < 0.026) continue;
      const f = fOf(x, y);
      if (!Number.isFinite(f.abs) || f.abs === 0) continue;
      dash(mx, my, f.arg, bucketOf(f.abs));
    }
  }
  if (kind === "zero") {
    disc(cx, cy, 17, "#F4EAD0", { effect: [{ kind: "outline", width: 3.5, color: BG, opacity: 1 }] });
  } else {
    disc(cx, cy, 18, "transparent", {
      stroke: "#E8823F", strokeWidth: 5, lineStyle: "double", shape: "circle",
      effect: [{ kind: "outline", width: 2.5, color: BG, opacity: 1 }],
    });
  }
}

inset(INS_AX, "zero", [1, 0]);
inset(INS_BX, "pole", [0, 1]);

// ---------------------------------------------------------------- write
const spec = {
  version: 1,
  title: "Four inside, none counted",
  canvas: { padding: 0, background: BG, theme: "dark", vignette: 0.26 },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: kids },
};
writeFileSync(`out/${NAME}.json`, JSON.stringify(spec));

console.log(`wrote out/${NAME}.json`);
console.log(`  pitch ${PITCH}   ${marks} field marks of ${cells} cells   ${kids.length} blocks total`);
console.log(`  all six oracles hold:`);
for (const tr of traces) {
  console.log(`    walk ${tr.w.id}:  analytic ${(tr.acc / (2 * Math.PI)).toFixed(9)} turns` +
    `   drawn ${drawnWinding(tr.w).toFixed(9)}   max step ${tr.maxStep.toFixed(4)} rad`);
}
console.log(`  cells refused, by keepout:`);
for (const [tag, n] of [...keepTally].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${tag.padEnd(14)} ${n}`);
}
