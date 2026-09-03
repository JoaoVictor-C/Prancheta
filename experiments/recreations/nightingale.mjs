/*
 * Florence Nightingale, "Diagram of the Causes of Mortality in the Army in
 * the East" (1858), redrawn from the lithograph.
 *
 * This is a polar-area diagram, and the thing that makes it worth copying is
 * the thing most redrawings get wrong: the wedges are measured BY AREA from a
 * common vertex, so the radius goes as the square root of the rate. Draw the
 * radius proportional to the rate instead and January 1855 -- the month the
 * whole argument rests on -- comes out roughly twice as alarming as
 * Nightingale drew it.
 *
 * Nothing here is a rate typed off the lithograph. The counts below are the
 * standard Crimean mortality table (army strength and deaths by cause, month
 * by month); every rate is (deaths x 12000 / strength) computed here, and
 * every radius is the square root of that against one scale shared by both
 * roses. That is why the second year's rose is small: it is drawn at the same
 * scale as the first, and the deaths really did collapse.
 *
 *   node experiments/recreations/nightingale.mjs
 */
import { Sheet, rad } from "./lib.mjs";

const W = 1500;
const H = 880;

const PAPER = "#F3ECDC";
const INK = "#2B2721";
const BLUE = { fill: "#A9C9DB", line: "#5F8399" };
const RED = { fill: "#E7C6C3", line: "#B0817C" };
const DARK = { fill: "#5F5C55", line: "#312F2A" };

// month, army strength, zymotic deaths, wounds, other
const TABLE = [
  ["April 1854", 8571, 1, 0, 5],
  ["May", 23333, 12, 0, 9],
  ["June", 28333, 11, 0, 6],
  ["July", 28772, 359, 0, 23],
  ["August", 30246, 828, 1, 30],
  ["September", 30290, 788, 81, 70],
  ["October", 30643, 503, 132, 128],
  ["November", 29736, 844, 287, 106],
  ["December", 32779, 1725, 114, 131],
  ["January 1855", 32393, 2761, 83, 324],
  ["February", 30919, 2120, 42, 361],
  ["March 1855", 30107, 1205, 32, 172],
  ["April 1855", 32252, 477, 48, 57],
  ["May", 35473, 508, 49, 37],
  ["June", 38863, 802, 209, 31],
  ["July", 42647, 382, 134, 33],
  ["August", 44614, 483, 164, 25],
  ["September", 47751, 189, 276, 20],
  ["October", 46852, 128, 53, 18],
  ["November", 37853, 178, 33, 32],
  ["December", 43217, 91, 18, 28],
  ["January 1856", 44212, 42, 2, 48],
  ["February", 43485, 24, 0, 19],
  ["March 1856", 46140, 15, 0, 35],
];

/** Annual deaths per 1000, the quantity Nightingale plotted. */
const rate = (deaths, army) => (deaths * 12000) / army;

const rows = TABLE.map(([month, army, zym, wound, other]) => ({
  month,
  zymotic: rate(zym, army),
  wounds: rate(wound, army),
  other: rate(other, army),
}));

// One scale for both roses, fixed by the worst month there was.
const peak = Math.max(...rows.map((r) => Math.max(r.zymotic, r.wounds, r.other)));
const K = 300 / Math.sqrt(peak);
const radiusOf = (r) => K * Math.sqrt(r);

const s = new Sheet({
  width: W,
  height: H,
  background: PAPER,
  title: "Diagram of the causes of mortality in the army in the East (Nightingale, 1858) - redrawn",
});

// Unquoted on purpose. A family name in double quotes is interpolated raw
// into the mirror's inline style attribute, which closes the attribute and
// throws the whole declaration away -- silently, in the wrong face. Multi-word
// names are legal CSS unquoted, so the stack is written that way.
const SERIF = "Palatino Linotype, Book Antiqua, Georgia, Times New Roman, serif";

let tid = 0;
function label(text, x, y, { size = 12, width = 150, height = 18, align = "center", rotation, weight = 400, tracking = 0.4, colour = INK } = {}) {
  tid += 1;
  s.children.push({
    type: "block",
    id: `t${tid}`,
    label: text,
    // `anchor: "center"` is resolved during FRAME resolution, so a block that
    // states no frame never sees it and x/y stay its top-left corner. These
    // labels are all placed about their middles, so the half-box comes off here.
    x: x - width / 2,
    y: y - height / 2,
    width,
    height,
    padding: 0,
    fill: "transparent",
    stroke: "transparent",
    strokeWidth: 0,
    wrap: text.includes("\n") ? "normal" : "none",
    textAlign: align,
    textColor: colour,
    fontFamily: SERIF,
    fontSize: size,
    fontWeight: weight,
    letterSpacing: tracking,
    ...(rotation === undefined ? {} : { rotation, rotateBox: true }),
  });
}

/** A 30-degree sector from the centre out to `r`, the way the original is built. */
function wedge(cx, cy, r, mid, colour) {
  if (r <= 0.5) return;
  const a0 = mid - 15;
  const a1 = mid + 15;
  s.push({
    id: s.id("w"),
    from: { x: cx, y: cy },
    segments: [
      { line: Sheet.polar(cx, cy, r, a0) },
      { arc: Sheet.polar(cx, cy, r, a1), centre: { x: cx, y: cy } },
      { line: { x: cx, y: cy } },
    ],
    close: true,
    fill: colour.fill,
    stroke: colour.line,
    strokeWidth: 1.1,
  });
}

const MONTH_SIZE = 10.5;
const MONTH_TRACK = 0.9;
/** A generous guess at a set line, so a box is never narrower than its text. */
const lineWidth = (text) => Math.ceil(text.length * (MONTH_SIZE * 0.66 + MONTH_TRACK) + 10);

/** The axis-aligned box a rotated label actually occupies. */
function aabb(cx, cy, w, h, deg) {
  const c = Math.abs(Math.cos(rad(deg)));
  const sn = Math.abs(Math.sin(rad(deg)));
  return { x: cx, y: cy, hw: (w * c + h * sn) / 2, hh: (w * sn + h * c) / 2 };
}

const hits = (a, b, pad) =>
  Math.abs(a.x - b.x) < a.hw + b.hw + pad && Math.abs(a.y - b.y) < a.hh + b.hh + pad;

/**
 * One rose: twelve months running CLOCKWISE from April at 165 degrees, which
 * is where the lithograph starts them, and the three causes superimposed from
 * the shared vertex -- largest laid down first so every boundary stays visible.
 */
function rose(cx, cy, slice, { tick, minReach }) {
  const placed = [];
  // Every wedge's outer radius, computed in one pass before any label is
  // placed. A label sitting `tick` past its OWN month's rim can still swing,
  // once rotated to run along the rim, a few degrees into the NEIGHBOURING
  // sector -- and if that neighbour's own wedge reaches further out (Bulgaria
  // sits next to Crimea, and one killed far more than the other), the label
  // lands inside a wedge it never measured itself against. Radial clearance
  // has to be figured against whichever of the three -- this month and both
  // neighbours -- reaches furthest, not just its own.
  const reach = slice.map((row) => Math.max(radiusOf(row.zymotic), radiusOf(row.wounds), radiusOf(row.other), 14));

  slice.forEach((row, i) => {
    const mid = 165 - 30 * i;
    const bands = [
      [radiusOf(row.zymotic), BLUE],
      [radiusOf(row.wounds), RED],
      [radiusOf(row.other), DARK],
    ].sort((a, b) => b[0] - a[0]);
    bands.forEach(([r, colour]) => wedge(cx, cy, r, mid, colour));

    // The spoke between this month and the next, drawn out to whichever band
    // reaches furthest, so the twelve divisions read even where a month is
    // nearly empty.
    s.poly([{ x: cx, y: cy }, Sheet.polar(cx, cy, reach[i], mid - 15)], { stroke: "#8E877A", width: 0.7 });

    // The month, set along the rim it belongs to. Three consecutive months in
    // 1854 killed almost nobody, so their rims are nearly at the centre and
    // their labels would land on top of each other -- which is why the
    // lithograph itself walks them outward. Same here, and by measurement
    // rather than by eye: each label steps out until its box is clear of
    // every box already placed.
    const text = row.month.toUpperCase();
    const w = lineWidth(text);
    let rot = -mid - 90;
    while (rot > 90) rot -= 180;
    while (rot < -90) rot += 180;

    const n = slice.length;
    const clearOfWedges = Math.max(reach[i], reach[(i + 1) % n], reach[(i + n - 1) % n]);
    let r = Math.max(clearOfWedges, minReach) + tick;
    let box;
    for (let guard = 0; guard < 60; guard += 1) {
      const at = Sheet.polar(cx, cy, r, mid);
      box = aabb(at.x, at.y, w, 15, rot);
      // A label rotated to run along the rim has an axis-aligned box LARGER
      // than the unrotated text, and that extra reach is not the same in
      // every direction -- comparing the box's CENTRE radius against the
      // wedges' own radius is what let "AUGUST" sit tick px past its wedge by
      // centre and still have a corner land back inside it. The box's own
      // NEAREST point to the rose's centre is what actually has to clear the
      // wedges' disk, whatever angle the label ends up rotated to.
      const nearX = Math.max(Math.abs(cx - box.x) - box.hw, 0);
      const nearY = Math.max(Math.abs(cy - box.y) - box.hh, 0);
      const clearOfDisk = Math.hypot(nearX, nearY) >= clearOfWedges + 3;
      if (clearOfDisk && !placed.some((p) => hits(box, p, 10))) break;
      r += 9;
    }
    placed.push(box);
    label(text, box.x, box.y, { size: MONTH_SIZE, width: w, height: 15, rotation: rot, tracking: MONTH_TRACK });
  });
}

// --------------------------------------------------------------------------
// Headings.
// --------------------------------------------------------------------------
label("DIAGRAM OF THE CAUSES OF MORTALITY", 750, 32, { size: 24, width: 560, height: 32, weight: 600, tracking: 0.6 });
label("IN THE ARMY IN THE EAST.", 750, 68, { size: 18, width: 400, height: 24, weight: 500, tracking: 1.4 });
s.seg(640, 88, 860, 88, { stroke: INK, width: 1.2 });

label("2.", 300, 30, { size: 15, width: 40, height: 20, weight: 600 });
label("APRIL 1855 to MARCH 1856.", 300, 56, { size: 13, width: 250, height: 20, weight: 500, tracking: 0.7 });
label("1.", 1205, 30, { size: 15, width: 40, height: 20, weight: 600 });
label("APRIL 1854 to MARCH 1855.", 1205, 56, { size: 13, width: 250, height: 20, weight: 500, tracking: 0.7 });

// --------------------------------------------------------------------------
// The two roses. Year one is the argument; year two is what happened after
// the Sanitary Commission arrived, at the same scale, which is the point.
// --------------------------------------------------------------------------
rose(1075, 470, rows.slice(0, 12), { tick: 26, minReach: 128 });
rose(335, 300, rows.slice(12), { tick: 22, minReach: 104 });

label("BULGARIA", 1075, 258, { size: 9.5, width: 90, height: 14, tracking: 1.2 });
label("CRIMEA", 1352, 405, { size: 9.5, width: 80, height: 14, tracking: 1.2 });

// The lithograph's leader, tying the small rose to the large one -- kept to
// the open water between them rather than run rim to rim. OCTOBER sits close
// against the small rose and APRIL 1854 close against the large one, so a
// leader reaching all the way to either rim runs straight through one of them.
s.poly([{ x: 580, y: 376 }, { x: 700, y: 405 }, { x: 812, y: 386 }], {
  stroke: "#4A453C",
  width: 1,
  lineStyle: "dashed",
});

// --------------------------------------------------------------------------
// Nightingale's own note, which is what tells the reader the areas -- not the
// radii -- are the measurement.
// --------------------------------------------------------------------------
const NOTE = [
  "The Areas of the blue, red, & black wedges are each measured from",
  "    the centre as the common vertex.",
  "The blue wedges measured from the centre of the circle represent area",
  "    for area the deaths from Preventible or Mitigable Zymotic diseases; the",
  "    red wedges measured from the centre the deaths from wounds, & the",
  "    black wedges measured from the centre the deaths from all other causes.",
  "The black line across the red triangle in Nov.ʳ 1854 marks the boundary",
  "    of the deaths from all other causes during the month.",
  "In October 1854, & April 1855, the black area coincides with the red;",
  "    in January & February 1855, the blue coincides with the black.",
  "The entire areas may be compared by following the blue, the red & the",
  "    black lines enclosing them.",
].join("\n");
label(NOTE, 372, 700, { size: 12.5, width: 520, height: 240, align: "start", tracking: 0.1 });

const out = process.argv[2] ?? "experiments/recreations/nightingale.json";
s.write(out, { padding: 0, theme: "print" });
console.log(`${out}  ${s.marks.length} marks, ${s.children.length} labels`);
console.log(`  worst month  ${rows[9].month}  ${rows[9].zymotic.toFixed(1)} zymotic deaths per 1000 per year`);
console.log(`  scale        radius = ${K.toFixed(3)} x sqrt(rate), so area is the rate`);
