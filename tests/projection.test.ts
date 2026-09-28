/**
 * The camera (ADR 0045): R³ → page for points and directions, depth for
 * visibility, and the ellipse a 3D circle projects to -- checked against
 * sampled points, never against a hand-typed ellipse.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cavalierCamera,
  depth,
  edgeOn,
  ellipseFromConjugates,
  ellipsePoint,
  facesViewer,
  isometricCamera,
  liftToRay,
  makeCamera,
  orthographicCamera,
  planeDepthAt,
  project,
  projectCircle,
  projectDirection,
  sphereOutline,
  tangentParamsFrom,
  tangentParamsParallelTo,
  ISOMETRIC_ELEVATION,
} from "../src/geometry/projection.ts";
import type { Camera, Ellipse2 } from "../src/geometry/projection.ts";
import { GeometryError, add, cross3, dot, length, scale } from "../src/geometry/vec.ts";
import type { Vec2, Vec3 } from "../src/geometry/vec.ts";

const near = (a: number, b: number, tol = 1e-9): void => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const near2 = (a: Vec2, b: Vec2, tol = 1e-9): void => {
  near(a[0], b[0], tol);
  near(a[1], b[1], tol);
};

const cameras: [string, Camera][] = [
  ["cavalier", cavalierCamera()],
  ["cavalier 30°/0.7", cavalierCamera(30, 0.7)],
  ["isometric", isometricCamera()],
  ["orthographic 20/15", orthographicCamera(20, 15)],
  ["orthographic -60/40", orthographicCamera(-60, 40)],
];

// ---- the default camera is the textbook one ------------------------------------

test("cavalier: y right, z up at true scale; x recedes down-left at 45°, halved", () => {
  const cam = makeCamera();
  assert.equal(cam.kind, "cavalier");
  near2(project(cam, [0, 1, 0]), [1, 0]);
  near2(project(cam, [0, 0, 1]), [0, 1]);
  const x = project(cam, [1, 0, 0]);
  near(Math.hypot(x[0], x[1]), 0.5);
  near((Math.atan2(x[1], x[0]) * 180) / Math.PI, -135);
  near2(project(cam, [2, 3, 4]), [3 - Math.SQRT2 / 2, 4 - Math.SQRT2 / 2]);
});

test("isometric: the three axes are 120° apart on the page and equally foreshortened", () => {
  const cam = isometricCamera();
  const imgs = [cam.ex, cam.ey, cam.ez];
  const lens = imgs.map((v) => Math.hypot(v[0], v[1]));
  near(lens[0]!, lens[1]!);
  near(lens[1]!, lens[2]!);
  near(lens[0]!, Math.sqrt(2 / 3));
  for (let i = 0; i < 3; i += 1) {
    const a = imgs[i]!;
    const b = imgs[(i + 1) % 3]!;
    const cos = (a[0] * b[0] + a[1] * b[1]) / (lens[0]! * lens[0]!);
    near(cos, -0.5);
  }
  near(cam.params.elevation!, ISOMETRIC_ELEVATION);
  near2(cam.ez, [0, Math.sqrt(2 / 3)]);
});

test("orthographic: page right and up are orthonormal, and toward is perpendicular to both", () => {
  for (const [name, cam] of cameras.filter(([, c]) => c.kind !== "cavalier")) {
    const right: Vec3 = [cam.ex[0], cam.ey[0], cam.ez[0]];
    const up: Vec3 = [cam.ex[1], cam.ey[1], cam.ez[1]];
    near(length(right), 1);
    near(length(up), 1);
    near(dot(right, up), 0);
    near(dot(right, cam.toward), 0, 1e-12);
    near(dot(up, cam.toward), 0, 1e-12);
    // Right-handed: right × up = toward, so the reader looks down −toward.
    const c = cross3(right, up);
    for (let i = 0; i < 3; i += 1) near(c[i]!, cam.toward[i]!, 1e-12);
    assert.ok(up[2] >= 0, `${name}: z must draw upward`);
  }
});

test("bare-string and object camera specs agree; a degenerate camera is refused", () => {
  near2(makeCamera({ kind: "cavalier" }).ex, cavalierCamera().ex);
  near2(makeCamera("isometric").ex, isometricCamera().ex);
  near2(makeCamera({ kind: "orthographic", azimuth: 20, elevation: 15 }).ey, orthographicCamera(20, 15).ey);
  assert.throws(() => orthographicCamera(0, 90), GeometryError);
  assert.throws(() => cavalierCamera(45, 0), GeometryError);
});

// ---- points and directions ----------------------------------------------------------

test("projection is linear: directions carry no position, and a midpoint projects to the midpoint", () => {
  for (const [, cam] of cameras) {
    const a: Vec3 = [1, -2, 3];
    const b: Vec3 = [4, 0.5, -1];
    const pa = project(cam, a);
    const pb = project(cam, b);
    const pd = projectDirection(cam, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    near2([pb[0] - pa[0], pb[1] - pa[1]], pd);
    const mid = project(cam, scale(add(a, b), 0.5));
    near2(mid, [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]);
    near2(project(cam, [0, 0, 0]), [0, 0]);
  }
});

// ---- depth -----------------------------------------------------------------------------

test("toward is the kernel: moving a point along it leaves the page point and raises depth", () => {
  for (const [name, cam] of cameras) {
    const p: Vec3 = [0.3, 1.7, -2.2];
    const q = add(p, scale(cam.toward, 2.5));
    near2(project(cam, q), project(cam, p), 1e-12);
    near(depth(cam, q) - depth(cam, p), 2.5, 1e-12);
    assert.ok(depth(cam, q) > depth(cam, p), name);
  }
});

test("cavalier depth: of two points on one page spot, the one with larger x is nearer the reader", () => {
  const cam = cavalierCamera();
  // (2, 0, 0) and (0, −0.7071…, −0.7071…) share a page point.
  const a: Vec3 = [2, 0, 0];
  const b: Vec3 = [0, -Math.SQRT2 / 2, -Math.SQRT2 / 2];
  near2(project(cam, a), project(cam, b));
  assert.ok(depth(cam, a) > depth(cam, b));
});

test("planeDepthAt is the depth of the plane point on that page spot; edge-on planes have none", () => {
  for (const [, cam] of cameras) {
    const p0: Vec3 = [1, 2, 3];
    const n: Vec3 = [2, 1, -1];
    const onPlane: Vec3 = [2, 1, 4]; // 2·1 + 1·(−1) − 1·1 = 0 away from p0
    near(dot(n, [onPlane[0] - p0[0], onPlane[1] - p0[1], onPlane[2] - p0[2]]), 0);
    const d = planeDepthAt(cam, p0, n, project(cam, onPlane));
    assert.notEqual(d, null);
    near(d!, depth(cam, onPlane), 1e-9);
    const lifted = liftToRay(cam, [0.4, -1.1]);
    near2(project(cam, lifted), [0.4, -1.1], 1e-12);
  }
  const cam = orthographicCamera(0, 0); // looking along −x... toward = +x
  const side: Vec3 = [0, 0, 1];
  assert.equal(edgeOn(cam, side), true);
  assert.equal(planeDepthAt(cam, [0, 0, 0], side, [0, 0]), null);
  assert.equal(facesViewer(cam, [1, 0, 0]), true);
  assert.equal(facesViewer(cam, [-1, 0, 0]), false);
});

// ---- circles to ellipses ------------------------------------------------------------------

/** Implicit ellipse value at page point q: 1 on the curve. */
function ellipseLevel(e: Ellipse2, q: Vec2): number {
  const dx = q[0] - e.center[0];
  const dy = q[1] - e.center[1];
  const c = Math.cos(e.rotation);
  const s = Math.sin(e.rotation);
  const u = dx * c + dy * s;
  const v = -dx * s + dy * c;
  return (u / e.semiMajor) ** 2 + (v / e.semiMinor) ** 2;
}

test("circle → ellipse: every sampled point of the 3D circle lies on the returned ellipse", () => {
  const circles: [Vec3, Vec3, number][] = [
    [[0, 0, 0], [0, 0, 1], 2], // a cylinder's base on the floor
    [[1, 2, 3], [1, 0, 0], 1.5],
    [[-1, 0.5, 2], [1, 2, -2], 3],
    [[0, 0, 4], [0, 1, 0], 1],
  ];
  for (const [name, cam] of cameras) {
    for (const [c, n, r] of circles) {
      const pc = projectCircle(cam, c, n, r);
      assert.ok(pc.ellipse.semiMajor >= pc.ellipse.semiMinor - 1e-12, name);
      near2(pc.ellipse.center, project(cam, c));
      for (let k = 0; k < 24; k += 1) {
        const t = (k * 2 * Math.PI) / 24;
        const p3 = pc.point3(t);
        near(length([p3[0] - c[0], p3[1] - c[1], p3[2] - c[2]]), r, 1e-9);
        near(dot(n, [p3[0] - c[0], p3[1] - c[1], p3[2] - c[2]]), 0, 1e-9);
        near2(pc.point(t), project(cam, p3), 1e-9);
        if (pc.ellipse.semiMinor > 1e-6) near(ellipseLevel(pc.ellipse, pc.point(t)), 1, 1e-7);
        near(pc.depth(t), depth(cam, p3), 1e-12);
      }
      // The semi-axes are the extreme distances of sampled points from the centre.
      let max = 0;
      let min = Infinity;
      for (let k = 0; k < 3600; k += 1) {
        const q = pc.point((k * 2 * Math.PI) / 3600);
        const d = Math.hypot(q[0] - pc.ellipse.center[0], q[1] - pc.ellipse.center[1]);
        max = Math.max(max, d);
        min = Math.min(min, d);
      }
      near(max, pc.ellipse.semiMajor, 1e-4);
      near(min, pc.ellipse.semiMinor, 1e-4);
    }
  }
});

test("a floor circle under the cavalier camera: its major semi-axis is at least the true radius (y is unforeshortened)", () => {
  const pc = projectCircle(cavalierCamera(), [0, 0, 0], [0, 0, 1], 1);
  // y is at true scale and x at ½·45°: the widest page extent is along y.
  assert.ok(pc.ellipse.semiMajor >= 1 - 1e-12);
  const top = ellipsePoint(pc.ellipse, 0);
  near(Math.hypot(top[0], top[1]), pc.ellipse.semiMajor);
});

test("orthographic: a circle facing the camera projects to a circle, and a sphere's outline is its radius", () => {
  const cam = orthographicCamera(30, 25);
  const pc = projectCircle(cam, [1, 1, 1], cam.toward, 2);
  near(pc.ellipse.semiMajor, 2);
  near(pc.ellipse.semiMinor, 2);
  const s = sphereOutline(cam, [0, 0, 0], 3);
  near(s.ellipse.semiMajor, 3);
  near(s.ellipse.semiMinor, 3);
  // Edge-on: a degenerate ellipse, minor axis 0.
  const edge = projectCircle(cam, [0, 0, 0], [-Math.sin((30 * Math.PI) / 180), Math.cos((30 * Math.PI) / 180), 0], 1);
  near(edge.ellipse.semiMinor, 0, 1e-9);
});

test("a sphere under the oblique camera outlines as an ellipse that bounds every projected surface point", () => {
  const cam = cavalierCamera();
  const s = sphereOutline(cam, [0, 0, 0], 1);
  assert.ok(s.ellipse.semiMajor > s.ellipse.semiMinor + 1e-3, "oblique projection does not preserve circles");
  for (let i = 0; i < 40; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      const th = (i * 2 * Math.PI) / 40;
      const ph = (j * Math.PI) / 19;
      const p: Vec3 = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)];
      assert.ok(ellipseLevel(s.ellipse, project(cam, p)) <= 1 + 1e-9);
    }
  }
});

test("front half: frontCenter is the nearest point of the circle, its opposite the farthest", () => {
  for (const [, cam] of cameras) {
    const pc = projectCircle(cam, [0, 0, 0], [0.2, 0.1, 1], 1);
    let best = -Infinity;
    for (let k = 0; k < 3600; k += 1) best = Math.max(best, pc.depth((k * 2 * Math.PI) / 3600));
    near(pc.depth(pc.frontCenter), best, 1e-6);
    assert.ok(pc.depth(pc.frontCenter + Math.PI) < pc.depth(pc.frontCenter));
  }
});

test("silhouette tangency: parallel to a direction (cylinder) and from an external point (cone)", () => {
  for (const [, cam] of cameras) {
    const pc = projectCircle(cam, [0, 0, 0], [0, 0, 1], 1.5);
    const axis = projectDirection(cam, [0, 0, 1]);
    for (const t of tangentParamsParallelTo(pc, axis)) {
      const d: Vec2 = [-Math.sin(t) * pc.p[0] + Math.cos(t) * pc.q[0], -Math.sin(t) * pc.p[1] + Math.cos(t) * pc.q[1]];
      near(d[0] * axis[1] - d[1] * axis[0], 0, 1e-9);
    }
    const apex = project(cam, [0, 0, 4]);
    const ts = tangentParamsFrom(pc, apex);
    assert.equal(ts.length, 2);
    for (const t of ts) {
      const q = pc.point(t);
      const d: Vec2 = [-Math.sin(t) * pc.p[0] + Math.cos(t) * pc.q[0], -Math.sin(t) * pc.p[1] + Math.cos(t) * pc.q[1]];
      const w: Vec2 = [q[0] - apex[0], q[1] - apex[1]];
      near(w[0] * d[1] - w[1] * d[0], 0, 1e-9);
    }
    // From the centre (inside), no tangent exists.
    assert.deepEqual(tangentParamsFrom(pc, pc.ellipse.center), []);
  }
});

test("ellipseFromConjugates recovers an axis-aligned ellipse and refuses nothing degenerate silently", () => {
  const e = ellipseFromConjugates([1, 2], [3, 0], [0, 1]);
  near(e.semiMajor, 3);
  near(e.semiMinor, 1);
  near(e.rotation, 0);
  const tilted = ellipseFromConjugates([0, 0], [0, 2], [1, 0]);
  near(Math.abs(tilted.rotation), Math.PI / 2);
  assert.throws(() => projectCircle(cavalierCamera(), [0, 0, 0], [0, 0, 0], 1), GeometryError);
  assert.throws(() => projectCircle(cavalierCamera(), [0, 0, 0], [0, 0, 1], 0), GeometryError);
});
