/**
 * Computed text: parameters and `{{= …}}` (ADR 0040).
 *
 * "Calcule a área de 0 a 2" in a statement, the bound 2 in the figure's
 * `areas`, and "8/3" in the answer were three typed copies of facts that
 * could drift apart -- and a generator of randomised variants (Phase 2) can
 * only change an exercise's numbers if every one of them derives from a
 * single place. That place is the exercise's `params`:
 *
 *   "params": { "a": 2, "b": "a + 1", "f(x)": "a*x^2" }
 *
 * A param is a number, or an expression over the other params (the closed
 * grammar of `expr.ts`, plus the calculus functions below); a key written
 * `f(x)` defines a FUNCTION of x over the params. Order does not matter:
 * dependencies are followed, and a cycle or an unknown name is refused by
 * name. A sheet may carry its own `params`, shared by every exercise; an
 * exercise may not redefine one of them.
 *
 * In the text, `{{= <expression>}}` prints a value through the one formatter
 * (ADR 0023), snapped to an exact form when it is one (8/3, √2, π/2 -- the
 * snapping helper that function-graph, sign-chart and value-table now share),
 * as TeX inside math and as text outside. `{{a}}` is shorthand for `{{= a}}`,
 * and `{{f}}` prints a param function's formula with the params filled in.
 * The calculus functions, computed by `numeric.ts` and refused when it
 * refuses:
 *
 *   integral(body, x, lo, hi)   adaptive Simpson; a pole inside [lo, hi] is refused by name
 *   deriv(body, x, at)          central difference with one Richardson step; a corner is refused
 *   lim(body, x, at[, side])    side is left or right; at may be inf or -inf
 *   f(2)                        a param function at a value
 *
 * These are not in `expr.ts`, whose functions take one argument and whose
 * tokenizer refuses a comma. They are read HERE, by a scanner that finds each
 * call, splits its arguments at top-level commas, computes it, and hands
 * `expr.ts` the expression with the call replaced by its value -- so the
 * grammar stays closed (nothing is `eval`ed) and `expr.ts` is untouched.
 *
 * In a figure, a string that is exactly one `{{= …}}` becomes a number, and
 * a `{{…}}` inside a longer string (an expression, `"{{= a}}*x^2"`) is
 * written in expression syntax: `(1/3)`, `sqrt(2)`, `(pi/2)`, never the pt-BR
 * "0,5" the tokenizer would refuse. `{{f}}` names a param function and
 * writes its expression with the params filled in. Whatever is left
 * unresolved is refused.
 */

import { SpecError } from "../ir/types.ts";
import { ExprError, FUNCTION_NAMES, compileTree, evaluate, freeVariables, parseIn, pretty } from "../math/expr.ts";
import type { Node } from "../math/expr.ts";
import { NumericError, integrate, limit } from "../math/numeric.ts";
import type { LimitResult } from "../math/numeric.ts";
import {
  MINUS,
  formatNumber,
  formatNumberTex,
  snapExact,
  writeExact,
  writeExactTex,
} from "../locale/format.ts";
import type { Exact, Locale } from "../locale/format.ts";
import { singularCandidates } from "../presets/function-graph/asymptotes.ts";
import { criticalPoints } from "../presets/sign-chart/preset.ts";

// ---- types ------------------------------------------------------------------------

/** As written in the sheet: a number, an expression, or (key `f(x)`) a function body. */
export type ParamSpec = Readonly<Record<string, number | string>>;

export type ParamFunction = {
  /** The variable as written in the key: "x" for `f(x)`. */
  variable: string;
  /** The body over `variable` and the value params, other functions already inlined. */
  tree: Node;
};

/** Every param, evaluated: what `{{= …}}` and figure substitution read. */
export type ParamEnv = {
  readonly values: ReadonlyMap<string, number>;
  readonly functions: ReadonlyMap<string, ParamFunction>;
};

export const EMPTY_ENV: ParamEnv = { values: new Map(), functions: new Map() };

/** A computed value: a number (with its exact form, if it has one), or ±∞ from a limit. */
export type CalcValue =
  | { kind: "number"; value: number; exact: Exact }
  | { kind: "infinite"; sign: 1 | -1 };

// ---- names --------------------------------------------------------------------------

const CALC = ["integral", "deriv", "lim"] as const;
type CalcName = (typeof CALC)[number];
const NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const FUNCTION_KEY = /^([A-Za-z][A-Za-z0-9]*)\(\s*(θ|[A-Za-z][A-Za-z0-9]*)\s*\)$/;
const RESERVED = new Set<string>([...FUNCTION_NAMES, ...CALC, "pi", "e", "theta", "inf", "left", "right"]);

/**
 * How precisely each source of a number is known, as a relative tolerance:
 * what the result is snapped with. Arithmetic on params is exact to the last
 * bits; Simpson is asked for 1e-9 absolute; a central difference with one
 * Richardson step settles to about 1e-8 on a textbook function; a numeric
 * limit's tail settles to about 1e-5 (numeric.ts, LIMIT_CONVERGE_TOL). An
 * expression is snapped at the loosest tolerance among the calls it makes.
 */
const TOLERANCE: Record<CalcName | "arithmetic", number> = {
  arithmetic: 1e-9,
  integral: 1e-7,
  deriv: 1e-6,
  lim: 1e-5,
};

function reservedWhy(name: string): string | undefined {
  if (!NAME.test(name)) return "a name is a letter followed by letters or digits";
  if (/^figure\d*$/.test(name)) return "{{figure}}, {{figure2}}... already mark where figures go";
  if (RESERVED.has(name)) {
    return (CALC as readonly string[]).includes(name) || FUNCTION_NAMES.includes(name)
      ? "it is already a function"
      : name === "pi" || name === "e"
        ? "it is already a constant"
        : "it is a word the calculus functions read (inf, left, right)";
  }
  return undefined;
}

// ---- the evaluator ------------------------------------------------------------------

/** What a computation can see: the declared value names, resolved lazily so order never matters. */
type Context = {
  /** Every value param's name, for `parseIn`. */
  declared: readonly string[];
  value(name: string): number;
  fn(name: string): ParamFunction | undefined;
  isFunction(name: string): boolean;
};

const fail = (where: string, message: string): never => {
  throw new SpecError(`${where}: ${message}`);
};

/** Run `body`, turning an expression or numeric refusal into a SpecError that says where. */
function guarded<T>(where: string, body: () => T): T {
  try {
    return body();
  } catch (error) {
    if (error instanceof ExprError || error instanceof NumericError) fail(where, error.message);
    throw error;
  }
}

/** A tree written back as source `expr.ts` parses: fully parenthesised, names renamed through `rename`. */
function sourceOf(node: Node, rename: ReadonlyMap<string, string> = new Map()): string {
  switch (node.kind) {
    case "num":
      return node.value < 0 || /e/i.test(String(node.value)) ? `(${String(node.value)})` : String(node.value);
    case "var":
      return rename.get(node.name) ?? node.name;
    case "const":
      return node.name === "e" ? "e" : "pi";
    case "neg":
      return `(-${sourceOf(node.arg, rename)})`;
    case "call":
      return `${node.name}(${sourceOf(node.arg, rename)})`;
    case "bin":
      return `(${sourceOf(node.left, rename)}${node.op}${sourceOf(node.right, rename)})`;
  }
}

type Call = { name: string; args: string[]; start: number; end: number };

/** The run of letters at `i` (the expr.ts tokenizer's notion of a name), or null. */
function nameAt(s: string, i: number): string | null {
  const m = /^(π|θ|[A-Za-z][A-Za-z0-9]*)/.exec(s.slice(i));
  return m === null ? null : m[0];
}

/** Arguments of the call whose "(" is at `open`: split at top-level commas, and where it ends. */
function callArgs(s: string, open: number, where: string): { args: string[]; end: number } {
  let depth = 0;
  let from = open + 1;
  const args: string[] = [];
  for (let i = open; i < s.length; i += 1) {
    const c = s[i];
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) {
        args.push(s.slice(from, i).trim());
        return { args, end: i + 1 };
      }
    } else if (c === "," && depth === 1) {
      args.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  return fail(where, `"${s}": "(" at position ${open + 1} is never closed`);
}

/**
 * Walk `s` the way the expr.ts tokenizer does, and hand every call to a
 * calculus function or a param function to `onCall`, which returns its
 * replacement text. Everything else is copied unchanged.
 */
function rewriteCalls(s: string, ctx: Context, where: string, onCall: (call: Call) => string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      const len = m === null ? 1 : m[0].length;
      out += s.slice(i, i + len);
      i += len;
      continue;
    }
    const name = nameAt(s, i);
    if (name === null) {
      out += c;
      i += 1;
      continue;
    }
    let j = i + name.length;
    while (j < s.length && /\s/.test(s[j]!)) j += 1;
    if (s[j] === "(" && ((CALC as readonly string[]).includes(name) || ctx.isFunction(name))) {
      const { args, end } = callArgs(s, j, where);
      out += onCall({ name, args, start: i, end });
      i = end;
      continue;
    }
    out += name;
    i += name.length;
  }
  return out;
}

/**
 * `s` with every param-function call inlined as its body. A calculus call is
 * refused: this is the text of a body over a free variable (an integrand, a
 * function definition), and a number computed inside it would have to be
 * computed at every x.
 */
function inlineFunctions(s: string, ctx: Context, where: string, what: string): string {
  return rewriteCalls(s, ctx, where, (call) => {
    if ((CALC as readonly string[]).includes(call.name)) {
      return fail(where, `"${s}": ${call.name}(…) cannot appear inside ${what}; compute it in a param and use that`);
    }
    if (call.args.length !== 1) {
      return fail(where, `"${s}": ${call.name} is a function of one variable, called with ${call.args.length} arguments`);
    }
    const f = ctx.fn(call.name)!;
    const arg = inlineFunctions(call.args[0]!, ctx, where, what);
    return `(${sourceOf(f.tree, new Map([[f.variable, `(${arg})`]]))})`;
  });
}

/** A body over `variable` and the params, as a callable of `variable` with the params filled in. */
function bodyFunction(
  body: string,
  variable: string,
  ctx: Context,
  where: string,
  call: string,
): { f: (x: number) => number; tree: Node } {
  if (!NAME.test(variable) && variable !== "θ") fail(where, `${call}: "${variable}" is not a variable name`);
  if (ctx.declared.includes(variable)) {
    fail(where, `${call}: the variable "${variable}" is also a param; name the variable something else`);
  }
  const text = inlineFunctions(body, ctx, where, `${call}'s expression`);
  const tree = guarded(where, () => parseIn(text, [variable, ...ctx.declared]));
  const params = [...freeVariables(tree)].filter((n) => n !== variable);
  const values = params.map((n) => ctx.value(n));
  // The tree with the params replaced by their values: what the pole search reads.
  const numeric = substituteTree(tree, new Map(params.map((n, k) => [n, values[k]!])));
  const g = compileTree(numeric, [variable]);
  return { f: (x: number) => g(x), tree: numeric };
}

function substituteTree(node: Node, values: ReadonlyMap<string, number>): Node {
  switch (node.kind) {
    case "var": {
      const v = values.get(node.name);
      if (v === undefined) return node;
      return v < 0 ? { kind: "neg", arg: { kind: "num", value: -v } } : { kind: "num", value: v };
    }
    case "neg":
      return { kind: "neg", arg: substituteTree(node.arg, values) };
    case "call":
      return { kind: "call", name: node.name, arg: substituteTree(node.arg, values) };
    case "bin":
      return { ...node, left: substituteTree(node.left, values), right: substituteTree(node.right, values) };
    default:
      return node;
  }
}

/** A computed number that must be finite -- a bound, a point, an argument. */
function finiteArg(source: string, ctx: Context, where: string, what: string): number {
  const v = calc(source, ctx, where);
  if (v.kind !== "number") fail(where, `${what} "${source}" is ${v.sign > 0 ? "+∞" : "−∞"}, and a number was needed`);
  return (v as { value: number }).value;
}

function integralCall(args: string[], ctx: Context, where: string): { value: number } {
  if (args.length !== 4) fail(where, `integral takes (expression, variable, from, to); got ${args.length} arguments`);
  const [body, variable, loText, hiText] = args as [string, string, string, string];
  const call = `integral(${args.join(", ")})`;
  const { f, tree } = bodyFunction(body, variable, ctx, where, call);
  const lo = finiteArg(loText, ctx, where, "the lower bound");
  const hi = finiteArg(hiText, ctx, where, "the upper bound");
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  if (a < b) {
    // A pole inside [a, b] makes the integral improper: numeric.ts would
    // refuse it only if a sample happened to land on the pole. Look for it
    // on purpose and name it.
    const candidates = [
      ...guarded(where, () => singularCandidates(tree, variable, a, b)),
      ...criticalPoints(f, a, b).filter((c) => c.kind === "pole").map((c) => c.x),
    ];
    for (const c of candidates) {
      if (c < a - 1e-12 || c > b + 1e-12) continue;
      const sides: LimitResult[] = [];
      if (c > a) sides.push(limit(f, c, "left"));
      if (c < b) sides.push(limit(f, c, "right"));
      if (sides.some((s) => s.kind === "infinite")) {
        fail(
          where,
          `${call}: the expression has a pole at ${variable} = ${writeExact(snapExact(c, 1e-7))}, inside ` +
            `[${writeExact(snapExact(a, 1e-9))}; ${writeExact(snapExact(b, 1e-9))}] -- the integral is improper and is not computed`,
        );
      }
    }
  }
  return { value: guarded(where, () => integrate(f, lo, hi).value) };
}

function derivCall(args: string[], ctx: Context, where: string): { value: number } {
  if (args.length !== 3) fail(where, `deriv takes (expression, variable, at); got ${args.length} arguments`);
  const [body, variable, atText] = args as [string, string, string];
  const call = `deriv(${args.join(", ")})`;
  const { f } = bodyFunction(body, variable, ctx, where, call);
  const a = finiteArg(atText, ctx, where, "the point");
  const h = 1e-3 * Math.max(1, Math.abs(a));
  const at = writeExact(snapExact(a, 1e-9));
  const fa = f(a);
  if (!Number.isFinite(fa)) fail(where, `${call}: the expression is not defined at ${variable} = ${at}`);
  for (const x of [a - h, a + h, a - h / 100, a + h / 100]) {
    if (!Number.isFinite(f(x))) {
      fail(where, `${call}: the expression is not defined on both sides of ${variable} = ${at}, so it has no derivative there`);
    }
  }
  // A corner (|x| at 0): the one-sided slopes stay apart however small the
  // step. On a smooth function their gap shrinks with the step.
  const gap = (s: number): number => Math.abs((f(a + s) - fa) / s - (fa - f(a - s)) / s);
  const central = (s: number): number => (f(a + s) - f(a - s)) / (2 * s);
  const coarse = gap(h);
  const fine = gap(h / 100);
  const d = (4 * central(h / 2) - central(h)) / 3;
  if (fine > 0.5 * coarse && fine > 1e-6 * Math.max(1, Math.abs(d))) {
    fail(where, `${call}: the slopes from the left and from the right do not meet at ${variable} = ${at} -- no derivative there`);
  }
  if (!Number.isFinite(d)) fail(where, `${call}: the difference quotient is not finite`);
  return { value: d };
}

function limCall(args: string[], ctx: Context, where: string): CalcValue {
  if (args.length !== 3 && args.length !== 4) {
    fail(where, `lim takes (expression, variable, at) or (expression, variable, at, left|right); got ${args.length} arguments`);
  }
  const [body, variable, atText, sideText] = args as [string, string, string, string | undefined];
  const call = `lim(${args.join(", ")})`;
  const { f } = bodyFunction(body, variable, ctx, where, call);
  const infinity = /^(\+?(inf|∞))$/.test(atText) ? 1 : /^([-−](inf|∞))$/.test(atText) ? -1 : 0;
  if (sideText !== undefined && sideText !== "left" && sideText !== "right") {
    fail(where, `${call}: the side is "left" or "right", not "${sideText}"`);
  }
  if (infinity !== 0 && sideText !== undefined) fail(where, `${call}: a limit at ${atText} has only one side`);
  const result =
    infinity !== 0
      ? limit(f, infinity * Infinity, infinity > 0 ? "right" : "left")
      : limit(f, finiteArg(atText, ctx, where, "the point"), (sideText ?? "both") as "left" | "right" | "both");
  if (result.kind === "none") fail(where, `${call}: the limit was not found -- ${result.reason}`);
  if (result.kind === "infinite") return { kind: "infinite", sign: result.sign };
  return { kind: "number", value: (result as { value: number }).value, exact: { value: 0, exact: false } };
}

/**
 * The value of `source` in `ctx`. Every calculus call is computed and
 * replaced by its (snapped) value; what is left is an ordinary expression
 * over the params, parsed by `expr.ts`.
 */
function calc(source: string, ctx: Context, where: string): CalcValue {
  return calcWithTolerance(source, ctx, where).value;
}

function calcWithTolerance(source: string, ctx: Context, where: string): { value: CalcValue; tolerance: number } {
  const trimmed = source.trim();
  if (trimmed === "") fail(where, "an empty expression");
  let tolerance = TOLERANCE.arithmetic;
  let whole: CalcValue | undefined;
  const text = rewriteCalls(trimmed, ctx, where, (call) => {
    if (!(CALC as readonly string[]).includes(call.name)) {
      // A param function at a value: the argument is computed first (it may
      // itself call anything), then the body is evaluated there.
      if (call.args.length !== 1) {
        fail(where, `"${trimmed}": ${call.name} is a function of one variable, called with ${call.args.length} arguments`);
      }
      const arg = calcWithTolerance(call.args[0]!, ctx, where);
      if (arg.value.kind !== "number") fail(where, `"${trimmed}": ${call.name}(${call.args[0]}) at ±∞ is a limit -- write lim(…)`);
      tolerance = Math.max(tolerance, arg.tolerance);
      const f = ctx.fn(call.name)!;
      const at = (arg.value as { value: number }).value;
      return `(${sourceOf(f.tree, new Map([[f.variable, `(${String(at)})`]]))})`;
    }
    const name = call.name as CalcName;
    const got: CalcValue | { value: number } =
      name === "integral"
        ? integralCall(call.args, ctx, where)
        : name === "deriv"
          ? derivCall(call.args, ctx, where)
          : limCall(call.args, ctx, where);
    if ("kind" in got && got.kind === "infinite") {
      if (call.start === 0 && call.end === trimmed.length) {
        whole = got;
        return "0";
      }
      return fail(
        where,
        `"${trimmed}": ${trimmed.slice(call.start, call.end)} is ${got.sign > 0 ? "+∞" : "−∞"}, which cannot take part in arithmetic`,
      );
    }
    tolerance = Math.max(tolerance, TOLERANCE[name]);
    // Snapped where it is computed, at its own precision, so 3·(8/3) is 8.
    const snapped = snapExact((got as { value: number }).value, TOLERANCE[name]);
    return `(${String(snapped.value)})`;
  });
  if (whole !== undefined) return { value: whole, tolerance };
  const tree = guarded(where, () => parseIn(text, ctx.declared));
  const scope: Record<string, number> = {};
  for (const name of freeVariables(tree)) scope[name] = ctx.value(name);
  const value = guarded(where, () => evaluate(tree, scope));
  if (!Number.isFinite(value)) {
    fail(
      where,
      `"${trimmed}" is ${Number.isNaN(value) ? "undefined" : "infinite"} -- a division by zero or a value outside a function's domain`,
    );
  }
  return { value: { kind: "number", value, exact: snapExact(value, tolerance) }, tolerance };
}

// ---- params --------------------------------------------------------------------------

/** The shape of a `params` object: numbers and strings under names. Evaluated later. */
export function validateParams(raw: unknown, path: string): ParamSpec | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SpecError(`${path} must be an object of names to numbers or expressions`);
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new SpecError(`${path}.${key} must be a finite number`);
      if (FUNCTION_KEY.test(key)) throw new SpecError(`${path}.${key}: a function is an expression in its variable, not a number`);
    } else if (typeof value !== "string") {
      throw new SpecError(`${path}.${key} must be a number or an expression string, got ${JSON.stringify(value)}`);
    }
  }
  return raw as ParamSpec;
}

/**
 * Evaluate a `params` object into an environment.
 *
 * `base` is an enclosing environment (the sheet's, for an exercise): its
 * names are visible and may not be redefined. `overrides` replaces the
 * definitions of some params with numbers -- a sampled variant -- and every
 * param derived from them is recomputed; an override that names nothing
 * declared is refused. This is the one entry point a variant generator needs.
 */
export function evaluateParams(
  spec: ParamSpec | undefined,
  overrides: Readonly<Record<string, number>> = {},
  base: ParamEnv = EMPTY_ENV,
  where = "params",
): ParamEnv {
  const definitions = new Map<string, { kind: "value"; source: number | string } | { kind: "function"; variable: string; body: string }>();
  for (const [key, source] of Object.entries(spec ?? {})) {
    const fnKey = FUNCTION_KEY.exec(key);
    const name = fnKey === null ? key : fnKey[1]!;
    const why = reservedWhy(name);
    if (why !== undefined) fail(where, `"${name}" cannot be a param: ${why}`);
    if (base.values.has(name) || base.functions.has(name)) {
      fail(where, `"${name}" is already a param of the sheet; an exercise may not redefine it`);
    }
    if (definitions.has(name)) fail(where, `"${name}" is defined twice`);
    if (fnKey !== null) {
      if (typeof source !== "string") fail(where, `${key} must be an expression in ${fnKey[2]}`);
      definitions.set(name, { kind: "function", variable: fnKey[2] === "theta" ? "θ" : fnKey[2]!, body: source as string });
    } else {
      definitions.set(name, { kind: "value", source });
    }
  }
  for (const [name, value] of Object.entries(overrides)) {
    const def = definitions.get(name);
    if (def === undefined) {
      const known = [...definitions.keys()];
      fail(where, `the override "${name}" names no param` + (known.length === 0 ? "" : ` (the params are ${known.join(", ")})`));
    }
    if (def!.kind === "function") fail(where, `the override "${name}" names a function; only number params can be overridden`);
    if (typeof value !== "number" || !Number.isFinite(value)) fail(where, `the override "${name}" must be a finite number`);
    definitions.set(name, { kind: "value", source: value });
  }

  for (const [name, def] of definitions) {
    if (def.kind === "function") {
      if (definitions.has(def.variable) && definitions.get(def.variable)!.kind === "value") {
        fail(where, `${name}(${def.variable}): the variable "${def.variable}" is also a param; name the variable something else`);
      }
      if (base.values.has(def.variable)) {
        fail(where, `${name}(${def.variable}): the variable "${def.variable}" is also a param of the sheet`);
      }
    }
  }

  const values = new Map<string, number>();
  const functions = new Map<string, ParamFunction>();
  const stack: string[] = [];
  const declared = [
    ...base.values.keys(),
    ...[...definitions].filter(([, d]) => d.kind === "value").map(([n]) => n),
  ];
  const enter = (name: string): void => {
    const at = stack.indexOf(name);
    if (at >= 0) fail(where, `the params form a cycle: ${[...stack.slice(at), name].join(" → ")}`);
    stack.push(name);
  };
  const ctx: Context = {
    declared,
    isFunction: (name) => base.functions.has(name) || definitions.get(name)?.kind === "function",
    value(name) {
      const known = base.values.get(name) ?? values.get(name);
      if (known !== undefined) return known;
      const def = definitions.get(name);
      if (def === undefined || def.kind !== "value") return fail(where, `unknown name "${name}"`);
      enter(name);
      let value: number;
      if (typeof def.source === "number") value = def.source;
      else {
        const v = calc(def.source, ctx, `${where}.${name}`);
        if (v.kind !== "number") fail(`${where}.${name}`, `"${def.source}" is ${v.sign > 0 ? "+∞" : "−∞"}; a param is a number`);
        value = (v as { value: number }).value;
      }
      stack.pop();
      values.set(name, value);
      return value;
    },
    fn(name) {
      const known = base.functions.get(name) ?? functions.get(name);
      if (known !== undefined) return known;
      const def = definitions.get(name);
      if (def === undefined || def.kind !== "function") return undefined;
      enter(name);
      const inWhere = `${where}.${name}(${def.variable})`;
      const text = inlineFunctions(def.body, ctx, inWhere, "a function's definition");
      const tree = guarded(inWhere, () => parseIn(text, [def.variable, ...declared]));
      // Every param the body names must exist and not loop back.
      for (const n of freeVariables(tree)) if (n !== def.variable) ctx.value(n);
      stack.pop();
      const f = { variable: def.variable, tree };
      functions.set(name, f);
      return f;
    },
  };
  for (const [name, def] of definitions) {
    if (def.kind === "value") ctx.value(name);
    else ctx.fn(name);
  }
  // Declaration order, whatever order dependencies were followed in.
  const ordered = new Map<string, number>(base.values);
  const orderedFns = new Map<string, ParamFunction>(base.functions);
  for (const [name, def] of definitions) {
    if (def.kind === "value") ordered.set(name, values.get(name)!);
    else orderedFns.set(name, functions.get(name)!);
  }
  return { values: ordered, functions: orderedFns };
}

function contextOf(env: ParamEnv, where: string): Context {
  return {
    declared: [...env.values.keys()],
    value: (name) => env.values.get(name) ?? fail(where, `unknown name "${name}"`),
    fn: (name) => env.functions.get(name),
    isFunction: (name) => env.functions.has(name),
  };
}

/** The value of one expression -- `{{= …}}`'s body -- in an evaluated environment. */
export function evaluateCalc(source: string, env: ParamEnv = EMPTY_ENV, where = "expression"): CalcValue {
  return calc(source, contextOf(env, where), where);
}

// ---- writing a value ---------------------------------------------------------------

/**
 * A computed value as a reader sees it: exact when it is exact (8/3, √2,
 * π/2), else the formatter's shortest honest form; ±∞ for an infinite limit.
 * `math` picks TeX. `decimals` fixes the places, as `{{num:x:2}}` does.
 */
export function formatCalc(v: CalcValue, locale: Locale, math: boolean, decimals?: number): string {
  if (v.kind === "infinite") return math ? (v.sign > 0 ? "+\\infty" : "-\\infty") : v.sign > 0 ? "+∞" : `${MINUS}∞`;
  if (decimals !== undefined) {
    return math ? formatNumberTex(v.value, locale, { decimals }) : formatNumber(v.value, locale, { decimals });
  }
  return math ? writeExactTex(v.exact, locale) : writeExact(v.exact, locale);
}

/**
 * A number spelled for `expr.ts`: `2`, `0.5`, `(1/3)`, `sqrt(2)`, `(3*pi/2)`,
 * `(-2)`. Exact when it is exact, so the figure's own pretty-printer shows
 * "(1/3)x²", not "0,3333333333333333x²"; parenthesised whenever it is not a
 * bare unsigned number, so `x^{{= a}}` cannot silently mean (x^1)/3.
 */
export function spellForExpression(value: number): string {
  // A tiny nonzero value is not 0: snapping's slack is absolute below 1.
  const e: Exact = Math.abs(value) < 1e-6 && value !== 0 ? { value, exact: false } : snapExact(value, TOLERANCE.arithmetic);
  if (!e.exact) {
    const t = String(Math.abs(value));
    return value < 0 ? `(-${t})` : /e/i.test(t) ? `(${t})` : t;
  }
  const abs = Math.abs(e.value);
  let body: string;
  let atomic: boolean;
  if (e.form === "rational") {
    body = formatNumber(abs, "en", { grouping: false });
    atomic = !body.includes("/");
  } else if (e.form === "sqrt") {
    body = `sqrt(${e.n})`;
    atomic = true;
  } else if (e.form === "e") {
    const m = Math.abs(e.p);
    const power = m === 0.5 ? "sqrt(e)" : m === 1 ? "e" : `e^${m}`;
    body = e.p < 0 ? `1/${power}` : power;
    atomic = e.p > 0;
  } else {
    const k = Math.abs(e.k);
    body = `${k === 1 ? "" : `${k}*`}pi${e.q === 1 ? "" : `/${e.q}`}`;
    atomic = body === "pi";
  }
  if (e.value < 0) return `(-${body})`;
  return atomic ? body : `(${body})`;
}

// ---- a function's formula ----------------------------------------------------------

/** A param function's source with every param replaced by its value, spelled for `expr.ts`. */
function filledSource(f: ParamFunction, env: ParamEnv): string {
  const rename = new Map([...env.values].map(([n, v]) => [n, spellForExpression(v)] as const));
  const filled = parseIn(sourceOf(f.tree, rename), [f.variable]);
  return sourceOf(tidy(filled));
}

const isNum = (n: Node, v: number): boolean => n.kind === "num" && n.value === v;

/**
 * The identities a filled-in parameter makes visible and a reader would never
 * write: 1·x, x·1, (−1)·x, 0·x, x + 0, x − 0, x − (−a), x + (−a), x¹, x⁰,
 * x/1, −(−x). Only these;
 * nothing is expanded, collected or reordered, so the formula keeps the shape
 * its author gave it.
 */
function tidy(node: Node): Node {
  switch (node.kind) {
    case "neg": {
      const arg = tidy(node.arg);
      if (arg.kind === "neg") return arg.arg;
      if (isNum(arg, 0)) return arg;
      return { kind: "neg", arg };
    }
    case "call":
      return { kind: "call", name: node.name, arg: tidy(node.arg) };
    case "bin": {
      const left = tidy(node.left);
      const right = tidy(node.right);
      switch (node.op) {
        case "*":
          if (isNum(left, 0) || isNum(right, 0)) return { kind: "num", value: 0 };
          if (isNum(left, 1)) return right;
          if (isNum(right, 1)) return left;
          if (left.kind === "neg" && isNum(left.arg, 1)) return tidy({ kind: "neg", arg: right });
          break;
        case "+":
          if (isNum(right, 0)) return left;
          if (isNum(left, 0)) return right;
          // x + (−2) is x − 2: a sampled negative value lands here.
          if (right.kind === "neg") return { kind: "bin", op: "-", left, right: right.arg };
          if (right.kind === "num" && right.value < 0) return { kind: "bin", op: "-", left, right: { kind: "num", value: -right.value } };
          break;
        case "-":
          if (isNum(right, 0)) return left;
          if (isNum(left, 0)) return tidy({ kind: "neg", arg: right });
          // x − (−1) is x + 1, never "x − −1".
          if (right.kind === "neg") return { kind: "bin", op: "+", left, right: right.arg };
          if (right.kind === "num" && right.value < 0) return { kind: "bin", op: "+", left, right: { kind: "num", value: -right.value } };
          break;
        case "/":
          if (isNum(right, 1)) return left;
          break;
        case "^":
          if (isNum(right, 1)) return left;
          if (isNum(right, 0)) return { kind: "num", value: 1 };
          break;
      }
      return { kind: "bin", op: node.op, left, right };
    }
    default:
      return node;
  }
}

/**
 * A tree as TeX: `\frac{1}{2}x^{2}`, `\sqrt{x}`, `\sin\left(2x\right)`.
 * Same shape as `expr.ts`'s `pretty` (juxtaposed coefficients, brackets
 * only where precedence needs them), with numbers from the one formatter.
 */
function texOf(node: Node, locale: Locale): string {
  const prec = (n: Node): number => {
    if (n.kind === "bin") return n.op === "+" || n.op === "-" ? 1 : n.op === "^" ? 4 : n.op === "/" ? 5 : 2;
    if (n.kind === "neg") return 3;
    return 5;
  };
  const paren = (inner: string): string => `\\left(${inner}\\right)`;
  const wrap = (n: Node, min: number): string => (prec(n) < min ? paren(go(n)) : go(n));
  const NAMED = ["sin", "cos", "tan", "sinh", "cosh", "tanh", "exp", "ln", "log"];
  const go = (n: Node): string => {
    switch (n.kind) {
      case "num":
        return formatNumberTex(n.value, locale);
      case "var":
        return n.name === "θ" ? "\\theta" : n.name;
      case "const":
        return n.name === "e" ? "e" : "\\pi";
      case "neg":
        return `-${wrap(n.arg, 3)}`;
      case "call":
        if (n.name === "sqrt") return `\\sqrt{${go(n.arg)}}`;
        if (n.name === "abs") return `\\left|${go(n.arg)}\\right|`;
        // Plain brackets: `\left(` would space "sin (2x)" apart from its argument.
        return (NAMED.includes(n.name) ? `\\${n.name}` : `\\operatorname{${n.name}}`) + `(${go(n.arg)})`;
      case "bin": {
        if (n.op === "+" || n.op === "-") {
          const right = n.right;
          if (n.op === "+" && right.kind === "neg") return `${go(n.left)} - ${wrap(right.arg, 2)}`;
          return `${go(n.left)} ${n.op} ${wrap(right, n.op === "-" ? 2 : 1)}`;
        }
        if (n.op === "/") return `\\frac{${go(n.left)}}{${go(n.right)}}`;
        if (n.op === "*") {
          const left = wrap(n.left, 2);
          const right = wrap(n.right, 2);
          const juxtapose = n.right.kind !== "num" && n.right.kind !== "neg" && !/^\d/.test(right);
          return juxtapose ? `${left}${right}` : `${left} \\cdot ${right}`;
        }
        const base = n.left.kind === "call" && n.left.name !== "sqrt" ? paren(go(n.left)) : wrap(n.left, 5);
        return `${base}^{${go(n.right)}}`;
      }
    }
  };
  return go(node);
}

/**
 * A param function's formula with the params filled in: TeX inside math,
 * the figure's own pretty-printed form ("(1/2)x²") outside -- so the formula
 * in the statement and the curve in the figure are one definition.
 */
export function formulaText(f: ParamFunction, env: ParamEnv, locale: Locale, math: boolean): string {
  const tree = parseIn(filledSource(f, env), [f.variable]);
  return math ? texOf(tree, locale) : pretty(tree, undefined, locale === "pt-BR" ? "," : ".");
}

// ---- placeholders ------------------------------------------------------------------

const CALC_BODY = /^=\s*([\s\S]*?)\s*(?::\s*(\d))?$/;

/**
 * A text placeholder's body, if it is computed text: `= expr`, `= expr : 2`,
 * or a bare param name. Returns the printed value, or undefined when the body
 * is not one of these (the caller then tries its own forms).
 */
export function calcPlaceholder(
  body: string,
  env: ParamEnv,
  locale: Locale,
  math: boolean,
  where: string,
): string | undefined {
  const computed = CALC_BODY.exec(body);
  if (computed !== null) {
    const decimals = computed[2] === undefined ? undefined : Number(computed[2]);
    return formatCalc(evaluateCalc(computed[1]!, env, where), locale, math, decimals);
  }
  const value = env.values.get(body);
  if (value !== undefined) return formatCalc({ kind: "number", value, exact: snapExact(value, TOLERANCE.arithmetic) }, locale, math);
  const f = env.functions.get(body);
  if (f !== undefined) return formulaText(f, env, locale, math);
  return undefined;
}

// ---- figures -------------------------------------------------------------------------

/**
 * A figure input with the params substituted, structurally: only string
 * VALUES are read (never keys), a string that is exactly one `{{= …}}` or
 * `{{a}}` becomes a number, a `{{…}}` inside a longer string is written in
 * expression syntax, and `{{f}}` becomes param function f's expression.
 * Anything else in `{{ }}` is refused, naming its path. A figure with no
 * `{{` anywhere is returned as it came.
 */
export function substituteFigure<T>(input: T, env: ParamEnv, where: string): T {
  const walk = (value: unknown, path: string): unknown => {
    if (typeof value === "string") return value.includes("{{") ? substituteString(value, env, path) : value;
    if (Array.isArray(value)) {
      let changed = false;
      const out = value.map((v, i) => {
        const w = walk(v, `${path}[${i}]`);
        if (w !== v) changed = true;
        return w;
      });
      return changed ? out : value;
    }
    if (typeof value === "object" && value !== null) {
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const w = walk(v, `${path}.${k}`);
        if (w !== v) changed = true;
        out[k] = w;
      }
      return changed ? out : value;
    }
    return value;
  };
  return walk(input, where) as T;
}

const ONE_PLACEHOLDER = /^\s*\{\{([^{}]*)\}\}\s*$/;

function substituteString(s: string, env: ParamEnv, path: string): string | number {
  const whole = ONE_PLACEHOLDER.exec(s);
  if (whole !== null) {
    const body = whole[1]!.trim();
    if (!env.functions.has(body)) return numberOf(body, env, path, s);
  }
  let out = "";
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{{", i);
    if (open < 0) {
      out += s.slice(i);
      break;
    }
    const close = s.indexOf("}}", open);
    if (close < 0) fail(path, `"{{" without a closing "}}" in ${JSON.stringify(s)}`);
    out += s.slice(i, open);
    const body = s.slice(open + 2, close).trim();
    const f = env.functions.get(body);
    if (f !== undefined) {
      out += `(${filledSource(f, env)})`;
    } else {
      out += spellForExpression(numberOf(body, env, path, s));
    }
    i = close + 2;
  }
  return out;
}

function numberOf(body: string, env: ParamEnv, path: string, s: string): number {
  const computed = /^=\s*([\s\S]*)$/.exec(body);
  const source = computed !== null ? computed[1]! : env.values.has(body) ? body : undefined;
  if (source === undefined) {
    const params = [...env.values.keys(), ...env.functions.keys()];
    return fail(
      path,
      `${JSON.stringify(s)} has {{${body}}}, which a figure cannot resolve. In a figure, {{= expression}} is a ` +
        `computed number, {{a}} a param and {{f}} a param function` +
        (params.length === 0 ? " -- this exercise declares no params" : ` (declared: ${params.join(", ")})`),
    );
  }
  const v = evaluateCalc(source, env, path);
  if (v.kind !== "number") return fail(path, `{{${body}}} is ${v.sign > 0 ? "+∞" : "−∞"}; a figure needs a number`);
  return (v as { value: number }).value;
}
