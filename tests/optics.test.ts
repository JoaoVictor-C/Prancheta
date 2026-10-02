/**
 * optics: lenses, mirrors and the plane interface. The image is computed
 * (Gauss) and the rays are constructed from their own rules, so these tests
 * do not trust the preset's numbers a second time: they read the DRAWN marks
 * back, the way a reviewer with a ruler would, and check that the lines
 * really meet at the drawn image and that the angles drawn are the angles
 * stated.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  criticalAngle,
  degreesText,
  expandOptics,
  gauss,
  natureOf,
  natureText,
  snell,
  validateOpticsInput,
  written,
} from "../src/presets/optics/preset.ts";
import type { OpticsInput } from "../src/presets/optics/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Connector, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/optics/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

type Spec = ReturnType<typeof expandOptics>;
const marksOf = (spec: Spec): Mark[] => (spec.root as Scene).marks ?? [];
const blocksOf = (spec: Spec): Block[] => (spec.root as Scene).children as Block[];
const connectorsOf = (spec: Spec): Connector[] => ((spec.root as Scene).connectors ?? []) as Connector[];
const markPts = (m: Mark): Point[] => [m.from as Point, ...m.segments.map((s) => ("line" in s ? (s.line as Point) : (s.arc as Point)))];
const mark = (spec: Spec, id: string): Mark | undefined => marksOf(spec).find((m) => m.id === id);
const connector = (spec: Spec, id: string): Connector | undefined => connectorsOf(spec).find((c) => c.id === id);
const labels = (spec: Spec): string[] => blocksOf(spec).map((b) => (b.label ?? "").replace(/ {2,}/g, " "));

/** The intersection of the lines through a→b and c→d, or null when parallel. */
function meet(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

// ---- the physics ----------------------------------------------------------------------

test("Gauss: converging lens beyond 2f -- p = 30, f = 10 gives p′ = 15 and A = −0,5", () => {
  const g = gauss(10, 30);
  assert.ok(!g.improper);
  if (!g.improper) {
    assert.ok(near(g.pPrime, 15));
    assert.ok(near(g.A, -0.5));
    assert.deepEqual(natureOf(g), { real: true, upright: false, size: "menor" });
  }
});

test("Gauss: a converging lens as a magnifier -- p < f gives a virtual, upright, larger image", () => {
  const g = gauss(10, 6);
  assert.ok(!g.improper);
  if (!g.improper) {
    assert.ok(near(g.pPrime, -15));
    assert.ok(near(g.A, 2.5));
    assert.equal(natureText(natureOf(g)), "imagem virtual, direita, maior");
  }
});

test("Gauss: a diverging lens / convex mirror always gives a virtual, upright, smaller image", () => {
  for (const p of [3, 12, 24, 100]) {
    const g = gauss(-12, p);
    assert.ok(!g.improper);
    if (!g.improper) {
      assert.equal(natureText(natureOf(g)), "imagem virtual, direita, menor", `p = ${p}`);
      assert.ok(g.pPrime < 0 && g.pPrime > -12);
    }
  }
});

test("Gauss: 1/f = 1/p + 1/p′ and A = −p′/p hold for a sweep of (f, p)", () => {
  for (const f of [4, 10, -7, -25]) {
    for (const p of [1.5, 9, 10.4, 30, 77]) {
      const g = gauss(f, p);
      if (g.improper) continue;
      assert.ok(near(1 / f, 1 / p + 1 / g.pPrime, 1e-9), `f = ${f}, p = ${p}`);
      assert.ok(near(g.A, -g.pPrime / p, 1e-9));
    }
  }
});

test("an object AT the focus has no image: improper, not a division by zero", () => {
  assert.equal(gauss(10, 10).improper, true);
  assert.equal(gauss(10, 10 + 1e-12).improper, true);
  assert.equal(gauss(-10, 10).improper, false);
});

test("the size word: maior, menor, igual", () => {
  assert.equal(natureOf({ pPrime: 20, A: -1 }).size, "igual");
  assert.equal(natureOf({ pPrime: -3, A: 1.5 }).size, "maior");
  assert.equal(natureOf({ pPrime: -3, A: 0.4 }).size, "menor");
});

test("Snell: ar → água at 30° gives 22,08°; the reverse path recovers 30°", () => {
  const a = snell(1, 1.33, 30);
  assert.ok(!a.total);
  if (!a.total) {
    assert.ok(near(a.theta2, (Math.asin(0.5 / 1.33) * 180) / Math.PI, 1e-9));
    assert.ok(Math.abs(a.theta2 - 22.08) < 0.01);
    const back = snell(1.33, 1, a.theta2);
    assert.ok(!back.total);
    if (!back.total) assert.ok(near(back.theta2, 30, 1e-9));
  }
});

test("total internal reflection: água → ar past θc = 48,75°", () => {
  assert.ok(near(criticalAngle(1.33, 1)!, 48.7535, 1e-3));
  assert.equal(criticalAngle(1, 1.33), null);
  assert.equal(snell(1.33, 1, 60).total, true);
  assert.equal(snell(1.33, 1, 45).total, false);
  assert.equal(snell(1.33, 1, criticalAngle(1.33, 1)! - 0.01).total, false);
});

test("degrees print exact when they are, else one decimal, in pt-BR", () => {
  assert.deepEqual(degreesText(30), { text: "30", exact: true });
  assert.deepEqual(degreesText(22.0839), { text: "22,1", exact: false });
  assert.deepEqual(degreesText(30 + 1e-9), { text: "30", exact: true });
  assert.notEqual(degreesText(29.98).exact, true);
  assert.equal(written(40 / 3).text, "13,33");
  assert.equal(written(40 / 3).exact, false);
  assert.deepEqual(written(0.375), { text: "0,375", exact: true });
  assert.equal(written(15).exact, true);
});

// ---- input is refused with a message that names the path ----------------------------------

const refuses = (input: unknown, pattern: RegExp): void =>
  assert.throws(() => validateOpticsInput(input as Record<string, unknown>), (e: unknown) => e instanceof SpecError && pattern.test(e.message));

test("bad input is refused, naming what is wrong", () => {
  refuses({}, /kind is required/);
  refuses({ kind: "prism" }, /kind/);
  refuses({ kind: "lens", f: 10, p: 30 }, /lens is required/);
  refuses({ kind: "lens", lens: "converging", p: 30 }, /f.*required/);
  refuses({ kind: "lens", lens: "converging", f: -10, p: 30 }, /positive magnitude/);
  refuses({ kind: "lens", lens: "converging", f: 10, p: 0 }, /optics\.lens\.p must be a positive/);
  refuses({ kind: "lens", lens: "converging", f: 10, p: 30, o: -1 }, /optics\.lens\.o/);
  refuses({ kind: "lens", lens: "converging", f: 10, p: 30, rays: ["parallel"] }, /at least two/);
  refuses({ kind: "lens", lens: "converging", f: 10, p: 30, rays: ["parallel", "vertex"] }, /vertex/);
  refuses({ kind: "lens", lens: "converging", f: 10, p: 30, rays: ["parallel", "parallel"] }, /twice/);
  refuses({ kind: "lens", lens: "converging", f: 10, p: 30, colour: "red" }, /colour is not a field/);
  refuses({ kind: "mirror", mirror: "plane", f: 10, p: 30 }, /no focal length/);
  refuses({ kind: "mirror", mirror: "concave", p: 30 }, /f.*required/);
  refuses({ kind: "lens", lens: "converging", f: 10, p: 10.05 }, /too far/);
  refuses({ kind: "interface", n1: { name: "ar" }, n2: { name: "água" } }, /theta1 is required/);
  refuses({ kind: "interface", n1: { name: "ar" }, n2: { name: "água" }, theta1: 90 }, /\[0, 90\)/);
  refuses({ kind: "interface", n1: { name: "ar" }, n2: { name: "plasma" }, theta1: 30 }, /n2\.n is required/);
  refuses({ kind: "interface", n1: { name: "ar", n: 0.5 }, n2: { name: "água" }, theta1: 30 }, /≥ 1/);
});

// ---- decode the drawn lens / mirror ------------------------------------------------------------

type Decoded = {
  unit: number;
  axisY: number;
  elementX: number;
  objectX: number;
  objectTip: Point;
  imageBase: Point | null;
  imageTip: Point | null;
};

function decode(spec: Spec, o: number): Decoded {
  const axis = markPts(mark(spec, "axis")!);
  const obj = connector(spec, "object")!;
  const base = obj.from as Point;
  const tip = obj.to as Point;
  const unit = Math.abs(base.y - tip.y) / o;
  // The element's position on the axis: its own dot (V or O), whose mark starts a radius (3px) to the right of its centre.
  const dot = mark(spec, "V-dot") ?? mark(spec, "O-dot")!;
  const elementX = markPts(dot)[0]!.x - 3;
  const img = connector(spec, "image");
  return {
    unit,
    axisY: axis[0]!.y,
    elementX,
    objectX: base.x,
    objectTip: tip,
    imageBase: img === undefined ? null : (img.from as Point),
    imageTip: img === undefined ? null : (img.to as Point),
  };
}

/** The line that carries a ray AFTER the element, from what was drawn (its extension when virtual). */
function outgoingLine(spec: Spec, ray: string): [Point, Point] | null {
  const m = mark(spec, `${ray}-ext`) ?? mark(spec, `${ray}-out`);
  if (m === undefined) return null;
  const q = markPts(m);
  return [q[0]!, q[q.length - 1]!];
}

const lensMirrorFixtures = fixtures.filter((n) => /^(lens|mirror)/.test(n) && !n.includes("focus"));

for (const filename of lensMirrorFixtures) {
  test(`${filename}: the drawn rays meet at the drawn image tip, within a pixel`, () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    const { preset: _preset, ...input } = raw;
    const spec = expandOptics(input as unknown as OpticsInput);
    const o = Number((input as { o?: number }).o);
    const d = decode(spec, o);
    assert.ok(d.imageTip !== null, "an image is drawn");
    const rays = marksOf(spec).filter((m) => /^ray-[a-z0-9]+-(out|in)$/.test(m.id)).map((m) => m.id.replace(/-(out|in)$/, ""));
    const unique = [...new Set(rays)];
    assert.ok(unique.length >= 2, `${unique.length} rays drawn`);
    const lines = unique.map((r) => outgoingLine(spec, r)!).filter(Boolean);
    let compared = 0;
    for (let i = 0; i < lines.length; i += 1) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const x = meet(lines[i]![0], lines[i]![1], lines[j]![0], lines[j]![1]);
        if (x === null) continue;
        compared += 1;
        assert.ok(Math.hypot(x.x - d.imageTip!.x, x.y - d.imageTip!.y) <= 1, `${unique[i]} and ${unique[j]} meet ${Math.hypot(x.x - d.imageTip!.x, x.y - d.imageTip!.y).toFixed(2)}px from the image tip`);
      }
    }
    assert.ok(compared >= 1);
  });

  test(`${filename}: the image is where Gauss says, at the height A·o, in the units of the drawing`, () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    const { preset: _preset, ...input } = raw;
    const inp = input as { kind: string; lens?: string; mirror?: string; f?: number; p: number; o: number };
    const spec = expandOptics(inp as unknown as OpticsInput);
    const d = decode(spec, inp.o);
    const plane = inp.mirror === "plane";
    const f = plane ? Infinity : (inp.lens === "converging" || inp.mirror === "concave" ? 1 : -1) * inp.f!;
    const g = plane ? { pPrime: -inp.p, A: 1 } : (gauss(f, inp.p) as { pPrime: number; A: number });
    // object distance drawn
    assert.ok(near((d.elementX - d.objectX) / d.unit, inp.p, 0.02), "p is drawn to scale");
    const sideSign = inp.kind === "lens" ? 1 : -1; // real images: right of a lens, left of a mirror
    assert.ok(near(((d.imageTip!.x - d.elementX) / d.unit) * sideSign, g.pPrime, 0.05), "p′ is drawn to scale");
    assert.ok(near((d.axisY - d.imageTip!.y) / d.unit, g.A * inp.o, 0.05), "the image height is A·o");
    assert.ok(near(d.imageBase!.y, d.axisY, 1e-6), "the image stands on the axis");
  });
}

test("a real image is a solid arrow with no dashed extensions; a virtual one is dashed with its backward rays dashed", () => {
  const real = expandOptics({ kind: "lens", lens: "converging", f: 10, p: 30, o: 3 });
  assert.equal(connector(real, "image")!.lineStyle, undefined);
  assert.ok(!marksOf(real).some((m) => m.lineStyle === "dashed" && m.id.startsWith("ray-")));
  const virt = expandOptics({ kind: "lens", lens: "converging", f: 10, p: 6, o: 2 });
  assert.equal(connector(virt, "image")!.lineStyle, "dashed");
  const dashed = marksOf(virt).filter((m) => m.id.startsWith("ray-") && m.lineStyle === "dashed");
  assert.ok(dashed.length >= 3, `${dashed.length} dashed ray pieces`);
  for (const m of marksOf(virt).filter((x) => /-out$/.test(x.id))) assert.notEqual(m.lineStyle, "dashed", "real ray pieces stay solid");
});

test("the principal rays obey their own rules, drawn -- parallel, through the focus, through the centre", () => {
  const spec = expandOptics({ kind: "lens", lens: "converging", f: 10, p: 30, o: 3 });
  const d = decode(spec, 3);
  const inP = markPts(mark(spec, "ray-parallel-in")!);
  assert.ok(near(inP[0]!.y, inP[1]!.y, 1e-6), "the parallel ray is parallel to the axis");
  assert.ok(near(inP[0]!.y, d.objectTip.y, 1e-6), "and leaves the tip");
  // …and after the lens it passes through F′, a focal length to the right.
  const out = markPts(mark(spec, "ray-parallel-out")!);
  const Fp = { x: d.elementX + 10 * d.unit, y: d.axisY };
  const onLine = meet(out[0]!, out[1]!, { x: Fp.x, y: 0 }, { x: Fp.x, y: 1 })!;
  assert.ok(Math.abs(onLine.y - Fp.y) <= 0.75, "the refracted parallel ray crosses the axis at F′");
  const foc = markPts(mark(spec, "ray-focal-out")!);
  assert.ok(near(foc[0]!.y, foc[1]!.y, 1e-6), "the focal ray leaves the lens parallel to the axis");
  const cen = [...markPts(mark(spec, "ray-centre-in")!), ...markPts(mark(spec, "ray-centre-out")!)];
  assert.ok(cen.some((q) => near(q.x, d.elementX, 1e-6) && near(q.y, d.axisY, 1e-6)), "the central ray passes through the optical centre");
});

test("mirror rays are cut at the arc, and the arc is the circle of radius 2f about C", () => {
  const spec = expandOptics({ kind: "mirror", mirror: "concave", f: 10, p: 15, o: 3 });
  const d = decode(spec, 3);
  const R = 20 * d.unit;
  const C = { x: d.elementX - R, y: d.axisY };
  for (const id of ["ray-parallel-in", "ray-parallel-out", "ray-focal-in", "ray-focal-out"]) {
    const q = markPts(mark(spec, id)!);
    const onArc = id.endsWith("-in") ? q[1]! : q[0]!;
    assert.ok(Math.abs(Math.hypot(onArc.x - C.x, onArc.y - C.y) - R) <= 0.5, `${id} meets the mirror on its arc`);
  }
  // C and F are marked at 2f and f from the vertex.
  const dots = (id: string): Point => ({ x: markPts(mark(spec, `${id}-dot`)!)[0]!.x - 3, y: d.axisY });
  assert.ok(near((d.elementX - dots("C").x) / d.unit, 20, 0.05));
  assert.ok(near((d.elementX - dots("F").x) / d.unit, 10, 0.05));
});

test("the centre-of-curvature ray of a mirror retraces itself: radial to the arc", () => {
  const spec = expandOptics({ kind: "mirror", mirror: "convex", f: 12, p: 20, o: 4, rays: ["parallel", "focal", "centre"] });
  const d = decode(spec, 4);
  const q = markPts(mark(spec, "ray-centre-in")!);
  const C = { x: d.elementX + 24 * d.unit, y: d.axisY };
  // tip, Q and C are collinear: a radius.
  const cross = (q[1]!.x - q[0]!.x) * (C.y - q[0]!.y) - (q[1]!.y - q[0]!.y) * (C.x - q[0]!.x);
  assert.ok(Math.abs(cross) / Math.hypot(q[1]!.x - q[0]!.x, q[1]!.y - q[0]!.y) <= 0.5, "tip, hit and C are on one line");
});

test("object at the focus: parallel rays, no image arrow, and it says so", async () => {
  const spec = expandOptics({ kind: "lens", lens: "converging", f: 10, p: 10, o: 3 });
  assert.equal(connector(spec, "image"), undefined);
  const a = markPts(mark(spec, "ray-parallel-out")!);
  const b = markPts(mark(spec, "ray-centre-out")!);
  const ang = (q: Point[]): number => Math.atan2(q[1]!.y - q[0]!.y, q[1]!.x - q[0]!.x);
  assert.ok(near(ang(a), ang(b), 1e-9), "the emerging rays are parallel");
  assert.ok(labels(spec).some((t) => /imagem imprópria \(no infinito\)/.test(t)));
  assert.equal(mark(spec, "ray-focal-out"), undefined, "the focal ray of an object at F never meets the lens");
  const mirror = expandOptics({ kind: "mirror", mirror: "concave", f: 10, p: 10, o: 3 });
  assert.equal(connector(mirror, "image"), undefined);
  assert.ok(labels(mirror).some((t) => /imprópria/.test(t)));
  const r = await render(mirror, { maxPasses: 2, raster: false });
  assert.ok(r.manifest.checks.every((c) => c.status === "pass" || c.status === "not-applicable"));
});

test("the printed numbers are computed: changing p changes p′, A and the nature line", () => {
  const a = labels(expandOptics({ kind: "lens", lens: "converging", f: 10, p: 30, o: 3 })).join("|");
  assert.match(a, /p = 30 cm; f = 10 cm → p′ = 15 cm; A = −0,5/);
  assert.match(a, /imagem real, invertida, menor/);
  const b = labels(expandOptics({ kind: "lens", lens: "converging", f: 10, p: 45, o: 3 })).join("|");
  assert.match(b, /p′ ≈ 12,86 cm; A ≈ −0,29/);
  const c = labels(expandOptics({ kind: "lens", lens: "converging", f: 10, p: 20, o: 3 })).join("|");
  assert.match(c, /p′ = 20 cm; A = −1/);
  assert.match(c, /imagem real, invertida, igual/);
  const e = labels(expandOptics({ kind: "mirror", mirror: "convex", f: 12, p: 20, o: 4 })).join("|");
  assert.match(e, /f = −12 cm → p′ = −7,5 cm; A = 0,375/);
});

test("the plane mirror: image as far behind as the object is in front, same size, virtual", () => {
  const spec = expandOptics({ kind: "mirror", mirror: "plane", p: 15, o: 4 });
  const d = decode(spec, 4);
  assert.ok(near((d.imageTip!.x - d.elementX) / d.unit, 15, 0.05));
  assert.ok(near((d.axisY - d.imageTip!.y) / d.unit, 4, 0.05));
  assert.equal(connector(spec, "image")!.lineStyle, "dashed");
  assert.ok(labels(spec).some((t) => t === "imagem virtual, direita, igual"));
});

test("the scale bar is as long as it says", () => {
  const spec = expandOptics({ kind: "lens", lens: "converging", f: 10, p: 30, o: 3 });
  const d = decode(spec, 3);
  const bar = markPts(mark(spec, "scale-bar")!);
  const cm = Number(labels(spec).find((t) => /^\d+ cm$/.test(t))!.replace(" cm", ""));
  assert.ok(near((bar[1]!.x - bar[0]!.x) / d.unit, cm, 1e-6));
});

// ---- the interface -----------------------------------------------------------------------------------------

function directionOf(m: Mark): Point {
  const q = markPts(m);
  return { x: q[1]!.x - q[0]!.x, y: q[1]!.y - q[0]!.y };
}
/** The angle a ray makes with the vertical (the normal), degrees. */
const fromNormal = (d: Point): number => (Math.atan2(Math.abs(d.x), Math.abs(d.y)) * 180) / Math.PI;

test("interface: the drawn refracted angle is Snell's, for a sweep of media and angles", () => {
  for (const [n1, n2] of [[1, 1.33], [1, 1.5], [1.5, 1.33], [1.33, 1.5], [1, 2.42]] as const) {
    for (const t1 of [10, 30, 45, 70]) {
      const spec = expandOptics({ kind: "interface", n1: { name: "a", n: n1 }, n2: { name: "b", n: n2 }, theta1: t1 });
      const inc = fromNormal(directionOf(mark(spec, "ray-incident")!));
      assert.ok(near(inc, t1, 1e-6), `incident ${inc} vs ${t1}`);
      const s = snell(n1, n2, t1);
      const refr = mark(spec, "ray-refracted");
      if (s.total) assert.equal(refr, undefined);
      else assert.ok(near(fromNormal(directionOf(refr!)), s.theta2, 1e-6));
      assert.ok(near(n1 * Math.sin((inc * Math.PI) / 180), n2 * Math.sin((fromNormal(directionOf(refr ?? mark(spec, "ray-reflected")!)) * Math.PI) / 180), 1e-6) || s.total);
    }
  }
});

test("interface: the incident, reflected and refracted rays lie on the sides the law puts them", () => {
  const spec = expandOptics({ kind: "interface", n1: { name: "ar" }, n2: { name: "água" }, theta1: 30 });
  const inc = markPts(mark(spec, "ray-incident")!);
  const ref = markPts(mark(spec, "ray-reflected")!);
  const rfr = markPts(mark(spec, "ray-refracted")!);
  const O = inc[1]!;
  assert.ok(inc[0]!.x < O.x && inc[0]!.y < O.y, "incident comes from the upper left");
  assert.ok(ref[1]!.x > O.x && ref[1]!.y < O.y, "reflected goes to the upper right");
  assert.ok(rfr[1]!.x > O.x && rfr[1]!.y > O.y, "refracted goes into the lower medium, still to the right");
  assert.ok(near(fromNormal(directionOf(mark(spec, "ray-reflected")!)), 30, 1e-6), "θ reflected = θ incident");
});

test("interface: total internal reflection draws no refracted ray and states the critical angle", () => {
  const spec = expandOptics({ kind: "interface", n1: { name: "água" }, n2: { name: "ar" }, theta1: 60 });
  assert.equal(mark(spec, "ray-refracted"), undefined);
  assert.ok(mark(spec, "ray-reflected") !== undefined);
  assert.ok(labels(spec).includes("reflexão total (θ₁ > θc = 48,8°)"));
  // the incident ray comes from BELOW: the denser medium is drawn underneath
  const inc = markPts(mark(spec, "ray-incident")!);
  assert.ok(inc[0]!.y > inc[1]!.y);
  // just under the critical angle it refracts, nearly along the surface
  const under = expandOptics({ kind: "interface", n1: { name: "água" }, n2: { name: "ar" }, theta1: 48 });
  const r = mark(under, "ray-refracted")!;
  assert.ok(fromNormal(directionOf(r)) > 80);
  assert.ok(!labels(under).some((t) => /reflexão total/.test(t)));
});

test("interface: normal incidence goes straight through; the angle marks are the drawn ones", () => {
  const spec = expandOptics({ kind: "interface", n1: { name: "ar" }, n2: { name: "vidro" }, theta1: 0 });
  assert.ok(near(fromNormal(directionOf(mark(spec, "ray-refracted")!)), 0, 1e-9));
  assert.equal(connectorsOf(spec).length, 0, "no angle to mark");
});

test("interface: each angle arc's label is the angle its own arms make", () => {
  const spec = expandOptics({ kind: "interface", n1: { name: "ar" }, n2: { name: "água" }, theta1: 30 });
  const arcs = connectorsOf(spec).filter((c) => c.curve?.kind === "sweep");
  assert.equal(arcs.length, 2);
  for (const c of arcs) {
    const centre = (c.curve as { centre: Point }).centre;
    const a = Math.atan2((c.from as Point).y - centre.y, (c.from as Point).x - centre.x);
    const b = Math.atan2((c.to as Point).y - centre.y, (c.to as Point).x - centre.x);
    let sweep = Math.abs(((b - a) * 180) / Math.PI);
    if (sweep > 180) sweep = 360 - sweep;
    const label = blocksOf(spec).find((k) => k.annotates === c.id)!;
    const stated = Number(label.label!.replace("°", "").replace(",", "."));
    assert.ok(Math.abs(stated - sweep) <= 0.06, `${c.id}: says ${stated}, sweeps ${sweep}`);
  }
});

test("interface: the panel derives its numbers", () => {
  const t = labels(expandOptics({ kind: "interface", n1: { name: "ar" }, n2: { name: "água" }, theta1: 30 })).join("|");
  assert.match(t, /sen θ₂ = 1 · 0,5 \/ 1,33 ≈ 0,376 → θ₂ ≈ 22,1°/);
  assert.match(t, /água é mais refringente que ar: o raio se aproxima da normal/);
  const u = labels(expandOptics({ kind: "interface", n1: { name: "água" }, n2: { name: "ar" }, theta1: 30 })).join("|");
  assert.match(u, /θc ≈ 48,8°/);
  assert.match(u, /se afasta da normal/);
  const w = labels(expandOptics({ kind: "interface", n1: { name: "ar", n: 1 }, n2: { name: "vidro", n: 1.5 }, theta1: 45 })).join("|");
  assert.match(w, /≈ 0,471 → θ₂ ≈ 28,1°/);
});

// ---- every fixture renders, and every check passes -------------------------------------------------------------

test("there are at least six fixtures, covering the required kinds", () => {
  assert.ok(fixtures.length >= 6, `${fixtures.length} fixtures`);
  const names = fixtures.join(" ");
  for (const needle of ["beyond-2f", "inside-f", "diverging", "concave", "convex", "air-water", "total-internal"]) assert.ok(names.includes(needle), `no ${needle} fixture`);
});

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "optics");
    const { preset: _preset, ...input } = raw;
    validateOpticsInput(input);
    const spec = expandOptics(input as unknown as OpticsInput);
    const result = await render(spec, { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
    if (input.kind === "interface" && (input.theta1 as number) > 0) {
      const sweep = result.manifest.checks.find((c) => c.id === "sweep-matches-its-label")!;
      assert.equal(sweep.status, "pass", `the angle labels are measured: ${sweep.detail}`);
    }
  });
});

test("the sweep check reads the angle marks: a wrong label would fail it", async () => {
  const spec = expandOptics({ kind: "interface", n1: { name: "ar" }, n2: { name: "água" }, theta1: 30 });
  const ok = await render(spec, { maxPasses: 2, raster: false });
  assert.equal(ok.manifest.checks.find((c) => c.id === "sweep-matches-its-label")!.status, "pass");
  const label = blocksOf(spec).find((b) => b.annotates === "arc-incident")!;
  label.label = "45°";
  const bad = await render(spec, { maxPasses: 2, raster: false });
  assert.equal(bad.manifest.checks.find((c) => c.id === "sweep-matches-its-label")!.status, "fail");
});

test("a spread of lens and mirror figures all pass their checks", async () => {
  const cases: OpticsInput[] = [
    { kind: "lens", lens: "converging", f: 8, p: 12, o: 2 },
    { kind: "lens", lens: "converging", f: 8, p: 4, o: 1 },
    { kind: "lens", lens: "diverging", f: 6, p: 15, o: 3 },
    { kind: "mirror", mirror: "concave", f: 6, p: 20, o: 2 },
    { kind: "mirror", mirror: "concave", f: 6, p: 3, o: 1 },
    { kind: "mirror", mirror: "convex", f: 8, p: 6, o: 2 },
  ];
  for (const input of cases) {
    const result = await render(expandOptics(input), { maxPasses: 3, raster: false });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${JSON.stringify(input)}: ${check.id} ${check.status}: ${check.detail}`);
    }
  }
});

test("a spread of interface figures all pass their checks", async () => {
  const cases: OpticsInput[] = [
    { kind: "interface", n1: { name: "ar" }, n2: { name: "vidro" }, theta1: 80 },
    { kind: "interface", n1: { name: "ar" }, n2: { name: "água" }, theta1: 5 },
    { kind: "interface", n1: { name: "água" }, n2: { name: "vidro" }, theta1: 15 },
    { kind: "interface", n1: { name: "vidro" }, n2: { name: "ar" }, theta1: 42 },
    { kind: "interface", n1: { name: "diamante" }, n2: { name: "ar" }, theta1: 20 },
    { kind: "interface", n1: { name: "ar" }, n2: { name: "acrílico" }, theta1: 0 },
    { kind: "interface", n1: { name: "ar", n: 1 }, n2: { name: "meio X", n: 1.25 }, theta1: 33.5 },
  ];
  for (const input of cases) {
    const result = await render(expandOptics(input), { maxPasses: 3, raster: false });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${JSON.stringify(input)}: ${check.id} ${check.status}: ${check.detail}`);
    }
  }
});

// ---- answers: false ------------------------------------------------------------------------------

fixtures.forEach((filename) => {
  test(`answers:false ${filename}: no ray, image or computed panel line, every check passes`, async () => {
    const { preset: _p, ...raw } = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    const input = { ...raw, answers: false } as unknown as OpticsInput;
    const spec = expandOptics(input);
    const ids = [...blocksOf(spec).map((b) => b.id ?? ""), ...marksOf(spec).map((m) => m.id ?? ""), ...connectorsOf(spec).map((c) => c.id ?? "")];
    assert.deepEqual(ids.filter((id) => /^(ray-(?!incident|reflected)|image|arc-refracted|arc-reflected)/.test(id) || id === "image"), [], filename);
    const text = labels(spec).join("\n");
    assert.ok(!/imagem|p′|θ₂|θc|sen θ|refratado|reflexão total|virtual|real\b|invertida|direita|ampliada|reduzida|imprópria|não há raio/.test(text), `${filename}: ${text}`);
    if (raw.kind === "interface") {
      assert.ok(/θ₁ = /.test(text) && /n₁ = /.test(text), "the givens stay");
      assert.ok(!ids.includes("ray-refracted") && !ids.includes("ray-reflected") || raw.reflected !== false);
    } else {
      assert.ok(/p = .* cm/.test(text) && /o = .* cm/.test(text), "p and o stay");
      assert.ok(ids.includes("object") && ids.includes("element"));
      assert.ok(!ids.some((id) => id.startsWith("ray-")), "no ray");
    }
    const result = await render(spec, { maxPasses: 3, raster: false });
    for (const check of result.manifest.checks) assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
  });
});

test("answers:false does not let the hidden image steer the frame; answers:true is unchanged", () => {
  const a = expandOptics({ kind: "lens", lens: "converging", f: 10, p: 30, o: 3, answers: false } as OpticsInput);
  const b = expandOptics({ kind: "lens", lens: "converging", f: 10, p: 30, o: 3 } as OpticsInput);
  assert.deepEqual(expandOptics({ kind: "lens", lens: "converging", f: 10, p: 30, o: 3, answers: true } as OpticsInput), b);
  assert.ok(labels(b).some((t) => t.includes("imagem")) && !labels(a).some((t) => t.includes("imagem")));
  assert.ok(labels(b).some((t) => t.includes("p′")));
});
