/**
 * distribution: a law with an event shaded. The probability is the only number
 * anyone will copy off the page, so these tests decode the DRAWN geometry --
 * the shaded polygon's vertices, stated in the plane's own (x, density) frame --
 * and integrate it, the way a reviewer with a ruler would, instead of trusting
 * the preset's arithmetic a second time. What is printed is then held to what
 * is drawn, and the arithmetic in the panel is parsed back and re-done.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  approximateProbability,
  barRange,
  barWindow,
  eventProbability,
  expandDistribution,
  normalReach,
  operandDecimals,
  panelLines,
  parseEvent,
  parseModel,
  planeOf,
  probZ,
  validateDistributionInput,
} from "../src/presets/distribution/preset.ts";
import type { DistributionInput, Event, Model } from "../src/presets/distribution/preset.ts";
import { binomialPmf, normalPdf, phi, poissonPmf } from "../src/math/probability.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, FramedPoint, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";
import { parseNumber } from "../src/locale/format.ts";

const dir = fileURLToPath(new URL("../fixtures/distribution/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));
const load = (name: string): DistributionInput => {
  const { preset: _p, ...input } = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
  return input as unknown as DistributionInput;
};

const near = (a: number, b: number, eps: number, what = ""): void => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b} (|Δ| = ${Math.abs(a - b)})`);

// ---- decoding a spec ---------------------------------------------------------------------------------------

type Spec = ReturnType<typeof expandDistribution>;
const inputs = new WeakMap<object, DistributionInput>();
/** Expand, remembering the input, so a mark can be decoded through the frame it was drawn in. */
const expand = (input: DistributionInput): Spec => {
  const spec = expandDistribution(input);
  inputs.set(spec, input);
  return spec;
};
const scene = (spec: Spec): Scene => spec.root as Scene;
const marksOf = (spec: Spec): Mark[] => scene(spec).marks ?? [];
const blocksOf = (spec: Spec): Block[] => (scene(spec).children ?? []) as Block[];
const isFramed = (p: unknown): p is FramedPoint => typeof p === "object" && p !== null && "frame" in p;

/**
 * A mark's vertices in AXIS units. The spec has already had its frame resolved to canvas pixels, so each
 * vertex is inverted through the frame the drawing used (`planeOf`, the same function the drawing calls).
 */
function axisPoints(spec: Spec, m: Mark): { x: number; y: number }[] {
  const f = planeOf(inputs.get(spec)!);
  const inv = (p: Point | FramedPoint): { x: number; y: number } =>
    isFramed(p) ? { x: p.x, y: p.y } : { x: (p.x - f.origin.x) / f.xUnit, y: (f.origin.y - p.y) / f.yUnit };
  const pts = [inv(m.from)];
  for (const s of m.segments) if ("line" in s) pts.push(inv(s.line as Point | FramedPoint));
  return pts;
}

/** The shoelace area of a closed mark, in (x, density) units: for a density plane that IS a probability. */
function areaOf(spec: Spec, m: Mark): number {
  const pts = axisPoints(spec, m);
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** The number a label prints after its last "=". */
function printedNumber(text: string): number {
  const tail = text.slice(text.lastIndexOf("=") + 1).trim();
  const n = parseNumber(tail, "pt-BR");
  assert.notEqual(n, null, `cannot read a number from ${JSON.stringify(text)}`);
  return n!;
}

const labelOf = (spec: Spec, annotates: string): Block => {
  const b = blocksOf(spec).find((x) => x.annotates === annotates && x.id?.startsWith("label-region") || x.annotates === annotates && x.id === "label-event-region");
  assert.ok(b, `no label annotates ${annotates}`);
  return b!;
};

// ---- the arithmetic the figure rests on ------------------------------------------------------------------------------

const N70: Model = { kind: "normal", mean: 70, sd: 5 };

test("P(60 < X < 75) for N(70; 5²) is Φ(1) − Φ(−2) = 0,81859…", () => {
  const p = eventProbability(N70, { type: "between", a: 60, b: 75 });
  near(p, phi(1) - phi(-2), 1e-15);
  near(p, 0.8185946141203637, 1e-14);
});

test("the tails and the standard cases", () => {
  const Z: Model = { kind: "normal", mean: 0, sd: 1 };
  near(eventProbability(Z, { type: "above", a: 1.96, strict: false }), 0.024997895148220435, 1e-15);
  near(eventProbability(Z, { type: "below", b: -1.96, strict: false }), 0.024997895148220435, 1e-15);
  near(eventProbability(Z, { type: "tails", z: 1.96 }), 0.04999579029644087, 1e-15);
  // a far tail keeps its digits: it is read from the small side, never as 1 − Φ
  assert.ok(eventProbability(Z, { type: "above", a: 8, strict: false }) > 6e-16);
  near(probZ(5, 6), phi(-5) - phi(-6), 1e-20);
  assert.ok(Math.abs(probZ(5, 6) / (2.866515718791933e-7 - 9.865876450376946e-10) - 1) < 1e-9);
});

test("a discrete event covers the bars its words say", () => {
  const B: Model = { kind: "binomial", n: 10, p: 0.3 };
  assert.deepEqual(barRange(B, { type: "equals", k: 3 }), { kLo: 3, kHi: 3 });
  assert.deepEqual(barRange(B, { type: "below", b: 2, strict: false }), { kLo: 0, kHi: 2 });
  assert.deepEqual(barRange(B, { type: "below", b: 2, strict: true }), { kLo: 0, kHi: 1 });
  assert.deepEqual(barRange(B, { type: "above", a: 8, strict: false }), { kLo: 8, kHi: 10 });
  assert.deepEqual(barRange(B, { type: "above", a: 8, strict: true }), { kLo: 9, kHi: 10 });
  assert.deepEqual(barRange(B, { type: "between", a: 2, b: 4 }), { kLo: 2, kHi: 4 });
  const Po: Model = { kind: "poisson", lambda: 3 };
  assert.deepEqual(barRange(Po, { type: "above", a: 1, strict: false }), { kLo: 1, kHi: Infinity });
  near(eventProbability(Po, { type: "above", a: 1, strict: false }), 1 - Math.exp(-3), 1e-15);
  near(eventProbability(B, { type: "equals", k: 3 }), 0.266827932, 1e-12);
  near(eventProbability(B, { type: "below", b: 2, strict: false }), 0.3827827864, 1e-12);
  near(eventProbability(B, { type: "below", b: 2, strict: true }), 0.0282475249 + 0.121060821, 1e-12);
});

test("the normal approximation applies the continuity correction at the edges of the bars", () => {
  const B: Model = { kind: "binomial", n: 50, p: 0.4 };
  const ev: Event = { type: "between", a: 18, b: 24 };
  const mu = 20;
  const sigma = Math.sqrt(12);
  near(approximateProbability(B, ev), phi((24.5 - mu) / sigma) - phi((17.5 - mu) / sigma), 1e-15);
  near(approximateProbability(B, { type: "below", b: 18, strict: false }), phi((18.5 - mu) / sigma), 1e-15);
  near(approximateProbability(B, { type: "above", a: 25, strict: false }), phi(-(24.5 - mu) / sigma), 1e-15);
  near(approximateProbability(B, { type: "equals", k: 20 }), phi(0.5 / sigma) - phi(-0.5 / sigma), 1e-15);
  // and it is close to the truth, which is what the panel reports
  assert.ok(Math.abs(approximateProbability(B, ev) - eventProbability(B, ev)) < 0.01);
});

// ---- what is printed is computed --------------------------------------------------------------------------------------------

test("the panel does the standardisation and the arithmetic of the textbook exercise", () => {
  const lines = panelLines(N70, { type: "between", a: 60, b: 75 });
  assert.ok(lines.some((l) => l === "z₁ = (60 − 70)/5 = −2; z₂ = (75 − 70)/5 = 1"), lines.join("\n"));
  const chain = lines.find((l) => l.startsWith("P(60 < X < 75)"))!;
  assert.ok(chain.startsWith("P(60 < X < 75) = P(−2 < Z < 1) = Φ(1) − Φ(−2) = "), chain);
  assert.ok(chain.endsWith("= 0,8186 ≈ 81,86%"), chain);
});

test("the operands are given enough digits that the subtraction on the page is right", () => {
  // Φ(1) − Φ(−2) = 0,8413 − 0,0228 would read 0,8185: the exact value is 0,81859…
  const lines = panelLines(N70, { type: "between", a: 60, b: 75 });
  const text = lines.join(" | ");
  const m = /= ([\d,]+) − ([\d,]+) = ([\d,]+) ≈/.exec(text);
  assert.ok(m, text);
  const [a, b, r] = [1, 2, 3].map((i) => Number(m![i]!.replace(",", ".")));
  near(Math.round((a! - b!) * 1e4) / 1e4, r!, 1e-12);
  assert.notEqual(m![1], "0,8413", "the operands must not be the four-decimal ones that subtract wrongly");
  assert.equal(m![3], "0,8186");
});

test("every chain of operands on the page combines to the result on the page, over a sweep of events", () => {
  let checked = 0;
  for (let mean = -20; mean <= 120; mean += 17) {
    for (const sd of [0.5, 1, 3.7, 15]) {
      for (let a = -2.4; a < 2.5; a += 0.7) {
        const b = a + 0.3 + (Math.abs(a) % 1.3);
        const m: Model = { kind: "normal", mean, sd };
        const ev: Event = { type: "between", a: Number((mean + a * sd).toFixed(3)), b: Number((mean + b * sd).toFixed(3)) };
        const line = panelLines(m, ev).find((l) => /Φ\(.*\) − Φ\(.*\) = /.test(l))!;
        const g = /= ([\d,]+) − ([\d,]+) = ([\d,]+) ≈/.exec(line);
        assert.ok(g, line);
        const [x, y, r] = [1, 2, 3].map((i) => Number(g![i]!.replace(",", ".")));
        const decimals = g![3]!.split(",")[1]!.length;
        near(Number((x! - y!).toFixed(decimals)), r!, 1e-12, line);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 60);
  // the same rule for 1 − Φ, exercised directly: four decimals suffice there, and Φ(1) − Φ(−2) needs five
  assert.equal(operandDecimals([phi(1.96)], (r) => 1 - r[0]!, 1 - phi(1.96), 4), 4);
  assert.equal(operandDecimals([phi(1), phi(-2)], (r) => r[0]! - r[1]!, phi(1) - phi(-2), 4), 5);
});

test("the binomial line is the formula of the exercise, with the coefficient beneath", () => {
  const lines = panelLines({ kind: "binomial", n: 10, p: 0.3 }, { type: "equals", k: 3 });
  assert.equal(lines[0], "P(X = 3) = C(10, 3) · 0,3³ · 0,7⁷ = 0,2668 ≈ 26,68%");
  assert.equal(lines[1], "C(10, 3) = 120");
});

test("a range of a few terms is written term by term, and sums as printed", () => {
  const lines = panelLines({ kind: "binomial", n: 10, p: 0.3 }, { type: "below", b: 2, strict: false });
  assert.equal(lines[0], "P(X ≤ 2) = P(X = 0) + P(X = 1) + P(X = 2) = 0,0282 + 0,1211 + 0,2335 = 0,3828 ≈ 38,28%");
  const strict = panelLines({ kind: "binomial", n: 10, p: 0.3 }, { type: "below", b: 3, strict: true });
  assert.ok(strict[0]!.startsWith("P(X < 3) = P(X ≤ 2) = "), strict[0]);
});

test("a Poisson's tail is written by its complement", () => {
  const lines = panelLines({ kind: "poisson", lambda: 3 }, { type: "above", a: 1, strict: false });
  assert.equal(lines[0], "P(X ≥ 1) = 1 − P(X ≤ 0) = 1 − 0,0498 = 0,9502 ≈ 95,02%");
  assert.equal(lines[1], "P(X = 0) = e⁻³ · 3⁰ / 0! = 0,0498");
});

test("a two-tailed test states its critical value, α/2 and confidence, from α or from z", () => {
  const fromAlpha = panelLines({ kind: "normal", mean: 0, sd: 1 }, parseEvent({ kind: "normal", mean: 0, sd: 1 }, { tails: { alpha: 0.05 } }));
  assert.ok(fromAlpha[0]!.startsWith("α = 0,05: z = Φ⁻¹(1 − α/2) = Φ⁻¹(0,975) ≈ 1,96"), fromAlpha[0]);
  assert.ok(fromAlpha.some((l) => l.startsWith("P(|Z| > 1,96) = 2 · [1 − Φ(1,96)] = 2 · 0,0250 = 0,0500 ≈ 5,00%")), fromAlpha.join("\n"));
  assert.ok(fromAlpha.some((l) => l.includes("cada cauda tem α/2 = 0,0250") && l.includes("1 − α = 0,9500")));
  const nonStandard = panelLines(N70, { type: "tails", z: 1.96 });
  assert.ok(nonStandard.some((l) => l.startsWith("x = μ ± z·σ = 70 ± 1,96 · 5: 60,2 e 79,8")), nonStandard.join("\n"));
});

test("the approximation's panel states μ, σ, the corrected edges, both probabilities and the error", () => {
  const lines = panelLines({ kind: "binomial", n: 50, p: 0.4 }, { type: "between", a: 18, b: 24 }, { approximation: true });
  const text = lines.join("\n");
  assert.ok(text.includes("μ = np = 20; σ² = npq = 12; σ = 3,4641"));
  assert.ok(text.includes("P(18 ≤ X ≤ 24) ≈ P(17,5 < Y < 24,5)"));
  assert.ok(text.includes("valor exato 0,6653; a aproximação erra 0,0025"), text);
  const weak = panelLines({ kind: "binomial", n: 10, p: 0.1 }, { type: "below", b: 1, strict: false }, { approximation: true }).join("\n");
  assert.ok(weak.includes("atenção: np = 1 e nq = 9"), weak);
});

// ---- the window ----------------------------------------------------------------------------------------------------------------------

test("the bars drawn hold all but 1e-5 of the mass, and the event lies inside them", () => {
  for (const [m, ev] of [
    [{ kind: "binomial", n: 50, p: 0.4 } as Model, { type: "between", a: 18, b: 24 } as Event],
    [{ kind: "binomial", n: 1000, p: 0.5 } as Model, { type: "between", a: 480, b: 520 } as Event],
    [{ kind: "poisson", lambda: 3 } as Model, { type: "above", a: 1, strict: false } as Event],
    [{ kind: "poisson", lambda: 40 } as Model, { type: "below", b: 20, strict: false } as Event],
  ] as [Model, Event][]) {
    const w = barWindow(m, ev, 4);
    const pmf = (k: number): number => (m.kind === "binomial" ? binomialPmf(k, m.n, m.p) : poissonPmf(k, (m as { lambda: number }).lambda));
    let inside = 0;
    for (let k = w.lo; k <= w.hi; k += 1) inside += pmf(k);
    assert.ok(1 - inside < 2.5e-5, `${m.kind}: ${1 - inside} of the mass is outside [${w.lo}, ${w.hi}]`);
    const r = barRange(m, ev);
    assert.ok(w.lo <= r.kLo && (r.kHi === Infinity || w.hi >= r.kHi));
  }
  // a small n shows every value
  assert.deepEqual(barWindow({ kind: "binomial", n: 10, p: 0.3 }, { type: "equals", k: 3 }, 4), { lo: 0, hi: 10 });
});

test("an open-ended normal event reaches far enough that the mass it leaves out is below the last printed digit", () => {
  const Z: Model = { kind: "normal", mean: 0, sd: 1 };
  for (const decimals of [2, 3, 4, 5, 6]) {
    const reach = normalReach(Z, { type: "above", a: 1.96, strict: false }, decimals);
    assert.ok(phi(-reach) <= 0.1 * 10 ** -decimals, `decimals ${decimals}: reach ${reach}`);
  }
  assert.equal(normalReach(N70, { type: "between", a: 60, b: 75 }, 4), 4);
  assert.ok(normalReach(N70, { type: "between", a: 30, b: 75 }, 4) >= 9);
});

// ---- the drawn geometry, decoded ----------------------------------------------------------------------------------------------------

test("the shaded region's polygon integrates to the probability, and the printed number is that probability", () => {
  const spec = expand({ kind: "normal", mean: 70, sd: 5, event: { between: [60, 75] } });
  const region = marksOf(spec).find((m) => m.id === "region-0")!;
  const p = eventProbability(N70, { type: "between", a: 60, b: 75 });
  near(areaOf(spec, region), p, 2e-6, "shoelace area of the polygon");
  near(printedNumber(labelOf(spec, "region-0").label as string), p, 5e-5, "printed number");
  // the polygon starts and ends ON the bounds, and its top edge lies ON the density
  const pts = axisPoints(spec, region);
  near(Math.min(...pts.map((q) => q.x)), 60, 1e-12);
  near(Math.max(...pts.map((q) => q.x)), 75, 1e-12);
  for (const q of pts) if (q.y > 0) near(q.y, normalPdf(q.x, 70, 5), 1e-12, `vertex at x = ${q.x}`);
});

test("above, below and two tails: each region integrates to what its label says", () => {
  const cases: [DistributionInput, string[], number[]][] = [
    [{ kind: "normal", event: { above: 1.96 } }, ["region-0"], [0.024997895148220435]],
    [{ kind: "normal", mean: 1200, sd: 150, event: { below: 1000 } }, ["region-0"], [phi(-200 / 150)]],
    [{ kind: "normal", event: { tails: 1.96 } }, ["region-0", "region-1"], [0.024997895148220435, 0.024997895148220435]],
    [{ kind: "normal", mean: 100, sd: 15, event: { tails: { alpha: 0.01 } } }, ["region-0", "region-1"], [0.005, 0.005]],
  ];
  for (const [input, ids, want] of cases) {
    const spec = expand(input);
    ids.forEach((id, i) => {
      const region = marksOf(spec).find((m) => m.id === id)!;
      // an open-ended event stops at the edge of the range: what lies beyond is kept under a tenth of the last printed digit
      near(areaOf(spec, region), want[i]!, 5e-6, `${id} area`);
      near(printedNumber(labelOf(spec, id).label as string), want[i]!, 5e-5, `${id} label`);
    });
  }
});

test("a tighter `decimals` draws a wider range so the shaded tail still integrates to the printed digits", () => {
  const spec = expand({ kind: "normal", event: { above: 2 }, decimals: 6 });
  const region = marksOf(spec).find((m) => m.id === "region-0")!;
  near(areaOf(spec, region), phi(-2), 1e-6);
});

test("the boundaries sit where the event says, at their own x and z", () => {
  const spec = expand({ kind: "normal", mean: 70, sd: 5, event: { between: [60, 75] }, showZ: true });
  const texts = blocksOf(spec).map((b) => b.label as string);
  for (const t of ["60", "75", "−2", "1"]) assert.ok(texts.includes(t), `no label ${t}`);
  // the bold boundary labels replace the plain ticks under them, never sit on them
  assert.equal(texts.filter((t) => t === "60").length, 1);
  assert.equal(texts.filter((t) => t === "75").length, 1);
  // x ticks at μ ± kσ for k = −4 … 4, and z ticks numbering the same places
  const tickX = marksOf(spec).filter((m) => /^tick-\d+$/.test(m.id ?? "")).map((m) => axisPoints(spec, m)[0]!.x).sort((a, b) => a - b);
  assert.deepEqual(tickX.map((x) => Math.round(x * 1e9) / 1e9), [50, 55, 60, 65, 70, 75, 80, 85, 90]);
  assert.ok(texts.includes("−4") && texts.includes("4") && texts.includes("0"));
});

test("the standard normal has one axis: z is x, so it is numbered once", () => {
  const spec = expand({ kind: "normal", event: { above: 1.96 }, showZ: true });
  const names = blocksOf(spec).filter((b) => b.id?.startsWith("axis-name")).map((b) => b.label);
  assert.deepEqual(names, ["z"]);
});

test("a discrete law draws bars of width 1 centred on k, each as tall as its mass", () => {
  const spec = expand({ kind: "binomial", n: 10, p: 0.3, event: { equals: 3 } });
  for (let k = 0; k <= 10; k += 1) {
    const bar = marksOf(spec).find((m) => m.id === `bar-${k}`)!;
    const pts = axisPoints(spec, bar);
    near(Math.min(...pts.map((q) => q.x)), k - 0.5, 1e-12);
    near(Math.max(...pts.map((q) => q.x)), k + 0.5, 1e-12);
    near(Math.max(...pts.map((q) => q.y)), binomialPmf(k, 10, 0.3), 1e-12);
    near(areaOf(spec, bar), binomialPmf(k, 10, 0.3), 1e-12, `bar ${k}`);
  }
});

test("the event's bars are one outline whose area is the printed probability", () => {
  for (const [input, want] of [
    [{ kind: "binomial", n: 10, p: 0.3, event: { equals: 3 } }, 0.266827932],
    [{ kind: "binomial", n: 10, p: 0.3, event: { below: 2 } }, 0.3827827864],
    [{ kind: "binomial", n: 50, p: 0.4, event: { between: [18, 24] } }, undefined],
    [{ kind: "poisson", lambda: 3, event: { above: 1 } }, 1 - Math.exp(-3)],
  ] as [DistributionInput, number | undefined][]) {
    const spec = expand(input);
    const outline = marksOf(spec).find((m) => m.id === "event-region")!;
    const model = parseModel(input as unknown as Record<string, unknown>);
    const p = eventProbability(model, parseEvent(model, input.event));
    if (want !== undefined) near(p, want, 1e-9);
    near(areaOf(spec, outline), p, 1e-5, "outline area");
    near(printedNumber(labelOf(spec, "event-region").label as string), p, 5e-5, "printed");
  }
});

test("the approximation lays the normal curve over the bars and marks the corrected edges", () => {
  const spec = expand({ kind: "binomial", n: 50, p: 0.4, event: { between: [18, 24] }, approximation: "normal" });
  const curve = marksOf(spec).find((m) => m.id === "approx-curve")!;
  assert.equal(curve.lineStyle, "dashed");
  for (const q of axisPoints(spec, curve)) near(q.y, normalPdf(q.x, 20, Math.sqrt(12)), 1e-12);
  const edges = marksOf(spec).filter((m) => /^boundary-\d$/.test(m.id ?? "")).map((m) => Math.round(axisPoints(spec, m)[0]!.x * 1e9) / 1e9).sort((a, b) => a - b);
  assert.deepEqual(edges, [17.5, 24.5]);
  const texts = blocksOf(spec).map((b) => b.label);
  assert.ok(texts.includes("17,5") && texts.includes("24,5"));
});

test("two bounds too close for their labels are set in two rows, never on top of each other", () => {
  const spec = expand({ kind: "binomial", n: 30, p: 0.5, event: { equals: 15 }, approximation: "normal" });
  const a = blocksOf(spec).find((b) => b.label === "14,5")!;
  const b = blocksOf(spec).find((b2) => b2.label === "15,5")!;
  assert.notEqual(a.y, b.y);
});

// ---- input refusals ----------------------------------------------------------------------------------------------------------------------

test("bad input is refused with a message naming the path", () => {
  const bad = (input: Record<string, unknown>, re: RegExp): void => {
    assert.throws(() => validateDistributionInput({ preset: "distribution", ...input }), (e: unknown) => e instanceof SpecError && re.test(e.message), JSON.stringify(input));
  };
  bad({ event: { above: 1 } }, /distribution\.kind must be one of normal, binomial, poisson/);
  bad({ kind: "gamma", event: { above: 1 } }, /distribution\.kind/);
  bad({ kind: "normal" }, /distribution\.event is required/);
  bad({ kind: "normal", sd: 0, event: { above: 1 } }, /distribution\.sd must be > 0/);
  bad({ kind: "normal", n: 10, event: { above: 1 } }, /distribution\.n does not belong to kind "normal"/);
  bad({ kind: "normal", event: { equals: 1 } }, /continuous.*P\(X = k\) = 0/);
  bad({ kind: "normal", event: { between: [3, 1] } }, /between must be \[a, b\] with a < b/);
  bad({ kind: "normal", event: { above: 1, below: 2 } }, /exactly one of between, below, above, equals, tails -- found above and below/);
  bad({ kind: "normal", event: { tails: -1 } }, /tails must be > 0/);
  bad({ kind: "normal", event: { tails: { alpha: 1.5 } } }, /alpha must lie strictly between 0 and 1/);
  bad({ kind: "normal", event: { equals: 1, strict: true } }, /strict only applies/);
  bad({ kind: "binomial", n: 10, event: { equals: 3 } }, /distribution\.p must be a finite number/);
  bad({ kind: "binomial", n: 10, p: 1.2, event: { equals: 3 } }, /p must lie strictly between 0 and 1/);
  bad({ kind: "binomial", n: 10.5, p: 0.3, event: { equals: 3 } }, /n must be a whole number/);
  bad({ kind: "binomial", n: 10, p: 0.3, event: { equals: 11 } }, /outside the support 0 … 10/);
  bad({ kind: "binomial", n: 10, p: 0.3, event: { equals: 2.5 } }, /must be a whole number/);
  bad({ kind: "binomial", n: 10, p: 0.3, event: { tails: 1.96 } }, /tails is the two-sided/);
  bad({ kind: "binomial", n: 10, p: 0.3, event: { below: 0, strict: true } }, /leaves no value of X/);
  bad({ kind: "binomial", n: 10, p: 0.3, event: { equals: 3 }, showZ: true }, /showZ/);
  bad({ kind: "binomial", n: 10, p: 0.3, event: { equals: 3 }, approximation: "poisson" }, /approximation must be "normal"/);
  bad({ kind: "normal", event: { above: 1 }, approximation: "normal" }, /needs no approximation/);
  bad({ kind: "poisson", lambda: -1, event: { equals: 1 } }, /lambda must be > 0/);
  bad({ kind: "poisson", lambda: 3, event: { equals: -1 } }, /outside the support 0, 1, 2/);
  bad({ kind: "normal", event: { above: 1 }, decimals: 0 }, /decimals must be a whole number from 1 to 6/);
  bad({ kind: "normal", event: { above: 1 }, colour: "red" }, /distribution\.colour is not a field/);
  bad({ kind: "normal", event: { above: 1 }, locale: "fr" }, /locale must be one of/);
});

// ---- every fixture renders, and every check passes -----------------------------------------------------------------------------------------------

test("there are at least six fixtures, covering every kind and every event", () => {
  assert.ok(fixtures.length >= 6, `${fixtures.length} fixtures`);
  const kinds = new Set(fixtures.map((f) => load(f).kind));
  assert.deepEqual([...kinds].sort(), ["binomial", "normal", "poisson"]);
  const events = new Set(fixtures.map((f) => Object.keys(load(f).event)[0]));
  for (const e of ["between", "above", "below", "equals", "tails"]) assert.ok(events.has(e), `no fixture with ${e}`);
  assert.ok(fixtures.some((f) => load(f).approximation === "normal"));
  assert.ok(fixtures.some((f) => load(f).showZ === true));
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes and every area is measured`, async () => {
    const input = load(filename);
    validateDistributionInput(input as unknown as Record<string, unknown>);
    const spec = expand(input);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
    const areas = result.manifest.checks.filter((c) => c.id === "area-matches-its-label");
    assert.ok(areas.length >= 1 && areas.every((c) => c.status === "pass"), JSON.stringify(areas));
  });
});

test("the area check reads the polygon: a wrong probability in the region would fail it", async () => {
  const spec = expand({ kind: "normal", mean: 70, sd: 5, event: { between: [60, 75] } });
  const ok = await render(spec, { maxPasses: 2, raster: false });
  assert.ok(ok.manifest.checks.some((c) => c.id === "area-matches-its-label" && c.status === "pass"));
  const label = blocksOf(spec).find((b) => b.annotates === "region-0")!;
  label.label = "P = 0,5000";
  const bad = await render(spec, { maxPasses: 2, raster: false });
  assert.ok(bad.manifest.checks.some((c) => c.id === "area-matches-its-label" && c.status === "fail"));
});

test("the discrete area check reads the outline: a wrong sum would fail it", async () => {
  const spec = expand({ kind: "binomial", n: 10, p: 0.3, event: { equals: 3 } });
  const label = blocksOf(spec).find((b) => b.annotates === "event-region")!;
  label.label = "P = 0,3000";
  const bad = await render(spec, { maxPasses: 2, raster: false });
  assert.ok(bad.manifest.checks.some((c) => c.id === "area-matches-its-label" && c.status === "fail"));
});

test("the locale changes the marks, not the numbers", () => {
  const pt = expand({ kind: "normal", event: { above: 1.96 } });
  const en = expand({ kind: "normal", event: { above: 1.96 }, locale: "en" });
  assert.ok(blocksOf(pt).some((b) => b.label === "P = 0,0250"));
  assert.ok(blocksOf(en).some((b) => b.label === "P = 0.0250"));
});

test("a title is derived from the law and the event when none is given", () => {
  assert.equal(expand({ kind: "normal", mean: 70, sd: 5, event: { between: [60, 75] } }).title, "X ~ N(70; 5²): P(60 < X < 75) = 0,8186");
  assert.equal(expand({ kind: "binomial", n: 10, p: 0.3, event: { equals: 3 } }).title, "X ~ B(10; 0,3): P(X = 3) = 0,2668");
  assert.equal(expand({ kind: "normal", event: { above: 1 }, title: "meu título" }).title, "meu título");
});
