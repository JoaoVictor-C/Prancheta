/*
 * "Projectile from a cliff" -- the figure for a worked exercise.
 *
 * The teaching content is in the geometry, not in the caption:
 *
 *   - Markers sit at equal TIME intervals, not equal distances. Their
 *     horizontal spacing is constant and their vertical spacing is not, which
 *     is the whole of "the two axes are independent" said without saying it.
 *   - The angle mark sweeps 35 degrees because the arc is DERIVED from the
 *     same theta the trajectory is. sweep-matches-its-label refuses the case
 *     where the drawing and the printed number drift apart, which is the one
 *     way a figure like this misleads a student who trusts it.
 *   - The launch velocity's decomposition is an inset rather than an overlay,
 *     because v0 is tangent to the path and the triangle would otherwise be
 *     drawn across the very curve it explains.
 *   - Every unknown the exercise asks for is marked "?" on the figure, and
 *     nothing that is asked for is answered by it.
 *
 * The trajectory is integrated from the stated v0, theta and g. It is not a
 * drawn curve that happens to look parabolic.
 */
import { writeFileSync } from "node:fs";
import { lineHeight } from "./lib.mjs";

const W = 1320;
const H = 950;

const INK = { text: "#171A20", faint: "#5B6472", rule: "#C9CED6", grid: "#E6E9EE", axis: "#AEB5BF" };
const PATH = "#C2410C";
const VEC = "#1D4ED8";
const COMP = "#8A93A2";        // the dashed component lines
const COMP_TEXT = "#4B5563";   // their labels, which have to clear AA
const DIM = "#3F6212";
const ROCK_FILL = "#EAECF0";
const ROCK_EDGE = "#98A1AE";

const DEG = Math.PI / 180;
let uid = 0;
const nid = (p) => `${p}${uid++}`;

const kids = [];
const connectors = [];
const marks = [];
const reserved = [];
const blocked = [];   // segments and discs the dotted path must keep clear of

const reserve = (x, y, w, h, s = 6) =>
  reserved.push({ x: x - s, y: y - s, x2: x + w + s, y2: y + h + s });
const isReserved = (x, y, r) =>
  reserved.some((q) => x + r > q.x && x - r < q.x2 && y + r > q.y && y - r < q.y2);

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
const isBlocked = (x, y) => blocked.some((s) => distToSegment(x, y, s.a, s.b) < s.clear);

/** A label in canvas coordinates. */
function label(x, y, w, text, fs, fill, opts = {}) {
  const { id, align = "center", annotates, claim = true, rotation, rotateBox, height } = opts;
  const h = height ?? text.split("\n").length * lineHeight(fs) + 2.6;
  kids.push({
    type: "block", id: id ?? nid("t"), x, y, width: w, height: h,
    label: text, fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align, wrap: "none",
    ...(annotates ? { annotates } : {}),
    ...(rotation !== undefined ? { rotation } : {}),
    ...(rotateBox ? { rotateBox } : {}),
  });
  if (claim) reserve(x, y, w, h);
}

/** A label centred on a point in the field, upright regardless of the frame. */
function at(x, y, w, text, fs, fill, annotates) {
  kids.push({
    type: "block", id: nid("t"), frame: "field", anchor: "center", x, y,
    width: w, height: lineHeight(fs) + 2.6,
    label: text, fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: "center", wrap: "none",
    rotation: 0,
    ...(annotates ? { annotates } : {}),
  });
}

const disc = (x, y, d, fill) =>
  kids.push({
    type: "block", id: nid("d"), x: x - d / 2, y: y - d / 2, width: d, height: d,
    shape: "circle", fill, stroke: "transparent", strokeWidth: 0, padding: 0,
  });

const rect = (x, y, w, h, fill) =>
  kids.push({
    type: "block", id: nid("r"), x, y, width: w, height: h,
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0,
  });

// ===========================================================================
// The problem. Four givens; every other number below is computed.
// ===========================================================================

const V0 = 28;      // m/s
const THETA = 35;   // degrees above the horizontal
const CLIFF = 40;   // m
const G = 9.8;      // m/s^2

const vx = V0 * Math.cos(THETA * DEG);
const vy = V0 * Math.sin(THETA * DEG);
const tApex = vy / G;
const hRise = (vy * vy) / (2 * G);
const tLand = (vy + Math.sqrt(vy * vy + 2 * G * CLIFF)) / G;
const range = vx * tLand;
const vyEnd = vy - G * tLand;
const vEnd = Math.hypot(vx, vyEnd);
const angEnd = Math.atan2(-vyEnd, vx) / DEG;

const xAt = (t) => vx * t;
const yAt = (t) => CLIFF + vy * t - 0.5 * G * t * t;
const xApex = xAt(tApex);
const yApex = yAt(tApex);

// ===========================================================================
// The field: one frame in metres, so every coordinate below is a quantity.
// ===========================================================================

const OX = 250;
const OY = 566;
const U = 8;          // px per metre
const ROCK_W = 16;    // m of cliff drawn left of the launch point

const frames = [{
  id: "field",
  origin: { x: OX, y: OY },
  xUnit: U, yUnit: U,
  grid: {
    x: { from: 0, to: 120, step: 10, labelEvery: 2 },
    y: { from: 0, to: 55, step: 5, labelEvery: 2 },
    axes: true, labels: true,
    stroke: INK.grid, axisStroke: INK.axis, labelColor: INK.faint,
    lineStyle: "dashed",
  },
}];

const P = (x, y) => ({ frame: "field", x, y });
const cx = (x) => OX + x * U;
const cy = (y) => OY - y * U;
const CP = (x, y) => ({ x: cx(x), y: cy(y) });

marks.push(
  {
    id: "cliff",
    from: P(-ROCK_W, 0),
    segments: [{ line: P(-ROCK_W, CLIFF) }, { line: P(0, CLIFF) }, { line: P(0, 0) }],
    close: true, fill: ROCK_FILL, stroke: ROCK_EDGE, strokeWidth: 1.4,
  },
  {
    id: "ground",
    from: P(-ROCK_W, 0), segments: [{ line: P(124, 0) }], close: false,
    stroke: "#4B5563", strokeWidth: 1.8,
  },
);

// ---------------------------------------------------------------------------
// Vectors on the trajectory.
// ---------------------------------------------------------------------------

// One scale for both velocity vectors, so their lengths are comparable -- the
// ball really is faster on landing than at launch, and the drawing says so.
//
// Both vectors are TANGENT to the path, because that is what a velocity is.
// So a long arrow lies along the curve and the raster has to blank the dots
// underneath it, which leaves the parabola starting in mid-air with the arrow
// overshooting past it. A SHORT tangent fixes that: the arrow reads as the
// first stretch of the path and the dots pick up just past its head.
const K = 0.36;   // metres of drawing per m/s
const TIP = { x: vx * K, y: CLIFF + vy * K };
const ARC = 7.5;  // radius of the angle mark, in metres
const LBL_R = 9.5; // where its label sits: near enough the arc to name it,
                   // far enough out that its box clears both arms

// The impact vector ARRIVES at the landing point rather than continuing below
// the ground: a velocity drawn under the terrain reads as a second bounce.
const IN = { x: range - vx * K, y: -vyEnd * K };

connectors.push(
  { id: "level", from: P(0, CLIFF), to: P(30, CLIFF), arrow: "none",
    stroke: "#9AA3B0", strokeWidth: 1.1, lineStyle: "dashed" },
  { id: "v0", from: P(0, CLIFF), to: P(TIP.x, TIP.y), arrow: "end", stroke: VEC, strokeWidth: 2.4 },
  // The angle mark. Its sweep is derived from the same THETA the trajectory
  // is, so the arc and the printed number cannot disagree.
  { id: "theta",
    from: P(ARC, CLIFF),
    to: P(ARC * Math.cos(THETA * DEG), CLIFF + ARC * Math.sin(THETA * DEG)),
    arrow: "none", stroke: "#334155", strokeWidth: 1.3,
    curve: { kind: "sweep", centre: P(0, CLIFF) } },
  { id: "vimp", from: P(IN.x, IN.y), to: P(range, 0), arrow: "end", stroke: VEC, strokeWidth: 2.4 },
  { id: "hdim", from: P(-ROCK_W + 2.5, 0), to: P(-ROCK_W + 2.5, CLIFF), arrow: "both",
    stroke: DIM, strokeWidth: 1.4 },
  { id: "rdim", from: P(0, -4), to: P(range, -4), arrow: "both", stroke: DIM, strokeWidth: 1.4 },
  { id: "Hdim", from: P(xApex, CLIFF), to: P(xApex, yApex - 1.1), arrow: "both",
    stroke: DIM, strokeWidth: 1.4 },
);

blocked.push(
  { a: CP(0, CLIFF), b: CP(TIP.x, TIP.y), clear: 11 },
  { a: CP(0, CLIFF), b: CP(30, CLIFF), clear: 7 },
  { a: CP(IN.x, IN.y), b: CP(range, 0), clear: 11 },
  { a: CP(xApex, CLIFF), b: CP(xApex, yApex - 1.1), clear: 7 },
);

// ---------------------------------------------------------------------------
// Labels on the field. Each one is nearer the thing it names than anything
// else, which is what earns it the right to sit on that thing.
// ---------------------------------------------------------------------------

at(range / 2, -6.6, 120, "R  =  ?", 13, DIM, "rdim");
at(xApex + 5.5, CLIFF + hRise * 0.38, 70, "H  =  ?", 13, DIM, "Hdim");
at(LBL_R * Math.cos((THETA / 2) * DEG), CLIFF + LBL_R * Math.sin((THETA / 2) * DEG),
  36, `${THETA.toFixed(1)}°`, 12, "#334155", "theta");
// These two name their arrows by sitting beside them rather than by declaring
// it. `annotates` would buy an overlap neither of them needs, and it would
// cost the nearest-owner obligation in a corner of the figure where the arc,
// the arrow and the path are all within a few pixels of each other.
at(3.5, 52.5, 106, `v₀ = ${V0} m/s`, 13, VEC);
at(100.5, 5.5, 92, "v  =  ?", 13, VEC);
at(80, 7.4, 190, `each marker  ·  ${(0.5).toFixed(1)} s apart`, 12, PATH);

// Beside the dimension arrow, not on it: `annotates` would permit the
// overlap, but a rule struck through its own number is still unreadable.
label(cx(-ROCK_W + 2.5) - 20, cy(CLIFF / 2) - 9, 92, `h = ${CLIFF} m`, 12.5, DIM,
  { rotation: -90, rotateBox: true, height: 18, annotates: "hdim", claim: false });

// Axis captions.
label(cx(0), OY + 80, 120 * U, "horizontal distance from the base of the cliff   (m)", 12, INK.faint);
label(12, cy(27.5) - 89, 160, "height above ground   (m)", 12, INK.faint,
  { rotation: -90, rotateBox: true, height: 18, claim: false });

// ---------------------------------------------------------------------------
// The decomposition, as an inset. Its panel is a MARK, so the little triangle
// inside it is not a connector crossing a box it does not join.
// ---------------------------------------------------------------------------

const IX = 950, IY = 120, IW = 340, IH = 190;
marks.push({
  id: "inset",
  from: { x: IX, y: IY },
  segments: [
    { line: { x: IX + IW, y: IY } },
    { line: { x: IX + IW, y: IY + IH } },
    { line: { x: IX, y: IY + IH } },
  ],
  close: true, fill: "#FFFFFF", stroke: "#D3D8E0", strokeWidth: 1.2,
});

const TO = { x: 1060, y: 250 };            // the triangle's launch corner
const TW = 120, TH = 84;                   // 120/84 = v0x/v0y, so the shape is the real one
connectors.push(
  { id: "iv0x", from: TO, to: { x: TO.x + TW, y: TO.y }, arrow: "end", arrowStyle: "open",
    stroke: COMP, strokeWidth: 1.4, lineStyle: "dashed" },
  { id: "iv0y", from: { x: TO.x + TW, y: TO.y }, to: { x: TO.x + TW, y: TO.y - TH },
    arrow: "end", arrowStyle: "open", stroke: COMP, strokeWidth: 1.4, lineStyle: "dashed" },
  { id: "iv0", from: TO, to: { x: TO.x + TW, y: TO.y - TH }, arrow: "end",
    stroke: VEC, strokeWidth: 2.2 },
  { id: "itheta", from: { x: TO.x + 44, y: TO.y },
    to: { x: TO.x + 44 * Math.cos(THETA * DEG), y: TO.y - 44 * Math.sin(THETA * DEG) },
    arrow: "none", stroke: "#334155", strokeWidth: 1.2,
    curve: { kind: "sweep", centre: TO } },
);

label(IX + 16, IY + 14, 250, "the launch velocity, decomposed", 12.5, INK.text, { align: "start", claim: false });
label(TO.x + TW / 2 - 46, TO.y + 12, 92, "v₀ cos θ", 12, COMP_TEXT, { annotates: "iv0x", claim: false });
label(TO.x + TW + 6, TO.y - TH / 2 - 10, 80, "v₀ sin θ", 12, COMP_TEXT,
  { align: "start", annotates: "iv0y", claim: false });
label(TO.x + 12, TO.y - 64, 36, "v₀", 13, VEC, { annotates: "iv0", claim: false });
label(TO.x + 50 * Math.cos((THETA / 2) * DEG) - 15, TO.y - 50 * Math.sin((THETA / 2) * DEG) - 5,
  30, "θ", 12, "#334155", { annotates: "itheta", claim: false, height: 16 });

// ---------------------------------------------------------------------------
// The trajectory: grains along the integrated path, and a ringed marker every
// half second. Equal TIME, not equal distance -- which is the point.
// ---------------------------------------------------------------------------

const MARK_EVERY = 0.5;
const MARKS = [];
for (let t = MARK_EVERY; t < tLand; t += MARK_EVERY) MARKS.push(t);
MARKS.push(tApex);
// The impact vector is TANGENT to the path -- it has to be, it is the
// velocity -- so a marker close to the landing point sits on the arrow. Drop
// those rather than draw a collision: the arrow already marks the end.
const clearOfArrow = (t) =>
  distToSegment(cx(xAt(t)), cy(yAt(t)), CP(IN.x, IN.y), CP(range, 0)) > 16;
MARKS.splice(0, MARKS.length, ...MARKS.filter(clearOfArrow));
for (const t of MARKS) reserve(cx(xAt(t)) - 6, cy(yAt(t)) - 6, 12, 12, 2);

const PITCH = 6.6;
let last = null;
let grains = 0;
for (let s = 0; s <= 20000; s += 1) {
  const t = (s / 20000) * tLand;
  const px = cx(xAt(t));
  const py = cy(yAt(t));
  if (last !== null && Math.hypot(px - last.x, py - last.y) < PITCH) continue;
  last = { x: px, y: py };
  if (isReserved(px, py, 1.8) || isBlocked(px, py)) continue;
  disc(px, py, 3.4, PATH);
  grains += 1;
}

for (const t of MARKS) {
  const isApex = t === tApex;
  disc(cx(xAt(t)), cy(yAt(t)), 9.4, isApex ? "#7C2D12" : PATH);
  disc(cx(xAt(t)), cy(yAt(t)), 4.6, "#FFFFFF");
}

// ---------------------------------------------------------------------------
// The exercise.
// ---------------------------------------------------------------------------

const TOP = 700;
label(64, TOP, 700, "Projectile from a cliff", 27, INK.text, { align: "start", claim: false });
rect(64, TOP + 44, W - 128, 1, INK.rule);
label(64, TOP + 60, 700,
  `A ball leaves the edge of a ${CLIFF} m cliff at ${V0} m/s, ${THETA}° above the horizontal.\n` +
  `Air resistance is negligible and g = ${G} m/s². Markers on the path are ${MARK_EVERY} s apart.`,
  13.5, INK.text, { align: "start", claim: false });
label(64, TOP + 118, 560,
  "(a)   How high above the launch point does it rise?\n" +
  "(b)   How long is it in the air?",
  13.5, INK.faint, { align: "start", claim: false });
label(660, TOP + 118, 600,
  "(c)   How far from the base of the cliff does it land?\n" +
  "(d)   How fast is it moving when it lands?",
  13.5, INK.faint, { align: "start", claim: false });
label(64, TOP + 180, W - 128,
  "the path is integrated from v₀, θ and g  ·  the angle mark sweeps the angle it prints  ·  " +
  "every quantity shown is either given or asked for, and none is answered",
  11, INK.faint, { align: "start", claim: false });

const spec = {
  version: 1,
  title: "Projectile from a cliff",
  canvas: {
    padding: 0, background: "#FFFFFF", theme: "print",
    constraints: { allowCurvedConnectors: true },
  },
  root: { type: "scene", layout: "absolute", width: W, height: H, frames, marks, connectors, children: kids },
};

writeFileSync("out/projectile.json", JSON.stringify(spec, null, 2));
console.log(`wrote out/projectile.json -- ${kids.length} blocks, ${grains} path grains`);
console.log(
  `  ANSWERS  (a) H = ${hRise.toFixed(1)} m   (b) t = ${tLand.toFixed(2)} s   ` +
  `(c) R = ${range.toFixed(1)} m   (d) v = ${vEnd.toFixed(1)} m/s at ${angEnd.toFixed(1)}° below horizontal`,
);
console.log(
  `  v0x = ${vx.toFixed(2)} m/s, v0y = ${vy.toFixed(2)} m/s, ` +
  `apex ${xApex.toFixed(1)} m out and ${yApex.toFixed(1)} m above the ground at t = ${tApex.toFixed(2)} s`,
);
