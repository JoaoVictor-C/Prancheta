/*
 * PHYSICS 1 -- a thin-lens ray construction.
 *
 * The image point is solved from 1/do + 1/di = 1/f. Then three principal rays
 * are each constructed INDEPENDENTLY from the object tip, by their own rule:
 *
 *   1. parallel to the axis, then through the far focus
 *   2. through the centre of the lens, undeviated
 *   3. through the near focus, then parallel to the axis
 *
 * Three lines built by three different rules have no reason to meet. That they
 * do is the lens equation, drawn -- and it is asserted mechanically, not
 * admired: a marker sits at each ray's terminus and two align constraints, one
 * on center-x and one on center-y, say those three markers are the same point.
 * `constraints-satisfied` measures that at 0.1px. Get the arithmetic wrong and
 * the render exits non-zero.
 *
 *   node experiments/exercises/phys-lens.mjs
 */
import { Plate, INK, SOFT, FAINT, RULE, ASK, KEY, WARM } from "./sheet.mjs";

// ---- the stated quantities, and the one thing solved from them ------------
const F = 20;      // focal length, cm
const DO = 30;     // object distance, cm
const HO = 5;      // object height, cm

const DI = 1 / (1 / F - 1 / DO);   // 60 cm
const M = -DI / DO;                // -2
const HI = M * HO;                 // -10 cm

const p = new Plate({ subject: "Physics", title: "Where the image forms", height: 760 });

const S = p.plane("optics", { x: 372, y: 330, xUnit: 7.6, yUnit: 7.6 });
const at = S.at;

// ---- the bench ------------------------------------------------------------
p.seg(at(-46, 0), at(78, 0), { stroke: RULE, width: 1.1 });

// The lens: two arcs bulging about centres far off to each side, so the
// outline is a real lentil rather than two hand-drawn curves.
{
  const half = 13;                       // half-height, cm
  const bulge = 2.6;                     // how far each face bows, cm
  const R = (half * half + bulge * bulge) / (2 * bulge);
  const top = at(0, half);
  const bot = at(0, -half);
  const cR = at(R - bulge, 0);
  const cL = at(bulge - R, 0);
  p.mark({
    from: top,
    segments: [{ arc: bot, centre: cR }, { arc: top, centre: cL }],
    close: true,
    fill: "rgba(29,78,137,0.10)",
    stroke: KEY,
    strokeWidth: 1.6,
  });
  p.seg(at(0, -half - 2.2), at(0, half + 2.2), { stroke: KEY, width: 0.8, lineStyle: "dashed" });
}

// Foci and twice-foci, placed from f alone. Placed, not labelled outright: F′
// sits where ray 2 crosses on its way to the image and where the f = 20 cm
// dimension's own witness tick runs, so the label has to search for a spot
// clear of both rather than assume the axis underside is free.
for (const [u, name] of [[-2 * F, "2F"], [-F, "F"], [F, "F′"], [2 * F, "2F′"]]) {
  const q = at(u, 0);
  p.disc(q, 3.4, INK);
  p.place(name, q.x, q.y + 20, [{ x: 0, y: 1 }, { x: 0, y: -1 }], { size: 12.5, colour: SOFT, weight: 600 });
}

// ---- object and image -----------------------------------------------------
p.arrowMark(at(-DO, 0), at(-DO, HO), { stroke: INK, width: 2.6 });
p.place("object", at(-DO, HO).x - 36, at(-DO, HO).y - 6, [{ x: -1, y: 0 }, { x: 0, y: -1 }], { size: 12.5, colour: SOFT });
p.place(`h = ${HO.toFixed(1)} cm`, at(-DO, HO / 2).x - 44, at(-DO, HO / 2).y, [{ x: -1, y: 0 }, { x: -0.7, y: -0.7 }], { size: 12.5, colour: SOFT });

p.arrowMark(at(DI, 0), at(DI, HI), { stroke: ASK, width: 2.6 });

// ---- the three rays, each by its own rule ---------------------------------
const tip = { u: -DO, v: HO };
const beyond = 74;                                   // where the rays stop, cm
const lineAt = (x0, y0, x1, y1, x) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);

// 1. parallel in, then through the far focus
const r1 = [at(tip.u, tip.v), at(0, tip.v), at(beyond, lineAt(0, tip.v, F, 0, beyond))];
// 2. straight through the centre
const r2 = [at(tip.u, tip.v), at(0, 0), at(beyond, lineAt(tip.u, tip.v, 0, 0, beyond))];
// 3. through the near focus, then parallel
const hitsLensAt = lineAt(tip.u, tip.v, -F, 0, 0);
const r3 = [at(tip.u, tip.v), at(0, hitsLensAt), at(beyond, hitsLensAt)];

p.poly(r1, { stroke: "#B3400C", width: 1.7 });
p.poly(r2, { stroke: "#0F7360", width: 1.7 });
p.poly(r3, { stroke: "#6C3FA8", width: 1.7 });

// Where each ray is at the solved image plane. Three rules, three answers,
// and the constraint below is the assertion that they are one answer.
const ends = [
  ["ray-parallel", at(DI, lineAt(0, tip.v, F, 0, DI))],
  ["ray-centre", at(DI, lineAt(tip.u, tip.v, 0, 0, DI))],
  ["ray-focus", at(DI, hitsLensAt)],
];
ends.forEach(([id, q]) => p.marker(id, q));
p.coincident(ends.map(([id]) => id));
p.disc(at(DI, HI), 4.6, ASK);

// Numbered where the three rays are furthest apart -- just past the lens -- and
// not at their far ends, where they crowd into the image point on purpose.
const mark = 9;
p.place("1", at(mark, lineAt(0, tip.v, F, 0, mark)).x, at(mark, lineAt(0, tip.v, F, 0, mark)).y - 13,
  [{ x: 0, y: -1 }, { x: 1, y: -0.5 }], { size: 12.5, colour: "#B3400C", weight: 700 });
p.place("2", at(mark, lineAt(tip.u, tip.v, 0, 0, mark)).x, at(mark, lineAt(tip.u, tip.v, 0, 0, mark)).y - 13,
  [{ x: 0, y: -1 }, { x: 1, y: -0.5 }], { size: 12.5, colour: "#0F7360", weight: 700 });
p.place("3", at(mark, hitsLensAt).x, at(mark, hitsLensAt).y - 13,
  [{ x: 0, y: -1 }, { x: 1, y: -0.5 }], { size: 12.5, colour: "#6C3FA8", weight: 700 });

// ---- dimensions, stated below the axis ------------------------------------
p.dimension(at(-DO, 0), at(0, 0), { text: `dₒ = ${DO} cm`, drop: 80 });
p.dimension(at(0, 0), at(F, 0), { text: `f = ${F} cm`, drop: 48 });
p.dimension(at(0, 0), at(DI, 0), { text: "dᵢ = ?", drop: 112, colour: ASK, weight: 600 });

// ---- what is asked, marked where it is ------------------------------------
p.ask("h′ = ?", at(DI, HI / 2).x + 32, at(DI, HI / 2).y, [{ x: 1, y: 0 }, { x: 1, y: 0.6 }]);
p.ask("m = ?", at(DI, HI).x + 26, at(DI, HI).y + 22, [{ x: 0.6, y: 1 }, { x: 1, y: 0 }]);
p.place("image", at(DI, HI).x - 40, at(DI, HI).y + 6, [{ x: -1, y: 0 }, { x: 0, y: 1 }], {
  size: 12.5, colour: ASK,
});

p.label(
  "Three rules, three rays, one point. The construction is the equation — and the render fails if they miss.",
  p.W / 2, 560, { size: 12.5, colour: FAINT },
);

p.question([
  `A converging lens of focal length f = ${F} cm stands ${DO} cm from a ${HO.toFixed(1)} cm upright object.`,
  "(a)  How far from the lens does the image form, and on which side?      (b)  What is the magnification?",
  "(c)  Is the image real or virtual, upright or inverted — and how does the drawing tell you, without measuring?",
  "(d)  Name the rule each numbered ray follows. Why is any one of the three enough on its own?",
]);

p.write(process.argv[2] ?? "experiments/exercises/phys-lens.json");
console.log(`  solved: d_i = ${DI} cm, m = ${M}, h' = ${HI} cm`);
