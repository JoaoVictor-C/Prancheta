/**
 * Modified Nodal Analysis for DC circuits of ideal elements (ADR 0053).
 *
 * The circuit preset draws a circuit whose layout is GIVEN; this module is
 * where every current and every potential it prints comes from. It knows
 * nothing about drawing: it takes a netlist of two-terminal elements between
 * named nodes and returns each node's potential and each element's current.
 *
 * Element kinds, each with its terminals `a` (the input's `from`) and `b`
 * (`to`):
 *
 *  - `R` -- a resistance `value` > 0 (resistor, lamp);
 *  - `V` -- an ideal voltage source of `value` volts, `+` terminal at `b`
 *    (battery, voltage source);
 *  - `A` -- an ideal ammeter: a 0 V source, so its current is an unknown of
 *    the system rather than a difference of potentials;
 *  - `I` -- an ideal current source driving `value` amperes THROUGH itself
 *    from `a` to `b`;
 *  - `W` -- a wire (or a closed switch): its two ends are ONE node, merged
 *    before the system is built, so a wire costs no unknown.
 *
 * An open switch and an ideal voltmeter conduct nothing and are simply not
 * passed in.
 *
 * The system is the textbook one, [G B; C D][v; j] = [i; e], with C = Bᵀ and
 * D = 0 for independent sources, solved by Gaussian elimination with partial
 * pivoting. Before it is built, every way this project has seen a DC netlist
 * be unsolvable is detected STRUCTURALLY and refused by name, so the one
 * message a reader never gets is "singular matrix":
 *
 *  - a voltage source or ammeter whose two terminals wires join (a short);
 *  - a loop made only of voltage sources and ammeters (KVL is either
 *    redundant or contradictory around it);
 *  - a subcircuit with no conducting path to the ground node (it floats: its
 *    potentials are undetermined);
 *  - a set of nodes joined to the rest ONLY through current sources (a
 *    current source in series with an open circuit: KCL cannot hold).
 *
 * The residual check after elimination stays as a last line of defence.
 */

export type MnaKind = "R" | "V" | "A" | "I" | "W";

export type MnaElement = { id: string; kind: MnaKind; a: string; b: string; value: number };

export type MnaInput = {
  /** Every node name that exists, including those only open elements touch. */
  nodes: string[];
  elements: MnaElement[];
  /** The reference node, V = 0. Default: the `−` terminal (`a`) of the first V, else the `a` of the first I, else the first node with an element. */
  ground?: string;
};

export type MnaSolution = {
  /** Potential of every node that has one; a node no conducting element touches is absent -- its potential is undetermined. */
  potential: Map<string, number>;
  /** Current THROUGH each element from `a` to `b` (A and W excluded: A is here, W never is). */
  current: Map<string, number>;
  /** The node chosen as reference. */
  ground: string;
  /** Which merged node each named node belongs to (wires make several names one node). */
  merged: Map<string, string>;
};

/** Refused netlist, with a message a student can act on. */
export class CircuitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitError";
  }
}

// ---- union-find -----------------------------------------------------------------

class Dsu {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p === x) return x;
    p = this.find(p);
    this.parent.set(x, p);
    return p;
  }
  union(a: string, b: string): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent.set(rb, ra);
    return true;
  }
}

/** A path of elements from `from` to `to` in an undirected multigraph, by BFS, or null. */
function pathBetween(edges: { id: string; u: string; v: string }[], from: string, to: string): string[] | null {
  const prev = new Map<string, { node: string; id: string } | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const x = queue.shift()!;
    if (x === to) break;
    for (const e of edges) {
      const y = e.u === x ? e.v : e.v === x ? e.u : undefined;
      if (y === undefined || prev.has(y)) continue;
      prev.set(y, { node: x, id: e.id });
      queue.push(y);
    }
  }
  if (!prev.has(to)) return null;
  const ids: string[] = [];
  let at = to;
  while (at !== from) {
    const p = prev.get(at)!;
    ids.push(p!.id);
    at = p!.node;
  }
  return ids.reverse();
}

/** Connected groups of `nodes` under `edges`. */
function groups(nodes: string[], edges: { u: string; v: string }[]): string[][] {
  const d = new Dsu();
  for (const e of edges) d.union(e.u, e.v);
  const byRoot = new Map<string, string[]>();
  for (const n of nodes) {
    const r = d.find(n);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(n);
  }
  return [...byRoot.values()];
}

const list = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ---- the solver -------------------------------------------------------------------

/**
 * Solve A x = b by Gaussian elimination with partial pivoting. Throws
 * CircuitError on a pivot below `tiny` relative to the matrix's scale.
 */
export function gaussSolve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  const scale = Math.max(1e-300, ...A.flat().map(Math.abs));
  const tiny = 1e-12 * scale;
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) <= tiny) throw new CircuitError(`the circuit's equations are singular (no pivot in column ${col + 1})`);
    if (piv !== col) [M[col], M[piv]] = [M[piv]!, M[col]!];
    const p = M[col]!;
    for (let r = col + 1; r < n; r += 1) {
      const row = M[r]!;
      const f = row[col]! / p[col]!;
      if (f === 0) continue;
      for (let k = col; k <= n; k += 1) row[k] = row[k]! - f * p[k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    const row = M[r]!;
    let s = row[n]!;
    for (let k = r + 1; k < n; k += 1) s -= row[k]! * x[k]!;
    x[r] = s / row[r]!;
  }
  return x;
}

export function solveMna(input: MnaInput): MnaSolution {
  const names = new Set(input.nodes);
  for (const e of input.elements) {
    for (const t of [e.a, e.b]) if (!names.has(t)) throw new CircuitError(`${e.id}: unknown node ${JSON.stringify(t)}`);
    if (e.kind === "R" && !(e.value > 0 && Number.isFinite(e.value))) {
      throw new CircuitError(`${e.id}: a resistance must be a positive number, got ${e.value} -- an ideal connection is a wire`);
    }
    if ((e.kind === "V" || e.kind === "I") && !Number.isFinite(e.value)) throw new CircuitError(`${e.id}: value must be a finite number`);
  }

  // 1. Wires make one node of their ends.
  const dsu = new Dsu();
  const wires = input.elements.filter((e) => e.kind === "W");
  for (const w of wires) dsu.union(w.a, w.b);
  const node = (n: string): string => dsu.find(n);
  const merged = new Map(input.nodes.map((n) => [n, node(n)]));
  const wireEdges = wires.map((w) => ({ id: w.id, u: w.a, v: w.b }));

  // 2. A source or ammeter whose terminals wires join.
  const vlike = input.elements.filter((e) => e.kind === "V" || e.kind === "A");
  for (const e of vlike) {
    if (node(e.a) !== node(e.b)) continue;
    const via = pathBetween(wireEdges, e.a, e.b) ?? [];
    if (e.kind === "V") {
      throw new CircuitError(`${e.id} is short-circuited: its terminals ${e.a} and ${e.b} are joined by ${list(via)} (wires or closed switches), so an ideal source would drive an infinite current`);
    }
    throw new CircuitError(`ammeter ${e.id} is bypassed: its terminals ${e.a} and ${e.b} are joined by ${list(via)}, so the current divides between two paths of zero resistance and its reading is undetermined`);
  }

  // 3. A loop of voltage sources and ammeters.
  const loopDsu = new Dsu();
  const vEdges: { id: string; u: string; v: string }[] = [];
  for (const e of vlike) {
    const u = node(e.a);
    const v = node(e.b);
    if (!loopDsu.union(u, v)) {
      const rest = pathBetween(vEdges, u, v) ?? [];
      const loop = [...rest, e.id];
      throw new CircuitError(`${list(loop)} form a loop of ideal voltage sources and ammeters with nothing else in it: Kirchhoff's voltage law around it is either redundant or contradictory, so the currents in it are undetermined -- add the internal resistance of a source as a resistor in the loop`);
    }
    vEdges.push({ id: e.id, u, v });
  }

  // 4. The reference node.
  const conducting = input.elements.filter((e) => e.kind !== "W");
  const touched = new Set<string>();
  for (const e of conducting) {
    touched.add(node(e.a));
    touched.add(node(e.b));
  }
  if (touched.size === 0) throw new CircuitError("the circuit has no element that conducts: nothing to solve");
  const firstV = input.elements.find((e) => e.kind === "V");
  const firstI = input.elements.find((e) => e.kind === "I");
  let ground = input.ground;
  if (ground !== undefined) {
    if (!names.has(ground)) throw new CircuitError(`ground: unknown node ${JSON.stringify(ground)}`);
    if (!touched.has(node(ground))) throw new CircuitError(`ground: node ${ground} is touched by no conducting element, so it cannot be the reference`);
  } else {
    ground = firstV?.a ?? firstI?.a ?? conducting[0]!.a;
  }
  const g = node(ground);
  const nodesOf = (root: string): string[] => input.nodes.filter((n) => node(n) === root);

  // 5. Floating subcircuits.
  const roots = [...touched];
  const allEdges = conducting.map((e) => ({ u: node(e.a), v: node(e.b) }));
  for (const grp of groups(roots, allEdges)) {
    if (grp.includes(g)) continue;
    const members = grp.flatMap(nodesOf);
    const ids = conducting.filter((e) => grp.includes(node(e.a))).map((e) => e.id);
    throw new CircuitError(`the subcircuit of ${list(ids)} (nodes ${list(members)}) has no conducting path to the reference node ${ground}: it floats, and its potentials are undetermined -- connect it, or remove it`);
  }

  // 6. Nodes reached only through current sources.
  const noI = conducting.filter((e) => e.kind !== "I").map((e) => ({ u: node(e.a), v: node(e.b) }));
  for (const grp of groups(roots, noI)) {
    if (grp.includes(g)) continue;
    const members = grp.flatMap(nodesOf);
    const sources = conducting.filter((e) => e.kind === "I" && (grp.includes(node(e.a)) !== grp.includes(node(e.b)))).map((e) => e.id);
    throw new CircuitError(`current source ${list(sources)} is in series with an open circuit: nodes ${list(members)} connect to the rest of the circuit only through current sources, so Kirchhoff's current law cannot hold there unless the source's current is zero`);
  }

  // 7. Build and solve.
  const index = new Map<string, number>();
  for (const r of roots) if (r !== g) index.set(r, index.size);
  const n = index.size;
  const m = vlike.length;
  const size = n + m;
  const A = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const rhs = new Array<number>(size).fill(0);
  const at = (x: string): number | undefined => index.get(node(x));
  for (const e of conducting) {
    const i = at(e.a);
    const j = at(e.b);
    if (e.kind === "R") {
      const G = 1 / e.value;
      if (i !== undefined) A[i]![i]! += G;
      if (j !== undefined) A[j]![j]! += G;
      if (i !== undefined && j !== undefined) {
        A[i]![j]! -= G;
        A[j]![i]! -= G;
      }
    } else if (e.kind === "I") {
      // `value` flows from a, through the source, to b: it leaves node a and enters node b.
      if (i !== undefined) rhs[i]! -= e.value;
      if (j !== undefined) rhs[j]! += e.value;
    }
  }
  vlike.forEach((e, k) => {
    const row = n + k;
    const plus = at(e.b);
    const minus = at(e.a);
    // j_k is the current leaving the + node INTO the source (from b to a, inside).
    if (plus !== undefined) {
      A[plus]![row] = 1;
      A[row]![plus] = 1;
    }
    if (minus !== undefined) {
      A[minus]![row] = -1;
      A[row]![minus] = -1;
    }
    rhs[row] = e.kind === "V" ? e.value : 0;
  });
  const x = size === 0 ? [] : gaussSolve(A, rhs);

  // Residual: a last guard against a near-singular system the structural checks missed.
  for (let r = 0; r < size; r += 1) {
    let s = 0;
    for (let c = 0; c < size; c += 1) s += A[r]![c]! * x[c]!;
    if (!(Math.abs(s - rhs[r]!) <= 1e-7 * Math.max(1, Math.abs(rhs[r]!)))) throw new CircuitError("the circuit's equations are ill-conditioned: the solution does not satisfy them to 1e-7");
  }

  const potential = new Map<string, number>();
  for (const name of input.nodes) {
    const root = node(name);
    if (!touched.has(root)) continue;
    const i = index.get(root);
    potential.set(name, i === undefined ? 0 : x[i]! + 0);
  }
  const current = new Map<string, number>();
  for (const e of conducting) {
    const va = potential.get(e.a)!;
    const vb = potential.get(e.b)!;
    if (e.kind === "R") current.set(e.id, (va - vb) / e.value);
    else if (e.kind === "I") current.set(e.id, e.value);
  }
  vlike.forEach((e, k) => current.set(e.id, -x[n + k]! + 0));
  return { potential, current, ground, merged };
}

// ---- diodes: piecewise-linear states, solved until consistent ----------------------------------------

/**
 * A diode (or LED) of forward drop `vf`: `a` is the anode, `b` the cathode,
 * and conventional current is allowed from `a` to `b` only.
 *
 * The model is the piecewise-linear one a physics course uses. ON: the
 * diode holds exactly `vf` volts (V_a − V_b = vf) and conducts i ≥ 0; OFF: it
 * conducts nothing, and the circuit must leave it V_a − V_b ≤ vf. `vf = 0` is
 * the ideal diode.
 */
export type MnaDiode = { id: string; a: string; b: string; vf: number };

export type DiodeState = {
  on: boolean;
  /** Current through the diode from anode to cathode (0 when off). */
  current: number;
  /** V_a − V_b, or undefined when a terminal touches nothing that conducts. */
  drop: number | undefined;
};

export type DiodeSolution = MnaSolution & { diodes: Map<string, DiodeState> };

const MAX_DIODES = 14;

/**
 * Solve a netlist that contains diodes. The states are not guessed and
 * iterated: EVERY on/off assignment is solved (2ⁿ systems, n ≤ 14) and kept
 * only if it is self-consistent -- each ON diode carries i ≥ 0 and each OFF
 * one sees V_a − V_b ≤ vf. Exactly one consistent assignment is the answer.
 * None, or two that differ electrically, is refused: the circuit has no
 * single reading, and a figure printing one would pick it silently. An
 * assignment that is the same electrically (a diode exactly at its knee
 * carries 0 either way) is not an ambiguity.
 */
export function solveWithDiodes(input: MnaInput, diodes: MnaDiode[]): DiodeSolution {
  if (diodes.length === 0) return { ...solveMna(input), diodes: new Map() };
  if (diodes.length > MAX_DIODES) throw new CircuitError(`${diodes.length} diodes: this solver tries every on/off state and stops at ${MAX_DIODES}`);
  for (const d of diodes) {
    if (!Number.isFinite(d.vf) || d.vf < 0) throw new CircuitError(`${d.id}: a forward voltage must be zero or positive, got ${d.vf}`);
  }
  type Candidate = { mask: number; sol: MnaSolution; states: Map<string, DiodeState>; ons: number };
  const good: Candidate[] = [];
  let firstError: CircuitError | undefined;
  let solved = 0;
  for (let mask = 0; mask < 1 << diodes.length; mask += 1) {
    const elements = [...input.elements];
    diodes.forEach((d, k) => {
      if ((mask >> k) & 1) elements.push({ id: d.id, kind: "V", a: d.b, b: d.a, value: d.vf });
    });
    let sol: MnaSolution;
    try {
      sol = solveMna({ ...input, elements });
    } catch (e) {
      if (e instanceof CircuitError) {
        firstError ??= e;
        continue;
      }
      throw e;
    }
    solved += 1;
    let scale = 1;
    for (const p of sol.potential.values()) scale = Math.max(scale, Math.abs(p));
    for (const c of sol.current.values()) scale = Math.max(scale, Math.abs(c));
    const tol = 1e-9 * scale;
    const states = new Map<string, DiodeState>();
    let consistent = true;
    diodes.forEach((d, k) => {
      const on = ((mask >> k) & 1) === 1;
      const va = sol.potential.get(d.a);
      const vb = sol.potential.get(d.b);
      const drop = va === undefined || vb === undefined ? undefined : va - vb;
      if (on) {
        // The V element's current runs cathode → anode inside it; the diode's own is the opposite.
        const i = -(sol.current.get(d.id) ?? 0) + 0;
        if (i < -tol) consistent = false;
        states.set(d.id, { on: true, current: i, drop });
      } else {
        if (drop !== undefined && drop > d.vf + tol) consistent = false;
        states.set(d.id, { on: false, current: 0, drop });
      }
    });
    if (consistent) good.push({ mask, sol, states, ons: diodes.filter((_, k) => (mask >> k) & 1).length });
  }
  if (solved === 0) throw firstError!;
  const names = diodes.map((d) => d.id);
  if (good.length === 0) {
    throw new CircuitError(`no on/off state of ${list(names)} is consistent: the diodes cannot all agree with the currents and drops they would produce, so the circuit has no steady reading`);
  }
  const same = (x: Candidate, y: Candidate): boolean => {
    let scale = 1;
    for (const p of x.sol.potential.values()) scale = Math.max(scale, Math.abs(p));
    const tol = 1e-8 * scale;
    for (const [n, p] of x.sol.potential) {
      const q = y.sol.potential.get(n);
      if (q !== undefined && Math.abs(p - q) > tol) return false;
    }
    for (const d of diodes) if (Math.abs(x.states.get(d.id)!.current - y.states.get(d.id)!.current) > tol) return false;
    return true;
  };
  good.sort((p, q) => p.ons - q.ons);
  const pick = good[0]!;
  const other = good.find((g) => !same(pick, g));
  if (other !== undefined) {
    const describe = (c: Candidate): string => names.map((n) => `${n} ${c.states.get(n)!.on ? "on" : "off"}`).join(", ");
    throw new CircuitError(`the diodes' states are ambiguous: both (${describe(pick)}) and (${describe(other)}) are self-consistent, so the figure cannot print one reading without choosing -- add a path that decides it`);
  }
  return { ...pick.sol, diodes: pick.states };
}
