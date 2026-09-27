/**
 * Seeded exercise variants: fresh numbers for the same exercise, admitted
 * only when every figure they produce still passes its own checks and every
 * number they carry is "nice" (PLAN-COVERAGE.md, Phase 2).
 *
 * A student revising from a generated list wants the SAME exercise with
 * DIFFERENT numbers, not a different exercise. That means sampling
 * parameters from a declared domain, filtering the draws through declarative
 * predicates this module can check without running anything the author
 * wrote, and -- because "nice" also means "the figure this produces is not
 * broken" -- letting the caller run each draw's parameters through the real
 * pipeline (parse the sheet exercise, render its figures, run their checks)
 * before a variant is admitted. This module owns the sampling and the
 * admission loop; it does not know what a figure or a sheet is.
 *
 * ## Why this PRNG (mulberry32)
 *
 * "Same seed, same sequence, on every machine" rules out `Math.random`
 * (unseedable) and anything built on `crypto` (platform-dependent, and
 * overkill for a study aid). mulberry32 is a 32-bit generator: one `uint32`
 * of state, five operations per call, no dependency, and it is
 * bit-reproducible across every JS engine because it only ever does 32-bit
 * integer arithmetic that `>>> 0` pins down exactly -- no float rounding
 * differences between V8 builds or Node versions the way a naive xorshift
 * over doubles could have. It is not cryptographically secure and does not
 * need to be: nothing here is a secret, only a reproducible study sheet.
 *
 * ## Why declarative predicates, not a callback the author writes
 *
 * A predicate that was arbitrary JavaScript would be unauditable -- a typo
 * in a hand-rolled "is this a nice fraction" check would silently admit bad
 * variants, and no manifest could explain what it rejected other than
 * "returned false." Declarative predicates are named, their arguments are
 * data, and the rejection statistics this module returns can say exactly
 * which named predicate rejected how many draws -- something a caller could
 * put next to "distinct" or "positive" in a manifest and trust.
 */

import { compileIn, ExprError } from "../math/expr.ts";

// --- PRNG --------------------------------------------------------------

/** A pure function: current 32-bit state in, next state and value out. */
export type Rng = () => number;

/**
 * mulberry32: seed with any 32-bit integer, get a deterministic stream of
 * floats in [0, 1). See the module doc comment for why this generator.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string seed (e.g. an exercise id) to a 32-bit integer, deterministically. */
export function seedFrom(text: string): number {
  // FNV-1a, 32-bit -- small, dependency-free, and stable across platforms.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// --- domains -------------------------------------------------------------

export type Domain =
  | { int: [number, number]; exclude?: number[] }
  | { choice: (number | string)[] }
  | { decimal: [number, number, number] }
  | { sign: true };

export type Domains = Record<string, Domain>;

/** The value a domain samples to: a number, unless a `choice` entry is a string ("1/2"). */
export type ParamValue = number | string;

export class VariantsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariantsError";
  }
}

function isDomain(v: unknown): v is Domain {
  return typeof v === "object" && v !== null && ("int" in v || "choice" in v || "decimal" in v || "sign" in v);
}

/** Quantise `value` to the nearest multiple of `step` from `lo`, absorbing float noise. */
function quantise(value: number, lo: number, step: number): number {
  const steps = Math.round((value - lo) / step);
  const q = lo + steps * step;
  // Round to kill 0.1 + 0.2-style noise so a 0,5 step prints as "0,5", not "0,49999999999999994".
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 2);
  return Number(q.toFixed(decimals));
}

/** Sample one value from `domain` with `rng`. Throws `VariantsError` on a malformed domain. */
export function sampleDomain(name: string, domain: Domain, rng: Rng): ParamValue {
  if (!isDomain(domain)) {
    throw new VariantsError(
      `domain "${name}": unknown shape. Expected one of "int", "choice", "decimal", "sign".`,
    );
  }
  if ("int" in domain) {
    const [lo, hi] = domain.int;
    if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo <= hi)) {
      throw new VariantsError(`domain "${name}": "int" needs [lo, hi] integers with lo <= hi, got [${lo}, ${hi}]`);
    }
    const exclude = new Set(domain.exclude ?? []);
    const pool: number[] = [];
    for (let v = lo; v <= hi; v += 1) if (!exclude.has(v)) pool.push(v);
    if (pool.length === 0) throw new VariantsError(`domain "${name}": "int" [${lo}, ${hi}] excludes every value in range`);
    return pool[randInt(rng, 0, pool.length - 1)]!;
  }
  if ("choice" in domain) {
    if (!Array.isArray(domain.choice) || domain.choice.length === 0) {
      throw new VariantsError(`domain "${name}": "choice" needs a non-empty array`);
    }
    return domain.choice[randInt(rng, 0, domain.choice.length - 1)]!;
  }
  if ("decimal" in domain) {
    const [lo, hi, step] = domain.decimal;
    if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi)) {
      throw new VariantsError(`domain "${name}": "decimal" needs [lo, hi, step] with lo <= hi, got [${lo}, ${hi}, ${step}]`);
    }
    if (!(Number.isFinite(step) && step > 0)) {
      throw new VariantsError(`domain "${name}": "decimal" step must be a positive number, got ${step}`);
    }
    const count = Math.floor((hi - lo) / step + 1e-9) + 1;
    if (count < 1) throw new VariantsError(`domain "${name}": "decimal" [${lo}, ${hi}] has no step-quantised value`);
    const k = randInt(rng, 0, count - 1);
    return quantise(lo + k * step, lo, step);
  }
  // { sign: true }
  if (domain.sign !== true) throw new VariantsError(`domain "${name}": "sign" must be true`);
  return rng() < 0.5 ? -1 : 1;
}

/** Sample every declared parameter once, in declaration order, with one shared `rng`. */
export function sampleParams(domains: Domains, rng: Rng): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [name, domain] of Object.entries(domains)) out[name] = sampleDomain(name, domain, rng);
  return out;
}

// --- predicates ------------------------------------------------------------

export type Predicate =
  | { integer: string }
  | { fraction: string; maxDen?: number }
  | { range: [string, number, number] }
  | { nonzero: string }
  | { distinct: string[] }
  | { positive: string };

export type PredicateResult = { ok: true } | { ok: false; reason: string };

/** Environment a predicate evaluates over: every sampled/derived value, numbers only. */
export type Env = Readonly<Record<string, number>>;

/**
 * The number a sampled value stands for. A `choice` entry may be a string
 * such as "1/2": it is read as a constant expression (no variables), never
 * `eval`ed. A string that is not a constant expression is refused -- a
 * variant's values are numbers, because they are handed on as numeric
 * overrides of an exercise's params.
 */
export function numericValue(name: string, value: ParamValue): number {
  if (typeof value === "number") return value;
  try {
    const v = compileIn(value, [])();
    if (Number.isFinite(v)) return v;
  } catch {
    // fall through to the refusal below
  }
  throw new VariantsError(`domain "${name}": the value ${JSON.stringify(value)} is not a number or a constant expression`);
}

/** Every sampled value as a number (see `numericValue`). */
export function toNumbers(params: Readonly<Record<string, ParamValue>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params)) out[k] = numericValue(k, v);
  return out;
}

function evalNamed(name: string, expr: string, env: Env): number {
  let fn: (...values: number[]) => number;
  try {
    fn = compileIn(expr, Object.keys(env));
  } catch (err) {
    throw new VariantsError(`predicate "${name}": cannot parse "${expr}": ${err instanceof ExprError ? err.message : String(err)}`);
  }
  const value = fn(...Object.keys(env).map((k) => env[k]!));
  if (!Number.isFinite(value)) {
    throw new VariantsError(`predicate "${name}": "${expr}" is not finite over the sampled parameters`);
  }
  return value;
}

const KNOWN_PREDICATE_KINDS = ["integer", "fraction", "range", "nonzero", "distinct", "positive"] as const;

function predicateKind(p: Predicate): (typeof KNOWN_PREDICATE_KINDS)[number] {
  for (const kind of KNOWN_PREDICATE_KINDS) if (Object.hasOwn(p, kind)) return kind;
  throw new VariantsError(
    `predicate: unknown kind. Expected one of ${KNOWN_PREDICATE_KINDS.map((k) => `"${k}"`).join(", ")}, got keys [${Object.keys(p).join(", ")}].`,
  );
}

/** Human-readable, stable name for a predicate -- used as a rejection-stats key. */
export function predicateName(p: Predicate): string {
  const kind = predicateKind(p);
  switch (kind) {
    case "integer":
      return `integer(${(p as { integer: string }).integer})`;
    case "fraction":
      return `fraction(${(p as { fraction: string }).fraction})`;
    case "range": {
      const [e, lo, hi] = (p as { range: [string, number, number] }).range;
      return `range(${e}, ${lo}, ${hi})`;
    }
    case "nonzero":
      return `nonzero(${(p as { nonzero: string }).nonzero})`;
    case "distinct":
      return `distinct(${(p as { distinct: string[] }).distinct.join(", ")})`;
    case "positive":
      return `positive(${(p as { positive: string }).positive})`;
  }
}

/**
 * Evaluate one predicate over `env`. Refuses (throws `VariantsError`) an
 * unknown predicate kind or an expression naming an undeclared variable --
 * both are the caller's mistake, not a draw to reject and keep sampling
 * past.
 */
export function checkPredicate(p: Predicate, env: Env): PredicateResult {
  const kind = predicateKind(p);
  switch (kind) {
    case "integer": {
      const expr = (p as { integer: string }).integer;
      const v = evalNamed("integer", expr, env);
      const near = Math.round(v);
      return Math.abs(v - near) <= 1e-9 ? { ok: true } : { ok: false, reason: `${expr} = ${v} is not an integer` };
    }
    case "fraction": {
      const { fraction: expr, maxDen = 12 } = p as { fraction: string; maxDen?: number };
      const v = evalNamed("fraction", expr, env);
      for (let q = 1; q <= maxDen; q += 1) {
        const num = Math.round(v * q);
        if (Math.abs(num / q - v) <= 1e-9) return { ok: true };
      }
      return { ok: false, reason: `${expr} = ${v} has no denominator <= ${maxDen}` };
    }
    case "range": {
      const [expr, lo, hi] = (p as { range: [string, number, number] }).range;
      const v = evalNamed("range", expr, env);
      return v >= lo && v <= hi ? { ok: true } : { ok: false, reason: `${expr} = ${v} is outside [${lo}, ${hi}]` };
    }
    case "nonzero": {
      const expr = (p as { nonzero: string }).nonzero;
      const v = evalNamed("nonzero", expr, env);
      return Math.abs(v) > 1e-9 ? { ok: true } : { ok: false, reason: `${expr} = 0` };
    }
    case "positive": {
      const expr = (p as { positive: string }).positive;
      const v = evalNamed("positive", expr, env);
      return v > 1e-9 ? { ok: true } : { ok: false, reason: `${expr} = ${v} is not positive` };
    }
    case "distinct": {
      const exprs = (p as { distinct: string[] }).distinct;
      if (exprs.length < 2) throw new VariantsError(`predicate "distinct": needs at least two expressions`);
      const values = exprs.map((e) => evalNamed("distinct", e, env));
      for (let i = 0; i < values.length; i += 1) {
        for (let j = i + 1; j < values.length; j += 1) {
          if (Math.abs(values[i]! - values[j]!) <= 1e-9) {
            return { ok: false, reason: `${exprs[i]} = ${exprs[j]} = ${values[i]}` };
          }
        }
      }
      return { ok: true };
    }
  }
}

// --- admission -------------------------------------------------------------

export type AdmitResult = { ok: boolean; reasons: string[] };
export type Admit = (params: Readonly<Record<string, ParamValue>>) => Promise<AdmitResult>;

/** What an `evaluate` callback returns when a draw's params cannot be computed. */
export type Refusal = { refused: string };

/**
 * Turns one draw's sampled values into the environment predicates see:
 * every param the exercise has, sampled and derived, as numbers. The sheet
 * backs this with `calc.evaluateParams` -- the ONE evaluator of params -- so
 * a predicate is checked against exactly the value the sheet will print.
 * Return `{ refused }` (a pole inside an integral, say) to reject the draw
 * under that reason; throw only for a mistake that no draw could avoid.
 */
export type Evaluate = (sampled: Readonly<Record<string, ParamValue>>) => Env | Refusal | Promise<Env | Refusal>;

export interface GenerateOptions {
  domains: Domains;
  /** Checked in array order; the first failing predicate is the draw's rejection reason. */
  predicates?: Predicate[];
  /** How many admitted variants to produce. */
  count: number;
  /** Seed for the PRNG -- a number, or a string hashed with `seedFrom`. */
  seed: number | string;
  /** Draws to attempt before giving up. Default 50 * count, floor 200. */
  maxTries?: number;
  /**
   * The environment predicates are evaluated over. Default: the sampled
   * values alone, as numbers. A caller whose params derive from the sampled
   * ones supplies its own evaluator here rather than restating the
   * derivations -- this module computes no derived value itself.
   */
  evaluate?: Evaluate;
  /**
   * Optional async check run AFTER every declarative predicate passes: the
   * integrator renders the variant's real figures and reports whether they
   * checked out. A draw it rejects is counted under its own reasons, same as
   * a failed predicate.
   */
  admit?: Admit;
  /** Pin variant 0 to these exact values instead of sampling it -- see module doc. */
  pinFirst?: Record<string, ParamValue>;
}

export interface Variant {
  /** 0-based index in the admitted sequence -- variant 0 is `pinFirst` when given. */
  index: number;
  /** The sampled values, as drawn ("1/2" stays "1/2"). */
  params: Record<string, ParamValue>;
  /** What `evaluate` returned for them: the environment the predicates passed on. */
  env: Env;
  /** How many draws (including rejected ones) this variant took to reach. */
  triesUsed: number;
}

export interface GenerateResult {
  variants: Variant[];
  /** Total draws attempted, admitted or not, including `pinFirst` if given. */
  triesUsed: number;
  /** Per-reason rejection counts: a predicate's `predicateName`, "duplicate", or an evaluate/admit reason string. */
  rejections: Record<string, number>;
  /** Set when `count` was not reached before `maxTries` ran out. */
  shortfall?: { requested: number; admitted: number; message: string };
}

function bump(rejections: Record<string, number>, key: string): void {
  rejections[key] = (rejections[key] ?? 0) + 1;
}

/** Two draws are the same draw when they stand for the same numbers: "1/2" and 0.5 collide. */
function paramsKey(params: Readonly<Record<string, ParamValue>>): string {
  return JSON.stringify(
    Object.keys(params)
      .sort()
      .map((k) => {
        const v = params[k]!;
        try {
          return [k, numericValue(k, v)];
        } catch {
          return [k, v];
        }
      }),
  );
}

const isRefusal = (v: Env | Refusal): v is Refusal =>
  typeof (v as Refusal).refused === "string" && Object.keys(v).length === 1;

/**
 * Sample `count` admissible parameter sets from `domains`, deterministically,
 * filtered through `predicates` and the optional `admit` callback. See the
 * module doc comment for the PRNG and predicate-declarative rationale.
 *
 * Never loops forever: stops at `maxTries` draws (default `50 * count`,
 * floor 200) and reports a `shortfall` if `count` was not reached, alongside
 * whatever was admitted and a full rejection breakdown.
 */
export async function generateVariants(options: GenerateOptions): Promise<GenerateResult> {
  const { domains, predicates = [], count, seed, admit, pinFirst } = options;
  const evaluate: Evaluate = options.evaluate ?? ((sampled) => toNumbers(sampled));
  if (!Number.isInteger(count) || count < 1) throw new VariantsError(`count must be a positive integer, got ${count}`);
  const maxTries = options.maxTries ?? Math.max(200, 50 * count);
  if (!Number.isInteger(maxTries) || maxTries < 1) throw new VariantsError(`maxTries must be a positive integer, got ${maxTries}`);

  const seedNum = typeof seed === "string" ? seedFrom(seed) : seed >>> 0;
  const rng = mulberry32(seedNum);

  const rejections: Record<string, number> = {};
  const variants: Variant[] = [];
  const seen = new Set<string>();
  let tries = 0;
  /** Why the pinned draw failed, for the error that follows. */
  let pinnedWhy = "";

  const tryAdmit = async (params: Record<string, ParamValue>): Promise<boolean> => {
    const key = paramsKey(params);
    if (seen.has(key)) {
      bump(rejections, "duplicate");
      pinnedWhy = "duplicate";
      return false;
    }
    const env = await evaluate(params);
    if (isRefusal(env)) {
      bump(rejections, env.refused);
      pinnedWhy = env.refused;
      return false;
    }
    for (const p of predicates) {
      const result = checkPredicate(p, env);
      if (!result.ok) {
        bump(rejections, predicateName(p));
        pinnedWhy = result.reason;
        return false;
      }
    }
    if (admit !== undefined) {
      const result = await admit(params);
      if (!result.ok) {
        const reasons = result.reasons.length > 0 ? result.reasons : ["admit: rejected"];
        for (const r of reasons) bump(rejections, r);
        pinnedWhy = reasons.join("; ");
        return false;
      }
    }
    seen.add(key);
    variants.push({ index: variants.length, params, env: { ...env }, triesUsed: tries });
    return true;
  };

  if (pinFirst !== undefined) {
    tries += 1;
    const admitted = await tryAdmit({ ...pinFirst });
    if (!admitted) {
      throw new VariantsError(
        `pinFirst was rejected by its own predicates or admit callback (${pinnedWhy}) -- ` +
          `the author's own exercise must always be admissible.`,
      );
    }
  }

  while (variants.length < count && tries < maxTries) {
    tries += 1;
    await tryAdmit(sampleParams(domains, rng));
  }

  const result: GenerateResult = { variants, triesUsed: tries, rejections };
  if (variants.length < count) {
    result.shortfall = {
      requested: count,
      admitted: variants.length,
      message: `requested ${count} variant(s), admitted ${variants.length} after ${tries} draw(s) (maxTries ${maxTries}). ` +
        `Rejections: ${Object.entries(rejections).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}.`,
    };
  }
  return result;
}
