import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import { render } from "../src/pipeline.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import type {
  Connector,
  LaidOutFigure,
  Mark,
  MeasuredIn,
  PlacedBox,
  PlacedConnector,
  PlacedMark,
  PlacedText,
  Point,
  Scene,
} from "../src/ir/types.ts";

// ADR 0028: `length-matches-its-label`, and labels that name a place.

type Element = PlacedBox | PlacedText | PlacedConnector | PlacedMark;

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
    lines: [{ text: printed, x: at.x, y: at.y + 12, box: { x: at.x, y: at.y, width: 20, height: 14 }, baselineUncertain: false }],
  };
}

/** A label box annotating `owner`, with its text. */
function label(id: string, printed: string, owner: string, x: number, y: number, w = 30, h = 14): Element[] {
  return [box(id, x, y, w, h, { annotates: owner }), text(id, printed, { x, y })];
}

function line(id: string, from: Point, to: Point, measuredIn?: MeasuredIn): PlacedConnector {
  return {
    kind: "connector",
    id,
    fromId: null,
    toId: null,
    points: [from, to],
    arrow: "both",
    arrowStyle: "closed",
    dashed: false,
    lineStyle: "solid",
    stroke: "#000",
    strokeWidth: 1.5,
    ...(measuredIn === undefined ? {} : { measuredIn }),
  };
}

function stroke(id: string, from: Point, to: Point, extra: Partial<PlacedMark> = {}): PlacedMark {
  return {
    kind: "mark",
    id,
    points: [from, to],
    closed: false,
    fill: "none",
    stroke: "#000",
    strokeWidth: 1,
    lineStyle: "solid",
    arcCentres: [],
    ...extra,
  };
}

function place(id: string, at: Point): PlacedMark {
  return stroke(id, at, at, { stroke: "none", strokeWidth: 0, place: true });
}

function figure(elements: Element[]): LaidOutFigure {
  return { width: 800, height: 600, background: "#fff", elements };
}

function checks(id: string, elements: Element[]) {
  return runChecks(figure(elements)).filter((c) => c.id === id);
}

const metres: MeasuredIn = { frame: "d", xUnit: 4, yUnit: 4, rotation: 0, unit: "m" };

// --- length-matches-its-label: the arithmetic ------------------------------

test("a dimension line as long as its label passes, however the unit is spaced", () => {
  for (const printed of ["50 m", "50m", "50", "d = 50 m"]) {
    const [result] = checks("length-matches-its-label", [
      line("dim", { x: 100, y: 200 }, { x: 300, y: 200 }, metres),
      ...label("tag", printed, "dim", 180, 180),
    ]);
    assert.equal(result?.status, "pass", `"${printed}": ${result?.detail}`);
    assert.equal(result?.target, "dim");
  }
});

test("an exact root is a stated length: 2√13 and d = √52 pass a run of √52, 2√3 fails it", () => {
  // metres is 4px per unit (see above); √52 units long along x.
  const px = 4 * Math.sqrt(52);
  for (const printed of ["2√13", "d = √52", "2√13 m"]) {
    const [result] = checks("length-matches-its-label", [
      line("dim", { x: 100, y: 200 }, { x: 100 + px, y: 200 }, metres),
      ...label("tag", printed, "dim", 120, 180),
    ]);
    assert.equal(result?.status, "pass", `"${printed}": ${result?.detail}`);
  }
  const [wrong] = checks("length-matches-its-label", [
    line("dim", { x: 100, y: 200 }, { x: 100 + px, y: 200 }, metres),
    ...label("tag", "2√3", "dim", 120, 180),
  ]);
  assert.equal(wrong?.status, "fail");
  const [half] = checks("length-matches-its-label", [
    line("dim", { x: 100, y: 200 }, { x: 100 + 4 * (3 * Math.sqrt(2)) / 2, y: 200 }, metres),
    ...label("tag", "3√2/2", "dim", 120, 180),
  ]);
  assert.equal(half?.status, "pass", half?.detail);
});

test("a dimension line drawn at one length beside a label reading another is reported", () => {
  // The two exam figures' defect: "50m" typed, 42 drawn.
  const [result] = checks("length-matches-its-label", [
    line("dim", { x: 100, y: 200 }, { x: 268, y: 200 }, metres),
    ...label("tag", "50m", "dim", 180, 180),
  ]);
  assert.equal(result?.status, "fail");
  assert.match(result?.detail ?? "", /tag says 50 but dim is drawn 42 m long/);
  assert.equal(result?.ownerId, "tag");
});

test("pt-BR decimals are read with a comma, and a dot followed by three digits groups thousands", () => {
  const unit: MeasuredIn = { frame: "d", xUnit: 40, yUnit: 40, rotation: 0 };
  const [decimal] = checks("length-matches-its-label", [
    line("dim", { x: 0, y: 100 }, { x: 100, y: 100 }, unit), // 2,5 units
    ...label("tag", "2,5", "dim", 40, 80),
  ]);
  assert.equal(decimal?.status, "pass", decimal?.detail);

  const kilo: MeasuredIn = { frame: "d", xUnit: 0.1, yUnit: 0.1, rotation: 0 };
  const [grouped] = checks("length-matches-its-label", [
    line("dim", { x: 0, y: 100 }, { x: 150, y: 100 }, kilo), // 1500 units
    ...label("tag", "1.500 m", "dim", 40, 80),
  ]);
  assert.equal(grouped?.status, "pass", grouped?.detail);
});

test("a velocity arrow is measured in its frame's units, so vA = 50 m/s at 2px per m/s is 100px", () => {
  const velocity: MeasuredIn = { frame: "v", xUnit: 2, yUnit: 2, rotation: 0, unit: "m/s" };
  const [right] = checks("length-matches-its-label", [
    line("vA", { x: 100, y: 300 }, { x: 160, y: 220 }, velocity), // hypot(60, 80) = 100px
    ...label("vA-label", "vA = 50 m/s", "vA", 140, 250),
  ]);
  assert.equal(right?.status, "pass", right?.detail);
  const [wrong] = checks("length-matches-its-label", [
    line("vA", { x: 100, y: 300 }, { x: 160, y: 220 }, velocity),
    ...label("vA-label", "vA = 60 m/s", "vA", 140, 250),
  ]);
  assert.equal(wrong?.status, "fail");
});

test("a non-square frame measures along its own rotated axes", () => {
  // x runs at 10px per unit, y at 5, and the frame is turned 90 degrees
  // counter-clockwise: its +x points canvas UP. A 3-unit run along the
  // frame's x is 30px straight up the canvas; measured as if square at 5px
  // per unit it would read 6.
  const tall: MeasuredIn = { frame: "t", xUnit: 10, yUnit: 5, rotation: 90 };
  const [result] = checks("length-matches-its-label", [
    line("run", { x: 200, y: 300 }, { x: 200, y: 270 }, tall),
    ...label("tag", "3", "run", 205, 280),
  ]);
  assert.equal(result?.status, "pass", result?.detail);
});

test("the tolerance is half the label's last digit, plus the half pixel everything forgives", () => {
  const at = (px: number, printed: string) =>
    checks("length-matches-its-label", [
      line("dim", { x: 100, y: 200 }, { x: 100 + px, y: 200 }, metres),
      ...label("tag", printed, "dim", 150, 180),
    ])[0]?.status;
  assert.equal(at(4 * 50.4, "50 m"), "pass", "50.4 rounds to 50");
  assert.equal(at(4 * 50.7, "50 m"), "fail", "50.7 does not");
  // "50,0" claims a tenth: 50.3 is no longer what it says.
  assert.equal(at(4 * 50.3, "50,0 m"), "fail");
  assert.equal(at(4 * 50.1, "50,0 m"), "pass");
});

// --- length-matches-its-label: never a silent pass ---------------------------

test("a numeric label on a line with no frame is not-applicable, never a pass", () => {
  const [result] = checks("length-matches-its-label", [
    line("dim", { x: 100, y: 200 }, { x: 300, y: 200 }),
    ...label("tag", "50 m", "dim", 180, 180),
  ]);
  assert.equal(result?.status, "not-applicable");
  assert.equal(result?.target, "dim");
  assert.match(result?.detail ?? "", /not stated in a frame/);
});

test("a label in a unit other than its frame's is not compared, and says so", () => {
  const [result] = checks("length-matches-its-label", [
    line("F", { x: 100, y: 200 }, { x: 180, y: 200 }, metres),
    ...label("tag", "20 N", "F", 130, 180),
  ]);
  assert.equal(result?.status, "not-applicable");
  assert.match(result?.detail ?? "", /whose unit is "m", not "N"/);
});

test("a curved route is not a length a label can state", () => {
  const curved = { ...line("c", { x: 100, y: 200 }, { x: 300, y: 200 }, metres), curve: { kind: "arc" as const } };
  const [result] = checks("length-matches-its-label", [curved, ...label("tag", "50 m", "c", 180, 170)]);
  assert.equal(result?.status, "not-applicable");
  assert.match(result?.detail ?? "", /curved route/);
});

test("each run gets its own verdict: one measured, one unmeasurable", () => {
  const results = checks("length-matches-its-label", [
    line("a", { x: 100, y: 200 }, { x: 300, y: 200 }, metres),
    ...label("ta", "50 m", "a", 180, 180),
    line("b", { x: 100, y: 400 }, { x: 300, y: 400 }),
    ...label("tb", "50 m", "b", 180, 380),
  ]);
  assert.deepEqual(
    results.map((r) => [r.target, r.status]).sort(),
    [["a", "pass"], ["b", "not-applicable"]],
  );
});

test("labels that name without a number, and angle labels, claim no length", () => {
  const results = checks("length-matches-its-label", [
    line("a", { x: 100, y: 200 }, { x: 300, y: 200 }, metres),
    ...label("ta", "h", "a", 180, 180),
    line("b", { x: 100, y: 400 }, { x: 300, y: 400 }, metres),
    ...label("tb", "30°", "b", 180, 380),
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, "not-applicable");
  assert.equal(results[0]?.target, "figure");
  assert.equal(results[0]?.examined, 0);
});

test("a single-segment mark is a run too", () => {
  const [result] = checks("length-matches-its-label", [
    stroke("rule", { x: 100, y: 200 }, { x: 140, y: 200 }, { measuredIn: metres }),
    ...label("tag", "10 m", "rule", 110, 180),
  ]);
  assert.equal(result?.status, "pass", result?.detail);
});

// --- frame resolution keeps the scale ----------------------------------------

function framedScene(connectors: Connector[], marks: Mark[] = [], children: Record<string, unknown>[] = []) {
  return {
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 400,
      height: 300,
      frames: [
        { id: "d", origin: { x: 50, y: 150 }, xUnit: 4, unit: "m" },
        { id: "tilted", origin: { frame: "d", x: 10, y: 0 }, xUnit: 4, unit: "m", rotation: 30 },
        { id: "fine", origin: { x: 0, y: 0 }, xUnit: 2 },
      ],
      children,
      connectors,
      marks,
    },
  };
}

function resolvedScene(spec: unknown): Scene {
  return parseSpec(spec).root as Scene;
}

test("a run stated in one frame keeps that frame's scale after the frame is stripped", () => {
  const scene = resolvedScene(
    framedScene(
      [
        { id: "same", from: { frame: "d", x: 0, y: 0 }, to: { frame: "d", x: 50, y: 0 } },
        // Different frames of one square scale: the incline figure's case.
        { id: "across", from: { frame: "d", x: 0, y: 0 }, to: { frame: "tilted", x: 5, y: 0 } },
        { id: "mixed", from: { frame: "d", x: 0, y: 0 }, to: { frame: "fine", x: 5, y: 0 } },
        { id: "canvas", from: { x: 0, y: 0 }, to: { frame: "d", x: 5, y: 0 } },
      ],
      [{ id: "rule", from: { frame: "d", x: 0, y: 1 }, segments: [{ line: { frame: "d", x: 3, y: 1 } }] }],
    ),
  );
  const byId = new Map((scene.connectors ?? []).map((c) => [c.id, c]));
  assert.deepEqual(byId.get("same")?.measuredIn, { frame: "d", xUnit: 4, yUnit: 4, rotation: 0, unit: "m" });
  assert.equal(byId.get("across")?.measuredIn?.xUnit, 4);
  assert.equal(byId.get("mixed")?.measuredIn, undefined, "two scales have no single unit");
  assert.equal(byId.get("canvas")?.measuredIn, undefined, "a canvas end has no unit");
  assert.equal(scene.marks?.find((m) => m.id === "rule")?.measuredIn?.unit, "m");
});

test("a frame's unit must be a non-empty string", () => {
  const spec = framedScene([]) as Record<string, any>;
  spec.root.frames[0].unit = "";
  assert.throws(() => parseSpec(spec), (e: unknown) => e instanceof SpecError && /unit must be a non-empty string/.test(e.message));
});

// --- places: the authored surface -------------------------------------------

test("annotatesPlace resolves to a stroke-less place mark the label annotates", () => {
  const spec = framedScene([], [], [
    { type: "block", id: "zero", x: 30, y: 154, width: 16, height: 16, label: "0", annotatesPlace: { frame: "d", x: 0, y: 0 } },
  ]);
  const scene = resolvedScene(spec);
  const zero = scene.children.find((c) => c.id === "zero")!;
  assert.equal(zero.annotates, "zero-place");
  assert.equal(zero.annotatesPlace, undefined);
  const mark = scene.marks?.find((m) => m.id === "zero-place");
  assert.equal(mark?.place, true);
  assert.deepEqual(mark?.from, { x: 50, y: 150 }, "the frame's origin, in canvas coordinates");
  assert.equal(mark?.stroke, "none");
  // Resolution runs more than once per render; a second pass must not add a
  // second place or fail on the name it generated.
  const again = parseSpec({ version: 1, root: scene }).root as Scene;
  assert.equal(again.marks?.filter((m) => m.id === "zero-place").length, 1);
});

test("a place label needs an id and cannot also name an element", () => {
  const without = framedScene([], [], [
    { type: "block", x: 0, y: 0, width: 10, height: 10, label: "0", annotatesPlace: { x: 0, y: 0 } },
  ]);
  assert.throws(() => parseSpec(without), (e: unknown) => e instanceof SpecError && /needs the block to have an id/.test(e.message));
  const both = framedScene([], [], [
    { type: "block", id: "thing", x: 0, y: 0, width: 10, height: 10, label: "" },
    { type: "block", id: "zero", x: 0, y: 0, width: 10, height: 10, label: "0", annotates: "thing", annotatesPlace: { x: 0, y: 0 } },
  ]);
  assert.throws(() => parseSpec(both), (e: unknown) => e instanceof SpecError && /both annotates and annotatesPlace/.test(e.message));
});

// --- label-nearest-its-place --------------------------------------------------

const origin = { x: 200, y: 300 };
const axes = [
  stroke("axis-x", { x: 100, y: 300 }, { x: 500, y: 300 }),
  stroke("axis-y", { x: 200, y: 100 }, { x: 200, y: 400 }),
];

test("the 0 at an origin passes: the axes that make the place do not compete with it", () => {
  const result = checks("label-nearest-its-place", [
    ...axes,
    place("zero-place", origin),
    ...label("zero", "0", "zero-place", 186, 302, 10, 14),
  ])[0];
  assert.equal(result?.status, "pass", result?.detail);
  assert.equal(result?.examined, 1);
});

test("a 0 slid along an axis is farther from its place than it is big", () => {
  const result = checks("label-nearest-its-place", [
    ...axes,
    place("zero-place", origin),
    ...label("zero", "0", "zero-place", 240, 302, 10, 14),
  ])[0];
  assert.equal(result?.status, "fail");
  assert.match(result?.detail ?? "", /farther than its own size/);
});

test("ink that does NOT pass through the place still competes", () => {
  const result = checks("label-nearest-its-place", [
    ...axes,
    stroke("curve", { x: 180, y: 318 }, { x: 260, y: 318 }),
    place("zero-place", origin),
    ...label("zero", "0", "zero-place", 186, 302, 10, 14),
  ])[0];
  assert.equal(result?.status, "fail");
  assert.match(result?.detail ?? "", /from curve/);
});

function legend(textAY: number): Element[] {
  return [
    stroke("swatch-a", { x: 100, y: 100 }, { x: 124, y: 100 }),
    stroke("swatch-b", { x: 100, y: 124 }, { x: 124, y: 124 }),
    place("row-a-place", { x: 124, y: 100 }),
    place("row-b-place", { x: 124, y: 124 }),
    ...label("row-a", "f(x) = x²", "row-a-place", 130, textAY, 80, 20),
    ...label("row-b", "g(x) = 2x", "row-b-place", 130, 114, 80, 20),
  ];
}

test("legend rows pass as places; as elements, the neighbouring TEXT no longer competes", () => {
  const asPlaces = checks("label-nearest-its-place", legend(90))[0];
  assert.equal(asPlaces?.status, "pass", asPlaces?.detail);

  // The same legend with each row naming its swatch ELEMENT. Measured from a
  // wide label's centre each text is nearer the other TEXT than its swatch,
  // and that used to fail it -- which is why the annotation was deleted
  // (ADR 0028). A label is not what a label names, so since ADR 0035 another
  // label competes in neither check, and this passes too.
  const elements = (rowAY: number) => [
    stroke("swatch-a", { x: 100, y: 100 }, { x: 124, y: 100 }),
    stroke("swatch-b", { x: 100, y: 124 }, { x: 124, y: 124 }),
    ...label("row-a", "f(x) = x²", "swatch-a", 130, rowAY, 80, 20),
    ...label("row-b", "g(x) = 2x", "swatch-b", 130, 114, 80, 20),
  ];
  const asElements = checks("annotation-nearest-its-owner", elements(90))[0];
  assert.equal(asElements?.status, "pass", asElements?.detail);

  // A drawn rival still competes: row a slid down beside swatch b fails.
  const slid = checks("annotation-nearest-its-owner", elements(106))[0];
  assert.equal(slid?.status, "fail");
  assert.match(slid?.detail ?? "", /row-a names swatch-a .* from swatch-b/);
});

test("a legend row slid beside its neighbour's swatch is reported", () => {
  const result = checks("label-nearest-its-place", legend(106))[0];
  assert.equal(result?.status, "fail");
  assert.match(result?.detail ?? "", /row-a names a place .* from swatch-b/);
});

test("a place is not an element: it competes for no element label's nearest", () => {
  const result = checks("annotation-nearest-its-owner", [
    stroke("arrow", { x: 300, y: 300 }, { x: 400, y: 300 }),
    place("elsewhere", { x: 352, y: 292 }),
    ...label("N", "N", "arrow", 340, 280, 20, 14),
  ])[0];
  assert.equal(result?.status, "pass", result?.detail);
});

test("a figure naming no place is not-applicable, not a vacuous pass", () => {
  const result = checks("label-nearest-its-place", [...axes])[0];
  assert.equal(result?.status, "not-applicable");
  assert.equal(result?.examined, 0);
});

// --- through the whole pipeline ---------------------------------------------

function dimensionFigure(printed: string) {
  return {
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 320,
      height: 220,
      frames: [{ id: "d", origin: { x: 50, y: 150 }, xUnit: 4, unit: "m" }],
      children: [
        { type: "block", id: "tag", x: 125, y: 118, width: 50, height: 20, padding: 0, wrap: "none", label: printed, annotates: "dim" },
        { type: "block", id: "zero", x: 30, y: 154, width: 14, height: 18, padding: 0, wrap: "none", label: "0", annotatesPlace: { frame: "d", x: 0, y: 0 } },
      ],
      connectors: [
        { id: "dim", from: { frame: "d", x: 0, y: 0 }, to: { frame: "d", x: 50, y: 0 }, arrow: "both" },
      ],
    },
  };
}

test(
  "a rendered dimension line is checked in its frame's units, and its origin label at its place",
  { timeout: 60000 },
  async () => {
    const good = await render(parseSpec(dimensionFigure("50 m")));
    const length = good.manifest.checks.find((c) => c.id === "length-matches-its-label");
    assert.equal(length?.status, "pass", length?.detail);
    // The place is lifted into page space with everything else; a place left
    // in scene space would sit a canvas padding away from its label.
    const placeCheck = good.manifest.checks.find((c) => c.id === "label-nearest-its-place");
    assert.equal(placeCheck?.status, "pass", placeCheck?.detail);

    const bad = await render(parseSpec(dimensionFigure("42 m")));
    const wrong = bad.manifest.checks.find((c) => c.id === "length-matches-its-label");
    assert.equal(wrong?.status, "fail");
    assert.match(wrong?.detail ?? "", /tag says 42 but dim is drawn 50 m long/);
  },
);
