import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "../src/manifest.ts";
import type { LaidOutFigure } from "../src/ir/types.ts";

function baseBox() {
  return {
    kind: "box" as const,
    id: "box-1",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 5, y: 5, width: 90, height: 90 },
  };
}

test("a text line fully inside its owner's content box passes text-fits-box", () => {
  const figure: LaidOutFigure = {
    width: 200,
    height: 200,
    background: "#fff",
    elements: [
      baseBox(),
      {
        kind: "text",
        id: "text-1",
        ownerId: "box-1",
        fontFamily: "Arial",
        fontSize: 12,
        fill: "#000",
        anchor: "start",
        lines: [
          { text: "hi", x: 10, y: 10, box: { x: 10, y: 10, width: 20, height: 12 }, baselineUncertain: false },
        ],
      },
    ],
  };
  const manifest = buildManifest(figure, {});
  const check = manifest.checks.find((c) => c.id === "text-fits-box" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "pass");
  assert.equal(manifest.ok, true);
});

test("a line extending past the content box right edge fails with a detail naming the owner", () => {
  const figure: LaidOutFigure = {
    width: 200,
    height: 200,
    background: "#fff",
    elements: [
      baseBox(),
      {
        kind: "text",
        id: "text-1",
        ownerId: "box-1",
        fontFamily: "Arial",
        fontSize: 12,
        fill: "#000",
        anchor: "start",
        // content box right edge is at x=95 (5 + 90); this line extends to x=100, 5px overflow
        lines: [
          { text: "overflow", x: 10, y: 10, box: { x: 90, y: 10, width: 10, height: 12 }, baselineUncertain: false },
        ],
      },
    ],
  };
  const manifest = buildManifest(figure, {});
  const check = manifest.checks.find((c) => c.id === "text-fits-box" && c.target === "text-1");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.ok(check?.detail?.includes("box-1"));
  assert.equal(manifest.ok, false);
});

test("an element outside the canvas trips content-within-canvas", () => {
  const figure: LaidOutFigure = {
    width: 100,
    height: 100,
    background: "#fff",
    elements: [
      {
        ...baseBox(),
        id: "box-2",
        x: 90,
        y: 90,
        width: 50,
        height: 50,
      },
    ],
  };
  const manifest = buildManifest(figure, {});
  const check = manifest.checks.find((c) => c.id === "content-within-canvas");
  assert.ok(check);
  assert.equal(check?.status, "fail");
  assert.equal(manifest.ok, false);
});

test("a text with ownerId null passes text-fits-box", () => {
  const figure: LaidOutFigure = {
    width: 200,
    height: 200,
    background: "#fff",
    elements: [
      {
        kind: "text",
        id: "text-free",
        ownerId: null,
        fontFamily: "Arial",
        fontSize: 12,
        fill: "#000",
        anchor: "start",
        lines: [
          { text: "floating", x: 10, y: 10, box: { x: 10, y: 10, width: 20, height: 12 }, baselineUncertain: false },
        ],
      },
    ],
  };
  const manifest = buildManifest(figure, {});
  const check = manifest.checks.find((c) => c.id === "text-fits-box" && c.target === "text-free");
  assert.ok(check);
  assert.equal(check?.status, "pass");
  assert.equal(manifest.ok, true);
});

test("warnings passed via options are carried through", () => {
  const figure: LaidOutFigure = {
    width: 100,
    height: 100,
    background: "#fff",
    elements: [],
  };
  const manifest = buildManifest(figure, { warnings: ["custom warning"] });
  assert.ok(manifest.warnings.includes("custom warning"));
});

test("ok is false whenever any check failed", () => {
  const figure: LaidOutFigure = {
    width: 100,
    height: 100,
    background: "#fff",
    elements: [
      {
        ...baseBox(),
        id: "box-3",
        x: 200,
        y: 200,
        width: 10,
        height: 10,
      },
    ],
  };
  const manifest = buildManifest(figure, {});
  assert.equal(manifest.ok, false);
  assert.ok(manifest.checks.some((c) => c.status === "fail"));
});
