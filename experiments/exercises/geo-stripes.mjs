/*
 * GEOGRAPHY 2 -- magnetic stripes either side of a spreading ridge.
 *
 * One array of geomagnetic polarity chrons, in millions of years, is rendered
 * TWICE: once as distance from the ridge, where each stripe's width is its own
 * duration times a single spreading rate, and once as the polarity timescale
 * bar underneath, where the same chron is drawn against time. The exercise is
 * the conversion between the two, and the rate that does the converting is the
 * one number never printed on the sheet.
 *
 * The symmetry is structural, not cosmetic. Every stripe is generated once and
 * mirrored about the ridge by construction, so the two flanks cannot drift
 * apart -- which matters, because that symmetry IS the evidence for spreading
 * and a figure that only looked symmetric would be arguing from a drawing
 * accident.
 *
 * The magnetometer trace above is computed from the same array: it is high
 * over normal crust and low over reversed, with the transitions rounded the
 * way a towed instrument at sea rounds them.
 *
 *   node experiments/exercises/geo-stripes.mjs
 */
import { Plate, INK, SOFT, FAINT, RULE, ASK, KEY, WARM } from "./sheet.mjs";

// ---- the geomagnetic polarity timescale, in Ma ----------------------------
// Normal-polarity intervals. Everything between them is reversed.
const NORMAL = [
  [0, 0.773, "Brunhes"],
  [0.988, 1.072, "Jaramillo"],
  [1.778, 1.945, "Olduvai"],
  [2.595, 3.032, "Gauss"],
  [3.116, 3.207, ""],
  [3.330, 3.596, ""],
];
const TMAX = 3.596;
const RATE = 15;                 // km per Myr, half-rate. NEVER PRINTED.
const isNormal = (t) => NORMAL.some(([a, b]) => t >= a && t < b);

const p = new Plate({ subject: "Geography", title: "Reading the seafloor", height: 880 });

const AXIS = 590;                // the ridge
const KM = 8.0;                  // px per km
const XMAX = 56;                 // km shown either side
const gx = (km) => AXIS + km * KM;

// ==========================================================================
// the magnetometer trace, from the same chron array
// ==========================================================================
{
  const y0 = 176;
  const amp = 34;
  const pts = [];
  for (let d = -XMAX; d <= XMAX; d += 0.25) {
    const t = Math.abs(d) / RATE;
    // A towed magnetometer smooths the edges; average the polarity over a
    // short window rather than drawing a perfect square wave.
    let s = 0;
    for (let k = -4; k <= 4; k += 1) {
      const tt = Math.abs(d + k * 0.32) / RATE;
      s += tt <= TMAX && isNormal(tt) ? 1 : -1;
    }
    pts.push({ x: gx(d), y: y0 - (s / 9) * amp });
  }
  p.seg({ x: gx(-XMAX), y: y0 }, { x: gx(XMAX), y: y0 }, { stroke: RULE, width: 0.9 });
  p.poly(pts, { stroke: KEY, width: 1.5 });
  p.label("magnetic anomaly, towed magnetometer", gx(0), y0 - amp - 26, { size: 12, colour: KEY });
  p.reserve(gx(0), y0, XMAX * 2 * KM, amp * 2 + 26);
}

// ==========================================================================
// the crust: one array, mirrored by construction
// ==========================================================================
const TOP = 250;
const BOT = 330;
{
  const edges = [0, ...NORMAL.flatMap(([a, b]) => [a, b]), TMAX].sort((x, y) => x - y);
  for (let i = 0; i < edges.length - 1; i += 1) {
    const t0 = edges[i];
    const t1 = edges[i + 1];
    if (t1 - t0 < 1e-9) continue;
    const normal = isNormal((t0 + t1) / 2);
    for (const side of [-1, 1]) {
      const a = gx(side * t0 * RATE);
      const b = gx(side * t1 * RATE);
      p.poly([{ x: a, y: TOP }, { x: b, y: TOP }, { x: b, y: BOT }, { x: a, y: BOT }], {
        fill: normal ? "#23262C" : "#F2F0EA",
        stroke: "#8C93A0",
        width: 0.6,
        close: true,
      });
    }
  }
  p.seg({ x: AXIS, y: TOP - 22 }, { x: AXIS, y: BOT + 22 }, { stroke: ASK, width: 2 });
  p.place("ridge axis", AXIS, TOP - 40, [{ x: 0, y: -1 }], { size: 12.5, colour: ASK, weight: 600 });
  p.label("normal polarity", gx(-46), BOT + 26, { size: 11.5, colour: SOFT });
  p.label("reversed", gx(-30), BOT + 26, { size: 11.5, colour: SOFT });
  p.disc({ x: gx(-52), y: BOT + 26 }, 5, "#23262C");
  p.circle({ x: gx(-36), y: BOT + 26 }, 5, { stroke: "#8C93A0", width: 1 });
}

// distance axis
{
  const y = BOT + 58;
  p.seg({ x: gx(-XMAX), y }, { x: gx(XMAX), y }, { stroke: "#9AA3AE", width: 1.1 });
  for (let d = -50; d <= 50; d += 10) {
    p.seg({ x: gx(d), y }, { x: gx(d), y: y + 6 }, { stroke: "#9AA3AE", width: 1 });
    p.label(String(Math.abs(d)), gx(d), y + 19, { size: 11.5, colour: FAINT, claim: false });
  }
  p.label("distance from the ridge  /  km", gx(0), y + 40, { size: 13, colour: SOFT });
  p.reserve(gx(0), y + 26, XMAX * 2 * KM, 52);
}

// ==========================================================================
// the same chrons again, this time against time
// ==========================================================================
const TY = 508;
{
  const TKM = 118;               // px per Myr on this bar; unrelated to KM
  const tx = (t) => AXIS + t * TKM;
  p.label("THE SAME CHRONS, AGAINST TIME", AXIS - 210, TY - 34, {
    size: 11, colour: FAINT, weight: 600, tracking: 2, align: "start", width: 400,
  });
  const edges = [0, ...NORMAL.flatMap(([a, b]) => [a, b]), TMAX].sort((x, y) => x - y);
  for (let i = 0; i < edges.length - 1; i += 1) {
    const t0 = edges[i];
    const t1 = edges[i + 1];
    if (t1 - t0 < 1e-9) continue;
    p.poly(
      [{ x: tx(t0), y: TY }, { x: tx(t1), y: TY }, { x: tx(t1), y: TY + 34 }, { x: tx(t0), y: TY + 34 }],
      { fill: isNormal((t0 + t1) / 2) ? "#23262C" : "#F2F0EA", stroke: "#8C93A0", width: 0.6, close: true },
    );
  }
  const y = TY + 34;
  p.seg({ x: tx(0), y: y + 10 }, { x: tx(TMAX), y: y + 10 }, { stroke: "#9AA3AE", width: 1.1 });
  for (let t = 0; t <= 3.5; t += 0.5) {
    p.seg({ x: tx(t), y: y + 10 }, { x: tx(t), y: y + 16 }, { stroke: "#9AA3AE", width: 1 });
    p.label(t.toFixed(1), tx(t), y + 29, { size: 11.5, colour: FAINT, claim: false });
  }
  p.label("age  /  millions of years", tx(1.75), y + 50, { size: 13, colour: SOFT });
  p.reserve(tx(1.75), y + 32, TMAX * TKM, 50);

  // The named chrons, and the tie-lines between the two renderings.
  for (const [a, b, name] of NORMAL) {
    if (name === "") continue;
    const mid = (a + b) / 2;
    p.place(name, tx(mid), TY - 12, [{ x: 0, y: -1 }, { x: 0.6, y: -1 }], { size: 11.5, colour: INK, weight: 600 });
  }
  // Jaramillo's young edge, in both renderings at once.
  const tie = NORMAL[1][0];
  p.seg({ x: gx(tie * RATE), y: BOT }, { x: tx(tie), y: TY }, { stroke: ASK, width: 1, lineStyle: "dashed" });
  p.disc({ x: gx(tie * RATE), y: BOT }, 4, ASK);
  p.disc({ x: tx(tie), y: TY }, 4, ASK);
}

// ---- what is asked --------------------------------------------------------
p.ask("this edge is at a measurable distance,\nand at a known age — so the rate is ?",
  gx(20) + 30, (BOT + TY) / 2 + 6, [{ x: 0.4, y: 0 }, { x: 1, y: 0.4 }, { x: -1, y: 0 }], { size: 12.5 });

p.label(
  "The stripes are one array of chrons drawn in kilometres; the bar is the same array drawn in millions of years. Only the conversion is missing.",
  p.W / 2, 692, { size: 12, colour: FAINT },
);

p.question([
  "A ship tows a magnetometer across a mid-ocean ridge and records the anomaly above. The seafloor beneath is drawn from it.",
  "(a)  Why is the pattern symmetric about the ridge, and what would an asymmetric pattern mean?",
  "(b)  The young edge of the Jaramillo chron is marked in both panels. Use it to find the half-spreading rate, in km per million years.",
  "(c)  Hence give the full spreading rate in mm per year.      (d)  How far from the ridge is crust that formed 3.0 Ma ago?",
]);

p.write(process.argv[2] ?? "experiments/exercises/geo-stripes.json");
console.log(`  half-rate ${RATE} km/Myr (not printed);  Jaramillo young edge at ${(NORMAL[1][0] * RATE).toFixed(2)} km`);
