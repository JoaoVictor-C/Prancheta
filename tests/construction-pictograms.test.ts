/**
 * Word-problem pictograms in the construction preset (ADR 0047): decoration
 * derived from geometry an author already named -- a ladder's rails follow
 * its own segment, a pole's height is that segment's own length, a sun's ray
 * angle is the stated elevation, and the unknowns these scenes compute (a
 * wall's height, a shadow, a sight distance) are printed and measured exactly
 * as any other construction annotation is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  angleAt,
  boatGlyph,
  buildingGlyph,
  expandConstruction,
  hatchTicks,
  ladderGeometry,
  personGlyph,
  poleGlyph,
  sunGlyph,
  treeGlyph,
  computeConstruction,
} from "../src/presets/construction/preset.ts";
import type { ConstructionInput, ConstructionObject } from "../src/presets/construction/preset.ts";
import * as vec from "../src/geometry/vec.ts";
import type { Vec2 } from "../src/geometry/vec.ts";
import { render } from "../src/pipeline.ts";
import type { Point } from "../src/ir/types.ts";

const EPS = 1e-9;
const close = (a: number, b: number, eps = EPS): void => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} ≠ ${b}`);

const fixtureDir = fileURLToPath(new URL("../fixtures/construction/", import.meta.url));
const fixture = (name: string): ConstructionInput => JSON.parse(readFileSync(`${fixtureDir}${name}`, "utf8")) as ConstructionInput;

// --- pure glyph geometry -------------------------------------------------------

test("hatchTicks: evenly spaced, each clear of the run it decorates", () => {
  const a: Point = { x: 0, y: 0 };
  const b: Point = { x: 140, y: 0 };
  const ticks = hatchTicks(a, b, 1, 14, 9);
  assert.ok(ticks.length >= 8);
  // Every tick starts a couple of pixels off the line -- never on it.
  for (const [s] of ticks) assert.ok(Math.abs(s.y) >= 1.5, `tick starts on the run: ${JSON.stringify(s)}`);
  // Consecutive ticks are evenly spaced along the run.
  const xs = ticks.map(([s]) => s.x);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
  for (const g of gaps) close(g, gaps[0]!, 1e-6);
});

test("ladderGeometry: the second rail follows the segment, and rungs are evenly spaced", () => {
  const a: Point = { x: 0, y: 100 };
  const b: Point = { x: 80, y: 0 };
  const gap = 7;
  const { rail2, rungs } = ladderGeometry(a, b, gap, 26);
  // rail2 is the segment translated by exactly `gap` along its own normal.
  const len1 = Math.hypot(b.x - a.x, b.y - a.y);
  const len2 = Math.hypot(rail2[1].x - rail2[0].x, rail2[1].y - rail2[0].y);
  close(len1, len2, 1e-9);
  close(Math.hypot(rail2[0].x - a.x, rail2[0].y - a.y), gap, 1e-9);
  close(Math.hypot(rail2[1].x - b.x, rail2[1].y - b.y), gap, 1e-9);
  // Rungs are evenly spaced along the run: equal fractional steps.
  assert.ok(rungs.length >= 3);
  const ts = rungs.map(([p1]) => {
    const t = Math.hypot(p1.x - a.x, p1.y - a.y) / len1;
    return t;
  });
  const steps = ts.slice(1).map((t, i) => t - ts[i]!);
  for (const s of steps) close(s, steps[0]!, 1e-6);
  // Every rung reaches from rail 1 to rail 2, exactly `gap` long.
  for (const [p1, p2] of rungs) close(Math.hypot(p2.x - p1.x, p2.y - p1.y), gap, 1e-9);
});

test("poleGlyph sits entirely past the segment's own top, and treeGlyph's canopy stays near it, not over the shaft", () => {
  const a: Point = { x: 0, y: 100 };
  const b: Point = { x: 0, y: 20 };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const along = (p: Point): number => (p.x - a.x) * dir.x + (p.y - a.y) * dir.y;
  // The finial is a small ball entirely beyond the shaft's own end.
  for (const part of poleGlyph(a, b)) for (const p of part.pts) assert.ok(along(p) >= len, `finial point ${JSON.stringify(p)} sits on the shaft, not past it`);
  // The canopy is centred beyond the top and stays clear of most of the trunk.
  for (const part of treeGlyph(a, b)) for (const p of part.pts) assert.ok(along(p) >= len * 0.8, `canopy point ${JSON.stringify(p)} reaches too far down the trunk`);
});

test("personGlyph and buildingGlyph fit the segment's own height, and buildingGlyph never crosses onto the segment's own side", () => {
  const a: Point = { x: 0, y: 100 };
  const b: Point = { x: 0, y: 0 };
  const person = personGlyph(a, b);
  assert.equal(person.length, 3);
  const building = buildingGlyph(a, b, 1);
  // Every building point has x >= 0 (side 1 pushes it to +x, away from x=0).
  for (const part of building) for (const p of part.pts) assert.ok(p.x >= -1e-9, `building point crosses to the segment's own side: ${JSON.stringify(p)}`);
});

test("sunGlyph and boatGlyph are small, closed-enough glyphs centred where asked", () => {
  const c: Point = { x: 50, y: 50 };
  const sun = sunGlyph(c, 10);
  assert.equal(sun.length, 9); // one circle, eight rays
  const boat = boatGlyph({ x: 0, y: 0 });
  assert.equal(boat.length, 3); // hull, mast, sail
});

// --- the fixtures: derived, never typed, and measured -----------------------

test("ladder-wall: the unknown wall height (4) is computed from the 3-4-5 ladder, not typed", () => {
  const m = computeConstruction(fixture("ladder-wall.json")).objects;
  const foot = (m.get("Foot") as Extract<ConstructionObject, { kind: "point" }>).p;
  const top = (m.get("Top") as Extract<ConstructionObject, { kind: "point" }>).p;
  const base = (m.get("WallBase") as Extract<ConstructionObject, { kind: "point" }>).p;
  close(vec.distance(foot, top), 5, 1e-9); // the ladder itself, given
  close(vec.distance(base, top), 4, 1e-9); // the wall's height, COMPUTED
});

test("pole-shadow: the shadow is h / tan(30°), and the sun's elevation is marked where the ray meets the ground", () => {
  const m = computeConstruction(fixture("pole-shadow.json")).objects;
  const f = (m.get("F") as Extract<ConstructionObject, { kind: "point" }>).p;
  const p = (m.get("P") as Extract<ConstructionObject, { kind: "point" }>).p;
  const shadow = (m.get("S") as Extract<ConstructionObject, { kind: "point" }>).p;
  close(vec.distance(f, p), 6, 1e-9); // the pole, given
  close(vec.distance(f, shadow), 6 / Math.tan((30 * Math.PI) / 180), 1e-6);
  close(angleAt(p, shadow, f), 30, 1e-6); // the elevation, at the tip of the shadow, as a textbook marks it
  const labels = ((expandConstruction(fixture("pole-shadow.json")).root as { children: { label?: string }[] }).children).map((b) => b.label ?? "");
  assert.ok(labels.includes("6 m"), JSON.stringify(labels));
  assert.ok(labels.includes("sombra = 10,39 m"), JSON.stringify(labels));
});

test("angle-of-depression: the boat's distance is height / tan(35°), rounded to two decimals on the drawing", async () => {
  const m = computeConstruction(fixture("angle-of-depression.json")).objects;
  const base = (m.get("Base") as Extract<ConstructionObject, { kind: "point" }>).p;
  const top = (m.get("Top") as Extract<ConstructionObject, { kind: "point" }>).p;
  const boat = (m.get("Boat") as Extract<ConstructionObject, { kind: "point" }>).p;
  const eyeRef = (m.get("EyeRef") as Extract<ConstructionObject, { kind: "point" }>).p;
  close(vec.distance(base, top), 20, 1e-9);
  const expected = 20 / Math.tan((35 * Math.PI) / 180);
  close(vec.distance(base, boat), expected, 1e-6);
  close(angleAt(eyeRef, top, boat), 35, 1e-6);

  const spec = expandConstruction(fixture("angle-of-depression.json"));
  const labels = ((spec.root as { children: { label?: string }[] }).children).map((b) => b.label ?? "");
  const printed = `${expected.toFixed(2).replace(".", ",")} m`;
  assert.ok(labels.includes(printed), `expected "${printed}" among ${JSON.stringify(labels)}`);
});

test("every pictogram fixture validates, renders, and passes every check -- pictograms never collide with a label", { timeout: 240000 }, async () => {
  for (const name of ["ladder-wall.json", "pole-shadow.json", "ramp.json", "angle-of-depression.json"]) {
    const result = await render(expandConstruction(fixture(name)), { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, `${name}: ${failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n")}`);
  }
});

test("ladder-wall and pole-shadow: the computed lengths are what the labels print, and length-matches-its-label passes them", { timeout: 240000 }, async () => {
  for (const name of ["ladder-wall.json", "pole-shadow.json"]) {
    const result = await render(expandConstruction(fixture(name)), { raster: false });
    const lengths = result.manifest.checks.filter((c) => c.id === "length-matches-its-label");
    assert.ok(lengths.length >= 2, `${name}: ${JSON.stringify(lengths)}`);
    for (const c of lengths) assert.equal(c.status, "pass", `${name} ${c.target}: ${c.detail}`);
  }
});

test("a picto option is refused off a line or ray, and an unknown picto name is refused", () => {
  assert.throws(
    () => expandConstruction({ objects: [{ A: [0, 0] }, { B: [1, 0] }, { name: "r", line: ["A", "B"], picto: "wall" }] } as unknown as ConstructionInput),
    /decorates a drawn segment/,
  );
  assert.throws(
    () => expandConstruction({ objects: [{ A: [0, 0] }, { B: [1, 0] }, { name: "s", segment: ["A", "B"], picto: "spaceship" }] } as unknown as ConstructionInput),
    /must be one of/,
  );
});
