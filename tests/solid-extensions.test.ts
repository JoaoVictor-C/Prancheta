/**
 * solid extensions (ADR 0068): frustums, bores, round solids stood on round
 * solids, stairs and polyhedra from face data with hidden-line removal, a
 * liquid to a level (and the level from a volume), inscribed prisms and
 * cylinders, and nets. Every measure is checked against its exact value,
 * every visibility claim against the geometry, and every refusal by name.
 * The fixtures themselves are rendered by tests/solid.test.ts, which renders
 * every file in fixtures/solid/.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { expandSolid, measuresOf, resolveSolids } from "../src/presets/solid/preset.ts";
import type { SolidDef, SolidInput } from "../src/presets/solid/preset.ts";
import { frustumView, prism, rectangle, classifyEdges, splitParam } from "../src/presets/solid/geometry.ts";
import { MeshError, faceCensus, meshArea, meshVolume, orientMesh, seeEdges, stairsMesh, faceArea } from "../src/presets/solid/mesh.ts";
import { coneNet, cylinderNet, netOverlaps, polyhedronNet, prismTree, unfold } from "../src/presets/solid/net.ts";
import { cbrt, div, parseTyped, print, rat, valueOf, PI, mul } from "../src/presets/solid/exact.ts";
import { makeCamera, orthographicCamera } from "../src/geometry/projection.ts";
import { dot } from "../src/geometry/vec.ts";
import type { Vec2 } from "../src/geometry/vec.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const one = (def: SolidDef, extra: Partial<SolidInput> = {}): SolidInput => ({ solids: [def], ...extra });
const text = (x: Parameters<typeof print>[0]): string => print(x).text;
const labelsOf = (input: SolidInput): string[] => ((expandSolid(input).root as Scene).children as Block[]).map((b) => b.label ?? "").filter((t) => t !== "");
const marksOf = (input: SolidInput) => (expandSolid(input).root as Scene).marks ?? [];
const refuse = (input: SolidInput, re: RegExp): void => {
  assert.throws(() => expandSolid(input), re);
};

// ---- exact arithmetic ---------------------------------------------------------------------

test("division, cube roots and typed volumes stay exact where a student's answer is", () => {
  assert.equal(text(div(mul(rat(18), PI), mul(rat(9), PI))), "2");
  assert.equal(text(div(rat(3), parseTyped("2")!)), "1,5");
  assert.equal(text(div(rat(1), mul(rat(2), PI))), "0,16"); // 1/(2π) is not a school form: numeric
  assert.equal(print(div(rat(1), mul(rat(2), PI))).exact, false);
  assert.equal(text(cbrt(rat(1 / 8))), "0,5");
  assert.equal(print(cbrt(rat(2))).exact, false);
  assert.equal(text(parseTyped("9π/2")!), "9π/2");
  assert.equal(text(parseTyped("3/2 π")!), "3π/2");
  assert.equal(text(parseTyped("12,5")!), "12,5");
  assert.equal(parseTyped("doze"), null);
});

// ---- frustums -----------------------------------------------------------------------------

test("a cone's frustum: g, V and A exact from R, r and h, or h from the slant", () => {
  const m = measuresOf({ kind: "frustum", radius: 7, topRadius: 4, height: 4 });
  assert.equal(text(m.g!), "5");
  assert.equal(text(m.V!), "124π");
  assert.equal(text(m.A!), "120π");
  const bySlant = measuresOf({ kind: "frustum", radius: 7, topRadius: 4, slant: 5 });
  assert.equal(text(bySlant.h!), "4");
});

test("a pyramid's frustum: V = h(B + √(Bb) + b)/3 and its apótema from the two apothems", () => {
  const m = measuresOf({ kind: "frustum", sides: 4, edge: 8, topEdge: 4, height: 6 });
  assert.equal(text(m.g!), "2√10");
  assert.equal(text(m.V!), "224");
  assert.equal(text(m.A!), "80 + 48√10");
  // A frustum of the 10-12-13 pyramid cut at half height is 7/8 of it.
  const whole = measuresOf({ kind: "pyramid", edge: 10, height: 12 });
  const cut = measuresOf({ kind: "frustum", edge: 10, topEdge: 5, height: 6 });
  assert.ok(Math.abs(valueOf(cut.V!) - (7 / 8) * valueOf(whole.V!)) < 1e-9);
});

for (const [name, camera] of [["orthographic 0°/20°", orthographicCamera(0, 20)], ["orthographic 30°/20°", orthographicCamera(30, 20)], ["cavalier", makeCamera("cavalier")]] as const) {
  test(`a frustum's outline generators are where its lateral surface turns away (${name})`, () => {
    for (const [R, r] of [[7, 4], [3, 5], [0, 4]] as const) {
      const view = frustumView(camera, [0, 0, 0], R, r, 4);
      assert.equal(view.silhouette.length, 2);
      for (const t of view.silhouette) assert.ok(Math.abs(dot(view.lateral(t), camera.toward)) < 1e-9 * Math.hypot(...view.lateral(t)), `${R}/${r} at ${t}`);
    }
  });
}

// ---- stairs and polyhedra from faces --------------------------------------------------------

test("stairs: volume and areas exact, and pisos, espelhos and laterals printed apart", () => {
  const m = measuresOf({ kind: "stairs", steps: 3, tread: 3, riser: 2, width: 8 });
  assert.equal(text(m.V!), "288");
  assert.equal(text(m.A!), "312");
  const lines = labelsOf(one({ kind: "stairs", steps: 3, tread: 3, riser: 2, width: 8, readings: ["area"] }));
  assert.ok(lines.some((l) => l.startsWith("pisos = 3·p·ℓ = 72")), lines.join(" | "));
  assert.ok(lines.some((l) => l.startsWith("espelhos = 3·e·ℓ = 48")));
  assert.ok(lines.some((l) => l.startsWith("paredes laterais = 2·p·e·3·4/2 = 72")));
});

test("hidden-line removal agrees with the convex rule on a convex body, under every camera", () => {
  const cube = prism(rectangle([0, 0, 0], 2, 2), 2);
  for (const camera of [makeCamera("cavalier"), makeCamera("isometric"), orthographicCamera(-40, 25), orthographicCamera(120, 10)]) {
    const convex = classifyEdges(camera, cube).map((e) => `${e.i}-${e.j}:${e.visible}`).sort();
    const general = seeEdges(camera, orientMesh(cube)).map((e) => `${e.i}-${e.j}:${e.pieces.every((p) => p.visible)}`).sort();
    assert.deepEqual(general, convex);
  }
});

test("on a stair seen from behind, an edge with a face toward the reader is still hidden behind the back wall", () => {
  const mesh = orientMesh(stairsMesh([0, 0, 0], 3, 3, 2, 8));
  const camera = orthographicCamera(180, 30); // from −x, above: the back wall faces the reader
  const m = mesh.vertices.length / 2;
  // The front riser's top edge, between the riser (+x) and the first tread (+z): the tread faces the reader.
  const e = seeEdges(camera, mesh).find((x) => x.i === 1 && x.j === m + 1)!;
  assert.ok(e !== undefined);
  assert.ok(e.pieces.every((p) => !p.visible), JSON.stringify(e.pieces));
  // The convex rule would have called it visible.
  assert.ok(e.faces.some((f) => dot(camera.toward, [0, 0, 1]) > 0 && mesh.faces[f]!.length === 4));
});

test("a polyhedron from faces: oriented whatever the input winding, counted, measured exactly", () => {
  const vertices: [number, number, number][] = [[1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 2], [1, 1, 2], [-1, 1, 2], [-1, -1, 2], [0, 0, 3]];
  const faces = [[0, 3, 2, 1], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 8], [5, 6, 8], [6, 7, 8], [7, 4, 8]];
  const flipped = faces.map((f, k) => (k % 2 === 0 ? [...f].reverse() : f));
  for (const fs of [faces, flipped, faces.map((f) => [...f].reverse())]) {
    const mesh = orientMesh({ vertices, faces: fs });
    assert.equal(text(meshVolume(mesh)), "28/3");
    assert.equal(text(meshArea(mesh)), "20 + 4√2");
  }
  const mesh = orientMesh({ vertices, faces });
  assert.equal(faceCensus(mesh), "4 triângulos, 5 quadrados");
  const lines = labelsOf(one({ kind: "polyhedron", vertices, faces, readings: ["counts"] }));
  assert.ok(lines.includes("vértices: 9; arestas: 16; faces: 9 (4 triângulos, 5 quadrados)"), lines.join(" | "));
  assert.ok(lines.includes("V − A + F = 9 − 16 + 9 = 2"));
});

test("a polyhedron that is open, pinched or not planar is refused by name", () => {
  const V: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
  assert.throws(() => orientMesh({ vertices: V, faces: [[0, 2, 1], [0, 1, 3], [1, 2, 3]] }), MeshError);
  refuse(one({ kind: "polyhedron", vertices: V, faces: [[0, 2, 1], [0, 1, 3], [1, 2, 3]] }), /at least 4 faces/);
  refuse(one({ kind: "polyhedron", vertices: [...V, [1, 1, 1]], faces: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2], [1, 2, 4]] }), /belongs to (1|3) face/);
  refuse(one({ kind: "polyhedron", vertices: [[0, 0, 0], [2, 0, 0], [2, 2, 0.5], [0, 2, 0], [1, 1, 2]], faces: [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]] }), /not planar/);
  refuse(one({ kind: "polyhedron", vertices: V, faces: [[0, 2, 9], [0, 1, 3], [1, 2, 3], [0, 3, 2]] }), /names vertex 9/);
});

// ---- liquids --------------------------------------------------------------------------------

test("liquid to a level: the volume and the fraction of the solid, exact", () => {
  const box = measuresOf({ kind: "box", width: 6, depth: 3, height: 5, liquid: { height: 2 } });
  assert.equal(text(box.Vliquid!), "36");
  const glass = measuresOf({ kind: "cone", apex: "down", radius: 4, height: 10, liquid: { height: 5 } });
  assert.equal(text(glass.Vliquid!), "20π/3");
  assert.equal(text(div(glass.Vliquid!, glass.V!)), "0,125");
  const upright = measuresOf({ kind: "cone", radius: 4, height: 10, liquid: { height: 5 } });
  assert.equal(text(div(upright.Vliquid!, upright.V!)), "0,875");
});

test("liquid from a volume: the level computed, exact for a constant section and a rational cube", () => {
  assert.equal(text(measuresOf({ kind: "cylinder", radius: 3, height: 5, liquid: { volume: "18π" } }).level!), "2");
  assert.equal(text(measuresOf({ kind: "box", width: 6, depth: 3, height: 5, liquid: { volume: 45 } }).level!), "2,5");
  // An eighth of a glass on its apex fills half its height.
  assert.equal(text(measuresOf({ kind: "cone", apex: "down", radius: 4, height: 10, liquid: { volume: "20π/3" } }).level!), "5");
  // A frustum has no closed form here: bisection, flagged inexact, and it reproduces the volume.
  const f = measuresOf({ kind: "frustum", radius: 7, topRadius: 4, height: 4, liquid: { volume: "50π" } });
  assert.equal(print(f.level!).exact, false);
  const back = measuresOf({ kind: "frustum", radius: 7, topRadius: 4, height: 4, liquid: { height: valueOf(f.level!) } });
  assert.ok(Math.abs(valueOf(back.Vliquid!) - 50 * Math.PI) < 1e-6);
});

test("the level line is dashed exactly where the wall it lies on faces away", () => {
  const marks = marksOf(one({ kind: "box", width: 6, depth: 3, height: 5, liquid: { height: 2 } }));
  const level = marks.filter((m) => /^s0-level-\d$/.test(m.id));
  assert.equal(level.length, 4);
  // Default cavalier camera: the front (+x) and right (+y) walls face the reader, the back and left do not.
  assert.deepEqual(level.map((m) => m.lineStyle === "dashed").sort(), [false, false, true, true]);
});

test("a liquid above the solid, or more than it holds, is refused", () => {
  refuse(one({ kind: "box", width: 6, depth: 3, height: 5, liquid: { height: 6 } }), /above the solid's height/);
  refuse(one({ kind: "cylinder", radius: 1, height: 2, liquid: { volume: "3π" } }), /more than the solid holds/);
  refuse(one({ kind: "sphere", radius: 1, liquid: { height: 1 } }), /not a sphere/);
  refuse(one({ kind: "box", width: 6, depth: 3, height: 5, liquid: { height: 2, volume: 3 } }), /exactly one of height and volume/);
});

// ---- bores and stacking ----------------------------------------------------------------------

test("a bore: the volume and area of what is left, exact", () => {
  const m = measuresOf({ kind: "cylinder", radius: 4, height: 6, bore: { radius: 1.5 } });
  assert.equal(text(m.V!), "165π/2");
  assert.equal(text(m.A!), "187π/2");
  const medal = resolveSolids(one({ kind: "cylinder", radius: 4, height: 1, bore: { sides: 4, inscribed: true } }))[0]!;
  assert.equal(medal.bore!.kind, "polygon");
  assert.equal(text((medal.bore as { edge: Parameters<typeof print>[0] }).edge), "4√2");
});

test("a bore's far bottom edge shows through the opening of a thin piece and not of a tall one", () => {
  const camera = { kind: "orthographic", azimuth: 0, elevation: 35 } as const;
  const dashedBottom = (height: number): boolean[] => marksOf(one({ kind: "cylinder", radius: 4, height, bore: { sides: 4, edge: 4 } }, { camera })).filter((m) => m.id.startsWith("s0-bore-bottom-")).map((m) => m.lineStyle === "dashed");
  assert.ok(dashedBottom(0.5).some((d) => !d), "a thin piece shows part of its bottom bore edge");
  assert.ok(dashedBottom(8).every((d) => d), "a tall one hides it all");
});

test("a bore's near wall edges are hidden: the medal's corner lines and a round hole's outline generators", () => {
  const camera = { kind: "orthographic", azimuth: 0, elevation: 35 } as const;
  // The square's corners 0 and 1 are the two nearer the reader (x > 0); their vertical edges run inside the
  // material, on a wall that faces away -- a seam of no thickness on the outer wall does not show them.
  const medal = marksOf(one({ kind: "cylinder", radius: 4, height: 1, bore: { sides: 4, inscribed: true } }, { camera }));
  const near = medal.filter((m) => /^s0-bore-edge-[01](-\d+)?$/.test(m.id));
  assert.ok(near.length >= 2);
  assert.ok(near.every((m) => m.lineStyle === "dashed"), near.map((m) => `${m.id}:${m.lineStyle}`).join(" "));
  const round = marksOf(one({ kind: "cylinder", radius: 4, height: 1, bore: { radius: 2 } }, { camera }));
  const generators = round.filter((m) => m.id.startsWith("s0-bore-generator-"));
  assert.ok(generators.length >= 2);
  assert.ok(generators.every((m) => m.lineStyle === "dashed"));
});

test("the level's dimension line has its arrowheads and extension lines, beside the liquid", () => {
  const ids = marksOf(one({ kind: "cone", apex: "down", radius: 4, height: 10, liquid: { height: 5 }, show: ["level", "height"] })).map((m) => m.id);
  for (const id of ["s0-level-dimension", "s0-level-arrow-0", "s0-level-arrow-1", "s0-level-extension-0", "s0-level-extension-1"]) assert.ok(ids.includes(id), id);
});

test("a bore that does not fit, or a bore and a liquid together, is refused", () => {
  refuse(one({ kind: "cylinder", radius: 2, height: 3, bore: { radius: 2 } }), /does not fit/);
  refuse(one({ kind: "cube", edge: 2, bore: { sides: 4, edge: 3 } }), /does not fit inside/);
  refuse(one({ kind: "cone", radius: 2, height: 3, bore: { radius: 1 } }), /two flat bases/);
  refuse(one({ kind: "box", width: 2, depth: 2, height: 2, bore: { sides: 4, inscribed: true } }), /inscribed in a cylinder/);
});

test("a hemisphere on a cylinder: one rim, front solid and back dashed, no top face, totals joined", () => {
  const input: SolidInput = { total: ["volume", "area"], solids: [{ kind: "cylinder", name: "Cilindro", radius: 3, height: 8 }, { kind: "hemisphere", name: "Cúpula", on: "Cilindro" }] };
  const marks = marksOf(input);
  const top = marks.filter((m) => m.id.startsWith("s0-top-"));
  assert.deepEqual(top.map((m) => m.lineStyle === "dashed").sort(), [false, true]);
  assert.ok(!marks.some((m) => m.id === "s0-top-fill"), "a covered top is not a face");
  assert.ok(!marks.some((m) => m.id.startsWith("s1-base")), "the shared rim is drawn once");
  const lines = labelsOf(input);
  assert.ok(lines.some((l) => l.startsWith("Total: V") && l.includes("= 90π")), lines.join(" | "));
  assert.ok(lines.some((l) => l.startsWith("Total: A") && l.includes("= 75π")), lines.join(" | "));
  assert.equal(text(resolveSolids(input)[1]!.dims.r!), "3");
});

test("inscribed: a prism in a cylinder, a cylinder in a prism", () => {
  const [, p] = resolveSolids({ solids: [{ kind: "cylinder", name: "K", radius: 3, height: 6 }, { kind: "prism", sides: 4, inscribedIn: "K" }] });
  assert.equal(text(p!.dims.a!), "3√2");
  assert.equal(text(p!.dims.h!), "6");
  const [, c] = resolveSolids({ solids: [{ kind: "prism", name: "P", sides: 6, edge: 2, height: 5 }, { kind: "cylinder", inscribedIn: "P" }] });
  assert.equal(text(c!.dims.r!), "√3");
  const [, cc] = resolveSolids({ solids: [{ kind: "cube", name: "C", edge: 4 }, { kind: "cylinder", inscribedIn: "C" }] });
  assert.equal(text(cc!.dims.r!), "2");
});

// ---- nets -----------------------------------------------------------------------------------

const area2 = (pts: readonly Vec2[]): number => Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * p[1], 0)) / 2;

test("a cube's net is the cross: six faces, five folds, no overlap, every face its true size", () => {
  const mesh = orientMesh(prism(rectangle([0, 0, 0], 3, 3), 3));
  const net = unfold(mesh, prismTree(4));
  assert.equal(net.faces.length, 6);
  assert.equal(net.folds.length, 5);
  assert.equal(netOverlaps(net), null);
  net.faces.forEach((f) => assert.ok(Math.abs(area2(f.pts) - valueOf(faceArea(mesh, f.face))) < 1e-9));
});

test("every school polyhedron and a typed one unfold flat without overlap, area preserved", () => {
  const solids: SolidDef[] = [
    { kind: "prism", sides: 6, edge: 2, height: 4 },
    { kind: "pyramid", sides: 5, edge: 2, height: 3 },
    { kind: "frustum", sides: 3, edge: 6, topEdge: 2, height: 3 },
    { kind: "stairs", steps: 3, tread: 3, riser: 2, width: 8 },
  ];
  for (const def of solids) {
    const r = resolveSolids(one(def))[0]!;
    const mesh = r.mesh ?? orientMesh(prism(rectangle([0, 0, 0], 1, 1), 1));
    if (r.mesh === undefined) continue;
    const net = polyhedronNet(mesh, def.kind === "stairs" ? prismTree(mesh.faces.length - 2, mesh.faces.length - 3) : undefined);
    assert.equal(netOverlaps(net), null, def.kind);
    const total = net.faces.reduce((s, f) => s + area2(f.pts), 0);
    assert.ok(Math.abs(total - valueOf(meshArea(mesh))) < 1e-9, def.kind);
  }
  // And through the preset, for the school kinds.
  for (const def of solids) assert.doesNotThrow(() => expandSolid(one({ ...def, net: true })));
});

test("round nets: the cylinder's rectangle is 2πr wide, the cone's sector 360°·r/g", () => {
  const cyl = cylinderNet(2, 5);
  assert.ok(Math.abs(Math.hypot(cyl.runs[0]!.b[0] - cyl.runs[0]!.a[0], cyl.runs[0]!.b[1] - cyl.runs[0]!.a[1]) - 4 * Math.PI) < 1e-12);
  const cone = coneNet(3, 5);
  assert.ok(Math.abs(((cone.sector!.to - cone.sector!.from) * 180) / Math.PI - 216) < 1e-9);
  const lines = labelsOf(one({ kind: "cone", radius: 3, height: 4, net: "only", readings: ["area"] }));
  assert.ok(lines.includes("θ = 216°"), lines.join(" | "));
  assert.ok(lines.some((l) => l.startsWith("g = 5")), lines.join(" | "));
});

test("a sphere has no net, and a net's face names are names", () => {
  refuse(one({ kind: "sphere", radius: 1, net: true }), /no net/);
  refuse(one({ kind: "cube", edge: 1, net: true, netLabels: ["a", "b"] }), /names 2 face/);
  refuse(one({ kind: "cube", edge: 1, net: true, netLabels: ["2 cm", "", "", "", "", ""] }), /types a number/);
  assert.doesNotThrow(() => expandSolid(one({ kind: "cube", edge: 3, net: "only", netLabels: ["1", "6", "2", "3", "5", "4"] })));
});

// ---- answers: false -------------------------------------------------------------------------

test("answers:false: the net keeps the given h and r and hides 2πr and the sector angle", () => {
  const cyl = labelsOf(one({ kind: "cylinder", radius: 2, height: 5, show: ["radius", "height"], net: "only", readings: ["area"] }, { answers: false }));
  assert.ok(cyl.includes("h = 5") && cyl.some((t) => t.startsWith("r")), cyl.join(" | "));
  assert.ok(!cyl.some((t) => t.includes("π")), cyl.join(" | "));
  const cone = labelsOf(one({ kind: "cone", radius: 3, height: 4, net: "only" }, { answers: false }));
  assert.ok(!cone.some((t) => t.startsWith("θ") || t.startsWith("g")), cone.join(" | "));
});

test("answers:false: a level computed from a volume, a polyhedron's counts and an inscribed bore's side are hidden", () => {
  const glass = labelsOf(one({ kind: "cylinder", radius: 3, height: 5, liquid: { volume: "18π" }, show: ["level"], readings: ["measures", "volume"] }, { answers: false }));
  assert.ok(!glass.some((t) => /^2( |$)|nível/.test(t)), glass.join(" | "));
  const given = labelsOf(one({ kind: "box", width: 6, depth: 3, height: 5, liquid: { height: 2 }, show: ["level"] }, { answers: false }));
  assert.ok(given.includes("2"), given.join(" | "));
  const medal = labelsOf(one({ kind: "cylinder", radius: 4, height: 1, bore: { sides: 4, inscribed: true }, show: ["bore"], readings: ["measures", "volume"] }, { answers: false }));
  assert.ok(!medal.some((t) => t.includes("√2")), medal.join(" | "));
});

test("splitParam finds each change of a predicate to 1e-12", () => {
  const pieces = splitParam((t) => t < 0.3 || t > 0.71, 0, 1, 50);
  assert.equal(pieces.length, 3);
  assert.ok(Math.abs(pieces[0]!.t1 - 0.3) < 1e-11 && Math.abs(pieces[1]!.t1 - 0.71) < 1e-11);
});
