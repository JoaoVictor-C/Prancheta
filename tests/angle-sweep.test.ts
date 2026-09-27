import { test } from "node:test";
import assert from "node:assert/strict";
import { curveRoute, sweptDegrees } from "../src/layout/connectors.ts";
import { render } from "../src/pipeline.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";

// --- the geometry ------------------------------------------------------------

test("sweptDegrees measures the angle two arms subtend at a centre", () => {
  const centre = { x: 0, y: 0 };
  assert.equal(Math.round(sweptDegrees({ x: 10, y: 0 }, { x: 0, y: -10 }, centre)), 90);
  assert.equal(Math.round(sweptDegrees({ x: 10, y: 0 }, { x: -10, y: 0 }, centre)), 180);
  // 30 degrees above the horizontal, the case the fixture is built from.
  const arm = { x: 10 * Math.cos(Math.PI / 6), y: -10 * Math.sin(Math.PI / 6) };
  assert.ok(Math.abs(sweptDegrees({ x: 10, y: 0 }, arm, centre) - 30) < 1e-9);
});

test("a sweep keeps its stated endpoints and bows out to the real radius", () => {
  const first = { x: 100, y: 0 };
  const arm = { x: 100 * Math.cos(Math.PI / 3), y: -100 * Math.sin(Math.PI / 3) };
  const points = curveRoute([first, arm], { kind: "sweep", centre: { x: 0, y: 0 } });
  assert.deepEqual(points[0], first);
  assert.deepEqual(points[points.length - 1], arm);
  // Every flattened point sits on the circle, within the flattener's own bound.
  for (const point of points) {
    assert.ok(
      Math.abs(Math.hypot(point.x, point.y) - 100) < 0.5,
      `expected radius 100, got ${Math.hypot(point.x, point.y)}`,
    );
  }
});

// --- the authored surface ----------------------------------------------------

function arcScene(curve: unknown, allowCurves = true) {
  return {
    version: 1,
    canvas: {
      constraints: {
        allowCurvedConnectors: allowCurves,
        allowConnectorCrossing: true,
        allowOverlap: true,
      },
    },
    root: {
      type: "scene",
      layout: "absolute",
      width: 300,
      height: 300,
      children: [
        { type: "block", id: "anchor", x: 0, y: 0, width: 10, height: 10, label: "" },
        {
          type: "block",
          id: "tag",
          x: 120,
          y: 120,
          width: 40,
          height: 22,
          padding: 0,
          label: "30°",
          annotates: "arc",
          wrap: "none",
        },
      ],
      connectors: [
        {
          // Both arms 100px from the vertex at (100, 200): one along +x, one
          // 30 degrees above it. A first draft put `from` ON the vertex, which
          // gives one arm zero length and no angle at all.
          id: "arc",
          from: { x: 200, y: 200 },
          to: { x: 186.6, y: 150 },
          arrow: "none",
          curve,
        },
      ],
    },
  };
}

test("a sweep needs a centre, and says so", () => {
  assert.throws(
    () => parseSpec(arcScene({ kind: "sweep" })),
    (error: unknown) => error instanceof SpecError && /centre must be an \{x, y\} point/.test(error.message),
  );
});

test("a sweep is a curve, so it is still gated by allowCurvedConnectors", () => {
  assert.throws(
    () => parseSpec(arcScene({ kind: "sweep", centre: { x: 0, y: 0 } }, false)),
    (error: unknown) => error instanceof SpecError && /allowCurvedConnectors/.test(error.message),
  );
});

// --- the check ---------------------------------------------------------------

async function sweepCheck(spec: unknown) {
  const result = await render(parseSpec(spec));
  return result.manifest.checks.find((c) => c.id === "sweep-matches-its-label");
}

test(
  "an arc that sweeps the angle its label prints passes",
  { timeout: 60000 },
  async () => {
    const check = await sweepCheck(arcScene({ kind: "sweep", centre: { x: 100, y: 200 } }));
    assert.equal(check?.status, "pass");
    assert.equal(check?.examined, 1);
  },
);

function withLabel(spec: ReturnType<typeof arcScene>, label: string) {
  const scene = spec as unknown as { root: { children: { id: string; label: string }[] } };
  for (const child of scene.root.children) if (child.id === "tag") child.label = label;
  return spec;
}

test(
  "a pt-BR label is read too: \"30,0°\" passes the arc it names, \"21,5°\" fails it",
  { timeout: 60000 },
  async () => {
    const centre = { x: 100, y: 200 };
    const agrees = await sweepCheck(withLabel(arcScene({ kind: "sweep", centre }), "30,0°"));
    assert.equal(agrees?.status, "pass");
    assert.equal(agrees?.examined, 1);
    const disagrees = await sweepCheck(withLabel(arcScene({ kind: "sweep", centre }), "21,5°"));
    assert.equal(disagrees?.status, "fail");
  },
);

test(
  "an arc that sweeps a different angle from its label is reported",
  { timeout: 60000 },
  async () => {
    // The original defect, rebuilt deliberately: the label still says 30, but
    // the centre is moved so the arms subtend something else entirely.
    const check = await sweepCheck(arcScene({ kind: "sweep", centre: { x: 20, y: 260 } }));
    assert.equal(check?.status, "fail");
    assert.match(check?.detail ?? "", /tag says 30 but arc sweeps/);
  },
);

test(
  "the centre is read in the same space as the points it is compared against",
  { timeout: 60000 },
  async () => {
    // A scene is lifted into page space by its own placement. The curve used
    // to be stored unlifted beside points that were lifted, and this check
    // measured 21.4 degrees for an arc subtending exactly 30.
    const check = await sweepCheck(arcScene({ kind: "sweep", centre: { x: 100, y: 200 } }));
    assert.equal(check?.status, "pass", "a scene offset must not change the measured angle");
  },
);

test(
  "a sweep labelled with a name rather than a value claims nothing to check",
  { timeout: 60000 },
  async () => {
    // "θ" names the angle without stating it. Reporting that would punish a
    // correct figure, so it is not-applicable rather than a failure.
    const spec = arcScene({ kind: "sweep", centre: { x: 100, y: 200 } }) as Record<string, any>;
    spec.root.children[1].label = "θ";
    const check = await sweepCheck(spec);
    assert.equal(check?.status, "not-applicable");
    assert.match(check?.detail ?? "", /none annotated with a stated angle/);
  },
);

test(
  "a figure with no sweep at all is not-applicable, not a vacuous pass",
  { timeout: 60000 },
  async () => {
    const spec = arcScene(undefined) as Record<string, any>;
    delete spec.root.connectors[0].curve;
    const check = await sweepCheck(spec);
    assert.equal(check?.status, "not-applicable");
    assert.equal(check?.examined, 0);
  },
);
