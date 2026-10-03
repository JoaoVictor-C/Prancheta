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
