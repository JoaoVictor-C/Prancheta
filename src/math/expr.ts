/**
 * Arithmetic expressions as DATA.
 *
 * A function-graph figure states its curves as text -- "x^2 + 1",
 * "1000·(1,2)^t", "x²/9 + y²/4 = 1" -- so that a figure is a document an
 * agent can write and a reviewer can read, not a script. That needs an
 * evaluator, and `eval` / `new Function` are not one: they would run whatever
 * the document says. This is a closed grammar over DECLARED variables, a
 * handful of constants and a fixed list of functions; anything else is
 * refused by name at parse time, before a single point is sampled.
 *
 * The notation accepted is the notation people write, not only the one
 * programmers do: implicit multiplication ("2x", "3(x + 1)", "x(x − 1)",
 * "xy"), superscript powers ("x²"), the typographic minus, "·" and "×", "√",
 * "θ" (or "theta"), and "**" for anyone arriving from Python. The decimal
 * mark is the point: a comma is refused, because "1,2" is either a decimal
 * or two arguments and the parser should not be the one to guess.
 *
 * Logarithms follow the Brazilian school convention: `ln` is natural and
 * `log` is base 10. A module that meant natural `log` has to say `ln`.
 *
 * ## One variable, or several (ADR 0029)
 *
 * The grammar began with one variable, and every caller that existed then
 * still calls it that way: `parse(source, "t")`, `compile(source, "t")`.
 * In that form the variable is spelled as given OR as `x`, and every
 * occurrence evaluates to the one number passed in -- exactly the old
 * behaviour, so function-graph, sign-chart and their tests did not change.
 *
 * Curves that are not graphs of a function need more than one name: a
 * parametric curve is two expressions in `t`, a polar one is `r` in `θ`, an
 * implicit one is an equation in `x` AND `y`. `parseIn(source, variables)`
 * and `compileIn(...)` take the list of names the caller declares; nothing
 * else is a variable, and each is its own number.
 *
 * ## "xy": when a run of letters is a product
 *
 * The tokenizer reads letters greedily, so "xy" arrives as ONE name. With
 * one variable that was always an error, and could stay one. With x and y
 * both declared, "xy" is how every textbook writes the product -- "xy = 1"
 * is the hyperbola -- and refusing it would refuse the notation the grammar
 * exists to accept. The rule, chosen so that it never guesses:
 *
 *  1. a run that is EXACTLY a known name (a declared variable or its alias,
 *     a constant, a function) is that name: "pi" is π, never p·i; "exp" is
 *     the function, never e·x·p;
 *  2. otherwise the run is a product only if it splits into declared
 *     variables and constants in EXACTLY ONE way: "xy" → x·y, "xe" → x·e,
 *     "thetax" → θ·x;
 *  3. no split → the run is refused as an unknown name ("xz" with z
 *     undeclared, "xsin(x)" -- functions never take part in a split, so a
 *     function must be separated from what multiplies it: "x sin(x)");
 *  4. more than one split → refused, naming both readings. With the names
 *     the presets declare (x, y, t, θ) that cannot happen; it takes a name
 *     spelled as a run of other names -- variables "p" and "i" beside the
 *     constant "pi" make "pie" read as pi·e or as p·i·e -- and then the
 *     author, not the parser, decides.
 *
 * The split is uniform, including in the one-variable form: "xe^x" was
 * refused as the unknown name "xe" and now reads as x·eˣ, which is what it
 * says. Nothing that parsed before parses differently now -- a run that was
 * a known name is still that name, and a run that was refused was refused.
 */

export class ExprError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExprError";
  }
}

export type Node =
  | { kind: "num"; value: number }
  /** `name` is the canonical, declared spelling: "theta" arrives as "θ". */
  | { kind: "var"; name: string }
  | { kind: "const"; name: string; value: number }
  | { kind: "neg"; arg: Node }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node }
  | { kind: "call"; name: string; arg: Node };

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, "π": Math.PI, e: Math.E };

/**
 * Spellings that always mean another name. "theta" is how θ is typed on a
 * keyboard without it; the tree, the pretty-printer and every error message
 * use θ, so one figure never prints both.
 */
const ALIASES: Record<string, string> = { theta: "θ" };

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

type Token =
  | { t: "num"; v: number; at: number }
  | { t: "id"; v: string; at: number }
  | { t: "op"; v: string; at: number };

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};

function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const s = source;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (m === null) throw new ExprError(`"${source}": malformed number at position ${i + 1}`);
      if (s[i + m[0].length] === ",") {
        throw new ExprError(
          `"${source}": a comma at position ${i + m[0].length + 1}. Write decimals with a point ` +
            `("1.2", not "1,2") -- a comma could also separate two arguments, and this parser will not guess.`,
        );
      }
      out.push({ t: "num", v: Number(m[0]), at: i });
      i += m[0].length;
      continue;
    }
    // π and θ are one-letter names of their own: "2πθ" is three factors, and
    // a Latin run stops at them ("rθ" is r then θ).
    if (/[A-Za-zπθ]/.test(c)) {
      const m = /^(π|θ|[A-Za-z][A-Za-z0-9]*)/.exec(s.slice(i))!;
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (Object.hasOwn(SUPERSCRIPT, c)) {
      let j = i;
      let digits = "";
      while (j < s.length && Object.hasOwn(SUPERSCRIPT, s[j]!)) {
        digits += SUPERSCRIPT[s[j]!];
        j += 1;
      }
      out.push({ t: "op", v: "^", at: i });
      if (digits.startsWith("-")) {
        out.push({ t: "op", v: "(", at: i });
        out.push({ t: "op", v: "-", at: i });
        out.push({ t: "num", v: Number(digits.slice(1)), at: i });
        out.push({ t: "op", v: ")", at: i });
      } else {
        out.push({ t: "num", v: Number(digits), at: i });
      }
      i = j;
      continue;
    }
    if (s.startsWith("**", i)) {
      out.push({ t: "op", v: "^", at: i });
      i += 2;
      continue;
    }
    const mapped: Record<string, string> = {
      "+": "+", "-": "-", "−": "-", "*": "*", "·": "*", "×": "*", "⋅": "*", "/": "/", "÷": "/",
      "^": "^", "(": "(", ")": ")", "√": "√", "=": "=",
    };
    if (Object.hasOwn(mapped, c)) {
      out.push({ t: "op", v: mapped[c]!, at: i });
      i += 1;
      continue;
    }
    if (c === ",") {
      throw new ExprError(
        `"${source}": a comma at position ${i + 1}. Functions here take one argument, and decimals are ` +
          `written with a point ("1.2").`,
      );
    }
    throw new ExprError(`"${source}": unexpected "${c}" at position ${i + 1}`);
  }
  return out;
}

/**
 * What a name means to one parse: which spellings are variables (and which
 * variable each spelling is), and how to say so when a name is refused.
 */
type Scope = {
  /** Spelling → canonical variable name, own properties only. */
  variables: Map<string, string>;
  /** Legacy (one-variable) scopes look the variable up BEFORE constants, as they always did. */
  variablesFirst: boolean;
  describe: () => string;
};

function legacyScope(variable: string): Scope {
  const variables = new Map<string, string>([
    ["x", variable],
    [variable, variable],
  ]);
  return {
    variables,
    variablesFirst: true,
    describe: () => `The variable is "${variable}"` + (variable === "x" ? "" : ' (or "x")'),
  };
}

/**
 * A scope over declared names. A declared name may not shadow a constant or
 * a function -- "e" as a variable would make "2e" mean two things -- and
 * that is the caller's mistake, refused as one.
 */
function declaredScope(declared: readonly string[], aliases: Readonly<Record<string, string>> = {}): Scope {
  const variables = new Map<string, string>();
  const canonical = (name: string): string => (Object.hasOwn(ALIASES, name) ? ALIASES[name]! : name);
  for (const raw of declared) {
    const name = canonical(raw);
    if (Object.hasOwn(CONSTANTS, name) || Object.hasOwn(FUNCTIONS, name)) {
      throw new ExprError(`"${raw}" cannot be a variable: it is already a ${Object.hasOwn(CONSTANTS, name) ? "constant" : "function"}`);
    }
    if (!/^(π|θ|[A-Za-z][A-Za-z0-9]*)$/.test(name)) {
      throw new ExprError(`"${raw}" cannot be a variable: a name is a letter followed by letters or digits`);
    }
    variables.set(name, name);
    for (const [spelling, target] of Object.entries(ALIASES)) if (target === name) variables.set(spelling, name);
  }
  for (const [spelling, target] of Object.entries(aliases)) {
    const to = canonical(target);
    if (!variables.has(to)) throw new ExprError(`alias "${spelling}" names "${target}", which is not declared`);
    // An alias that is not a name (an axis called "t (h)") can never be
    // written in an expression; it is skipped rather than refused, the way
    // the one-variable form always treated such an axis name.
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(spelling)) continue;
    if (Object.hasOwn(CONSTANTS, spelling) || Object.hasOwn(FUNCTIONS, spelling)) continue;
    if (!variables.has(spelling)) variables.set(spelling, to);
  }
  const names = [...new Set(variables.values())];
  return {
    variables,
    variablesFirst: false,
    describe: () =>
      names.length === 0
        ? "This expression takes no variables"
        : names.length === 1
          ? `The variable is "${names[0]}"`
          : `The variables are ${names.map((n) => `"${n}"`).join(", ")}`,
  };
}

/**
 * Every way `run` splits into variable spellings and constants, stopping at
 * two: one is an answer, two is an ambiguity, more is not more information.
 */
function splits(run: string, scope: Scope): string[][] {
  const atoms = [...scope.variables.keys(), ...Object.keys(CONSTANTS)].filter((a) => /^[A-Za-z]/.test(a));
  const memo = new Map<number, string[][]>();
  const from = (i: number): string[][] => {
    if (i === run.length) return [[]];
    const known = memo.get(i);
    if (known !== undefined) return known;
    const out: string[][] = [];
    for (const atom of atoms) {
      if (!run.startsWith(atom, i)) continue;
      for (const rest of from(i + atom.length)) {
        out.push([atom, ...rest]);
        if (out.length >= 2) break;
      }
      if (out.length >= 2) break;
    }
    memo.set(i, out);
    return out;
  };
  return from(0);
}

function parseTokens(source: string, tokens: Token[], scope: Scope): Node {
  let k = 0;
  const peek = (): Token | undefined => tokens[k];
  const fail = (what: string): never => {
    const at = peek()?.at;
    throw new ExprError(`"${source}": ${what}${at === undefined ? " at the end" : ` at position ${at + 1}`}`);
  };
  const isOp = (v: string): boolean => {
    const tok = peek();
    return tok !== undefined && tok.t === "op" && tok.v === v;
  };

  const sum = (): Node => {
    let left = product();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[k++] as { v: "+" | "-" }).v;
      left = { kind: "bin", op, left, right: product() };
    }
    return left;
  };
  // Where a factor may begin WITHOUT an operator in front of it: that is
  // implicit multiplication. A leading "-" is not one of them -- "2 -x" is a
  // subtraction.
  const startsFactor = (): boolean => {
    const tok = peek();
    if (tok === undefined) return false;
    if (tok.t === "num" || tok.t === "id") return true;
    return tok.t === "op" && (tok.v === "(" || tok.v === "√");
  };
  const product = (): Node => {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (tokens[k++] as { v: "*" | "/" }).v;
        left = { kind: "bin", op, left, right: unary() };
      } else if (startsFactor()) {
        left = { kind: "bin", op: "*", left, right: power() };
      } else {
        return left;
      }
    }
  };
  const unary = (): Node => {
    if (isOp("-")) {
      k += 1;
      return { kind: "neg", arg: unary() };
    }
    if (isOp("+")) {
      k += 1;
      return unary();
    }
    return power();
  };
  // Right-associative, and binding tighter than a leading minus: -x^2 is
  // -(x^2), the way every mathematics text reads it.
  const power = (): Node => {
    const base = atom();
    if (isOp("^")) {
      k += 1;
      return { kind: "bin", op: "^", left: base, right: unary() };
    }
    return base;
  };
  const variable = (name: string): string | undefined =>
    scope.variables.has(name) ? scope.variables.get(name) : undefined;
  const unknown = (name: string, extra = ""): never => {
    throw new ExprError(
      `"${source}": unknown name "${name}". ${scope.describe()}; constants are pi and e; ` +
        `functions are ${FUNCTION_NAMES.join(", ")}.${extra}`,
    );
  };
  const atom = (): Node => {
    const tok = peek();
    if (tok === undefined) return fail("expected a number, a name or \"(\"");
    if (tok.t === "num") {
      k += 1;
      return { kind: "num", value: tok.v };
    }
    if (tok.t === "op" && tok.v === "(") {
      k += 1;
      const inner = sum();
      if (!isOp(")")) fail('expected ")"');
      k += 1;
      return inner;
    }
    if (tok.t === "op" && tok.v === "√") {
      k += 1;
      return { kind: "call", name: "sqrt", arg: power() };
    }
    if (tok.t === "id") {
      const name = tok.v;
      const asVariable = variable(name);
      if (scope.variablesFirst && asVariable !== undefined) {
        k += 1;
        return { kind: "var", name: asVariable };
      }
      if (Object.hasOwn(CONSTANTS, name)) {
        k += 1;
        return { kind: "const", name, value: CONSTANTS[name]! };
      }
      if (asVariable !== undefined) {
        k += 1;
        return { kind: "var", name: asVariable };
      }
      if (Object.hasOwn(FUNCTIONS, name)) {
        k += 1;
        if (!isOp("(")) fail(`"${name}" is a function and needs its argument in parentheses`);
        k += 1;
        const arg = sum();
        if (!isOp(")")) fail('expected ")"');
        k += 1;
        return { kind: "call", name, arg };
      }
      // Not a name: a product of names, if it is one in exactly one way.
      if (name.length > 1) {
        const found = splits(name, scope);
        if (found.length === 1) {
          let at = tok.at;
          const pieces: Token[] = found[0]!.map((v) => {
            const piece: Token = { t: "id", v, at };
            at += v.length;
            return piece;
          });
          tokens.splice(k, 1, ...pieces);
          return atom();
        }
        if (found.length > 1) {
          throw new ExprError(
            `"${source}": "${name}" at position ${tok.at + 1} reads as ${found.map((f) => f.join("·")).join(" or as ")}. ` +
              `Separate the factors with a space or "*" so the expression says which.`,
          );
        }
        return unknown(
          name,
          ` A run of letters is read as a product only when it splits into variables and constants ` +
            `in exactly one way; a function never takes part ("x sin(x)", not "xsin(x)").`,
        );
      }
      return unknown(name);
    }
    if (tok.t === "op" && tok.v === "=") {
      return fail('"=" makes an equation, and an expression was expected');
    }
    return fail(`unexpected "${tok.v}"`);
  };

  if (tokens.length === 0) throw new ExprError("an empty expression");
  const tree = sum();
  if (k < tokens.length) {
    const tok = tokens[k]!;
    if (tok.t === "op" && tok.v === "=") fail('"=" makes an equation, and an expression was expected');
    fail(`unexpected "${String(tok.v)}"`);
  }
  return tree;
}

/**
 * Parse `source` into a tree whose only free variable is `variable`.
 *
 * `x` is always accepted as well, so a figure whose horizontal axis is time
 * may write its curves in `t` or in `x` -- but no other free name is. Every
 * variable node carries `variable` as its name, whichever spelling it had.
 */
export function parse(source: string, variable = "x"): Node {
  return parseTokens(source, tokenize(source), legacyScope(variable));
}

/**
 * Parse `source` over the DECLARED variables, each its own number.
 *
 * `aliases` are further spellings of a declared name -- an axis called "t"
 * whose curves are written in t while the implicit equation says x. θ is
 * always spelled "θ" or "theta".
 */
export function parseIn(
  source: string,
  variables: readonly string[],
  aliases: Readonly<Record<string, string>> = {},
): Node {
  return parseTokens(source, tokenize(source), declaredScope(variables, aliases));
}

/**
 * An equation, "left = right", over the declared variables: exactly one "=",
 * with an expression on each side. An implicit curve is the set where
 * left − right = 0; the two sides are kept apart so the figure can print the
 * equation as it was written.
 */
export function parseEquation(
  source: string,
  variables: readonly string[],
  aliases: Readonly<Record<string, string>> = {},
): { left: Node; right: Node } {
  const tokens = tokenize(source);
  const eq = tokens.flatMap((t, i) => (t.t === "op" && t.v === "=" ? [i] : []));
  if (eq.length !== 1) {
    throw new ExprError(
      eq.length === 0
        ? `"${source}": an equation needs "=" ("x^2 + y^2 = 1")`
        : `"${source}": an equation has one "=", this has ${eq.length}`,
    );
  }
  const scope = declaredScope(variables, aliases);
  const i = eq[0]!;
  if (i === 0 || i === tokens.length - 1) throw new ExprError(`"${source}": "=" needs an expression on each side`);
  return {
    left: parseTokens(source, tokens.slice(0, i), scope),
    right: parseTokens(source, tokens.slice(i + 1), scope),
  };
}

/** The variables a tree actually uses, by canonical name. */
export function freeVariables(node: Node): Set<string> {
  const out = new Set<string>();
  const go = (n: Node): void => {
    if (n.kind === "var") out.add(n.name);
    else if (n.kind === "neg" || n.kind === "call") go(n.arg);
    else if (n.kind === "bin") {
      go(n.left);
      go(n.right);
    }
  };
  go(node);
  return out;
}

function power(a: number, b: number): number {
  // A negative base to a fractional power is NaN in JS; x^(1/3) of a
  // negative x is a real cube root in every textbook this serves.
  if (a < 0 && !Number.isInteger(b)) {
    const inv = 1 / b;
    if (Number.isInteger(Math.round(inv)) && Math.abs(inv - Math.round(inv)) < 1e-12 && Math.round(inv) % 2 !== 0) {
      return -Math.pow(-a, b);
    }
  }
  return Math.pow(a, b);
}

/**
 * Evaluate a tree. A number is the one-variable form: every variable node is
 * that number. A record gives each variable its own; a variable missing from
 * it is a caller's bug and throws rather than quietly drawing NaN.
 */
export function evaluate(node: Node, scope: number | Readonly<Record<string, number>>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "var": {
      if (typeof scope === "number") return scope;
      if (!Object.hasOwn(scope, node.name)) throw new ExprError(`no value was given for the variable "${node.name}"`);
      return scope[node.name]!;
    }
    case "const":
      return node.value;
    case "neg":
      return -evaluate(node.arg, scope);
    case "call":
      return FUNCTIONS[node.name]!(evaluate(node.arg, scope));
    case "bin": {
      const a = evaluate(node.left, scope);
      const b = evaluate(node.right, scope);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          return power(a, b);
      }
    }
  }
}

/** A callable: NaN (never a throw) where the expression is undefined. */
export function compile(source: string, variable = "x"): (x: number) => number {
  const tree = parse(source, variable);
  return (x: number) => {
    const y = evaluate(tree, x);
    return Number.isFinite(y) ? y : Number.NaN;
  };
}

/**
 * A tree lowered to closures over positional arguments. A contour samples
 * f(x, y) tens of thousands of times per figure; walking the tree with a
 * record lookup at every variable is the part worth not repeating.
 */
function lower(node: Node, index: ReadonlyMap<string, number>): (args: readonly number[]) => number {
  switch (node.kind) {
    case "num":
    case "const": {
      const value = node.value;
      return () => value;
    }
    case "var": {
      const i = index.get(node.name);
      if (i === undefined) throw new ExprError(`no value was given for the variable "${node.name}"`);
      return (args) => args[i]!;
    }
    case "neg": {
      const arg = lower(node.arg, index);
      return (args) => -arg(args);
    }
    case "call": {
      const fn = FUNCTIONS[node.name]!;
      const arg = lower(node.arg, index);
      return (args) => fn(arg(args));
    }
    case "bin": {
      const a = lower(node.left, index);
      const b = lower(node.right, index);
      switch (node.op) {
        case "+":
          return (args) => a(args) + b(args);
        case "-":
          return (args) => a(args) - b(args);
        case "*":
          return (args) => a(args) * b(args);
        case "/":
          return (args) => a(args) / b(args);
        case "^":
          return (args) => power(a(args), b(args));
      }
    }
  }
}

/**
 * A tree as a callable over the declared variables, taken positionally in
 * the order declared: `compileTree(tree, ["x", "y"])(2, 3)`. NaN, never a
 * throw, where the expression is undefined.
 */
export function compileTree(tree: Node, variables: readonly string[]): (...values: number[]) => number {
  const index = new Map<string, number>();
  variables.forEach((name, i) => index.set(Object.hasOwn(ALIASES, name) ? ALIASES[name]! : name, i));
  const run = lower(tree, index);
  return (...values: number[]) => {
    const y = run(values);
    return Number.isFinite(y) ? y : Number.NaN;
  };
}

/** `parseIn` then `compileTree`: "cos(t)" over ["t"], "x^2 + y^2" over ["x", "y"]. */
export function compileIn(
  source: string,
  variables: readonly string[],
  aliases: Readonly<Record<string, string>> = {},
): (...values: number[]) => number {
  return compileTree(parseIn(source, variables, aliases), variables);
}

/**
 * A number written as an expression with no variables: "2pi", "π/2",
 * "sqrt(2)". What a parameter interval like t ∈ [0, 2π] needs, since JSON
 * has no way to write 2π as a number. Refused if it is not finite.
 */
export function constantValue(source: string): number {
  const value = evaluate(parseIn(source, []), {});
  if (!Number.isFinite(value)) throw new ExprError(`"${source}" is not a finite number`);
  return value;
}

/**
 * The slope of `f` at `x`, by a symmetric difference.
 *
 * Symmetric because its error is second order: for a cubic it is exact up to
 * rounding, which the formatter's tolerance then absorbs, so a tangent to x³
 * at 2 is labelled "12", not "12,000000001".
 */
export function derivative(f: (x: number) => number, x: number): number {
  const h = 1e-4 * Math.max(1, Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
}

const SUPER_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/**
 * A tree written the way a reader writes it: "x² − 4x + 1", "1000·1,2ᵗ" is
 * NOT attempted -- only integer exponents become superscripts, everything
 * else keeps "^" so nothing is silently dropped.
 *
 * `variable`, when a string, is printed for EVERY variable node -- the
 * one-variable form, where "x" and "t" are the same variable. A record
 * renames some variables and leaves the rest: an implicit curve on an axis
 * called "t" prints t where the tree says x. Left out, each variable prints
 * as its own name: "x²/9 + y²/4", "1 + cos(θ)".
 */
export function pretty(node: Node, variable?: string | Readonly<Record<string, string>>, decimal = ","): string {
  const nameOf = (name: string): string =>
    typeof variable === "string" ? variable : variable !== undefined && Object.hasOwn(variable, name) ? variable[name]! : name;
  const num = (v: number): string => String(v).replace(".", decimal);
  const prec = (n: Node): number => {
    if (n.kind === "bin") return n.op === "+" || n.op === "-" ? 1 : n.op === "^" ? 4 : 2;
    if (n.kind === "neg") return 3;
    return 5;
  };
  const wrap = (n: Node, min: number): string => (prec(n) < min ? `(${go(n)})` : go(n));
  const go = (n: Node): string => {
    switch (n.kind) {
      case "num":
        return num(n.value);
      case "var":
        return nameOf(n.name);
      case "const":
        return n.name === "pi" ? "π" : n.name;
      case "neg":
        return `−${wrap(n.arg, 3)}`;
      case "call":
        return n.name === "sqrt" ? `√(${go(n.arg)})` : `${n.name}(${go(n.arg)})`;
      case "bin": {
        if (n.op === "+" || n.op === "-") {
          const right = n.right;
          if (n.op === "+" && right.kind === "neg") return `${go(n.left)} − ${wrap(right.arg, 2)}`;
          if (n.op === "+" && right.kind === "num" && right.value < 0) return `${go(n.left)} − ${num(-right.value)}`;
          return `${go(n.left)} ${n.op === "+" ? "+" : "−"} ${wrap(right, n.op === "-" ? 2 : 1)}`;
        }
        if (n.op === "*") {
          // A fraction as a coefficient keeps its brackets: "(5/3)x²", not "5/3x²".
          const left = n.left.kind === "bin" && n.left.op === "/" ? `(${go(n.left)})` : wrap(n.left, 2);
          const right = wrap(n.right, 2);
          // "2x", "3(x + 1)", "x²": a coefficient before a variable or a
          // bracket is juxtaposed; two numbers keep an explicit dot.
          const juxtapose =
            n.right.kind !== "num" && !(n.right.kind === "neg") && !/^\d/.test(right);
          return juxtapose ? `${left}${right}` : `${left}·${right}`;
        }
        if (n.op === "/") return `${wrap(n.left, 2)}/${wrap(n.right, 3)}`;
        const exponent = n.right;
        const base = wrap(n.left, 5);
        if (exponent.kind === "num" && Number.isInteger(exponent.value) && exponent.value >= 0) {
          return base + [...String(exponent.value)].map((d) => SUPER_DIGITS[Number(d)]).join("");
        }
        return `${base}^${wrap(exponent, 5)}`;
      }
    }
  };
  return go(node);
}
