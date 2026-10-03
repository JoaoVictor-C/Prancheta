/**
 * space extensions (ADR 0068): grids on coordinate planes, blocks (a unit
 * cube by default) whose faces hide what is behind them, their orthogonal
 * projections on coordinate planes, and paths with an arrow per stretch and
 * an exact length, projected on a plane. The fixtures are rendered by
 * tests/space.test.ts, which renders every file in fixtures/space/.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { expandSpace, pathLength } from "../src/presets/space/preset.ts";
import type { SpaceInput } from "../src/presets/space/preset.ts";
import type { Block, Scene } from "../src/ir/types.ts";

const marksOf = (input: SpaceInput) => (expandSpace(input).root as Scene).marks ?? [];
const labelsOf = (input: SpaceInput): string[] => ((expandSpace(input).root as Scene).children as Block[]).map((b) => b.label ?? "").filter((t) => t !== "");

const cube: SpaceInput = { region: { x: [0, 6], y: [0, 7], z: [0, 6] }, grids: ["xy", "xz", "yz"], blocks: [{ at: [3, 4, 3], projections: ["xy", "xz", "yz"] }] };

test("a block hides exactly its three back edges, under the textbook camera", () => {
  const edges = marksOf(cube).filter((m) => /^block-0-edge\d+(-\d+)?$/.test(m.id));
  const dashed = edges.filter((m) => m.lineStyle === "dashed");
  // Twelve edges, the three at the back-bottom-left corner (3, 4, 3) wholly dashed, nothing else.
  assert.equal(new Set(edges.map((m) => m.id.replace(/-\d+$/, ""))).size, 12);
  // (A hidden edge may come in two pieces, each hidden by a different front face.)
  const hidden = new Set(dashed.map((m) => m.id.replace(/-\d+$/, "")));
  assert.equal(hidden.size, 3);
  for (const id of hidden) assert.ok(edges.filter((m) => m.id.replace(/-\d+$/, "") === id).every((m) => m.lineStyle === "dashed"), id);
});

test("each projection is the block's own rectangle on its plane", () => {
  const spec = expandSpace(cube);
  const ids = ((spec.root as Scene).marks ?? []).map((m) => m.id);
  for (const pl of ["xy", "xz", "yz"]) {
    assert.ok(ids.includes(`block-0-proj-${pl}-fill`), pl);
    assert.equal(ids.filter((id) => id.startsWith(`block-0-proj-${pl}-edge`)).length >= 4, true, pl);
  }
});

test("a grid line behind a block is left out, never drawn through it", () => {
  const withBlock = marksOf(cube).filter((m) => m.id.startsWith("grid-"));
  const without = marksOf({ ...cube, blocks: [{ at: [3, 4, 3] }] }).filter((m) => m.id.startsWith("grid-"));
  const bare = marksOf({ region: cube.region, grids: cube.grids, points: [{ name: "P", at: [6, 7, 6] }] }).filter((m) => m.id.startsWith("grid-"));
  assert.ok(withBlock.every((m) => m.lineStyle === "dashed"));
  assert.ok(without.length >= bare.length - 2, `${without.length} vs ${bare.length}`);
});

test("answers:false: the projections and their guides are the answer, and go", () => {
  const ids = marksOf({ ...cube, answers: false }).map((m) => m.id);
  assert.ok(!ids.some((id) => id.includes("-proj-")), ids.filter((id) => id.includes("proj")).join(" "));
  assert.ok(ids.some((id) => id.startsWith("block-0-edge")));
});

const walls: SpaceInput = {
  region: { x: [0, 4], y: [0, 6], z: [0, 4] },
  points: [
    { name: "A", at: [1, 6, 4], coords: false },
    { name: "B", at: [3, 0, 3], coords: false },
    { name: "C", at: [3, 0, 1], coords: false },
    { name: "D", at: [1, 6, 1], coords: false },
    { name: "E", at: [3, 3, 0], coords: false },
  ],
  planes: [
    { name: "α", equation: "y = 0" },
    { name: "β", equation: "y = 6" },
  ],
  paths: [{ name: "t", through: ["A", "B", "C", "D", "E"], projection: "xy" }],
};

test("a path: one arrow per stretch, its length exact, its projection's length exact", () => {
  const marks = marksOf(walls);
  assert.equal(marks.filter((m) => /^path-0-\d-arrow$/.test(m.id)).length, 4);
  const lines = labelsOf(walls);
  assert.ok(lines.includes("comprimento de ABCDE = 2 + 2√10 + √14 + √41"), lines.join(" | "));
  assert.ok(lines.includes("projeção de ABCDE no plano xy: comprimento = 4√10 + √13"), lines.join(" | "));
  assert.equal(pathLength([[0, 0, 0], [3, 4, 0], [3, 4, 12]]).text, "17");
});

test("a stretch of a path behind a wall is dashed where the wall hides it", () => {
  const cd = marksOf(walls).filter((m) => m.id.startsWith("path-0-3"));
  // C → D runs from wall α to a point on wall β, entering behind β's patch only at its end.
  assert.ok(cd.some((m) => m.lineStyle === "dashed") && cd.some((m) => m.lineStyle !== "dashed"), cd.map((m) => `${m.id}:${m.lineStyle}`).join(" "));
});

test("answers:false hides a path's projection and its lengths", () => {
  const off: SpaceInput = { ...walls, answers: false };
  assert.ok(!marksOf(off).some((m) => m.id.includes("-proj-") || m.id.includes("-drop-")));
  assert.ok(!labelsOf(off).some((l) => l.startsWith("comprimento") || l.startsWith("projeção")));
});

test("axes may be named, and a name is never a number", () => {
  const named = labelsOf({ points: [{ name: "P", at: [1, 2, 3] }], axes: { names: ["N", "L", "altura"] } });
  assert.ok(named.includes("N") && named.includes("L") && named.includes("altura"), named.join(" | "));
  assert.throws(() => expandSpace({ points: [{ name: "P", at: [1, 2, 3] }], axes: { names: ["x1", "y", "z"] } }), /types a number/);
});

test("blocks, paths and grids are refused when malformed", () => {
  assert.throws(() => expandSpace({ blocks: [{ at: [0, 0, 0], size: -1 }] }), /size must be positive/);
  assert.throws(() => expandSpace({ blocks: [{ at: [0, 0, 0], projections: ["xw" as "xy"] }] }), /one of xy, xz, yz/);
  assert.throws(() => expandSpace({ points: [{ name: "A", at: [1, 1, 1] }], paths: [{ name: "t", through: ["A"] }] }), /at least two points/);
  assert.throws(() => expandSpace({ points: [{ name: "A", at: [1, 1, 1] }], paths: [{ name: "t", through: ["A", "A"] }] }), /repeats the point/);
  assert.throws(() => expandSpace({ points: [{ name: "A", at: [1, 1, 1] }], grids: ["zz" as "xy"] }), /one of xy, xz, yz/);
});
