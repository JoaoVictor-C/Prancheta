import { test } from "node:test";
import assert from "node:assert/strict";
import { diffFigures } from "../src/anim/diff.ts";
import type {
  LaidOutFigure,
  PlacedBox,
  PlacedElement,
  PlacedText,
} from "../src/ir/types.ts";

function box(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    kind: "box",
    id: "b1",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
    radius: 0,
    content: { x: 5, y: 5, width: 90, height: 40 },
    ...overrides,
  };
}

function text(overrides: Partial<PlacedText> = {}): PlacedText {
  return {
    kind: "text",
    id: "t1",
    ownerId: "b1",
    lines: [
      {
        text: "hello",
        x: 10,
        y: 10,
        box: { x: 10, y: 0, width: 30, height: 12 },
        baselineUncertain: false,
      },
    ],
    fontFamily: "sans-serif",
    fontSize: 12,
    fill: "#000",
    anchor: "start",
    ...overrides,
  };
}

function figure(elements: PlacedElement[]): LaidOutFigure {
  return { width: 500, height: 500, background: "#fff", elements };
}

test("an element only in after is appeared", () => {
  const diff = diffFigures(figure([]), figure([box()]));
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "appeared");
  assert.equal(diff.deltas[0].id, "b1");
});

test("an element only in before is disappeared", () => {
  const diff = diffFigures(figure([box()]), figure([]));
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "disappeared");
  assert.equal(diff.deltas[0].id, "b1");
});

test("same id shifted by more than 0.5px is moved", () => {
  const before = figure([box({ x: 0, y: 0 })]);
  const after = figure([box({ x: 5, y: 0 })]);
  const diff = diffFigures(before, after);
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "moved");
});

test("same id shifted by less than 0.5px is unchanged, not moved", () => {
  const before = figure([box({ x: 0, y: 0 })]);
  const after = figure([box({ x: 0.2, y: 0 })]);
  const diff = diffFigures(before, after);
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "unchanged");
});

test("same id with different width/height is resized", () => {
  const before = figure([box({ width: 100, height: 50 })]);
  const after = figure([box({ width: 140, height: 50 })]);
  const diff = diffFigures(before, after);
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "resized");
});

test("a box whose fill changed is restyled", () => {
  const before = figure([box({ fill: "#111" })]);
  const after = figure([box({ fill: "#222" })]);
  const diff = diffFigures(before, after);
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "restyled");
});

test("a box whose stroke changed is restyled", () => {
  const before = figure([box({ stroke: "#111" })]);
  const after = figure([box({ stroke: "#222" })]);
  const diff = diffFigures(before, after);
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "restyled");
});

test("a text whose lines changed is retexted", () => {
  const before = figure([text()]);
  const after = figure([
    text({
      lines: [
        {
          text: "goodbye",
          x: 10,
          y: 10,
          box: { x: 10, y: 0, width: 40, height: 12 },
          baselineUncertain: false,
        },
      ],
    }),
  ]);
  const diff = diffFigures(before, after);
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "retexted");
});

test("an identical element is unchanged", () => {
  const diff = diffFigures(figure([box()]), figure([box()]));
  assert.equal(diff.deltas.length, 1);
  assert.equal(diff.deltas[0].kind, "unchanged");
});

test("counts sums to the number of deltas", () => {
  const before = figure([box({ id: "b1" }), box({ id: "b2", x: 0 })]);
  const after = figure([box({ id: "b1", x: 10 }), box({ id: "b3" })]);
  const diff = diffFigures(before, after);
  const total = Object.values(diff.counts).reduce((sum, n) => sum + n, 0);
  assert.equal(total, diff.deltas.length);
});

test("persisted counts ids present in both states", () => {
  const before = figure([box({ id: "b1" }), box({ id: "b2" })]);
  const after = figure([box({ id: "b1" }), box({ id: "b3" })]);
  const diff = diffFigures(before, after);
  assert.equal(diff.persisted, 1);
});

test("a same-id element whose kind differs is expressible: false with a message in unexplained", () => {
  const before = figure([box({ id: "x" })]);
  const after = figure([text({ id: "x" })]);
  const diff = diffFigures(before, after);
  assert.equal(diff.expressible, false);
  assert.equal(diff.unexplained.length, 1);
  assert.match(diff.unexplained[0], /x/);
  assert.match(diff.unexplained[0], /box/);
  assert.match(diff.unexplained[0], /text/);
});

test("an identical pair of figures yields all-unchanged with expressible: true", () => {
  const same = figure([box({ id: "b1" }), text({ id: "t1" })]);
  const diff = diffFigures(same, figure([box({ id: "b1" }), text({ id: "t1" })]));
  assert.equal(diff.expressible, true);
  assert.equal(diff.unexplained.length, 0);
  for (const delta of diff.deltas) assert.equal(delta.kind, "unchanged");
  assert.equal(diff.counts.unchanged, diff.deltas.length);
});
