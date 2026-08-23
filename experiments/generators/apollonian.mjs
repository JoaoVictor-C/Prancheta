/*
 * "EVERY ONE OF THEM IS A WHOLE NUMBER" — an integral Apollonian gasket.
 *
 * Earlier in this session I told the user that circle packings were
 * structurally impossible in this engine: two tangent circles at a diagonal
 * have partially overlapping bounding boxes, and `boxes-do-not-overlap`
 * refuses that. `canvas.constraints.allowOverlap` is what makes this exist.
 *
 * THE MATHEMATICS. Descartes' circle theorem relates the curvatures (k = 1/r,
 * negative for the enclosing circle) of four mutually tangent circles:
 *
 *     (k1 + k2 + k3 + k4)^2 = 2 (k1^2 + k2^2 + k3^2 + k4^2)
 *
 * Read as a quadratic in k4 its two roots sum to 2(k1+k2+k3), so given three
 * mutually tangent circles and one completion, the OTHER completion is
 *
 *     k4' = 2(k1 + k2 + k3) - k4
 *
 * — pure integer arithmetic. Seeded on integers, every curvature in the
 * infinite packing is an integer, by induction. The complex form gives the
 * centres in the same shape, with b = k*z:
 *
 *     b4' = 2(b1 + b2 + b3) - b4,   z4' = b4' / k4'
 *
 * So curvature stays EXACT and only position is floating point, which is why
 * `add` below can assert integrality on every circle rather than hoping.
 *
 * WHAT THE FIGURE CAN AND CANNOT SHOW. The theorem is proved by that
 * induction, not by the drawing. The picture exhibits it only for the circles
 * big enough to carry a numeral; the rest are asserted in code no reader sees.
 * The caption says exactly that.
 */
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------- geometry
const W = 1700;
const H = 1990;
const CX = 850;
const CY = 1015;
const R = 762;                    // radius of the enclosing circle, in px
const KMAX = 3000;                // curvature bound; min radius = R / KMAX
const BG = "#05060D";
const DISC = "#0B0E1C";           // the residual set, between the circles

// ---------------------------------------------------------------- palette
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

// Large circles deep and quiet, small ones luminous. Three things follow from
// that direction and none from the reverse: the fine lace is where a gasket's
// beauty lives, so it should be the bright thing; the big circles stay calm
// enough to hold sentences; and numerals on them take light ink, so the
// contrast rule and the aesthetic agree instead of fighting each other.
const curvatureRamp = ramp([
  [0.00, "#123A4E"], [0.12, "#16587A"], [0.26, "#1C86AE"],
  [0.40, "#3E82D2"], [0.54, "#7B63CE"], [0.66, "#B25AB8"],
  [0.76, "#DC5F84"], [0.85, "#F0834E"], [0.93, "#FFBB68"],
  [1.00, "#FFF3D8"],
]);

const luminance = (hex) => {
  const [r, g, b] = hx(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const INK_LIGHT = "#FFFFFF";
const INK_DARK = "#000000";
/** Margin over WCAG AA, so a rounding difference cannot fail the render. */
const AA = 4.7;
/** contrast-sufficient is not toggleable, so the ink is chosen, not guessed. */
const inkFor = (fill) =>
  contrast(INK_LIGHT, fill) >= contrast(INK_DARK, fill) ? INK_LIGHT : INK_DARK;
/** Mid-tones exist where NEITHER black nor white clears AA. Those go unlabelled. */
const inkClears = (fill) =>
  Math.max(contrast(INK_LIGHT, fill), contrast(INK_DARK, fill)) >= AA;

// ---------------------------------------------------------------- the gasket
/**
 * Generate the packing by Descartes reflection, deduped.
 *
 * The Apollonian group has relations — reflecting a circle out and back gives
 * the original, and longer words reach the same circle by different routes —
 * so a naive expansion revisits circles exponentially while the distinct count
 * grows only as about N^1.3 in the curvature bound. Without the dedupe key
 * this would stack thousands of identical blocks on one another, and
 * `allowOverlap` would let every one of them through unreported.
 */
function generate(kmax) {
  const found = new Map();
  const quads = [];
  const key = (k, x, y) => `${k}:${Math.round(x * 1e7)}:${Math.round(y * 1e7)}`;

  const add = (c) => {
    if (!Number.isInteger(c.k)) {
      throw new Error(`curvature ${c.k} is not an integer — the reflection drifted`);
    }
    const id = key(c.k, c.x, c.y);
    if (found.has(id)) return false;
    found.set(id, c);
    return true;
  };

  // The seed, checkable with a pencil: outer radius 1 at the origin; two of
  // radius 1/2 at (-1/2, 0) and (1/2, 0); one of radius 1/3 at (0, 2/3). The
  // triple (-1, 2, 2) has discriminant -2 + 4 - 2 = 0, so both its completions
  // have curvature 3 and differ only in position.
  const seed = [
    { k: -1, x: 0, y: 0 },
    { k: 2, x: -1 / 2, y: 0 },
    { k: 2, x: 1 / 2, y: 0 },
    { k: 3, x: 0, y: 2 / 3 },
  ];
  const sum = seed.reduce((s, c) => s + c.k, 0);
  const sumSq = seed.reduce((s, c) => s + c.k * c.k, 0);
  if (sum * sum !== 2 * sumSq) throw new Error("the seed does not satisfy Descartes");
  seed.forEach(add);

  const stack = [seed];
  let visited = 0;
  while (stack.length > 0 && visited < 500000) {
    const quad = stack.pop();
    visited += 1;
    for (let i = 0; i < 4; i += 1) {
      const others = quad.filter((_, j) => j !== i);
      const target = quad[i];
      const k = 2 * (others[0].k + others[1].k + others[2].k) - target.k;
      if (k <= 0 || k > kmax) continue;
      const bx = 2 * others.reduce((s, c) => s + c.k * c.x, 0) - target.k * target.x;
      const by = 2 * others.reduce((s, c) => s + c.k * c.y, 0) - target.k * target.y;
      const next = { k, x: bx / k, y: by / k };
      if (add(next)) {
        const quad = [...others, next];
        // Keep the quadruple itself, not just the circle. Four circles that
        // merely happen to have the right four curvatures are NOT mutually
        // tangent, and a figure that pointed at them would assert something
        // false while passing every check.
        quads.push(quad);
        stack.push(quad);
      }
    }
  }
  return { circles: [...found.values()], quads };
}

const { circles: all, quads } = generate(KMAX);
const tMax = Math.log(KMAX) - Math.log(2);
const shade = (k) => curvatureRamp((Math.log(k) - Math.log(2)) / tMax);

/** Everything in page pixels, largest first. */
const circles = all
  .filter((c) => c.k > 0)
  .map((c) => ({
    k: c.k,
    ux: c.x,
    uy: c.y,
    cx: CX + c.x * R,
    cy: CY + c.y * R,
    r: R / c.k,
    fill: shade(c.k),
  }))
  .filter((c) => c.r >= 0.30)
  .sort((a, b) => b.r - a.r);

// ------------------------------------------------- layout, decided before ink
const rectOf = (c) => ({ x: c.cx - c.r, y: c.cy - c.r, x2: c.cx + c.r, y2: c.cy + c.r });
const OUTER = { x: CX - R, y: CY - R, x2: CX + R, y2: CY + R };

/** Every box that already claims space, for the label collision filter. */
const boxes = [OUTER, ...circles.map(rectOf)];

const overlaps = (a, b) => a.x < b.x2 && a.x2 > b.x && a.y < b.y2 && a.y2 > b.y;
const contains = (outer, inner) =>
  outer.x <= inner.x && outer.y <= inner.y && outer.x2 >= inner.x2 && outer.y2 >= inner.y2;

/**
 * True when `ink` clears every box that does not CONTAIN `owner`.
 *
 * `text-clear-of-other-boxes` is not toggleable, and tangency does not save a
 * label from it: containment is a rectangle test, and whether a neighbour's
 * bounding square happens to swallow a given circle depends on where that
 * circle sits. So it is computed here rather than argued about.
 */
function clear(ink, owner) {
  for (const b of boxes) {
    if (b !== owner && contains(b, owner)) continue;
    if (b !== owner && overlaps(ink, b)) return false;
  }
  return true;
}

/**
 * Conservative extents of a rendered line — the estimate must not undershoot
 * the measurement. Height is the LINE box, which is the full line height and
 * not the glyph height: that is what the check unions over.
 */
const inkOf = (text, fs) => ({ w: text.length * fs * 0.66, h: fs * 1.5 });

// --- sentences inside the two largest circles -------------------------------
// The recursion fills the GAPS between circles and never their interiors, so
// the inside of a circle is permanently empty. A curvature-2 circle is half
// the gasket's radius, has one known fill, and CONTAINS anything at its
// centre — which makes text-clear-of-other-boxes skip every other circle. It
// is the safest place in the whole figure to put a sentence.
const twos = circles.filter((c) => c.k === 2).sort((a, b) => a.cx - b.cx);
const bigInk = inkFor(shade(2));
const panels = [];
if (twos.length === 2) {
  const lines = [
    [twos[0], [
      ["DESCARTES, 1643", 17, -96],
      ["(k₁ + k₂ + k₃ + k₄)²  =  2 (k₁² + k₂² + k₃² + k₄²)", 20, -52],
      ["for any four mutually tangent circles,\nwhere k is 1/radius and the circle that\nencloses them all counts as negative.", 15, 6],
    ]],
    [twos[1], [
      ["AND THEREFORE, BY INDUCTION", 17, -96],
      ["k₄′  =  2 (k₁ + k₂ + k₃) − k₄", 20, -52],
      ["The second solution is the first one\nreflected. Integers in, integers out —\nfor ever, and all the way down.", 15, 6],
    ]],
  ];
  for (const [circle, rows] of lines) {
    for (const [label, fs, dy] of rows) {
      const h = label.split("\n").length * fs * 1.45 + 3;
      const box = { x: circle.cx - 250, y: circle.cy + dy, x2: circle.cx + 250, y2: circle.cy + dy + h };
      panels.push({ label, fs, box });
      boxes.push(box);
    }
  }
}

// --- the note that names one Descartes quadruple ----------------------------
// The only annotation here that cannot be self-locating. Text inside a circle
// says what that circle is; nothing contained anywhere can say "these four
// belong to one quadruple", because the claim is about a relationship between
// four separate regions. That is what the leaders are for, and the only thing.
const NOTE_X = 92;
const NOTE_Y = 1672;
const ANCHOR_AT = { x: NOTE_X + 174, y: NOTE_Y - 30 };

/** Page geometry for a generated circle, by exact identity. */
const placed = new Map(circles.map((c) => [`${c.k}:${Math.round(c.ux * 1e7)}:${Math.round(c.uy * 1e7)}`, c]));
const locate = (u) => placed.get(`${u.k}:${Math.round(u.x * 1e7)}:${Math.round(u.y * 1e7)}`);

// Pick a real quadruple: four circles that are ACTUALLY mutually tangent
// because the generator produced them as one. Prefer a compact set of
// mid-sized circles near the note, so the four leaders stay short and do not
// have to cross the sentences set inside the big circles.
const candidates = quads
  .map((q) => q.map(locate))
  .filter((q) => q.every((c) => c !== undefined && c.k >= 3 && c.r >= 7))
  .map((q) => ({
    q,
    reach: Math.max(...q.map((c) => Math.hypot(c.cx - ANCHOR_AT.x, c.cy - ANCHOR_AT.y))),
  }))
  .sort((a, b) => a.reach - b.reach);

if (candidates.length === 0) throw new Error("no compact quadruple found near the note");
const QUAD = candidates[0].q;
console.log(`  quadruple ${QUAD.map((c) => c.k).join(", ")} at reach ${Math.round(candidates[0].reach)}px`);
const ks = QUAD.map((c) => c.k);
const kSum = ks.reduce((a, b) => a + b, 0);
const kSq = ks.reduce((a, b) => a + b * b, 0);
if (kSum * kSum !== 2 * kSq) {
  throw new Error(`(${ks}) is not a Descartes quadruple — the generator lied`);
}

const noteRows = [
  ["one quadruple, of infinitely many", 15, 0],
  [`${ks.join(", ")}  —  and ${kSum}² = 2(${ks.map((k) => k * k).join(" + ")})`, 13.5, 26],
];
for (const [label, fs, dy] of noteRows) {
  const box = { x: NOTE_X, y: NOTE_Y + dy, x2: NOTE_X + 420, y2: NOTE_Y + dy + fs * 1.45 + 3 };
  boxes.push(box);
}
const ANCHOR = ANCHOR_AT;
boxes.push({ x: ANCHOR.x - 5, y: ANCHOR.y - 5, x2: ANCHOR.x + 5, y2: ANCHOR.y + 5 });

// --- which circles carry their curvature ------------------------------------
// The numeral becomes the circle's OWN label, so the engine does the checking:
// `label-within-shape` measures it against the inscribed circle rather than
// the bounding box, and `contrast-sufficient` compares it against that
// circle's own fill instead of against the distant canvas.
let labelled = 0;
for (const c of circles) {
  if (c.k === 2) continue;                 // these two hold sentences instead
  if (c.r < 15) continue;
  if (!inkClears(c.fill)) continue;
  const label = String(c.k);
  const fs = Math.max(11, Math.min(44, c.r * 0.5));
  const ink = inkOf(label, fs);
  if (Math.hypot(ink.w / 2, ink.h / 2) > c.r * 0.78) continue;
  const box = {
    x: c.cx - ink.w / 2, y: c.cy - ink.h / 2,
    x2: c.cx + ink.w / 2, y2: c.cy + ink.h / 2,
  };
  if (!clear(box, rectOf(c))) continue;
  c.label = label;
  c.fontSize = fs;
  labelled += 1;
}

// ---------------------------------------------------------------- emission
const kids = [];
const cons = [];
let uid = 0;
const nid = (p) => `${p}${uid++}`;

function text(x, y, w, label, fs, fill, align = "start") {
  kids.push({
    type: "block", id: nid("t"), x, y, width: w,
    height: label.split("\n").length * fs * 1.45 + 3, label,
    fill: "transparent", stroke: "transparent", strokeWidth: 0,
    textColor: fill, fontSize: fs, padding: 0, textAlign: align,
  });
}

// The enclosing circle first: it is the ground the packing sits on, and what
// shows through the residual set the circles never quite cover.
kids.push({
  type: "block", id: "outer", x: CX - R, y: CY - R, width: 2 * R, height: 2 * R,
  shape: "circle", fill: DISC, stroke: "transparent", strokeWidth: 0, padding: 0,
});

for (const c of circles) {
  kids.push({
    type: "block", id: nid("c"), x: c.cx - c.r, y: c.cy - c.r,
    width: 2 * c.r, height: 2 * c.r, shape: "circle",
    fill: c.fill, stroke: "transparent", strokeWidth: 0, padding: 0,
    ...(c.label === undefined ? {} : {
      label: c.label, fontSize: c.fontSize, textColor: inkFor(c.fill),
      textAlign: "center", verticalAlign: "center",
    }),
  });
}

for (const panel of panels) {
  text(panel.box.x, panel.box.y, panel.box.x2 - panel.box.x, panel.label, panel.fs, bigInk, "center");
}

// --- the quadruple, named ---------------------------------------------------
for (const [label, fs, dy] of noteRows) {
  text(NOTE_X, NOTE_Y + dy, 420, label, fs, dy === 0 ? "#A8B4D8" : "#8290BC");
}
kids.push({
  type: "block", id: "anchor", x: ANCHOR.x - 5, y: ANCHOR.y - 5, width: 10, height: 10,
  shape: "circle", fill: "#A8B4D8", stroke: "transparent", strokeWidth: 0, padding: 0,
});

QUAD.forEach((c, i) => {
  // Bowed, not straight: a straight chord across a field of circles reads as a
  // chord OF one of them, while a curve reads as passing over.
  cons.push({
    from: "anchor", to: { x: c.cx, y: c.cy }, arrow: "none",
    stroke: "#A8B4D8", strokeWidth: 1.2,
    curve: { kind: "arc", bulge: [0.16, -0.13, 0.09, -0.20][i] ?? 0.12 },
  });
});

// --- masthead and caption, both clear of the disc ---------------------------
text(92, 70, 900, "EVERY ONE OF THEM", 44, "#EFE6CE");
text(92, 142, 900, "IS A WHOLE NUMBER", 44, "#EFE6CE");
text(92, 222, 640, "An integral Apollonian gasket, seeded (−1, 2, 2, 3).", 17, "#9CA6D0");

text(92, 1856, 700,
  "Curvature is 1/radius. Fill runs with log curvature — the largest circles deep,\n" +
  "the smallest luminous — because the lace is where the beauty is.", 14, "#8791BC");
text(860, 1856, 748,
  `${circles.length.toLocaleString("en")} circles, down to curvature ${KMAX}; ${labelled} are large enough to carry their\n` +
  "own numeral. Those labels are a sample of a proven fact, not a proof of it:\n" +
  "integrality is induction over the seed, and the code asserts it on every circle.", 14, "#8791BC");

const spec = {
  version: 1,
  title: "Every One Of Them Is A Whole Number",
  canvas: {
    padding: 0, background: BG, theme: "dark", vignette: 0.28,
    // Tangent circles have overlapping bounding boxes. The four leaders cross
    // hundreds of circles they do not join. The leaders bow rather than cut.
    constraints: {
      allowOverlap: true,
      allowConnectorCrossing: true,
      allowCurvedConnectors: true,
    },
  },
  root: { type: "scene", layout: "absolute", width: W, height: H, children: kids, connectors: cons },
};
writeFileSync("out/apollonian.json", JSON.stringify(spec));
console.log(
  `wrote out/apollonian.json -- ${circles.length} circles, ${labelled} labelled, ` +
  `${kids.length} blocks, ${cons.length} connectors`,
);
