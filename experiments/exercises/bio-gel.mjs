/*
 * BIOLOGY 2 -- an agarose gel, and the calibration hiding inside it.
 *
 * A fragment's migration is very nearly linear in the LOG of its length, and
 * that is the whole pedagogy of a gel: the ruler is not the ruler you expect.
 * So every ladder band here is placed at
 *
 *     distance = A - B*log10(bp)
 *
 * with A and B solved from the two end members of the ladder, and the
 * calibration line in the panel beside it is then LEAST-SQUARES FITTED to
 * those same placed bands -- a different route to the page from a shared
 * input. If a band were nudged, it would fall off its own fitted line and the
 * two halves of the plate would visibly disagree.
 *
 * The unknown fragment is placed at a stated migration and its length is
 * deliberately NOT back-solved anywhere in this file. Reading it off the fit
 * is the exercise.
 *
 *   node experiments/exercises/bio-gel.mjs
 */
import { Plate, INK, SOFT, FAINT, RULE, ASK, KEY, WARM } from "./sheet.mjs";

// ---- the ladder, and the migration law --------------------------------------
const LADDER = [10000, 8000, 6000, 5000, 4000, 3000, 2500, 2000, 1500, 1000, 750, 500, 250];
const D_TOP = 14;      // mm travelled by the largest fragment
const D_BOT = 78;      // mm travelled by the smallest
const B = (D_BOT - D_TOP) / (Math.log10(LADDER[0]) - Math.log10(LADDER[LADDER.length - 1]));
const A = D_TOP + B * Math.log10(LADDER[0]);
const migration = (bp) => A - B * Math.log10(bp);

// ---- the digests. Lane 2's second band is the unknown. --------------------
const LANES = [
  { name: "1", bands: [6000, 3000, 1500] },
  { name: "2", bands: [8000], extra: [45.0] },     // 45.0 mm, length not computed here
  { name: "3", bands: [4000, 2500, 1000, 500] },
];

const p = new Plate({ subject: "Biology", title: "How long is the fragment?", height: 880 });

// ==========================================================================
// the gel
// ==========================================================================
const GX = 150;
const GY = 168;
const GW = 372;
const GH = 470;
const MM = (GH - 40) / (D_BOT + 14);        // px per mm of migration
const dy = (mm) => GY + 26 + mm * MM;

p.poly([{ x: GX, y: GY }, { x: GX + GW, y: GY }, { x: GX + GW, y: GY + GH }, { x: GX, y: GY + GH }],
  { fill: "#2A2E36", stroke: "#4A505C", width: 1.4, close: true });
p.reserve(GX + GW / 2, GY + GH / 2, GW, GH);

const LANEW = GW / 4;
const lanex = (i) => GX + LANEW * (i + 0.5);

// wells
for (let i = 0; i < 4; i += 1) {
  p.poly(
    [
      { x: lanex(i) - 26, y: GY + 10 }, { x: lanex(i) + 26, y: GY + 10 },
      { x: lanex(i) + 26, y: GY + 18 }, { x: lanex(i) - 26, y: GY + 18 },
    ],
    { fill: "#171A20", stroke: "#5A6270", width: 0.8, close: true },
  );
}

/** A band: a soft bar of DNA, brighter for the ladder than for a digest. */
function band(i, mm, bright = 1) {
  const y = dy(mm);
  const w = 46;
  for (const [k, a] of [[3.2, 0.22], [2.0, 0.5], [1.1, 0.95]]) {
    p.poly(
      [
        { x: lanex(i) - w / 2, y: y - k }, { x: lanex(i) + w / 2, y: y - k },
        { x: lanex(i) + w / 2, y: y + k }, { x: lanex(i) - w / 2, y: y + k },
      ],
      { fill: `rgba(214,242,196,${(a * bright).toFixed(2)})`, stroke: "none", width: 0, close: true },
    );
  }
  return y;
}

// the ladder, and its rule down the left
// Every rung is drawn; only some are numbered. Near the top of the gel the
// rungs are less than a line-height apart, because migration goes as the log
// of the length -- which is the first thing this plate is asking about.
const NUMBERED = new Set([10000, 6000, 4000, 3000, 2000, 1500, 1000, 750, 500, 250]);
LADDER.forEach((bp) => {
  const y = band(0, migration(bp), 1);
  p.seg({ x: GX - 8, y }, { x: GX - 2, y }, { stroke: FAINT, width: 0.9 });
  if (NUMBERED.has(bp)) p.label(String(bp), GX - 32, y, { size: 10.5, colour: FAINT, claim: false });
});
p.label("bp", GX - 32, dy(migration(LADDER[0])) - 22, { size: 10.5, colour: FAINT, weight: 600 });

// the digests
LANES.forEach((lane, k) => {
  lane.bands.forEach((bp) => band(k + 1, migration(bp), 0.82));
  (lane.extra ?? []).forEach((mm) => band(k + 1, mm, 0.95));
});

// lane headings
["L", ...LANES.map((l) => l.name)].forEach((name, i) => {
  p.label(name, lanex(i), GY - 18, { size: 13, colour: INK, weight: 600 });
});
p.label("migration →", GX - 30, GY + GH + 22, { size: 11.5, colour: FAINT, align: "start", width: 120 });

// the unknown, called out on the gel itself
const unknownMM = LANES[1].extra[0];
{
  const y = dy(unknownMM);
  // The callout goes UNDER the gel, not out to the right: the right-hand half
  // of the sheet is the calibration panel, and an arrow crossing into it would
  // put this label among that panel's axis numbers.
  p.arrowMark({ x: lanex(2), y: GY + GH + 30 }, { x: lanex(2), y: y + 10 }, { stroke: ASK, width: 1.8, head: 8 });
  p.ask("unknown band, ran " + unknownMM.toFixed(1) + " mm", lanex(2) + 30, GY + GH + 46,
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0.4 }], { size: 12.5 });
}

// ==========================================================================
// the calibration, fitted to the bands that were actually drawn
// ==========================================================================
const CX = 700;
const CY = 214;
const CW = 372;
const CH = 300;
{
  const xs = LADDER.map((bp) => migration(bp));
  const ys = LADDER.map((bp) => Math.log10(bp));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxy / sxx;
  const inter = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    ssRes += (ys[i] - (inter + slope * xs[i])) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = 1 - ssRes / ssTot;

  // The tick numbers down the left of this panel are drawn unclaimed (they are
  // furniture), so the strip they occupy is reserved instead -- otherwise a
  // placed label finds it "free" and lands on top of them.
  p.reserve(CX - 26, CY + CH / 2, 48, CH + 24);
  const px = (mm) => CX + (mm / 90) * CW;
  const py = (l) => CY + CH - ((l - 2) / 2.4) * CH;

  p.poly([{ x: CX, y: CY }, { x: CX, y: CY + CH }, { x: CX + CW, y: CY + CH }], { stroke: "#9AA3AE", width: 1.1 });
  for (let mm = 0; mm <= 90; mm += 15) {
    p.seg({ x: px(mm), y: CY + CH }, { x: px(mm), y: CY + CH + 6 }, { stroke: "#9AA3AE", width: 1 });
    p.label(String(mm), px(mm), CY + CH + 19, { size: 11.5, colour: FAINT, claim: false });
  }
  for (const l of [2, 2.5, 3, 3.5, 4]) {
    p.seg({ x: CX - 6, y: py(l) }, { x: CX + CW, y: py(l) }, { stroke: "#E4E8ED", width: 1, lineStyle: "dashed" });
    const bp = 10 ** l;
    const tick = bp >= 1000 ? `${(bp / 1000).toFixed(bp % 1000 === 0 ? 0 : 1)}k` : String(Math.round(bp));
    p.label(tick, CX - 24, py(l), { size: 11.5, colour: FAINT, claim: false });
  }
  p.label("distance migrated  /  mm", px(45), CY + CH + 42, { size: 13, colour: SOFT });
  p.label("length  /  bp   (log)", CX + 4, CY - 24, { size: 13, colour: SOFT, align: "start", width: 200 });
  p.reserve(px(45), CY + CH + 28, CW, 48);

  // the fitted line, over the whole gel
  p.seg({ x: px(4), y: py(inter + slope * 4) }, { x: px(88), y: py(inter + slope * 88) }, { stroke: KEY, width: 1.8 });
  // the ladder points it was fitted to
  LADDER.forEach((bp, i) => p.disc({ x: px(xs[i]), y: py(ys[i]) }, 4.2, INK));

  // the unknown: its migration is known, its length is not read off here
  p.seg({ x: px(unknownMM), y: CY + CH }, { x: px(unknownMM), y: py(inter + slope * unknownMM) },
    { stroke: ASK, width: 1.2, lineStyle: "dashed" });
  p.seg({ x: CX, y: py(inter + slope * unknownMM) }, { x: px(unknownMM), y: py(inter + slope * unknownMM) },
    { stroke: ASK, width: 1.2, lineStyle: "dashed" });
  p.disc({ x: px(unknownMM), y: py(inter + slope * unknownMM) }, 5, ASK);
  p.ask("?  bp", CX - 26, py(inter + slope * unknownMM) - 22, [{ x: -0.2, y: -1 }, { x: 1, y: -0.6 }], { size: 13.5 });

  p.label(`R² = ${r2.toFixed(4)} over ${n} ladder bands`, px(62), py(3.72), { size: 11.5, colour: KEY });
  p.place("the line is fitted to the bands the gel actually shows,\nnot drawn through them",
    px(50), py(2.28), [{ x: 0, y: 1 }, { x: 0, y: -1 }], { size: 11.5, colour: FAINT });

  console.log(`  migration = ${A.toFixed(2)} - ${B.toFixed(3)}*log10(bp);  fit R2 = ${r2.toFixed(6)}`);
  console.log(`  (the unknown at ${unknownMM} mm is left unsolved on the sheet)`);
}

p.question([
  "A plasmid was cut with three restriction enzymes and the digests run beside a ladder. Lane 2 carries one uncut fragment and one unknown.",
  "(a)  Why are the ladder's rungs bunched at the bottom of the gel rather than evenly spaced?",
  "(b)  Use the calibration to estimate the length of the unknown fragment in lane 2.",
  "(c)  Lane 3 shows four bands. What is the total length of the DNA that was cut, and what does that tell you about the plasmid?",
  "(d)  A fifth band of 60 bp would not appear on this gel. Give two reasons.",
]);

p.write(process.argv[2] ?? "experiments/exercises/bio-gel.json");
