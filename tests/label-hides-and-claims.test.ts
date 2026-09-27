import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/checks.ts";
import { render } from "../src/pipeline.ts";
import { parseSpec, SpecError } from "../src/ir/types.ts";
import { parseFigureInput } from "../src/presets/index.ts";
import { Board } from "../src/presets/function-graph/board.ts";
import type {
  LaidOutFigure,
  PlacedBox,
  PlacedConnector,
  PlacedMark,
  PlacedText,
  Point,
} from "../src/ir/types.ts";

// ADR 0035: what a label's backing hides, and what a label claims to name.

type Element = PlacedBox | PlacedText | PlacedConnector | PlacedMark;

const PAPER = "#FCFBF7";

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

/** A label: its box and its one line of text, the line box filling the box. */
function label(
  id: string,
  printed: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<PlacedBox> = {},
  colour = "#181B21",
  fontSize = 11,
): Element[] {
  const text: PlacedText = {
    kind: "text",
    id: `${id}--label`,
    ownerId: id,
    fontFamily: "Arial",
    fontSize,
    fill: colour,
    anchor: "center",
    lines: [{ text: printed, x: x + w / 2, y: y + h - 3, box: { x, y, width: w, height: h }, baselineUncertain: false }],
  };
  return [box(id, x, y, w, h, extra), text];
}

function line(id: string, points: Point[], extra: Partial<PlacedMark> = {}): PlacedMark {
  return {
    kind: "mark",
    id,
    points,
    closed: false,
    fill: "none",
    stroke: "#181B21",
    strokeWidth: 1.5,
    lineStyle: "solid",
    arcCentres: [],
    ...extra,
  };
}

function connector(id: string, from: Point, to: Point): PlacedConnector {
  return {
    kind: "connector",
    id,
    fromId: null,
    toId: null,
    points: [from, to],
    arrow: "none",
    arrowStyle: "closed",
    dashed: false,
    lineStyle: "solid",
    stroke: "#9AA3AE",
    strokeWidth: 1.5,
  };
}

/** A dot of radius r at c, as the closed polyline a filled circle mark flattens to. */
function dot(id: string, c: Point, r = 4, fill = "#1D4E89"): PlacedMark {
  const points = Array.from({ length: 25 }, (_, i) => ({
    x: c.x + r * Math.cos((i / 24) * 2 * Math.PI),
    y: c.y + r * Math.sin((i / 24) * 2 * Math.PI),
  }));
  return line(id, points, { closed: true, fill, stroke: "none", strokeWidth: 0 });
}

function place(id: string, at: Point): PlacedMark {
  return line(id, [at, at], { stroke: "none", strokeWidth: 0, place: true });
}

/**
 * Painter's order, as the pipeline emits a scene: marks, then boxes, then
 * connectors, then text. The checks read that order to know what a backing
 * can hide.
 */
function figure(elements: Element[], background = PAPER): LaidOutFigure {
  const rank = { mark: 0, box: 1, connector: 2, text: 3 } as const;
  const ordered = [...elements].sort((a, b) => rank[a.kind] - rank[b.kind]);
  return { width: 800, height: 600, background, elements: ordered };
}

function checks(id: string, elements: Element[], background = PAPER) {
  return runChecks(figure(elements, background)).filter((c) => c.id === id);
}

// The x axis of a plane whose origin is at (400, 300): grid furniture with the
// stable id frame resolution gives it.
const xAxis = line("plane-axis-x", [{ x: 100, y: 300 }, { x: 700, y: 300 }], { gridOf: "plane", stroke: "#9AA3AE", strokeWidth: 2 });
const yAxis = line("plane-axis-y", [{ x: 400, y: 50 }, { x: 400, y: 550 }], { gridOf: "plane", stroke: "#9AA3AE", strokeWidth: 2 });
// A lattice line: x = −2 at 80px per unit.
const gridV = line("plane-grid-v-2", [{ x: 240, y: 50 }, { x: 240, y: 550 }], { gridOf: "plane", stroke: "#E4E8ED", strokeWidth: 1 });

// --- backing-hides-no-ink ----------------------------------------------------

test("a tick number's backing that cuts the hyperbola at its vertex fails (the defect that passed)", () => {
  // x²/4 − y² = 1 at 80px per unit: the left branch's vertex is (−2, 0),
  // i.e. (240, 300). A tick number "−2" backed with paper at its usual spot
  // below the axis lies across the branch just under the vertex.
  const branch = line(
    "hyperbola-1",
    Array.from({ length: 21 }, (_, i) => {
      const y = -1 + i * 0.1;
      return { x: 400 - 80 * 2 * Math.sqrt(1 + y * y), y: 300 - 80 * y };
    }),
  );
  const tick = label("plane-tick-x-2", "−2", 232, 306, 16, 16, { gridOf: "plane", fill: PAPER });
  const elements = [xAxis, gridV, branch, ...tick];

  // What used to happen: the text sits on its backing, so it is "clear".
  const clear = checks("text-clear-of-ink", elements).find((c) => c.target === "plane-tick-x-2--label");
  assert.equal(clear?.status, "pass");

  const [hidden] = checks("backing-hides-no-ink", elements);
  assert.equal(hidden?.status, "fail", hidden?.detail);
  assert.match(hidden?.detail ?? "", /plane-tick-x-2's backing hides hyperbola-1/);
  // Its own gridline is the halo ADR 0034 designed, not a defect.
  assert.doesNotMatch(hidden?.detail ?? "", /plane-grid-v-2/);
});

test("the unit circle's angle label backing that cut OP and the axis fails, naming both", () => {
  // 45°: O at (400, 300), P at R = 150. The label was set on a paper backing
  // across OP and down onto the x axis -- grid furniture, which is exempt
  // from `text-clear-of-ink` but not invisible to a reader.
  const op = line("m-op", [{ x: 400, y: 300 }, { x: 506, y: 194 }], { stroke: "#1D4E89" });
  const arc = line("p1-arc", Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * (Math.PI / 4);
    return { x: 400 + 40 * Math.cos(a), y: 300 - 40 * Math.sin(a) };
  }));
  const degrees = label("t9", "45°", 438, 280, 28, 22, { fill: PAPER, annotates: "p1-arc" });
  const [hidden] = checks("backing-hides-no-ink", [xAxis, op, arc, ...degrees]);
  assert.equal(hidden?.status, "fail", hidden?.detail);
  assert.match(hidden?.detail ?? "", /t9's backing hides/);
  assert.match(hidden?.detail ?? "", /plane-axis-x/);
  // The arc it annotates may lie under it; that is ADR 0019's relief.
  assert.doesNotMatch(hidden?.detail ?? "", /p1-arc/);
});

test("a backing over its own gridline is the designed halo, and is counted as such", () => {
  const tick = label("plane-tick-x-2", "−2", 232, 306, 16, 16, { gridOf: "plane", fill: PAPER });
  const [result] = checks("backing-hides-no-ink", [xAxis, gridV, ...tick]);
  assert.equal(result?.status, "pass", result?.detail);
  assert.match(result?.detail ?? "", /1 gridline crossing\(s\) under a backing allowed as a halo/);
});

test("a backing may hide what its label annotates, and nothing painted after it", () => {
  const segment = line("tangent", [{ x: 550, y: 300 }, { x: 550, y: 150 }]);
  const tag = label("tan-label", "tg θ = 1", 520, 200, 60, 18, { fill: PAPER, annotates: "tangent" });
  assert.equal(checks("backing-hides-no-ink", [segment, ...tag])[0]?.status, "pass");

  // A connector is painted after every box, so a backing never hides one.
  const over = connector("guide", { x: 500, y: 209 }, { x: 600, y: 209 });
  assert.equal(checks("backing-hides-no-ink", [over, ...tag])[0]?.status, "pass");
});

test("a figure with no opaque label backing is not-applicable", () => {
  const [result] = checks("backing-hides-no-ink", [xAxis, ...label("t", "x", 10, 10, 20, 16)]);
  assert.equal(result?.status, "not-applicable");
  assert.equal(result?.examined, 0);
});

test("a rendered paper-backed label across a grid axis fails backing-hides-no-ink", { timeout: 60000 }, async () => {
  const spec = parseSpec({
    version: 1,
    canvas: { padding: 0, background: PAPER },
    root: {
      type: "scene",
      layout: "absolute",
      width: 300,
      height: 200,
      frames: [
        {
          id: "plane",
          origin: { x: 150, y: 100 },
          xUnit: 40,
          grid: { x: { from: -3, to: 3 }, y: { from: -2, to: 2 }, labels: false },
        },
      ],
      children: [
        { type: "block", id: "note", x: 200, y: 90, width: 40, height: 20, padding: 0, wrap: "none", label: "k", fill: PAPER, freeStanding: true },
      ],
    },
  });
  const result = await render(spec, { raster: false });
  const hidden = result.manifest.checks.find((c) => c.id === "backing-hides-no-ink");
  assert.equal(hidden?.status, "fail", hidden?.detail);
  assert.match(hidden?.detail ?? "", /note's backing hides plane-axis-x/);
  // Its text lies across the axis too, which the axis's exemption used to hide.
  const ink = result.manifest.checks.find((c) => c.id === "text-clear-of-ink" && c.target === "note--label");
  assert.equal(ink?.status, "fail", ink?.detail);
});

// --- text on an axis ---------------------------------------------------------

test("text across an axis fails text-clear-of-ink; text across a lattice line does not", () => {
  const onAxis = checks("text-clear-of-ink", [xAxis, ...label("t", "−π/2", 380, 292, 40, 18)]);
  assert.equal(onAxis[0]?.status, "fail");
  assert.match(onAxis[0]?.detail ?? "", /plane-axis-x/);

  const onLattice = checks("text-clear-of-ink", [gridV, ...label("t", "2", 232, 100, 16, 16)]);
  assert.equal(onLattice[0]?.status, "pass", onLattice[0]?.detail);
});

test("Board.addFrame records the axes its grid will draw, so a label search steps off them", () => {
  const board = new Board(400, 400, PAPER);
  board.addFrame({
    id: "axes",
    origin: { x: 200, y: 200 },
    grid: { x: { from: -150, to: 150, step: 1e9, origin: 0 }, y: { from: -150, to: 150, step: 1e9, origin: 0 }, labels: false },
  });
  assert.equal(board.frames.length, 1);
  assert.ok(board.inkThrough(board.box(200, 330, 30, 16)) > 0, "the y axis is ink to the search");
  assert.ok(board.inkThrough(board.box(330, 200, 30, 16)) > 0, "the x axis is ink to the search");
  assert.equal(board.inkThrough(board.box(260, 260, 30, 16)), 0);
});

test("the unit circle no longer prints −π/2 across the y axis", { timeout: 60000 }, async () => {
  const spec = parseFigureInput({
    preset: "unit-circle",
    quadrantLabels: true,
    angles: [{ angle: "π/4", arc: true, projection: true, tangent: true }, "5π/6", "-π/2"],
  });
  const result = await render(spec, { raster: false });
  const failing = result.manifest.checks.filter((c) => c.status === "fail");
  assert.deepEqual(failing, [], failing.map((c) => `${c.id} [${c.target}] ${c.detail}`).join("\n"));
  const onAxis = result.manifest.checks.filter((c) => c.id === "text-clear-of-ink" && /axis/.test(c.detail ?? ""));
  assert.deepEqual(onAxis, []);
});

// --- label-declares-what-it-names -------------------------------------------

/** Symmetric points π/3 and 2π/3 about the y axis of a circle at (400, 300), R = 150. */
function symmetricPair(sinLabel: Partial<PlacedBox>): Element[] {
  const p = { x: 475, y: 170 };
  const q = { x: 325, y: 170 };
  return [
    yAxis,
    dot("dot-p", p),
    dot("dot-q", q),
    ...label("p", "π/3", 485, 140, 30, 20),
    // "√3/2" beside the symmetric point it does not name, not at the foot of
    // π/3's own projection on the y axis at (400, 170).
    ...label("sin", "√3/2", 280, 176, 36, 20, sinLabel),
  ];
}

test("an unclaimed label beside the wrong point fails; it used to be invisible to every check", () => {
  const elements = symmetricPair({});
  // The two proximity checks never saw it: it makes no claim.
  assert.equal(checks("annotation-nearest-its-owner", elements)[0]?.status, "not-applicable");
  assert.equal(checks("label-nearest-its-place", elements)[0]?.status, "not-applicable");

  const [declares] = checks("label-declares-what-it-names", elements);
  assert.equal(declares?.status, "fail");
  assert.match(declares?.detail ?? "", /sin/);
});

test("the same label, claiming its projection's foot, is caught where it stands", () => {
  const foot = place("sin-place", { x: 400, y: 170 });
  const elements = [...symmetricPair({ annotates: "sin-place" }), foot].map((e) =>
    e.id === "p" ? { ...(e as PlacedBox), freeStanding: true as const } : e,
  );
  const [declares] = checks("label-declares-what-it-names", elements);
  assert.equal(declares?.status, "pass", declares?.detail);
  const [nearest] = checks("label-nearest-its-place", elements);
  assert.equal(nearest?.status, "fail", nearest?.detail);
});

test("free-standing, a series name, an annotation and a place each count as a claim", () => {
  const curve = line("c", [{ x: 0, y: 0 }, { x: 100, y: 100 }], { series: "f" });
  const elements: Element[] = [
    curve,
    place("pl", { x: 300, y: 300 }),
    ...label("title", "Título", 10, 10, 60, 20, { freeStanding: true }),
    ...label("series", "y = x", 60, 40, 40, 20, { names: "f" }),
    ...label("ann", "c", 20, 30, 20, 20, { annotates: "c" }),
    ...label("placed", "O", 302, 302, 14, 16, { annotates: "pl" }),
  ];
  const [result] = checks("label-declares-what-it-names", elements);
  assert.equal(result?.status, "pass", result?.detail);
  assert.equal(result?.examined, 4);
  assert.match(result?.detail ?? "", /1 free-standing/);
});

test("tick numbers, and text on a shape of its own, are not asked", () => {
  const elements: Element[] = [
    ...label("plane-tick-x-1", "1", 10, 10, 10, 16, { gridOf: "plane" }),
    // A node: its text is the node, not a label about something else.
    ...label("node", "Parser", 100, 100, 80, 40, { stroke: "#181B21", strokeWidth: 1.5 }),
    ...label("cell", "3", 200, 100, 30, 20, { fill: "#EEF2F7" }),
  ];
  const [result] = checks("label-declares-what-it-names", elements);
  assert.equal(result?.status, "not-applicable", result?.detail);
});

test("a paper-filled label is still bare text, and is asked", () => {
  const [result] = checks("label-declares-what-it-names", [...label("t", "x", 10, 10, 20, 16, { fill: PAPER })]);
  assert.equal(result?.status, "fail");
});

test("freeStanding takes only true, and never beside a claim", () => {
  const scene = (block: Record<string, unknown>) => ({
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 100,
      height: 100,
      children: [{ type: "block", id: "a", x: 0, y: 0, width: 10, height: 10 }, { type: "block", id: "t", x: 20, y: 20, label: "t", ...block }],
    },
  });
  assert.doesNotThrow(() => parseSpec(scene({ freeStanding: true })));
  assert.throws(() => parseSpec(scene({ freeStanding: false })), SpecError);
  assert.throws(() => parseSpec(scene({ freeStanding: "yes" })), SpecError);
  assert.throws(() => parseSpec(scene({ freeStanding: true, annotates: "a" })), /not free-standing/);
  assert.throws(() => parseSpec(scene({ freeStanding: true, annotatesPlace: { x: 1, y: 1 } })), /not free-standing/);
});

// --- a marker at the place is the place --------------------------------------

test("a dot drawn at a place does not compete with the label naming that place; a region does", () => {
  const at = { x: 400, y: 300 };
  // 25px from its point, within its own 30px: beside it. The dot's outline
  // is 20px away -- nearer than the point -- and must not count against it.
  const tag = label("p", "P(1; 2)", 412, 254, 30, 24, { annotates: "p-place" });
  const withDot = checks("label-nearest-its-place", [dot("dot", at, 5), place("p-place", at), ...tag]);
  assert.equal(withDot[0]?.status, "pass", withDot[0]?.detail);

  // A shaded disc 124px across that merely contains the point still competes:
  // its rim passes 9px from the label.
  const disc = dot("region", { x: 460, y: 300 }, 62, "#DDE7F5");
  const withRegion = checks("label-nearest-its-place", [disc, place("p-place", at), ...tag]);
  assert.equal(withRegion[0]?.status, "fail", withRegion[0]?.detail);
});

test("unit-circle point labels name their points and sit beside them", { timeout: 60000 }, async () => {
  // The quadrant tour: "π/4" used to walk 46px out past the letter "I".
  const spec = parseFigureInput({
    preset: "unit-circle",
    quadrantLabels: true,
    angles: [{ angle: "45°", projection: true }, { angle: "135°", projection: true }, { angle: "-60°", projection: true }],
  });
  const result = await render(spec, { raster: false });
  const declares = result.manifest.checks.find((c) => c.id === "label-declares-what-it-names");
  assert.equal(declares?.status, "pass", declares?.detail);
  const nearest = result.manifest.checks.find((c) => c.id === "label-nearest-its-place");
  assert.equal(nearest?.status, "pass", nearest?.detail);
  // three point labels plus a cos and a sin label each
  assert.equal(nearest?.examined, 9);
});

// --- contrast-sufficient reads the lines under the text ----------------------

test("a pale tick number over a grey gridline fails contrast (the defect that passed)", () => {
  // #6B7280 is 4.7:1 on white, and that is all the check used to measure.
  const grid = line("plane-grid-v-1", [{ x: 108, y: 0 }, { x: 108, y: 600 }], { gridOf: "plane", stroke: "#D8DCE3", strokeWidth: 1 });
  const tick = label("plane-tick-x-1", "1", 100, 306, 16, 16, { gridOf: "plane" }, "#6B7280");
  const [result] = checks("contrast-sufficient", [grid, ...tick], "#FFFFFF");
  assert.equal(result?.status, "fail", result?.detail);
  assert.match(result?.detail ?? "", /plane-grid-v-1/);

  // ADR 0034's darker tick ink clears it.
  const dark = label("plane-tick-x-1", "1", 100, 306, 16, 16, { gridOf: "plane" }, "#4B5563");
  assert.equal(checks("contrast-sufficient", [grid, ...dark], "#FFFFFF")[0]?.status, "pass");
});

test("a backing that covers the gridline is what the glyphs sit on", () => {
  const grid = line("plane-grid-v-1", [{ x: 108, y: 0 }, { x: 108, y: 600 }], { gridOf: "plane", stroke: "#D8DCE3", strokeWidth: 1 });
  const tick = label("plane-tick-x-1", "1", 100, 306, 16, 16, { gridOf: "plane", fill: "#FFFFFF" }, "#6B7280");
  const [result] = checks("contrast-sufficient", [grid, ...tick], "#FFFFFF");
  assert.equal(result?.status, "pass", result?.detail);
});

test("a connector under a backed label still counts: no backing hides one", () => {
  const over = connector("guide", { x: 90, y: 314 }, { x: 130, y: 314 });
  const tick = label("t", "1", 100, 306, 16, 16, { fill: "#FFFFFF" }, "#6B7280");
  const [result] = checks("contrast-sufficient", [over, ...tick], "#FFFFFF");
  assert.equal(result?.status, "fail", result?.detail);
  assert.match(result?.detail ?? "", /guide/);
});

test("a line through the leading above the glyphs is under no glyph", () => {
  // A 24px line box at 11px type: 6.5px of leading above the em box.
  const grid = line("plane-grid-h-1", [{ x: 0, y: 302 }, { x: 800, y: 302 }], { gridOf: "plane", stroke: "#D8DCE3", strokeWidth: 1 });
  const tick = label("t", "1", 100, 300, 16, 24, {}, "#6B7280");
  assert.equal(checks("contrast-sufficient", [grid, ...tick], "#FFFFFF")[0]?.status, "pass");
});
