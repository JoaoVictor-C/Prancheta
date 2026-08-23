import { test } from "node:test";
import assert from "node:assert/strict";
import { toSvg } from "../src/render/svg.ts";
import type { LaidOutFigure } from "../src/ir/types.ts";

function makeFigure(): LaidOutFigure {
  return {
    width: 400,
    height: 200,
    background: "#ffffff",
    elements: [
      {
        kind: "box",
        id: "box-1",
        x: 10,
        y: 10,
        width: 100,
        height: 50,
        fill: "#eeeeee",
        stroke: "#000000",
        strokeWidth: 2,
        radius: 8,
        content: { x: 12, y: 12, width: 96, height: 46 },
      },
      {
        kind: "text",
        id: "text-1",
        ownerId: "box-1",
        fontFamily: "Arial",
        fontSize: 14,
        fill: "#111111",
        anchor: "center",
        lines: [
          { text: "line one <a> & \"b\"", x: 60, y: 30, box: { x: 20, y: 20, width: 50, height: 14 }, baselineUncertain: false },
          { text: "line two", x: 60, y: 50, box: { x: 20, y: 40, width: 40, height: 14 }, baselineUncertain: false },
        ],
      },
      {
        kind: "text",
        id: "text-2",
        ownerId: null,
        fontFamily: 'Helvetica "Neue"',
        fontSize: 12,
        fill: "#222222",
        anchor: "end",
        lines: [
          { text: "solo", x: 200, y: 100, box: { x: 180, y: 90, width: 20, height: 10 }, baselineUncertain: false },
        ],
      },
    ],
  };
}

test("toSvg starts with <svg and has matching width/height/viewBox", () => {
  const svg = toSvg(makeFigure());
  assert.ok(svg.startsWith("<svg"));
  assert.match(svg, /width="400"/);
  assert.match(svg, /height="200"/);
  assert.match(svg, /viewBox="0 0 400 200"/);
});

test("toSvg emits exactly one <text per supplied line", () => {
  const svg = toSvg(makeFigure());
  const count = (svg.match(/<text /g) ?? []).length;
  assert.equal(count, 3); // 2 lines for text-1 + 1 line for text-2
});

test("toSvg never emits foreignObject or dominant-baseline", () => {
  const svg = toSvg(makeFigure());
  assert.ok(!svg.includes("foreignObject"));
  assert.ok(!svg.includes("dominant-baseline"));
});

test("toSvg insets stroke correctly for x, width and radius", () => {
  const svg = toSvg(makeFigure());
  // strokeWidth=2 -> half=1; x=10+1=11; width=100-2=98; radius=8-1=7
  assert.match(svg, /<rect data-pr-id="box-1" x="11" y="11" width="98" height="48" rx="7"/);
});

test("toSvg escapes &, < and > in line text", () => {
  const svg = toSvg(makeFigure());
  assert.ok(svg.includes("line one &lt;a&gt; &amp;"));
  assert.ok(!svg.includes("line one <a>"));
});

test("toSvg escapes a double quote inside a colour/font-family attribute value", () => {
  const svg = toSvg(makeFigure());
  assert.ok(svg.includes('font-family="Helvetica &quot;Neue&quot;"'));
});

test("toSvg maps anchor center to middle and end to end", () => {
  const svg = toSvg(makeFigure());
  assert.match(svg, /data-pr-id="text-1"[^>]*text-anchor="middle"/);
  assert.match(svg, /data-pr-id="text-2"[^>]*text-anchor="end"/);
});

// --- structure and accessibility (decision 0008) ---------------------------

test("every box, connector and text gets its own <g id> wrapper", () => {
  const svg = toSvg(makeFigure());
  assert.match(svg, /<g id="box-1">/);
  assert.match(svg, /<g id="text-1">/);
  assert.match(svg, /<g id="text-2">/);
});

test("elements sit in three named layer groups, in painter's order", () => {
  const svg = toSvg(makeFigure());
  const boxesAt = svg.indexOf('<g id="pr-boxes">');
  const textAt = svg.indexOf('<g id="pr-text">');
  assert.ok(boxesAt >= 0);
  assert.ok(textAt >= 0);
  // No connectors in this fixture, so pr-connectors is correctly absent
  // rather than emitted empty.
  assert.ok(!svg.includes("pr-connectors"));
  assert.ok(boxesAt < textAt, "boxes must appear before text in document order");
});

test("a box whose label has real text gets a <title> naming it", () => {
  const svg = toSvg(makeFigure());
  // <title> is text content, escaped with escapeText() (&, <, >) not attr()
  // (which additionally escapes quotes for attribute-value context) -- a
  // literal double quote is valid, unescaped, inside element text content.
  assert.match(svg, /<g id="box-1">\s*<title>line one &lt;a&gt; &amp; "b" line two<\/title>/);
});

test("a box with no owning label gets no <title> at all", () => {
  const figure = makeFigure();
  figure.elements = figure.elements.filter((e) => e.kind !== "text");
  const svg = toSvg(figure);
  assert.ok(!svg.includes("<title>"), "a box with no label should not get a hollow title");
});

test("a label with an owner gets a <desc> naming it, not a redundant <title>", () => {
  const svg = toSvg(makeFigure());
  assert.match(svg, /<g id="text-1">\s*<desc>Labels box-1<\/desc>/);
});

test("a label with no owner gets neither a <title> nor a <desc>", () => {
  const svg = toSvg(makeFigure());
  const textTwoGroup = svg.slice(svg.indexOf('<g id="text-2">'), svg.indexOf('<g id="text-2">') + 120);
  assert.ok(!textTwoGroup.includes("<title>"));
  assert.ok(!textTwoGroup.includes("<desc>"));
});

test("a connector gets a <desc> naming what it joins", () => {
  const figure = makeFigure();
  figure.elements.push({
    kind: "connector",
    id: "edge-1",
    fromId: "box-1",
    toId: "text-2",
    points: [
      { x: 10, y: 10 },
      { x: 100, y: 100 },
    ],
    arrow: "end",
    arrowStyle: "closed",
    dashed: false,
    lineStyle: "solid",
    stroke: "#000",
    strokeWidth: 1,
  });
  const svg = toSvg(figure);
  assert.match(svg, /<g id="edge-1">\s*<desc>Connects box-1 to text-2<\/desc>/);
});

test("a connector aimed at a bare point (no toId) says so in its <desc>", () => {
  const figure = makeFigure();
  figure.elements.push({
    kind: "connector",
    id: "edge-2",
    fromId: "box-1",
    toId: null,
    points: [
      { x: 10, y: 10 },
      { x: 100, y: 100 },
    ],
    arrow: "end",
    arrowStyle: "closed",
    dashed: false,
    lineStyle: "solid",
    stroke: "#000",
    strokeWidth: 1,
  });
  const svg = toSvg(figure);
  assert.match(svg, /<desc>Connects box-1 to a point<\/desc>/);
});

test("a text element with a rotation carries a matching SVG rotate() transform on its own <g>, glyphs left unrotated", () => {
  const figure = makeFigure();
  const rotated = figure.elements.find((e) => e.kind === "text" && e.id === "text-1");
  assert.ok(rotated && rotated.kind === "text");
  rotated.rotation = 45;
  rotated.rotationCenter = { x: 70, y: 40 };

  const svg = toSvg(figure);
  assert.match(svg, /<g id="text-1" transform="rotate\(45, 70, 40\)">/);
  // The glyphs themselves are still emitted at their original, unrotated x/y --
  // the transform on the wrapping <g> is what rotates them at render time.
  assert.match(svg, /<text data-pr-id="text-1" x="60" y="30"/);
});

test("a text element with no rotation gets no transform attribute at all", () => {
  const svg = toSvg(makeFigure());
  assert.doesNotMatch(svg, /<g id="text-1"[^>]*transform=/);
});

test("data-pr-id attributes still resolve regardless of the new <g> nesting", () => {
  // The contract every downstream consumer (check-independent, module verify,
  // an agent reading the file) relies on: an attribute selector does not
  // care how deep an element sits, only that data-pr-id is present somewhere.
  const svg = toSvg(makeFigure());
  assert.match(svg, /<rect data-pr-id="box-1"/);
  assert.match(svg, /<text data-pr-id="text-1"/);
});
