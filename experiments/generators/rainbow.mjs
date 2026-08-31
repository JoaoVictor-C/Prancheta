/*
 * "Forty-Two Degrees" -- the geometry of a rainbow, drawn three ways.
 *
 * One argument in three panels, and every number in it is computed here
 * rather than typed:
 *
 *   A  ONE DROP. A ray enters a sphere of water at impact parameter b,
 *      refracts, reflects once off the back, and refracts out. Snell's law
 *      fixes every angle from n alone. The angle the emerging ray makes with
 *      the direction back to the sun is the bow's angular radius.
 *
 *   B  WHY FORTY-TWO. The total deviation D = 2(ti - tr) + (180 - 2tr) has a
 *      MINIMUM. Near a minimum a function is flat, so a wide band of impact
 *      parameters all leave at nearly the same angle -- rays pile up there.
 *      That caustic is the bow. Because n depends on wavelength the minimum
 *      sits at a different angle for each colour, and the bow has width.
 *
 *   C  THE SKY. Every point is the sum over wavelength of light that can
 *      reach that angle. The primary bow admits light only INSIDE it, the
 *      secondary only OUTSIDE, so the gap between them receives neither --
 *      which is the whole of Alexander's dark band, drawn by declining to
 *      put ink there.
 *
 * Written to exercise the parts of the toolkit a dot field never touches:
 * composed coordinate frames (the local normal at a refraction point is a
 * frame AIMED at the drop's centre, so no angle is ever typed twice), free
 * marks with true circular arcs, angle sweeps whose printed value is checked
 * against the arc actually drawn, a gradient, a real coordinate grid, a
 * rotated label and layout constraints. The only relaxation it asks for is
 * the one an angle mark cannot exist without.
 */
import { writeFileSync } from "node:fs";
import { Lattice, lineHeight } from "./lib.mjs";

const W = 1320;
const H = 1560;
const BG = "#07070E";

const INK = {
  title: "#F4E7CA",
  eyebrow: "#9BA0CC",
  body: "#8E92BC",
  faint: "#8A8FB8",
  rule: "#332F58",
  head: "#C9CCEA",
  grid: "#241F44",
};

const RAY = "#F3C46A";
const NORMAL = "#727AAE";
const RED = "#E8674F";
const VIOLET = "#7C7BE8";

const DEG = Math.PI / 180;
const deg = (r) => r / DEG;

let uid = 0;
const nid = (p) => `${p}${uid++}`;

const kids = [];
const connectors = [];
const marks = [];
const frames = [];
const reserved = [];

/** Claim a rectangle so the raster fields leave it alone. Reserve, then draw. */
function reserve(x, y, w, h, slack = 8) {
  reserved.push({ x: x - slack, y: y - slack, x2: x + w + slack, y2: y + h + slack });
}
const isReserved = (x, y, r) =>
  reserved.some((q) => x + r > q.x && x - r < q.x2 && y + r > q.y && y - r < q.y2);

/** A label anchored top-left; newlines are hard breaks. Claims its own box. */
function label(x, y, w, textStr, fs, fill, opts = {}) {
  const { id, align = "center", annotates, claim = true, rotation, rotateBox, height } = opts;
  const lines = textStr.split("\n").length;
  const h = height ?? lines * lineHeight(fs) + 2.6;
  kids.push({
    type: "block", id: id ?? nid("t"), x, y, width: w, height: h,
    label: textStr, fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align, wrap: "none",
    ...(annotates ? { annotates } : {}),
    ...(rotation ? { rotation } : {}),
    ...(rotateBox ? { rotateBox } : {}),
  });
  if (claim) reserve(x, y, w, h);
}

/** A label placed by a frame, centred on the point it is given. */
function framedLabel(frame, x, y, w, textStr, fs, fill, annotates) {
  kids.push({
    type: "block", id: nid("t"), frame, anchor: "center", x, y, width: w,
    height: lineHeight(fs) + 2.6,
    label: textStr, fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: "center", wrap: "none",
    // A frame aimed with `towards` carries a rotation, and a block inside it
    // turns with the frame unless it declares its own. A number read off a
    // figure should not be tilted, so it declares zero.
    rotation: 0,
    ...(annotates ? { annotates } : {}),
  });
}

/**
 * HTML collapses a run of spaces to one, so tracking written as spaces
 * silently disappears between measurement and the page. Non-breaking spaces
 * survive, and survive identically in the mirror and in the SVG.
 */
const wide = (t) => t.split(" ").join(" ");

const disc = (cx, cy, d, fill) =>
  kids.push({
    type: "block", id: nid("d"), x: cx - d / 2, y: cy - d / 2, width: d, height: d,
    shape: "circle", fill, stroke: "transparent", strokeWidth: 0, padding: 0,
  });

const rect = (x, y, w, h, fill, extra = {}) =>
  kids.push({
    type: "block", id: nid("r"), x, y, width: w, height: h,
    fill, stroke: "transparent", strokeWidth: 0, radius: 0, padding: 0, ...extra,
  });

// ===========================================================================
// The optics. Everything below follows from n alone.
// ===========================================================================

/** Cauchy fit to water, pinned to n(400 nm) = 1.3435 and n(700 nm) = 1.3311. */
const nWater = (nm) => 1.325087 + 2946 / (nm * nm);

/** Total deviation of a ray making k internal reflections, in degrees. */
function deviation(thetaI, n, k) {
  const thetaR = Math.asin(Math.sin(thetaI) / n);
  return deg(2 * (thetaI - thetaR) + k * (Math.PI - 2 * thetaR));
}

/** The incidence at which deviation is stationary -- the caustic. */
const rainbowIncidence = (n, k) => Math.acos(Math.sqrt((n * n - 1) / (k * (k + 2))));

/** Angular radius of the k-th bow, measured from the antisolar point. */
function bowAngle(n, k) {
  return Math.abs(180 - (deviation(rainbowIncidence(n, k), n, k) % 360));
}

// ===========================================================================
// Panel A -- one drop, one ray.
// ===========================================================================

const DROP = { x: 352, y: 402 };
const R = 150;
const N_A = nWater(590);
const TH_I = rainbowIncidence(N_A, 1);
const TH_R = Math.asin(Math.sin(TH_I) / N_A);
const BOW_A = 180 - deviation(TH_I, N_A, 1);

// Position angles on the sphere. Entry sits at 180 - ti; each internal chord
// turns the position angle by (180 - 2tr), clockwise.
const chord = Math.PI - 2 * TH_R;
const on = (psi) => ({ x: R * Math.cos(psi), y: R * Math.sin(psi) });
const P1 = on(Math.PI - TH_I);
const P2 = on(Math.PI - TH_I - chord);
const P3 = on(Math.PI - TH_I - 2 * chord);
const dirOut = -2 * (TH_I - TH_R) - chord;
const P0 = { x: P1.x - 200, y: P1.y };
const P4 = { x: P3.x + 140 * Math.cos(dirOut), y: P3.y + 140 * Math.sin(dirOut) };

frames.push(
  { id: "drop", origin: DROP },
  // The local normal, with its angle never stated: a frame whose +x axis is
  // AIMED at the centre of the sphere IS the inward normal, by construction.
  { id: "entry", origin: { frame: "drop", x: P1.x, y: P1.y }, towards: { frame: "drop", x: 0, y: 0 } },
  { id: "exit", origin: { frame: "drop", x: P3.x, y: P3.y }, towards: { frame: "drop", x: 0, y: 0 } },
);

marks.push({
  id: "drop-body",
  from: { frame: "drop", x: R, y: 0 },
  segments: [90, 180, 270, 360].map((a) => ({
    arc: { frame: "drop", x: R * Math.cos(a * DEG), y: R * Math.sin(a * DEG) },
    centre: { frame: "drop", x: 0, y: 0 },
  })),
  close: true,
  fill: "#0D1930",
  stroke: "#3A6C9F",
  strokeWidth: 1.6,
});

const dropPt = (p) => ({ frame: "drop", x: p.x, y: p.y });

connectors.push(
  { id: "ray-in", from: dropPt(P0), to: dropPt(P1), arrow: "end", stroke: RAY, strokeWidth: 2 },
  { id: "ray-c1", from: dropPt(P1), to: dropPt(P2), arrow: "none", stroke: RAY, strokeWidth: 1.7 },
  { id: "ray-c2", from: dropPt(P2), to: dropPt(P3), arrow: "none", stroke: RAY, strokeWidth: 1.7 },
  { id: "ray-out", from: dropPt(P3), to: dropPt(P4), arrow: "end", stroke: RAY, strokeWidth: 2 },
  // Normals: a straight run along each local frame's own x axis. No trigonometry.
  { id: "norm-1", from: { frame: "entry", x: -86, y: 0 }, to: { frame: "entry", x: 116, y: 0 },
    arrow: "none", stroke: NORMAL, strokeWidth: 1.1, lineStyle: "dashed" },
  { id: "norm-3", from: { frame: "exit", x: -70, y: 0 }, to: { frame: "exit", x: 74, y: 0 },
    arrow: "none", stroke: NORMAL, strokeWidth: 1.1, lineStyle: "dashed" },
  { id: "sunline", from: dropPt(P3), to: { frame: "drop", x: P3.x - 180, y: P3.y },
    arrow: "none", stroke: NORMAL, strokeWidth: 1.1, lineStyle: "dashed" },
);

/** An angle mark: a true circular arc about `centre`, from one arm to the other. */
function sweep(id, frame, centre, radius, fromDeg, toDeg, stroke) {
  const at = (a) => ({
    frame, x: centre.x + radius * Math.cos(a * DEG), y: centre.y + radius * Math.sin(a * DEG),
  });
  connectors.push({
    id, from: at(fromDeg), to: at(toDeg), arrow: "none", stroke, strokeWidth: 1.4,
    curve: { kind: "sweep", centre: { frame, x: centre.x, y: centre.y } },
  });
}

const O = { x: 0, y: 0 };
const thI = deg(TH_I);
const thR = deg(TH_R);

sweep("ang-i", "entry", O, 60, 180, 180 + thI, "#C8B382");   // outward normal -> incoming ray
sweep("ang-r", "entry", O, 74, 0, thR, "#C8B382");           // inward normal -> refracted ray
sweep("ang-bow", "drop", P3, 82, 180, 180 + BOW_A, "#EFBE5E"); // sun line -> emerging ray

const polar = (frame, c, d, a) => ({
  frame, x: c.x + d * Math.cos(a * DEG), y: c.y + d * Math.sin(a * DEG),
});

// Each angle label sits on its wedge's bisector, just outside the arc it
// names -- close enough that the arc is the nearest thing to it (which
// annotation-nearest-its-owner insists on), far enough out that its box
// clears both arms (which connector-clear-of-boxes insists on). Those two
// pull opposite ways, and the gap between them is what sets the radius.
{
  const a = polar("entry", O, 70, 180 + thI / 2);
  framedLabel("entry", a.x, a.y, 40, `${thI.toFixed(1)}°`, 12.5, "#E9D9AC", "ang-i");
  const b = polar("entry", O, 84, thR / 2);
  framedLabel("entry", b.x, b.y, 34, `${thR.toFixed(1)}°`, 12.5, "#E9D9AC", "ang-r");
  const c = polar("drop", P3, 92, 180 + BOW_A / 2);
  framedLabel("drop", c.x, c.y, 42, `${BOW_A.toFixed(1)}°`, 14, "#F7D98F", "ang-bow");
}

framedLabel("drop", P0.x + 40, P0.y + 20, 110, "sunlight", 12, INK.faint, "ray-in");
framedLabel("drop", P2.x - 52, P2.y - 30, 152, "one reflection", 11.5, INK.faint, "ray-c2");
framedLabel("drop", P3.x - 186, P3.y + 22, 130, "back to the sun", 11.5, INK.faint, "sunline");

// ===========================================================================
// Panel B -- the deviation curve, and why the minimum is the bow.
// ===========================================================================

const PB = { x: 812, y: 218, w: 440, h: 360 };
const DEV_LO = 136;
const DEV_HI = 180;
const xUnit = PB.w;
const yUnit = PB.h / (DEV_HI - DEV_LO);

// The frame's own origin is off-canvas: nothing is drawn at D = 0, and a grid
// only ever draws between its stated bounds.
frames.push({
  id: "dev",
  origin: { x: PB.x, y: PB.y + PB.h + DEV_LO * yUnit },
  xUnit, yUnit,
  grid: {
    x: { from: 0, to: 1, step: 0.125, labelEvery: 2 },
    y: { from: DEV_LO, to: DEV_HI, step: 4, labelEvery: 1 },
    axes: false,
    labels: true,
    stroke: INK.grid,
    labelColor: INK.faint,
    lineStyle: "dotted",
  },
});

const CURVES = [
  { nm: 680, colour: RED, name: "red  680 nm" },
  { nm: 410, colour: VIOLET, name: "violet  410 nm" },
].map((c) => ({ ...c, n: nWater(c.nm) }));

// ===========================================================================
// Panel C -- the sky.
// ===========================================================================

const PC = { x: 60, y: 726, x2: 1260, y2: 1232 };
const SKY = { x: 660, y: 1318 };   // the antisolar point, below the canvas edge
const SCALE = 10.5;                // px per degree
const PITCH = 3.6;
const DOT = PITCH - 0.15;

/** Bruton's approximation: a visible wavelength as linear RGB. */
function spectralRGB(l) {
  let r = 0, g = 0, b = 0;
  if (l < 440) { r = -(l - 440) / 60; b = 1; }
  else if (l < 490) { g = (l - 440) / 50; b = 1; }
  else if (l < 510) { g = 1; b = -(l - 510) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; }
  else if (l < 645) { r = 1; g = -(l - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (l < 420) f = 0.3 + (0.7 * (l - 380)) / 40;
  else if (l > 700) f = 0.3 + (0.7 * (780 - l)) / 80;
  return [r * f, g * f, b * f];
}

/**
 * How much light of one wavelength reaches an angle `u` past its own caustic.
 * Zero on the forbidden side, a 1/sqrt pile-up at the caustic itself, and a
 * decaying tail on the side the rays actually spread into.
 */
const caustic = (u) => (u < 0 ? 0 : Math.min(6, 0.3 / Math.sqrt(u + 0.004)) * Math.exp(-u / 1.6));

const CHROMA_LIFT = 1.7;

const SAMPLES = [];
for (let nm = 400; nm <= 700; nm += 3) {
  const n = nWater(nm);
  SAMPLES.push({ rgb: spectralRGB(nm), t1: bowAngle(n, 1), t2: bowAngle(n, 2) });
}

const hex2 = (v) => Math.round(Math.min(255, Math.max(0, v * 255))).toString(16).padStart(2, "0");

/** The sky at angular radius `theta`, summed over the spectrum. */
function skyAt(theta) {
  let r = 0, g = 0, b = 0;
  for (const s of SAMPLES) {
    // The primary admits light only INSIDE it; the secondary only OUTSIDE.
    const i = caustic(s.t1 - theta) + 0.4 * caustic(theta - s.t2);
    r += s.rgb[0] * i;
    g += s.rgb[1] * i;
    b += s.rgb[2] * i;
  }
  // Every wavelength whose caustic lies outside this angle contributes its
  // tail here, so the interior of the primary is lit by the whole spectrum at
  // once. That is why it reads as white rather than as a colour, and why the
  // sum has to be tone-mapped rather than clipped: otherwise the bow drowns
  // in its own inside.
  const tone = (v) => Math.pow(1 - Math.exp(-0.22 * v), 1 / 1.12);
  const c = [tone(r), tone(g), tone(b)];
  // A spectrally integrated bow really is pale: at any one angle a wide band
  // of wavelengths is near enough its own caustic to contribute, and their
  // sum washes towards white. CHROMA_LIFT pushes each pixel away from its own
  // luminance so the spectral order can be read. It is a rendering choice and
  // is stated as one -- it moves no angle, only how saturated the ink is.
  const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return c.map((v) => Math.min(1, Math.max(0, lum + CHROMA_LIFT * (v - lum))));
}

const BOWS = {
  p_red: bowAngle(nWater(680), 1),
  p_violet: bowAngle(nWater(410), 1),
  s_red: bowAngle(nWater(680), 2),
  s_violet: bowAngle(nWater(410), 2),
};

// ---------------------------------------------------------------------------
// Furniture: headings, keys and captions. All of it reserved before any field
// is rastered, so the raster routes around it instead of colliding with it.
// ---------------------------------------------------------------------------

label(140, 44, W - 280, wide("F O R T Y - T W O   D E G R E E S"), 12, INK.eyebrow, { claim: false });

label(64, 116, 470, wide("A  ·  one drop"), 15, INK.head, { id: "hdr-a", align: "start" });
label(812, 116, 470, wide("B  ·  why forty-two"), 15, INK.head, { id: "hdr-b", align: "start" });
label(64, 672, 470, wide("C  ·  the sky"), 15, INK.head, { id: "hdr-c", align: "start" });

label(470, 150, 214,
  "Snell's law at entry and exit,\n" +
  "one reflection between. Each\n" +
  "angle mark is an arc about the\n" +
  "point it turns on, and prints\n" +
  "the value it actually sweeps.",
  11.5, INK.faint, { align: "start" });

// Panel B axis captions. The vertical one turns its box as well as its glyphs,
// so its oriented bounding box is derived rather than guessed, and it collides
// like anything else.
label(PB.x, 616, PB.w, "impact parameter   b / R", 12, INK.faint);
label(627, 388, 170, "total deviation   D", 12, INK.faint,
  { rotation: -90, rotateBox: true, height: 20 });

// Why the minimum matters. Placed in the empty wedge under the descending
// branch, where neither curve goes.
label(824, 490, 198,
  "D is stationary at the minimum.\n" +
  "A flat function sends a whole band\n" +
  "of impact parameters out at nearly\n" +
  "one angle, and that pile-up is the bow.",
  11.5, INK.body, { align: "start" });

// Legend. These two swatches are what claims the colours must be told apart,
// so the categorical check has something real to compare.
rect(PB.x, 652, 26, 9, RED, { categoryGroup: "dispersion", radius: 1 });
reserve(PB.x, 652, 26, 9);
label(PB.x + 34, 648, 110, CURVES[0].name, 11.5, INK.faint, { align: "start" });
rect(PB.x + 154, 652, 26, 9, VIOLET, { categoryGroup: "dispersion", radius: 1 });
reserve(PB.x + 154, 652, 26, 9);
label(PB.x + 188, 648, 120, CURVES[1].name, 11.5, INK.faint, { align: "start" });

// A gradient: the continuum the two sampled curves are cut from.
rect(PB.x, 682, PB.w, 12, {
  kind: "linear",
  angle: 90,
  stops: Array.from({ length: 13 }, (_, i) => {
    const nm = 400 + (i * 300) / 12;
    const [r, g, b] = spectralRGB(nm);
    return { offset: i / 12, color: `#${hex2(r)}${hex2(g)}${hex2(b)}` };
  }),
}, { radius: 2 });
reserve(PB.x, 682, PB.w, 12);
label(PB.x, 698, 120, "400 nm", 10.5, INK.faint, { align: "start" });
label(PB.x + PB.w - 120, 698, 120, "700 nm", 10.5, INK.faint, { align: "end" });

// Panel C key, in the empty corner beyond the outermost bow.
label(64, 700, 300,
  `primary   ${BOWS.p_violet.toFixed(1)}° violet → ${BOWS.p_red.toFixed(1)}° red`,
  11.5, INK.faint, { align: "start", claim: false });
label(378, 700, 330,
  `secondary   ${BOWS.s_red.toFixed(1)}° red → ${BOWS.s_violet.toFixed(1)}° violet`,
  11.5, INK.faint, { align: "start", claim: false });

// The dark band names itself, from inside the gap it describes.
label(520, 822, 280,
  wide("A L E X A N D E R ' S   D A R K   B A N D") + "\n" +
  `${BOWS.p_red.toFixed(1)}°  to  ${BOWS.s_red.toFixed(1)}°`,
  11.5, "#A2A7D2");

// ---------------------------------------------------------------------------
// Now the fields.
// ---------------------------------------------------------------------------

// The minima first, so the curves make room for their own markers.
const MINIMA = CURVES.map((curve) => {
  const ti = rainbowIncidence(curve.n, 1);
  const D = deviation(ti, curve.n, 1);
  const px = PB.x + Math.sin(ti) * xUnit;
  const py = PB.y + PB.h - (D - DEV_LO) * yUnit;
  reserve(px - 6, py - 6, 12, 12, 1);
  return { ...curve, px, py };
});

// Panel B: the two deviation curves. Marks are snapped ONTO the lattice, not
// merely deduplicated by it -- two points in adjacent cells are otherwise
// free to sit arbitrarily close across the shared boundary.
const LP = 4.2;
const devLattice = new Lattice(LP);
for (const curve of CURVES) {
  for (let s = 0; s <= 8000; s += 1) {
    const bOverR = s / 8000;
    const D = deviation(Math.asin(Math.min(1, bOverR)), curve.n, 1);
    if (D < DEV_LO || D > DEV_HI) continue;
    const px = Math.round((PB.x + bOverR * xUnit) / LP) * LP;
    const py = Math.round((PB.y + PB.h - (D - DEV_LO) * yUnit) / LP) * LP;
    if (px < PB.x || px > PB.x + PB.w || py < PB.y || py > PB.y + PB.h) continue;
    if (isReserved(px, py, 2.2)) continue;
    if (!devLattice.add(px, py)) continue;
    kids.push({
      type: "block", id: nid("p"), frame: "dev", anchor: "center",
      x: (px - PB.x) / xUnit,
      y: DEV_LO + (PB.y + PB.h - py) / yUnit,
      width: 3.8, height: 3.8, shape: "circle",
      fill: curve.colour, stroke: "transparent", strokeWidth: 0, padding: 0,
    });
  }
}

for (const m of MINIMA) {
  disc(m.px, m.py, 12, BG);
  disc(m.px, m.py, 6.6, m.colour);
}

// Panel C: the sky itself.
let grains = 0;
for (let x = PC.x; x <= PC.x2; x += PITCH) {
  for (let y = PC.y; y <= PC.y2; y += PITCH) {
    const theta = Math.hypot(x - SKY.x, y - SKY.y) / SCALE;
    if (theta < 24 || theta > 58) continue;
    if (isReserved(x, y, DOT / 2)) continue;
    const [r, g, b] = skyAt(theta);
    const lum = 0.29 * r + 0.6 * g + 0.11 * b;
    const d = DOT * Math.pow(Math.min(1, lum), 0.4);
    if (d < 1.15) continue;
    disc(x, y, d, `#${hex2(r)}${hex2(g)}${hex2(b)}`);
    grains += 1;
  }
}

// ---------------------------------------------------------------------------
// The poster frame.
// ---------------------------------------------------------------------------

const TEXT_TOP = 1290;
label(100, TEXT_TOP, W - 200, "Forty-Two Degrees", 42, INK.title, { claim: false });
rect(W / 2 - 60, TEXT_TOP + 84, 120, 1, INK.rule);
label(110, TEXT_TOP + 110, W - 220,
  "A rainbow has no location. It is the one angle at which a sphere of water hands sunlight back to you,\n" +
  "and every drop standing at that angle from your own shadow contributes — which is why it moves when\n" +
  "you do, and why no two people have ever seen the same one.",
  13.5, INK.body, { claim: false });
label(110, TEXT_TOP + 110 + 3 * lineHeight(13.5) + 12, W - 220,
  `n(λ) = 1.325087 + 2946/λ²  ·  ${grains.toLocaleString("en")} grains of sky on a ${PITCH} px lattice  ·  ` +
  `every angle derived from n, none typed  ·  chroma lifted ${CHROMA_LIFT}× for legibility`,
  11.5, INK.faint, { claim: false });

const spec = {
  version: 1,
  title: "Forty-Two Degrees",
  canvas: {
    padding: 0,
    background: BG,
    theme: "dark",
    vignette: 0.34,
    // The only relaxation asked for: an angle mark IS a curved connector.
    constraints: { allowCurvedConnectors: true },
  },
  layoutConstraints: [
    { kind: "align", elements: ["hdr-a", "hdr-b"], axis: "top" },
    { kind: "keepClear", element1: "hdr-a", element2: "hdr-c", minDistance: 400 },
  ],
  root: {
    type: "scene",
    layout: "absolute",
    width: W,
    height: H,
    frames,
    marks,
    connectors,
    children: kids,
  },
};

writeFileSync("out/rainbow.json", JSON.stringify(spec, null, 2));
console.log(`wrote out/rainbow.json -- ${kids.length} blocks, ${grains} sky grains`);
console.log(
  `  panel A: ti ${thI.toFixed(2)}°  tr ${thR.toFixed(2)}°  bow ${BOW_A.toFixed(2)}°\n` +
  `  primary ${BOWS.p_violet.toFixed(2)}–${BOWS.p_red.toFixed(2)}°  ` +
  `secondary ${BOWS.s_red.toFixed(2)}–${BOWS.s_violet.toFixed(2)}°`,
);
