/**
 * Constraint toggles (decision 0010).
 *
 * Three constraints may be stood down per figure. The tests below hold the
 * line on the two properties that make that safe rather than merely permissive:
 *
 *   A RELAXED CHECK IS NEVER A PASS. It reports "not-applicable" and names the
 *   toggle that excused it, so a manifest cannot be read as saying the figure
 *   was examined and found sound when it was not examined at all.
 *
 *   A CURVE IS CHECKED AS IT IS DRAWN. Curves are flattened into the very
 *   polyline `connector-clear-of-boxes` walks, so a curve cannot bow through a
 *   box that the check just cleared.
 *
 * Each toggle also has a planted fixture that must FAIL with the toggle off,
 * because a fixture that passes either way proves nothing about the toggle.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSpec, SpecError, resolveConstraints } from "../src/ir/types.ts";
import { runChecks } from "../src/checks.ts";
import { curveRoute, polylineIntersectsBox } from "../src/layout/connectors.ts";
import { flattenPath } from "../src/geometry/paths.ts";
import { render } from "../src/pipeline.ts";
import type { Check } from "../src/checks.ts";
import type { ConnectorCurve, LaidOutFigure, PlacedBox, PlacedConnector } from "../src/ir/types.ts";

// --- parsing and defaults ---------------------------------------------------

test("every toggle defaults to false, so silence means the constraint holds", () => {
  assert.deepEqual(resolveConstraints(undefined), {
    allowOverlap: false,
    allowConnectorCrossing: false,
    allowCurvedConnectors: false,
  });
  assert.deepEqual(resolveConstraints({}), {
    allowOverlap: false,
    allowConnectorCrossing: false,
    allowCurvedConnectors: false,
  });
  assert.equal(resolveConstraints({ constraints: { allowOverlap: true } }).allowOverlap, true);
});

test("a misspelled toggle is refused, not ignored", () => {
  // Ignoring it would leave the constraint on and fail a check the author
  // believed they had turned off — with nothing anywhere saying why.
  assert.throws(
    () => parseSpec({
      version: 1,
      canvas: { constraints: { allowOverlaps: true } },
      root: { type: "block", label: "x" },
    }),
    (error: unknown) => error instanceof SpecError && /unknown toggle "allowOverlaps"/.test(String(error)),
  );
});

test("a toggle that is not a boolean is refused", () => {
  assert.throws(
    () => parseSpec({
      version: 1,
      canvas: { constraints: { allowOverlap: "yes" } },
      root: { type: "block", label: "x" },
    }),
    SpecError,
  );
});

const curvedSpec = (constraints: unknown, curve: unknown) => ({
  version: 1,
  ...(constraints === undefined ? {} : { canvas: { constraints } }),
  root: {
    type: "scene",
    layout: "absolute",
    width: 300,
    height: 200,
    children: [
      { type: "block", id: "a", x: 10, y: 10, width: 80, height: 40 },
      { type: "block", id: "b", x: 200, y: 120, width: 80, height: 40 },
    ],
    connectors: [{ from: "a", to: "b", curve }],
  },
});

test("a curve without allowCurvedConnectors is refused, naming the toggle", () => {
  // Refused rather than silently straightened: drawing a line where a curve
  // was asked for is a figure the author did not request, with no reason given.
  assert.throws(
    () => parseSpec(curvedSpec(undefined, { kind: "arc" })),
    (error: unknown) =>
      error instanceof SpecError && /allowCurvedConnectors/.test(String(error)),
  );
  assert.throws(
    () => parseSpec(curvedSpec({ allowCurvedConnectors: false }, { kind: "arc" })),
    SpecError,
  );
});

test("a curve with the toggle on is accepted", () => {
  assert.doesNotThrow(() =>
    parseSpec(curvedSpec({ allowCurvedConnectors: true }, { kind: "arc", bulge: 0.3 })));
  assert.doesNotThrow(() =>
    parseSpec(curvedSpec({ allowCurvedConnectors: true }, { kind: "spline" })));
  assert.doesNotThrow(() =>
    parseSpec(curvedSpec({ allowCurvedConnectors: true },
      { kind: "bezier", control: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })));
});

test("a malformed curve is refused even when the toggle is on", () => {
  const on = { allowCurvedConnectors: true };
  assert.throws(() => parseSpec(curvedSpec(on, { kind: "swoosh" })), SpecError);
  assert.throws(() => parseSpec(curvedSpec(on, { kind: "arc", bulge: "big" })), SpecError);
  assert.throws(() => parseSpec(curvedSpec(on, { kind: "bezier", control: [] })), SpecError);
  assert.throws(
    () => parseSpec(curvedSpec(on, { kind: "bezier", control: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] })),
    SpecError,
  );
  assert.throws(
    () => parseSpec(curvedSpec(on, { kind: "bezier", control: [{ x: 0 }] })),
    SpecError,
  );
});

test("a spline radius is optional, but a nonsensical one is refused", () => {
  const on = { allowCurvedConnectors: true };
  assert.doesNotThrow(() => parseSpec(curvedSpec(on, { kind: "spline", radius: 8 })));
  // Zero is refused rather than read as "no rounding": a spline that rounds
  // nothing is a straight route, and asking for one this way is a mistake.
  assert.throws(() => parseSpec(curvedSpec(on, { kind: "spline", radius: 0 })), SpecError);
  assert.throws(() => parseSpec(curvedSpec(on, { kind: "spline", radius: -4 })), SpecError);
  assert.throws(() => parseSpec(curvedSpec(on, { kind: "spline", radius: "wide" })), SpecError);
});

// --- the checks stand down, and say so --------------------------------------

function box(id: string, x: number, y: number, w = 100, h = 100): PlacedBox {
  return {
    kind: "box", id, x, y, width: w, height: h,
    fill: "#fff", stroke: "#000", strokeWidth: 0, radius: 0,
    content: { x, y, width: w, height: h },
  };
}

function figureWith(elements: LaidOutFigure["elements"], constraints?: LaidOutFigure["constraints"]): LaidOutFigure {
  return { width: 600, height: 600, background: "#000", elements, constraints };
}

const overlapping = [box("a", 0, 0), box("b", 50, 50)];

const crossing: PlacedConnector = {
  kind: "connector", id: "leader", fromId: "a", toId: "c",
  points: [{ x: 100, y: 300 }, { x: 500, y: 300 }],
  arrow: "end", arrowStyle: "closed", dashed: false, lineStyle: "solid",
  stroke: "#000", strokeWidth: 1,
};
const crossed = [
  box("a", 0, 280, 40, 40), box("c", 520, 280, 40, 40), box("wall", 250, 250, 100, 100),
];

const find = (checks: Check[], id: string) => checks.filter((c) => c.id === id);

test("allowOverlap stands boxes-do-not-overlap down, and the fixture fails without it", () => {
  const off = find(runChecks(figureWith(overlapping)), "boxes-do-not-overlap");
  assert.ok(off.some((c) => c.status === "fail"), "the planted overlap must fail with the toggle off");

  const on = find(runChecks(figureWith(overlapping, { allowOverlap: true })), "boxes-do-not-overlap");
  assert.equal(on.length, 1);
  assert.equal(on[0]?.status, "not-applicable");
  assert.match(on[0]?.detail ?? "", /allowOverlap/);
});

test("allowConnectorCrossing stands connector-clear-of-boxes down, and the fixture fails without it", () => {
  const off = find(runChecks(figureWith([...crossed, crossing])), "connector-clear-of-boxes");
  assert.ok(off.some((c) => c.status === "fail"), "the planted crossing must fail with the toggle off");

  const on = find(
    runChecks(figureWith([...crossed, crossing], { allowConnectorCrossing: true })),
    "connector-clear-of-boxes",
  );
  assert.equal(on.length, 1);
  assert.equal(on[0]?.status, "not-applicable");
  assert.match(on[0]?.detail ?? "", /allowConnectorCrossing/);
});

test("a relaxed check is never reported as a pass", () => {
  // The distinction this guards is the whole point of the feature: "pass"
  // claims the figure was examined and found sound.
  const checks = runChecks(figureWith(
    [...overlapping, ...crossed, crossing],
    { allowOverlap: true, allowConnectorCrossing: true },
  ));
  for (const id of ["boxes-do-not-overlap", "connector-clear-of-boxes"]) {
    for (const check of find(checks, id)) {
      assert.notEqual(check.status, "pass", `${id} must not report pass while relaxed`);
      assert.equal(check.status, "not-applicable");
    }
  }
});

test("one toggle does not stand down the other", () => {
  const checks = runChecks(figureWith([...overlapping, ...crossed, crossing], { allowOverlap: true }));
  assert.ok(find(checks, "connector-clear-of-boxes").some((c) => c.status === "fail"));
  assert.equal(find(checks, "boxes-do-not-overlap")[0]?.status, "not-applicable");
});

// --- curve geometry ---------------------------------------------------------

test("an arc's apex lands exactly `bulge` of the chord off the chord", () => {
  const route = curveRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }], { kind: "arc", bulge: 0.25 });
  const apex = route[Math.floor(route.length / 2)]!;
  assert.ok(Math.abs(apex.x - 50) < 0.01, `apex x was ${apex.x}`);
  assert.ok(Math.abs(apex.y - 25) < 0.01, `apex y was ${apex.y}, expected 0.25 * 100`);
});

test("a curve never moves the endpoints routing chose", () => {
  // Routing already clipped these to the box borders and pulled them back off
  // the strokes; a curve that shifted them would undo that.
  const ends: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 13.5, y: 27.25 }, { x: 211, y: 90.5 },
  ];
  const curves: ConnectorCurve[] = [
    { kind: "arc", bulge: 0.4 },
    { kind: "bezier", control: [{ x: 40, y: 200 }] },
  ];
  for (const curve of curves) {
    const route = curveRoute([...ends], curve);
    assert.deepEqual(route[0], ends[0], `${curve.kind} moved the start`);
    assert.deepEqual(route[route.length - 1], ends[1], `${curve.kind} moved the end`);
  }
});

test("a zero bulge is a straight line, not a degenerate curve", () => {
  const route = curveRoute([{ x: 0, y: 0 }, { x: 80, y: 60 }], { kind: "arc", bulge: 0 });
  assert.deepEqual(route, [{ x: 0, y: 0 }, { x: 80, y: 60 }]);
});

test("a spline rounds the corners but leaves the straight runs alone", () => {
  // An orthogonal route from ELK: the corner is the only place a curve belongs,
  // because bending the runs would take the edge out of the lane ELK reserved.
  const route = curveRoute(
    [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }],
    { kind: "spline" },
  );
  assert.deepEqual(route[0], { x: 0, y: 0 });
  assert.deepEqual(route[route.length - 1], { x: 200, y: 200 });

  // Well before the corner the route is still exactly on the first run.
  const early = route.filter((p) => p.x < 150);
  assert.ok(early.length > 0);
  for (const p of early) assert.ok(Math.abs(p.y) < 0.001, `run bent at ${JSON.stringify(p)}`);

  // The fillet stays inside the corner's own elbow — it never overshoots past
  // the corner point, which is the cusp a midpoint-control spline produces.
  for (const p of route) {
    assert.ok(p.x <= 200.001 && p.y <= 200.001, `overshot the elbow at ${JSON.stringify(p)}`);
  }
});

test("a two-point route has no corner, so a spline leaves it untouched", () => {
  const points = [{ x: 5, y: 5 }, { x: 90, y: 40 }];
  assert.deepEqual(curveRoute(points, { kind: "spline" }), points);
});

test("flattenPath samples a cubic through its true midpoint", () => {
  // A symmetric cubic from (0,0) to (100,0) with both controls at y=60 passes
  // through y = 45 at t = 0.5 (3/4 of the control height), not y = 60.
  const points = flattenPath([
    { kind: "M", x: 0, y: 0 },
    { kind: "C", x1: 0, y1: 60, x2: 100, y2: 60, x: 100, y: 0 },
  ]);
  const mid = points[Math.floor(points.length / 2)]!;
  assert.ok(Math.abs(mid.x - 50) < 0.01, `x was ${mid.x}`);
  assert.ok(Math.abs(mid.y - 45) < 0.01, `y was ${mid.y}, expected 45`);
});

test("flattenPath drops duplicate points so an arrowhead always has a direction", () => {
  const points = flattenPath([
    { kind: "M", x: 10, y: 10 },
    { kind: "L", x: 10, y: 10 },
    { kind: "L", x: 50, y: 10 },
  ]);
  assert.deepEqual(points, [{ x: 10, y: 10 }, { x: 50, y: 10 }]);
});

// --- end to end -------------------------------------------------------------

const fixture = (name: string) =>
  parseSpec(JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")));

test("the planted fixtures render green with their toggle on", { timeout: 180000 }, async () => {
  for (const name of ["allow-overlap", "allow-connector-crossing", "allow-curved-connectors"]) {
    const result = await render(fixture(name));
    assert.equal(result.manifest.ok, true, `${name} should be green`);
  }
});

test("a curved connector is checked as the curve, not as its chord", { timeout: 180000 }, async () => {
  // The point of flattening. A straight line from `a` to `b` misses the wall;
  // an arc bowed hard enough goes straight through it. If `points` held the
  // chord, this would pass while the drawn curve crossed the box.
  const spec = parseSpec({
    version: 1,
    canvas: { padding: 10, constraints: { allowCurvedConnectors: true } },
    root: {
      type: "scene", layout: "absolute", width: 460, height: 360,
      children: [
        { type: "block", id: "a", x: 20, y: 20, width: 90, height: 40 },
        { type: "block", id: "b", x: 340, y: 20, width: 90, height: 40 },
        { type: "block", id: "wall", x: 190, y: 150, width: 90, height: 60 },
      ],
      connectors: [{ id: "bowed", from: "a", to: "b", curve: { kind: "arc", bulge: 0.62 } }],
    },
  });
  const result = await render(spec);
  const failed = result.manifest.checks.filter(
    (c) => c.id === "connector-clear-of-boxes" && c.status === "fail",
  );
  assert.equal(failed.length, 1, "the bowed curve must be caught crossing the wall");
  assert.match(failed[0]?.detail ?? "", /wall/);
});

test("a bezier's control point means the same place the spec's other coordinates do", { timeout: 180000 }, async () => {
  // The control point is authored in scene coordinates, exactly like a block's
  // x/y and a callout's `to` point. The route it bends has already been lifted
  // into page space, so leaving the control behind aims the curve at a
  // different place than the one written down -- and by exactly the padding,
  // which is why a scene at the origin would never show it.
  const padding = 60;
  const control = { x: 200, y: 0 };
  const spec = parseSpec({
    version: 1,
    canvas: { padding, constraints: { allowCurvedConnectors: true } },
    root: {
      type: "scene", layout: "absolute", width: 400, height: 200,
      children: [
        { type: "block", id: "a", x: 0, y: 80, width: 60, height: 40 },
        { type: "block", id: "b", x: 340, y: 80, width: 60, height: 40 },
      ],
      connectors: [
        { id: "bent", from: "a", to: "b", arrow: "none", curve: { kind: "bezier", control: [control] } },
      ],
    },
  });
  const result = await render(spec);
  const bent = result.figure.elements.find(
    (e): e is PlacedConnector => e.kind === "connector" && e.id === "bent",
  );
  assert.ok(bent, "the connector should have been placed");

  // A quadratic sits a quarter of the way from the chord's midpoint to twice
  // its control, so its apex is exactly (start + 2·control + end) / 4.
  const start = bent.points[0]!;
  const end = bent.points[bent.points.length - 1]!;
  const lifted = { x: control.x + padding, y: control.y + padding };
  const expected = {
    x: (start.x + 2 * lifted.x + end.x) / 4,
    y: (start.y + 2 * lifted.y + end.y) / 4,
  };
  const apex = bent.points.reduce((best, p) => (p.y < best.y ? p : best), bent.points[0]!);
  assert.ok(Math.abs(apex.y - expected.y) < 0.5, `apex y was ${apex.y}, expected ${expected.y}`);
  assert.ok(Math.abs(apex.x - expected.x) < 0.5, `apex x was ${apex.x}, expected ${expected.x}`);
});

test("a self-transition is drawn, not silently collapsed to nothing", { timeout: 180000 }, async () => {
  // A connector from a box to itself used to clip both ends against the same
  // border from the same centre and come out as a zero-length stub: no ink, no
  // arrowhead direction, and every check green because there was nothing there
  // to be wrong.
  const spec = parseSpec(
    JSON.parse(readFileSync(new URL("../fixtures/self-loop.json", import.meta.url), "utf8")),
  );
  const result = await render(spec);
  assert.equal(result.manifest.ok, true, "the self-loop fixture should be green");

  for (const id of ["idle-waits", "polling-retries"]) {
    const loop = result.figure.elements.find(
      (e): e is PlacedConnector => e.kind === "connector" && e.id === id,
    );
    assert.ok(loop, `${id} should have been placed`);
    const length = loop.points
      .slice(1)
      .reduce((total, p, i) => total + Math.hypot(p.x - loop.points[i]!.x, p.y - loop.points[i]!.y), 0);
    assert.ok(length > 50, `${id} came out only ${length.toFixed(2)}px long`);
    // And it belongs to its own box: both ends over it, nothing through it.
    const owner = result.figure.elements.find(
      (e): e is PlacedBox => e.kind === "box" && e.id === loop.fromId,
    )!;
    assert.equal(polylineIntersectsBox(loop.points, owner), false, `${id} passes through its own box`);
  }
});
