/**
 * The P1 solvers of the mechanics preset (docs/PLAN-PHYSICS.md) against
 * hand-worked values, before anything is drawn from them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  solveBanked, solveCircular, solveCollision, solveConical, solveEnergy, solveExplosion, solveLever, solveLoop, solveOrbit, solveProjectile,
} from "../src/presets/mechanics/physics.ts";

const near = (a: number, b: number, e = 1e-9): boolean => Math.abs(a - b) <= e;
const ok = (a: number, b: number, e = 1e-9, what = ""): void => assert.ok(near(a, b, e), `${what} ${a} ≠ ${b}`);

test("projectile: oblique from the ground, and horizontal from a height", () => {
  const s = solveProjectile(20, 30, 10);
  ok(s.vx, 10 * Math.sqrt(3), 1e-9, "vx");
  ok(s.vy0, 10, 1e-9, "vy0");
  ok(s.tUp, 1, 1e-9, "tUp");
  ok(s.H, 5, 1e-9, "H");
  ok(s.tFlight, 2, 1e-9, "tFlight");
  ok(s.range, 20 * Math.sqrt(3), 1e-9, "range");
  const top = s.at(1);
  ok(top.y, 5, 1e-9, "y at top");
  ok(top.vy, 0, 1e-9, "vy at top");
  const h = solveProjectile(10, 0, 10, 45);
  ok(h.tFlight, 3, 1e-9, "fall time");
  ok(h.range, 30, 1e-9, "range");
  ok(h.H, 45, 1e-9, "H is the launch height");
  ok(h.at(h.tFlight).y, 0, 1e-9, "lands at y = 0");
});

test("energy: conservation along a track, losses, and a point not reached", () => {
  const pts = [{ name: "A", height: 5 }, { name: "B", height: 0 }, { name: "C", height: 3 }];
  const s = solveEnergy(2, 10, pts);
  ok(s.E0, 100);
  ok(s.points[1]!.Ek, 100);
  ok(s.points[1]!.v, 10);
  ok(s.points[2]!.Ep, 60);
  ok(s.points[2]!.v, Math.sqrt(40));
  const lossy = solveEnergy(2, 10, pts, 0, undefined, [20, 0]);
  ok(lossy.points[1]!.Ek, 80);
  ok(lossy.points[2]!.Ek, 20);
  const high = solveEnergy(2, 10, [{ name: "A", height: 5 }, { name: "B", height: 0 }, { name: "C", height: 6 }, { name: "D", height: 1 }]);
  assert.deepEqual(high.points.map((p) => p.reached), [true, true, false, false]);
  const sprung = solveEnergy(0.5, 10, [{ name: "A", height: 0 }, { name: "B", height: 2 }], 0, { k: 400, x: 0.1 });
  ok(sprung.E0, 2);
  assert.equal(sprung.points[1]!.reached, false); // needs 10 J to rise 2 m
});

test("lever: the unknown force or arm by torques, and the lever's class", () => {
  // Support at 2 m, 300 N at the left end, effort at 3 m: 300·2 = F·1.
  const first = solveLever(2, [{ at: 0, force: 300, name: "P" }], { at: 3 });
  ok(first.unknown.force, 600);
  assert.equal(first.leverClass, 1);
  // Wheelbarrow: support at 0, load at 1 m, effort at 3 m pulls UP (negative = upward).
  const second = solveLever(0, [{ at: 1, force: 300, name: "P" }], { at: 3 });
  ok(second.unknown.force, -100);
  assert.equal(second.leverClass, 2);
  const third = solveLever(0, [{ at: 3, force: 300, name: "P" }], { at: 1 });
  ok(third.unknown.force, -900);
  assert.equal(third.leverClass, 3);
  const where = solveLever(2, [{ at: 0, force: 300, name: "P" }], { force: 600 });
  ok(where.unknown.at, 3);
  // The torques sum to zero.
  ok(first.torques.reduce((s, t) => s + t.torque, 0), 0);
  assert.throws(() => solveLever(2, [{ at: 0, force: 300, name: "P" }], { at: 2 }), /support/);
});

test("collisions: elastic, perfectly inelastic, partial, and an explosion", () => {
  const el = solveCollision(1, 1, 4, 0, 1);
  ok(el.v1, 0);
  ok(el.v2, 4);
  ok(el.lost, 0);
  const stick = solveCollision(2, 1, 3, 0, 0);
  ok(stick.v1, 2);
  ok(stick.v2, 2);
  ok(stick.lost, 3);
  const half = solveCollision(1, 1, 4, 0, 0.5);
  ok(half.v1, 1);
  ok(half.v2, 3);
  ok(half.p, 4);
  const boom = solveExplosion(1, 3, -6);
  ok(boom.v2, 2);
  ok(boom.p, 0);
});

test("circular motion: uniform, loop, banked curve, conical pendulum", () => {
  const u = solveCircular(2, { speed: 4 });
  ok(u.omega, 2);
  ok(u.T, Math.PI);
  ok(u.ac, 8);
  ok(solveCircular(1, { period: 2 * Math.PI }).v, 1);
  const loop = solveLoop(2, 10, 2.5, 10);
  ok(loop.vMin, 5);
  ok(loop.N, 60);
  assert.equal(solveLoop(2, 10, 2.5, 3).contact, false);
  ok(solveLoop(2, 10, 2.5).N, 0, 1e-9, "at the minimum speed N = 0");
  const bank = solveBanked(1000, 10, 40, 45);
  ok(bank.N, 10000 * Math.SQRT2, 1e-6);
  ok(bank.Fc, 10000, 1e-6);
  ok(bank.vIdeal, 20, 1e-9);
  const cone = solveConical(1, 10, 1, 60);
  ok(cone.r, Math.sqrt(3) / 2, 1e-12);
  ok(cone.T, 20, 1e-9);
  ok(cone.v, Math.sqrt(15), 1e-9);
  ok(cone.period, 2 * Math.PI * Math.sqrt(0.05), 1e-12);
});

test("orbit: perihelion, aphelion, speed ratio, and equal areas in equal times", () => {
  const o = solveOrbit(1, 0.5);
  ok(o.rp, 0.5);
  ok(o.ra, 1.5);
  ok(o.speedRatio, 3);
  ok(o.at(0).x, 0.5, 1e-12);
  ok(o.at(0.5).x, -1.5, 1e-12);
  // The area swept from the star, by fan triangles, over two equal stretches of time.
  const swept = (t0: number, dt: number): number => {
    let area = 0;
    for (let i = 0; i < 400; i += 1) {
      const p = o.at(t0 + (dt * i) / 400);
      const q = o.at(t0 + (dt * (i + 1)) / 400);
      area += (p.x * q.y - q.x * p.y) / 2;
    }
    return area;
  };
  const whole = Math.PI * o.a * o.b;
  ok(swept(0, 0.08), 0.08 * whole, 1e-4);
  ok(swept(0.46, 0.08), 0.08 * whole, 1e-4);
});
