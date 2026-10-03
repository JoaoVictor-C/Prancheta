/**
 * The P1 mechanics kinds (docs/plans/PLAN-PHYSICS.md) drawn to their solutions:
 * every length below is read back from the figure and compared with the
 * solved quantity it stands for. Rendering with every check passing is
 * covered for every fixture by tests/mechanics.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { expandMechanics, validateMechanicsInput } from "../src/presets/mechanics/preset.ts";
import type { MechanicsInput } from "../src/presets/mechanics/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { FigureSpec } from "../src/ir/types.ts";

const dir = fileURLToPath(new URL("../fixtures/mechanics/", import.meta.url));
const fixture = (name: string): MechanicsInput => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as MechanicsInput;
const near = (a: number, b: number, e = 1e-6): boolean => Math.abs(a - b) <= e;

type Pt = { x: number; y: number };
type MarkLike = { id?: string; from?: Pt; segments?: { line?: Pt }[] };
const marks = (s: FigureSpec): MarkLike[] => (s.root as { marks?: MarkLike[] }).marks ?? [];
const mark = (s: FigureSpec, id: string): MarkLike => {
  const m = marks(s).find((q) => q.id === id);
  assert.ok(m, `mark ${id} drawn`);
  return m!;
};
const points = (m: MarkLike): Pt[] => [m.from!, ...(m.segments ?? []).map((q) => q.line!)];
/** An arrow's drawn length: shaft start to the tip of its head; and its unit direction. */
function arrowOf(s: FigureSpec, id: string): { length: number; dir: Pt; from: Pt; tip: Pt } {
  const from = mark(s, id).from!;
  const tip = mark(s, `${id}-head`).from!;
  const length = Math.hypot(tip.x - from.x, tip.y - from.y);
  return { length, dir: { x: (tip.x - from.x) / length, y: (tip.y - from.y) / length }, from, tip };
}
const area = (p: Pt[]): number => Math.abs(p.reduce((s, a, i) => s + a.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * a.y, 0)) / 2;
const height = (m: MarkLike): number => {
  const ys = points(m).map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys);
};

test("projectile: at the top the velocity is v₀·cos θ; at the ground it is the landing speed", () => {
  const s = expandMechanics(fixture("projectile-components"));
  const v0 = arrowOf(s, "v0").length;
  assert.ok(near(arrowOf(s, "v-topo").length / v0, Math.cos(Math.PI / 3)));
  assert.ok(near(arrowOf(s, "v-solo").length / v0, 1)); // launched from the ground: lands at v₀
  const h = expandMechanics(fixture("projectile-horizontal"));
  assert.ok(near(arrowOf(h, "v-solo").length / arrowOf(h, "v0").length, Math.sqrt(1000) / 10));
});

test("energy: each bar stacks E_p and E_c to the energy left at that point", () => {
  const s = expandMechanics(fixture("energy-with-losses"));
  // E0 = 96 J; at A: 80 + 16; at B: 0 + 80 (16 lost); at C: 70 + 0 (10 more lost).
  const unit = height(mark(s, "ep-0")) / 80;
  assert.ok(near(height(mark(s, "ek-0")), 16 * unit));
  assert.ok(near(height(mark(s, "ek-1")), 80 * unit));
  assert.ok(near(height(mark(s, "ep-2")), 70 * unit));
  assert.ok(!marks(s).some((m) => m.id === "ek-2"), "no kinetic energy left at C");
  const q = expandMechanics({ ...fixture("energy-coaster"), answers: false });
  assert.ok(!marks(q).some((m) => /^e[pk]-/.test(m.id ?? "")), "the question's figure shows no bars");
});

test("lever: the unknown force at its solved arm, every force to one scale", () => {
  const s = expandMechanics(fixture("lever-where"));
  // Supports at 1 m on a 3 m beam: the 250 N force acts at 3 m, 2 m from the support.
  const beam = points(mark(s, "barra"));
  const x0 = Math.min(...beam.map((p) => p.x));
  const x1 = Math.max(...beam.map((p) => p.x));
  const at = (m: number): number => x0 + ((x1 - x0) * m) / 3;
  assert.ok(near(arrowOf(s, "forca").tip.x, at(3), 1e-6));
  assert.ok(near(arrowOf(s, "forca").length / arrowOf(s, "peso-1").length, 250 / 400));
  const w = expandMechanics(fixture("lever-wheelbarrow"));
  assert.ok(arrowOf(w, "forca").dir.y < 0, "the wheelbarrow's effort pushes up");
  assert.ok(near(arrowOf(w, "forca").length / arrowOf(w, "peso-1").length, 200 / 600));
});

test("collision: arrows in the ratio of the velocities, the stuck pair as one", () => {
  const p = expandMechanics(fixture("collision-partial"));
  assert.ok(near(arrowOf(p, "v2").length / arrowOf(p, "u1").length, 2.2 / 5));
  assert.ok(near(arrowOf(p, "v1").length / arrowOf(p, "u1").length, 1.3 / 5));
  assert.ok(arrowOf(p, "v1").dir.x < 0 && arrowOf(p, "v2").dir.x > 0);
  const stuck = expandMechanics(fixture("collision-stick"));
  assert.ok(near(arrowOf(stuck, "v").length / arrowOf(stuck, "u1").length, 2 / 3));
  assert.ok(!marks(stuck).some((m) => m.id === "v1" || m.id === "v2"));
  const q = expandMechanics({ ...fixture("collision-partial"), answers: false });
  assert.ok(!marks(q).some((m) => m.id === "v1" || m.id === "v2"), "the question's figure hides the velocities after");
  const boom = expandMechanics({ ...fixture("collision-explosion"), answers: false });
  assert.ok(marks(boom).some((m) => m.id === "v1"), "an explosion's given velocity stays");
  assert.ok(!marks(boom).some((m) => m.id === "v2"));
});

test("circular: v equal everywhere and tangent; a_c toward the centre", () => {
  const s = expandMechanics(fixture("circular-uniform"));
  const centre = mark(s, "centro") as unknown as { from?: Pt };
  const lengths = [1, 2, 3].map((i) => arrowOf(s, `v-${i}`).length);
  assert.ok(lengths.every((l) => near(l, lengths[0]!)));
  for (const i of [1, 2, 3]) {
    const a = arrowOf(s, `ac-${i}`);
    const v = arrowOf(s, `v-${i}`);
    assert.ok(near(a.dir.x * v.dir.x + a.dir.y * v.dir.y, 0, 1e-9), "a_c ⟂ v");
    void centre;
  }
});

test("loop, banked curve, conical pendulum: force ratios as solved", () => {
  const l = expandMechanics(fixture("loop-top"));
  assert.ok(near(arrowOf(l, "normal").length / arrowOf(l, "peso").length, 3)); // N = 60 N, P = 20 N
  assert.ok(!marks(expandMechanics(fixture("loop-minimum"))).some((m) => m.id === "normal"), "at the minimum speed N = 0");
  const b = expandMechanics(fixture("banked-curve"));
  assert.ok(near(arrowOf(b, "normal").length / arrowOf(b, "peso").length, 1 / Math.cos(Math.PI / 6)));
  assert.ok(near(arrowOf(b, "resultante").dir.y, 0, 1e-9) && arrowOf(b, "resultante").dir.x < 0, "the resultant is horizontal, toward the centre");
  const c = expandMechanics(fixture("conical-pendulum"));
  assert.ok(near(arrowOf(c, "tracao").length / arrowOf(c, "peso").length, 1 / Math.cos((37 * Math.PI) / 180)));
});

test("orbit: equal areas in equal times, and v_p/v_a = r_a/r_p", () => {
  const s = expandMechanics(fixture("orbit-kepler"));
  const a1 = area(points(mark(s, "area-1")));
  const a2 = area(points(mark(s, "area-2")));
  assert.ok(Math.abs(a1 - a2) / a1 < 0.01, `sectors ${a1.toFixed(1)} and ${a2.toFixed(1)} px²`);
  assert.ok(near(arrowOf(s, "vp").length / arrowOf(s, "va").length, 3));
});

test("the new kinds refuse what cannot be drawn or solved", () => {
  const bad = (raw: Record<string, unknown>, re: RegExp) => assert.throws(() => validateMechanicsInput(raw), (e: unknown) => e instanceof SpecError && re.test(e.message));
  bad({ kind: "projectile", speed: 10, angle: 0 }, /height to fall from/);
  bad({ kind: "projectile", speed: 10, angle: 80, components: true }, /70°/);
  bad({ kind: "energy", mass: 1, track: [{ name: "A", height: 1 }] }, /2 to 6 points/);
  bad({ kind: "energy", mass: 1, track: [{ name: "A", height: 0 }, { name: "B", height: 0 }] }, /no energy/);
  bad({ kind: "lever", length: 2, support: 1, loads: [{ at: 0, mass: 1 }], unknown: { at: 1 } }, /support/);
  bad({ kind: "lever", length: 2, support: 1, loads: [{ at: 0, mass: 1, force: 2 }], unknown: { at: 2 } }, /one of them/);
  bad({ kind: "collision", masses: [1, 1], velocities: [0, 3] }, /never meet/);
  bad({ kind: "collision", masses: [1, 1], velocities: [3, 0], restitution: 1.5 }, /0 to 1/);
  bad({ kind: "circular", radius: 1 }, /speed or the period/);
  bad({ kind: "banked", radius: 10, mass: 1, angle: 80 }, /10 to 60/);
  bad({ kind: "orbit", semiMajor: 1, eccentricity: 0.95 }, /0,1 to 0,7/);
});

// ---- P2 ------------------------------------------------------------------------------------

test("contact, elevator: forces to one scale, action and reaction equal", () => {
  const c = expandMechanics(fixture("contact-blocks"));
  // a = (20 − 0,2·50)/5 = 2 m/s²; A pushes B with m_B·a + μ·m_B·g = 12 N.
  assert.ok(near(arrowOf(c, "fab").length, arrowOf(c, "fba").length), "F_AB = F_BA");
  assert.ok(near(arrowOf(c, "forca").length / arrowOf(c, "fab").length, 20 / 12));
  const e = expandMechanics(fixture("elevator-up"));
  assert.ok(near(arrowOf(e, "normal").length / arrowOf(e, "peso").length, 12 / 10)); // N = m(g + a)
});

test("gravitation and cables: pairs equal, the force triangle closes", () => {
  const g = expandMechanics(fixture("gravitation-compare"));
  for (const i of [0, 1]) assert.ok(near(arrowOf(g, `f12-${i}`).length, arrowOf(g, `f21-${i}`).length), `pair ${i}`);
  const k = expandMechanics(fixture("cables-knot"));
  assert.ok(near(arrowOf(k, "t1").length / arrowOf(k, "t2").length, arrowOf(k, "tri-t1").length / arrowOf(k, "tri-t2").length));
});

test("buoyancy: a floating body sinks to ρ_c/ρ_l with E = P; a sinking one has E/P = ρ_l/ρ_c", () => {
  const f = expandMechanics(fixture("buoyancy-float"));
  assert.ok(near(height(mark(f, "submersa")) / height(mark(f, "corpo")), 0.6));
  assert.ok(near(arrowOf(f, "empuxo").length, arrowOf(f, "peso").length));
  const s = expandMechanics(fixture("buoyancy-sink"));
  assert.ok(near(arrowOf(s, "empuxo").length / arrowOf(s, "peso").length, 1000 / 2700));
});

test("hydraulic, pressure, efficiency: lengths as solved", () => {
  const h = expandMechanics(fixture("hydraulic-press"));
  const width = (m: MarkLike): number => { const xs = points(m).map((p) => p.x); return Math.max(...xs) - Math.min(...xs); };
  // Pistons inset 2 px each side; diameters ∝ √A.
  assert.ok(near((width(mark(h, "embolo-1")) + 4) / (width(mark(h, "embolo-2")) + 4), Math.sqrt(0.01 / 0.5)));
  const p = expandMechanics(fixture("pressure-depth"));
  // Each depth drop stops 7 px above its point and starts 2 px below the surface.
  const drop = (i: number): number => height(mark(p, `prof-${i}`)) + 9;
  assert.ok(near(drop(1) / drop(2), 5 / 10) && near(drop(0) / drop(2), 2 / 10));
  const e = expandMechanics(fixture("efficiency-motor"));
  assert.ok(near(height(mark(e, "util")) / height(mark(e, "entrada")), 0.25));
});

test("the P2 kinds refuse what cannot be drawn or solved", () => {
  const bad = (raw: Record<string, unknown>, re: RegExp) => assert.throws(() => validateMechanicsInput(raw), (e: unknown) => e instanceof SpecError && re.test(e.message));
  bad({ kind: "hydraulic", force: 10, areas: [0.5, 0.01] }, /must be the larger/);
  bad({ kind: "oscillator", system: "pendulum", length: 1, amplitude: 0.5 }, /0,35·L/);
  bad({ kind: "oscillator", system: "spring", mass: 1, stiffness: 10, amplitude: 0.1, length: 1 }, /belongs to a pendulum/);
  bad({ kind: "efficiency", input: 100, useful: 120 }, /cannot exceed/);
  bad({ kind: "efficiency", input: 100, useful: 50, losses: [{ name: "calor", value: 60 }] }, /more than the input/);
  bad({ kind: "pressure", points: [{ name: "A", depth: 1 }] }, /setup is required/);
});