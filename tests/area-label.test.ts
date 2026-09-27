import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import { render } from "../src/pipeline.ts";
import { parseSpec } from "../src/ir/types.ts";
import type {
  LaidOutFigure,
  MeasuredIn,
  PlacedBox,
  PlacedMark,
  PlacedText,
  Point,
} from "../src/ir/types.ts";

// ADR 0037: `area-matches-its-label` -- the shaded-region twin of ADR 0028's
// `length-matches-its-label`. A closed mark's vertices, all stated in one
// frame, give it an area in that frame's units; its printed area ("A = 4/3",
// "8/3 u.a.", "2,5") is typed independently of the polygon and can disagree.

type Element = PlacedBox | PlacedText | PlacedMark;

function box(id: string, x: number, y: number, width: number, height: number, extra: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box",
    id,
    x,
    y,
    width,
    height,
    fill: "rgba(0, 0, 0, 0)",
    stroke: "none",
    strokeWidth: 0,
    radius: 0,
    content: { x, y, width, height },
    ...extra,
  };
}

function text(ownerId: string, printed: string, at: { x: number; y: number }): PlacedText {
  return {
    kind: "text",
    id: `${ownerId}-text`,
    ownerId,
    fontFamily: "Arial",
    fontSize: 12,
    fill: "#000",
    anchor: "start",
    lines: [{ text: printed, x: at.x, y: at.y + 12, box: { x: at.x, y: at.y, width: 40, height: 14 }, baselineUncertain: false }],
  };
}

/** A label box annotating `owner`, with its text. */
function label(id: string, printed: string, owner: string, x: number, y: number, w = 40, h = 14): Element[] {
  return [box(id, x, y, w, h, { annotates: owner }), text(id, printed, { x, y })];
}

/** A closed region: `points` already in canvas pixels, as frame resolution would leave them. */
function region(id: string, points: Point[], measuredIn?: MeasuredIn, extra: Partial<PlacedMark> = {}): PlacedMark {
  return {
    kind: "mark",
    id,
    points,
    closed: true,
    fill: "rgba(40, 90, 200, 0.15)",
    stroke: "none",
    strokeWidth: 0,
    lineStyle: "solid",
    arcCentres: [],
    ...(measuredIn === undefined ? {} : { measuredIn }),
    ...extra,
  };
}

function figure(elements: Element[]): LaidOutFigure {
  return { width: 800, height: 600, background: "#fff", elements };
}

function checks(id: string, elements: Element[]) {
  return runChecks(figure(elements)).filter((c) => c.id === id);
}

// A square frame, 50px per unit: shoelace over an axis-aligned rectangle of
// w×h pixels then gives an area of (w/50)·(h/50) units.
const square: MeasuredIn = { frame: "plane", xUnit: 50, yUnit: 50, rotation: 0 };

// --- area-matches-its-label: the arithmetic --------------------------------

test("a unit square labelled 1 passes; the same square labelled 2 fails", () => {
  const unitSquare: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }];

  const [ok] = checks("area-matches-its-label", [
    region("sq", unitSquare, square),
    ...label("tag", "1", "sq", 60, 10),
  ]);
  assert.equal(ok?.status, "pass", ok?.detail);
  assert.equal(ok?.target, "sq");

  const [wrong] = checks("area-matches-its-label", [
    region("sq", unitSquare, square),
    ...label("tag", "2", "sq", 60, 10),
  ]);
  assert.equal(wrong?.status, "fail");
  assert.match(wrong?.detail ?? "", /tag says 2 but sq encloses 1 units²/);
  assert.equal(wrong?.ownerId, "tag");
});

test("a triangle labelled with a leading name and equals sign reads its number", () => {
  // Legs of 1 unit each (50px): area = 1/2.
  const triangle: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 0 }];
  const [result] = checks("area-matches-its-label", [
    region("tri", triangle, square),
    ...label("tag", "A = 1/2", "tri", 10, 60),
  ]);
  assert.equal(result?.status, "pass", result?.detail);
});

test("a subscripted name with no equals sign is read too: \"S₃ ≈ 0,5\"", () => {
  // A Riemann sum prints a rounded value as S₃ ≈ …; the name's subscript must not
  // stop the number being read. Same triangle as above: 1/2 unit².
  const triangle: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 0 }];
  const [result] = checks("area-matches-its-label", [
    region("tri", triangle, square),
    ...label("tag", "S₃ ≈ 0,5", "tri", 10, 60),
  ]);
  assert.equal(result?.status, "pass", result?.detail);
});

test("pt-BR decimals are read with a comma", () => {
  // 125px x 50px at 50px/unit = 2.5 x 1 = 2.5 units^2.
  const rect: Point[] = [{ x: 0, y: 0 }, { x: 125, y: 0 }, { x: 125, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }];
  const [result] = checks("area-matches-its-label", [
    region("r", rect, square),
    ...label("tag", "2,5", "r", 10, 60),
  ]);
  assert.equal(result?.status, "pass", result?.detail);
});

test("an approx decimal against an exact fraction's value passes within the label's own resolution", () => {
  const big: MeasuredIn = { frame: "plane", xUnit: 300, yUnit: 300, rotation: 0 };
  // A right triangle, legs 4/3 and 2 units (400px, 600px): area = 4/3.
  const triangle: Point[] = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 600 }, { x: 0, y: 0 }];
  const [result] = checks("area-matches-its-label", [
    region("tri", triangle, big),
    ...label("tag", "≈ 1,33", "tri", 10, 60),
  ]);
  assert.equal(result?.status, "pass", result?.detail);
});

test("a region labelled with an exact fraction and a u.a. unit passes", () => {
  const big: MeasuredIn = { frame: "plane", xUnit: 300, yUnit: 300, rotation: 0 };
  // legs 8/3 and 2 units (800px, 600px): area = 8/3.
  const triangle: Point[] = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 600 }, { x: 0, y: 0 }];
  const [result] = checks("area-matches-its-label", [
    region("region-1", triangle, big),
    ...label("tag", "8/3 u.a.", "region-1", 10, 60),
  ]);
  assert.equal(result?.status, "pass", result?.detail);
});

test("a curve-like polygon sampling x^2 on [0, 2], closed along the axis, and labelled 8/3 passes", () => {
  const unitFrame: MeasuredIn = { frame: "plane", xUnit: 100, yUnit: 100, rotation: 0 };
  const n = 400;
  const points: Point[] = [];
  for (let i = 0; i <= n; i += 1) {
    const x = (2 * i) / n;
    points.push({ x: x * unitFrame.xUnit, y: -(x * x) * unitFrame.yUnit }); // canvas y is down
  }
  // Close back along the axis: (2, 0) already the last point when x*x is 0
  // only at x=0, so add the two axis corners explicitly.
  points.push({ x: 2 * unitFrame.xUnit, y: 0 });
  points.push({ x: 0, y: 0 });

  const [result] = checks("area-matches-its-label", [
    region("under-curve", points, unitFrame),
    ...label("tag", "8/3", "under-curve", 10, -30),
  ]);
  assert.equal(result?.status, "pass", result?.detail);
});

test("a closed mark with no recorded scale is not-applicable, never a pass", () => {
  const unitSquare: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }];
  const [result] = checks("area-matches-its-label", [
    region("sq", unitSquare), // no measuredIn: drawn in canvas pixels
    ...label("tag", "1", "sq", 60, 10),
  ]);
  assert.equal(result?.status, "not-applicable");
  assert.equal(result?.examined, 0);
  assert.match(result?.detail ?? "", /not stated in one frame/);
});

test("a label with no number is not-applicable, never a pass", () => {
  const unitSquare: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }];
  const [result] = checks("area-matches-its-label", [
    region("sq", unitSquare, square),
    ...label("tag", "Área", "sq", 60, 10),
  ]);
  assert.equal(result?.status, "not-applicable");
  assert.equal(result?.examined, 0);
  assert.match(result?.detail ?? "", /states no area/);
});

test("a figure with no annotated closed region is not-applicable at the figure level", () => {
  const [result] = checks("area-matches-its-label", [box("plain", 0, 0, 10, 10)]);
  assert.equal(result?.status, "not-applicable");
  assert.equal(result?.target, "figure");
});

test("degree and percent labels are left to sweep-matches-its-label", () => {
  const unitSquare: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }];
  for (const printed of ["30°", "50%"]) {
    const [result] = checks("area-matches-its-label", [
      region("sq", unitSquare, square),
      ...label("tag", printed, "sq", 60, 10),
    ]);
    assert.equal(result?.status, "not-applicable", `"${printed}": ${result?.detail}`);
    assert.match(result?.detail ?? "", /states no area/);
  }
});

// --- through the whole pipeline ---------------------------------------------

function areaFigure(printed: string) {
  return {
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 320,
      height: 260,
      frames: [{ id: "plane", origin: { x: 40, y: 220 }, xUnit: 40, yUnit: 40 }],
      children: [
        { type: "block", id: "tag", x: 90, y: 140, width: 60, height: 20, padding: 0, wrap: "none", label: printed, annotates: "tri" },
      ],
      marks: [
        {
          id: "tri",
          from: { frame: "plane", x: 0, y: 0 },
          segments: [
            { line: { frame: "plane", x: 4, y: 0 } },
            { line: { frame: "plane", x: 0, y: 2 } },
          ],
          close: true,
          fill: "rgba(40, 90, 200, 0.2)",
          stroke: "none",
        },
      ],
    },
  };
}

test(
  "a rendered triangle is checked against its area label in its frame's units",
  { timeout: 60000 },
  async () => {
    // Right triangle, legs 4 and 2 units: area = 4.
    const good = await render(parseSpec(areaFigure("A = 4")));
    const area = good.manifest.checks.find((c) => c.id === "area-matches-its-label");
    assert.equal(area?.status, "pass", area?.detail);

    const bad = await render(parseSpec(areaFigure("A = 5")));
    const wrong = bad.manifest.checks.find((c) => c.id === "area-matches-its-label");
    assert.equal(wrong?.status, "fail");
    assert.match(wrong?.detail ?? "", /tag says 5 but tri encloses 4 units²/);
  },
);
