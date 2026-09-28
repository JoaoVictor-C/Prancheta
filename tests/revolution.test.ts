/**
 * revolution (ADR 0049): solids of revolution derived from a region and an
 * axis. Volumes are the integrals' and print exact (8π, 2π/15); the method
 * in x and the independent slicing in y agree; the silhouette is tangent to
 * every cross-section ellipse it meets; a region across its axis, a pole in
 * the interval and a method the region cannot give are refused by name;
 * every fixture renders with no check failing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defaultCamera, expandRevolution, exactVolume, resolveRevolution, validateRevolutionInput, volumeLines } from "../src/presets/revolution/preset.ts";
import type { RevolutionInput } from "../src/presets/revolution/preset.ts";
import * as G from "../src/presets/revolution/geometry.ts";
import { project, projectCircle } from "../src/geometry/projection.ts";
import { render } from "../src/pipeline.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/revolution/", import.meta.url));
const fixture = (name: string): RevolutionInput => {
  const raw = JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf8")) as Record<string, unknown>;
  delete raw.preset;
  return raw as unknown as RevolutionInput;
};
const rel = (a: number, b: number, tol: number): void => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

// ---- volumes -------------------------------------------------------------------------

test("√x on [0, 4] about the x axis: discs, V = 8π", () => {
  const r = resolveRevolution({ region: { of: "sqrt(x)", from: 0, to: 4 }, axis: "x" });
  assert.equal(r.method, "discs");
  rel(r.volume, 8 * Math.PI, 1e-10);
  assert.equal(exactVolume(r.volume), "8π");
  assert.deepEqual(volumeLines(r), ["Discos: V = π∫₀⁴ R(x)² dx, com R(x) = √x", "V = π∫₀⁴ (√x)² dx = 8π ≈ 25,133"]);
});

test("between y = x and y = x² about the x axis: washers, bounds from the intersections, V = 2π/15", () => {
  const r = resolveRevolution({ region: { between: ["x", "x^2"] }, axis: "x" });
  assert.equal(r.method, "washers");
  assert.equal(r.a, 0);
  assert.equal(r.b, 1);
  assert.equal(r.texts.R, "x");
  assert.equal(r.texts.r, "x²");
  rel(r.volume, (2 * Math.PI) / 15, 1e-10);
  assert.equal(exactVolume(r.volume), "2π/15");
});

test("y = x − x² on [0, 1] about the y axis: shells, V = π/6", () => {
  const r = resolveRevolution({ region: { of: "x - x^2", from: 0, to: 1 }, axis: "y" });
  assert.equal(r.method, "shells");
  assert.equal(r.texts.radius, "x");
  assert.equal(r.texts.height, "x − x²");
  rel(r.volume, Math.PI / 6, 1e-10);
  assert.equal(exactVolume(r.volume), "π/6");
});

test("√x on [0, 4] about y = −1: washers with R = √x + 1 and r = 1, V = 56π/3", () => {
  const r = resolveRevolution({ region: { of: "sqrt(x)", from: 0, to: 4 }, axis: { y: -1 } });
  assert.equal(r.method, "washers");
  assert.equal(r.texts.R, "√x + 1");
  assert.equal(r.texts.r, "1");
  assert.equal(exactVolume(r.volume), "56π/3");
});

test("about a vertical line on the far side: x² on [0, 1] about x = 2 has shell radius 2 − x", () => {
  const r = resolveRevolution({ region: { of: "x^2", from: 0, to: 1 }, axis: { x: 2 } });
  assert.equal(r.texts.radius, "2 − x");
  // 2π∫(2 − x)x² dx = 2π(2/3 − 1/4) = 5π/6
  assert.equal(exactVolume(r.volume), "5π/6");
});

test("a volume that is not a rational multiple of π prints rounded, after ≈", () => {
  const r = resolveRevolution({ region: { of: "e^x", from: 0, to: 1 }, axis: "x" });
  assert.equal(exactVolume(r.volume), null);
  assert.match(volumeLines(r)[1]!, /dx ≈ 10,036$/);
});

test("the method in x and the independent slicing in y give the same volume", () => {
  const cases: RevolutionInput[] = [
    { region: { of: "sqrt(x)", from: 0, to: 4 }, axis: "x" }, // discs vs shells in y
    { region: { between: ["x", "x^2"] }, axis: "x" }, // washers vs shells in y
    { region: { of: "sqrt(x)", from: 0, to: 4 }, axis: { y: -1 } },
    { region: { of: "x - x^2", from: 0, to: 1 }, axis: "y" }, // shells vs washers in y
    { region: { of: "x^2", from: 0, to: 1 }, axis: { x: 2 } },
    { region: { between: ["4 - x^2", "0"], from: 0, to: 2 }, axis: "y" },
  ];
  for (const c of cases) {
    const r = resolveRevolution(c);
    rel(G.volumeInY(r.model), r.volume, 1e-6);
  }
});

// ---- the silhouette ---------------------------------------------------------------------

test("the silhouette is tangent to the cross-section ellipse at every point it touches", () => {
  for (const input of [
    { region: { of: "sqrt(x)", from: 0, to: 4 }, axis: "x" },
    { region: { between: ["x", "x^2"] }, axis: "x" },
    { region: { of: "x - x^2", from: 0, to: 1 }, axis: "y" },
  ] as RevolutionInput[]) {
    const r = resolveRevolution(input);
    const m = r.model;
    const cam = defaultCamera(m.axis);
    let checked = 0;
    for (const piece of G.pieces(m.region)) {
      for (const line of G.silhouette(m, cam, piece, 400)) {
        for (let i = 2; i < line.length - 2; i += 7) {
          const p = line[i]!;
          if (p.rho < 0.05) continue;
          const centre = G.axisPoint(m, p.s);
          const pc = projectCircle(cam, centre, m.A, p.rho);
          const t = G.circleParam(pc, centre, p.p3);
          // The silhouette point lies on the ellipse...
          const on = pc.point(t);
          const at = project(cam, p.p3);
          assert.ok(Math.hypot(on[0] - at[0], on[1] - at[1]) < 1e-9);
          // ...and the two curves share the tangent there.
          const e = [-Math.sin(t) * pc.p[0] + Math.cos(t) * pc.q[0], -Math.sin(t) * pc.p[1] + Math.cos(t) * pc.q[1]];
          // The silhouette's own tangent: the same formula, θ = φ ± acos k(u), a hair either side of u.
          const { phi } = G.viewInFrame(m, cam);
          const sign = Math.abs(Math.cos(p.theta - phi - Math.acos(Math.max(-1, Math.min(1, G.silhouetteRatio(m, cam, piece, p.u)))))) > 1 - 1e-9 ? 1 : -1;
          const at3 = (u: number) => {
            const { x, y } = piece.point(u);
            const q = G.meridian(m, x, y);
            return project(cam, G.sweep(m, q.s, q.rho, phi + sign * Math.acos(Math.max(-1, Math.min(1, G.silhouetteRatio(m, cam, piece, u))))));
          };
          const a = at3(p.u - 1e-5);
          const b = at3(p.u + 1e-5);
          const s = [b[0] - a[0], b[1] - a[1]];
          const sin = Math.abs(e[0]! * s[1]! - e[1]! * s[0]!) / (Math.hypot(e[0]!, e[1]!) * Math.hypot(s[0]!, s[1]!));
          assert.ok(sin < 2e-3, `tangent mismatch ${sin} at u = ${p.u}`);
          checked += 1;
        }
      }
    }
    assert.ok(checked > 10, `only ${checked} silhouette points checked`);
  }
});

test("a disc solid's end rim is hidden only where the solid itself stands in front of it", () => {
  const r = resolveRevolution({ region: { of: "sqrt(x)", from: 0, to: 4 }, axis: "x" });
  const m = r.model;
  const cam = defaultCamera(m.axis); // looks from the tip's side
  const size = G.solidSize(m);
  const pc = G.crossSection(m, cam, 4, 2);
  const seen = Array.from({ length: 24 }, (_, i) => G.visibleFrom(m, cam, pc.point3((i * Math.PI) / 12), size));
  assert.ok(seen.includes(true) && seen.includes(false));
  // The nearest point of the far end rim is seen; its farthest is behind the solid.
  assert.equal(G.visibleFrom(m, cam, pc.point3(pc.frontCenter), size), true);
  assert.equal(G.visibleFrom(m, cam, pc.point3(pc.frontCenter + Math.PI), size), false);
});

// ---- refusals ------------------------------------------------------------------------

test("a region crossing a horizontal axis of revolution is refused, naming where", () => {
  assert.throws(() => resolveRevolution({ region: { of: "sqrt(x)", from: 0, to: 4 }, axis: { y: 1 } }), /crosses the axis of revolution y = 1 at x = 1/);
});

test("a region lying across a vertical axis of revolution is refused", () => {
  assert.throws(() => resolveRevolution({ region: { of: "x^2", from: 0, to: 4 }, axis: { x: 2 } }), /crosses the axis of revolution x = 2/);
});

test("a pole inside the interval is refused", () => {
  assert.throws(() => resolveRevolution({ region: { of: "1/x", from: -1, to: 1 }, axis: "x" }), /pole/);
  assert.throws(() => resolveRevolution({ region: { of: "1/(x - 2)", from: 1, to: 3 }, axis: "y" }), /pole/);
});

test("two curves that cross inside the interval, and a curve crossing y = 0, are refused", () => {
  assert.throws(() => resolveRevolution({ region: { between: ["x", "x^2"], from: 0, to: 2 }, axis: "x" }), /cross at x = 1/);
  assert.throws(() => resolveRevolution({ region: { of: "sin(x)", from: 0, to: "2pi" }, axis: { y: -2 } }), /crosses the x axis/);
});

test("a method the region cannot give is refused by name", () => {
  assert.throws(() => resolveRevolution({ region: { of: "sqrt(x)", from: 0, to: 4 }, axis: "x", method: "shells" }), /use "discs"/);
  assert.throws(() => resolveRevolution({ region: { of: "sqrt(x)", from: 0, to: 4 }, axis: { y: -1 }, method: "discs" }), /use "washers"/);
  assert.throws(() => resolveRevolution({ region: { of: "x - x^2", from: 0, to: 1 }, axis: "y", method: "washers" }), /use "shells"/);
});

test("a slice outside the region and a camera along the axis are refused", () => {
  assert.throws(() => resolveRevolution({ region: { of: "sqrt(x)", from: 0, to: 4 }, axis: "x", slice: { at: 5 } }), /slice.at/);
  assert.throws(() => expandRevolution({ region: { of: "sqrt(x)", from: 0, to: 4 }, axis: "y", camera: { kind: "orthographic", azimuth: 0, elevation: 89 } }), /looks along the axis/);
});

// ---- fixtures -------------------------------------------------------------------------

for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".json"))) {
  test(`fixture ${file} expands, validates and renders with no check failing`, async () => {
    const input = fixture(file);
    validateRevolutionInput(input as unknown as Record<string, unknown>);
    const result = await render(expandRevolution(input), { raster: false });
    const failing = result.manifest.checks.filter((c) => c.status === "fail");
    assert.deepEqual(failing.map((c) => `${c.id} [${c.target}] ${c.detail ?? ""}`), []);
  });
}
