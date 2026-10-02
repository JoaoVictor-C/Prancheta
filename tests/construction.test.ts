/**
 * construction: every point, line and circle is computed from its definition
 * through the shared vector algebra (ADR 0043); conics are drawn from their
 * foci/directrix and must satisfy their focal definitions; canonical
 * equations are computed; impossible constructions are refused by name; and
 * the only typed-looking text -- lengths and angles -- is measured by
 * `length-matches-its-label` and `sweep-matches-its-label` against the drawing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  angleAt,
  circleEquation,
  computeConstruction,
  conicEquation,
  expandConstruction,
  incenterOf,
  lineEquation,
  rotateAbout,
  sampleConic,
  validateConstructionInput,
} from "../src/presets/construction/preset.ts";
import type { ConstructionInput, ConstructionObject, Conic } from "../src/presets/construction/preset.ts";
import * as vec from "../src/geometry/vec.ts";
import type { Vec2 } from "../src/geometry/vec.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const EPS = 1e-9;
const close = (a: number, b: number, eps = EPS): void => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} ≠ ${b}`);
const closeV = (a: Vec2, b: Vec2, eps = EPS): void => {
  close(a[0], b[0], eps);
  close(a[1], b[1], eps);
};

const build = (objects: ConstructionInput["objects"], extra: Partial<ConstructionInput> = {}) => computeConstruction({ objects, ...extra }).objects;
const pt = (m: Map<string, ConstructionObject>, n: string): Vec2 => {
  const o = m.get(n)!;
  assert.equal(o.kind, "point", `${n} is a point`);
  return (o as { p: Vec2 }).p;
};
const line = (m: Map<string, ConstructionObject>, n: string) => (m.get(n) as Extract<ConstructionObject, { kind: "linear" }>).line;
const circ = (m: Map<string, ConstructionObject>, n: string) => (m.get(n) as Extract<ConstructionObject, { kind: "circle" }>).circle;
const conic = (m: Map<string, ConstructionObject>, n: string): Conic => (m.get(n) as Extract<ConstructionObject, { kind: "conic" }>).conic;

const TRI: ConstructionInput["objects"] = [{ A: [0, 0] }, { B: [6, 0] }, { C: [2, 4] }];

// --- derived points, each against vec.ts --------------------------------------

test("midpoint, foot, reflection and rotation are the vec.ts constructions", () => {
  const m = build([
    ...TRI,
    { name: "M", midpoint: ["A", "C"] },
    { name: "H", foot: { of: "C", on: "AB" } },
    { name: "C'", reflection: { of: "C", over: "AB" } },
    { name: "C''", reflection: { of: "C", over: "M" } },
    { name: "R", rotation: { of: "B", about: "A", angle: 90 } },
  ]);
  closeV(pt(m, "M"), vec.lerp([0, 0], [2, 4], 0.5));
  closeV(pt(m, "H"), vec.footOfPerpendicular2([2, 4], vec.lineThrough2([0, 0], [6, 0])));
  closeV(pt(m, "C'"), [2, -4]);
  closeV(pt(m, "C''"), [0, 0]);
  closeV(pt(m, "R"), [0, 6]);
  closeV(rotateAbout([1, 0], [0, 0], 180), [-1, 0]);
});

test("intersections: two lines, a line and a circle (with which/other), two circles", () => {
  const m = build([
    ...TRI,
    { name: "r", line: ["A", "C"] },
    { name: "s", line: ["B", "C"] },
    { name: "P", intersection: ["r", "s"] },
    { name: "c", circle: { center: "A", radius: 5 } },
    { name: "Q0", intersection: ["r", "c"], which: 0 },
    { name: "Q1", intersection: ["r", "c"], which: 1 },
    { name: "d", circle: { center: "B", radius: "dist(A,B)" } },
    { name: "X", intersection: ["c", "d"], which: 1 },
    { name: "Y", intersection: ["c", "d"], other: "X" },
  ]);
  closeV(pt(m, "P"), [2, 4]);
  const lc = vec.intersectLineCircle2(line(m, "r"), circ(m, "c"));
  assert.equal(lc.kind, "two");
  if (lc.kind === "two") {
    closeV(pt(m, "Q0"), lc.points[0]);
    closeV(pt(m, "Q1"), lc.points[1]);
  }
  close(circ(m, "d").radius, 6);
  const cc = vec.intersectCircles2(circ(m, "c"), circ(m, "d"));
  assert.equal(cc.kind, "two");
  if (cc.kind === "two") {
    closeV(pt(m, "X"), cc.points[1]);
    closeV(pt(m, "Y"), cc.points[0]);
  }
});

test("triangle centres: centroid, incentre, circumcentre, orthocentre", () => {
  const m = build([
    ...TRI,
    { name: "G", centroid: ["A", "B", "C"] },
    { name: "I", incenter: ["A", "B", "C"] },
    { name: "O", circumcenter: ["A", "B", "C"] },
    { name: "H", orthocenter: ["A", "B", "C"] },
  ]);
  const [a, b, c] = [pt(m, "A"), pt(m, "B"), pt(m, "C")];
  closeV(pt(m, "G"), [8 / 3, 4 / 3]);
  const I = pt(m, "I");
  closeV(I, incenterOf(a, b, c));
  // The incentre is equidistant from the three sides.
  const dAB = vec.distancePointToLine2(I, vec.lineThrough2(a, b));
  close(vec.distancePointToLine2(I, vec.lineThrough2(b, c)), dAB);
  close(vec.distancePointToLine2(I, vec.lineThrough2(c, a)), dAB);
  closeV(pt(m, "O"), vec.circleThroughThreePoints2(a, b, c).center);
  // The orthocentre: AH ⟂ BC and BH ⟂ CA.
  const H = pt(m, "H");
  close(vec.dot(vec.sub(H, a), vec.sub(c, b)), 0);
  close(vec.dot(vec.sub(H, b), vec.sub(a, c)), 0);
});

test("lines: perpendicular, parallel, perpendicular bisector, angle bisector, tangent", () => {
  const m = build([
    ...TRI,
    { name: "p", perpendicular: { through: "C", to: "AB" }, draw: "segment" },
    { name: "q", parallel: { through: "C", to: "AB" } },
    { name: "m", perpendicularBisector: ["A", "B"] },
    { name: "b", angleBisector: ["B", "A", "C"] },
    { name: "k", circle: { center: "B", radius: 2 } },
    { name: "t", tangent: { from: "A", to: "k" }, which: 1, touch: "T" },
  ]);
  close(vec.dot(line(m, "p").direction, [1, 0]), 0);
  const ext = (m.get("p") as Extract<ConstructionObject, { kind: "linear" }>).extent;
  assert.equal(ext.kind, "segment");
  if (ext.kind === "segment") closeV(ext.b, [2, 0]);
  close(vec.cross2(line(m, "q").direction, [1, 0]), 0);
  closeV(vec.footOfPerpendicular2([0, 0], line(m, "m")), [3, 0]);
  // The internal bisector makes equal angles with AB and AC.
  const d = line(m, "b").direction;
  close(vec.angleBetween(d, [6, 0]), vec.angleBetween(d, [2, 4]));
  // Tangent: T on the circle, BT ⟂ AT.
  const T = pt(m, "T");
  close(vec.distance(T, [6, 0]), 2);
  close(vec.dot(vec.sub(T, [6, 0]), vec.sub(T, [0, 0])), 0, 1e-9);
});

test("circles: through a point, circumcircle and incircle", () => {
  const m = build([
    ...TRI,
    { name: "c1", circle: { center: "C", through: "A" } },
    { name: "cc", circumcircle: ["A", "B", "C"] },
    { name: "ic", incircle: ["A", "B", "C"] },
  ]);
  close(circ(m, "c1").radius, Math.sqrt(20));
  const cc = circ(m, "cc");
  for (const p of [[0, 0], [6, 0], [2, 4]] as Vec2[]) close(vec.distance(p, cc.center), cc.radius);
  const ic = circ(m, "ic");
  for (const [p, q] of [[[0, 0], [6, 0]], [[6, 0], [2, 4]], [[2, 4], [0, 0]]] as [Vec2, Vec2][]) {
    close(vec.distancePointToLine2(ic.center, vec.lineThrough2(p, q)), ic.radius);
  }
});

// --- conics, against their focal definitions -----------------------------------

test("an ellipse from its foci: every drawn point has |PF₁| + |PF₂| = 2a", () => {
  const m = build([{ F1: [-4, 0] }, { F2: [4, 0] }, { name: "E", ellipse: { foci: ["F1", "F2"], a: 5 } }]);
  const e = conic(m, "E");
  assert.equal(e.type, "ellipse");
  if (e.type !== "ellipse") return;
  close(e.b, 3);
  for (const p of sampleConic(e, 100)[0]!) close(vec.distance(p, [-4, 0]) + vec.distance(p, [4, 0]), 10, 1e-9);
});

test("a turned ellipse from centre, a, b and rotation: its computed foci satisfy the focal sum", () => {
  const m = build([{ O: [1, 2] }, { name: "E", ellipse: { center: "O", a: 5, b: 3, rotation: 30 } }]);
  const e = conic(m, "E");
  if (e.type !== "ellipse") throw new Error("not an ellipse");
  close(vec.distance(e.foci[0], e.foci[1]), 8);
  for (const p of sampleConic(e, 100)[0]!) close(vec.distance(p, e.foci[0]) + vec.distance(p, e.foci[1]), 10, 1e-9);
  assert.equal(conicEquation(e), null, "a turned ellipse has no canonical equation");
});

test("a hyperbola from its foci: both branches have ||PF₁| − |PF₂|| = 2a", () => {
  const m = build([{ F1: [-3, 1] }, { F2: [7, 1] }, { name: "H", hyperbola: { foci: ["F1", "F2"], a: 3 } }]);
  const h = conic(m, "H");
  const branches = sampleConic(h, 50);
  assert.equal(branches.length, 2);
  for (const branch of branches) {
    for (const p of branch) close(Math.abs(vec.distance(p, [-3, 1]) - vec.distance(p, [7, 1])), 6, 1e-8);
  }
});

test("a parabola from focus and directrix: every point is as far from F as from d", () => {
  const m = build([
    { F: [0, 2] },
    { D1: [-1, -2] },
    { D2: [1, -2] },
    { name: "d", line: ["D1", "D2"] },
    { name: "P", parabola: { focus: "F", directrix: "d" } },
  ]);
  const p = conic(m, "P");
  const d = line(m, "d");
  for (const q of sampleConic(p, 20)[0]!) close(vec.distance(q, [0, 2]), vec.distancePointToLine2(q, d), 1e-9);
});

// --- canonical equations --------------------------------------------------------

test("canonical equations are computed, pt-BR, exact", () => {
  const eq = (objects: ConstructionInput["objects"], n: string): string | null => conicEquation(conic(build(objects), n));
  assert.equal(eq([{ F1: [-4, 0] }, { F2: [4, 0] }, { name: "E", ellipse: { foci: ["F1", "F2"], a: 5 } }], "E"), "x²/25 + y²/9 = 1");
  assert.equal(eq([{ F1: [0, -4] }, { F2: [0, 4] }, { name: "E", ellipse: { foci: ["F1", "F2"], a: 5 } }], "E"), "x²/9 + y²/25 = 1");
  assert.equal(eq([{ F1: [-3, 1] }, { F2: [7, 1] }, { name: "H", hyperbola: { foci: ["F1", "F2"], a: 3 } }], "H"), "(x − 2)²/9 − (y − 1)²/16 = 1");
  assert.equal(eq([{ F1: [0, -5] }, { F2: [0, 5] }, { name: "H", hyperbola: { foci: ["F1", "F2"], a: 4 } }], "H"), "y²/16 − x²/9 = 1");
  const parabola = (f: Vec2, d1: Vec2, d2: Vec2): string | null =>
    eq([{ F: f }, { D1: d1 }, { D2: d2 }, { name: "d", line: ["D1", "D2"] }, { name: "P", parabola: { focus: "F", directrix: "d" } }], "P");
  assert.equal(parabola([0, 2], [-1, -2], [1, -2]), "x² = 8y");
  assert.equal(parabola([-1, 0], [1, -1], [1, 1]), "y² = −4x");
  assert.equal(parabola([2, 3], [0, 1], [1, 1]), "(x − 2)² = 4(y − 2)");
  assert.equal(eq([{ O: [0, 0] }, { name: "E", ellipse: { center: "O", a: Math.sqrt(2), b: 1 } }], "E"), "x²/2 + y² = 1");
  assert.equal(lineEquation(vec.lineThrough2([-2, 1], [4, -3])), "y = −2x/3 − 1/3");
  assert.equal(lineEquation(vec.lineThrough2([3, 0], [3, 5])), "x = 3");
  assert.equal(lineEquation(vec.lineThrough2([0, 4], [2, 4])), "y = 4");
  assert.equal(lineEquation(vec.lineThrough2([0, 1], [1, 3])), "y = 2x + 1");
  assert.equal(lineEquation(vec.lineThrough2([0, 0], [1, -1])), "y = −x");
  assert.equal(circleEquation({ center: [1, -2], radius: 3 }), "(x − 1)² + (y + 2)² = 9");
  assert.equal(circleEquation({ center: [0, 0], radius: Math.sqrt(13) }), "x² + y² = 13");
});

// --- refusals, by name ------------------------------------------------------------

test("refusals name what cannot be constructed", () => {
  const refuse = (input: Partial<ConstructionInput> & { objects: ConstructionInput["objects"] }, pattern: RegExp): void =>
    assert.throws(() => expandConstruction(input as ConstructionInput), pattern);
  refuse({ objects: [...TRI, { name: "M", midpoint: ["A", "D"] }] }, /"D", which is not declared/);
  refuse({ objects: [{ Alpha: [0, 0] }, { Beta: [1, 0] }, { name: "M", midpoint: ["Alpha", "Betta"] }] }, /Did you mean "Beta"/);
  refuse(
    { objects: [...TRI, { name: "r", line: ["A", "B"] }, { name: "s", parallel: { through: "C", to: "r" } }, { name: "P", intersection: ["r", "s"] }] },
    /"r" and "s" are parallel -- they never meet/,
  );
  refuse(
    { objects: [...TRI, { name: "c", circle: { center: "A", radius: 1 } }, { name: "d", circle: { center: "B", radius: 1 } }, { name: "P", intersection: ["c", "d"], which: 0 }] },
    /circles "c" and "d" do not meet/,
  );
  refuse({ objects: [...TRI, { name: "c", circle: { center: "A", radius: 5 } }, { name: "r", line: ["A", "C"] }, { name: "P", intersection: ["r", "c"] }] }, /say which/);
  refuse({ objects: [{ A: [0, 0] }, { B: [1, 1] }, { C: [3, 3] }, { name: "T", polygon: ["A", "B", "C"] }] }, /triangle ABC is degenerate/);
  refuse({ objects: [{ A: [0, 0] }, { B: [1, 1] }, { C: [3, 3] }, { name: "O", circumcenter: ["A", "B", "C"] }] }, /degenerate/);
  refuse(
    { objects: [{ F: [0, 0] }, { D1: [-1, 0] }, { D2: [1, 0] }, { name: "d", line: ["D1", "D2"] }, { name: "P", parabola: { focus: "F", directrix: "d" } }] },
    /lies on the directrix/,
  );
  refuse({ objects: [{ F1: [-4, 0] }, { F2: [4, 0] }, { name: "E", ellipse: { foci: ["F1", "F2"], a: 4 } }] }, /2a greater than the focal distance/);
  refuse({ objects: [{ F1: [-4, 0] }, { F2: [4, 0] }, { name: "H", hyperbola: { foci: ["F1", "F2"], a: 5 } }] }, /2a less than the focal distance/);
  refuse({ objects: [...TRI, { name: "c", circle: { center: "A", radius: 5 } }, { name: "t", tangent: { from: "C", to: "c" } }] }, /inside the circle/);
  refuse({ objects: [{ O: [0, 0] }, { name: "E", ellipse: { center: "O", a: 5, b: 3, rotation: 20 } , show: ["equation"] }] }, /no canonical equation/);
  refuse({ objects: [{ A: [0, 0], label: "A(0; 0)" }] }, /types the coordinate/);
  refuse({ objects: [...TRI], annotations: [{ angle: ["B", "A", "C"], name: "30°" }] }, /types a number by hand/);
  refuse({ objects: [...TRI, { name: "T", polygon: ["A", "B", "C"] }], annotations: [{ equal: ["AB", "AC"] }] }, /equal ticks would claim/);
  refuse({ objects: [...TRI], annotations: [{ length: ["A", "B"] }] }, /no segment AB is drawn/);
  refuse({ objects: [...TRI, { name: "A", midpoint: ["B", "C"] }] }, /"A" is already declared/);
});

// --- labels: computed, and measured by the checks -----------------------------------

const fixtureDir = fileURLToPath(new URL("../fixtures/construction/", import.meta.url));
const fixture = (name: string): ConstructionInput => JSON.parse(readFileSync(`${fixtureDir}${name}`, "utf8")) as ConstructionInput;
const labels = (input: ConstructionInput): string[] => ((expandConstruction(input).root as Scene).children as Block[]).map((b) => b.label ?? "");

test("printed measures are computed: 3-4-5, the altitude 2,4, the base angle, exact roots in the panel", () => {
  const right = labels(fixture("right-triangle-altitude.json"));
  for (const t of ["3", "4", "5", "h = 2,4", "36,87°", "∠CBA ≈ 36,87°"]) assert.ok(right.includes(t), `missing "${t}" in ${JSON.stringify(right)}`);
  const iso = labels(fixture("isosceles.json"));
  assert.ok(iso.includes("52°"), "the base angle is measured off the construction, not typed");
  assert.ok(iso.includes("x"));
  const ga = labels(fixture("analytic-distance-midpoint.json"));
  for (const t of ["d = 7,21", "d = 2√13 ≈ 7,21", "r: y = −2x/3 − 1/3", "M(1; −1)", "A(−2; 1)"]) assert.ok(ga.includes(t), `missing "${t}" in ${JSON.stringify(ga)}`);
  const el = labels(fixture("ellipse-foci.json"));
  assert.ok(el.includes("E: x²/25 + y²/9 = 1"));
  assert.ok(labels(fixture("hyperbola-asymptotes.json")).includes("assíntota: y = 4x/3 − 5/3"));
  assert.ok(labels(fixture("parabola-focus-directrix.json")).includes("P: x² = 8y"));
});

test("the isosceles apex angle is derived: 180 − 2·52", () => {
  const m = computeConstruction(fixture("isosceles.json")).objects;
  close(angleAt(pt(m, "A"), pt(m, "C"), pt(m, "B")), 76, 1e-9);
  close(vec.distance(pt(m, "A"), pt(m, "C")), vec.distance(pt(m, "B"), pt(m, "C")), 1e-9);
});

test("every construction fixture validates", () => {
  for (const f of readdirSync(fixtureDir).filter((n) => n.endsWith(".json"))) validateConstructionInput(fixture(f) as unknown as Record<string, unknown>);
});

for (const name of readdirSync(fixtureDir).filter((n) => n.endsWith(".json"))) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const result = await render(expandConstruction(fixture(name)), { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}

test("length and angle labels are MEASURED against the drawing, not taken on trust", { timeout: 240000 }, async () => {
  const result = await render(expandConstruction(fixture("right-triangle-altitude.json")), { raster: false });
  const lengths = result.manifest.checks.filter((c) => c.id === "length-matches-its-label");
  assert.equal(lengths.length, 4, JSON.stringify(lengths));
  for (const c of lengths) assert.equal(c.status, "pass", c.detail);
  const sweep = result.manifest.checks.find((c) => c.id === "sweep-matches-its-label");
  assert.equal(sweep?.status, "pass", sweep?.detail);
  assert.equal(sweep?.examined, 1);
  const places = result.manifest.checks.find((c) => c.id === "label-nearest-its-place");
  assert.equal(places?.status, "pass", places?.detail);

  // And a label that disagrees with its line fails: the same figure with the
  // hypotenuse's label replaced by a wrong number.
  const spec = expandConstruction(fixture("right-triangle-altitude.json"));
  const five = ((spec.root as Scene).children as Block[]).find((b) => b.label === "5")!;
  five.label = "6";
  const lying = await render(spec, { raster: false });
  const bad = lying.manifest.checks.find((c) => c.id === "length-matches-its-label" && c.status === "fail");
  assert.ok(bad !== undefined, "a wrong length label must fail length-matches-its-label");
});

// --- review of 2026-09-29: the unit follows the data, and answers can be withheld ---

const kids = (input: ConstructionInput): Block[] => (expandConstruction(input).root as Scene).children as Block[];
const printed = (input: ConstructionInput): string[] => kids(input).filter((b) => !String(b.id ?? "").startsWith("plane-tick")).map((b) => b.label ?? "");
const ticksOn = (input: ConstructionInput, axis: "x" | "y"): number => kids(input).filter((b) => new RegExp(`^plane-tick-${axis}-|^plane-tick-origin`).test(b.id ?? "")).length;
const sizeOf = (input: ConstructionInput): { w: number; h: number } => {
  const root = expandConstruction(input).root as Scene;
  return { w: root.width as number, h: root.height as number };
};
const markIds = (input: ConstructionInput): string[] => [...(((expandConstruction(input).root as Scene).marks ?? []) as { id?: string }[]).map((m) => String(m.id)), ...kids(input).map((b) => String(b.id))];
const okRender = async (input: ConstructionInput): Promise<void> => {
  const result = await render(expandConstruction(input), { raster: false });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
};

const RIGHT = (s: number, axes: boolean): ConstructionInput => ({
  axes,
  objects: [{ A: [0, 0] }, { B: [3000 * s / 1000, 0] }, { C: [0, 4 * s] }, { name: "T", polygon: ["A", "B", "C"] }],
});

test("probe: a triangle A (0; 0), B (3000; 0), C (0; 4000) on numbered axes is a sane canvas with a dozen numbers at most", { timeout: 240000 }, async () => {
  const input: ConstructionInput = {
    axes: true,
    objects: [{ A: [0, 0] }, { B: [3000, 0] }, { C: [0, 4000] }, { name: "T", polygon: ["A", "B", "C"] }],
  };
  const { w, h } = sizeOf(input);
  assert.ok(w >= 60 && w <= 4000 && h >= 60 && h <= 4000, `${w} x ${h}`);
  for (const axis of ["x", "y"] as const) assert.ok(ticksOn(input, axis) >= 3 && ticksOn(input, axis) <= 12, `${ticksOn(input, axis)} numbers on ${axis}`);
  await okRender(input);
});

test("probe: the same triangle at 0,003 is as large and as numbered", { timeout: 240000 }, async () => {
  const input: ConstructionInput = { axes: true, objects: [{ A: [0, 0] }, { B: [0.003, 0] }, { C: [0, 0.004] }, { name: "T", polygon: ["A", "B", "C"] }] };
  for (const axis of ["x", "y"] as const) assert.ok(ticksOn(input, axis) >= 3 && ticksOn(input, axis) <= 12, `${ticksOn(input, axis)} numbers on ${axis}`);
  await okRender(input);
});

test("a construction at any magnitude is the same figure, numbered or not", () => {
  for (const axes of [true, false]) {
    const at = (s: number) => ({ ...sizeOf(RIGHT(s, axes)), x: ticksOn(RIGHT(s, axes), "x"), y: ticksOn(RIGHT(s, axes), "y") });
    assert.deepEqual(at(1000), at(1), `axes ${axes}`);
    assert.deepEqual(at(0.001), at(1), `axes ${axes}`);
  }
});

test("answers: false right triangle keeps the construction and no measured number: lengths gone, unnamed angle a ?, no readings", () => {
  const input = fixture("right-triangle-altitude.json");
  const full = printed(input);
  const bare = printed({ ...input, answers: false });
  assert.ok(full.some((t) => /°/.test(t)) && full.some((t) => /^h = /.test(t)) && full.some((t) => t === "3"));
  assert.deepEqual(bare.filter((t) => t !== "").sort(), ["?", "A", "B", "C", "H", "h"].sort());
  assert.deepEqual(markIds({ ...input, answers: false }).filter((i) => /^(o-h|side-|dot-)/.test(i)).sort(), markIds(input).filter((i) => /^(o-h|side-|dot-)/.test(i)).sort(), "the drawing itself is unchanged");
});

test("answers: false analytic figure keeps a typed point's pair, drops the computed midpoint's pair, the length value and the equation", () => {
  const input = fixture("analytic-distance-midpoint.json");
  const full = printed(input);
  const bare = printed({ ...input, answers: false });
  assert.ok(full.includes("M(1; −1)") && full.includes("d = 7,21") && full.some((t) => /^r: /.test(t)));
  assert.ok(bare.includes("A(−2; 1)") && bare.includes("B(4; −3)"), bare.join("|"));
  assert.ok(bare.includes("M") && !bare.some((t) => /M\(|7,21|^r: |=/.test(t)), bare.join("|"));
  assert.ok(bare.includes("d"), "the named length is the unknown: its name stays");
});

test("answers: false conic keeps the curve and its points and drops the printed equation", () => {
  for (const name of ["ellipse-foci.json", "hyperbola-asymptotes.json", "parabola-focus-directrix.json"]) {
    const input = fixture(name);
    const bare = printed({ ...input, answers: false });
    assert.ok(printed(input).some((t) => /=/.test(t)), `${name}: the full figure prints an equation`);
    assert.ok(!bare.some((t) => /=|²/.test(t)), `${name}: ${bare.join("|")}`);
    assert.ok(markIds({ ...input, answers: false }).some((i) => i.startsWith("o-")), name);
  }
});

test('"answer": true withholds an object, its dot and label and every annotation on it, and the frame is unchanged', () => {
  const statement = fixture("right-triangle-altitude-statement.json");
  const asked = markIds(statement);
  const shown = markIds({ ...statement, answers: true });
  assert.ok(shown.includes("o-h") && shown.includes("dot-H"));
  assert.ok(!asked.includes("o-h") && !asked.includes("dot-H"));
  assert.ok(!printed(statement).some((t) => t === "H" || t === "h"), printed(statement).join("|"));
  const marked = printed(statement);
  assert.deepEqual(marked.filter((t) => t !== "").sort(), ["?", "A", "B", "C"].sort());
  // The same construction with nothing withheld has the same frame.
  const plain: ConstructionInput = { ...statement, objects: statement.objects.map(({ answer: _answer, ...rest }) => rest) };
  assert.deepEqual(sizeOf(statement), sizeOf(plain));
});

test('"answer" is checked, and is inert while answers is true', () => {
  const statement = fixture("right-triangle-altitude-statement.json");
  assert.throws(() => validateConstructionInput({ ...statement, objects: [{ A: [0, 0], answer: "yes" }, ...statement.objects.slice(1)] } as unknown as Record<string, unknown>), /answer/);
  const stripped = statement.objects.map(({ answer: _a, ...r }) => r);
  assert.deepEqual(expandConstruction({ ...statement, answers: true }), expandConstruction({ ...statement, answers: true, objects: stripped }));
});

test("answers: true (or unset) is exactly the figure it was before the option existed", () => {
  for (const f of readdirSync(fixtureDir).filter((n) => n.endsWith(".json") && !n.endsWith("-statement.json"))) {
    const input = fixture(f);
    assert.deepEqual(expandConstruction({ ...input, answers: true }), expandConstruction(input), f);
  }
});

for (const f of ["right-triangle-altitude.json", "analytic-distance-midpoint.json", "hyperbola-asymptotes.json", "ladder-wall.json", "inscribed-angle.json"]) {
  test(`${f} with answers: false renders with every check passing`, { timeout: 240000 }, async () => {
    await okRender({ ...fixture(f), answers: false });
  });
}
