import { test } from "node:test";
import assert from "node:assert/strict";
import { toSvg } from "../src/render/svg.ts";
import { render } from "../src/pipeline.ts";
import { parseSpec } from "../src/ir/types.ts";
import type { ArrowStyle, LaidOutFigure, LineStyle, PlacedConnector } from "../src/ir/types.ts";

function connector(overrides: Partial<PlacedConnector> = {}): PlacedConnector {
  return {
    kind: "connector",
    id: "edge-1",
    fromId: "a",
    toId: "b",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    arrow: "end",
    arrowStyle: "closed",
    dashed: false,
    lineStyle: "solid",
    stroke: "#8899aa",
    strokeWidth: 2,
    ...overrides,
  };
}

function figure(elements: PlacedConnector[]): LaidOutFigure {
  return { width: 200, height: 100, background: "#000", elements };
}

// --- arrowhead shapes --------------------------------------------------------

test("closed arrowhead is a single filled, closed path (unchanged default)", () => {
  const svg = toSvg(figure([connector({ arrowStyle: "closed" })]));
  // Shaft path plus exactly one filled triangle: three points, "Z".
  assert.match(svg, /<path d="M -?[\d.]+ -?[\d.]+ L -?[\d.]+ -?[\d.]+ L -?[\d.]+ -?[\d.]+ Z" fill="#8899aa"\/>/);
});

test("open arrowhead has no fill and no closing Z -- a chevron, not a wedge", () => {
  const svg = toSvg(figure([connector({ arrowStyle: "open" })]));
  const arrowPaths = [...svg.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*\/>/g)].map((m) => m[1]!);
  const chevron = arrowPaths.find((d) => !d.includes(" 0 0 L 100 0")); // not the shaft
  assert.ok(chevron, "expected a second path for the arrowhead");
  assert.ok(!chevron!.includes("Z"), "an open arrowhead must not close its path");
});

test("diamond arrowhead is a closed four-point path", () => {
  const svg = toSvg(figure([connector({ arrowStyle: "diamond" })]));
  const arrowPaths = [...svg.matchAll(/<path d="([^"]*)" fill="#8899aa"\/>/g)].map((m) => m[1]!);
  const diamond = arrowPaths.find((d) => (d.match(/L /g) ?? []).length === 3);
  assert.ok(diamond, "expected a four-point (3 L commands) closed path for a diamond");
  assert.ok(diamond!.endsWith("Z"));
});

test("circle arrowhead is a real <circle>, not a path", () => {
  const svg = toSvg(figure([connector({ arrowStyle: "circle" })]));
  assert.match(svg, /<circle cx="-?[\d.]+" cy="-?[\d.]+" r="-?[\d.]+" fill="#8899aa"\/>/);
});

test("crowsfoot and open resolve to genuinely different geometry, not just different names", () => {
  // The real bug this milestone found: crowsfoot's first version added a
  // third stroke colinear with the shaft, making it pixel-identical to
  // "open". Guard the fix directly, not just its visual appearance.
  //
  // Index [1], not a substring filter: an early version of this test tried
  // to exclude the shaft by checking `!d.includes("L 100 0")`, and both the
  // shaft (M 0 0 L 100 0) AND the open arrowhead (which also travels TO the
  // tip at (100, 0)) contain that substring -- a real false negative in the
  // test itself, not in the code. The shaft is always emitted first.
  const openSvg = toSvg(figure([connector({ id: "e-open", arrowStyle: "open" })]));
  const crowsfootSvg = toSvg(figure([connector({ id: "e-cf", arrowStyle: "crowsfoot" })]));
  const openPaths = [...openSvg.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*\/>/g)].map((m) => m[1]!);
  const crowsfootPaths = [...crowsfootSvg.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*\/>/g)].map((m) => m[1]!);
  assert.equal(openPaths.length, 2, "expected shaft + one arrowhead path");
  assert.equal(crowsfootPaths.length, 2, "expected shaft + one arrowhead path");
  assert.notEqual(openPaths[1], crowsfootPaths[1]);
});

test("half arrowhead is a filled, closed three-point wedge (not the full closed triangle)", () => {
  const svg = toSvg(figure([connector({ arrowStyle: "half" })]));
  const closedSvg = toSvg(figure([connector({ arrowStyle: "closed" })]));
  const halfArrow = [...svg.matchAll(/<path d="([^"]*)" fill="#8899aa"\/>/g)]
    .map((m) => m[1]!)
    .find((d) => !d.includes("L 100 0"));
  const closedArrow = [...closedSvg.matchAll(/<path d="([^"]*)" fill="#8899aa"\/>/g)]
    .map((m) => m[1]!)
    .find((d) => !d.includes("L 100 0"));
  assert.ok(halfArrow && closedArrow);
  assert.notEqual(halfArrow, closedArrow, "half must not be geometrically identical to closed");
});

// --- the shaft stops where the head starts -----------------------------------

function shaftOf(svg: string): string {
  // The shaft is the only path carrying data-pr-id; heads are anonymous.
  const match = /<path data-pr-id="[^"]*" d="([^"]*)"/.exec(svg);
  return match?.[1] ?? "";
}

test("a filled head's apex is the drawn end: the shaft stops short of the tip", () => {
  // The defect: the shaft ran to the tip underneath the head, so its round
  // linecap (radius strokeWidth/2) protruded PAST the apex and the arrow read
  // as a flare on a line that carried on beyond it.
  for (const arrowStyle of ["closed", "half", "diamond", "circle"] as ArrowStyle[]) {
    const svg = toSvg(figure([connector({ arrowStyle })]));
    const shaft = shaftOf(svg);
    assert.ok(shaft !== "", `expected a shaft for ${arrowStyle}`);
    const end = /L (-?[\d.]+) 0$/.exec(shaft);
    assert.ok(end, `expected a horizontal shaft for ${arrowStyle}, got ${shaft}`);
    assert.ok(
      Number(end![1]) < 100,
      `${arrowStyle}: shaft must stop before the tip at x=100, ended at ${end![1]}`,
    );
  }
});

test("an open head keeps the shaft running to the tip -- the line shows through it", () => {
  // Not an oversight: "open" and "crowsfoot" are chevrons with nothing to
  // hide the shaft behind, and their own caps sit on the same tip.
  for (const arrowStyle of ["open", "crowsfoot"] as ArrowStyle[]) {
    assert.equal(shaftOf(toSvg(figure([connector({ arrowStyle })]))), "M 0 0 L 100 0");
  }
});

test("trimming the shaft leaves the arrowhead's apex on the route's own endpoint", () => {
  // The whole point: shorten the drawing, not the geometry. Every check walks
  // connector.points, so the head must still reach where the route ends.
  const svg = toSvg(figure([connector({ arrowStyle: "closed" })]));
  const head = /<path d="M ([\d.]+) ([\d.]+) L/.exec(svg);
  assert.ok(head, "expected a filled arrowhead path");
  assert.equal(Number(head![1]), 100);
  assert.equal(Number(head![2]), 0);
});

test("a head longer than its segment consumes the shaft rather than reversing it", () => {
  // arrowSize is 9 and a diamond reaches 18 back; a 6px connector cannot host
  // one. The old pull-back would have flipped the segment; instead the shaft
  // is dropped and the head stands alone.
  const svg = toSvg(
    figure([connector({ arrowStyle: "diamond", points: [{ x: 0, y: 0 }, { x: 6, y: 0 }] })]),
  );
  assert.equal(shaftOf(svg), "", "expected no shaft path at all");
  assert.match(svg, /<path d="M 6 0 L/, "the head must still sit on the endpoint");
});

test("every ArrowStyle renders without throwing", () => {
  const styles: ArrowStyle[] = ["closed", "open", "diamond", "circle", "crowsfoot", "half"];
  for (const arrowStyle of styles) {
    assert.doesNotThrow(() => toSvg(figure([connector({ arrowStyle })])));
  }
});

// --- line styles ---------------------------------------------------------------

test("lineStyle \"solid\" (the default) emits no stroke-dasharray at all", () => {
  const svg = toSvg(figure([connector({ lineStyle: "solid" })]));
  assert.ok(!svg.includes("stroke-dasharray"));
});

test("lineStyle \"dashed\" matches the legacy dashed:true pattern exactly", () => {
  const legacy = toSvg(figure([connector({ dashed: true, lineStyle: "dashed" })]));
  assert.match(legacy, /stroke-dasharray="6 4"/);
});

test("each non-solid lineStyle produces a distinct dasharray", () => {
  const styles: Exclude<LineStyle, "solid">[] = ["dashed", "dotted", "dashdot"];
  const patterns = styles.map((lineStyle) => {
    const svg = toSvg(figure([connector({ lineStyle })]));
    const match = /stroke-dasharray="([^"]*)"/.exec(svg);
    assert.ok(match, `expected a dasharray for lineStyle ${lineStyle}`);
    return match![1]!;
  });
  assert.equal(new Set(patterns).size, patterns.length, "dash patterns must all differ");
});

test("a PlacedConnector's own lineStyle is what gets drawn, regardless of its dashed flag", () => {
  // toSvg trusts PlacedConnector.lineStyle as already-resolved -- the
  // dashed-vs-lineStyle PRECEDENCE decision itself happens one layer up, in
  // layout/place.ts, and is covered separately below.
  const svg = toSvg(figure([connector({ dashed: false, lineStyle: "dotted" })]));
  assert.match(svg, /stroke-dasharray="1 4"/);
});

// --- resolution precedence (real pipeline: layout/place.ts) --------------------

function sceneSpec(connectorOverrides: Record<string, unknown>) {
  return parseSpec({
    version: 1,
    root: {
      type: "scene",
      layout: "absolute",
      width: 200,
      height: 100,
      children: [
        { type: "block", id: "a", x: 10, y: 30, width: 60, height: 30, label: "a" },
        { type: "block", id: "b", x: 130, y: 30, width: 60, height: 30, label: "b" },
      ],
      connectors: [{ from: "a", to: "b", ...connectorOverrides }],
    },
  });
}

test(
  "place.ts: an explicit lineStyle takes precedence over the legacy dashed boolean",
  { timeout: 60000 },
  async () => {
    const result = await render(sceneSpec({ dashed: false, lineStyle: "dotted" }));
    assert.match(result.svg, /stroke-dasharray="1 4"/);
  },
);

test(
  "place.ts: dashed:true with no lineStyle still resolves to the dashed pattern",
  { timeout: 60000 },
  async () => {
    const result = await render(sceneSpec({ dashed: true }));
    assert.match(result.svg, /stroke-dasharray="6 4"/);
  },
);

test(
  "place.ts: neither dashed nor lineStyle set resolves to solid -- unchanged default",
  { timeout: 60000 },
  async () => {
    const result = await render(sceneSpec({}));
    assert.ok(!result.svg.includes("stroke-dasharray"));
  },
);

test(
  "place.ts: an unset arrowStyle resolves to \"closed\", byte-identical to before this feature existed",
  { timeout: 60000 },
  async () => {
    const withDefault = await render(sceneSpec({ arrow: "end" }));
    const withExplicit = await render(sceneSpec({ arrow: "end", arrowStyle: "closed" }));
    assert.equal(withDefault.svg, withExplicit.svg);
  },
);
