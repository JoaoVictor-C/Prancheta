/**
 * pictogram: icon counts and figurate numbers computed from the data, drawn
 * as computed, hidden under answers:false, and every fixture rendered clean.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { clipLeft, expandPictogram, figurateDots, polygonalNumber, validatePictogramInput, FIGURATE } from "../src/presets/pictogram/preset.ts";
import type { PictogramInput } from "../src/presets/pictogram/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { FigureNode, FigureSpec } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/pictogram/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));
const fixture = (name: string): PictogramInput => JSON.parse(readFileSync(join(dir, name), "utf8")) as PictogramInput;

const marks = (s: FigureSpec): { id?: string; fill?: string }[] => (s.root as { marks?: { id?: string; fill?: string }[] }).marks ?? [];
function labels(s: FigureSpec): string[] {
  const out: string[] = [];
  const walk = (n: FigureNode): void => {
    const o = n as { label?: string; children?: FigureNode[] };
    if (typeof o.label === "string") out.push(o.label);
    o.children?.forEach(walk);
  };
  walk(s.root);
  return out;
}

test("figure k of each sequence has exactly the polygonal number of dots", () => {
  for (const shape of FIGURATE) {
    for (let k = 1; k <= 7; k += 1) {
      assert.equal(figurateDots(shape, k).dots.length, polygonalNumber(shape, k), `${shape} ${k}`);
    }
  }
  assert.deepEqual([1, 2, 3, 4].map((k) => polygonalNumber("pentagonal", k)), [1, 5, 12, 22]);
  assert.deepEqual([1, 2, 3, 4, 5].map((k) => polygonalNumber("triangular", k)), [1, 3, 6, 10, 15]);
  assert.deepEqual([1, 2, 3, 4].map((k) => polygonalNumber("hexagonal", k)), [1, 6, 15, 28]);
});

test("each row fills value/per icons; a remainder fills the last icon by its fraction", () => {
  const spec = expandPictogram(fixture("houses-per-year.json"));
  const full = (row: number) => marks(spec).filter((m) => new RegExp(`^r${row}-i\\d+-1$`).test(m.id ?? "") && m.fill === "#1D4E89").length;
  const part = (row: number) => marks(spec).filter((m) => new RegExp(`^r${row}-i\\d+-1-part$`).test(m.id ?? "")).length;
  // 45, 72 and 30 houses, one icon per 10.
  assert.deepEqual([1, 2, 3].map(full), [4, 7, 3]);
  assert.deepEqual([1, 2, 3].map(part), [1, 1, 0]);
  // Every row shows the same number of slots: the largest count, rounded up.
  const slots = (row: number) => marks(spec).filter((m) => new RegExp(`^r${row}-i\\d+-1$`).test(m.id ?? "")).length;
  assert.deepEqual([1, 2, 3].map(slots), [8, 8, 8]);
  // "round" draws whole icons only.
  const rounded = expandPictogram({ ...fixture("houses-per-year.json"), partial: "round" });
  assert.equal(marks(rounded).filter((m) => (m.id ?? "").endsWith("-part")).length, 0);
});

test("a fraction clips the icon at exactly that share of its width", () => {
  const square = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
  const half = clipLeft(square, 10);
  const area = (p: { x: number; y: number }[]) => Math.abs(p.reduce((s, a, i) => s + a.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * a.y, 0)) / 2;
  assert.equal(area(half), 200);
});

test("a percentage row is a share of 100: 20 slots at 5 % each", () => {
  const spec = expandPictogram(fixture("survey-transport.json"));
  const slots = marks(spec).filter((m) => /^r1-i\d+-1$/.test(m.id ?? "")).length;
  assert.equal(slots, 20);
  assert.ok(labels(spec).includes("90 %"));
  assert.ok(labels(spec).includes("Cada ícone representa 5 %."));
});

test("answers:false hides each row's value and each figure's count, and keeps the icons", () => {
  const q = expandPictogram({ ...fixture("survey-transport.json"), answers: false });
  assert.ok(!labels(q).some((t) => /%$/.test(t)), labels(q).join(" | "));
  assert.equal(marks(q).length, marks(expandPictogram(fixture("survey-transport.json"))).length);
  const f = expandPictogram({ ...fixture("figurate-pentagonal.json"), answers: false });
  assert.ok(!labels(f).some((t) => /ponto/.test(t)));
  assert.ok(labels(f).includes("Figura 4"));
  assert.ok(labels(expandPictogram(fixture("figurate-pentagonal.json"))).includes("1 ponto"));
});

test("validation refuses what cannot be drawn", () => {
  const bad = (raw: Record<string, unknown>, re: RegExp) => assert.throws(() => validatePictogramInput(raw), (e: unknown) => e instanceof SpecError && re.test(e.message));
  bad({ rows: [] }, /must not be empty/);
  bad({ rows: [{ label: "a", value: -1 }] }, /negative/);
  bad({ rows: [{ label: "a", value: 1 }], shape: "pentagonal" }, /belong/);
  bad({ kind: "figurate" }, /shape is required/);
  bad({ kind: "figurate", shape: "pentagonal", terms: 9 }, /terms/);
  bad({ rows: [{ label: "a", value: 120 }], unit: "%" }, /exceeds/);
  bad({ rows: [{ label: "a", value: 5000 }] }, /too many/);
  bad({ rows: [{ label: "a", value: 1 }], colour: "red" }, /not a field/);
});

for (const name of fixtures) {
  for (const answers of [true, false]) {
    test(`fixture ${name} (answers: ${answers}) renders with every check passing`, { timeout: 120000 }, async () => {
      const input = { ...fixture(name), answers };
      const result = await render(expandPictogram(input), { raster: false });
      const failed = result.manifest.checks.filter((c) => c.status === "fail");
      assert.deepEqual(failed.map((c) => `${c.id}: ${c.detail}`), []);
    });
  }
}
