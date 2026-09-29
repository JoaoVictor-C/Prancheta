/**
 * statistics: pure functions pinned against hand-worked examples, then the
 * drawn figure decoded back (bar heights, table cells, labels) and every fixture
 * rendered with every check passing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  boxStats, classCounts, classIndex, frequencyTable, mean, median, modes, niceStep, niceWidth, quartiles,
  standardDeviation, sturges, sturgesClasses, variance,
} from "../src/math/statistics.ts";
import { describeNumber, expandStatistics, validateStatisticsInput } from "../src/presets/statistics/preset.ts";
import type { StatisticsInput } from "../src/presets/statistics/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Mark, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/statistics/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));
const near = (a: number, b: number, e = 1e-9): boolean => Math.abs(a - b) <= e;

const D7 = [2, 4, 4, 5, 7, 9, 10];
const D8 = [1, 2, 3, 4, 5, 6, 7, 8];

test("median and quartiles by median of halves (default): odd n leaves the median out", () => {
  assert.equal(median(D7), 5);
  assert.deepEqual(quartiles(D7), { q1: 4, median: 5, q3: 9 });
  assert.deepEqual(quartiles(D8), { q1: 2.5, median: 4.5, q3: 6.5 });
});

test("Tukey's hinges keep the median in both halves; linear interpolates (type 7)", () => {
  assert.deepEqual(quartiles(D7, "tukey"), { q1: 4, median: 5, q3: 8 });
  assert.deepEqual(quartiles(D8, "tukey"), { q1: 2.5, median: 4.5, q3: 6.5 });
  assert.deepEqual(quartiles(D7, "linear"), { q1: 4, median: 5, q3: 8 });
  assert.deepEqual(quartiles(D8, "linear"), { q1: 2.75, median: 4.5, q3: 6.25 });
});

test("order of the input does not matter", () => {
  assert.deepEqual(quartiles([10, 2, 9, 4, 7, 5, 4]), quartiles(D7));
});

test("fences, whiskers and outliers: [1..9, 30]", () => {
  const b = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 30]);
  assert.equal(b.q1, 3);
  assert.equal(b.q3, 8);
  assert.equal(b.iqr, 5);
  assert.equal(b.lowFence, -4.5);
  assert.equal(b.highFence, 15.5);
  assert.equal(b.highWhisker, 9);
  assert.equal(b.lowWhisker, 1);
  assert.deepEqual(b.outliers, [30]);
});

test("a value exactly on a fence is not an outlier", () => {
  assert.deepEqual(boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 15.5]).outliers, []);
});

test("mean, variance and standard deviation: [2,4,4,4,5,5,7,9]", () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.equal(mean(xs), 5);
  assert.equal(variance(xs, "population"), 4);
  assert.equal(standardDeviation(xs, "population"), 2);
  assert.ok(near(variance(xs, "sample"), 32 / 7));
  assert.throws(() => variance([3], "sample"));
});

test("mode: unimodal, bimodal, amodal", () => {
  assert.deepEqual(modes([1, 2, 2, 3]), [2]);
  assert.deepEqual(modes([1, 1, 2, 2, 3]), [1, 2]);
  assert.deepEqual(modes([1, 2, 3]), []);
});

test("Sturges: k = 1 + 3,3 log n rounded", () => {
  assert.equal(sturges(40), 6);
  assert.equal(sturges(100), 8);
  assert.equal(sturges(50), 7);
  assert.equal(sturges(8), 4);
});

test("a nice width rounds up to a multiple of the data's precision", () => {
  assert.equal(niceWidth(6.667, 0), 7);
  assert.equal(niceWidth(2.2, 0), 3);
  assert.equal(niceWidth(0.0667, 2), 0.07);
  assert.equal(niceWidth(12.3, 0), 15);
});

test("Sturges classes for heights 150..189, n = 40: 150, 157, ..., 192", () => {
  const xs = Array.from({ length: 40 }, (_, i) => 150 + i);
  assert.deepEqual(sturgesClasses(xs).edges, [150, 157, 164, 171, 178, 185, 192]);
});

test("classes are [a; b) with the last closed", () => {
  const edges = [0, 10, 20];
  assert.equal(classIndex(10, edges), 1);
  assert.equal(classIndex(20, edges), 1);
  assert.equal(classIndex(0, edges), 0);
  assert.equal(classIndex(21, edges), -1);
  assert.deepEqual(classCounts([0, 5, 10, 15, 20, 20], edges), [2, 4]);
});

test("frequency table: fi, fri, Fi, xi, density", () => {
  const rows = frequencyTable([1, 2, 3, 4, 5, 6, 7, 8], [0, 4, 8]);
  assert.deepEqual(rows.map((r) => r.count), [3, 5]);
  assert.deepEqual(rows.map((r) => r.cumulative), [3, 8]);
  assert.deepEqual(rows.map((r) => r.mid), [2, 6]);
  assert.ok(near(rows[0]!.relative, 3 / 8) && near(rows[1]!.density, 5 / (8 * 4)));
  const decimals = frequencyTable([1.5, 1.57, 1.64], [1.5, 1.57, 1.64]);
  assert.deepEqual(decimals.map((r) => r.count), [1, 2]);
});

test("niceStep counts by 1, 2, 5", () => {
  assert.equal(niceStep(12, 8), 2);
  assert.equal(niceStep(100, 8), 20);
  assert.equal(niceStep(0.5, 8), 0.1);
});

test("numbers are written exact when they are", () => {
  assert.deepEqual(describeNumber(172.5), { sym: "=", text: "172,5" });
  assert.deepEqual(describeNumber(Math.sqrt(5)), { sym: "=", text: "√5 ≈ 2,236" });
  assert.equal(describeNumber(10 / 3).sym, "≈");
  assert.equal(describeNumber(-0.25, "en").text, "−0.25");
});

const H: StatisticsInput = {
  kind: "histogram",
  data: [150, 152, 153, 155, 155, 156, 158, 159, 160, 160, 161, 162, 162, 163, 165, 165, 165, 166, 167, 168, 168, 169, 170, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 182, 183, 185, 186, 188, 190],
};
type Spec = ReturnType<typeof expandStatistics>;
const marks = (s: Spec): Mark[] => (s.root as Scene).marks ?? [];
const blocks = (s: Spec): Block[] => (s.root as Scene).children as Block[];

test("histogram bars touch and their heights are the class frequencies", () => {
  const spec = expandStatistics(H);
  const bars = marks(spec).filter((m) => /^bar-\d+$/.test(m.id));
  assert.equal(bars.length, 6);
  const geo = bars.map((b) => {
    const pts = [b.from as { x: number; y: number }, ...b.segments.map((s) => (s as { line: { x: number; y: number } }).line)];
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), base: Math.max(...pts.map((p) => p.y)), top: Math.min(...pts.map((p) => p.y)) };
  });
  for (let i = 1; i < geo.length; i += 1) assert.ok(near(geo[i]!.x0, geo[i - 1]!.x1, 1e-6), "bars must touch");
  const unit = (geo[0]!.base - geo[2]!.top) / 10;
  assert.deepEqual(geo.map((g) => Math.round((g.base - g.top) / unit)), [6, 8, 10, 7, 5, 4]);
});

test("the table is computed and states the convention", () => {
  const spec = expandStatistics({ ...H, showTable: true });
  const cell = (id: string): string => blocks(spec).find((b) => b.id === id)?.label ?? "";
  assert.equal(cell("freq-cell-0-0"), "[150; 157)");
  assert.equal(cell("freq-cell-5-0"), "[185; 192]");
  assert.equal(cell("freq-cell-3-2"), "0,175");
  assert.equal(cell("freq-cell-5-3"), "40");
  assert.equal(cell("freq-foot-1"), "40");
  const text = blocks(spec).map((b) => b.label).join("|");
  assert.match(text, /fechadas à esquerda e abertas à direita/);
  assert.match(text, /Sturges: k = 1 \+ 3,3·log 40 = 6,29 ≈ 6/);
});

test("boxplot labels are computed from the data", () => {
  const spec = expandStatistics({ kind: "boxplot", data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 30], unit: "cm" });
  const labels = blocks(spec).map((b) => b.label);
  assert.ok(labels.includes("Q₁ = 3 cm") && labels.includes("Md = 5,5 cm") && labels.includes("Q₃ = 8 cm"), labels.join("|"));
  assert.ok(labels.some((l) => l?.includes("outlier: 30 cm")));
  assert.ok(marks(spec).some((m) => m.id === "outlier-0-0"));
});

test("the quartile method changes the labels", () => {
  const lab = (m: "halves" | "tukey" | "linear"): (string | undefined)[] => blocks(expandStatistics({ kind: "boxplot", data: D7, quartileMethod: m })).map((b) => b.label);
  assert.ok(lab("halves").includes("Q₃ = 9"));
  assert.ok(lab("tukey").includes("Q₃ = 8"));
});

test("refusals name what is wrong", () => {
  const bad = (raw: Record<string, unknown>, pattern: RegExp): void =>
    assert.throws(() => validateStatisticsInput(raw), (e: unknown) => e instanceof SpecError && pattern.test(e.message), JSON.stringify(raw));
  bad({ data: [1, 2] }, /kind is required/);
  bad({ kind: "histogram" }, /data is required/);
  bad({ kind: "histogram", data: [1] }, /at least two/);
  bad({ kind: "histogram", data: [3, 3, 3] }, /same value/);
  bad({ kind: "histogram", data: [{ values: [1, 2, 3] }, { values: [2, 3, 4] }] }, /ONE data set/);
  bad({ kind: "histogram", data: [1, 2, 3, 40], classes: [0, 10, 20] }, /below the largest/);
  bad({ kind: "histogram", data: [1, 2, 3, 40], classes: { start: 5, width: 10 } }, /above the smallest/);
  bad({ kind: "histogram", data: [1, 2, 3, 40], classes: [0, 10, 5, 50] }, /strictly increasing/);
  bad({ kind: "histogram", data: [1, 2, 3, 40], classes: [0, 10, 50] }, /unequal widths/);
  bad({ kind: "histogram", data: [1, "a", 3] }, /mixes|finite|must be/);
  bad({ kind: "boxplot", data: [1, 2, 3], quartileMethod: "x" }, /quartileMethod must be one of/);
});

test("unequal classes are drawn by density", () => {
  const spec = expandStatistics({ kind: "histogram", data: [1, 2, 3, 4, 5, 12, 18, 30, 40], classes: [0, 10, 20, 50], frequency: "density" });
  assert.ok(blocks(spec).some((b) => b.label?.startsWith("densidade")));
});

test("at least five fixtures", () => assert.ok(fixtures.length >= 5));

fixtures.forEach((f) => {
  test(`render fixture ${f}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "statistics");
    const { preset: _p, ...input } = raw;
    validateStatisticsInput(input);
    const result = await render(expandStatistics(input as unknown as StatisticsInput), { maxPasses: 3 });
    for (const c of result.manifest.checks) assert.ok(c.status === "pass" || c.status === "not-applicable", `${f}: ${c.id} ${c.status}: ${c.detail}`);
  });
});

// ---- answers: false, and magnitudes ---------------------------------------------------------------

const labelsOf = (s: Spec): string[] => blocks(s).map((b) => b.label ?? "");
const assertChecks = async (input: StatisticsInput, what: string): Promise<void> => {
  const result = await render(expandStatistics(input), { maxPasses: 3 });
  for (const c of result.manifest.checks) assert.ok(c.status === "pass" || c.status === "not-applicable", `${what}: ${c.id} ${c.status}: ${c.detail}`);
};

test("answers:true is the default and changes nothing", () => {
  const both: StatisticsInput = { ...H, kind: "both", showTable: true, polygon: true };
  assert.deepEqual(expandStatistics({ ...both, answers: true }), expandStatistics(both));
});

test("answers:false hides every computed statistic and keeps the drawing and the classes", async () => {
  const q: StatisticsInput = { ...H, kind: "both", showTable: true, polygon: true, unit: "cm", answers: false };
  const spec = expandStatistics(q);
  const text = labelsOf(spec).join("|");
  for (const forbidden of [/n = 40/, /x̄/, /Md =/, /Mo =/, /Q₁ =/, /Q₃ =/, /IQR =/, /Sturges/, /amplitude/, /outliers?: \d/, /nenhum outlier\b/, /polígono/]) assert.doesNotMatch(text, forbidden);
  const cell = (id: string): string | undefined => blocks(spec).find((b) => b.id === id)?.label;
  assert.equal(cell("freq-cell-0-0"), "[150; 157)");
  assert.equal(cell("freq-cell-5-0"), "[185; 192]");
  for (let r = 0; r < 6; r += 1) for (let c = 1; c < 5; c += 1) assert.equal(cell(`freq-cell-${r}-${c}`) ?? "", "");
  assert.equal(cell("freq-foot-1") ?? "", "");
  assert.equal(marks(spec).filter((m) => /^bar-\d+$/.test(m.id)).length, 6);
  assert.ok(!marks(spec).some((m) => m.id === "polygon"));
  assert.ok(marks(spec).some((m) => m.id === "median-0"), "the boxplot is still drawn");
  assert.ok(!labelsOf(spec).some((l) => /^(Q₁|Md|Q₃) = /.test(l)));
  await assertChecks(q, "statistics answers:false");
});

test("answers:false: the groups' summary table keeps the groups and empties the measures", async () => {
  const q: StatisticsInput = { kind: "boxplot", data: [{ label: "A", values: [10, 12, 13, 15, 18, 19, 20, 40] }, { label: "B", values: [5, 9, 14, 15, 16, 17, 19, 22] }], answers: false };
  const spec = expandStatistics(q);
  const cell = (id: string): string | undefined => blocks(spec).find((b) => b.id === id)?.label;
  assert.equal(cell("summary-cell-0-0"), "A");
  for (let c = 1; c < 9; c += 1) assert.equal(cell(`summary-cell-0-${c}`) ?? "", "");
  await assertChecks(q, "statistics two groups answers:false");
});

test("thousands: the classes and the box axis follow the data and every check passes", async () => {
  const data = [12000, 13500, 15000, 16200, 17800, 18000, 19500, 21000, 22400, 24000, 25500, 27000, 28800, 30000, 33000, 36500, 41000, 45000];
  const spec = expandStatistics({ kind: "both", data, showTable: true });
  const ticks = blocks(spec).filter((b) => !b.id?.startsWith("freq-") && /^\d+$/.test(b.label ?? ""));
  assert.ok(ticks.length <= 30, `${ticks.length} numbers`);
  await assertChecks({ kind: "both", data, showTable: true }, "statistics thousands");
  await assertChecks({ kind: "both", data, showTable: true, answers: false }, "statistics thousands answers:false");
});

test("thousandths: a variance of 0,00000565 is not printed as 0, and the quartiles keep their digits", async () => {
  const data = [0.001, 0.002, 0.002, 0.003, 0.003, 0.003, 0.004, 0.004, 0.005, 0.005, 0.006, 0.007, 0.008, 0.009];
  const text = labelsOf(expandStatistics({ kind: "both", data, unit: "g" })).join("|");
  assert.match(text, /s² ≈ 0,00000565 g²/);
  assert.match(text, /x̄ ≈ 0,00443 g/);
  assert.doesNotMatch(text, /s² ≈ 0 /);
  assert.deepEqual(describeNumber(0.0000056484), { sym: "≈", text: "0,00000565" });
  assert.deepEqual(describeNumber(0.0042), { sym: "=", text: "0,0042" });
  await assertChecks({ kind: "both", data, unit: "g", showTable: true, polygon: true }, "statistics thousandths");
});
