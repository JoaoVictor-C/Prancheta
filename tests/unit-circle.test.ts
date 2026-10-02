/**
 * unit-circle: the point, arc, projections and tangent are all found from
 * one angle written as text -- these tests pin the angle parser, the
 * exact-value snapper (cos/sin as ½, √2/2, √3/2, not a decimal that happens
 * to be close), the derived symmetric angles, the refusals this preset
 * makes rather than draw something dishonest, and that the fixtures render
 * with every check passing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  expandUnitCircle,
  formatAngle,
  formatTrigValue,
  parseAngle,
  validateUnitCircleInput,
} from "../src/presets/unit-circle/preset.ts";
import type { UnitCircleInput } from "../src/presets/unit-circle/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import type { Block, Mark, Scene } from "../src/ir/types.ts";

const dir = fileURLToPath(new URL("../fixtures/unit-circle/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

const blocks = (input: UnitCircleInput): Block[] => ((expandUnitCircle(input).root as Scene).children as Block[]);
const labels = (input: UnitCircleInput): string[] => blocks(input).map((b) => b.label ?? "").filter((t) => t !== "");
const marks = (input: UnitCircleInput): Mark[] => (expandUnitCircle(input).root as Scene).marks ?? [];

// --- angle parsing ----------------------------------------------------------

test("angles as a fraction of pi", () => {
  assert.ok(Math.abs(parseAngle("π/6") - Math.PI / 6) < 1e-12);
  assert.ok(Math.abs(parseAngle("5π/4") - (5 * Math.PI) / 4) < 1e-12);
  assert.ok(Math.abs(parseAngle("pi/3") - Math.PI / 3) < 1e-12);
  assert.ok(Math.abs(parseAngle("π") - Math.PI) < 1e-12);
  assert.ok(Math.abs(parseAngle("2π") - 2 * Math.PI) < 1e-12);
});

test("negative angles as a fraction of pi", () => {
  assert.ok(Math.abs(parseAngle("-π/3") - -Math.PI / 3) < 1e-12);
  assert.ok(Math.abs(parseAngle("-π") - -Math.PI) < 1e-12);
});

test("angles in degrees", () => {
  assert.ok(Math.abs(parseAngle("150°") - (150 * Math.PI) / 180) < 1e-12);
  assert.ok(Math.abs(parseAngle("-60°") - (-60 * Math.PI) / 180) < 1e-12);
  assert.ok(Math.abs(parseAngle("0°")) < 1e-12);
});

test("angles beyond a full turn are accepted as-is (a point, not necessarily an arc)", () => {
  assert.ok(Math.abs(parseAngle("5π/4") - (5 * Math.PI) / 4) < 1e-12);
  assert.ok(Math.abs(parseAngle("390°") - (390 * Math.PI) / 180) < 1e-12);
});

test("a plain number is read as radians", () => {
  assert.ok(Math.abs(parseAngle("1.2") - 1.2) < 1e-12);
  assert.ok(Math.abs(parseAngle("-0.5") - -0.5) < 1e-12);
});

test("an angle that is not one of the three forms is refused, naming what was tried to be read", () => {
  assert.throws(() => parseAngle("thirty degrees"), /is not understood/);
  assert.throws(() => parseAngle(""), /is not understood/);
});

test("formatAngle prints the pi-fraction, then degrees, then radians", () => {
  assert.equal(formatAngle(Math.PI / 6), "π/6");
  assert.equal(formatAngle((5 * Math.PI) / 6), "5π/6");
  assert.equal(formatAngle(-Math.PI / 3), "−π/3");
  assert.equal(formatAngle(Math.PI), "π");
  assert.equal(formatAngle(0), "0");
  // 10° is not a small fraction of pi (10/180 = 1/18, denominator > 12), so
  // it falls back to degrees rather than a fraction nobody would write.
  assert.equal(formatAngle((10 * Math.PI) / 180), "10°");
});

// --- exact-value snapping -----------------------------------------------------

test("cos and sin of the standard angles print as exact values, pt-BR style", () => {
  assert.equal(formatTrigValue(Math.cos(Math.PI / 3)), "1/2"); // cos(60°) = 1/2, not "0,5"
  assert.equal(formatTrigValue(Math.sin(Math.PI / 6)), "1/2");
  assert.equal(formatTrigValue(Math.cos(Math.PI / 4)), "√2/2");
  assert.equal(formatTrigValue(Math.sin(Math.PI / 3)), "√3/2");
  assert.equal(formatTrigValue(Math.cos(0)), "1");
  assert.equal(formatTrigValue(Math.sin(0)), "0");
  assert.equal(formatTrigValue(Math.cos(Math.PI)), "−1");
  assert.equal(formatTrigValue(Math.cos((2 * Math.PI) / 3)), "−1/2"); // cos(120°) = −1/2
});

test("a value that is not one of the five notable magnitudes falls back to the ordinary formatter", () => {
  assert.equal(formatTrigValue(0.3), "0,3");
});

// --- the figure: point positions and derived symmetric angles ------------------

test("the point at pi/6 sits at (cos(pi/6), sin(pi/6)), derived, not typed", () => {
  const input: UnitCircleInput = { angles: ["π/6"], radius: 100 };
  const fig = expandUnitCircle(input);
  const scene = fig.root as Scene;
  // The dot is a Mark (free ink), not a Block -- a small filled circle whose
  // four arc segments all share one centre, which IS the derived point.
  const dot = scene.marks!.find((m) => m.fill !== "none" && m.fill !== undefined && m.close === true && m.gridOf === undefined);
  assert.ok(dot !== undefined);
  const centre = (dot!.segments[0] as { arc: { x: number; y: number }; centre: { x: number; y: number } }).centre;
  const width = (scene as Scene).width!;
  const height = (scene as Scene).height!;
  const expectedX = width / 2 + 100 * Math.cos(Math.PI / 6);
  const expectedY = height / 2 - 100 * Math.sin(Math.PI / 6);
  assert.ok(Math.abs(centre.x - expectedX) < 0.5, `${centre.x} vs ${expectedX}`);
  assert.ok(Math.abs(centre.y - expectedY) < 0.5, `${centre.y} vs ${expectedY}`);
});

test("the default point label is the angle, formatted -- 150 degrees IS 5pi/6, so that is what prints", () => {
  const input: UnitCircleInput = { angles: ["π/6", "150°"] };
  assert.deepEqual(labels(input), ["cos", "sen", "π/6", "5π/6"]);
});

test("symmetric angles are derived points: pi - theta, pi + theta, two pi - theta", () => {
  const input: UnitCircleInput = { angles: [{ angle: "π/6", symmetric: true }] };
  const found = labels(input);
  assert.ok(found.includes("5π/6")); // pi - pi/6
  assert.ok(found.includes("7π/6")); // pi + pi/6
  assert.ok(found.includes("11π/6")); // 2pi - pi/6
});

test("symmetric accepts a specific subset", () => {
  const input: UnitCircleInput = { angles: [{ angle: "π/3", symmetric: ["pi-plus-theta"] }] };
  const found = labels(input);
  assert.ok(found.includes("4π/3")); // pi + pi/3
  assert.ok(!found.includes("2π/3")); // pi - pi/3 was not asked for
});

// --- refusals ------------------------------------------------------------------

test("validation refuses an angle it cannot read", () => {
  assert.throws(
    () => validateUnitCircleInput({ angles: ["not an angle"] } as unknown as Record<string, unknown>),
    /is not understood/,
  );
});

test("arc is refused past 180 degrees: a sweep can only draw the shorter arc", () => {
  assert.throws(
    () => expandUnitCircle({ angles: [{ angle: "5π/4", arc: true }] }),
    /cannot draw "arc"/,
  );
  assert.throws(() => expandUnitCircle({ angles: [{ angle: "π", arc: true }] }), /cannot draw "arc"/);
});

test("tangent is refused where cos theta = 0", () => {
  assert.throws(
    () => expandUnitCircle({ angles: [{ angle: "π/2", tangent: true }] }),
    /no tangent/,
  );
});

test("tangent is refused when too steep to draw legibly", () => {
  assert.throws(
    () => expandUnitCircle({ angles: [{ angle: "80°", tangent: true }] }),
    /too steep/,
  );
});

test("radius must be a sane positive size", () => {
  assert.throws(() => expandUnitCircle({ angles: ["π/6"], radius: 5 }), /radius/);
});

test("angles must not be empty", () => {
  assert.throws(() => expandUnitCircle({ angles: [] }), /non-empty/);
});

// --- defects a human reviewer found in the renders (2026-09-25) ----------------

test("the radius OP -- the angle's terminal side -- is drawn from O to P for a primary angle with an arc", () => {
  const input: UnitCircleInput = { angles: [{ angle: "π/3", arc: true }], radius: 100 };
  const scene = expandUnitCircle(input).root as Scene;
  const cx = scene.width! / 2;
  const cy = scene.height! / 2;
  const expected = { x: cx + 100 * Math.cos(Math.PI / 3), y: cy - 100 * Math.sin(Math.PI / 3) };
  const op = marks(input).find((m) => {
    const seg = m.segments[0] as { line?: { x: number; y: number } } | undefined;
    if (m.segments.length !== 1 || seg?.line === undefined) return false;
    const from = m.from as { x: number; y: number };
    return (
      Math.abs(from.x - cx) < 0.5 &&
      Math.abs(from.y - cy) < 0.5 &&
      Math.abs(seg.line.x - expected.x) < 0.5 &&
      Math.abs(seg.line.y - expected.y) < 0.5
    );
  });
  assert.ok(op !== undefined, "no straight run from the origin to the point was found");
});

test("no radius OP is drawn for a plain projection-only point -- nothing there for it to connect to, and it would crowd a symmetric pair's sin label", () => {
  const input: UnitCircleInput = { angles: [{ angle: "π/3", projection: true }], radius: 100 };
  const scene = expandUnitCircle(input).root as Scene;
  const cx = scene.width! / 2;
  const cy = scene.height! / 2;
  const op = marks(input).find((m) => {
    const seg = m.segments[0] as { line?: unknown } | undefined;
    if (m.segments.length !== 1 || seg?.line === undefined) return false;
    const from = m.from as { x: number; y: number };
    return Math.abs(from.x - cx) < 0.5 && Math.abs(from.y - cy) < 0.5;
  });
  assert.equal(op, undefined);
});

/** Does the segment a-b cross the axis-aligned rect (Liang-Barsky)? */
function segmentCrossesRect(a: { x: number; y: number }, b: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lo = { x: rect.x, y: rect.y };
  const hi = { x: rect.x + rect.width, y: rect.y + rect.height };
  for (const [p, q] of [
    [-dx, a.x - lo.x],
    [dx, hi.x - a.x],
    [-dy, a.y - lo.y],
    [dy, hi.y - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

test("the arc's degree label never sits on OP or on either axis, across narrow, moderate, obtuse and negative angles", () => {
  // The case that found the defect: with `avoidInk: false` (a fix for a
  // DIFFERENT defect -- the label walking away from its own arc), the label
  // could land squarely on OP, and its own paper backing then cut a visible
  // gap into that straight line. Checked across three regimes because the
  // fix (arcLabelSpot / minArcRadiusForLabel in preset.ts) treats a narrow
  // wedge (15°, which needs its arc's own radius grown to fit the label at
  // all) differently from a moderate one (45°, in-wedge at the default
  // radius) and an obtuse one (150°, plenty of room).
  for (const angle of ["π/12", "π/4", "π/3", "5π/6", "-π/4"]) {
    const input: UnitCircleInput = { angles: [{ angle, arc: true }] };
    const scene = expandUnitCircle(input).root as Scene;
    const cx = scene.width! / 2;
    const cy = scene.height! / 2;
    const op = marks(input).find((m) => {
      const seg = m.segments[0] as { line?: { x: number; y: number } } | undefined;
      if (m.segments.length !== 1 || seg?.line === undefined) return false;
      const from = m.from as { x: number; y: number };
      return Math.abs(from.x - cx) < 0.5 && Math.abs(from.y - cy) < 0.5;
    });
    assert.ok(op !== undefined, `${angle}: no OP segment found`);
    const opTo = (op!.segments[0] as { line: { x: number; y: number } }).line;
    const degreeLabel = (scene.children as Block[]).find((b) => /°$/.test(b.label ?? "") && b.annotates?.endsWith("-arc"));
    assert.ok(degreeLabel !== undefined, `${angle}: no degree label annotating an arc was found`);
    const rect = {
      x: degreeLabel!.x ?? 0,
      y: degreeLabel!.y ?? 0,
      width: degreeLabel!.width ?? 0,
      height: degreeLabel!.height ?? 0,
    };
    assert.equal(
      segmentCrossesRect(op!.from as { x: number; y: number }, opTo, rect),
      false,
      `${angle}: the degree label's box (${JSON.stringify(rect)}) crosses OP (${JSON.stringify(op!.from)} -> ${JSON.stringify(opTo)})`,
    );
    // Nor the axes. Clearing only OP moved the same defect onto them: the
    // x axis is grid furniture the checks exempt, and a label biased onto it
    // had its backing cut a visible gap into the axis a reader measures from.
    const far = scene.width! + scene.height!;
    for (const [name, a, b] of [
      ["the x axis", { x: -far, y: cy }, { x: far, y: cy }],
      ["the y axis", { x: cx, y: -far }, { x: cx, y: far }],
    ] as const) {
      assert.equal(segmentCrossesRect(a, b, rect), false, `${angle}: the degree label's box crosses ${name}`);
    }
  }
});

test("the tangent's dashed extension of OP reaches exactly (1, tan theta) on the tangent axis", () => {
  const input: UnitCircleInput = { angles: [{ angle: "π/3", tangent: true }], radius: 100 };
  const scene = expandUnitCircle(input).root as Scene;
  const cx = scene.width! / 2;
  const cy = scene.height! / 2;
  const t = Math.tan(Math.PI / 3);
  const tanTop = { x: cx + 100, y: cy - t * 100 };
  const extension = marks(input).find((m) => m.lineStyle === "dashed" && m.segments.length === 1);
  assert.ok(extension !== undefined, "no dashed extension was drawn");
  const to = (extension!.segments[0] as { line: { x: number; y: number } }).line;
  assert.ok(
    Math.abs(to.x - tanTop.x) < 0.5 && Math.abs(to.y - tanTop.y) < 0.5,
    `extension ends at ${JSON.stringify(to)}, expected ${JSON.stringify(tanTop)}`,
  );
});

test("the sin value's label names the PLACE at its own foot on the y axis, not a symmetric point's dot several radii away", () => {
  // The case that found the defect: a symmetric-angle figure with
  // projection on, where the sin label used to drift toward pi-minus-theta's
  // point instead of staying at its own axis foot.
  const input: UnitCircleInput = { angles: [{ angle: "π/3", projection: true, symmetric: true }] };
  const scene = expandUnitCircle(input).root as Scene;
  const cx = scene.width! / 2;
  const cy = scene.height! / 2;
  const theta = Math.PI / 3;
  const R = 150;
  const sinFoot = { x: cx, y: cy - R * Math.sin(theta) };
  const blocksArr = scene.children as Block[];
  const sinLabel = blocksArr.find((b) => b.label === "√3/2" && b.annotates?.endsWith("-place"));
  assert.ok(sinLabel !== undefined, "the sin value carries no place annotation, so nothing checks it at all");
  const place = (scene.marks ?? []).find((m) => m.id === sinLabel!.annotates);
  assert.ok(place !== undefined && place.place === true);
  const at = place!.from as { x: number; y: number };
  // The place is the true foot of the projection, regardless of where the
  // search ultimately set the label.
  assert.ok(Math.abs(at.x - sinFoot.x) < 0.5, `place.x=${at.x} vs the y axis at ${sinFoot.x}`);
  assert.ok(Math.abs(at.y - sinFoot.y) < 0.5, `place.y=${at.y} vs sin(pi/3)'s height ${sinFoot.y}`);
  // And the label itself sits within its own size of that place -- "beside
  // the y axis", never off beside pi-minus-theta's point instead.
  const centre = { x: (sinLabel!.x ?? 0) + (sinLabel!.width ?? 0) / 2, y: (sinLabel!.y ?? 0) + (sinLabel!.height ?? 0) / 2 };
  const reach = Math.max(sinLabel!.width ?? 0, sinLabel!.height ?? 0);
  const dist = Math.hypot(centre.x - at.x, centre.y - at.y);
  assert.ok(dist <= reach, `sin label sits ${dist}px from its place, farther than its own size (${reach}px)`);
});

// --- rendering -------------------------------------------------------------

for (const name of fixtures) {
  test(`${name} renders with every check passing`, { timeout: 240000 }, async () => {
    const input = JSON.parse(readFileSync(join(dir, name), "utf8")) as UnitCircleInput;
    const spec = expandUnitCircle(input);
    const result = await render(spec, { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
  });
}

// --- answers: false ---------------------------------------------------------

test("answers:false hides cos/sin values, tg label and symmetric points; keeps the given angle and arc", () => {
  const input: UnitCircleInput = {
    angles: [{ angle: "π/4", arc: true, projection: true, tangent: true, symmetric: true }],
    answers: false,
  };
  const on = labels({ ...input, answers: true });
  const off = labels(input);
  assert.ok(on.some((t) => t.startsWith("tg θ")));
  assert.ok(on.includes("√2/2"));
  assert.ok(on.includes("3π/4"));
  assert.ok(!off.some((t) => t.startsWith("tg")), off.join("|"));
  assert.ok(!off.includes("√2/2"));
  assert.ok(!off.includes("3π/4") && !off.includes("5π/4") && !off.includes("7π/4"));
  assert.ok(off.includes("π/4"));
  assert.ok(off.includes("45°"));
  assert.equal(marks(input).some((m) => m.from !== undefined && typeof m.from === "object" && "frame" in m.from && m.from.frame === "radius"), false);
});

test("answers:true is the default and unchanged", () => {
  const input: UnitCircleInput = { angles: [{ angle: "π/6", projection: true, tangent: true }] };
  assert.deepEqual(labels(input), labels({ ...input, answers: true }));
});

test("answers:false fixture renders with every check passing", { timeout: 240000 }, async () => {
  const input = JSON.parse(readFileSync(join(dir, "question-no-answers.json"), "utf8")) as UnitCircleInput;
  const result = await render(expandUnitCircle(input), { raster: false });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.equal(result.manifest.ok, true, failing.map((c) => `${c.id} ${c.target}: ${c.detail}`).join("\n"));
});
