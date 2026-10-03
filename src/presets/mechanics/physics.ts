/**
 * The physics of every mechanics kind, with no drawing: each solver takes the
 * typed situation and returns every quantity the figure draws or prints. The
 * tests check these against hand-worked values, and the figures are drawn
 * from them.
 */

export type PulleySolution = { P: number; tensions: number[]; F: number; advantage: number };

export function solvePulleys(mass: number, g: number, movable: number): PulleySolution {
  const P = mass * g;
  const tensions = Array.from({ length: movable }, (_, i) => P / 2 ** (i + 1));
  const F = movable === 0 ? P : tensions[movable - 1]!;
  return { P, tensions, F, advantage: 2 ** movable };
}

export type InclineSolution = { P: number; Px: number; Py: number; N: number; friction: number; sliding: boolean; a: number };

export function solveIncline(mass: number, g: number, angleDeg: number, mu?: number): InclineSolution {
  const t = (angleDeg * Math.PI) / 180;
  const P = mass * g;
  const Px = P * Math.sin(t);
  const Py = P * Math.cos(t);
  const N = Py;
  if (mu === undefined) return { P, Px, Py, N, friction: 0, sliding: true, a: g * Math.sin(t) };
  if (Math.tan(t) > mu) return { P, Px, Py, N, friction: mu * N, sliding: true, a: g * (Math.sin(t) - mu * Math.cos(t)) };
  return { P, Px, Py, N, friction: Px, sliding: false, a: 0 };
}

export type TableSolution = { PA: number; PB: number; N: number; friction: number; T: number; a: number; sliding: boolean };

/** Block A on a table, joined over a pulley at its edge to block B hanging. */
export function solveTable(mA: number, mB: number, g: number, mu?: number): TableSolution {
  const PA = mA * g;
  const PB = mB * g;
  const N = PA;
  const limit = mu === undefined ? 0 : mu * N;
  if (PB > limit) {
    const a = (PB - limit) / (mA + mB);
    return { PA, PB, N, friction: limit, T: mB * (g - a), a, sliding: true };
  }
  return { PA, PB, N, friction: PB, T: PB, a: 0, sliding: false };
}

export type AtwoodSolution = { P1: number; P2: number; T: number; a: number; heavier: 0 | 1 | 2 };

/** Two masses over one fixed pulley: a = |m₂ − m₁|g/(m₁ + m₂), T = 2m₁m₂g/(m₁ + m₂). */
export function solveAtwood(m1: number, m2: number, g: number): AtwoodSolution {
  return {
    P1: m1 * g,
    P2: m2 * g,
    T: (2 * m1 * m2 * g) / (m1 + m2),
    a: (Math.abs(m2 - m1) * g) / (m1 + m2),
    heavier: m1 === m2 ? 0 : m1 > m2 ? 1 : 2,
  };
}

export type SpringSolution = { P: number; x: number; Fel: number };

/** A block hanging at rest from a spring: k·x = m·g. */
export function solveSpring(mass: number, g: number, k: number): SpringSolution {
  const P = mass * g;
  return { P, x: P / k, Fel: P };
}

// ---- P1: kinematics, energy, statics, momentum, circular motion, gravitation ----------------------

export type ProjectileSolution = {
  vx: number;
  vy0: number;
  /** Time to the top (0 when launched horizontally or downward). */
  tUp: number;
  /** Height of the top above the ground. */
  H: number;
  /** Time of flight to the ground. */
  tFlight: number;
  /** Horizontal distance to the ground. */
  range: number;
  /** Position and velocity at time t. */
  at: (t: number) => { x: number; y: number; vx: number; vy: number };
};

/** A launch from height h0 with speed v0 at angle θ above the horizontal. */
export function solveProjectile(v0: number, angleDeg: number, g: number, h0 = 0): ProjectileSolution {
  const t = (angleDeg * Math.PI) / 180;
  const vx = v0 * Math.cos(t);
  const vy0 = v0 * Math.sin(t);
  const tUp = Math.max(0, vy0 / g);
  const H = h0 + (vy0 > 0 ? (vy0 * vy0) / (2 * g) : 0);
  const tFlight = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * h0)) / g;
  return {
    vx,
    vy0,
    tUp,
    H,
    tFlight,
    range: vx * tFlight,
    at: (time) => ({ x: vx * time, y: h0 + vy0 * time - (g * time * time) / 2, vx, vy: vy0 - g * time }),
  };
}

export type EnergyPoint = { name: string; height: number; Ep: number; Ek: number; E: number; v: number; reached: boolean };
export type EnergySolution = { E0: number; points: EnergyPoint[] };

/**
 * A body along a track of named points at given heights, starting at the
 * first with speed v0 (and an optional compressed spring); `lost` is the
 * energy dissipated on each stretch. A point whose kinetic energy would be
 * negative is not reached, and nor is any after it.
 */
export function solveEnergy(mass: number, g: number, points: { name: string; height: number }[], v0 = 0, spring?: { k: number; x: number }, lost: number[] = []): EnergySolution {
  const E0 = mass * g * points[0]!.height + (mass * v0 * v0) / 2 + (spring === undefined ? 0 : (spring.k * spring.x * spring.x) / 2);
  let E = E0;
  let reached = true;
  const out = points.map((p, i) => {
    if (i > 0) E -= lost[i - 1] ?? 0;
    const Ep = mass * g * p.height;
    const Ek = E - Ep;
    if (Ek < -1e-9) reached = false;
    const ok = reached;
    return { name: p.name, height: p.height, Ep, Ek: ok ? Math.max(0, Ek) : 0, E, v: ok ? Math.sqrt((2 * Math.max(0, Ek)) / mass) : 0, reached: ok };
  });
  return { E0, points: out };
}

export type LeverForce = { at: number; force: number; name: string };
export type LeverSolution = {
  /** The unknown, solved: the force at its arm, or the arm of the given force. */
  unknown: { at: number; force: number };
  /** Every force's torque about the support, signed (clockwise positive). */
  torques: { name: string; arm: number; torque: number }[];
  /** 1, 2 or 3 when there are exactly two forces; undefined otherwise. */
  leverClass?: 1 | 2 | 3;
};

/**
 * A beam on one support at `support`, loads pushing down at their positions,
 * and one unknown: the force at a given position, or the position of a given
 * force. Torques about the support sum to zero. Positions in metres from the
 * beam's left end.
 */
export function solveLever(support: number, loads: LeverForce[], unknown: { at: number } | { force: number }): LeverSolution {
  const known = loads.reduce((s, l) => s + l.force * (l.at - support), 0);
  let u: { at: number; force: number };
  if ("at" in unknown) {
    const arm = unknown.at - support;
    if (Math.abs(arm) < 1e-12) throw new Error("the unknown force acts at the support, where it has no torque");
    u = { at: unknown.at, force: -known / arm };
  } else {
    if (Math.abs(unknown.force) < 1e-12) throw new Error("a zero force balances nothing");
    u = { at: support - known / unknown.force, force: unknown.force };
  }
  const torques = [...loads, { ...u, name: "F" }].map((f) => ({ name: f.name, arm: f.at - support, torque: f.force * (f.at - support) }));
  let leverClass: 1 | 2 | 3 | undefined;
  if (loads.length === 1) {
    const load = loads[0]!.at;
    const between = (a: number, b: number, c: number): boolean => (a - b) * (c - b) < 0;
    if (between(load, support, u.at)) leverClass = 1;
    else if (between(support, load, u.at)) leverClass = 2;
    else leverClass = 3;
  }
  return { unknown: u, torques, ...(leverClass === undefined ? {} : { leverClass }) };
}

export type CollisionSolution = { v1: number; v2: number; p: number; Ek0: number; Ek1: number; lost: number };

/**
 * Two bodies on a line, velocities signed (right positive). Restitution e: 1
 * elastic, 0 perfectly inelastic (they move together), between: partially.
 */
export function solveCollision(m1: number, m2: number, u1: number, u2: number, e: number): CollisionSolution {
  const p = m1 * u1 + m2 * u2;
  const v1 = (p - m2 * e * (u1 - u2)) / (m1 + m2);
  const v2 = (p + m1 * e * (u1 - u2)) / (m1 + m2);
  const Ek0 = (m1 * u1 * u1 + m2 * u2 * u2) / 2;
  const Ek1 = (m1 * v1 * v1 + m2 * v2 * v2) / 2;
  return { v1, v2, p, Ek0, Ek1, lost: Ek0 - Ek1 };
}

/** Two bodies at rest together (or moving at u) push apart: v2 from momentum, given v1. */
export function solveExplosion(m1: number, m2: number, v1: number, u = 0): CollisionSolution {
  const p = (m1 + m2) * u;
  const v2 = (p - m1 * v1) / m2;
  const Ek0 = ((m1 + m2) * u * u) / 2;
  const Ek1 = (m1 * v1 * v1 + m2 * v2 * v2) / 2;
  return { v1, v2, p, Ek0, Ek1, lost: Ek0 - Ek1 };
}

export type CircularSolution = { v: number; omega: number; T: number; f: number; ac: number };

/** Uniform circular motion of radius R from a speed or a period. */
export function solveCircular(R: number, by: { speed: number } | { period: number }): CircularSolution {
  const v = "speed" in by ? by.speed : (2 * Math.PI * R) / by.period;
  const T = (2 * Math.PI * R) / v;
  return { v, omega: v / R, T, f: 1 / T, ac: (v * v) / R };
}

export type LoopSolution = { vMin: number; v: number; P: number; N: number; contact: boolean };

/** A body at the top of a vertical loop of radius R: N + P = m v²/R. */
export function solveLoop(mass: number, g: number, R: number, v?: number): LoopSolution {
  const vMin = Math.sqrt(g * R);
  const speed = v ?? vMin;
  const P = mass * g;
  const N = (mass * speed * speed) / R - P;
  return { vMin, v: speed, P, N: Math.max(0, N), contact: N >= -1e-9 };
}

export type BankedSolution = { P: number; N: number; Fc: number; vIdeal: number };

/** A curve of radius R banked at θ, no friction: N cos θ = P, N sen θ = m v²/R. */
export function solveBanked(mass: number, g: number, R: number, angleDeg: number): BankedSolution {
  const t = (angleDeg * Math.PI) / 180;
  const P = mass * g;
  return { P, N: P / Math.cos(t), Fc: P * Math.tan(t), vIdeal: Math.sqrt(g * R * Math.tan(t)) };
}

export type ConicalSolution = { P: number; T: number; Fc: number; r: number; v: number; period: number };

/** A bob on a string of length L sweeping a horizontal circle, the string at θ from the vertical. */
export function solveConical(mass: number, g: number, L: number, angleDeg: number): ConicalSolution {
  const t = (angleDeg * Math.PI) / 180;
  const P = mass * g;
  const r = L * Math.sin(t);
  return { P, T: P / Math.cos(t), Fc: P * Math.tan(t), r, v: Math.sqrt(g * r * Math.tan(t)), period: 2 * Math.PI * Math.sqrt((L * Math.cos(t)) / g) };
}

export type OrbitSolution = {
  a: number;
  b: number;
  e: number;
  /** Distances from the star at perihelion and aphelion. */
  rp: number;
  ra: number;
  /** v_p / v_a = r_a / r_p (conservation of angular momentum). */
  speedRatio: number;
  /** Position at a fraction of the period after perihelion, star at the origin, perihelion on +x. */
  at: (fraction: number) => { x: number; y: number };
};

/** A Kepler ellipse of semi-major axis a and eccentricity e; positions by Kepler's equation. */
export function solveOrbit(a: number, e: number): OrbitSolution {
  const b = a * Math.sqrt(1 - e * e);
  const at = (fraction: number): { x: number; y: number } => {
    const M = 2 * Math.PI * fraction;
    let E = M;
    for (let i = 0; i < 50; i += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return { x: a * (Math.cos(E) - e), y: b * Math.sin(E) };
  };
  return { a, b, e, rp: a * (1 - e), ra: a * (1 + e), speedRatio: (1 + e) / (1 - e), at };
}