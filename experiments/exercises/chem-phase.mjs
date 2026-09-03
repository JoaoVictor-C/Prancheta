/*
 * CHEMISTRY 2 -- the phase diagram of carbon dioxide, and two paths across it.
 *
 * ON THE FIT, because it is the one thing that could quietly be false here.
 * The two vapour boundaries are NOT a Clausius-Clapeyron integration with a
 * constant enthalpy. That is a one-parameter family, and pinning it to two
 * measured points at once is over-determined: run it from the triple point and
 * it lands nowhere near the critical point, so the plate would draw a curve
 * that misses its own printed label -- this project's founding defect, in a
 * new subject.
 *
 * Instead each boundary is the two-parameter form log10 P = a - b/T, and its
 * two constants are SOLVED from two real measurements:
 *
 *   vaporisation   triple point (216.59 K, 5.185 bar) and critical point
 *                  (304.13 K, 73.8 bar)
 *   sublimation    triple point and the 1 atm sublimation point (194.7 K)
 *
 * so both curves pass exactly through the dots printed on them, by
 * construction rather than by luck. The fusion line is drawn from the triple
 * point with the correct sign of slope and is NOT quantitative; it is the one
 * unfitted thing on the sheet and it says so.
 *
 * Both process paths cross the fitted boundaries wherever the fit puts them,
 * and the crossing conditions are marked "?" rather than printed.
 *
 *   node experiments/exercises/chem-phase.mjs
 */
import { Plate, INK, SOFT, FAINT, RULE, ASK, KEY, WARM } from "./sheet.mjs";

// ---- measured anchors -----------------------------------------------------
const TRIPLE = { T: 216.59, P: 5.185 };
const CRIT = { T: 304.13, P: 73.8 };
const SUB1ATM = { T: 194.7, P: 1.013 };

/** Solve log10 P = a - b/T through two points. Two unknowns, two equations. */
function fitLog(p1, p2) {
  const y1 = Math.log10(p1.P);
  const y2 = Math.log10(p2.P);
  const b = (y2 - y1) / (1 / p1.T - 1 / p2.T);
  const a = y1 + b / p1.T;
  return { a, b, at: (T) => 10 ** (a - b / T), Tat: (P) => b / (a - Math.log10(P)) };
}
const VAP = fitLog(TRIPLE, CRIT);
const SUB = fitLog(SUB1ATM, TRIPLE);

// ---- the two paths, and where they really cross ---------------------------
const PATH_A = { P: 1.013, Tfrom: 300, Tto: 184 };          // cool at one atmosphere
const crossA = { T: SUB.Tat(PATH_A.P), P: PATH_A.P };
const PATH_B = { T: 250, Pfrom: 1.0, Pto: 90 };             // squeeze at 250 K
const crossB = { T: PATH_B.T, P: VAP.at(PATH_B.T) };

const p = new Plate({ subject: "Chemistry", title: "Two ways across a phase diagram", height: 880 });

const TMIN = 182;
const TMAX = 322;
const LPMIN = -1;    // log10 bar
const LPMAX = 2.25;

const S = p.plane("pd", {
  x: 0, y: 0, xUnit: 1, yUnit: 1,   // unused; this plate maps by hand, see below
});
p.frames.length = 0;

const X0 = 176;
const X1 = 1040;
const Y0 = 604;
const Y1 = 168;
const gx = (T) => X0 + ((T - TMIN) / (TMAX - TMIN)) * (X1 - X0);
const gy = (P) => Y0 + ((Math.log10(P) - LPMIN) / (LPMAX - LPMIN)) * (Y1 - Y0);
const XY = (T, P) => ({ x: gx(T), y: gy(P) });

// ---- axes -----------------------------------------------------------------
p.poly([{ x: X0, y: Y1 }, { x: X0, y: Y0 }, { x: X1, y: Y0 }], { stroke: "#9AA3AE", width: 1.2 });
for (let T = 190; T <= 320; T += 10) {
  const x = gx(T);
  p.seg({ x, y: Y0 }, { x, y: Y0 + 6 }, { stroke: "#9AA3AE", width: 1 });
  if (T % 20 === 0) p.label(String(T), x, Y0 + 20, { size: 11.5, colour: FAINT, claim: false });
}
for (const P of [0.1, 1, 10, 100]) {
  const y = gy(P);
  if (y > Y1 && y < Y0) {
    p.seg({ x: X0 - 6, y }, { x: X1, y }, { stroke: "#E4E8ED", width: 1, lineStyle: "dashed" });
    p.label(P < 1 ? String(P) : String(P), X0 - 22, y, { size: 11.5, colour: FAINT, claim: false });
  }
}
p.label("temperature  /  K", (X0 + X1) / 2, Y0 + 44, { size: 13, colour: SOFT });
// Set across, not turned. A long label rotated a quarter turn has to be laid
// out unrotated inside a box only as wide as its own line-height, and the
// repair loop then wraps it into a column of single words.
p.label("pressure  /  bar   (log)", X0 + 4, Y1 - 22, { size: 13, colour: SOFT, align: "start", width: 220 });
p.reserve(X0 - 24, (Y0 + Y1) / 2, 52, Y0 - Y1 + 20);
p.reserve((X0 + X1) / 2, Y0 + 30, X1 - X0, 46);

// ---- the fitted boundaries ------------------------------------------------
const line = (f, Ta, Tb, o) => {
  const pts = [];
  for (let i = 0; i <= 220; i += 1) {
    const T = Ta + ((Tb - Ta) * i) / 220;
    const P = f(T);
    if (P > 10 ** LPMIN * 0.8 && P < 10 ** LPMAX * 1.4) pts.push(XY(T, P));
  }
  return p.poly(pts, o);
};

// fusion: from the triple point, steeply up and slightly right. Not fitted.
const fusion = [];
for (let i = 0; i <= 40; i += 1) {
  const f = i / 40;
  fusion.push(XY(TRIPLE.T + 6.5 * f ** 0.55, TRIPLE.P * 10 ** (f * 1.62)));
}

// regions, painted before the boundaries so the lines sit on top
const solidRegion = [XY(TMIN, 10 ** LPMAX), ...fusion, XY(TRIPLE.T, TRIPLE.P)];
for (let T = TRIPLE.T; T >= TMIN; T -= 2) solidRegion.push(XY(T, Math.max(SUB.at(T), 10 ** LPMIN)));
solidRegion.push(XY(TMIN, 10 ** LPMIN));
p.poly(solidRegion, { fill: "rgba(29,78,137,0.10)", stroke: "none", width: 0, close: true });

const liquidRegion = [XY(TRIPLE.T, TRIPLE.P)];
for (let T = TRIPLE.T; T <= CRIT.T; T += 1.5) liquidRegion.push(XY(T, VAP.at(T)));
liquidRegion.push(XY(CRIT.T, CRIT.P), XY(CRIT.T, 10 ** LPMAX), XY(TMIN, 10 ** LPMAX));
liquidRegion.push(...fusion.slice().reverse());
p.poly(liquidRegion, { fill: "rgba(15,115,96,0.10)", stroke: "none", width: 0, close: true });

const scRegion = [XY(CRIT.T, CRIT.P), XY(TMAX, CRIT.P), XY(TMAX, 10 ** LPMAX), XY(CRIT.T, 10 ** LPMAX)];
p.poly(scRegion, { fill: "rgba(140,86,20,0.11)", stroke: "none", width: 0, close: true });

line(SUB.at, TMIN, TRIPLE.T, { stroke: INK, width: 2 });
line(VAP.at, TRIPLE.T, CRIT.T, { stroke: INK, width: 2 });
p.poly(fusion, { stroke: INK, width: 2, lineStyle: "dashed" });

// the two anchors the fit was solved through
for (const [q, name, dirs] of [
  [TRIPLE, "triple point\n216.6 K, 5.19 bar", [{ x: -1, y: 0.5 }, { x: -1, y: -0.6 }]],
  [CRIT, "critical point\n304.1 K, 73.8 bar", [{ x: -0.2, y: -1 }, { x: -1, y: -0.5 }]],
]) {
  const c = XY(q.T, q.P);
  p.disc(c, 5.2, INK);
  p.reserve(c.x, c.y, 20, 20);
  p.place(name, c.x + dirs[0].x * 34, c.y + dirs[0].y * 34, dirs, { size: 12, colour: INK, weight: 600 });
}

p.label("SOLID", gx(196), gy(30), { size: 13.5, colour: KEY, weight: 700, tracking: 1.6 });
p.label("LIQUID", gx(252), gy(120), { size: 13.5, colour: WARM, weight: 700, tracking: 1.6 });
p.label("GAS", gx(258), gy(0.22), { size: 13.5, colour: "#8C5614", weight: 700, tracking: 1.6 });
p.place("SUPERCRITICAL FLUID", gx(300), gy(150), [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }], {
  size: 11, colour: "#8C5614", weight: 700, tracking: 1,
});

// ---- path A: cool at one atmosphere ---------------------------------------
p.arrowMark(XY(PATH_A.Tfrom, PATH_A.P), XY(PATH_A.Tto, PATH_A.P), { stroke: ASK, width: 2.2 });
p.disc(XY(crossA.T, crossA.P), 5, ASK);
p.place("A", XY(PATH_A.Tfrom, PATH_A.P).x + 16, XY(PATH_A.Tfrom, PATH_A.P).y - 4,
  [{ x: 1, y: 0 }, { x: 0.5, y: -1 }], { size: 14, colour: ASK, weight: 700 });
// Below and to the right: above the crossing is the sublimation curve itself,
// and to the left is the axis furniture.
p.ask("A crosses here at T = ?", XY(crossA.T, crossA.P).x + 26, XY(crossA.T, crossA.P).y + 34,
  [{ x: 0.5, y: 1 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }], { size: 12.5 });

// ---- path B: squeeze at 250 K ---------------------------------------------
p.arrowMark(XY(PATH_B.T, PATH_B.Pfrom), XY(PATH_B.T, PATH_B.Pto), { stroke: "#6C3FA8", width: 2.2 });
p.disc(XY(crossB.T, crossB.P), 5, "#6C3FA8");
p.place("B", XY(PATH_B.T, PATH_B.Pfrom).x - 4, XY(PATH_B.T, PATH_B.Pfrom).y + 20,
  [{ x: 0, y: 1 }, { x: -1, y: 0.4 }], { size: 14, colour: "#6C3FA8", weight: 700 });
p.ask("B crosses here at P = ?", XY(crossB.T, crossB.P).x + 46, XY(crossB.T, crossB.P).y,
  [{ x: 1, y: 0 }, { x: 1, y: -0.6 }], { size: 12.5, colour: "#6C3FA8" });

p.label(
  "Both boundaries are two-parameter fits solved through the dots printed on them. The dashed melting line is not fitted, and is drawn for its slope alone.",
  p.W / 2, 690, { size: 12, colour: FAINT },
);

p.question([
  "Carbon dioxide is taken along two paths: A, cooled from 300 K at a steady 1 atm; B, compressed from 1 bar at a steady 250 K.",
  "(a)  Name every phase change along A, and give the temperature at which it happens.      (b)  The same for B, with its pressure.",
  "(c)  Solid CO₂ is called dry ice. Read off this diagram the reason it does not melt in an open room.",
  "(d)  Above 304.1 K no pressure will liquefy CO₂. Which feature of the diagram says so, and what happens to the boundary there?",
]);

p.write(process.argv[2] ?? "experiments/exercises/chem-phase.json");
console.log(`  vap: log10 P = ${VAP.a.toFixed(4)} - ${VAP.b.toFixed(1)}/T   check at Tc: ${VAP.at(CRIT.T).toFixed(2)} bar`);
console.log(`  sub: log10 P = ${SUB.a.toFixed(4)} - ${SUB.b.toFixed(1)}/T   check at triple: ${SUB.at(TRIPLE.T).toFixed(3)} bar`);
console.log(`  A crosses at ${crossA.T.toFixed(2)} K;  B crosses at ${crossB.P.toFixed(2)} bar`);
