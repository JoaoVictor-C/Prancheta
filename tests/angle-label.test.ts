import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/pipeline.ts";
import { parseSpec } from "../src/ir/types.ts";

/**
 * ADR 0077: a label inside the angle its arc marks names the angle, not the
 * arms. The textbook incline -- ground, a 30° slope hatched along its face,
 * an arc of radius 80 at the foot -- with "θ = 30°" between the arms.
 */

const V = { x: 60, y: 240 };
const R = 80;
const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (r: number, deg: number) => ({
  x: +(V.x + r * Math.cos(rad(deg))).toFixed(2),
  y: +(V.y - r * Math.sin(rad(deg))).toFixed(2),
});

type Options = {
  labelAt?: { r: number; deg: number };
  arrow?: "none" | "end";
  thirdRayDeg?: number;
};

function incline(options: Options = {}) {
  const { labelAt = { r: 115, deg: 14 }, arrow = "none", thirdRayDeg } = options;
  // Hatching drawn as one path along the slope, ticks 4px into the wedge.
  const hatch: { line: { x: number; y: number } }[] = [];
  for (let s = 110; s <= 330; s += 12) {
    const p = at(s, 30);
    const tick = { x: +(p.x - 12 * Math.cos(rad(15))).toFixed(2), y: +(p.y + 12 * Math.sin(rad(15))).toFixed(2) };
    hatch.push({ line: p }, { line: tick }, { line: p });
  }
  const label = at(labelAt.r, labelAt.deg);
  const marks: unknown[] = [
    { id: "ground", from: { x: 20, y: V.y }, segments: [{ line: { x: 420, y: V.y } }], close: false, stroke: "#111111" },
    { id: "slope", from: V, segments: [{ line: at(380, 30) }], close: false, stroke: "#111111" },
    { id: "slope-hatch", from: at(110, 30), segments: hatch, close: false, stroke: "#111111" },
  ];
  if (thirdRayDeg !== undefined) {
    marks.push({ id: "third", from: V, segments: [{ line: at(380, thirdRayDeg) }], close: false, stroke: "#111111" });
  }
  return {
    version: 1,
    canvas: { constraints: { allowCurvedConnectors: true, allowConnectorCrossing: true, allowOverlap: true } },
    root: {
      type: "scene",
      layout: "absolute",
      width: 440,
      height: 280,
      marks,
      children: [
        {
          type: "block",
          id: "theta-label",
          x: label.x - 32,
          y: label.y - 12,
          width: 64,
          height: 24,
          padding: 0,
          fill: "none",
          stroke: "none",
          wrap: "none",
          label: "θ = 30°",
          annotates: "theta",
        },
      ],
      connectors: [
        { id: "theta", from: at(R, 0), to: at(R, 30), arrow, curve: { kind: "sweep", centre: V } },
      ],
    },
  };
}

async function checks(spec: unknown) {
  const result = await render(parseSpec(spec));
  const find = (id: string) => result.manifest.checks.find((c) => c.id === id)!;
  return { owner: find("annotation-nearest-its-owner"), sweep: find("sweep-matches-its-label") };
}

test("a label inside its angle names the angle, and its 30° is checked against the arc", { timeout: 60000 }, async () => {
  const { owner, sweep } = await checks(incline());
  assert.equal(owner.status, "pass", owner.detail);
  assert.equal(sweep.status, "pass", sweep.detail);
  assert.equal(sweep.examined, 1);
});

test("outside the angle the strict rule still holds: across the slope the arm wins", { timeout: 60000 }, async () => {
  const { owner } = await checks(incline({ labelAt: { r: 115, deg: 40 } }));
  assert.equal(owner.status, "fail");
  assert.match(owner.detail ?? "", /theta-label names theta/);
});

test("too far from the vertex the label no longer reads as the angle's", { timeout: 60000 }, async () => {
  const { owner } = await checks(incline({ labelAt: { r: 260, deg: 12 } }));
  assert.equal(owner.status, "fail");
});

test("a rotation arrow is not an angle: with an arrowhead the strict rule applies", { timeout: 60000 }, async () => {
  const { owner } = await checks(incline({ arrow: "end" }));
  assert.equal(owner.status, "fail");
});

test("a third line inside the angle still competes: only the arms are excused", { timeout: 60000 }, async () => {
  const { owner } = await checks(incline({ thirdRayDeg: 16 }));
  assert.equal(owner.status, "fail");
  assert.match(owner.detail ?? "", /third/);
});
