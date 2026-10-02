/**
 * acid-base: titration curves, species-distribution diagrams and the pH scale.
 *
 * The numbers are the point, so most of these are hand-checked chemistry, not
 * round trips: a 0,1 M acetic acid has [H⁺] = 1,34·10⁻³ and pH 2,873; its
 * half-equivalence point is at pH = pKa; its salt at equivalence is a 0,05 M
 * base with Kb = Kw/Ka, [OH⁻] = √(Kb·c) and pH 8,72. The curve is then held to
 * an INDEPENDENT charge balance written out in this file for the monoprotic
 * case -- the preset solves the general one -- and the drawn figure is held
 * to what it prints: every marked point is declared to lie on the curve and
 * `feature-on-its-curve` measures that.
 *
 * The preset is not registered yet, so it is expanded directly and rendered
 * through `render` (see tests/linear-map.test.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  KW,
  defaultSpecies,
  equivalenceVolume,
  expandAcidBase,
  indicatorSuits,
  phFromH,
  phFromOH,
  solvePH,
  speciesFractions,
  titrationMarks,
  titrationPH,
  validateAcidBaseInput,
} from "../src/presets/acid-base/preset.ts";
import type { TitrationModel } from "../src/presets/acid-base/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, FigureSpec, Mark, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/acid-base/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

const acetic: TitrationModel = { side: "acid", strong: false, pKas: [4.74], n: 1, c: 0.1, volume: 25, titrantC: 0.1, name: "CH₃COOH", titrantName: "NaOH" };
const hcl: TitrationModel = { side: "acid", strong: true, pKas: [], n: 1, c: 0.1, volume: 25, titrantC: 0.1, name: "HCl", titrantName: "NaOH" };
const ammonia: TitrationModel = { side: "base", strong: false, pKas: [14 - 4.75], n: 1, c: 0.1, volume: 25, titrantC: 0.1, name: "NH₃", titrantName: "HCl" };
const naoh: TitrationModel = { side: "base", strong: true, pKas: [], n: 1, c: 0.1, volume: 25, titrantC: 0.1, name: "NaOH", titrantName: "HCl" };
const phosphoric: TitrationModel = { side: "acid", strong: false, pKas: [2.15, 7.2, 12.35], n: 3, c: 0.1, volume: 25, titrantC: 0.1, name: "H₃PO₄", titrantName: "NaOH" };

const scene = (spec: FigureSpec): Scene => spec.root as Scene;
const blocks = (spec: FigureSpec): Block[] => scene(spec).children.filter((c): c is Block => "label" in c);
const marks = (spec: FigureSpec): Mark[] => scene(spec).marks ?? [];
const texts = (spec: FigureSpec): string[] => blocks(spec).map((b) => b.label ?? "");

/**
 * Read the plane back from what was DRAWN: the two axis arrows start at the origin and end one arrow-head past the last
 * tick (16px), so the pixels per unit follow from their lengths and the ranges alone.
 */
function planeFrom(spec: FigureSpec, x: [number, number], y: [number, number]): { px: (V: number, pH: number) => { x: number; y: number }; unit: (p: { x: number; y: number }) => { x: number; pH: number } } {
  const cs = scene(spec).connectors ?? [];
  const ax = cs.find((c) => c.id === "plane-axis-x")!;
  const ay = cs.find((c) => c.id === "plane-axis-y")!;
  const from = ax.from as { x: number; y: number };
  const xUnit = ((ax.to as { x: number }).x - 16 - from.x) / (x[1] - x[0]);
  const yUnit = (from.y - ((ay.to as { y: number }).y + 16)) / (y[1] - y[0]);
  const originX = from.x - x[0] * xUnit;
  const originY = from.y + y[0] * yUnit;
  return {
    px: (V, pH) => ({ x: originX + V * xUnit, y: originY - pH * yUnit }),
    unit: (p) => ({ x: (p.x - originX) / xUnit, pH: (originY - p.y) / yUnit }),
  };
}

// ---- the equilibrium ---------------------------------------------------------------------------

test("species fractions sum to 1 at every pH, for one, two and three steps", () => {
  for (const pKas of [[4.74], [6.35, 10.33], [2.15, 7.2, 12.35]]) {
    for (let pH = -1; pH <= 15; pH += 0.25) {
      const a = speciesFractions(pKas, pH);
      assert.equal(a.length, pKas.length + 1);
      assert.ok(near(a.reduce((x, y) => x + y, 0), 1, 1e-12), `${pKas} at pH ${pH}`);
      assert.ok(a.every((x) => x >= 0 && x <= 1));
    }
  }
});

test("adjacent species cross at exactly pH = pKa, and at 0,5 each when the steps are far apart", () => {
  const pKas = [6.35, 10.33];
  const a1 = speciesFractions(pKas, 6.35);
  assert.ok(near(a1[0]!, a1[1]!, 1e-12));
  assert.ok(near(a1[0]!, 0.5, 0.002), `H₂CO₃ = HCO₃⁻ = ${a1[0]}`);
  const a2 = speciesFractions(pKas, 10.33);
  assert.ok(near(a2[1]!, a2[2]!, 1e-12));
  assert.ok(near(a2[1]!, 0.5, 0.002));
  // a monoprotic acid is exactly half dissociated at pH = pKa
  assert.ok(near(speciesFractions([4.74], 4.74)[0]!, 0.5, 1e-12));
  // two steps only a unit apart still cross where they say (the neighbour shifts alpha, not the crossing)
  const close = speciesFractions([3, 4], 3);
  assert.ok(near(close[0]!, close[1]!, 1e-12) && close[0]! < 0.5);
});

test("carbonic acid at pH 7,4 (blood): mostly bicarbonate, fractions from the standard formula", () => {
  const h = 10 ** -7.4;
  const K1 = 10 ** -6.35;
  const K2 = 10 ** -10.33;
  const denom = h * h + K1 * h + K1 * K2;
  const a = speciesFractions([6.35, 10.33], 7.4);
  assert.ok(near(a[0]!, (h * h) / denom, 1e-12));
  assert.ok(near(a[1]!, (K1 * h) / denom, 1e-12));
  assert.ok(near(a[2]!, (K1 * K2) / denom, 1e-12));
  assert.ok(near(a[1]!, 0.917, 0.001));
});

test("solvePH finds the root of a monotone balance, at any magnitude", () => {
  assert.ok(near(solvePH((h) => h - 1e-3), 3, 1e-9));
  assert.ok(near(solvePH((h) => h - 1e-11), 11, 1e-9));
  assert.ok(near(solvePH((h) => h - KW / h), 7, 1e-9));
});

test("pH from a concentration: [H⁺] = 1·10⁻³ is pH 3, [OH⁻] = 1·10⁻⁴ is pH 10", () => {
  assert.ok(near(phFromH(1e-3), 3, 1e-12));
  assert.ok(near(phFromH(2.5e-5), 4.6021, 1e-4));
  assert.ok(near(phFromOH(1e-4), 10, 1e-12));
  assert.ok(near(phFromOH(1e-1), 13, 1e-12));
});

// ---- titrations, hand-checked ------------------------------------------------------------------

test("25 mL of 0,1 M CH₃COOH (pKa 4,74) with 0,1 M NaOH: V_eq 25 mL, pH₀ 2,87, half 4,74, equivalence 8,72", () => {
  assert.equal(equivalenceVolume(acetic), 25);
  const m = titrationMarks(acetic);
  // [H⁺]² = Ka (c − [H⁺]): 1,340·10⁻³, pH 2,873 (the usual shortcut ½(pKa + pc) gives 2,87)
  assert.ok(near(m.initial, 2.873, 0.002), `pH₀ = ${m.initial}`);
  assert.equal(m.half.length, 1);
  assert.equal(m.half[0]!.volume, 12.5);
  assert.ok(near(m.half[0]!.pH, 4.74, 0.01), `half-equivalence pH = ${m.half[0]!.pH}`);
  assert.equal(m.eq.length, 1);
  assert.equal(m.eq[0]!.volume, 25);
  // Kb = Kw/Ka = 5,5·10⁻¹⁰, c = 0,05: [OH⁻] = 5,24·10⁻⁶, pOH 5,28
  assert.ok(near(m.eq[0]!.pH, 8.7194, 0.001), `equivalence pH = ${m.eq[0]!.pH}`);
  assert.equal(m.eq[0]!.visible, true);
  assert.equal(m.vMax, 50);
});

test("25 mL of 0,1 M HCl with 0,1 M NaOH: pH 1,00 at the start and exactly 7,00 at equivalence", () => {
  const m = titrationMarks(hcl);
  assert.ok(near(m.initial, 1, 1e-9));
  assert.ok(near(m.eq[0]!.pH, 7, 1e-9), `${m.eq[0]!.pH}`);
  assert.equal(m.half.length, 0, "a strong acid has no half-equivalence pKa");
  // 0,1 % before equivalence: 0,025 mL short of 25 mL -> [H⁺] = 5·10⁻⁵ M, pH 4,30; 0,1 % past: pH 9,70
  assert.ok(near(m.eq[0]!.jump.lo, 4.30, 0.01), `${m.eq[0]!.jump.lo}`);
  assert.ok(near(m.eq[0]!.jump.hi, 9.70, 0.01), `${m.eq[0]!.jump.hi}`);
});

test("0,1 M NH₃ (pKb 4,75) with 0,1 M HCl: pH₀ 11,12, half 9,25 = 14 − pKb, equivalence 5,28", () => {
  const m = titrationMarks(ammonia);
  assert.ok(near(m.initial, 11.125, 0.003), `${m.initial}`);
  assert.ok(near(m.half[0]!.pH, 9.25, 0.01), `${m.half[0]!.pH}`);
  // NH₄⁺ (Ka = 10^-9,25) at 0,05 M: [H⁺] = √(Ka·c) = 5,3·10⁻⁶
  assert.ok(near(m.eq[0]!.pH, 5.276, 0.002), `${m.eq[0]!.pH}`);
  assert.ok(m.eq[0]!.pH < 7, "the salt of a weak base is acidic");
  // the curve falls
  assert.ok(titrationPH(ammonia, 30) < titrationPH(ammonia, 10));
});

test("0,1 M NaOH with 0,1 M HCl: pH 13 to 7 to 1, the mirror of the acid case", () => {
  const m = titrationMarks(naoh);
  assert.ok(near(m.initial, 13, 1e-9));
  assert.ok(near(m.eq[0]!.pH, 7, 1e-9));
  // 50 mL of HCl: 2,5 mmol in excess in 75 mL is 0,0333 M, pH 1,477
  assert.ok(near(titrationPH(naoh, 50), -Math.log10(2.5 / 75), 1e-6), `${titrationPH(naoh, 50)}`);
});

test("a different concentration moves V_eq with the arithmetic c·V/c′", () => {
  const m: TitrationModel = { ...acetic, c: 0.2, titrantC: 0.15 };
  assert.ok(near(equivalenceVolume(m), (0.2 * 25) / 0.15, 1e-12));
  const marks = titrationMarks(m);
  assert.ok(near(marks.eq[0]!.volume, 33.3333333, 1e-6));
  // the half-equivalence point is still half of V_eq, and still at pKa (a little off: dilution and water move it, but not 0,05)
  assert.ok(near(marks.half[0]!.volume, marks.eq[0]!.volume / 2, 1e-12));
  assert.ok(near(marks.half[0]!.pH, 4.74, 0.05));
});

test("the curve satisfies an INDEPENDENT charge balance, and rises monotonically", () => {
  // [Na⁺] + [H⁺] = [OH⁻] + c_t·Ka/(Ka + [H⁺]), written out here for one weak acid
  const Ka = 10 ** -4.74;
  let previous = -Infinity;
  for (let v = 0; v <= 50; v += 0.5) {
    const pH = titrationPH(acetic, v);
    const h = 10 ** -pH;
    const total = 25 + v;
    const ct = (0.1 * 25) / total;
    const na = (0.1 * v) / total;
    const residual = na + h - KW / h - (ct * Ka) / (Ka + h);
    assert.ok(Math.abs(residual) < 1e-11 * Math.max(1, ct), `V = ${v}: residual ${residual}`);
    assert.ok(pH > previous, `pH does not rise at V = ${v}`);
    previous = pH;
  }
});

test("phosphoric acid: three half-equivalence points near the pKa, two visible equivalence points, the third lost to water", () => {
  const m = titrationMarks(phosphoric);
  assert.equal(m.eq.length, 3);
  assert.deepEqual(m.eq.map((e) => e.visible), [true, true, false]);
  assert.ok(m.eq[0]!.pH > 4.5 && m.eq[0]!.pH < 4.9, `${m.eq[0]!.pH}`); // ≈ (pKa1 + pKa2)/2 = 4,68
  assert.ok(m.eq[1]!.pH > 9.4 && m.eq[1]!.pH < 10, `${m.eq[1]!.pH}`); // ≈ (pKa2 + pKa3)/2 = 9,78
  assert.equal(m.eq[2]!.volume, 75);
  // the first two half-equivalence points read their pKa; the third does not (water and dilution), so it is not drawn
  assert.deepEqual(m.half.map((h) => h.k), [1, 2]);
  assert.ok(near(m.half[1]!.pH, 7.2, 0.02));
  assert.equal(m.vMax, 87.5);
});

test("the indicator verdict: phenolphthalein for acetic acid, not methyl orange", () => {
  const m = titrationMarks(acetic);
  const jump = m.eq[0]!.jump;
  assert.equal(indicatorSuits({ name: "fenolftaleína", from: 8.2, to: 10 }, jump), true);
  assert.equal(indicatorSuits({ name: "alaranjado de metila", from: 3.1, to: 4.4 }, jump), false);
  assert.equal(indicatorSuits({ name: "azul de bromotimol", from: 6, to: 7.6 }, jump), false);
});

// ---- the drawn figures ---------------------------------------------------------------------------

const acetic25 = {
  preset: "acid-base",
  kind: "titration",
  analyte: { type: "acid", strength: "weak", name: "CH₃COOH", pKa: 4.74, concentration: 0.1, volume: 25 },
  titrant: { concentration: 0.1, name: "NaOH" },
  indicators: ["fenolftaleína"],
};

test("the titration prints what was computed, through the pt-BR formatter", () => {
  const spec = expandAcidBase(acetic25 as never);
  const all = texts(spec).join("\n") + "\n" + (spec.readings?.lines ?? []).map((l) => l.runs.map((r) => r.text).join("")).join("\n");
  // sub- and superscripts are runs; the plain text a check reads has none of the marks
  assert.match(all, /pH0 = 2,87/);
  assert.match(all, /½Veq: pH = 4,74 = pKa/);
  assert.match(all, /Veq = 25 mL; pH = 8,72/);
  assert.match(all, /fenolftaleína \(8,2–10,0\)/);
  assert.match(all, /serve/);
  assert.ok(!/\d\.\d/.test(texts(spec).join(" ")), "no decimal point in a pt-BR figure");
  const en = expandAcidBase({ ...acetic25, locale: "en" } as never);
  assert.match(texts(en).join("\n"), /pH0 = 2\.87/);
});

test("the marked points are declared to lie on the curve, and the check measures it", async () => {
  const spec = expandAcidBase(acetic25 as never);
  const claiming = marks(spec).filter((m) => (m.on ?? []).includes("curva"));
  assert.deepEqual(claiming.map((m) => m.id).sort(), ["point-equivalence-1", "point-half-1", "point-initial"]);
  const result = await render(spec, { maxPasses: 3, raster: false });
  const check = result.manifest.checks.find((c) => c.id === "feature-on-its-curve")!;
  assert.equal(check.status, "pass");
  assert.equal(check.examined, 3);
});

test("a marked point is at the pixel the equilibrium gives: the equivalence dot is at (25 mL, pH 8,72) on the drawn axes", () => {
  const spec = expandAcidBase(acetic25 as never);
  const dot = marks(spec).find((m) => m.id === "point-equivalence-1")!;
  const centre = (dot.segments[0] as { centre: { x: number; y: number } }).centre;
  const read = planeFrom(spec, [0, 50], [0, 14]).unit(centre);
  assert.ok(near(read.x, 25, 1e-9), `V = ${read.x}`);
  assert.ok(near(read.pH, titrationMarks(acetic).eq[0]!.pH, 1e-9), `pH = ${read.pH}`);
});

test("the curve is drawn dense at the jump: no chord is more than a few pixels", () => {
  const spec = expandAcidBase(acetic25 as never);
  const curve = marks(spec).find((m) => m.id === "titration-curve")!;
  const pts = [curve.from as { x: number; y: number }, ...curve.segments.map((s) => (s as { line: { x: number; y: number } }).line)];
  assert.ok(pts.length > 60, `${pts.length} vertices`);
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    assert.ok(d < 16, `chord ${i} is ${d}px`);
  }
});

test("answers:false: the curve, axes and indicator band stay; every value, point, guide and the panel go", async () => {
  const solution = expandAcidBase(acetic25 as never);
  const question = expandAcidBase({ ...acetic25, answers: false } as never);
  const ids = (s: FigureSpec): string[] => marks(s).map((m) => m.id);
  for (const id of ["titration-curve", "indicator-band-0"]) assert.ok(ids(question).includes(id), `the given ${id} stays`);
  for (const id of ["point-initial", "point-half-1", "point-equivalence-1", "drop-half-1-x", "drop-equivalence-1-x"]) {
    assert.ok(ids(solution).includes(id), `the solution draws ${id}`);
    assert.ok(!ids(question).includes(id), `the question does not draw ${id}`);
  }
  assert.equal(question.readings, undefined, "no reading panel");
  assert.ok(!blocks(question).some((b) => (b.id ?? "").startsWith("panel-")));
  const q = texts(question).join("\n");
  for (const gone of ["8,72", "4,74", "2,87", "Veq", "serve", "pKa"]) assert.ok(!q.includes(gone), `no "${gone}" in the question`);
  for (const kept of ["fenolftaleína (8,2–10,0)", "CH₃COOH", "V(NaOH) / mL", "pH"]) assert.ok(q.includes(kept), `"${kept}" is given`);
  const result = await render(question, { maxPasses: 3, raster: false });
  for (const c of result.manifest.checks) assert.ok(c.status === "pass" || c.status === "not-applicable", `${c.id}: ${c.detail}`);
});

test("the axis is widened to a whole tick and volumeMax is honoured", () => {
  const spec = expandAcidBase({ ...acetic25, volumeMax: 40 } as never);
  const t = texts(spec);
  assert.ok(t.includes("40") && !t.includes("45") && !t.includes("50"), t.join(" "));
  // and the end of the volume axis is where the curve stops: V = 40 is the last x of the drawn curve
  const curve = marks(spec).find((m) => m.id === "titration-curve")!;
  const last = (curve.segments[curve.segments.length - 1] as { line: { x: number; y: number } }).line;
  assert.ok(near(planeFrom(spec, [0, 40], [0, 14]).unit(last).x, 40, 1e-9));
});

// ---- the distribution diagram ------------------------------------------------------------------------

const carbonic = { preset: "acid-base", kind: "distribution", name: "ácido carbônico", pKa: [6.35, 10.33], species: ["H₂CO₃", "HCO₃⁻", "CO₃²⁻"], pH: 7.4 };

test("distribution: each curve vertex is alpha at that pH, the three curves sum to 1 column by column, crossings are marked on both curves", () => {
  const spec = expandAcidBase(carbonic as never);
  const plane = planeFrom(spec, [0, 14], [0, 1.12]);
  const decode = (p: { x: number; y: number }): { pH: number; a: number } => ({ pH: plane.unit(p).x, a: plane.unit(p).pH });
  const curves = [0, 1, 2].map((j) => {
    const m = marks(spec).find((x) => x.id === `curve-${j}`)!;
    return [m.from as { x: number; y: number }, ...m.segments.map((s) => (s as { line: { x: number; y: number } }).line)].map(decode);
  });
  assert.equal(curves[0]!.length, curves[1]!.length);
  curves[0]!.forEach((p, i) => {
    const expected = speciesFractions([6.35, 10.33], p.pH);
    for (const j of [0, 1, 2]) assert.ok(near(curves[j]![i]!.a, expected[j]!, 1e-9), `curve ${j} at pH ${p.pH}`);
    assert.ok(near(curves[0]![i]!.a + curves[1]![i]!.a + curves[2]![i]!.a, 1, 1e-9));
  });
  const crossings = marks(spec).filter((m) => m.id.startsWith("point-pka-"));
  assert.deepEqual(crossings.map((m) => m.on), [["alpha-0", "alpha-1"], ["alpha-1", "alpha-2"]]);
  // the crossing dots sit at pH = pKa
  crossings.forEach((m, i) => {
    const c = (m.segments[0] as { centre: { x: number; y: number } }).centre;
    assert.ok(near(decode(c).pH, [6.35, 10.33][i]!, 1e-9));
    assert.ok(near(decode(c).a, 0.5, 0.002));
  });
});

test("distribution prints the fractions at the chosen pH, from the same formula", () => {
  const spec = expandAcidBase(carbonic as never);
  const lines = (spec.readings?.lines ?? []).map((l) => l.runs.map((r) => r.text).join(""));
  const line = lines.find((l) => l.startsWith("pH = 7,4"))!;
  assert.ok(line !== undefined, lines.join(" | "));
  assert.match(line, /α\(H₂CO₃\) = 0,082/);
  assert.match(line, /α\(HCO₃⁻\) = 0,917/);
  assert.match(line, /α\(CO₃²⁻\) = 0,001/);
  assert.match(line, /Σα = 1/);
  assert.ok(lines.some((l) => l.includes("pKa1 = 6,35")));
});

test("distribution answers:false keeps curves, names and the given pH line; hides crossings, drops, dots, fractions and the panel", async () => {
  const q = expandAcidBase({ ...carbonic, answers: false } as never);
  const ids = marks(q).map((m) => m.id);
  for (const id of ["curve-0", "curve-1", "curve-2", "ph-line"]) assert.ok(ids.includes(id), id);
  assert.ok(!ids.some((id) => id.startsWith("point-") || id.startsWith("drop-")), ids.join(","));
  assert.equal(q.readings, undefined);
  const t = texts(q).join("\n");
  for (const gone of ["6,35", "10,33", "pKa"]) assert.ok(!t.includes(gone), `no ${gone}`);
  for (const kept of ["H₂CO₃", "HCO₃⁻", "CO₃²⁻", "pH = 7,4"]) assert.ok(t.includes(kept), kept);
  const r = await render(q, { maxPasses: 3, raster: false });
  for (const c of r.manifest.checks) assert.ok(c.status === "pass" || c.status === "not-applicable", `${c.id}: ${c.detail}`);
});

test("default species names for an anonymous acid", () => {
  assert.deepEqual(defaultSpecies(1), ["HA", "A⁻"]);
  assert.deepEqual(defaultSpecies(2), ["H₂A", "HA⁻", "A²⁻"]);
  assert.deepEqual(defaultSpecies(3), ["H₃A", "H₂A⁻", "HA²⁻", "A³⁻"]);
});

// ---- the pH scale -------------------------------------------------------------------------------------

const scale = {
  preset: "acid-base",
  kind: "ph-scale",
  substances: [{ name: "suco de limão", pH: 2.2 }, { name: "solução A", H: 1e-3 }, { name: "solução B", OH: 1e-4 }],
  indicators: ["fenolftaleína"],
};

test("ph-scale: a substance given by [H⁺] = 1·10⁻³ is placed at pH 3, by [OH⁻] = 1·10⁻⁴ at pH 10, with the arithmetic printed", () => {
  const spec = expandAcidBase(scale as never);
  const lines = (spec.readings?.lines ?? []).map((l) => l.runs.map((r) => r.text).join(""));
  const a = lines.find((l) => l.startsWith("solução A"))!;
  assert.match(a, /\[H⁺\] = 10−3 mol\/L → pH = −log\(10−3\) = 3,00/);
  const b = lines.find((l) => l.startsWith("solução B"))!;
  assert.match(b, /pOH = −log\(10−4\) = 4,00 → pH = 14 − 4,00 = 10,00/);
  const t = texts(spec);
  assert.ok(t.includes("pH 3") && t.includes("pH 10") && t.includes("pH 2,2"), t.join("|"));
  // solução A sits at x(pH 3): the pole's x is the bar's left edge + 3/14 of its width
  const bar = blocks(spec).find((b2) => b2.id === "ph-bar")!;
  const pole = marks(spec).find((m) => m.id.startsWith("leader-") && Math.abs((m.from as { x: number }).x - (bar.x! + (3 / 14) * bar.width!)) < 1e-6);
  assert.ok(pole !== undefined, "a pole at pH 3");
});

test("ph-scale: the colour bar is one gradient from the pH stops, acid warm to base cool, and every region carries its word", () => {
  const spec = expandAcidBase(scale as never);
  const bar = blocks(spec).find((b) => b.id === "ph-bar")!;
  const fill = bar.fill as { kind: string; stops: { offset: number; color: string }[] };
  assert.equal(fill.kind, "linear");
  assert.equal(fill.stops[0]!.offset, 0);
  assert.equal(fill.stops[fill.stops.length - 1]!.offset, 1);
  const t = texts(spec);
  for (const w of ["ÁCIDO", "NEUTRO", "BÁSICO"]) assert.ok(t.includes(w), w);
  for (let k = 0; k <= 14; k += 1) assert.ok(t.includes(String(k)), `number ${k}`);
});

test("ph-scale answers:false: the scale and the substances given by pH stay; a concentration's computed pH is not placed, and the panel goes", async () => {
  const q = expandAcidBase({ ...scale, answers: false } as never);
  const t = texts(q).join("\n");
  assert.ok(t.includes("suco de limão") && t.includes("pH 2,2"));
  assert.ok(!t.includes("solução A") && !t.includes("solução B"), "computed placements are hidden");
  assert.equal(q.readings, undefined);
  assert.ok(marks(q).some((m) => m.id === "indicator-range-0"), "the indicator range is given");
  const r = await render(q, { maxPasses: 3, raster: false });
  for (const c of r.manifest.checks) assert.ok(c.status === "pass" || c.status === "not-applicable", `${c.id}: ${c.detail}`);
});

test("ph-scale: two substances at one pH share a pole, one name to a line", () => {
  const spec = expandAcidBase({ preset: "acid-base", kind: "ph-scale", substances: [{ name: "água pura", pH: 7 }, { name: "leite fresco", H: 1e-7 }] } as never);
  const poles = marks(spec).filter((m) => m.id.startsWith("leader-"));
  assert.equal(poles.length, 1);
  const t = texts(spec);
  assert.ok(t.includes("água pura") && t.includes("leite fresco") && t.includes("pH 7"));
});

// ---- refusals ----------------------------------------------------------------------------------------------

test("refusals: every input mistake names the field", () => {
  const bad = (input: Record<string, unknown>, match: RegExp): void => assert.throws(() => validateAcidBaseInput(input), (e: unknown) => e instanceof SpecError && match.test(e.message), JSON.stringify(input).slice(0, 80));
  const base = acetic25 as unknown as Record<string, unknown>;
  const analyte = (patch: Record<string, unknown>): Record<string, unknown> => ({ ...base, analyte: { ...(base.analyte as object), ...patch } });
  bad({ ...base, kind: "titre" }, /kind must be one of/);
  bad({ ...base, colour: "red" }, /colour is not a field/);
  bad(analyte({ pKa: undefined }), /needs exactly one of pKa or Ka/);
  bad(analyte({ Ka: 1.8e-5 }), /exactly one of pKa or Ka; got pKa and Ka/);
  bad(analyte({ pKb: 4.75, pKa: undefined }), /weak acid is given by pKa or Ka/);
  bad(analyte({ pKa: [7.2, 2.15] }), /must increase/);
  bad(analyte({ concentration: 0 }), /concentration must be positive/);
  bad(analyte({ strength: "strong" }), /strong acid has no pKa/);
  bad(analyte({ type: "sour" }), /type must be one of/);
  bad({ ...base, indicators: ["tinta"] }, /not a known indicator/);
  bad({ ...base, volumeMax: 20 }, /volumeMax .* must be past the first equivalence point/);
  bad({ preset: "acid-base", kind: "distribution", pKa: [6.35, 10.33], species: ["H₂CO₃", "HCO₃⁻"] }, /needs 3 names/);
  bad({ preset: "acid-base", kind: "distribution", pKa: [1, 2, 3, 4] }, /at most three/);
  bad({ preset: "acid-base", kind: "distribution", pKa: 4.74, pH: 15 }, /must lie on the axis/);
  bad({ preset: "acid-base", kind: "ph-scale", substances: [{ name: "x", pH: 3, H: 1e-3 }] }, /exactly one of pH/);
  bad({ preset: "acid-base", kind: "ph-scale", substances: [{ name: "x", H: 10 }] }, /off the 0 to 14 scale/);
  bad({ preset: "acid-base", kind: "ph-scale", substances: [{ name: "x", OH: -1 }] }, /must be positive/);
  bad({ preset: "acid-base", kind: "ph-scale", substances: [] }, /must not be empty/);
});

// ---- every fixture: renders, and every check passes ----------------------------------------------------------

test("there are at least six fixtures, covering the required kinds", () => {
  assert.ok(fixtures.length >= 6, `${fixtures.length} fixtures`);
  const names = fixtures.join(" ");
  for (const needle of ["titration-weak-acid", "titration-strong-acid", "titration-weak-base", "distribution-carbonic", "distribution-phosphoric", "ph-scale"]) {
    assert.ok(names.includes(needle), `no ${needle} fixture`);
  }
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "acid-base");
    const { preset: _preset, ...input } = raw;
    validateAcidBaseInput(input);
    const spec = expandAcidBase(input as never);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
  });
});
