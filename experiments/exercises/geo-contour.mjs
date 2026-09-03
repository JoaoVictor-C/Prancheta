/*
 * GEOGRAPHY 1 -- a contour map and the section drawn from it.
 *
 * The contours are traced by marching squares over an analytic height field,
 * and the A-A' profile is sampled from THE SAME FIELD. That is the whole point
 * of pairing them: a section drawn by eye beneath a traced contour map is the
 * classic way for a figure like this to be quietly wrong, because nothing
 * connects the two. Here they are two projections of one function, so the
 * profile cannot say the ridge is at 4 km while the contours put it at 5.
 *
 * Both summits are found by searching the field, not typed. Every point marked
 * on the map is marked at the same distance along the section, from one
 * parametrisation of the line. The line of sight is drawn straight from the
 * viewpoint to the far summit -- true, and therefore answering nothing that
 * the reader is not asked to work out.
 *
 *   node experiments/exercises/geo-contour.mjs
 */
import { Plate, INK, SOFT, FAINT, RULE, ASK, KEY, WARM } from "./sheet.mjs";

// ---- the ground ------------------------------------------------------------
const KMX = 10;
const KMY = 5.4;
const bump = (x, y, cx, cy, sx, sy, h) => h * Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
const height = (x, y) =>
  60 +
  bump(x, y, 2.7, 3.70, 1.75, 1.45, 400) +
  bump(x, y, 7.1, 2.00, 1.85, 1.30, 320) +
  bump(x, y, 4.9, 1.20, 2.60, 1.50, 110) -
  bump(x, y, 5.1, 3.40, 1.10, 0.90, 40);

// ---- marching squares ------------------------------------------------------
const NX = 180;
const NY = 98;
const gxk = (i) => (KMX * i) / NX;
const gyk = (j) => (KMY * j) / NY;

/** The isoline segments at one level, in kilometres. */
function isoSegments(L) {
  const out = [];
  const lerp = (pa, pb, va, vb) => {
    const t = (L - va) / (vb - va);
    return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
  };
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const c = [
        { x: gxk(i), y: gyk(j) },
        { x: gxk(i + 1), y: gyk(j) },
        { x: gxk(i + 1), y: gyk(j + 1) },
        { x: gxk(i), y: gyk(j + 1) },
      ];
      const v = c.map((q) => height(q.x, q.y));
      let code = 0;
      for (let k = 0; k < 4; k += 1) if (v[k] > L) code |= 1 << k;
      if (code === 0 || code === 15) continue;
      // Edge midpoints, interpolated: 0 is bottom, 1 right, 2 top, 3 left.
      const e = [
        lerp(c[0], c[1], v[0], v[1]),
        lerp(c[1], c[2], v[1], v[2]),
        lerp(c[2], c[3], v[2], v[3]),
        lerp(c[3], c[0], v[3], v[0]),
      ];
      const TABLE = [
        [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]],
        [[2, 3]], [[2, 0]], [[0, 1], [2, 3]], [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], [],
      ];
      for (const [a, b] of TABLE[code]) out.push([e[a], e[b]]);
    }
  }
  return out;
}

/** Chain segments end to end, so a contour is one polyline rather than 900. */
function chain(segs) {
  const key = (q) => `${Math.round(q.x * 4000)},${Math.round(q.y * 4000)}`;
  const ends = new Map();
  segs.forEach((s, i) => {
    for (const q of s) {
      const k = key(q);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(i);
    }
  });
  const used = new Array(segs.length).fill(false);
  const paths = [];
  for (let i = 0; i < segs.length; i += 1) {
    if (used[i]) continue;
    used[i] = true;
    const path = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir === 1 ? path[path.length - 1] : path[0];
        const next = (ends.get(key(tip)) ?? []).find((n) => !used[n]);
        if (next === undefined) break;
        used[next] = true;
        const s = segs[next];
        const far = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir === 1) path.push(far);
        else path.unshift(far);
      }
    }
    if (path.length > 3) paths.push(path);
  }
  return paths;
}

// ---- the two summits, found rather than typed ------------------------------
function summits() {
  const found = [];
  for (let j = 2; j < NY - 1; j += 1) {
    for (let i = 2; i < NX - 1; i += 1) {
      const x = gxk(i);
      const y = gyk(j);
      const h = height(x, y);
      let top = true;
      for (let dj = -2; dj <= 2 && top; dj += 1) {
        for (let di = -2; di <= 2; di += 1) {
          if (di === 0 && dj === 0) continue;
          if (height(gxk(i + di), gyk(j + dj)) >= h) { top = false; break; }
        }
      }
      if (top) found.push({ x, y, h });
    }
  }
  return found.sort((a, b) => b.h - a.h).slice(0, 2);
}
const PEAKS = summits();

const p = new Plate({ subject: "Geography", title: "The ground, twice", height: 1120 });

// ---- panels ----------------------------------------------------------------
const MX = 130;
const MY = 150;
const PXKM = 76;
const MW = KMX * PXKM;
const MH = KMY * PXKM;
const mx = (x) => MX + x * PXKM;
const my = (y) => MY + MH - y * PXKM;

p.poly([{ x: MX, y: MY }, { x: MX + MW, y: MY }, { x: MX + MW, y: MY + MH }, { x: MX, y: MY + MH }],
  { fill: "#F7F5EE", stroke: RULE, width: 1.2, close: true });
p.reserve(MX + MW / 2, MY + MH / 2, MW, MH);

// contours
const LEVELS = [];
for (let L = 80; L <= 440; L += 40) LEVELS.push(L);
const drawn = {};
for (const L of LEVELS) {
  const paths = chain(isoSegments(L));
  drawn[L] = paths;
  const index = L % 200 === 0;
  for (const path of paths) {
    p.poly(path.map((q) => ({ x: mx(q.x), y: my(q.y) })), {
      stroke: index ? "#8A6A34" : "#B79B6A",
      width: index ? 1.5 : 0.9,
    });
  }
}

// the section line
const A = { x: 0.7, y: 4.7 };
const B = { x: 9.3, y: 0.9 };
const LEN = Math.hypot(B.x - A.x, B.y - A.y);
const along = (s) => ({ x: A.x + ((B.x - A.x) * s) / LEN, y: A.y + ((B.y - A.y) * s) / LEN });
p.seg({ x: mx(A.x), y: my(A.y) }, { x: mx(B.x), y: my(B.y) }, { stroke: INK, width: 1.6, lineStyle: "dashed" });
p.place("A", mx(A.x) - 20, my(A.y) - 14, [{ x: -0.7, y: -0.7 }, { x: -1, y: 0 }], { size: 14, colour: INK, weight: 700 });
p.place("A′", mx(B.x) + 20, my(B.y) + 14, [{ x: 0.7, y: 0.7 }, { x: 1, y: 0 }], { size: 14, colour: INK, weight: 700 });

// spot heights at the found summits
PEAKS.forEach((q, i) => {
  p.seg({ x: mx(q.x) - 6, y: my(q.y) }, { x: mx(q.x) + 6, y: my(q.y) }, { stroke: INK, width: 1.2 });
  p.seg({ x: mx(q.x), y: my(q.y) - 6 }, { x: mx(q.x), y: my(q.y) + 6 }, { stroke: INK, width: 1.2 });
  // Near a summit the 40m contours are close-packed rings, so a short search
  // in a couple of directions can run out of room without finding a gap
  // between two of them. Given the full compass and a longer leash, the
  // label settles between rings rather than sitting on one.
  p.place(`${Math.round(q.h)} m`, mx(q.x) + 24, my(q.y) - 16,
    [
      { x: 0.6, y: -0.8 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }, { x: 0, y: 1 },
    ],
    { size: 12, colour: INK, weight: 600, steps: 40 },
  );
});

// a few contours numbered, each beside its own line
for (const L of [200, 400]) {
  const path = (drawn[L] ?? []).slice().sort((a, b) => b.length - a.length)[0];
  if (!path) continue;
  const q = path[Math.floor(path.length * 0.18)];
  p.place(String(L), mx(q.x), my(q.y), [{ x: 0, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }], {
    size: 11.5, colour: "#8A6A34", weight: 700,
  });
}

// ---- the marked points, one parametrisation for both panels ---------------
const MARKS = [
  { s: 0.55, name: "V", note: "viewpoint" },
  { s: 4.0, name: "P", note: "" },
  { s: 5.6, name: "Q", note: "" },
];
// The target summit is the highest ground in the FAR half of the section --
// found by search, not chosen. Picking the global maximum would have put the
// target on the near ridge, with nothing between it and the viewpoint, and the
// intervisibility question would have answered itself.
let topS = LEN * 0.55;
for (let s = LEN * 0.55; s <= LEN; s += LEN / 2000) {
  const q = along(s);
  if (height(q.x, q.y) > height(along(topS).x, along(topS).y)) topS = s;
}
MARKS.push({ s: topS, name: "S", note: "far summit" });

for (const m of MARKS) {
  const q = along(m.s);
  p.disc({ x: mx(q.x), y: my(q.y) }, 4.6, ASK);
  p.place(m.name + (m.note ? `  ${m.note}` : ""), mx(q.x) - 16, my(q.y) - 16,
    [
      { x: -0.6, y: -0.8 }, { x: 0.6, y: -0.8 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 },
    ],
    { size: 12.5, colour: ASK, weight: 700, steps: 40 });
}

p.label("kilometres", MX + MW / 2, MY + MH + 22, { size: 12, colour: FAINT });
{
  const bar = 2;   // km
  const bx = MX + 24;
  // Far enough above the panel's own bottom border that the tick numbers'
  // boxes -- taller than the tick marks they sit under -- clear it too.
  const byy = MY + MH - 36;
  p.seg({ x: bx, y: byy }, { x: bx + bar * PXKM, y: byy }, { stroke: INK, width: 2 });
  for (let k = 0; k <= bar; k += 1) p.seg({ x: bx + k * PXKM, y: byy - 5 }, { x: bx + k * PXKM, y: byy + 5 }, { stroke: INK, width: 1.4 });
  p.label("0", bx, byy + 16, { size: 11, colour: FAINT, claim: false });
  p.label("2 km", bx + bar * PXKM, byy + 16, { size: 11, colour: FAINT, claim: false });
  p.label("contours at 40 m", MX + MW - 90, MY + 20, { size: 11.5, colour: "#8A6A34", weight: 600 });
}

// ==========================================================================
// the section, sampled from the same field
// ==========================================================================
const SY0 = 620;
const SH = 180;
const HMAX = 500;
const sx = (s) => MX + s * PXKM;
const sy = (h) => SY0 + SH - (h / HMAX) * SH;

p.poly([{ x: MX, y: SY0 }, { x: MX, y: SY0 + SH }, { x: sx(LEN) + 20, y: SY0 + SH }], { stroke: "#9AA3AE", width: 1.1 });
for (let h = 0; h <= HMAX; h += 100) {
  p.seg({ x: MX - 6, y: sy(h) }, { x: sx(LEN) + 20, y: sy(h) }, { stroke: "#E4E8ED", width: 1, lineStyle: "dashed" });
  p.label(String(h), MX - 24, sy(h), { size: 11, colour: FAINT, claim: false });
}
p.reserve(MX - 26, SY0 + SH / 2, 46, SH + 20);

const profile = [];
for (let s = 0; s <= LEN; s += LEN / 600) {
  const q = along(s);
  profile.push({ x: sx(s), y: sy(height(q.x, q.y)) });
}
p.poly([{ x: sx(0), y: SY0 + SH }, ...profile, { x: sx(LEN), y: SY0 + SH }], {
  fill: "rgba(138,106,52,0.16)", stroke: "none", width: 0, close: true,
});
p.poly(profile, { stroke: "#8A6A34", width: 1.8 });
// At the top of the panel, clear of the elevation ticks running down its side.
p.place("A", sx(0) + 14, SY0 + 18, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], { size: 13, colour: INK, weight: 700 });
p.place("A′", sx(LEN) - 14, SY0 + 18, [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }], { size: 13, colour: INK, weight: 700 });
p.label("elevation  /  m", MX + 4, SY0 - 22, { size: 12.5, colour: SOFT, align: "start", width: 160 });
// Placed, not labelled outright: the gradient dimension drawn later reaches
// down as far as drop 62 + gap, well past where this title would otherwise
// sit, so it has to be free to step below that zone rather than assume the
// strip right under the axis is clear.
p.place("distance along the section  /  km", sx(LEN / 2), SY0 + SH + 24, [{ x: 0, y: 1 }], { size: 12.5, colour: SOFT });

// the same marks, at the same distances
for (const m of MARKS) {
  const q = along(m.s);
  const h = height(q.x, q.y);
  p.seg({ x: sx(m.s), y: sy(h) }, { x: sx(m.s), y: SY0 + SH }, { stroke: ASK, width: 0.9, lineStyle: "dashed" });
  p.disc({ x: sx(m.s), y: sy(h) }, 4.4, ASK);
  // Just the letter here. The words belong on the map, where there is room;
  // four captions along a profile fight each other and the sight line.
  p.place(m.name, sx(m.s), sy(h) - 18,
    [{ x: 0, y: -1 }, { x: 0.8, y: -0.8 }, { x: -0.8, y: -0.8 }], { size: 13, colour: ASK, weight: 700 });
}

// the line of sight, drawn straight and true
{
  const vs = MARKS[0].s;
  const ss = MARKS[3].s;
  const vh = height(along(vs).x, along(vs).y) + 1.7;   // eye height
  const sh = height(along(ss).x, along(ss).y);
  p.seg({ x: sx(vs), y: sy(vh) }, { x: sx(ss), y: sy(sh) }, { stroke: KEY, width: 1.4 });
  // Under the sight line, over the valley: the only quiet part of this panel.
  p.ask("does the ground cut this line ?", sx(vs + (ss - vs) * 0.32), sy(140),
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0.4 }], { size: 12.5, colour: KEY });
}

// the gradient the question wants
{
  const a = MARKS[1];
  const b = MARKS[2];
  p.dimension({ x: sx(a.s), y: SY0 + SH }, { x: sx(b.s), y: SY0 + SH }, { text: "gradient P → Q = ?", drop: 62, colour: ASK, weight: 600 });
}

p.label(
  "The section is not drawn under the map — it is sampled from the same height field the contours were traced from, so the two cannot disagree.",
  p.W / 2, 946, { size: 12, colour: FAINT },
);

p.question([
  "The map shows part of an upland area; the section below is taken along A–A′. Contours are at 40 m.",
  "(a)  Give the six-figure difference in height between P and Q, and hence the average gradient between them, as 1 in n.",
  "(b)  An observer of eye height 1.7 m stands at V. Is the summit S visible from there? Justify it from the section.",
  "(c)  Where on the map are the contours closest together, and what does that spacing mean on the ground?",
  "(d)  A river would run through the col between the two summits. Sketch its likely course, and say which way it flows.",
]);

p.write(process.argv[2] ?? "experiments/exercises/geo-contour.json");
console.log(`  summits found: ${PEAKS.map((q) => `${Math.round(q.h)} m at (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`).join("; ")}`);
console.log(`  section ${LEN.toFixed(2)} km; highest ground on it at s = ${topS.toFixed(2)} km`);
