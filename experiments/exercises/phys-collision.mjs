/*
 * PHYSICS 2 -- a two-dimensional collision, and the triangle that closes.
 *
 * Momentum before is one vector. Momentum after is two. Conservation says the
 * two must add head-to-tail back to the first, and that is not a fact stated
 * in the caption here -- it is the reason the triangle drawn on the right
 * CLOSES. The unknown momentum is solved from the other two by components, so
 * if the arithmetic were wrong the last arrowhead would land somewhere other
 * than where the first vector's tail is, and two align constraints on
 * orthogonal axes report exactly that.
 *
 * The known deflection carries an angle mark whose sweep is derived from its
 * own arms, with the number printed beside it -- so `sweep-matches-its-label`
 * measures the arc that was drawn against the "30°" that was typed. The
 * unknown deflection gets an arc too, and a "?" instead of a number.
 *
 * `allowCurvedConnectors` is on because an angle mark cannot exist without it.
 *
 *   node experiments/exercises/phys-collision.mjs
 */
import { Plate, INK, SOFT, FAINT, RULE, ASK, KEY, WARM, rad, deg } from "./sheet.mjs";

// ---- stated ---------------------------------------------------------------
const M1 = 3.0;      // kg
const M2 = 2.0;      // kg
const U1 = 8.0;      // m/s, along +x
const V1 = 5.0;      // m/s after
const TH1 = 30;      // degrees above the axis, after

// ---- solved: conservation of momentum, component by component -------------
const P0 = { x: M1 * U1, y: 0 };
const P1 = { x: M1 * V1 * Math.cos(rad(TH1)), y: M1 * V1 * Math.sin(rad(TH1)) };
const P2 = { x: P0.x - P1.x, y: P0.y - P1.y };
const V2 = Math.hypot(P2.x, P2.y) / M2;
const TH2 = deg(Math.atan2(P2.y, P2.x));

const p = new Plate({ subject: "Physics", title: "The triangle has to close", height: 820 });
p.relax({ allowCurvedConnectors: true });

// ==========================================================================
// left: the collision itself
// ==========================================================================
const S = p.plane("bench", { x: 300, y: 330, xUnit: 15, yUnit: 15 });
const at = S.at;

p.label("ON THE TABLE", 300, 132, { size: 11, colour: FAINT, weight: 600, tracking: 2 });

// The table's centre line, cut where a puck actually covers it rather than
// drawn as one line underneath. Drawn first, so the pucks' fills paint over
// its cut ends -- but the CUT is what keeps the geometry honest: a name
// centred on a puck sits on the axis in canvas coordinates whether or not
// something is drawn on top of it, and text-clear-of-ink checks the geometry,
// not which layer a reader's eye resolves as "on top".
const AXIS_Y = 0;
const PUCK1 = { cx: -7.4, r: 17 };
const PUCK2 = { cx: 0, r: 14 };
const gaps = [PUCK1, PUCK2]
  .map(({ cx, r }) => [at(cx, AXIS_Y).x - r, at(cx, AXIS_Y).x + r])
  .sort((a, b) => a[0] - b[0]);
let cursor = at(-9.5, AXIS_Y).x;
for (const [lo, hi] of gaps) {
  if (lo > cursor) p.seg({ x: cursor, y: at(0, AXIS_Y).y }, { x: lo, y: at(0, AXIS_Y).y }, { stroke: RULE, width: 1, lineStyle: "dashed" });
  cursor = hi;
}
p.seg({ x: cursor, y: at(0, AXIS_Y).y }, { x: at(9.5, AXIS_Y).x, y: at(0, AXIS_Y).y }, { stroke: RULE, width: 1, lineStyle: "dashed" });

const puck = (q, r, fill, name) => {
  p.disc(q, r, fill);
  p.circle(q, r, { stroke: INK, width: 1.3 });
  p.label(name, q.x, q.y, { size: 12.5, colour: "#FFFFFF", weight: 700, claim: false });
};

// before
puck(at(-7.4, 0), 17, KEY, "m₁");
p.arrowMark(at(-6.2, 0), at(-2.6, 0), { stroke: KEY, width: 2.6 });
p.place(`u₁ = ${U1.toFixed(1)} m/s`, at(-4.4, 0).x, at(-4.4, 0).y - 22, [{ x: 0, y: -1 }], { size: 12.5, colour: KEY });
puck(at(0, 0), 14, "#8E6C1F", "m₂");
p.place(`m₁ = ${M1.toFixed(1)} kg`, at(-7.4, 0).x, at(-7.4, 0).y - 34, [{ x: 0, y: -1 }], { size: 12.5, colour: SOFT });
// Both facts about m2 in one label, set BELOW it: the wedge above and to the
// right of the origin belongs to the two angle marks, and an annotation has to
// be the nearest thing to the arc it names.
p.place(`m₂ = ${M2.toFixed(1)} kg
at rest`, at(0, 0).x - 6, at(0, 0).y + 46, [{ x: -0.3, y: 1 }, { x: -1, y: 0.4 }], {
  size: 12.5, colour: SOFT,
});

// after -- both pucks leave the SAME point, at their true bearings
const O = at(0, 0);
const away = 128;
const a1 = { x: O.x + away * Math.cos(rad(TH1)), y: O.y - away * Math.sin(rad(TH1)) };
const a2 = { x: O.x + away * 0.86 * Math.cos(rad(TH2)), y: O.y - away * 0.86 * Math.sin(rad(TH2)) };
p.arrowMark({ x: O.x + 26 * Math.cos(rad(TH1)), y: O.y - 26 * Math.sin(rad(TH1)) }, a1, { stroke: KEY, width: 2.6 });
p.arrowMark({ x: O.x + 26 * Math.cos(rad(TH2)), y: O.y - 26 * Math.sin(rad(TH2)) }, a2, { stroke: ASK, width: 2.6 });
p.place(`v₁ = ${V1.toFixed(1)} m/s`, a1.x + 44, a1.y - 20, [{ x: 0.6, y: -0.8 }, { x: 1, y: 0 }], { size: 12.5, colour: KEY });
p.ask("v₂ = ?", a2.x + 42, a2.y + 20, [{ x: 0.6, y: 0.8 }, { x: 1, y: 0 }]);

// The angle marks. Both derive their sweep from their own arms; only the known
// one prints a number, so only it can be caught disagreeing with the drawing.
// The arc sits far enough out, and its label close enough in, that the label is
// nearer the arc it names than the axis beneath it -- which is what
// `annotation-nearest-its-owner` is measuring.
p.angle(O, 0, TH1, 106, `${TH1}°`, { colour: KEY, out: 14 });
// A wider label than "30°" needs more radial clearance at the same `out`: an
// upright box that wide reaches further round the arc's own curve before its
// edge clears it. `text-clear-of-ink` grants this label a pass against its
// own arc either way (it's what `annotates` is for) -- this is legibility,
// not the check, and the check cannot see a glyph sliced by a curve under it.
p.angle(O, TH2, 0, 96, "θ₂ = ?", { colour: ASK, out: 32 });

// ==========================================================================
// right: the same three vectors, head to tail
// ==========================================================================
const T = p.plane("momentum", { x: 700, y: 330, xUnit: 11, yUnit: 11 });
p.label("THE MOMENTUM, HEAD TO TAIL", 856, 132, { size: 11, colour: FAINT, weight: 600, tracking: 2 });

const tail = T.at(0, 0);
const afterP1 = T.at(P1.x, P1.y);
// Where p2 actually ENDS -- computed by adding it to p1, never by reusing p0.
// If it landed on p0's head by construction the closure would prove nothing.
const sum = { x: P1.x + P2.x, y: P1.y + P2.y };
const afterP2 = T.at(sum.x, sum.y);
const headP0 = T.at(P0.x, P0.y);

// p₀ along the base, then p₁ and p₂ laid on its head in turn.
p.arrowMark(tail, headP0, { stroke: SOFT, width: 2.4 });
p.arrowMark(tail, afterP1, { stroke: KEY, width: 2.4 });
p.arrowMark(afterP1, afterP2, { stroke: ASK, width: 2.4 });

p.place(`p₀ = ${P0.x.toFixed(0)} kg·m/s`, (tail.x + headP0.x) / 2, tail.y + 26, [{ x: 0, y: 1 }], {
  size: 12.5, colour: SOFT,
});
p.place("p₁", (tail.x + afterP1.x) / 2 - 14, (tail.y + afterP1.y) / 2 - 14, [{ x: -0.5, y: -1 }], {
  size: 13, colour: KEY, weight: 600,
});
p.ask("p₂", (afterP1.x + afterP2.x) / 2 + 16, (afterP1.y + afterP2.y) / 2, [{ x: 1, y: 0 }, { x: 0.5, y: -1 }]);

// The closure, asserted rather than admired.
p.marker("p0-head", headP0);
p.marker("p2-head", afterP2);
p.coincident(["p0-head", "p2-head"]);
p.disc(headP0, 4.2, WARM);

p.place("the third side is not drawn to fit —\nit is what conservation leaves over", afterP2.x - 40, afterP2.y + 74,
  [{ x: 0, y: 1 }, { x: -1, y: 0.4 }], { size: 11.5, colour: FAINT });

p.label(
  "Solve the components wrong and the last arrowhead misses the first tail — which is a failed check, not a bad drawing.",
  p.W / 2, 620, { size: 12.5, colour: FAINT },
);

p.question([
  `A ${M1.toFixed(1)} kg puck sliding at ${U1.toFixed(1)} m/s strikes a stationary ${M2.toFixed(1)} kg puck on a frictionless table.`,
  `It leaves at ${V1.toFixed(1)} m/s, deflected ${TH1}° from its original line.`,
  "(a)  Find the speed of the second puck and the angle θ₂ it leaves at.      (b)  Is the collision elastic? Show why.",
  "(c)  The triangle on the right closes. Which physical law is that, and which side of it did you have to compute?",
]);

p.write(process.argv[2] ?? "experiments/exercises/phys-collision.json");
console.log(`  solved: v2 = ${V2.toFixed(3)} m/s at ${TH2.toFixed(2)}°`);
