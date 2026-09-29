/**
 * surface (ADR 0048): z = f(x, y) as a painted mesh. Mesh heights are f at
 * the grid; cells are painted far to near and the last cell painted at a
 * page point is the nearest one there; level-curve vertices satisfy f = c;
 * the tangent plane of x² + y² at (1, 1) is z = 2x + 2y − 2; f is never
 * drawn across a pole, a jump or a hole; every refusal names its cause;
 * every fixture renders with no check failing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expandSurface, printTangentPlane, validateSurfaceInput, compileSurface } from "../src/presets/surface/preset.ts";
import type { SurfaceInput } from "../src/presets/surface/preset.ts";
import { Occluder, cellNormal, meshOf, painterSort, sampleGrid, segmentContinuous, surfaceCells, tangentAt } from "../src/presets/surface/mesh.ts";
import type { Cell } from "../src/presets/surface/mesh.ts";
import { contour } from "../src/math/contour.ts";
import { makeCamera, project, depth, liftToRay } from "../src/geometry/projection.ts";
import type { Vec2, Vec3 } from "../src/geometry/vec.ts";
import { render } from "../src/pipeline.ts";
import type { Mark, Scene } from "../src/ir/types.ts";

const near = (a: number, b: number, tol = 1e-9): void => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const fixturesDir = fileURLToPath(new URL("../fixtures/surface/", import.meta.url));
const fixture = (name: string): SurfaceInput => {
  const raw = JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf8")) as Record<string, unknown>;
  delete raw.preset;
  return raw as SurfaceInput;
};
const camera = makeCamera({ kind: "orthographic", azimuth: 30, elevation: 26 });
const paraboloid = (x: number, y: number): number => x * x + y * y;
const saddle = (x: number, y: number): number => x * x - y * y;

// ---- the mesh is f --------------------------------------------------------------

test("every mesh vertex is f at its grid point, and every unclipped cell's corners are those vertices", () => {
  const grid = sampleGrid(saddle, [-2, 2], [-2, 2], 12, 12);
  for (let i = 0; i <= 12; i += 1) for (let j = 0; j <= 12; j += 1) near(grid.z[i]![j]!, saddle(grid.xs[i]!, grid.ys[j]!), 0);
  const cells = surfaceCells(camera, meshOf(saddle, grid), [-4, 4]);
  assert.equal(cells.length, 144);
  for (const c of cells) {
    assert.equal(c.poly.length, 4);
    for (const q of c.poly) near(q[2], saddle(q[0], q[1]), 1e-12);
  }
});

test("a stated z range cuts cells at exactly that height, never elsewhere", () => {
  const grid = sampleGrid(paraboloid, [-2, 2], [-2, 2], 12, 12);
  const cells = surfaceCells(camera, meshOf(paraboloid, grid), [0, 4]);
  let cut = 0;
  for (const c of cells) {
    for (const q of c.poly) {
      assert.ok(q[2] <= 4 + 1e-12 && q[2] >= -1e-12);
      if (Math.abs(q[2] - 4) < 1e-12) cut += 1;
    }
  }
  assert.ok(cut > 0);
});

// ---- the painter's order ---------------------------------------------------------

/** The depth of a cell's polygon at a page point, from its own plane (centroid, Newell normal). */
function cellDepthAt(c: Cell, page: Vec2): number | null {
  const n = cellNormal(c, 1);
  const p0 = c.poly.reduce<Vec3>((a, q) => [a[0] + q[0] / c.poly.length, a[1] + q[1] / c.poly.length, a[2] + q[2] / c.poly.length], [0, 0, 0]);
  const base = liftToRay(camera, page);
  const t = camera.toward;
  const denom = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
  if (Math.abs(denom) < 1e-9) return null;
  const s = (n[0] * (p0[0] - base[0]) + n[1] * (p0[1] - base[1]) + n[2] * (p0[2] - base[2])) / denom;
  return depth(camera, [base[0] + t[0] * s, base[1] + t[1] * s, base[2] + t[2] * s]);
}

function inside(q: Vec2, poly: Vec2[]): boolean {
  let r = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a, a += 1) {
    const pa = poly[a]!;
    const pb = poly[b]!;
    if (pa[1] > q[1] !== pb[1] > q[1] && q[0] < ((pb[0] - pa[0]) * (q[1] - pa[1])) / (pb[1] - pa[1]) + pa[0]) r = !r;
  }
  return r;
}

for (const [name, f] of [
  ["saddle", saddle],
  ["paraboloid", paraboloid],
] as const) {
  test(`the ${name}: cells are painted back to front -- at every page point the cell painted last is the nearest one there`, () => {
    const grid = sampleGrid(f, [-2, 2], [-2, 2], 16, 16);
    const cells = painterSort(surfaceCells(camera, meshOf(f, grid), [-8, 8]));
    for (let k = 1; k < cells.length; k += 1) assert.ok(cells[k]!.s >= cells[k - 1]!.s);
    const pages = cells.map((c) => c.poly.map((q) => project(camera, q)));
    let checked = 0;
    let wrong = 0;
    for (let a = 0; a < 400; a += 1) {
      const c = cells[(a * 37) % cells.length]!;
      const q = project(camera, c.centre);
      const hits = cells.map((cell, k) => ({ cell, k })).filter(({ k }) => inside(q, pages[k]!));
      if (hits.length < 2) continue;
      checked += 1;
      const last = hits[hits.length - 1]!.cell;
      const depths = hits.map(({ cell }) => cellDepthAt(cell, q) ?? -Infinity);
      if ((cellDepthAt(last, q) ?? -Infinity) < Math.max(...depths) - 1e-6) wrong += 1;
    }
    assert.ok(checked > 20, `only ${checked} overlapping points`);
    assert.equal(wrong, 0, `${wrong} of ${checked} page points painted by a farther cell`);
  });
}

test("the fills are emitted in painter's order, and a fill's mark order is its sort order", () => {
  const spec = expandSurface({ expr: "x^2 - y^2", x: [-2, 2], y: [-2, 2] });
  const fills = ((spec.root as Scene).marks ?? []).filter((m: Mark) => /^s-\d+-\d+$/.test(m.id));
  assert.ok(fills.length > 500);
  const grid = sampleGrid(saddle, [-2, 2], [-2, 2], 24, 24);
  const sorted = painterSort(surfaceCells(makeCamera({ kind: "orthographic", azimuth: 30, elevation: 26 }), meshOf(saddle, grid), [-4, 4]));
  assert.deepEqual(
    fills.map((m) => m.id),
    sorted.map((c) => c.id),
  );
});

test("the z axis inside the bowl is hidden by the front wall, and visible above the rim", () => {
  const grid = sampleGrid(paraboloid, [-2, 2], [-2, 2], 24, 24);
  const cells = painterSort(surfaceCells(camera, meshOf(paraboloid, grid), [0, 4]));
  const occ = new Occluder(camera, 1, cells, 1e-3);
  for (const z of [0.2, 0.5, 1]) assert.equal(occ.hidden([0, 0, z], occ.free([0, 0, z])), true, `z = ${z}`);
  for (const z of [5, 6]) assert.equal(occ.hidden([0, 0, z], occ.free([0, 0, z])), false, `z = ${z}`);
  // A grid line on the edge two cells share is not hidden by the nearer one.
  const pos = occ.onField("surface", grid, grid.xs[12]!, grid.ys[20]!, paraboloid(grid.xs[12]!, grid.ys[20]!))!;
  assert.equal(occ.hidden([grid.xs[12]!, grid.ys[20]!, paraboloid(grid.xs[12]!, grid.ys[20]!)], pos), false);
});

// ---- level curves -----------------------------------------------------------------

test("every level-curve vertex satisfies f = c", () => {
  for (const c of [1, 2, 3]) {
    const lines = contour(paraboloid, { x: [-2, 2], y: [-2, 2] }, { level: c, cells: 96 });
    assert.equal(lines.length, 1);
    assert.ok(lines[0]!.closed);
    for (const p of lines[0]!.points) near(paraboloid(p.x, p.y), c, 1e-6);
  }
});

test("the levels are drawn on the surface and on the floor, each labelled on the drawing", () => {
  const spec = expandSurface(fixture("paraboloid-levels.json"));
  const scene = spec.root as Scene;
  const marks = scene.marks ?? [];
  for (const n of [0, 1, 2]) {
    assert.ok(marks.some((m) => m.id.startsWith(`level-${n}-floor-`)), `level ${n} on the floor`);
    assert.ok(marks.some((m) => m.id.startsWith(`level-${n}-surface-`)), `level ${n} on the surface`);
  }
  const labels = scene.children.filter((b) => String(b.id).startsWith("level-") && String(b.id).endsWith("-label")).map((b) => (b as { label: string }).label);
  assert.deepEqual(labels.sort(), ["z = 1", "z = 4", "z = 9"]);
});

// ---- the tangent plane --------------------------------------------------------------

test("the tangent plane of x² + y² at (1, 1) is z = 2x + 2y − 2, its coefficients from central differences", () => {
  const t = tangentAt(paraboloid, 1, 1);
  assert.ok(!("refused" in t));
  near(t.fx, 2, 1e-6);
  near(t.fy, 2, 1e-6);
  near(t.z0, 2, 0);
  const printed = printTangentPlane(t, 1, 1);
  assert.equal(printed.text, "z = 2x + 2y − 2");
  assert.equal(printed.exact, true);
  assert.equal(printed.fx, 2);
  assert.equal(printed.fy, 2);
  assert.equal(printed.d, -2);
});

test("the tangent-plane fixture prints the plane and P's computed height in the panel", () => {
  const scene = expandSurface(fixture("paraboloid-tangent-plane.json")).root as Scene;
  const readings = scene.children.filter((b) => String(b.id).startsWith("panel-")).map((b) => (b as { label: string }).label);
  assert.ok(readings.includes("P = (1; 1; 2)"), readings.join(" | "));
  assert.ok(readings.includes("plano tangente em P: z = 2x + 2y − 2"), readings.join(" | "));
  assert.ok((scene.marks ?? []).some((m) => m.id.startsWith("t-")));
});

test("a fractional slope is written exact: x²/4 + y² at (1, 1) is z = (1/2)·x + 2y − 5/4", () => {
  const f = compileSurface("x^2/4 + y^2").f;
  const t = tangentAt(f, 1, 1);
  assert.ok(!("refused" in t));
  const printed = printTangentPlane(t, 1, 1);
  assert.equal(printed.exact, true);
  assert.match(printed.text, /^z = /);
  near(printed.fx, 0.5, 0);
  near(printed.d, -1.25, 0);
});

// ---- holes, poles and jumps ------------------------------------------------------------

test("continuity along a segment: smooth passes, a jump and a pole do not", () => {
  assert.equal(segmentContinuous((t) => 100 * t * t), true);
  assert.equal(segmentContinuous((t) => (t < 0.37 ? 0 : 1)), false);
  assert.equal(segmentContinuous((t) => 1 / (t - 0.41)), false);
  assert.equal(segmentContinuous((t) => Math.sqrt(0.5 - t)), false); // NaN past 0.5
});

test("f is never drawn across a jump: no cell of sign(x) straddles x = 0", () => {
  const f = compileSurface("sign(x) + y").f;
  const grid = sampleGrid(f, [-1.05, 0.95], [-1, 1], 10, 10);
  const mesh = meshOf(f, grid);
  assert.ok(mesh.holes >= 10);
  const cells = surfaceCells(camera, mesh, [-3, 3]);
  for (const c of cells) assert.ok(c.rect.x[1] <= 1e-12 || c.rect.x[0] >= -1e-12, `${c.id} straddles the jump`);
});

test("a hemisphere's cells outside the disc are holes, and the panel says so", () => {
  const scene = expandSurface({ expr: "sqrt(4 - x^2 - y^2)", x: [-2, 2], y: [-2, 2] }).root as Scene;
  const readings = scene.children.filter((b) => String(b.id).startsWith("panel-")).map((b) => (b as { label: string }).label);
  assert.ok(readings.some((r) => r.includes("nunca emenda")), readings.join(" | "));
});

// ---- refusals ----------------------------------------------------------------------------

const base: SurfaceInput = { expr: "x^2 + y^2", x: [-2, 2], y: [-2, 2] };
const refuses = (input: Record<string, unknown>, pattern: RegExp): void => {
  assert.throws(() => validateSurfaceInput({ ...base, ...input } as Record<string, unknown>), pattern);
};

test("refusals name their cause", () => {
  refuses({ levels: [20] }, /never crossed/);
  refuses({ expr: "x^2 + z" }, /expr/);
  refuses({ x: [2, -2] }, /low < high/);
  refuses({ point: { x: 3, y: 0 } }, /outside the domain/);
  refuses({ point: { x: 1, y: 1, z: 2 } }, /computed/);
  refuses({ point: { name: "P1", x: 1, y: 1 } }, /digits/);
  refuses({ expr: "sqrt(x^2 + y^2)", point: { x: 0, y: 0, tangentPlane: true } }, /no tangent plane|differ/);
  refuses({ expr: "x^2 - y^2", point: { x: 0, y: 0, tangentPlane: true } }, /crosses its tangent plane/);
  refuses({ camera: { kind: "orthographic", azimuth: 30, elevation: -20 } }, /from above/);
  refuses({ mesh: 24, lines: 7 }, /dividing mesh/);
  refuses({ floor: 1 }, /floor/);
  refuses({ expr: "sqrt(-1 - x^2)" }, /not defined/);
});

// ---- every fixture renders clean ------------------------------------------------------------

for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".json"))) {
  test(`fixture ${file} expands, validates and renders with no check failing`, async () => {
    const input = fixture(file);
    validateSurfaceInput(input as unknown as Record<string, unknown>);
    const result = await render(expandSurface(input), { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.deepEqual(
      failing.map((c) => `${c.id} [${c.target}] ${c.detail ?? ""}`),
      [],
    );
  });
}

// ---- page scale fitted to the drawing (review of 2026-09-29) ---------------------------------

function svgSize(svg: string): { w: number; h: number } {
  const m = svg.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
  assert.ok(m, "svg has a size");
  return { w: Number(m![1]), h: Number(m![2]) };
}
async function renderPassing(input: SurfaceInput) {
  const result = await render(expandSurface(input), { raster: false, maxPasses: 3 });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.deepEqual(failing.map((c) => `${c.id} ${c.detail ?? ""}`), []);
  return result;
}

test("probe: x² + y² over [-100, 100]² fits a page (was 5046 x 5543px)", async () => {
  const { svg } = await renderPassing({ expr: "x^2 + y^2", x: [-100, 100], y: [-100, 100] });
  const { w, h } = svgSize(svg);
  assert.ok(w <= 900 && h <= 1000 && w >= 300 && h >= 300, `${w} x ${h}`);
});

test("probe: the same surface at [-0,01, 0,01] and [-1000, 1000] is page-sized, and ticks stay few", async () => {
  const sizes: { w: number; h: number }[] = [];
  for (const r of [0.01, 1, 1000]) {
    const { svg } = await renderPassing({ expr: "x^2 + y^2", x: [-r, r], y: [-r, r], axes: { ticks: true } });
    sizes.push(svgSize(svg));
    const numbers = (svg.match(/<text[^>]*>[^<]*<\/text>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).filter((t) => /^[−-]?[\d.,]+$/.test(t));
    assert.ok(numbers.length <= 24, `${r}: ${numbers.length} tick numbers`);
  }
  for (const s of sizes) assert.ok(s.w >= 400 && s.w <= 900 && s.h >= 400 && s.h <= 900, JSON.stringify(sizes));
});

// ---- answers: false ----------------------------------------------------------------------------

test("answers:false keeps the surface and the point's place and name, and hides the plane, derivatives, z and level values", async () => {
  const input: SurfaceInput = { expr: "x^2 + y^2", x: [-2, 2], y: [-2, 2], z: [0, 5], point: { name: "P", x: 1, y: 1, tangentPlane: true }, levels: [1, 4] };
  const solution = expandSurface(input);
  const question = expandSurface({ ...input, answers: false });
  const ids = (s: typeof solution): string[] => ((s.root as Scene).marks ?? []).map((m) => m.id);
  const labels = (s: typeof solution): string => (s.root as { children: { label?: string }[] }).children.map((c) => c.label ?? "").join("\n");
  assert.ok(ids(solution).some((i) => i.startsWith("plane-edge")) && ids(solution).some((i) => i.startsWith("level-")), "answers:true is unchanged");
  assert.match(labels(solution), /plano tangente/);
  assert.ok(!ids(question).some((i) => i.startsWith("plane-edge") || i.startsWith("level-") || i.startsWith("guide-")), "no plane, level curve or guide");
  const q = labels(question);
  assert.ok(!/plano tangente|fx|fy|curvas de nível|c = /.test(q), q);
  assert.ok(!/= \(1; 1; 2\)/.test(q), "no z of the point");
  assert.match(q, /P: x = 1; y = 1/);
  assert.match(q, /z = f\(x; y\)/, "the function is given");
  assert.ok(ids(question).includes("point"), "the point is drawn");
  await renderPassing({ ...input, answers: false });
});
