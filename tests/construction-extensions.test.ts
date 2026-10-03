/**
 * construction extensions (ADR 0067): sectors, rings, belts, semicircles, boundary regions, dimension lines,
 * direction paths on a lattice and rotation axes. Every shape is held to its closed form without rendering, every
 * printed measure is measured by the existing checks on a rendered figure, and `answers: false` is exercised.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { computeConstruction, expandConstruction, regionOf, validateConstructionInput } from "../src/presets/construction/preset.ts";
import type { ConstructionInput, ConstructionObject } from "../src/presets/construction/preset.ts";
import {
  TAU,
  annularSectorPieces,
  arcPoint,
  beltGeometry,
  dimensionGeometry,
  hatchLines,
  piecesArea,
  ringOutline,
  sampleArc,
  sectorPieces,
  semicirclePieces,
} from "../src/presets/construction/shapes.ts";
import * as vec from "../src/geometry/vec.ts";
import type { Vec2 } from "../src/geometry/vec.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const close = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} ≠ ${b}`);
const fixtureDir = fileURLToPath(new URL("../fixtures/construction/", import.meta.url));
const fixture = (name: string): ConstructionInput => JSON.parse(readFileSync(`${fixtureDir}${name}`, "utf8")) as ConstructionInput;
const kids = (input: ConstructionInput): Block[] => (expandConstruction(input).root as Scene).children as Block[];
const printed = (input: ConstructionInput): string[] => kids(input).map((b) => b.label ?? "").filter((t) => t !== "");
const checks = async (input: ConstructionInput) => (await render(expandConstruction(input), { raster: false })).manifest.checks;
const shape = (m: Map<string, ConstructionObject>, n: string) => m.get(n) as Extract<ConstructionObject, { kind: "shape" }>;

// ---- closed forms -----------------------------------------------------------------------------------------

test("a sector's area is r²θ/2 and a ring's is π(R² − r²), by Green's theorem over the pieces and by the shoelace of the outline", () => {
  const r = 5;
  const span = (72 * Math.PI) / 180;
  close(piecesArea(sectorPieces([2, -1], r, 0.3, span)), (r * r * span) / 2);
  close(piecesArea(annularSectorPieces([0, 0], 3, 5, 1, 0.8)), (0.8 * (25 - 9)) / 2);
  const poly = ringOutline([1, 1], 3, 5);
  let twice = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    twice += p[0] * q[1] - q[0] * p[1];
  });
  // the sampled outline underestimates π by the chord error only
  assert.ok(Math.abs(Math.abs(twice) / 2 - Math.PI * 16) < 0.02, `${Math.abs(twice) / 2}`);
  close(piecesArea(semicirclePieces([0, 0], [4, 0], 1).pieces), (Math.PI * 4) / 2);
});

test("a belt is two tangent segments and two wrapped arcs: external 2√(d²−(r₁−r₂)²) + r₁(2π−2φ) + r₂·2φ, crossed with φ from r₁+r₂", () => {
  const c1 = { center: [0, 0] as Vec2, radius: 4 };
  const c2 = { center: [14, 0] as Vec2, radius: 8 };
  const ext = beltGeometry(c1, c2, "external");
  const phi = Math.acos((4 - 8) / 14);
  close(ext.length, 2 * Math.sqrt(196 - 16) + 4 * (TAU - 2 * phi) + 8 * 2 * phi);
  // each tangent point is on its circle and the radius to it is perpendicular to the tangent
  for (const [p, q] of ext.tangents) {
    close(vec.distance(p, c1.center), 4);
    close(vec.distance(q, c2.center), 8);
    close(vec.dot(vec.sub(p, c1.center), vec.sub(q, p)), 0, 1e-9);
    close(vec.dot(vec.sub(q, c2.center), vec.sub(q, p)), 0, 1e-9);
    close(vec.distance(p, q), ext.tangentLength);
  }
  const crossed = beltGeometry({ center: [0, 0], radius: 3 }, { center: [12, 0], radius: 5 }, "crossed");
  const phiC = Math.acos(8 / 12);
  close(crossed.length, 2 * Math.sqrt(144 - 64) + 8 * (TAU - 2 * phiC));
  for (const [p, q] of crossed.tangents) {
    close(vec.dot(vec.sub(p, [0, 0]), vec.sub(q, p)), 0, 1e-9);
    close(vec.dot(vec.sub(q, [12, 0]), vec.sub(q, p)), 0, 1e-9);
  }
  // equal pulleys: the straight runs are the centre distance and the arcs are half circles
  const eq = beltGeometry({ center: [0, 0], radius: 2 }, { center: [10, 0], radius: 2 }, "external");
  close(eq.length, 20 + 2 * Math.PI * 2);
});

test("hatch lines lie inside the polygon, a gap apart, and leave a hole bare", () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const lines = hatchLines(sq, 45, 10);
  assert.ok(lines.length >= 13 && lines.length <= 16, `${lines.length}`);
  for (const [a, b] of lines) for (const p of [a, b]) assert.ok(p.x >= -1e-6 && p.x <= 100 + 1e-6 && p.y >= -1e-6 && p.y <= 100 + 1e-6);
  const ring = ringOutline([50, 50], 20, 45).map(([x, y]) => ({ x: x!, y: y! }));
  const through = hatchLines(ring, 0, 6).filter(([a]) => Math.abs(a.y - 50) < 3);
  for (const [a, b] of through) assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 26, "no hatch line crosses the hole");
});

test("a dimension line is as long as what it measures, with extension lines off the measured points", () => {
  const g = dimensionGeometry([0, 0], [6, 0], 0.7, -1, 0.05, 0.1);
  close(vec.distance(g.line[0], g.line[1]), 6);
  close(g.line[0][1], -0.7);
  close(g.extensions[0]![0][1], -0.05);
  close(g.extensions[0]![1][1], -0.8);
  assert.deepEqual(g.normal.map((x) => Math.round(x)), [0, -1].map((x) => x + 0));
});

// ---- constructions ---------------------------------------------------------------------------------------

test("Hippocrates: the two lunes together are the right triangle's area, from the boundary pieces alone", () => {
  const m = computeConstruction(fixture("hippocrates-lunes.json")).objects;
  const a1 = regionOf(m.get("L1")!)!.area;
  const a2 = regionOf(m.get("L2")!)!.area;
  const t = regionOf(m.get("T")!)!.area;
  close(t, 6);
  close(a1 + a2, t, 1e-9);
  assert.ok(a1 > 0 && a2 > 0 && Math.abs(a1 - a2) > 0.5);
});

test("semicircles on a right triangle's sides: the two on the legs sum to the one on the hypotenuse (Pythagoras for areas)", () => {
  const m = computeConstruction(fixture("semicircles-on-sides.json")).objects;
  const s = ["s1", "s2", "s3"].map((n) => regionOf(m.get(n)!)!.area);
  close(s[0]! + s[1]!, s[2]!, 1e-9);
  // "away" puts each half-disc outside the triangle
  const cc = (n: string): Vec2 => (shape(m, n).data as { c: Vec2 }).c;
  const tri = regionOf(m.get("T")!)!.poly;
  const centroid: Vec2 = [tri.reduce((t, p) => t + p[0], 0) / 3, tri.reduce((t, p) => t + p[1], 0) / 3];
  for (const n of ["s1", "s2", "s3"]) {
    const d = shape(m, n).data as { a: Vec2; b: Vec2; side: 1 | -1 };
    const left = vec.cross2(vec.sub(d.b, d.a), vec.sub(centroid, d.a)) > 0;
    assert.equal(d.side, left ? -1 : 1, n);
    assert.ok(cc(n) !== undefined);
  }
});

test("a circle about a square: circumradius s/√2, inradius s/2; a non-cyclic or non-tangential quadrilateral is refused", () => {
  const m = computeConstruction(fixture("square-circles.json")).objects;
  const out = (m.get("out") as Extract<ConstructionObject, { kind: "circle" }>).circle;
  const inn = (m.get("in") as Extract<ConstructionObject, { kind: "circle" }>).circle;
  close(out.radius, 4 / Math.SQRT2);
  close(inn.radius, 2);
  close(vec.distance(out.center, inn.center), 0);
  const rect = [{ A: [0, 0] }, { B: [6, 0] }, { C: [6, 3] }, { D: [0, 3] }, { name: "R", polygon: ["A", "B", "C", "D"] }];
  assert.doesNotThrow(() => computeConstruction({ objects: [...rect, { name: "o", circumcircle: "R" }] }));
  assert.throws(() => computeConstruction({ objects: [...rect, { name: "i", incircle: "R" }] }), /no incircle/);
  assert.throws(() => computeConstruction({ objects: [{ A: [0, 0] }, { B: [4, 0] }, { C: [4, 3] }, { D: [-1, 5] }, { name: "o", circumcircle: ["A", "B", "C", "D"] }] }), /not on one circle/);
});

test("a path's runs are measured segments named walk.1…, with their endpoints; a lattice is unnumbered", () => {
  const input = fixture("grid-path.json");
  const m = computeConstruction(input).objects;
  const d = shape(m, "walk").data as { pts: Vec2[] };
  assert.equal(d.pts.length, 5);
  assert.deepEqual(printed(input).sort(), ["2,83", "3", "3", "4", "A", "B", "C", "D", "DE = 2√2 ≈ 2,83", "E"], "the lattice carries no numbers of its own");
});

// ---- refusals ------------------------------------------------------------------------------------------

test("impossible shapes are refused by name", () => {
  const base = [{ O: [0, 0] }, { A: [3, 0] }, { B: [0, 3] }];
  const v = (objects: unknown[]): void => validateConstructionInput({ objects } as unknown as Record<string, unknown>);
  assert.throws(() => v([...base, { name: "S", sector: { center: "O", through: "A", angle: 400 } }]), /between 0° and 360°/);
  assert.throws(() => v([...base, { name: "S", sector: { center: "O", through: "A", angle: 30, to: "B" } }]), /not both/);
  assert.throws(() => v([...base, { name: "R", ring: { center: "O", inner: 5, outer: 3 } }]), /not smaller/);
  assert.throws(() => v([...base, { name: "s", semicircle: { on: ["A", "B"] } }]), /which side/);
  assert.throws(() => v([...base, { name: "c1", circle: { center: "O", radius: 5 } }, { name: "c2", circle: { center: "A", radius: 1 } }, { name: "b", belt: { circles: ["c1", "c2"] } }]), /nested/);
  assert.throws(
    () => v([...base, { name: "c1", circle: { center: "O", radius: 2 } }, { name: "c2", circle: { center: "A", radius: 2 } }, { name: "b", belt: { circles: ["c1", "c2"], tangents: "crossed" } }]),
    /touch or overlap/,
  );
  assert.throws(() => v([...base, { name: "g", region: { start: "O", then: [{ line: "A" }, { line: "B" }] } }, { name: "x", area: "g" }]), /does not close|exactly one of/);
  assert.throws(() => v([...base, { name: "g", region: { start: "O", then: [{ line: "A" }, { arc: { center: "O", to: "B", ccw: true } }] } }]), /not on one circle|does not close/);
  assert.throws(() => v([...base, { name: "w", path: { through: ["O", "O"] } }]), /coincide/);
  assert.throws(() => v([...base, { name: "d", dimension: { from: "O", to: "A", offset: -1 } }]), /positive/);
});

test("annotations on the wrong thing are refused", () => {
  const v = (objects: unknown[], annotations: unknown[]): void => validateConstructionInput({ objects, annotations } as unknown as Record<string, unknown>);
  const o = [{ O: [0, 0] }, { A: [3, 0] }, { name: "S", sector: { center: "O", through: "A", angle: 60 } }];
  assert.throws(() => v(o, [{ area: "A" }]), /encloses no region|point/);
  assert.throws(() => v(o, [{ arc: "A" }]), /./);
  assert.throws(() => v(o, [{ angle: "A" }]), /sector/);
  assert.doesNotThrow(() => v(o, [{ area: "S" }, { arc: "S" }, { angle: "S" }, { radius: "S" }]));
});

// ---- the checks measure what is printed ------------------------------------------------------------------

for (const name of readdirSync(fixtureDir).filter((n) => /^(sector-area|ring|annular-sector|belt-pulleys|hippocrates-lunes|semicircles-on-sides|floor-plan-dimensions|grid-path|trapezoid-rotation-axis|square-circles)\.json$/.test(n))) {
  test(`${name} renders with every check passing, also with answers: false`, { timeout: 240000 }, async () => {
    for (const input of [fixture(name), { ...fixture(name), answers: false }]) {
      const cs = await checks(input);
      const failing = cs.filter((c) => c.status === "fail");
      assert.equal(failing.length, 0, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
    }
  });
}

test("a sector's area, angle and radius are measured by area-, sweep- and length-matches-its-label; a lying label fails", { timeout: 240000 }, async () => {
  const input = fixture("sector-area.json");
  const cs = await checks(input);
  const area = cs.find((c) => c.id === "area-matches-its-label" && c.status === "pass");
  assert.ok(area !== undefined, JSON.stringify(cs.filter((c) => c.id === "area-matches-its-label")));
  assert.equal(cs.find((c) => c.id === "sweep-matches-its-label")?.status, "pass");
  assert.equal(cs.find((c) => c.id === "length-matches-its-label" && c.status === "pass") !== undefined, true);
  const spec = expandConstruction(input);
  const label = ((spec.root as Scene).children as Block[]).find((b) => /^A = /.test(b.label ?? ""))!;
  label.label = "A = 20 cm²";
  const bad = (await render(spec, { raster: false })).manifest.checks.find((c) => c.id === "area-matches-its-label" && c.status === "fail");
  assert.ok(bad !== undefined, "a wrong area label must fail area-matches-its-label");
});

test("a dimension line's printed length is measured against the line; the belt's tangent lengths too", { timeout: 240000 }, async () => {
  for (const [file, owner] of [
    ["floor-plan-dimensions.json", /^dim-/],
    ["belt-pulleys.json", /^o-belt-t/],
  ] as const) {
    const cs = await checks(fixture(file));
    const lengths = cs.filter((c) => c.id === "length-matches-its-label" && owner.test(c.target));
    assert.ok(lengths.length >= 2, `${file}: ${lengths.length}`);
    for (const c of lengths) assert.equal(c.status, "pass", c.detail);
  }
  const spec = expandConstruction(fixture("floor-plan-dimensions.json"));
  const six = ((spec.root as Scene).children as Block[]).find((b) => b.label === "6 m")!;
  six.label = "7 m";
  const bad = (await render(spec, { raster: false })).manifest.checks.find((c) => c.id === "length-matches-its-label" && c.status === "fail");
  assert.ok(bad !== undefined);
});

test("answers: false keeps what the exercise gives and hides what it asks", () => {
  const sector = printed({ ...fixture("sector-area.json"), answers: false });
  assert.ok(sector.includes("r = 5 cm") && sector.includes("72°"), sector.join("|"));
  assert.ok(!sector.some((t) => /A = |ℓ/.test(t)), sector.join("|"));
  const plan = printed({ ...fixture("floor-plan-dimensions.json"), answers: false });
  assert.ok(plan.includes("6 m") && plan.includes("3 m") && plan.includes("x") && !plan.includes("x = 1 m"), plan.join("|"));
  const belt = printed({ ...fixture("belt-pulleys.json"), answers: false });
  assert.ok(!belt.some((t) => /correia|T1U1|cm$/.test(t) && !/^[rR] = /.test(t)), belt.join("|"));
  assert.ok(belt.includes("r = 6 cm"));
  const lunes = printed({ ...fixture("hippocrates-lunes.json"), answers: false });
  assert.deepEqual(lunes.filter((t) => /=/.test(t)), []);
});

test("sampled arcs stay within 0,03 px of the circle at the sizes drawn", () => {
  const pts = sampleArc([0, 0], 150, 0, TAU);
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const mid = vec.lerp(pts[i]!, pts[i + 1]!, 0.5);
    assert.ok(150 - vec.distance(mid, [0, 0]) < 0.03);
  }
  close(vec.distance(arcPoint([1, 1], 2, Math.PI / 2), [1, 3]), 0);
});
