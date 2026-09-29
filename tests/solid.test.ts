/**
 * solid (ADR 0046): school solids from their dimensions. Vertices agree
 * with the dimensions; the cube's hidden edges under the default camera are
 * exactly the three at the back vertex; cylinder and cone outline generators
 * are tangent to their base ellipses and are where visibility turns; every
 * printed measure is the exact value; non-positive and impossible dimensions
 * are refused by name; every fixture renders with no check failing, its
 * printed lengths measured in true 3D length.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { baseApothem, clearestDiagonal, defaultCamera, expandSolid, measuresOf, polyhedronOf, resolveSolids, validateSolidInput } from "../src/presets/solid/preset.ts";
import type { SolidDef, SolidInput } from "../src/presets/solid/preset.ts";
import { classifyEdges, coneNormal, coneView, cylinderView, edgesOf, radial, sphereView, splitCircle } from "../src/presets/solid/geometry.ts";
import { PI, add, mul, print, rat, sqrt, valueOf } from "../src/presets/solid/exact.ts";
import { cavalierCamera, makeCamera, project } from "../src/geometry/projection.ts";
import { distance, dot } from "../src/geometry/vec.ts";
import type { Vec2, Vec3 } from "../src/geometry/vec.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Mark, Scene } from "../src/ir/types.ts";

const near = (a: number, b: number, tol = 1e-9): void => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const fixturesDir = fileURLToPath(new URL("../fixtures/solid/", import.meta.url));
const fixture = (name: string): SolidInput => {
  const raw = JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf8")) as Record<string, unknown>;
  delete raw.preset;
  return raw as SolidInput;
};
const one = (def: SolidDef): SolidInput => ({ solids: [def] });
const polyOf = (def: SolidDef) => {
  const [s] = resolveSolids(one(def));
  return polyhedronOf(s!)!;
};
const cross2 = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
const printed = (x: ReturnType<typeof rat>): string => print(x).text;

// ---- vertices from dimensions -------------------------------------------------

test("a cube's eight vertices sit on its base centre, and all twelve edges are the edge", () => {
  const poly = polyOf({ kind: "cube", edge: 2, at: [1, 2, 3] });
  assert.equal(poly.vertices.length, 8);
  assert.deepEqual(poly.vertices[0], [2, 1, 3]); // A: front-left-bottom
  assert.deepEqual(poly.vertices[6], [0, 3, 5]); // G: back-right-top
  const edges = edgesOf(poly);
  assert.equal(edges.length, 12);
  for (const e of edges) near(distance(poly.vertices[e.i]!, poly.vertices[e.j]!), 2);
  for (const e of edges) assert.equal(e.faces.length, 2);
});

test("a box's edges are its width (y), depth (x) and height (z)", () => {
  const V = polyOf({ kind: "box", width: 4, depth: 3, height: 2 }).vertices;
  near(distance(V[0]!, V[1]!), 4);
  near(V[1]![1] - V[0]![1], 4);
  near(distance(V[1]!, V[2]!), 3);
  near(V[1]![0] - V[2]![0], 3);
  near(distance(V[1]!, V[5]!), 2);
  near(V[5]![2] - V[1]![2], 2);
});

test("a regular hexagonal prism: every base side is the edge, every vertex the circumradius from the axis, A B the front edge", () => {
  const V = polyOf({ kind: "prism", sides: 6, edge: 2, height: 4 }).vertices;
  for (let i = 0; i < 6; i += 1) {
    near(distance(V[i]!, V[(i + 1) % 6]!), 2);
    near(Math.hypot(V[i]![0], V[i]![1]), 2); // R = ℓ for a hexagon
    near(V[i + 6]![2] - V[i]![2], 4);
  }
  near(V[0]![0], V[1]![0]); // AB perpendicular to the view axis x
  assert.ok(V[0]![1] < V[1]![1]);
});

test("a pyramid's apex stands the height over its base centre, and its apótema is √(h² + m²)", () => {
  const V = polyOf({ kind: "pyramid", sides: 4, edge: 10, height: 12, at: [1, 1, 0] }).vertices;
  assert.deepEqual(V[4], [1, 1, 12]);
  const M: Vec3 = [(V[0]![0] + V[1]![0]) / 2, (V[0]![1] + V[1]![1]) / 2, 0];
  near(distance(V[4]!, M), 13);
  const m = measuresOf({ kind: "pyramid", sides: 4, edge: 10, height: 12 });
  assert.equal(printed(m.g!), "13");
  assert.equal(printed(m.m!), "5");
});

test("a pyramid given its apótema derives its height", () => {
  const m = measuresOf({ kind: "pyramid", sides: 4, edge: 6, slant: 5 });
  assert.equal(printed(m.h!), "4");
  const hex = measuresOf({ kind: "pyramid", sides: 6, edge: 2, slant: 3 });
  // m = √3, h = √(9 − 3) = √6
  assert.equal(printed(hex.m!), "√3");
  assert.equal(printed(hex.h!), "√6");
});

// ---- hidden edges -----------------------------------------------------------------

test("a cube in the default camera dashes exactly its 3 back edges, those meeting at D", () => {
  const input = one({ kind: "cube", edge: 2 });
  const camera = defaultCamera(["cube"]);
  assert.equal(camera.kind, "cavalier");
  const poly = polyOf(input.solids[0]!);
  const hidden = classifyEdges(camera, poly).filter((e) => !e.visible);
  assert.equal(hidden.length, 3);
  for (const e of hidden) assert.ok(e.i === 3 || e.j === 3, `hidden edge ${e.i}-${e.j} does not meet D`);
  // And the drawing says the same: 3 dashed edge marks, 9 solid.
  const marks = (expandSolid(input).root as Scene).marks!.filter((m) => m.id.includes("-edge-"));
  assert.equal(marks.length, 12);
  assert.deepEqual(marks.filter((m) => m.lineStyle === "dashed").map((m) => m.id).sort(), ["s0-edge-0-3", "s0-edge-2-3", "s0-edge-3-7"]);
});

test("a cube under another camera still hides exactly three edges at one vertex", () => {
  for (const camera of [makeCamera("isometric"), makeCamera({ kind: "orthographic", azimuth: 30, elevation: 20 }), makeCamera({ kind: "orthographic", azimuth: -40, elevation: 25 })]) {
    const hidden = classifyEdges(camera, polyOf({ kind: "cube", edge: 1 })).filter((e) => !e.visible);
    assert.equal(hidden.length, 3);
    const shared = [hidden[0]!.i, hidden[0]!.j].filter((v) => hidden.every((e) => e.i === v || e.j === v));
    assert.equal(shared.length, 1);
  }
});

test("the space diagonal drawn is never one another vertex's image lies on", () => {
  const camera = cavalierCamera();
  const V = polyOf({ kind: "cube", edge: 2 }).vertices;
  // In the cavalier view A, F and G are collinear on the page: AG is refused.
  const [a, f, g] = [project(camera, V[0]!), project(camera, V[5]!), project(camera, V[6]!)];
  near(cross2([f[0] - a[0], f[1] - a[1]], [g[0] - a[0], g[1] - a[1]]), 0);
  assert.notDeepEqual(clearestDiagonal(camera, V), [0, 6]);
});

// ---- round silhouettes --------------------------------------------------------------

for (const [name, camera] of [
  ["cavalier", cavalierCamera()],
  ["orthographic 0°/20°", makeCamera({ kind: "orthographic", azimuth: 0, elevation: 20 })],
  ["orthographic 30°/35°", makeCamera({ kind: "orthographic", azimuth: 30, elevation: 35 })],
] as const) {
  test(`cylinder outline generators are tangent to both base ellipses and bound the visible lateral half (${name})`, () => {
    const view = cylinderView(camera, [0.5, -1, 0], 2, 3);
    const axis = [project(camera, [0, 0, 3])[0] - project(camera, [0, 0, 0])[0], project(camera, [0, 0, 3])[1] - project(camera, [0, 0, 0])[1]] as Vec2;
    for (const t of view.silhouette) {
      for (const pc of [view.bottom, view.top]) {
        const tangent: Vec2 = [-Math.sin(t) * pc.p[0] + Math.cos(t) * pc.q[0], -Math.sin(t) * pc.p[1] + Math.cos(t) * pc.q[1]];
        near(cross2(tangent, axis) / (Math.hypot(...tangent) * Math.hypot(...axis)), 0, 1e-9);
      }
      near(dot(radial(view.bottom, t), camera.toward), 0, 1e-9);
    }
    // The top cap faces a camera from above: its rim is whole; the bottom rim is half dashed.
    assert.deepEqual(view.topArcs.map((a) => a.visible), [true]);
    assert.equal(view.bottomArcs.length, 2);
    for (const a of view.bottomArcs) near(a.t1 - a.t0, Math.PI, 1e-9);
    const back = view.bottomArcs.find((a) => !a.visible)!;
    assert.ok(view.bottom.depth((back.t0 + back.t1) / 2) < view.bottom.depth(view.bottom.frontCenter));
  });

  test(`cone outline generators from the apex are tangent to the base ellipse and are where the lateral surface turns away (${name})`, () => {
    const view = coneView(camera, [0, 0, 0], 2, 4);
    assert.equal(view.silhouette.length, 2);
    const apex = project(camera, view.apex);
    for (const t of view.silhouette) {
      const pc = view.base;
      const at = pc.point(t);
      const tangent: Vec2 = [-Math.sin(t) * pc.p[0] + Math.cos(t) * pc.q[0], -Math.sin(t) * pc.p[1] + Math.cos(t) * pc.q[1]];
      const toApex: Vec2 = [apex[0] - at[0], apex[1] - at[1]];
      near(cross2(tangent, toApex) / (Math.hypot(...tangent) * Math.hypot(...toApex)), 0, 1e-9);
      near(dot(coneNormal(pc, t, 2, 4), camera.toward), 0, 1e-9);
    }
    const hidden = view.baseArcs.filter((a) => !a.visible);
    assert.equal(hidden.length, 1);
    // Seen from above, the lateral surface shows more than half the base
    // rim: the generators touch it behind the ends of its major axis.
    assert.ok(hidden[0]!.t1 - hidden[0]!.t0 < Math.PI);
  });
}

test("a sphere drawn by the default camera is a circle, and its equator's back half is dashed", () => {
  const camera = defaultCamera(["sphere"]);
  assert.equal(camera.kind, "orthographic");
  const view = sphereView(camera, [0, 0, 0], 3);
  near(view.outline.ellipse.semiMajor, 3);
  near(view.outline.ellipse.semiMinor, 3);
  assert.equal(view.equatorArcs.filter((a) => !a.visible).length, 1);
  // Under the cavalier camera the same sphere is an ellipse -- why spheres get another camera.
  const oblique = sphereView(cavalierCamera(), [0, 0, 0], 3).outline.ellipse;
  assert.ok(oblique.semiMajor - oblique.semiMinor > 0.1);
});

test("splitCircle merges across 2π and classifies each arc once", () => {
  const arcs = splitCircle([1, 1 + Math.PI], (t) => Math.cos(t - 1 - Math.PI / 2) > 0);
  assert.equal(arcs.length, 2);
  assert.deepEqual(arcs.map((a) => a.visible), [true, false]);
});

// ---- exact measures -----------------------------------------------------------------

test("exact arithmetic writes what a student writes", () => {
  assert.equal(printed(mul(rat(2), sqrt(rat(3)))), "2√3");
  assert.equal(printed(sqrt(rat(20))), "2√5");
  assert.equal(printed(sqrt(rat(0.75))), "√3/2");
  assert.equal(printed(mul(PI, rat(12))), "12π");
  assert.equal(printed(mul(PI, rat(32 / 3))), "32π/3");
  assert.equal(printed(add(rat(48), mul(rat(12), sqrt(rat(3))))), "48 + 12√3");
  assert.equal(printed(rat(2.5)), "2,5");
  const pentagon = baseApothem(5, rat(2));
  assert.equal(pentagon.kind, "approx");
  assert.equal(print(pentagon).exact, false);
});

test("computed measures: cube diagonal, cone slant height, volumes and areas", () => {
  const cube = measuresOf({ kind: "cube", edge: 2 });
  assert.equal(printed(cube.D!), "2√3");
  assert.equal(printed(cube.V!), "8");
  assert.equal(printed(cube.A!), "24");
  const box = measuresOf({ kind: "box", width: 4, depth: 3, height: 2 });
  assert.equal(printed(box.D!), "√29");
  assert.equal(printed(box.V!), "24");
  assert.equal(printed(box.A!), "52");
  const cone = measuresOf({ kind: "cone", radius: 2, height: 4 });
  assert.equal(printed(cone.g!), "2√5");
  assert.equal(printed(cone.V!), "16π/3");
  assert.equal(printed(cone.A!), "4π + 4√5π");
  near(valueOf(cone.A!), Math.PI * 2 * (2 + Math.sqrt(20)));
  const cone2 = measuresOf({ kind: "cone", radius: 3, slant: 5 });
  assert.equal(printed(cone2.h!), "4");
  const cyl = measuresOf({ kind: "cylinder", radius: 2, height: 3 });
  assert.equal(printed(cyl.V!), "12π");
  assert.equal(printed(cyl.A!), "20π");
  const sphere = measuresOf({ kind: "sphere", radius: 3 });
  assert.equal(printed(sphere.V!), "36π");
  assert.equal(printed(sphere.A!), "36π");
  const hex = measuresOf({ kind: "prism", sides: 6, edge: 2, height: 4 });
  assert.equal(printed(hex.Ab!), "6√3");
  assert.equal(printed(hex.V!), "24√3");
  assert.equal(printed(hex.A!), "48 + 12√3");
  near(valueOf(hex.V!), 6 * (Math.sqrt(3) / 4) * 4 * 4);
  const pyr = measuresOf({ kind: "pyramid", sides: 4, edge: 10, height: 12 });
  assert.equal(printed(pyr.V!), "400");
  assert.equal(printed(pyr.A!), "360");
  const tri = measuresOf({ kind: "prism", sides: 3, edge: 2, height: 5 });
  assert.equal(printed(tri.Ab!), "√3");
});

test("derived solids: a sphere in a cube, round a cube, a cone in a cylinder", () => {
  const [, inner] = resolveSolids({ solids: [{ kind: "cube", name: "C", edge: 4 }, { kind: "sphere", inscribedIn: "C" }] });
  assert.equal(printed(inner!.dims.r!), "2");
  assert.deepEqual(inner!.at, [0, 0, 2]);
  const [, outer] = resolveSolids({ solids: [{ kind: "cube", name: "C", edge: 2 }, { kind: "sphere", circumscribes: "C" }] });
  assert.equal(printed(outer!.dims.r!), "√3");
  const [, cone] = resolveSolids({ solids: [{ kind: "cylinder", name: "K", radius: 2, height: 4 }, { kind: "cone", inscribedIn: "K" }] });
  assert.equal(printed(cone!.dims.g!), "2√5");
});

test("the readings panel prints formula and exact value", () => {
  const blocks = ((expandSolid(fixture("cylinder-volume.json")).root as Scene).children as Block[]).filter((b) => String(b.id).startsWith("reading-"));
  assert.deepEqual(blocks.map((b) => b.label), ["V = πr²h = 12π", "A = 2πr² + 2πrh = 20π (área total)"]);
});

test("a measured length is a run stated in a frame whose unit is the camera's foreshortening along it", () => {
  const spec = expandSolid(fixture("cube-space-diagonal.json"));
  const scene = spec.root as Scene;
  const labels = (scene.children as Block[]).filter((b) => b.annotates !== undefined && !b.annotates.endsWith("-place"));
  assert.equal(labels.length, 3);
  const camera = defaultCamera(["cube"]);
  const unitOf = (id: string): number => (scene.marks!.find((m) => m.id === id) as Mark).measuredIn!.xUnit;
  for (const label of labels) assert.ok((scene.marks!.find((m) => m.id === label.annotates) as Mark).measuredIn !== undefined, `${label.annotates} is not stated in a frame`);
  // The edge AB runs along y (true scale), the face diagonal is foreshortened
  // by the camera along its direction: the rulers differ by exactly that.
  const V = polyOf({ kind: "cube", edge: 2 }).vertices;
  const shrink = (a: Vec3, b: Vec3): number => {
    const d = [project(camera, b)[0] - project(camera, a)[0], project(camera, b)[1] - project(camera, a)[1]];
    return Math.hypot(d[0]!, d[1]!) / distance(a, b);
  };
  const [ib, it] = clearestDiagonal(camera, V);
  near(unitOf("s0-face-diagonal") / unitOf("s0-edge-0-1"), shrink(V[ib]!, V[it - 4]!) / shrink(V[0]!, V[1]!), 1e-9);
});

// ---- refusals ---------------------------------------------------------------------------

test("non-positive and impossible dimensions are refused by name", () => {
  const refuse = (def: SolidDef | SolidDef[], pattern: RegExp): void => {
    assert.throws(() => expandSolid({ solids: Array.isArray(def) ? def : [def] }), pattern);
  };
  refuse({ kind: "cube", edge: 0 }, /edge must be positive, got 0/);
  refuse({ kind: "box", width: 4, depth: -3, height: 2 }, /depth must be positive/);
  refuse({ kind: "cylinder", radius: -1, height: 2 }, /radius must be positive/);
  refuse({ kind: "sphere", radius: 0 }, /radius must be positive/);
  refuse({ kind: "cone", radius: 2 }, /exactly one of height and slant/);
  refuse({ kind: "cone", radius: 2, height: 3, slant: 4 }, /exactly one of height and slant/);
  refuse({ kind: "cone", radius: 3, slant: 3 }, /must exceed the radius/);
  refuse({ kind: "pyramid", edge: 6, slant: 3 }, /must exceed the base apothem m = 3/);
  refuse({ kind: "prism", sides: 2, edge: 1, height: 1 }, /sides must be a whole number from 3 to 12/);
  refuse({ kind: "prism", sides: 4.5, edge: 1, height: 1 }, /sides must be a whole number/);
  refuse({ kind: "cube", edge: 1, show: ["radius"] }, /"radius" is not drawn on a cube/);
  refuse({ kind: "cube", edge: 1, labels: ["A1", "B", "C", "D", "E", "F", "G", "H"] }, /types a number/);
  refuse({ kind: "cube", edge: 1, labels: ["A", "B"] }, /names 2 point\(s\), but a cube .* has 8 vertices/);
  refuse({ kind: "tetrahedron" } as unknown as SolidDef, /kind must be one of/);
  refuse([{ kind: "cylinder", name: "K", radius: 2, height: 3 }, { kind: "sphere", inscribedIn: "K" }], /only when h = 2r/);
  refuse([{ kind: "cube", name: "C", edge: 2 }, { kind: "sphere", inscribedIn: "C", radius: 1 }], /radius is derived from "C"/);
  refuse([{ kind: "cube", name: "C", edge: 2 }, { kind: "cone", inscribedIn: "C" }], /is not offered/);
  refuse({ kind: "sphere", inscribedIn: "nothing" }, /no solid is named "nothing"/);
  refuse([{ kind: "cube", edge: 2, labels: true }, { kind: "cube", edge: 1, at: [0, 5, 0], labels: ["A", "B", "C", "D", "E", "F", "G", "H"] }], /already a point of/);
  assert.throws(() => expandSolid({ solids: [] }), /must not be empty/);
});

// ---- every fixture renders clean ------------------------------------------------------------

for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".json"))) {
  test(`fixture ${file} expands, validates and renders with no check failing`, async () => {
    const input = fixture(file);
    validateSolidInput(input as unknown as Record<string, unknown>);
    const result = await render(expandSolid(input), { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.deepEqual(
      failing.map((c) => `${c.id} [${c.target}] ${c.detail ?? ""}`),
      [],
    );
    // Every printed length on the drawing is measured in true length, never waved through.
    const lengths = result.manifest.checks.filter((c) => c.id === "length-matches-its-label" && c.target !== "figure");
    for (const c of lengths) assert.equal(c.status, "pass", `${c.target}: ${c.detail}`);
  });
}

test("the cube fixture's diagonal, face diagonal and edge are all measured and pass", async () => {
  const result = await render(expandSolid(fixture("cube-space-diagonal.json")), { raster: false });
  const passes = result.manifest.checks.filter((c) => c.id === "length-matches-its-label" && c.status === "pass").map((c) => c.target);
  assert.deepEqual(passes.sort(), ["s0-edge-0-1", "s0-face-diagonal", "s0-space-diagonal"]);
});

test("a wrong length would fail: the slant drawn 2% long is caught against its exact label g = 2√5", async () => {
  const spec = expandSolid(fixture("cone-slant.json"));
  const mark = (spec.root as Scene).marks!.find((m) => m.id === "s0-generator-0")!;
  const from = mark.from as { x: number; y: number };
  const end = (mark.segments[0] as { line: { x: number; y: number } }).line;
  end.x = from.x + 1.02 * (end.x - from.x);
  end.y = from.y + 1.02 * (end.y - from.y);
  const result = await render(spec, { raster: false });
  const failing = result.manifest.checks.filter((c) => c.id === "length-matches-its-label" && c.status === "fail");
  assert.deepEqual(failing.map((c) => c.target), ["s0-generator-0"]);
});

// ---- answers: false --------------------------------------------------------------------------

const labelsOf = (input: SolidInput): string[] => ((expandSolid(input).root as Scene).children as Block[]).map((b) => b.label ?? "").filter((t) => t !== "");
const ask = (input: SolidInput): SolidInput => ({ ...input, answers: false });

test("answers:false keeps a cone's given r and h and hides g, V and A", () => {
  const input = fixture("cone-slant.json");
  const on = labelsOf(input);
  const off = labelsOf(ask(input));
  assert.ok(on.some((t) => t.startsWith("g = 2√5")) && on.some((t) => t.startsWith("V = ")) && on.some((t) => t.startsWith("A = ")));
  assert.ok(off.includes("r = 2") && off.includes("h = 4"), off.join(" | "));
  assert.ok(!off.some((t) => /√5|π|^[gVA] /.test(t)), off.join(" | "));
});

test("answers:false hides a cube's diagonals and readings and keeps its edge", () => {
  const input: SolidInput = { unit: "cm", solids: [{ kind: "cube", edge: 3, labels: true, show: ["edge", "spaceDiagonal", "faceDiagonal"], readings: ["measures", "volume", "area"] }] };
  const off = labelsOf(ask(input));
  assert.ok(off.includes("a = 3 cm"));
  assert.ok(!off.some((t) => /√|^[Dd] |27|54/.test(t)), off.join(" | "));
  const spec = expandSolid(ask(input));
  const ids = ((spec.root as Scene).marks ?? []).map((m) => m.id);
  assert.ok(!ids.some((id) => /diagonal/.test(id)), "no diagonal is drawn");
});

test("answers:false: a pyramid typed by its slant does not state the height; typed by its height it does not state the slant", () => {
  const bySlant = labelsOf(ask({ solids: [{ kind: "pyramid", edge: 6, slant: 5, labels: true, show: ["height", "baseApothem", "slant"] }] }));
  assert.ok(bySlant.some((t) => t.startsWith("g = 5")) && !bySlant.some((t) => t.startsWith("h")) && !bySlant.some((t) => t.startsWith("m")), bySlant.join(" | "));
  const byHeight = labelsOf(ask({ solids: [{ kind: "pyramid", edge: 6, height: 4, labels: true, show: ["height", "baseApothem", "slant"] }] }));
  assert.ok(byHeight.some((t) => t.startsWith("h = 4")) && !byHeight.some((t) => t.startsWith("g")) && !byHeight.some((t) => t.startsWith("m")), byHeight.join(" | "));
});

test("answers:false: a derived sphere states no radius, and no measure of a box either", () => {
  const off = labelsOf(ask({ solids: [{ kind: "cube", name: "C", edge: 4 }, { kind: "sphere", inscribedIn: "C", show: ["radius", "equator"], readings: ["measures", "volume"] }] }));
  assert.ok(!off.some((t) => t.startsWith("r ") || t.startsWith("V ")), off.join(" | "));
  const box = labelsOf(ask({ solids: [{ kind: "box", width: 3, depth: 4, height: 12, show: ["dimensions", "spaceDiagonal"], readings: ["measures", "volume", "area"] }] }));
  assert.ok(box.includes("3") && box.includes("4") && box.includes("12"), box.join(" | "));
  assert.ok(!box.some((t) => /13|144|^D/.test(t)), box.join(" | "));
});

test("answers:true is the default and unchanged", () => {
  const input = fixture("cube-space-diagonal.json");
  assert.deepEqual(labelsOf(input), labelsOf({ ...input, answers: true }));
});

test("the question fixtures render with every check passing", { timeout: 120000 }, async () => {
  for (const name of ["question-cone-slant.json", "question-cube-diagonal.json"]) {
    const input = fixture(name);
    assert.equal(input.answers, false);
    const result = await render(expandSolid(input), { raster: false });
    assert.deepEqual(result.manifest.checks.filter((c) => c.status === "fail").map((c) => `${name} ${c.id} ${c.detail ?? ""}`), []);
  }
});

// ---- the unit follows the dimensions ---------------------------------------------------------

const sized = (input: SolidInput): { w: number; h: number } => {
  const root = expandSolid(input).root as Scene & { width: number; height: number };
  return { w: root.width, h: root.height };
};

for (const [name, def] of [
  ["a cube of edge 5000", { kind: "cube", edge: 5000, labels: true, show: ["edge", "spaceDiagonal"], readings: ["volume", "measures"] }],
  ["a cube of edge 0,003", { kind: "cube", edge: 0.003, labels: true, show: ["edge", "spaceDiagonal"], readings: ["volume", "measures"] }],
  ["a cone of r 3000 and h 4000", { kind: "cone", radius: 3000, height: 4000, labels: true, show: ["height", "radius", "slant"], readings: ["volume", "measures"] }],
  ["a cylinder of r 0,002 and h 0,005", { kind: "cylinder", radius: 0.002, height: 0.005, labels: true, show: ["radius", "height"], readings: ["volume", "area"] }],
  ["a pyramid of edge 0,0004", { kind: "pyramid", edge: 0.0004, height: 0.0006, labels: true, show: ["height", "baseApothem", "slant"], readings: ["measures", "volume"] }],
  ["a sphere of r 12000", { kind: "sphere", radius: 12000, show: ["radius", "equator"], readings: ["volume", "area"] }],
] as [string, SolidDef][]) {
  test(`${name} draws a canvas a page can hold, and every check passes`, { timeout: 120000 }, async () => {
    for (const answers of [true, false]) {
      const input: SolidInput = { solids: [def], answers };
      const { w, h } = sized(input);
      assert.ok(w >= 300 && w <= 900 && h >= 300 && h <= 900, `${w} x ${h}`);
      const result = await render(expandSolid(input), { raster: false });
      assert.deepEqual(result.manifest.checks.filter((c) => c.status === "fail").map((c) => `${c.id} ${c.detail ?? ""}`), []);
    }
  });
}

test("the same solid at three magnitudes has the same figure size", () => {
  const at = (k: number): { w: number; h: number } => sized({ solids: [{ kind: "cone", radius: 2 * k, height: 4 * k, labels: true, show: ["height", "radius", "slant"] }] });
  assert.deepEqual(at(1000), at(1));
  assert.deepEqual(at(0.001), at(1));
});

test("small and large dimensions print with their digits", () => {
  assert.equal(printed(rat(0.003)), "0,003");
  assert.equal(printed(mul(rat(0.003), rat(0.003))), "0,000009");
  assert.equal(printed(rat(123456)), "123456");
  assert.equal(print(mul(PI, rat(12000))).text, "12000π");
});
