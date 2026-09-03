/*
 * The Voyager Golden Record cover (NASA, 1977), redrawn from the photograph
 * GPN-2000-001978.
 *
 * The cover is a gold-anodised aluminium plate carrying six engraved
 * diagrams and NOT ONE WORD of text -- which is what makes it the right
 * first target for this series: every stroke on it is geometry that means
 * something, so a figure toolkit either reproduces it or visibly does not.
 *
 * Nothing here is traced. Every binary number on the plate is a real
 * duration divided by the hydrogen hyperfine period and printed in base two,
 * so the dash codes are computed by the same rule the original used rather
 * than copied off the photograph digit by digit. Positions ARE measured off
 * the photograph, scaled to a 1280px reference frame.
 *
 *   node experiments/recreations/voyager.mjs
 */
import { Sheet, inHydrogen, bits, rad } from "./lib.mjs";

const W = 1280;
const CX = 640;
const CY = 642;
const R = 622;

const INK = "#FFEFC2";
const LW = 2.1;

const s = new Sheet({
  width: W,
  height: W,
  background: "#07070B",
  title: "The Voyager Golden Record cover (NASA, 1977) - redrawn",
});

// The plate itself, and it has to be a Mark rather than a Block: the pipeline
// draws every mark before every box, so a Block plate would be laid over the
// engraving it is supposed to sit under. That costs the gradient a Block can
// carry -- so the lit look is built the way the metal builds it, out of a flat
// ground, a few translucent washes offset towards the light, and the canvas
// vignette darkening the rim.
// A Mark takes one flat fill, so the ramp is built out of 64 nested discs,
// each a little smaller, a little brighter and a little further towards the
// light than the last. Every step shrinks the radius by more than it shifts
// the centre, so no disc can escape the one under it and the rim stays a
// true circle.
{
  const N = 64;
  const ramp = [
    [0, [98, 68, 20]],
    [0.42, [163, 124, 39]],
    [0.78, [196, 156, 62]],
    [1, [214, 178, 84]],
  ];
  const at = (t) => {
    let i = 0;
    while (i < ramp.length - 2 && t > ramp[i + 1][0]) i += 1;
    const k = (t - ramp[i][0]) / (ramp[i + 1][0] - ramp[i][0]);
    return `rgb(${ramp[i][1].map((v, j) => Math.round(v + (ramp[i + 1][1][j] - v) * k)).join(",")})`;
  };
  for (let i = 0; i < N; i += 1) {
    const t = i / (N - 1);
    s.disc(CX - 62 * t, CY + 84 * t, R * (1 - 0.62 * t), at(t));
  }
}

// Machining striations. Each one is a full chord of the plate, so the ends
// land exactly on the rim and nothing has to be clipped.
{
  const brush = -32;
  const n = { x: -Math.sin(rad(brush)), y: -Math.cos(rad(brush)) };
  const t = { x: Math.cos(rad(brush)), y: -Math.sin(rad(brush)) };
  let seed = 1977;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 170; i += 1) {
    const d = (rnd() * 2 - 1) * R * 0.995;
    const half = Math.sqrt(R * R - d * d);
    const a = 0.15 + rnd() * 0.7;
    const b = a + (0.05 + rnd() * 0.5);
    const c = { x: CX + d * n.x, y: CY + d * n.y };
    const at = (u) => ({ x: c.x + (u * 2 - 1) * half * t.x, y: c.y + (u * 2 - 1) * half * t.y });
    s.poly([at(a), at(Math.min(b, 1))], { stroke: "rgba(255,236,180,0.13)", width: 1 + rnd() * 1.6 });
  }
}

const ink = (width = LW) => ({ stroke: INK, width });

/** A local frame: (u across, v along) rotated `deg` clockwise from upright. */
function local(cx, cy, deg) {
  const c = Math.cos(rad(deg));
  const sn = Math.sin(rad(deg));
  return (u, v) => ({ x: cx + u * c - v * sn, y: cy + u * sn + v * c });
}

/**
 * A binary number in the plaque's own notation: a vertical tick is a 1, a
 * horizontal dash on the baseline is a 0, most significant digit first,
 * wrapped over rows of `perRow` and closed by a tall bar at each end.
 */
function binary(str, { x, y, cell, rowPitch, tick = 11, perRow = str.length, bars = true }) {
  const rows = [];
  for (let i = 0; i < str.length; i += perRow) rows.push(str.slice(i, i + perRow));
  rows.forEach((row, r) => {
    const yy = y + r * rowPitch;
    [...row].forEach((d, i) => {
      const xx = x + (i + 0.5) * cell;
      if (d === "1") s.seg(xx, yy - tick / 2, xx, yy + tick / 2, ink(1.7));
      else s.seg(xx - cell * 0.4, yy, xx + cell * 0.4, yy, ink(1.7));
    });
  });
  if (bars) {
    const span = (rows.length > 1 ? 2 : 1) * rowPitch;
    const top = y - tick / 2 - 3;
    s.seg(x - cell * 0.35, top, x - cell * 0.35, top + span, ink(1.7));
    s.seg(x + perRow * cell - cell * 0.65, top, x + perRow * cell - cell * 0.65, top + span, ink(1.7));
  }
  return rows.length;
}

// --------------------------------------------------------------------------
// 1. The record seen from above, and how long one turn takes.
// --------------------------------------------------------------------------
const RC = { x: 328, y: 380 };
const RR = 155;

s.circle(RC.x, RC.y, RR, ink(2.4));
s.circle(RC.x, RC.y, 28, ink(1.9));
s.disc(RC.x, RC.y, 5.5, INK);

// One rotation of the record, 3.6 seconds, written round the rim in binary:
// a long tangential dash is a 1, a short one a 0. The digits are computed,
// not copied -- the ring is exactly as long as 3.6 s happens to be in base two.
const TURN = inHydrogen(3.6);
{
  const ringR = 174;
  const start = 14; // just under the cartridge, running counter-clockwise
  const sweep = 336;
  const cell = sweep / TURN.length;
  [...TURN].forEach((d, i) => {
    const a = start + (i + 0.5) * cell;
    const half = (d === "1" ? 0.36 : 0.14) * cell;
    s.arc(RC.x, RC.y, ringR, a - half, a + half, ink(3.4));
  });
  // The four radial ticks the photograph shows breaking the ring near the top.
  [58, 74, 96, 112].forEach((a) => {
    const p0 = Sheet.polar(RC.x, RC.y, ringR - 9, a);
    const p1 = Sheet.polar(RC.x, RC.y, ringR + 9, a);
    s.poly([p0, p1], ink(2.2));
  });
}

// The cartridge, sitting on the rim where the outermost groove starts.
{
  const f = local(474, 372, -14);
  s.poly([f(-11, -40), f(11, -40), f(11, 34), f(-11, 34)], { ...ink(2.1), close: true });
  s.poly([f(-11, -30), f(11, -30)], ink(1.6));
  s.poly([f(-6, -25), f(6, -25), f(6, -5), f(-6, -5)], { ...ink(1.6), close: true });
  s.poly([f(-6, 2), f(6, 2), f(6, 20), f(-6, 20)], { ...ink(1.6), close: true });
  s.poly([f(-11, 26), f(11, 26)], ink(1.6));
  s.poly([f(-4, 34), f(-4, 44), f(4, 44), f(4, 34)], ink(1.9));
}

// --------------------------------------------------------------------------
// 2. The record edge-on, and how long one side plays.
// --------------------------------------------------------------------------
s.seg(184, 651, 478, 651, ink(2.2));
s.seg(184, 657, 478, 657, ink(2.2));
{
  const f = local(474, 630, 0);
  s.poly([f(-11, -18), f(11, -18), f(11, 14), f(-11, 14)], { ...ink(2.0), close: true });
  s.poly([f(-5, -11), f(5, -11), f(5, -1), f(-5, -1)], { ...ink(1.5), close: true });
  s.poly([f(-5, 4), f(5, 4), f(5, 11), f(-5, 11)], { ...ink(1.5), close: true });
  s.seg(474, 644, 474, 651, ink(1.9));
}
// One side runs about an hour.
binary(inHydrogen(3600), { x: 328, y: 682, cell: 11.4, rowPitch: 17, tick: 12, perRow: 12 });

// --------------------------------------------------------------------------
// 3. The centre hole.
// --------------------------------------------------------------------------
s.circle(630, 648, 21, ink(2.4));
s.circle(630, 648, 15, ink(1.6));
s.disc(630, 648, 11, "#100C05");

// --------------------------------------------------------------------------
// 4. The video waveform: the calibration burst, then three scan lines.
// --------------------------------------------------------------------------
{
  const x0 = 613;
  const cyc = 5.1;
  const burst = [];
  for (let i = 0; i <= 16; i += 1) burst.push({ x: x0 + i * cyc, y: i % 2 ? 298 : 250 });
  s.poly(burst, ink(2.0));
  s.poly(
    [{ x: x0 + 16 * cyc, y: 298 }, { x: 736, y: 298 }, { x: 736, y: 316 }, { x: 750, y: 316 }],
    ink(2.0),
  );

  // Three scan lines. The trace is a picture signal, so it is noise with
  // structure: a deterministic pseudo-random walk, seeded so the plate comes
  // out byte-identical every run.
  let seed = 20770905;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const spans = [[750, 858], [875, 978], [995, 1082]];
  spans.forEach(([a, b], k) => {
    const pts = [{ x: a, y: 316 }, { x: a, y: 276 }];
    let x = a;
    while (x < b - 4) {
      const spike = rnd() > 0.62;
      x = Math.min(b, x + (spike ? 1.6 + rnd() * 2.4 : 3 + rnd() * 6));
      const y = 258 + rnd() * (rnd() > 0.82 ? 46 : 20);
      // A spike is a straight run to the new level; a plateau steps to it and
      // holds. The original trace is both, which is what a picture signal is.
      if (spike) pts.push({ x, y });
      else pts.push({ x, y: pts[pts.length - 1].y }, { x, y });
    }
    pts.push({ x: b, y: pts[pts.length - 1].y }, { x: b, y: 316 });
    if (k < spans.length - 1) pts.push({ x: spans[k + 1][0], y: 316 });
    s.poly(pts, ink(1.9));
    // Which line this is: 1, 10, 11.
    binary(bits(k + 1), { x: [793, 903, 1013][k], y: 230, cell: 13, rowPitch: 0, tick: 15, bars: false });
  });
}
// How long one line takes: 8 ms.
binary(inHydrogen(0.008), { x: 742, y: 350, cell: 11.2, rowPitch: 16, tick: 11, perRow: 12 });

// --------------------------------------------------------------------------
// 5. The same three lines, stacked down the frame.
// --------------------------------------------------------------------------
{
  const teeth = [
    { x: 766, y: 414 }, { x: 840, y: 505 }, { x: 885, y: 416 },
    { x: 953, y: 505 }, { x: 1000, y: 416 }, { x: 1062, y: 500 }, { x: 1084, y: 410 },
  ];
  s.poly(teeth, ink(2.0));
  [[766, 420], [788, 436], [885, 422], [903, 444], [1000, 422], [1018, 442]].forEach(([x, y]) =>
    s.circle(x, y, 7, ink(1.7)),
  );
  [800, 908, 1016].forEach((x, k) =>
    binary(bits(k + 1), { x, y: 396, cell: 13, rowPitch: 0, tick: 14, bars: false }),
  );
  for (let y = 508; y < 542; y += 7) s.seg(856, y, 856, y + 4, ink(1.7));
}

// --------------------------------------------------------------------------
// 6. The whole raster: 512 lines to a frame.
// --------------------------------------------------------------------------
{
  const [x0, y0, x1, y1] = [765, 546, 935, 679];
  s.poly([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], { ...ink(2.4), close: true });
  for (let i = 0; i < 11; i += 1) {
    const x = x0 + 3 + i * 3.8;
    s.seg(x, y0 + 2, x, y1 - 2, ink(1.4));
  }
  [x1 - 9, x1 - 5.5, x1 - 2].forEach((x) => s.seg(x, y0 + 2, x, y1 - 2, ink(1.4)));
  binary("1", { x: 766, y: 538, cell: 12, rowPitch: 0, tick: 12, bars: false });
  s.poly([{ x: 850, y: 534 }, { x: 860, y: 544 }], ink(1.7));
  s.poly([{ x: 860, y: 534 }, { x: 850, y: 544 }], ink(1.7));
  // 512, written down the side rather than across.
  [...bits(512)].forEach((d, i) => {
    const y = 492 + i * 4.6;
    if (d === "1") s.seg(925, y, 934, y, ink(1.7));
    else s.seg(929, y - 1.6, 929, y + 1.6, ink(1.7));
  });
}

// --------------------------------------------------------------------------
// 7. The first picture on the record: a circle, so the geometry can be checked.
// --------------------------------------------------------------------------
{
  const [x0, y0, x1, y1] = [763, 700, 938, 829];
  s.poly([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], { ...ink(2.4), close: true });
  s.circle(852, 763, 40, ink(2.2));
  s.seg(846, 757, 852, 775, ink(1.6));
}

// --------------------------------------------------------------------------
// 8. Where the Sun is: fourteen pulsars, and the galactic centre.
//
// Each ray is one pulsar period in binary, laid along the ray from the Sun
// outward -- a long dash is a 1, a short one a 0 -- so a ray is exactly as
// long as its own period is wide in base two. Nothing about the length was
// chosen. The fifteenth ray, solid and much longer, is the distance to the
// centre of the galaxy.
//
// The plate's own fourteen cannot be read off the photograph, so these are
// fourteen real pulsars with their real periods, encoded by the plate's rule.
// J1243-6423 is one Wikipedia names as being on the Pioneer plaque.
// --------------------------------------------------------------------------
{
  const P = { x: 387, y: 951 };
  const pulsars = [
    [100, 0.71452], [78, 0.03340], [60, 0.08933], [47, 1.33730],
    [30, 0.25307], [13, 0.22652], [-14, 0.53066], [-33, 1.18791],
    [-52, 1.27377], [-70, 1.38245], [-93, 0.42183], [-120, 1.24441],
    [-145, 0.26338], [172, 0.38808],
  ];
  pulsars.forEach(([deg, period]) => {
    let t = 9;
    [...inHydrogen(period)].forEach((d) => {
      const len = d === "1" ? 5.6 : 2.1;
      s.poly([Sheet.polar(P.x, P.y, t, deg), Sheet.polar(P.x, P.y, t + len, deg)], ink(2.0));
      t += len + 2.6;
    });
  });
  s.seg(P.x, P.y - 1, 935, 949, ink(2.0));
}

// --------------------------------------------------------------------------
// 9. The clock every number above is counted in: the hydrogen hyperfine
//    transition. Two states, one line between them, and a 1 to say the
//    interval is one unit.
// --------------------------------------------------------------------------
[810, 915].forEach((cx) => {
  const cy = 1090;
  s.circle(cx, cy, 23, ink(2.2));
  s.seg(cx, cy - 31, cx, cy - 15, ink(2.0));
  s.seg(cx, cy - 8, cx, cy + 14, ink(2.0));
});
s.seg(834, 1090, 891, 1090, ink(2.0));
s.seg(862, 1081, 862, 1099, ink(2.0));

const out = process.argv[2] ?? "experiments/recreations/voyager.json";
s.write(out, { vignette: 0.5 });
console.log(`${out}  ${s.marks.length} marks`);
console.log(`  one turn      3.6 s  = ${TURN} (${TURN.length} bits)`);
console.log(`  one side      3600 s = ${inHydrogen(3600).length} bits`);
console.log(`  one scan line 8 ms   = ${inHydrogen(0.008).length} bits`);
