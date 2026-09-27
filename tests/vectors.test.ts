/**
 * vectors: components, from/to points and magnitude+angle are typed; every
 * sum, difference, scalar multiple, decomposition, projection and angle
 * between vectors is derived and printed with the one pt-BR formatter,
 * snapping an integer-square magnitude to an exact root exactly as
 * sign-chart snaps a root of the function it is given.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  angleBetweenDegrees,
  expandVectors,
  magnitudeLabel,
  measuredLabel,
  projectComponents,
  sqrtLabel,
  validateVectorsInput,
} from "../src/presets/vectors/preset.ts";
import type { VectorsInput } from "../src/presets/vectors/preset.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const fixture = fileURLToPath(new URL("../fixtures/vectors/physics-forces.json", import.meta.url));

const readings = (input: VectorsInput): Map<string, string> => {
  const spec = expandVectors(input);
  const children = (spec.root as Scene).children as Block[];
  return new Map(children.filter((b) => String(b.id ?? "").startsWith("reading-")).map((b) => [String(b.id), b.label ?? ""]));
};

// --- pure arithmetic --------------------------------------------------------

test("magnitude snaps to an exact root when the square is an integer", () => {
  assert.equal(magnitudeLabel(3, 1), "√10");
  assert.equal(magnitudeLabel(3, 4), "5");
  assert.equal(magnitudeLabel(1, 1), "√2");
  assert.equal(magnitudeLabel(0, 2.5), "2,5");
});

test("angle between two vectors, by the dot product", () => {
  assert.ok(Math.abs(angleBetweenDegrees(1, 0, 0, 1) - 90) < 1e-9);
  assert.ok(Math.abs(angleBetweenDegrees(1, 0, 1, 0) - 0) < 1e-9);
  assert.ok(Math.abs(angleBetweenDegrees(1, 0, -1, 0) - 180) < 1e-9);
  assert.throws(() => angleBetweenDegrees(0, 0, 1, 0), /zero vector/);
});

test("projection onto an axis vector isolates the matching component", () => {
  assert.deepEqual(projectComponents(3, 4, 1, 0), { x: 3, y: 0 });
  assert.deepEqual(projectComponents(3, 4, 0, 2), { x: 0, y: 4 });
  assert.throws(() => projectComponents(1, 1, 0, 0), /zero vector/);
});

// --- derivations, read back from the built figure ---------------------------

test("components and magnitude snapping reach the readings panel", () => {
  const r = readings({ vectors: [{ name: "u", components: [3, 1] }] });
  assert.equal(r.get("reading-u"), "u = (3; 1), |u| = √10");
});

test("a vector from two named points", () => {
  const r = readings({
    points: [{ name: "A", at: [0, 0] }, { name: "B", at: [4, 3] }],
    vectors: [{ name: "AB", from: "A", to: "B" }],
  });
  assert.equal(r.get("reading-AB"), "AB = (4; 3), |AB| = 5");
});

test("magnitude and angle resolve to components", () => {
  const r = readings({ vectors: [{ name: "w", magnitude: 5, angle: "90°" }] });
  const text = r.get("reading-w")!;
  assert.match(text, /θ = 90°/);
  assert.match(text, /w = \(0(,0*[1-9])?; 5\)/); // (0; 5) up to float noise
});

test("sum is component-wise addition, never typed", () => {
  const r = readings({
    vectors: [
      { name: "u", components: [3, 1] },
      { name: "v", components: [1, 4] },
      { name: "s", sum: ["u", "v"] },
    ],
  });
  assert.equal(r.get("reading-s"), "s = u + v = (4; 5), |s| = √41");
});

test("difference is component-wise subtraction", () => {
  const r = readings({
    vectors: [
      { name: "u", components: [5, 2] },
      { name: "v", components: [1, 4] },
      { name: "d", difference: ["u", "v"] },
    ],
  });
  assert.equal(r.get("reading-d"), "d = u − v = (4; −2), |d| = 2√5");
});

test("a scalar multiple", () => {
  const r = readings({
    vectors: [
      { name: "u", components: [3, 1] },
      { name: "m", scale: "u", factor: -2 },
    ],
  });
  assert.equal(r.get("reading-m"), "m = −2u = (−6; −2), |m| = 2√10");
});

test("decomposition into x/y components", () => {
  const r = readings({ vectors: [{ name: "u", components: [3, 4] }, { decompose: "u" }] });
  assert.equal(r.get("reading-u-decompose"), "u = 3î + 4ĵ");
});

test("projection of u onto v", () => {
  const r = readings({
    vectors: [
      { name: "u", components: [3, 4] },
      { name: "v", components: [1, 0] },
      { projection: { of: "u", onto: "v" } },
    ],
  });
  assert.equal(r.get("reading-proj-u-v"), "proj_v(u) = (3; 0), |proj_v(u)| = 3");
});

test("angle between two vectors", () => {
  const r = readings({
    vectors: [
      { name: "u", components: [1, 0] },
      { name: "v", components: [0, 1] },
      { angleBetween: ["u", "v"] },
    ],
  });
  assert.equal(r.get("reading-angle-u-v"), "ângulo(u, v) = 90°");
});

test("a name may be reused later, and a forward reference is refused", () => {
  assert.throws(
    () => expandVectors({ vectors: [{ name: "s", sum: ["u", "v"] }, { name: "u", components: [1, 0] }, { name: "v", components: [0, 1] }] }),
    /"u", which is not declared/,
  );
});

// --- refusals ----------------------------------------------------------------

test("validation refuses what cannot be drawn", () => {
  const bad = (patch: Record<string, unknown>): Record<string, unknown> => ({ preset: "vectors", vectors: [{ name: "u", components: [1, 2] }], ...patch });
  assert.throws(() => validateVectorsInput(bad({ vectors: [] })), /must not be empty/);
  assert.throws(
    () => validateVectorsInput(bad({ vectors: [{ name: "u", components: [1, 2], from: "A", to: "B" }] })),
    /must be exactly one of/,
  );
  assert.throws(() => validateVectorsInput(bad({ vectors: [{ components: [1, 2] }] })), /name.*is required/s);
  assert.throws(
    () => validateVectorsInput(bad({ vectors: [{ name: "w", magnitude: 5, angle: "not-an-angle" }] })),
    /is not an angle/,
  );
  assert.throws(
    () => validateVectorsInput(bad({ vectors: [{ name: "z", scale: "u", factor: 0 }] })),
    /must not be zero/,
  );
  assert.throws(
    () =>
      validateVectorsInput(
        bad({
          vectors: [
            { name: "u", components: [1, 0] },
            { name: "v", components: [2, 0] },
            { name: "w", components: [0, 1] },
            { name: "s", sum: ["u", "v", "w"], construction: "parallelogram" },
          ],
        }),
      ),
    /exactly two vectors/,
  );
  assert.throws(
    () => validateVectorsInput(bad({ vectors: [{ name: "u", components: [1, 2], label: "(3; 4)" }] })),
    /types the coordinate/,
  );
});

// --- rendering -----------------------------------------------------------------

test("physics-forces.json renders with every check passing", { timeout: 240000 }, async () => {
  const input = JSON.parse(readFileSync(fixture, "utf8")) as VectorsInput;
  const spec = expandVectors(input);
  const result = await render(spec, { raster: false });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
});

// --- the reviewer's defects, pinned ---------------------------------------------

test("a root is simplified the Brazilian way: √20 is 2√5, √52 is 2√13", () => {
  assert.equal(sqrtLabel(20), "2√5");
  assert.equal(sqrtLabel(52), "2√13");
  assert.equal(sqrtLabel(8), "2√2");
  assert.equal(sqrtLabel(72), "6√2");
  assert.equal(sqrtLabel(17), "√17");
  assert.equal(sqrtLabel(16), "4");
  assert.equal(magnitudeLabel(2, 4), "2√5");
  assert.equal(magnitudeLabel(6, -4), "2√13");
  // A rational radicand is rationalised: |proj_v(u)| for u = (2, 4), v = (5, 1)
  // is 14/√26, written 7√26/13 -- never 2,746.
  assert.equal(magnitudeLabel(35 / 13, 7 / 13), "7√26/13");
  assert.equal(sqrtLabel(1 / 4), "0,5");
  // An irrational radicand has no exact form worth printing.
  assert.equal(sqrtLabel(Math.PI), "1,772");
});

test("a measured number on the drawing is exact or rounded to hundredths", () => {
  assert.equal(measuredLabel(57.52880770915151), "57,53");
  assert.equal(measuredLabel(Math.sqrt(41)), "6,40");
  assert.equal(measuredLabel(8), "8");
  assert.equal(measuredLabel(2.5), "2,5");
  assert.equal(measuredLabel(90), "90");
});

const inputA: VectorsInput = {
  title: "Soma pela regra do paralelogramo e ângulo entre u e v",
  vectors: [
    { name: "u", components: [4, 1] },
    { name: "v", components: [1, 3] },
    { name: "u+v", sum: ["u", "v"], construction: "parallelogram" },
    { angleBetween: ["u", "v"] },
  ],
};
const inputB: VectorsInput = {
  title: "Projeção de u sobre v e decomposição de w",
  vectors: [
    { name: "u", components: [2, 4] },
    { name: "v", components: [5, 1] },
    { projection: { of: "u", onto: "v" } },
    { name: "w", magnitude: 5, angle: "143,13°" },
    { decompose: "w" },
  ],
};

test("the caption never repeats a name that already is its derivation", () => {
  const a = readings(inputA);
  assert.equal(a.get("reading-u+v"), "u+v = (5; 4), |u+v| = √41");
  assert.equal(a.get("reading-angle-u-v"), "ângulo(u, v) ≈ 57,53°");
  const b = readings(inputB);
  assert.equal(b.get("reading-u"), "u = (2; 4), |u| = 2√5");
  assert.equal(b.get("reading-proj-u-v"), "proj_v(u) = (35/13; 7/13), |proj_v(u)| = 7√26/13");
  assert.equal(b.get("reading-w-decompose"), "w = −4î + 3ĵ");
  const p = readings(JSON.parse(readFileSync(fixture, "utf8")) as VectorsInput);
  assert.equal(p.get("reading-AB"), "AB = (0; 8), |AB| = 8");
  assert.equal(p.get("reading-F"), "F = (6; −4), |F| = 2√13");
});

test("the angle is printed to hundredths on the drawing, readable by the sweep check", () => {
  const children = (expandVectors(inputA).root as Scene).children as Block[];
  const label = children.find((b) => b.annotates === "angle-u-v");
  assert.equal(label?.label, "57,53°");
});

test("the grid numbers its ticks in the figure's locale", () => {
  const children = (expandVectors(inputB).root as Scene).children as Block[];
  const ticks = children.filter((b) => b.gridOf === "plane").map((b) => b.label);
  assert.ok(ticks.includes("−4"), `ticks: ${ticks.join(" ")}`);
  assert.ok(!ticks.some((t) => /-|\./.test(t ?? "")), `an English number slipped through: ${ticks.join(" ")}`);
  // One zero, at the origin's corner -- not one struck through by each axis.
  assert.equal(ticks.filter((t) => t === "0").length, 1);
});

/** Distance from a point to the segment a–b. */
function toSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

test("every vector label is nearer its own arrow than any other arrow", () => {
  for (const input of [inputA, inputB]) {
    const scene = expandVectors(input).root as Scene;
    const arrows = new Map(
      (scene.connectors ?? [])
        .filter((c) => c.curve === undefined && typeof c.from !== "string" && typeof c.to !== "string")
        .map((c) => [c.id!, [c.from, c.to] as [{ x: number; y: number }, { x: number; y: number }]]),
    );
    const labels = (scene.children as Block[]).filter((b) => b.annotates !== undefined && arrows.has(b.annotates));
    assert.ok(labels.length >= 6, `only ${labels.length} arrow labels`);
    for (const label of labels) {
      const centre = { x: label.x! + label.width! / 2, y: label.y! + label.height! / 2 };
      const [a, b] = arrows.get(label.annotates!)!;
      const own = toSegment(centre, a, b);
      for (const [id, [c, d]] of arrows) {
        if (id === label.annotates) continue;
        // A projection lies ON the vector it projects onto, so a label beside
        // it is exactly as near both; a tie is honest, being nearer is not.
        assert.ok(toSegment(centre, c, d) >= own - 0.5, `"${label.label}" names ${label.annotates} but sits nearer ${id}`);
      }
    }
  }
});

for (const name of ["parallelogram-angle.json", "projection-decomposition.json"]) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const input = JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/vectors/${name}`, import.meta.url)), "utf8")) as VectorsInput;
    const result = await render(expandVectors(input), { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
    const owner = result.manifest.checks.find((c) => c.id === "annotation-nearest-its-owner");
    assert.equal(owner?.status, "pass", owner?.detail);
  });
}
