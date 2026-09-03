/*
 * Charles Joseph Minard, "Carte Figurative des pertes successives en hommes
 * de l'Armee Francaise dans la campagne de Russie 1812-1813" (Paris, 1869),
 * redrawn from the lithograph.
 *
 * The data is Minard's own, not a trace: army positions and strengths, the
 * cities, and the Reaumur temperatures of the retreat, as published and as
 * distributed today in the stdlib-js/datasets-minard-napoleons-march tables.
 * Every ribbon width here is a headcount times one scale, every position is a
 * longitude and a latitude put through one projection, and the scale bar's
 * length is computed from a lieue commune (4.4448 km) rather than drawn to
 * look about right.
 *
 * Two things are deliberately not Minard's:
 *   - The rivers are schematic. He drew the Niemen, the Berezina and the
 *     Moskowa from survey; there is no river geometry in the dataset, so
 *     these are short wiggles at the right longitudes and nothing more.
 *   - Each division's advance table stops one point short of where its
 *     retreat table begins. The gap is closed by carrying the advance's last
 *     strength to the retreat's first position, which is what makes the loop
 *     at Moscow, at Polotzk and at the northern spike close at all.
 *
 *   node experiments/recreations/minard.mjs
 */
import { Sheet, rad } from "./lib.mjs";

const W = 1880;
const H = 1020;

const PAPER = "#F7F2E5";
const INK = "#2A2620";
const TAN = "#E9CFA9";
const BLACK = "#171512";

// lon, lat, size, direction, division
const ARMY = [
  [24.0, 54.9, 340000, "A", 1], [24.5, 55.0, 340000, "A", 1], [25.5, 54.5, 340000, "A", 1],
  [26.0, 54.7, 320000, "A", 1], [27.0, 54.8, 300000, "A", 1], [28.0, 54.9, 280000, "A", 1],
  [28.5, 55.0, 240000, "A", 1], [29.0, 55.1, 210000, "A", 1], [30.0, 55.2, 180000, "A", 1],
  [30.3, 55.3, 175000, "A", 1], [32.0, 54.8, 145000, "A", 1], [33.2, 54.9, 140000, "A", 1],
  [34.4, 55.5, 127100, "A", 1], [35.5, 55.4, 100000, "A", 1], [36.0, 55.5, 100000, "A", 1],
  [37.6, 55.8, 100000, "R", 1], [37.5, 55.7, 98000, "R", 1], [37.0, 55.0, 97000, "R", 1],
  [36.8, 55.0, 96000, "R", 1], [35.4, 55.3, 87000, "R", 1], [34.3, 55.2, 55000, "R", 1],
  [33.3, 54.8, 37000, "R", 1], [32.0, 54.6, 24000, "R", 1], [30.4, 54.4, 20000, "R", 1],
  [29.2, 54.4, 20000, "R", 1], [28.5, 54.3, 20000, "R", 1], [28.3, 54.4, 20000, "R", 1],
  [24.0, 55.1, 60000, "A", 2], [24.5, 55.2, 60000, "A", 2], [25.5, 54.7, 60000, "A", 2],
  [26.6, 55.7, 40000, "A", 2], [27.4, 55.6, 33000, "A", 2],
  [28.7, 55.5, 30000, "R", 2], [29.2, 54.3, 30000, "R", 2], [28.5, 54.2, 30000, "R", 2],
  [28.3, 54.3, 28000, "R", 2], [27.5, 54.5, 20000, "R", 2], [26.8, 54.3, 12000, "R", 2],
  [26.4, 54.4, 14000, "R", 2], [24.6, 54.5, 8000, "R", 2], [24.4, 54.4, 4000, "R", 2],
  [24.2, 54.4, 4000, "R", 2], [24.1, 54.3, 4000, "R", 2],
  [24.0, 55.2, 22000, "A", 3], [24.5, 55.3, 22000, "A", 3],
  [24.6, 55.8, 6000, "R", 3], [24.2, 54.4, 6000, "R", 3], [24.1, 54.3, 6000, "R", 3],
];

const CITIES = [
  [24.0, 55.0, "Kowno"], [25.3, 54.7, "Wilna"], [26.4, 54.4, "Smorgoni"],
  [26.8, 54.3, "Molodexno"], [27.7, 55.2, "Gloubokoe"], [27.6, 53.9, "Minsk"],
  [28.5, 54.3, "Studienska"], [28.7, 55.5, "Polotzk"], [29.2, 54.4, "Bobr"],
  [30.2, 55.3, "Witebsk"], [30.4, 54.5, "Orscha"], [30.4, 53.9, "Mohilow"],
  [32.0, 54.8, "Smolensk"], [33.2, 54.9, "Dorogobouge"], [34.3, 55.2, "Wixma"],
  [34.4, 55.5, "Chjat"], [36.0, 55.5, "Mojaisk"], [37.6, 55.8, "Moscou"],
  [36.6, 55.3, "Tarantino"], [36.5, 55.0, "Malo-Jarosewli"],
];

// lon, size, division -- the headcounts Minard wrote across the zones.
const COUNTS = [
  [24.0, 54.9, 422000, 1], [30.3, 55.3, 175000, 1], [32.0, 54.8, 145000, 1],
  [34.4, 55.5, 127100, 1], [35.5, 55.4, 100000, 1], [37.7, 55.7, 100000, 1],
  [36.8, 55.0, 96000, 1], [35.4, 55.3, 87000, 1], [34.3, 55.2, 55000, 1],
  [33.3, 54.8, 37000, 1], [32.0, 54.6, 24000, 1], [30.4, 54.4, 20000, 1],
  [29.2, 54.3, 50000, 1], [28.5, 54.2, 28000, 1], [26.8, 54.3, 12000, 1],
  [25.0, 54.4, 8000, 1], [24.4, 54.4, 4000, 1], [24.1, 54.4, 10000, 1],
  [26.6, 55.7, 60000, 2], [28.7, 55.5, 33000, 2],
  [24.5, 55.3, 22000, 3], [24.6, 55.8, 6000, 3],
];

// lon, degrees Reaumur below zero, date -- and how Minard set the date.
const TEMPS = [
  [37.6, 0, "Zéro le 18 8ᵇʳᵉ"],
  [36.0, 0, "Pluie 24 8ᵇʳᵉ"],
  [33.2, -9, "− 9° le 9 9ᵇʳᵉ"],
  [32.0, -21, "−21° le 14 9ᵇʳᵉ"],
  [29.2, -11, "−11° le 24 9ᵇʳᵉ"],
  [28.5, -20, "−20° le 28 9ᵇʳᵉ"],
  [27.2, -24, "−24° le 1ᵉʳ Xᵇʳᵉ"],
  [26.7, -30, "−30° le 6 Xᵇʳᵉ"],
  [25.3, -26, "−26° le 7 X."],
];

// --------------------------------------------------------------------------
// The projection. Plate carree with the longitude degree shortened by the
// latitude, which is what keeps Russia the right shape at 55 degrees north.
// --------------------------------------------------------------------------
const LON0 = 23.6;
const LAT0 = 53.82;
const SX = 120.8;
const SY = SX / Math.cos(rad(55));
const X = (lon) => 62 + (lon - LON0) * SX;
const Y = (lat) => 665 - (lat - LAT0) * SY;

/** One millimetre of Minard's plate is ten thousand men; here it is this. */
const PER_MAN = 94 / 340000;
const thickness = (size) => Math.max(1.6, size * PER_MAN);

const s = new Sheet({
  width: W,
  height: H,
  background: PAPER,
  title: "Carte Figurative des pertes successives en hommes de l'Armée Française (Minard, 1869) - redrawn",
});

const SERIF = "Palatino Linotype, Book Antiqua, Georgia, Times New Roman, serif";

// --------------------------------------------------------------------------
// Collision bookkeeping. Everything that carries text registers its box, and
// a label that would land on one already taken steps along its own escape
// direction until it is clear -- so a crowded stretch of the retreat spreads
// its numbers out instead of stacking them.
// --------------------------------------------------------------------------
const taken = [];
const est = (text, size, tracking) => Math.ceil(text.length * (size * 0.55 + tracking) + 8);
function aabb(cx, cy, w, h, deg = 0) {
  const c = Math.abs(Math.cos(rad(deg)));
  const sn = Math.abs(Math.sin(rad(deg)));
  return { x: cx, y: cy, hw: (w * c + h * sn) / 2, hh: (w * sn + h * c) / 2 };
}
const clash = (a, b, pad) =>
  Math.abs(a.x - b.x) < a.hw + b.hw + pad && Math.abs(a.y - b.y) < a.hh + b.hh + pad;

/** Boxes standing in for the ribbons, so no label is set on top of one. */
const bands = [];
/** Regions no label may wander into at all. */
const reserved = [];

/**
 * Every `placeLabel` call queued here rather than resolved on the spot.
 *
 * The city names are placed early in the file; the temperature panel's tie
 * lines and the rivers are drawn much later. A search run at CALL time sees
 * only the ink that already existed, so a city name that happened to sit
 * where a tie line would later fall found nothing to dodge and kept its
 * original spot -- which is exactly how "Kowno" ended up sitting on a river
 * eleven functions further down the script. Resolving every call once, after
 * the whole plate has been drawn, is what makes the search see the ink that
 * is actually there regardless of drawing order.
 */
const pendingLabels = [];

/**
 * Walk a label out along each escape direction and take the first spot clear
 * of everything already on the plate. Trying several directions is what lets
 * a count sit under its zone where there is no room above it -- which is what
 * Minard did at Kowno, where five numbers share one inch of paper.
 *
 * When nothing is clear, it settles for the least bad spot rather than giving
 * up where it started: a label that cannot be placed perfectly should still
 * be placed as well as the plate allows, and the checks will say so either way.
 */
function placeLabel(text, x, y, dirs, o = {}) {
  pendingLabels.push({ text, x, y, dirs: Array.isArray(dirs) ? dirs : [dirs], o });
}

function resolvePlacement({ text, x, y, dirs, o }) {
  const size = o.size ?? 11;
  const tracking = o.tracking ?? 0.2;
  // A rotated label keeps an UPRIGHT box, so the box has to be the rotated
  // text's own bounding rectangle: big enough that `text-fits-box` sees the
  // turned line inside it, and honest enough that the collision test -- which
  // is exact for an upright box and only approximate for a turned one -- is
  // reasoning about the ink that is actually there.
  const turned = aabb(0, 0, o.width ?? est(text, size, tracking), size * 1.45 + 4, o.rotation ?? 0);
  const w = Math.ceil(turned.hw * 2);
  const h = Math.ceil(turned.hh * 2);
  const soft = [...taken, ...(o.dodgeBands === false ? [] : bands)];
  const hard = o.dodgeReserved === false ? [] : reserved;
  const routes = dirs;
  let best = null;
  outer: for (const dir of routes) {
    for (let step = 0; step <= 34; step += 1) {
      const px = x + dir.x * 5 * step;
      const py = y + dir.y * 5 * step;
      const box = aabb(px, py, w, h, 0);
      // The canvas edge and a reserved region are refusals, not penalties: a
      // count is never allowed into the heading block or the temperature
      // table, however crowded its own neighbourhood is.
      if (px - box.hw < 34 || px + box.hw > W - 34 || py - box.hh < 14 || py + box.hh > H - 14) break;
      if (hard.some((r) => clash(box, r, 0))) continue;
      // A river or a tie line is ink exactly like a box is a box, and nothing
      // else on this plate ever checked a label against it. `s.inkThrough`
      // reads the same segments `text-clear-of-ink` measures on the finished
      // figure, so a spot this loop calls clear is one the real check agrees
      // with -- weighted below a box collision, since a hairline crossing a
      // caption's corner is a smaller defect than a caption sitting on
      // another caption.
      const boxScore = soft.filter((t) => clash(box, t, 3)).length;
      const lineScore = o.avoidInk === false ? 0 : Math.min(s.inkThrough(box, 2, o.annotates), 4);
      const score = boxScore * 3 + lineScore;
      if (best === null || score < best.score) best = { x: px, y: py, score };
      if (score === 0) break outer;
    }
  }
  const at = best ?? { x, y };
  label(text, at.x, at.y, { ...o, width: w, height: h });
}

/** Resolve every queued `placeLabel` call. See `pendingLabels` for why. */
function flushLabels() {
  for (const item of pendingLabels) resolvePlacement(item);
  pendingLabels.length = 0;
}

let tid = 0;
function label(text, x, y, o = {}) {
  const { size = 11, width = 120, height = 15, align = "center", rotation, weight = 400, tracking = 0.2, colour = INK, italic } = o;
  tid += 1;
  s.children.push({
    type: "block",
    id: `t${tid}`,
    label: text,
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
    // Without `rotateBox` the glyphs turn about the TEXT's own centre, so the
    // line has to sit in the middle of its box or the turned ink swings out
    // through the top of it.
    verticalAlign: "center",
    textColor: colour,
    fontFamily: italic ? `${SERIF}; font-style: italic` : SERIF,
    fontSize: size,
    fontWeight: weight,
    letterSpacing: tracking,
    // `rotation` turns the glyphs; `rotateBox` would turn the box with them,
    // and is deliberately NOT set. A rotated box makes `overlapsBox` back-rotate
    // every other label's rect into this box's frame and re-bound it, which for
    // a page-wide title against a 62-degree count is generous by a factor of
    // thirty and reports a collision three hundred pixels away. Placement here
    // still reasons about the ROTATED extent, so the drawing is spaced as if the
    // box had turned; only the check sees the upright one, exactly.
    ...(rotation === undefined ? {} : { rotation }),
  });
  // Every label is an obstacle for every later label, headings included --
  // otherwise a count pushed clear of its neighbours lands on the title.
  taken.push(aabb(x, y, width, height, rotation ?? 0));
}

// --------------------------------------------------------------------------
// Headings.
// --------------------------------------------------------------------------
label(
  "Carte Figurative des pertes successives en hommes de l'Armée Française dans la campagne de Russie 1812-1813.",
  830, 26, { size: 22, width: 1180, height: 30, weight: 500 },
);
label("Dressée par M. Minard, Inspecteur Général des Ponts et Chaussées en retraite.", 780, 54, {
  size: 16, width: 700, height: 22,
});
label("Paris, le 20 Novembre 1869.", 1560, 54, { size: 16, width: 280, height: 22 });

const PARA = [
  "Les nombres d'hommes présents sont représentés par les largeurs des zones colorées à raison d'un millimètre pour dix mille hommes ; ils sont de plus écrits en travers",
  "des zônes. Le rouge désigne les hommes qui entrent en Russie, le noir ceux qui en sortent. — Les renseignements qui ont servi à dresser la carte ont été puisés",
  "dans les ouvrages de M.M. Thiers, de Ségur, de Fezensac, de Chambray et le journal inédit de Jacob, pharmacien de l'Armée depuis le 28 Octobre.",
  "Pour mieux faire juger à l'œil la diminution de l'armée, j'ai supposé que les corps du Prince Jérôme et du Maréchal Davoust qui avaient été détachés sur Minsk",
  "et Mobilow et ont rejoint vers Orscha et Witebsk, avaient toujours marché avec l'armée.",
].join("\n");
label(PARA, 770, 124, { size: 12.5, width: 1250, height: 92, align: "start" });

/** A region no label may wander into. The temperature table owns the foot of
 * the plate, and a headcount pushed clear of its neighbours must not solve
 * its problem by moving house. */
const reserve = (x, y, w, h) => reserved.push({ x, y, hw: w / 2, hh: h / 2 });
reserve(W / 2, (700 + H) / 2, W, H - 700);
reserve(770, 100, 1290, 180);

// --------------------------------------------------------------------------
// A ribbon whose width steps at each vertex, the way Minard drew it: constant
// through a leg, notched where the count changes. Offsetting perpendicular to
// each leg rather than straight up keeps the width honest where the route
// turns hard, which it does at Polotzk.
// --------------------------------------------------------------------------
function ribbon(pts, fill) {
  if (pts.length < 2) return;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const u = { x: dx / L, y: dy / L };
    const n = { x: -u.y, y: u.x };
    const half = a.w / 2;
    // Each leg is its own quad, run a little past the joint at both ends so
    // consecutive legs OVERLAP rather than meet. One continuous outline was
    // the first attempt and it ties itself in a bow at every sharp turn --
    // the route doubles back hard at Polotzk and again at the Berezina, and a
    // mitred outline crosses itself there. Overlapping quads cannot: the union
    // of two convex pieces is the shape, whatever angle they meet at.
    const back = i === 0 ? 0 : half;
    const fwd = i === pts.length - 2 ? 0 : Math.max(half, b.w / 2);
    const A = { x: a.x - u.x * back, y: a.y - u.y * back };
    const B = { x: b.x + u.x * fwd, y: b.y + u.y * fwd };
    const corners = [
      { x: A.x + n.x * half, y: A.y + n.y * half },
      { x: B.x + n.x * half, y: B.y + n.y * half },
      { x: B.x - n.x * half, y: B.y - n.y * half },
      { x: A.x - n.x * half, y: A.y - n.y * half },
    ];
    s.push({
      id: s.id("leg"),
      from: corners[0],
      segments: corners.slice(1).map((p) => ({ line: p })),
      close: true,
      fill,
      stroke: "none",
      strokeWidth: 0,
    });
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    bands.push({
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
      hw: (Math.max(...xs) - Math.min(...xs)) / 2,
      hh: (Math.max(...ys) - Math.min(...ys)) / 2,
    });
  }
}

/** One division's advance and retreat, with the join that closes the loop. */
function division(n) {
  const rows = ARMY.filter((r) => r[4] === n);
  const adv = rows.filter((r) => r[3] === "A");
  const ret = rows.filter((r) => r[3] === "R");
  const toPt = ([lon, lat, size]) => ({ x: X(lon), y: Y(lat), w: thickness(size) });
  const advance = adv.map(toPt);
  if (ret.length > 0 && adv.length > 0) {
    // Carry the last advance strength to where the retreat starts.
    advance.push({ x: X(ret[0][0]), y: Y(ret[0][1]), w: thickness(adv[adv.length - 1][2]) });
  }
  return { advance, retreat: ret.map(toPt) };
}

const DIVS = [1, 2, 3].map(division);
DIVS.forEach((d) => ribbon(d.advance, TAN));
DIVS.forEach((d) => ribbon(d.retreat, BLACK));

// --------------------------------------------------------------------------
// Rivers -- schematic, see the header. Drawn under nothing and over nothing
// that matters, which is the status they have in the argument too.
// --------------------------------------------------------------------------
function river(lon, latTop, latBot, amp, name) {
  const pts = [];
  const steps = 26;
  for (let i = 0; i <= steps; i += 1) {
    const lat = latTop + ((latBot - latTop) * i) / steps;
    pts.push({ x: X(lon) + Math.sin(i * 0.9) * amp + Math.sin(i * 0.31) * amp * 1.6, y: Y(lat) });
  }
  s.poly(pts, { stroke: "#8C8577", width: 1.1 });
  placeLabel(name, X(lon) + 26, Y(latTop) - 10, [{ x: 0, y: -1 }, { x: 1, y: 0 }], {
    size: 9.5, height: 13, colour: "#6E6759", italic: true,
  });
}
river(24.05, 55.35, 53.95, 4, "Niémen");
river(28.42, 55.05, 53.95, 3.5, "Bérézina");
river(36.2, 55.95, 55.35, 3.5, "Moskowa");

// --------------------------------------------------------------------------
// Cities, then the headcounts written across the zones.
// --------------------------------------------------------------------------
CITIES.forEach(([lon, lat, name]) => {
  const x = X(lon);
  const y = Y(lat);
  s.seg(x, y - 4, x, y + 4, { stroke: "#5A5346", width: 0.9 });
  placeLabel(name, x + 4, y + 18, [
    { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 0.7, y: 0.7 }, { x: -0.7, y: 0.7 },
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0.7, y: -0.7 }, { x: -0.7, y: -0.7 },
  ], {
    size: 12.5, height: 16, italic: true,
  });
});

const french = (n) => n.toLocaleString("fr-FR").replace(/ | /g, ".");
COUNTS.forEach(([lon, lat, size]) => {
  const x = X(lon);
  const y = Y(lat);
  const t = thickness(size);
  // Above the band, on the diagonal Minard set them at, stepping further out
  // if that spot is already spoken for.
  placeLabel(french(size), x + 10, y - t / 2 - 26, [
    { x: 0.34, y: -0.94 }, { x: -0.34, y: 0.94 }, { x: 0.94, y: -0.34 },
    { x: -0.94, y: 0.34 }, { x: 0.71, y: 0.71 }, { x: -0.71, y: -0.71 },
    { x: 0, y: 1 }, { x: 0, y: -1 },
  ], { size: 9.5, height: 12, rotation: -62, tracking: 0.3 });
});

// --------------------------------------------------------------------------
// The scale, in the unit Minard used. 50 lieues communes is a real distance,
// so its length on the plate is arithmetic, not a guess.
// --------------------------------------------------------------------------
{
  const KM_PER_LIEUE = 4.4448;
  const kmPerDegLon = 111.32 * Math.cos(rad(55));
  const pxPerLieue = (KM_PER_LIEUE / kmPerDegLon) * SX;
  const x0 = 1380;
  const y0 = 660;
  // Not centred over the ruler: the readings at 36.0deg and 37.6deg (this
  // corner of the map is where the retreat's temperature record is densest)
  // land two tie lines inside the ruler's own span, and the caption's full
  // width has nowhere to sit above it that clears both. It fits, whole, in
  // the one gap this stretch of the corridor actually has -- between the
  // 33.2deg and 36.0deg readings -- so it sits there instead, still reading
  // as the ruler's caption because nothing else stands between them.
  placeLabel("Lieues communes de France", (X(33.2) + X(36.0)) / 2, y0 - 20,
    [{ x: 0, y: -1 }, { x: 0, y: 1 }], { size: 10, width: 180, height: 14, italic: true });
  s.seg(x0, y0, x0 + 50 * pxPerLieue, y0, { stroke: INK, width: 1 });
  [0, 5, 10, 15, 20, 25, 50].forEach((l) => {
    const x = x0 + l * pxPerLieue;
    s.seg(x, y0 - 5, x, y0 + 5, { stroke: INK, width: 1 });
    label(String(l), x, y0 + 14, { size: 9.5, width: 26, height: 12 });
  });
}

// --------------------------------------------------------------------------
// The temperature table, and the lines that tie a reading to the place on the
// retreat where it was taken. Those lines are the whole reason the two halves
// of the plate are one figure and not two.
// --------------------------------------------------------------------------
const TEMP_ZERO = 772;
const TEMP_PX = 5; // px per degree Reaumur
const T = (deg) => TEMP_ZERO - deg * TEMP_PX;

s.seg(40, 700, 1840, 700, { stroke: INK, width: 1 });
label("TABLEAU GRAPHIQUE de la température en degrés du thermomètre de Réaumur au dessous de zéro.", 830, 726, {
  size: 15, width: 900, height: 22, tracking: 0.6,
});

// Where the retreat was, at each longitude a reading was taken.
const RETREAT1 = ARMY.filter((r) => r[4] === 1 && r[3] === "R");
function retreatY(lon) {
  for (let i = 0; i < RETREAT1.length - 1; i += 1) {
    const [la] = [RETREAT1[i][0]];
    const lb = RETREAT1[i + 1][0];
    const lo = Math.min(la, lb);
    const hi = Math.max(la, lb);
    if (lon <= hi && lon >= lo) {
      const k = (lon - la) / (lb - la || 1);
      return Y(RETREAT1[i][1] + (RETREAT1[i + 1][1] - RETREAT1[i][1]) * k);
    }
  }
  return Y(54.4);
}

const curve = TEMPS.map(([lon, deg]) => ({ x: X(lon), y: T(deg) }));
// The table's own title sits in a fixed band astride y=726, between the rule
// at y=700 and the ladder of readings below -- exactly where a tie line
// heading from the retreat down to its reading has to pass. A tie line
// yields to a label sitting across its path the same way a grid line yields
// to its own tick label: it stops short and picks up again on the far side,
// rather than running straight through ink that is not its to cross.
const TITLE_GAP = [706, 746];
/** Draw a vertical run from `a` to `b`, leaving out whatever falls in `gap`. */
function verticalMinusGap(x, a, b, gap, o) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const before = [lo, Math.min(hi, gap[0])];
  const after = [Math.max(lo, gap[1]), hi];
  if (before[1] > before[0]) s.seg(x, before[0], x, before[1], o);
  if (after[1] > after[0]) s.seg(x, after[0], x, after[1], o);
}
TEMPS.forEach(([lon, deg], i) => {
  const x = X(lon);
  verticalMinusGap(x, retreatY(lon), T(deg), TITLE_GAP, { stroke: "#9A9384", width: 0.7 });
  placeLabel(TEMPS[i][2], x, T(deg) + 30, [{ x: 0, y: 1 }, { x: 0, y: -1 }], {
    size: 11, height: 14, dodgeBands: false, dodgeReserved: false,
  });
});
s.poly(curve, { stroke: INK, width: 1.4 });

// Hatching under the trace, as on the plate.
for (let i = 0; i < curve.length - 1; i += 1) {
  const a = curve[i];
  const b = curve[i + 1];
  for (let x = Math.min(a.x, b.x); x < Math.max(a.x, b.x); x += 7) {
    const k = (x - a.x) / (b.x - a.x || 1);
    const y = a.y + (b.y - a.y) * k;
    s.seg(x, y, x, y + 7, { stroke: "#6E6759", width: 0.6 });
  }
}

// The scale down the right-hand edge.
[0, 5, 10, 15, 20, 25, 30].forEach((d) => {
  label(d === 0 ? "0" : String(d), 1852, T(-d), { size: 10, width: 32, height: 13, align: "start" });
});
label("degrés", 1852, T(-30) + 18, { size: 10, width: 54, height: 13, align: "start", italic: true });
s.seg(1836, T(0), 1836, T(-30), { stroke: INK, width: 0.8 });

label("Les Cosaques passent au galop\nle Niémen gelé.", 190, 770, {
  size: 12.5, width: 260, height: 40, align: "start", italic: true,
});
s.seg(40, 978, 1840, 978, { stroke: INK, width: 1 });
label("Autog. par Regnier, 8. Pas. S.ᵗᵉ Marie S.ᵗ G.ᵃᵇʳ à Paris.", 200, 998, {
  size: 9.5, width: 340, height: 13, align: "start",
});
label("Imp. Lith. Regnier et Dourdet.", 1700, 998, { size: 9.5, width: 220, height: 13, align: "end" });

flushLabels();
const out = process.argv[2] ?? "experiments/recreations/minard.json";
s.write(out, { padding: 0, theme: "print" });
console.log(`${out}  ${s.marks.length} marks, ${s.children.length} labels`);
console.log(`  ribbon scale   1 px = ${Math.round(1 / PER_MAN)} men; 340,000 draws ${thickness(340000).toFixed(1)} px`);
console.log(`  entered 422,000, left ${french(10000)} -- ${(100 * (1 - 10000 / 422000)).toFixed(1)}% did not come back`);
