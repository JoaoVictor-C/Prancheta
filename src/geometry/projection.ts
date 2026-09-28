/**
 * A camera: how a point of R³ lands on the page, and which of two points
 * that land on the same spot is nearer the reader.
 *
 * Every camera here is a PARALLEL projection -- a linear map R³ → R² -- so a
 * straight line stays straight, parallel lines stay parallel, and the
 * midpoint of a segment projects to the midpoint of its image. Those three
 * facts are what let a Geometria Analítica figure be drawn by projecting
 * computed endpoints and joining them, with nothing re-derived in 2D.
 *
 * Three families (ADR 0045):
 *
 *  - **cavalier** (the default) -- the oblique view Brazilian Geometria
 *    Analítica textbooks draw in: y to the right, z up, both at true scale,
 *    and x coming TOWARD the reader, drawn receding down-left at `angle`
 *    (45°) and foreshortened by `ratio` (½). Strictly, ½ makes it the
 *    "cabinet" variant of the oblique family; textbooks and teachers call it
 *    perspectiva cavaleira either way, and so does this code.
 *  - **isometric** -- orthographic, looking down the (1, 1, 1) diagonal.
 *  - **orthographic** -- a general view from `azimuth` (from +x toward +y)
 *    and `elevation` (above the xy-plane), in degrees.
 *
 * Page convention: the 2D coordinates returned here are MATH coordinates,
 * y up, one unit per unit. A caller that draws on a canvas (y down, pixels)
 * scales and flips once, at the very end.
 *
 * ## Depth
 *
 * A parallel projection sends a whole line of R³ -- the line through p along
 * the camera's kernel direction `toward` -- to one page point. Two points
 * that share a page point therefore differ by a multiple of `toward`, and
 * `depth(p) = toward · p` orders them: larger is nearer the reader. For an
 * orthographic camera `toward` is the viewing direction; for an oblique one
 * it is NOT perpendicular to the page, and using the page normal instead is
 * the classic mistake that dashes the wrong half of a line. Depth compares
 * only points that share a page position; it is not a distance to anything.
 */

import { GeometryError, cross3, dot, length, normalize, scale, sub, add, DEFAULT_TOLERANCE } from "./vec.ts";
import type { Vec2, Vec3 } from "./vec.ts";

// ---- cameras ------------------------------------------------------------

export type CameraKind = "cavalier" | "isometric" | "orthographic";

/** How an author names a camera. A bare string takes that family's defaults. */
export type CameraSpec =
  | CameraKind
  | { kind: "cavalier"; angle?: number; ratio?: number }
  | { kind: "isometric" }
  | { kind: "orthographic"; azimuth: number; elevation: number };

export interface Camera {
  readonly kind: CameraKind;
  /** Page images (y up) of the unit vectors along x, y and z. */
  readonly ex: Vec2;
  readonly ey: Vec2;
  readonly ez: Vec2;
  /** Unit vector toward the reader along the projection direction: `project(p + t·toward)` is `project(p)` for every t. */
  readonly toward: Vec3;
  /** The parameters the camera was built from, for a caption or a test. */
  readonly params: Readonly<Record<string, number>>;
}

/** Default oblique receding angle, degrees below the horizontal, and foreshortening. */
export const CAVALIER_ANGLE = 45;
export const CAVALIER_RATIO = 0.5;
/** Isometric elevation: the (1, 1, 1) diagonal's angle above the xy-plane, asin(1/√3). */
export const ISOMETRIC_ELEVATION = (Math.asin(1 / Math.sqrt(3)) * 180) / Math.PI;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * The oblique (cavalier/cabinet) camera: y → (1, 0), z → (0, 1), and x →
 * ratio·(−cos α, −sin α). Its kernel -- the 3D direction every point of
 * which lands on the origin -- is (1, ratio·cos α, ratio·sin α), and the
 * reader sits on its +x side, since x is the axis that comes toward them.
 */
export function cavalierCamera(angle = CAVALIER_ANGLE, ratio = CAVALIER_RATIO): Camera {
  if (!Number.isFinite(angle) || !Number.isFinite(ratio)) throw new GeometryError("cavalierCamera: angle and ratio must be finite");
  if (ratio <= 0) throw new GeometryError(`cavalierCamera: ratio must be positive, got ${ratio}`);
  const a = rad(angle);
  const ex: Vec2 = [-ratio * Math.cos(a), -ratio * Math.sin(a)];
  const kernel: Vec3 = [1, ratio * Math.cos(a), ratio * Math.sin(a)];
  return { kind: "cavalier", ex, ey: [1, 0], ez: [0, 1], toward: normalize(kernel), params: { angle, ratio } };
}

/**
 * The orthographic camera looking from direction (cos e·cos a, cos e·sin a,
 * sin e). Page right is (−sin a, cos a, 0), horizontal; page up is what
 * completes the frame, so the z axis always draws straight up.
 */
export function orthographicCamera(azimuth: number, elevation: number, kind: CameraKind = "orthographic"): Camera {
  if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) throw new GeometryError("orthographicCamera: azimuth and elevation must be finite");
  if (Math.abs(elevation) >= 90) throw new GeometryError(`orthographicCamera: elevation ${elevation}° looks straight along z -- the z axis would vanish`);
  const az = rad(azimuth);
  const el = rad(elevation);
  const toward: Vec3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const right: Vec3 = [-Math.sin(az), Math.cos(az), 0];
  const up = cross3(toward, right);
  return {
    kind,
    ex: [right[0], up[0]],
    ey: [right[1], up[1]],
    ez: [right[2], up[2]],
    toward,
    params: { azimuth, elevation },
  };
}

export function isometricCamera(): Camera {
  return orthographicCamera(45, ISOMETRIC_ELEVATION, "isometric");
}

/** A camera from its spec; the default is the textbook cavalier view. */
export function makeCamera(spec: CameraSpec = "cavalier"): Camera {
  if (spec === "cavalier") return cavalierCamera();
  if (spec === "isometric") return isometricCamera();
  if (spec === "orthographic") return orthographicCamera(30, 20);
  if (spec.kind === "cavalier") return cavalierCamera(spec.angle ?? CAVALIER_ANGLE, spec.ratio ?? CAVALIER_RATIO);
  if (spec.kind === "isometric") return isometricCamera();
  return orthographicCamera(spec.azimuth, spec.elevation);
}

// ---- points, directions, depth -------------------------------------------

/** The page image of a direction (a free vector): the linear part of the camera, with no position. */
export function projectDirection(camera: Camera, d: Vec3): Vec2 {
  return [
    d[0] * camera.ex[0] + d[1] * camera.ey[0] + d[2] * camera.ez[0],
    d[0] * camera.ex[1] + d[1] * camera.ey[1] + d[2] * camera.ez[1],
  ];
}

/** The page image of a point. The origin of R³ lands on the page origin. */
export function project(camera: Camera, p: Vec3): Vec2 {
  return projectDirection(camera, p);
}

/** How near the reader `p` is, comparable only between points that share a page position: larger is nearer. */
export function depth(camera: Camera, p: Vec3): number {
  return dot(camera.toward, p);
}

/** Does a plane with this normal show the side the normal points to? False when the reader sees the other face (and for an edge-on plane). */
export function facesViewer(camera: Camera, normal: Vec3): boolean {
  return dot(camera.toward, normal) > 0;
}

/** Is a plane with this normal seen edge-on -- does it project to a line? Measured as the sine-free cosine between its normal and the view, scale-invariant. */
export function edgeOn(camera: Camera, normal: Vec3, tolerance = 1e-9): boolean {
  return Math.abs(dot(camera.toward, normal)) <= tolerance * length(normal);
}

/**
 * The depth of the plane (point `p0`, normal `n`) at the page position
 * `page`: where the viewing ray through that page point meets the plane.
 * Null when the plane is seen edge-on (the ray lies in it or never meets it).
 */
export function planeDepthAt(camera: Camera, p0: Vec3, n: Vec3, page: Vec2): number | null {
  const denom = dot(n, camera.toward);
  if (Math.abs(denom) <= 1e-12 * length(n)) return null;
  // Any 3D point on the ray: solve for one whose projection is `page`,
  // using the page basis spanned by two of the axis images.
  const base = liftToRay(camera, page);
  const t = dot(n, sub(p0, base)) / denom;
  return depth(camera, add(base, scale(camera.toward, t)));
}

/**
 * One 3D point projecting to `page`. The camera's linear map has rank 2, so
 * some pair of axis images is independent; the point is built from that
 * pair and has depth-ambiguity along `toward` only, as every lift must.
 */
export function liftToRay(camera: Camera, page: Vec2): Vec3 {
  const imgs = [camera.ex, camera.ey, camera.ez];
  let best: [number, number] = [1, 2];
  let bestDet = 0;
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) {
    const d = imgs[i]![0] * imgs[j]![1] - imgs[i]![1] * imgs[j]![0];
    if (Math.abs(d) > Math.abs(bestDet)) {
      bestDet = d;
      best = [i, j];
    }
  }
  const [i, j] = best;
  const a = imgs[i]!;
  const b = imgs[j]!;
  const s = (page[0] * b[1] - page[1] * b[0]) / bestDet;
  const t = (a[0] * page[1] - a[1] * page[0]) / bestDet;
  const out: [number, number, number] = [0, 0, 0];
  out[i] = s;
  out[j] = t;
  return out;
}

// ---- circles and ellipses -------------------------------------------------

/** An ellipse on the page: centre, semi-axes (major ≥ minor ≥ 0) and the major axis's angle from +x, radians, counter-clockwise, in (−π/2, π/2]. */
export interface Ellipse2 {
  readonly center: Vec2;
  readonly semiMajor: number;
  readonly semiMinor: number;
  readonly rotation: number;
}

/** A 3D circle and its page image, parameterised so a caller can ask what any point of it is, and how near the reader. */
export interface ProjectedCircle {
  readonly ellipse: Ellipse2;
  /** The circle's own orthonormal in-plane basis: circle(t) = center + r(cos t·u + sin t·v). */
  readonly u: Vec3;
  readonly v: Vec3;
  /** The page images of r·u and r·v -- a pair of conjugate semi-diameters of the ellipse. */
  readonly p: Vec2;
  readonly q: Vec2;
  /** The 3D point at parameter t. */
  point3(t: number): Vec3;
  /** Its page image. */
  point(t: number): Vec2;
  /** Its depth. */
  depth(t: number): number;
  /** The parameter of the point nearest the reader; the near half is t ∈ [frontCenter − π/2, frontCenter + π/2]. */
  readonly frontCenter: number;
}

/**
 * Semi-axes and rotation of the ellipse traced by c + cos t·p + sin t·q.
 *
 * With A = [p q], the ellipse is A applied to the unit circle, so its
 * semi-axes are A's singular values: the square roots of the eigenvalues
 * of S = p·pᵀ + q·qᵀ, along S's eigenvectors. Closed form for a symmetric
 * 2×2, no iteration.
 */
export function ellipseFromConjugates(center: Vec2, p: Vec2, q: Vec2): Ellipse2 {
  const sxx = p[0] * p[0] + q[0] * q[0];
  const syy = p[1] * p[1] + q[1] * q[1];
  const sxy = p[0] * p[1] + q[0] * q[1];
  const mean = (sxx + syy) / 2;
  const radius = Math.hypot((sxx - syy) / 2, sxy);
  const major = Math.sqrt(Math.max(0, mean + radius));
  const minor = Math.sqrt(Math.max(0, mean - radius));
  let rotation = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (rotation <= -Math.PI / 2) rotation += Math.PI;
  return { center, semiMajor: major, semiMinor: minor, rotation };
}

/** The point of `e` at its own angle φ (φ = 0 is the end of the major axis). */
export function ellipsePoint(e: Ellipse2, phi: number): Vec2 {
  const c = Math.cos(e.rotation);
  const s = Math.sin(e.rotation);
  const a = e.semiMajor * Math.cos(phi);
  const b = e.semiMinor * Math.sin(phi);
  return [e.center[0] + a * c - b * s, e.center[1] + a * s + b * c];
}

/** An orthonormal pair spanning the plane perpendicular to `n`. Deterministic: seeded from the axis least aligned with n. */
export function planeBasis(n: Vec3, tolerance = DEFAULT_TOLERANCE): [Vec3, Vec3] {
  const nn = normalize(n, tolerance);
  const ax = Math.abs(nn[0]);
  const ay = Math.abs(nn[1]);
  const az = Math.abs(nn[2]);
  const seed: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  const u = normalize(sub(seed, scale(nn, dot(seed, nn))), tolerance);
  const v = cross3(nn, u);
  return [u, v];
}

/**
 * The page image of the circle with this centre, normal and radius -- the
 * ellipse a cylinder's base, a cone's base or a sphere's equator draws as.
 * Refuses a non-positive radius and a zero normal.
 */
export function projectCircle(camera: Camera, center: Vec3, normal: Vec3, radius: number, tolerance = DEFAULT_TOLERANCE): ProjectedCircle {
  if (!(radius > 0) || !Number.isFinite(radius)) throw new GeometryError(`projectCircle: radius must be positive, got ${radius}`);
  if (length(normal) <= tolerance) throw new GeometryError("projectCircle: the zero vector is not a circle's normal");
  const [u, v] = planeBasis(normal, tolerance);
  const p = projectDirection(camera, scale(u, radius));
  const q = projectDirection(camera, scale(v, radius));
  const c2 = project(camera, center);
  const point3 = (t: number): Vec3 => add(center, add(scale(u, radius * Math.cos(t)), scale(v, radius * Math.sin(t))));
  return {
    ellipse: ellipseFromConjugates(c2, p, q),
    u,
    v,
    p,
    q,
    point3,
    point: (t: number): Vec2 => [c2[0] + p[0] * Math.cos(t) + q[0] * Math.sin(t), c2[1] + p[1] * Math.cos(t) + q[1] * Math.sin(t)],
    depth: (t: number): number => depth(camera, point3(t)),
    frontCenter: Math.atan2(dot(v, camera.toward), dot(u, camera.toward)),
  };
}

/**
 * The page outline of a sphere: the projection of its great circle
 * perpendicular to the viewing direction. A circle under an orthographic
 * camera; an ELLIPSE under an oblique one, which is why cavalier textbook
 * figures draw spheres "wrong" on purpose -- see ADR 0045.
 */
export function sphereOutline(camera: Camera, center: Vec3, radius: number): ProjectedCircle {
  return projectCircle(camera, center, camera.toward, radius);
}

const cross2d = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];

/**
 * The two parameters (t, t + π) where the projected circle's tangent is
 * parallel to the page direction `w` -- where a cylinder's silhouette
 * generators touch its base ellipse, `w` being the image of its axis.
 */
export function tangentParamsParallelTo(pc: ProjectedCircle, w: Vec2): [number, number] {
  const t = Math.atan2(cross2d(pc.q, w), cross2d(pc.p, w));
  return [t, t + Math.PI];
}

/**
 * The parameters where the tangent from the page point `s` touches the
 * projected circle -- where a cone's silhouette from its apex image meets
 * its base ellipse. Empty when `s` lies inside the ellipse (the apex is
 * seen through the base: no silhouette lines).
 *
 * (c − s + cos t·p + sin t·q) × (−sin t·p + cos t·q) = 0 expands to
 * A·sin t + B·cos t + p×q = 0 with A = −(c−s)×p, B = (c−s)×q.
 */
export function tangentParamsFrom(pc: ProjectedCircle, s: Vec2): number[] {
  const c = pc.ellipse.center;
  const w: Vec2 = [c[0] - s[0], c[1] - s[1]];
  const A = -cross2d(w, pc.p);
  const B = cross2d(w, pc.q);
  const K = cross2d(pc.p, pc.q);
  const R = Math.hypot(A, B);
  if (R <= Math.abs(K)) return [];
  const phi = Math.atan2(A, B);
  const delta = Math.acos(-K / R);
  return [phi + delta, phi - delta];
}
