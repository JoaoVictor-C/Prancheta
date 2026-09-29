/**
 * Boolean expressions over named variables: a closed grammar, parsed and
 * evaluated here and nowhere else (no `eval`, no `Function`).
 *
 * Shared by `truth-table` and `logic-circuit`, so a column of a table and a
 * gate of a circuit are computed from the SAME tree by the SAME evaluator.
 *
 * ---- Grammar (lowest precedence first) -----------------------------------
 *
 *   iff   := imp  ( ↔ imp )*                 left-assoc     ↔  <->  <=>  ⇔
 *   imp   := or   ( → imp )?                 right-assoc    →  ->  =>  ⇒
 *   or    := xor  ( (+ | or | ∨ | | | nor | ↓ | ⊽) xor )*
 *   xor   := and  ( (xor | ⊕ | ⊻) and )*
 *   and   := not  ( (· | * | . | & | ∧ | and | nand | ↑ | ⊼) not | juxtaposition )*
 *   not   := (not | ¬ | ~ | !) not | post
 *   post  := atom ( ' | ′ )*                 postfix prime: A', (A+B)', A''
 *   atom  := variable | constant | ( iff )
 *
 * So: not > and > xor > or > → > ↔ (`nand` sits at the `and` level and `nor`
 * at the `or` level, both binary and left-associative: A nand B nand C is
 * (A nand B) nand C). Words are case-insensitive: `AND`, `Or`, `NOT`.
 *
 * Juxtaposition is AND, the way digital electronics writes it: `A'B + AB'`
 * is (A′·B) + (A·B′). To make that unambiguous a VARIABLE is ONE letter with
 * optional digits, `_digits` or subscript digits (`A`, `p`, `x1`, `Q_2`,
 * `x₁`): `AB` is A·B, never a variable called "AB". Consequently the
 * constants `V` and `F` (and `0`, `1`, `true`, `false`, `⊤`, `⊥`) are
 * reserved: a variable cannot be named V or F (V1 and F2 are fine).
 *
 * ---- Variable order ------------------------------------------------------
 *
 * `variablesOf` returns variables in ORDER OF FIRST APPEARANCE, left to
 * right: "B and A" gives [B, A]. Callers that want alphabetical pass their
 * own order (`truth-table`'s `variables`). The first variable is the most
 * significant bit of a row's minterm index.
 *
 * ---- Minimisation --------------------------------------------------------
 *
 * `simplify` is Quine–McCluskey: all prime implicants by iterated combining,
 * then a cover made of the essential primes plus a minimum cover of what is
 * left found by Petrick's method (exact: fewest terms, then fewest literals).
 * Petrick's product is capped (see `PETRICK_LIMIT`); past it a greedy cover
 * is used and `exact` is reported false. For the sizes an exercise has (up to
 * six variables) the cap is never reached.
 */

// ---- the tree ----------------------------------------------------------------

export type BinOp = "and" | "or" | "xor" | "nand" | "nor" | "imp" | "iff";

export type BoolExpr =
  | { kind: "const"; value: boolean }
  | { kind: "var"; name: string }
  | { kind: "not"; arg: BoolExpr }
  | { kind: "bin"; op: BinOp; left: BoolExpr; right: BoolExpr };

export type Notation = "logic" | "digital";

/** A parse failure, with where in the source it happened (0-based). */
export class BoolParseError extends Error {
  readonly position: number;
  readonly source: string;
  constructor(message: string, position: number, source: string) {
    super(`${message} (posição ${position + 1})`);
    this.name = "BoolParseError";
    this.position = position;
    this.source = source;
  }
  /** The source with a caret under the error, for a message a human reads. */
  excerpt(): string {
    return `  ${this.source}\n  ${" ".repeat(Math.min(this.position, this.source.length))}^`;
  }
}

// ---- tokens ------------------------------------------------------------------

type TokKind =
  | "var"
  | "const"
  | "lparen"
  | "rparen"
  | "not"
  | "prime"
  | "and"
  | "or"
  | "xor"
  | "nand"
  | "nor"
  | "imp"
  | "iff"
  | "end";

type Tok = { kind: TokKind; text: string; pos: number; value?: boolean };

const SYMBOLS: [string, TokKind][] = [
  // longest first
  ["<->", "iff"],
  ["<=>", "iff"],
  ["->", "imp"],
  ["=>", "imp"],
  ["&&", "and"],
  ["||", "or"],
  ["↔", "iff"],
  ["⇔", "iff"],
  ["→", "imp"],
  ["⇒", "imp"],
  ["∧", "and"],
  ["·", "and"],
  ["⋅", "and"],
  ["•", "and"],
  ["*", "and"],
  ["&", "and"],
  [".", "and"],
  ["∨", "or"],
  ["+", "or"],
  ["|", "or"],
  ["⊕", "xor"],
  ["⊻", "xor"],
  ["↑", "nand"],
  ["⊼", "nand"],
  ["↓", "nor"],
  ["⊽", "nor"],
  ["¬", "not"],
  ["~", "not"],
  ["!", "not"],
  ["'", "prime"],
  ["′", "prime"],
  ["’", "prime"],
  ["(", "lparen"],
  [")", "rparen"],
];

const WORDS: Record<string, TokKind | "true" | "false"> = {
  and: "and",
  or: "or",
  not: "not",
  xor: "xor",
  nand: "nand",
  nor: "nor",
  true: "true",
  false: "false",
};

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const isLetter = (ch: string): boolean => /^\p{L}$/u.test(ch);
const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";

function tokenize(source: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const symbol = SYMBOLS.find(([text]) => source.startsWith(text, i));
    if (symbol !== undefined) {
      out.push({ kind: symbol[1], text: symbol[0], pos: i });
      i += symbol[0].length;
      continue;
    }
    if (ch === "⊤" || ch === "⊥") {
      out.push({ kind: "const", text: ch, pos: i, value: ch === "⊤" });
      i += 1;
      continue;
    }
    if (isDigit(ch)) {
      let j = i;
      while (j < source.length && isDigit(source[j]!)) j += 1;
      const digits = source.slice(i, j);
      if (digits !== "0" && digits !== "1") {
        throw new BoolParseError(`só 0 e 1 são constantes, e "${digits}" não é uma variável (uma variável é uma letra)`, i, source);
      }
      out.push({ kind: "const", text: digits, pos: i, value: digits === "1" });
      i = j;
      continue;
    }
    if (isLetter(ch)) {
      let j = i;
      while (j < source.length && isLetter(source[j]!)) j += 1;
      const run = source.slice(i, j);
      const word = WORDS[run.toLowerCase()];
      if (word !== undefined && run.length > 1) {
        if (word === "true" || word === "false") out.push({ kind: "const", text: run, pos: i, value: word === "true" });
        else out.push({ kind: word, text: run, pos: i });
        i = j;
        continue;
      }
      // Single-letter variables: "AB" is A·B. Only the last letter of the
      // run may take trailing digits.
      let stop = j;
      for (let k = i; k < j; k += 1) {
        let end = k + 1;
        if (k === j - 1) {
          if (source[end] === "_") end += 1;
          while (end < source.length && (isDigit(source[end]!) || SUBSCRIPTS.includes(source[end]!))) end += 1;
          stop = end;
        }
        const name = source.slice(k, end);
        if (name === "V" || name === "F") out.push({ kind: "const", text: name, pos: k, value: name === "V" });
        else out.push({ kind: "var", text: name, pos: k });
      }
      i = stop;
      continue;
    }
    throw new BoolParseError(`caractere inesperado "${ch}"`, i, source);
  }
  out.push({ kind: "end", text: "", pos: source.length });
  return out;
}

// ---- parser ------------------------------------------------------------------

const OPERATOR_NAME: Partial<Record<TokKind, string>> = {
  and: "e/·",
  or: "ou/+",
  xor: "⊕",
  nand: "nand",
  nor: "nor",
  imp: "→",
  iff: "↔",
  not: "não",
};

class Parser {
  private p = 0;
  private readonly toks: Tok[];
  private readonly source: string;
  constructor(toks: Tok[], source: string) {
    this.toks = toks;
    this.source = source;
  }

  private peek(): Tok {
    return this.toks[this.p]!;
  }
  private next(): Tok {
    return this.toks[this.p++]!;
  }

  parse(): BoolExpr {
    const first = this.peek();
    if (first.kind === "end") throw new BoolParseError("a expressão está vazia", 0, this.source);
    const e = this.iff();
    const t = this.peek();
    if (t.kind === "rparen") throw new BoolParseError('")" sem "(" correspondente', t.pos, this.source);
    if (t.kind !== "end") throw new BoolParseError(`símbolo inesperado "${t.text}"`, t.pos, this.source);
    return e;
  }

  private needOperand(after: Tok): void {
    const t = this.peek();
    if (t.kind === "end" || t.kind === "rparen") {
      throw new BoolParseError(`falta um operando depois de "${after.text}"`, t.pos, this.source);
    }
  }

  private iff(): BoolExpr {
    let left = this.imp();
    while (this.peek().kind === "iff") {
      const op = this.next();
      this.needOperand(op);
      left = { kind: "bin", op: "iff", left, right: this.imp() };
    }
    return left;
  }

  private imp(): BoolExpr {
    const left = this.or();
    if (this.peek().kind === "imp") {
      const op = this.next();
      this.needOperand(op);
      return { kind: "bin", op: "imp", left, right: this.imp() };
    }
    return left;
  }

  private or(): BoolExpr {
    let left = this.xor();
    for (;;) {
      const k = this.peek().kind;
      if (k !== "or" && k !== "nor") return left;
      const op = this.next();
      this.needOperand(op);
      left = { kind: "bin", op: k, left, right: this.xor() };
    }
  }

  private xor(): BoolExpr {
    let left = this.and();
    while (this.peek().kind === "xor") {
      const op = this.next();
      this.needOperand(op);
      left = { kind: "bin", op: "xor", left, right: this.and() };
    }
    return left;
  }

  private startsOperand(t: Tok): boolean {
    return t.kind === "var" || t.kind === "const" || t.kind === "lparen" || t.kind === "not";
  }

  private and(): BoolExpr {
    let left = this.not();
    for (;;) {
      const t = this.peek();
      if (t.kind === "and" || t.kind === "nand") {
        this.next();
        this.needOperand(t);
        left = { kind: "bin", op: t.kind, left, right: this.not() };
      } else if (this.startsOperand(t)) {
        // juxtaposition: A'B, A(B+C), AB
        left = { kind: "bin", op: "and", left, right: this.not() };
      } else return left;
    }
  }

  private not(): BoolExpr {
    const t = this.peek();
    if (t.kind === "not") {
      this.next();
      this.needOperand(t);
      return { kind: "not", arg: this.not() };
    }
    return this.post();
  }

  private post(): BoolExpr {
    let e = this.atom();
    while (this.peek().kind === "prime") {
      this.next();
      e = { kind: "not", arg: e };
    }
    return e;
  }

  private atom(): BoolExpr {
    const t = this.next();
    switch (t.kind) {
      case "var":
        return { kind: "var", name: t.text };
      case "const":
        return { kind: "const", value: t.value === true };
      case "lparen": {
        if (this.peek().kind === "rparen") throw new BoolParseError("parênteses vazios", t.pos, this.source);
        const inner = this.iff();
        const close = this.peek();
        if (close.kind !== "rparen") {
          throw new BoolParseError(`"(" da posição ${t.pos + 1} não foi fechado`, close.pos, this.source);
        }
        this.next();
        return inner;
      }
      case "end":
        throw new BoolParseError("a expressão terminou antes do esperado", t.pos, this.source);
      default: {
        const name = OPERATOR_NAME[t.kind] ?? t.text;
        throw new BoolParseError(`esperava uma variável, constante ou "(", e encontrei o operador "${t.text}" (${name})`, t.pos, this.source);
      }
    }
  }
}

export function parseBool(source: string): BoolExpr {
  return new Parser(tokenize(source), source).parse();
}

// ---- evaluation --------------------------------------------------------------

export type Env = Record<string, boolean | 0 | 1>;

export function applyOp(op: BinOp, a: boolean, b: boolean): boolean {
  switch (op) {
    case "and":
      return a && b;
    case "or":
      return a || b;
    case "xor":
      return a !== b;
    case "nand":
      return !(a && b);
    case "nor":
      return !(a || b);
    case "imp":
      return !a || b;
    case "iff":
      return a === b;
  }
}

export function evalBool(e: BoolExpr, env: Env): boolean {
  switch (e.kind) {
    case "const":
      return e.value;
    case "var": {
      const v = env[e.name];
      if (v === undefined) throw new Error(`variável "${e.name}" sem valor`);
      return v === true || v === 1;
    }
    case "not":
      return !evalBool(e.arg, env);
    case "bin":
      return applyOp(e.op, evalBool(e.left, env), evalBool(e.right, env));
  }
}

/** Variables in order of first appearance, left to right, without repeats. */
export function variablesOf(e: BoolExpr, into: string[] = []): string[] {
  switch (e.kind) {
    case "var":
      if (!into.includes(e.name)) into.push(e.name);
      break;
    case "not":
      variablesOf(e.arg, into);
      break;
    case "bin":
      variablesOf(e.left, into);
      variablesOf(e.right, into);
      break;
    case "const":
      break;
  }
  return into;
}

/** A structural key: equal keys mean the same tree (operand order matters). */
export function exprKey(e: BoolExpr): string {
  switch (e.kind) {
    case "const":
      return e.value ? "1" : "0";
    case "var":
      return e.name;
    case "not":
      return `¬(${exprKey(e.arg)})`;
    case "bin":
      return `(${exprKey(e.left)} ${e.op} ${exprKey(e.right)})`;
  }
}

/**
 * The compound subexpressions of `e` in evaluation order (operands before the
 * operators that use them), each once, EXCLUDING `e` itself and excluding
 * bare variables and constants: the columns a student fills in on the way to
 * the answer. A `nand`/`nor` node's inner AND/OR is not listed (the operator
 * is one step, as in the source).
 */
export function subexpressions(e: BoolExpr): BoolExpr[] {
  const seen = new Set<string>();
  const out: BoolExpr[] = [];
  const walk = (n: BoolExpr): void => {
    if (n.kind === "not") walk(n.arg);
    else if (n.kind === "bin") {
      walk(n.left);
      walk(n.right);
    }
    if (n.kind === "var" || n.kind === "const") return;
    const key = exprKey(n);
    if (n === e || seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  walk(e);
  return out;
}

// ---- truth rows --------------------------------------------------------------

export type TruthRow = {
  /** The minterm number: the row read as a binary number, first variable most significant, true = 1. */
  index: number;
  values: boolean[];
  result: boolean;
};

export const MAX_VARIABLES = 10;

function checkVariables(vars: string[]): void {
  if (vars.length > MAX_VARIABLES) throw new Error(`no máximo ${MAX_VARIABLES} variáveis (recebi ${vars.length})`);
}

function assignment(vars: string[], index: number): Env {
  const env: Env = {};
  vars.forEach((name, i) => {
    env[name] = ((index >> (vars.length - 1 - i)) & 1) === 1;
  });
  return env;
}

/**
 * Every row of the table of `e` over `vars` (default: its own variables).
 * "ascending" starts at 00…0 (Eletrônica Digital), "descending" at V…V
 * (Lógica). `index` is the minterm number either way.
 */
export function truthRows(e: BoolExpr, vars: string[] = variablesOf(e), order: "ascending" | "descending" = "ascending"): TruthRow[] {
  checkVariables(vars);
  const total = 1 << vars.length;
  const rows: TruthRow[] = [];
  for (let k = 0; k < total; k += 1) {
    const index = order === "ascending" ? k : total - 1 - k;
    const env = assignment(vars, index);
    rows.push({ index, values: vars.map((v) => env[v] === true), result: evalBool(e, env) });
  }
  return rows;
}

export function mintermsOf(e: BoolExpr, vars: string[] = variablesOf(e)): number[] {
  return truthRows(e, vars, "ascending")
    .filter((r) => r.result)
    .map((r) => r.index);
}

export type Classification = "tautology" | "contradiction" | "contingency";

export function classify(e: BoolExpr, vars: string[] = variablesOf(e)): Classification {
  const rows = truthRows(e, vars);
  const trues = rows.filter((r) => r.result).length;
  return trues === rows.length ? "tautology" : trues === 0 ? "contradiction" : "contingency";
}

/** Do `a` and `b` agree on every row over the union of their variables? */
export function equivalent(a: BoolExpr, b: BoolExpr): boolean {
  const vars = variablesOf(b, variablesOf(a));
  const ra = truthRows(a, vars);
  const rb = truthRows(b, vars);
  return ra.every((row, i) => row.result === rb[i]!.result);
}

// ---- sums of products ----------------------------------------------------------

/**
 * A sum of products over `vars`. Each term is a pattern of "1" (the variable),
 * "0" (its complement) and "-" (absent), one character per variable: "01-" over
 * [A, B, C] is A′·B.
 */
export type SumOfProducts = { vars: string[]; terms: string[] };

const bits = (index: number, n: number): string => index.toString(2).padStart(n, "0");

/** The canonical sum of minterms of `e`: one full-width term per true row. */
export function toSumOfProducts(e: BoolExpr, vars: string[] = variablesOf(e)): SumOfProducts {
  return { vars, terms: mintermsOf(e, vars).map((m) => bits(m, vars.length)) };
}

const literalCount = (term: string): number => [...term].filter((c) => c !== "-").length;

/** The expression a sum of products stands for. No terms is 0; the empty product is 1. */
export function sopToExpr(sop: SumOfProducts): BoolExpr {
  const products = sop.terms.map((term): BoolExpr => {
    const lits: BoolExpr[] = [];
    [...term].forEach((c, i) => {
      if (c === "-") return;
      const v: BoolExpr = { kind: "var", name: sop.vars[i]! };
      lits.push(c === "1" ? v : { kind: "not", arg: v });
    });
    if (lits.length === 0) return { kind: "const", value: true };
    return lits.reduce((left, right): BoolExpr => ({ kind: "bin", op: "and", left, right }));
  });
  if (products.length === 0) return { kind: "const", value: false };
  return products.reduce((left, right): BoolExpr => ({ kind: "bin", op: "or", left, right }));
}

// ---- Quine–McCluskey -----------------------------------------------------------

type Cube = { value: number; dash: number };

const cubeKey = (c: Cube): string => `${c.value}/${c.dash}`;
const covers = (c: Cube, minterm: number): boolean => (minterm & ~c.dash) === c.value;
const cubeLiterals = (c: Cube, n: number): number => n - popcount(c.dash);
function popcount(x: number): number {
  let n = 0;
  for (let v = x; v > 0; v >>= 1) n += v & 1;
  return n;
}

/** Every prime implicant of the function that is 1 on `ones` (dont-cares included). */
export function primeImplicants(n: number, ones: number[]): Cube[] {
  let level = new Map<string, Cube>();
  for (const m of ones) level.set(cubeKey({ value: m, dash: 0 }), { value: m, dash: 0 });
  const primes: Cube[] = [];
  while (level.size > 0) {
    const cubes = [...level.values()];
    const combined = new Set<string>();
    const nextLevel = new Map<string, Cube>();
    // Only cubes with the same dashes and values differing in one bit combine.
    const byDash = new Map<number, Cube[]>();
    for (const c of cubes) {
      const list = byDash.get(c.dash) ?? [];
      list.push(c);
      byDash.set(c.dash, list);
    }
    for (const [dash, list] of byDash) {
      const set = new Map(list.map((c) => [c.value, c]));
      for (const c of list) {
        for (let b = 0; b < n; b += 1) {
          const bit = 1 << b;
          if ((dash & bit) !== 0 || (c.value & bit) !== 0) continue;
          const partner = set.get(c.value | bit);
          if (partner === undefined) continue;
          combined.add(cubeKey(c));
          combined.add(cubeKey(partner));
          const merged: Cube = { value: c.value, dash: dash | bit };
          nextLevel.set(cubeKey(merged), merged);
        }
      }
    }
    for (const c of cubes) if (!combined.has(cubeKey(c))) primes.push(c);
    level = nextLevel;
  }
  return primes;
}

/** Past this many partial products Petrick's method gives way to a greedy cover. */
export const PETRICK_LIMIT = 20000;

export type Minimised = SumOfProducts & {
  /** True when the cover is provably minimal (Petrick completed); false after the greedy fallback. */
  exact: boolean;
  /** Prime implicants as patterns, for showing the work. */
  primes: string[];
  /** The primes every cover must contain. */
  essential: string[];
};

function pattern(c: Cube, n: number): string {
  let s = "";
  for (let i = n - 1; i >= 0; i -= 1) s += (c.dash >> i) & 1 ? "-" : (c.value >> i) & 1 ? "1" : "0";
  return s;
}

/** Minimal sum of products from minterm numbers (and optional don't-cares). */
export function simplifyMinterms(vars: string[], minterms: number[], dontCares: number[] = []): Minimised {
  checkVariables(vars);
  const n = vars.length;
  const onSet = [...new Set(minterms)].sort((a, b) => a - b);
  if (onSet.length === 0) return { vars, terms: [], exact: true, primes: [], essential: [] };
  const primes = primeImplicants(n, [...onSet, ...dontCares]);
  const need = onSet;
  const coverers = need.map((m) => primes.map((p, i) => (covers(p, m) ? i : -1)).filter((i) => i >= 0));

  const chosen = new Set<number>();
  need.forEach((_m, k) => {
    if (coverers[k]!.length === 1) chosen.add(coverers[k]![0]!);
  });
  const essential = [...chosen];
  const remaining = need.map((_m, k) => k).filter((k) => !coverers[k]!.some((i) => chosen.has(i)));

  let exact = true;
  if (remaining.length > 0) {
    // Petrick: product over remaining minterms of (sum of primes covering it),
    // kept as a set of prime-index sets with absorption.
    let products: number[][] = [[]];
    let overflow = false;
    for (const k of remaining) {
      const options = coverers[k]!.filter((i) => !chosen.has(i));
      const next = new Map<string, number[]>();
      for (const partial of products) {
        for (const option of options) {
          const merged = partial.includes(option) ? partial : [...partial, option].sort((a, b) => a - b);
          next.set(merged.join(","), merged);
        }
      }
      // absorption: drop any product that is a superset of another
      const list = [...next.values()].sort((a, b) => a.length - b.length);
      const kept: number[][] = [];
      for (const cand of list) if (!kept.some((s) => s.every((x) => cand.includes(x)))) kept.push(cand);
      products = kept;
      if (products.length > PETRICK_LIMIT) {
        overflow = true;
        break;
      }
    }
    if (!overflow) {
      const cost = (set: number[]): [number, number] => [set.length, set.reduce((s, i) => s + cubeLiterals(primes[i]!, n), 0)];
      const best = products.reduce((a, b) => {
        const ca = cost(a);
        const cb = cost(b);
        return cb[0] < ca[0] || (cb[0] === ca[0] && cb[1] < ca[1]) ? b : a;
      });
      for (const i of best) chosen.add(i);
    } else {
      exact = false;
      const left = new Set(remaining);
      while (left.size > 0) {
        let bestI = -1;
        let bestGain = -1;
        primes.forEach((p, i) => {
          if (chosen.has(i)) return;
          const gain = [...left].filter((k) => covers(p, need[k]!)).length;
          if (gain > bestGain) {
            bestGain = gain;
            bestI = i;
          }
        });
        chosen.add(bestI);
        for (const k of [...left]) if (covers(primes[bestI]!, need[k]!)) left.delete(k);
      }
    }
  }
  const order = (t: string): string => t.replace(/0/g, "a").replace(/1/g, "b").replace(/-/g, "c");
  const terms = [...chosen].map((i) => pattern(primes[i]!, n)).sort((x, y) => (order(x) < order(y) ? -1 : 1));
  return {
    vars,
    terms,
    exact,
    primes: primes.map((p) => pattern(p, n)).sort(),
    essential: essential.map((i) => pattern(primes[i]!, n)).sort(),
  };
}

/** Minimal sum of products of `e` over `vars` (default: its own variables). */
export function simplify(e: BoolExpr, vars: string[] = variablesOf(e)): Minimised {
  return simplifyMinterms(vars, mintermsOf(e, vars));
}

// ---- writing -----------------------------------------------------------------

type Style = {
  not: (s: string, atomic: boolean) => string;
  and: string;
  or: string;
  xor: string;
  imp: string;
  iff: string;
  t: string;
  f: string;
};

const STYLES: Record<Notation, Style> = {
  logic: {
    not: (s) => `¬${s}`,
    and: " ∧ ",
    or: " ∨ ",
    xor: " ⊕ ",
    imp: " → ",
    iff: " ↔ ",
    t: "V",
    f: "F",
  },
  digital: {
    not: (s, atomic) => (atomic ? `${s}′` : `(${s})′`),
    and: "·",
    or: " + ",
    xor: " ⊕ ",
    imp: " → ",
    iff: " ↔ ",
    t: "1",
    f: "0",
  },
};

/** nand/nor rewritten as the negation of and/or, everywhere. */
function desugar(e: BoolExpr): BoolExpr {
  switch (e.kind) {
    case "const":
    case "var":
      return e;
    case "not":
      return { kind: "not", arg: desugar(e.arg) };
    case "bin": {
      const left = desugar(e.left);
      const right = desugar(e.right);
      if (e.op === "nand") return { kind: "not", arg: { kind: "bin", op: "and", left, right } };
      if (e.op === "nor") return { kind: "not", arg: { kind: "bin", op: "or", left, right } };
      return { kind: "bin", op: e.op, left, right };
    }
  }
}

/**
 * `e` typeset in a notation. "logic": V/F, ¬ ∧ ∨ ⊕ → ↔ (Lógica, Matemática
 * Discreta). "digital": 1/0, · + ′ (Eletrônica Digital). nand/nor print as the
 * negation of and/or, so a column header says what the gate computes.
 * Parentheses are explicit between different binary operators, except in
 * digital notation where · under + and ⊕ is the convention.
 */
export function formatBool(e: BoolExpr, notation: Notation = "logic"): string {
  const st = STYLES[notation];
  const fmt = (n: BoolExpr): string => {
    switch (n.kind) {
      case "const":
        return n.value ? st.t : st.f;
      case "var":
        return n.name;
      case "not": {
        const compound = n.arg.kind === "bin";
        const inner = fmt(n.arg);
        return notation === "logic" ? `¬${compound ? `(${inner})` : inner}` : compound ? `(${inner})′` : `${inner}′`;
      }
      case "bin": {
        const assoc = n.op === "and" || n.op === "or" || n.op === "xor";
        const child = (c: BoolExpr): string => {
          const text = fmt(c);
          if (c.kind !== "bin") return text;
          if (c.op === n.op && assoc) return text;
          if (notation === "digital" && c.op === "and" && (n.op === "or" || n.op === "xor")) return text;
          return `(${text})`;
        };
        const sep = { and: st.and, or: st.or, xor: st.xor, imp: st.imp, iff: st.iff, nand: st.and, nor: st.or }[n.op];
        return `${child(n.left)}${sep}${child(n.right)}`;
      }
    }
  };
  return fmt(desugar(e));
}

/** A sum of products, typeset: "A′·B + A·B′" (digital) or "(¬A ∧ B) ∨ (A ∧ ¬B)" (logic). */
export function formatSop(sop: SumOfProducts, notation: Notation = "logic"): string {
  const st = STYLES[notation];
  if (sop.terms.length === 0) return st.f;
  const products = sop.terms.map((term) => {
    const lits = [...term].flatMap((c, i) => {
      if (c === "-") return [];
      const name = sop.vars[i]!;
      return [c === "1" ? name : notation === "logic" ? `¬${name}` : `${name}′`];
    });
    return lits.length === 0 ? st.t : lits.join(st.and);
  });
  if (notation === "digital") return products.join(st.or);
  return products.map((p) => (products.length > 1 && p.includes("∧") ? `(${p})` : p)).join(st.or);
}
