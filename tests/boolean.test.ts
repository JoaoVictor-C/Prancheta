/**
 * src/math/boolean.ts: the grammar (precedence, both notations, the prime,
 * juxtaposition, errors with positions), the evaluator, the tables, and
 * Quine–McCluskey checked against an exhaustive search for the minimum -- not
 * against a hand-copied answer that could share the implementation's mistake.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BoolParseError,
  classify,
  equivalent,
  evalBool,
  exprKey,
  formatBool,
  formatSop,
  mintermsOf,
  parseBool,
  simplify,
  simplifyMinterms,
  sopToExpr,
  subexpressions,
  toSumOfProducts,
  truthRows,
  variablesOf,
} from "../src/math/boolean.ts";
import type { BoolExpr } from "../src/math/boolean.ts";

const P = parseBool;
const V = (name: string): BoolExpr => ({ kind: "var", name });
const NOT = (arg: BoolExpr): BoolExpr => ({ kind: "not", arg });
const BIN = (op: "and" | "or" | "xor" | "nand" | "nor" | "imp" | "iff", left: BoolExpr, right: BoolExpr): BoolExpr => ({ kind: "bin", op, left, right });

const table = (source: string, vars?: string[]): string => truthRows(P(source), vars).map((r) => (r.result ? "1" : "0")).join("");

// ---- precedence -------------------------------------------------------------------

test("not binds tighter than and, and than xor, or, →, ↔", () => {
  assert.deepEqual(P("not A and B"), BIN("and", NOT(V("A")), V("B")));
  assert.deepEqual(P("A and B or C"), BIN("or", BIN("and", V("A"), V("B")), V("C")));
  assert.deepEqual(P("A or B and C"), BIN("or", V("A"), BIN("and", V("B"), V("C"))));
  assert.deepEqual(P("A or B xor C"), BIN("or", V("A"), BIN("xor", V("B"), V("C"))));
  assert.deepEqual(P("A xor B and C"), BIN("xor", V("A"), BIN("and", V("B"), V("C"))));
  assert.deepEqual(P("A -> B or C"), BIN("imp", V("A"), BIN("or", V("B"), V("C"))));
  assert.deepEqual(P("A or B -> C"), BIN("imp", BIN("or", V("A"), V("B")), V("C")));
  assert.deepEqual(P("A <-> B -> C"), BIN("iff", V("A"), BIN("imp", V("B"), V("C"))));
  assert.deepEqual(P("A -> B <-> C"), BIN("iff", BIN("imp", V("A"), V("B")), V("C")));
});

test("associativity: and/or/xor/iff to the left, → to the right", () => {
  assert.deepEqual(P("A -> B -> C"), BIN("imp", V("A"), BIN("imp", V("B"), V("C"))));
  assert.deepEqual(P("A xor B xor C"), BIN("xor", BIN("xor", V("A"), V("B")), V("C")));
  assert.deepEqual(P("A <-> B <-> C"), BIN("iff", BIN("iff", V("A"), V("B")), V("C")));
  assert.deepEqual(P("A nand B nand C"), BIN("nand", BIN("nand", V("A"), V("B")), V("C")));
});

test("nand sits at the and level and nor at the or level", () => {
  assert.deepEqual(P("A or B nand C"), BIN("or", V("A"), BIN("nand", V("B"), V("C"))));
  assert.deepEqual(P("A and B nor C"), BIN("nor", BIN("and", V("A"), V("B")), V("C")));
});

test("parentheses override precedence", () => {
  assert.deepEqual(P("A and (B or C)"), BIN("and", V("A"), BIN("or", V("B"), V("C"))));
  assert.deepEqual(P("not (A or B)"), NOT(BIN("or", V("A"), V("B"))));
  assert.deepEqual(P("((A))"), V("A"));
});

// ---- notations ----------------------------------------------------------------------

test("every spelling of an operator means the same thing", () => {
  const same = (spellings: string[]): void => {
    const first = table(spellings[0]!, ["A", "B"]);
    for (const s of spellings) assert.equal(table(s, ["A", "B"]), first, s);
  };
  same(["A and B", "A·B", "A*B", "A∧B", "A & B", "A && B", "A B", "A AND B", "A.B", "A ⋅ B"]);
  same(["A or B", "A+B", "A∨B", "A | B", "A || B", "A Or B"]);
  same(["A xor B", "A⊕B", "A ⊻ B"]);
  same(["A nand B", "A ↑ B", "A ⊼ B", "not (A and B)", "(A·B)'"]);
  same(["A nor B", "A ↓ B", "A ⊽ B", "not (A or B)", "¬(A∨B)"]);
  same(["A -> B", "A → B", "A => B", "A ⇒ B", "not A or B", "A' + B"]);
  same(["A <-> B", "A ↔ B", "A <=> B", "A ⇔ B", "not (A xor B)"]);
  same(["not A", "¬A", "~A", "!A", "A'", "A′", "A’"]);
});

test("the constants: 0 1 V F true false ⊤ ⊥", () => {
  for (const one of ["1", "V", "true", "TRUE", "⊤"]) assert.deepEqual(P(one), { kind: "const", value: true }, one);
  for (const zero of ["0", "F", "false", "⊥"]) assert.deepEqual(P(zero), { kind: "const", value: false }, zero);
  assert.equal(evalBool(P("A and V"), { A: true }), true);
  assert.equal(evalBool(P("A or F"), { A: false }), false);
});

test("V and F are constants; V1 and F2 are variables", () => {
  assert.deepEqual(variablesOf(P("V1 and F2 and A")), ["V1", "F2", "A"]);
});

// ---- the prime, juxtaposition ---------------------------------------------------------

test("postfix prime negates the atom it follows, and stacks", () => {
  assert.deepEqual(P("A'"), NOT(V("A")));
  assert.deepEqual(P("A''"), NOT(NOT(V("A"))));
  assert.deepEqual(P("(A+B)'"), NOT(BIN("or", V("A"), V("B"))));
  assert.deepEqual(P("A'B"), BIN("and", NOT(V("A")), V("B")));
  assert.deepEqual(P("AB'"), BIN("and", V("A"), NOT(V("B"))));
  assert.deepEqual(P("A'B' + AB"), BIN("or", BIN("and", NOT(V("A")), NOT(V("B"))), BIN("and", V("A"), V("B"))));
  assert.deepEqual(P("not A'"), NOT(NOT(V("A"))));
});

test("juxtaposition is AND: AB, A B, A(B+C), (A+B)C, AB'C", () => {
  assert.deepEqual(P("AB"), BIN("and", V("A"), V("B")));
  assert.deepEqual(P("A(B+C)"), BIN("and", V("A"), BIN("or", V("B"), V("C"))));
  assert.deepEqual(P("(A+B)C"), BIN("and", BIN("or", V("A"), V("B")), V("C")));
  assert.deepEqual(P("AB'C"), BIN("and", BIN("and", V("A"), NOT(V("B"))), V("C")));
  assert.deepEqual(P("x1 x2"), BIN("and", V("x1"), V("x2")));
  assert.deepEqual(P("A not B"), BIN("and", V("A"), NOT(V("B"))));
  assert.deepEqual(P("A1 B_2 C₃"), BIN("and", BIN("and", V("A1"), V("B_2")), V("C₃")));
});

test("a variable is one letter with optional digits: 'AB' is A·B, never a variable AB", () => {
  assert.deepEqual(variablesOf(P("AB + CD")), ["A", "B", "C", "D"]);
  assert.deepEqual(variablesOf(P("x1 + x2 + y")), ["x1", "x2", "y"]);
  assert.deepEqual(variablesOf(P("p ∧ q")), ["p", "q"]);
});

test("keywords are case-insensitive and are not split into letters", () => {
  assert.deepEqual(P("A NOR B"), BIN("nor", V("A"), V("B")));
  assert.deepEqual(P("A Xor B"), BIN("xor", V("A"), V("B")));
  assert.deepEqual(P("NOT A"), NOT(V("A")));
});

// ---- errors -------------------------------------------------------------------------------

function failsAt(source: string, position: number, message: RegExp): void {
  assert.throws(
    () => P(source),
    (e: unknown) => e instanceof BoolParseError && e.position === position && message.test(e.message),
    `${JSON.stringify(source)} should fail at ${position} with ${message}`,
  );
}

test("errors carry their position (0-based) and a pt-BR message", () => {
  failsAt("", 0, /vazia/);
  failsAt("   ", 0, /vazia/); // only spaces: nothing to parse
  failsAt("A and", 5, /falta um operando depois de "and"/);
  failsAt("A +", 3, /falta um operando depois de "\+"/);
  failsAt("A and )", 6, /falta um operando/);
  failsAt("(A + B", 6, /não foi fechado/);
  failsAt("A + B)", 5, /sem "\("/);
  failsAt("()", 0, /vazios/);
  failsAt("A $ B", 2, /caractere inesperado "\$"/);
  failsAt("A and and B", 6, /esperava uma variável.*"and"/);
  failsAt("* A", 0, /esperava uma variável.*"\*"/);
  failsAt("' A", 0, /esperava uma variável.*"'"/);
  failsAt("2 + A", 0, /só 0 e 1/);
  failsAt("10", 0, /só 0 e 1/);
  failsAt("A -> -> B", 5, /esperava uma variável/);
  failsAt("not", 3, /falta um operando|terminou/);
});

test("the error excerpt puts a caret under the position", () => {
  try {
    P("A and $");
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof BoolParseError);
    assert.equal(e.excerpt(), "  A and $\n  " + " ".repeat(6) + "^");
    assert.match(e.message, /posição 7/);
  }
});

// ---- evaluation ----------------------------------------------------------------------------

test("each operator's table, rows 00 01 10 11", () => {
  assert.equal(table("A and B"), "0001");
  assert.equal(table("A or B"), "0111");
  assert.equal(table("A xor B"), "0110");
  assert.equal(table("A nand B"), "1110");
  assert.equal(table("A nor B"), "1000");
  assert.equal(table("A -> B"), "1101");
  assert.equal(table("A <-> B"), "1001");
  assert.equal(table("not A"), "10");
});

test("evalBool takes true/false and 1/0, and refuses a missing variable", () => {
  assert.equal(evalBool(P("A and B"), { A: 1, B: true }), true);
  assert.equal(evalBool(P("A and B"), { A: 1, B: 0 }), false);
  assert.throws(() => evalBool(P("A and B"), { A: true }), /"B" sem valor/);
});

test("variablesOf: order of first appearance, left to right", () => {
  assert.deepEqual(variablesOf(P("B and A or C")), ["B", "A", "C"]);
  assert.deepEqual(variablesOf(P("(C -> A) <-> not B")), ["C", "A", "B"]);
  assert.deepEqual(variablesOf(P("A and A")), ["A"]);
  assert.deepEqual(variablesOf(P("1 or 0")), []);
});

test("truthRows: ascending from 0…0, descending from V…V, index is the minterm number", () => {
  const asc = truthRows(P("A and not B"), ["A", "B"]);
  assert.deepEqual(asc.map((r) => r.index), [0, 1, 2, 3]);
  assert.deepEqual(asc.map((r) => r.values), [[false, false], [false, true], [true, false], [true, true]]);
  assert.deepEqual(asc.map((r) => r.result), [false, false, true, false]);
  const desc = truthRows(P("A and not B"), ["A", "B"], "descending");
  assert.deepEqual(desc.map((r) => r.index), [3, 2, 1, 0]);
  assert.deepEqual(desc[0]!.values, [true, true]);
  assert.deepEqual(desc.map((r) => r.result), [false, true, false, false]);
  // the variable order is the caller's
  assert.deepEqual(truthRows(P("A and not B"), ["B", "A"]).map((r) => r.result), [false, true, false, false]);
  assert.throws(() => truthRows(P("A"), Array.from({ length: 11 }, (_, i) => `x${i}`)), /no máximo/);
});

test("subexpressions: compound nodes only, operands first, each once, without the whole", () => {
  const keys = (s: string): string[] => subexpressions(P(s)).map((e) => formatBool(e, "logic"));
  assert.deepEqual(keys("(p and q) or not r"), ["p ∧ q", "¬r"]);
  assert.deepEqual(keys("not (p or q)"), ["p ∨ q"]);
  assert.deepEqual(keys("(p and q) or (p and q)"), ["p ∧ q"]);
  assert.deepEqual(keys("(p -> q) and (q -> p)"), ["p → q", "q → p"]);
  assert.deepEqual(keys("p"), []);
  assert.deepEqual(keys("p and q"), []);
});

test("classify and equivalent", () => {
  assert.equal(classify(P("p or not p")), "tautology");
  assert.equal(classify(P("p and not p")), "contradiction");
  assert.equal(classify(P("p and q")), "contingency");
  assert.equal(classify(P("(p and (p -> q)) -> q")), "tautology");
  assert.equal(equivalent(P("not (p or q)"), P("not p and not q")), true);
  assert.equal(equivalent(P("p -> q"), P("not p or q")), true);
  assert.equal(equivalent(P("p -> q"), P("q -> p")), false);
  assert.equal(equivalent(P("A"), P("A or (A and B)")), true, "absorption");
});

test("exprKey tells two trees apart", () => {
  assert.notEqual(exprKey(P("A and B")), exprKey(P("A or B")));
  assert.equal(exprKey(P("A B")), exprKey(P("A and B")));
});

// ---- sums of products -----------------------------------------------------------------------------

test("toSumOfProducts: the canonical minterms, one per true row", () => {
  const maj = toSumOfProducts(P("AB + AC + BC"), ["A", "B", "C"]);
  assert.deepEqual(maj.terms, ["011", "101", "110", "111"]);
  assert.deepEqual(mintermsOf(P("AB + AC + BC"), ["A", "B", "C"]), [3, 5, 6, 7]);
  assert.deepEqual(toSumOfProducts(P("A xor B")).terms, ["01", "10"]);
  assert.deepEqual(toSumOfProducts(P("A and not A"), ["A"]).terms, []);
});

// ---- Quine–McCluskey -------------------------------------------------------------------------------

test("simplify: A'B + AB' + AB → A + B", () => {
  const s = simplify(P("A'B + AB' + AB"));
  assert.deepEqual([...s.terms].sort(), ["-1", "1-"]);
  assert.equal(formatSop(s, "digital"), "A + B");
  assert.equal(s.exact, true);
});

test("simplify: known minimal forms", () => {
  const terms = (source: string): string[] => [...simplify(P(source)).terms].sort();
  assert.deepEqual(terms("A'BC + AB'C + ABC' + ABC"), ["-11", "1-1", "11-"], "majority is AB + AC + BC");
  assert.deepEqual(terms("A xor B"), ["01", "10"], "xor does not simplify");
  assert.deepEqual(terms("AB + AB'"), ["1-"], "AB + AB' = A");
  assert.deepEqual(terms("A + A'B"), ["-1", "1-"], "A + A'B = A + B");
  assert.deepEqual(terms("A or not A"), ["-"], "a tautology is the empty product 1");
  assert.deepEqual(terms("A and not A"), [], "a contradiction is the empty sum 0");
  assert.equal(formatSop(simplify(P("A or not A")), "digital"), "1");
  assert.equal(formatSop(simplify(P("A and not A")), "digital"), "0");
  assert.deepEqual(terms("(A -> B) and (B -> A)"), ["00", "11"], "iff is A'B' + AB");
  // 4 variables: Σm(0,1,2,8,10,11,14,15) = B′D′ + A′B′C′ + AC
  const s = simplifyMinterms(["A", "B", "C", "D"], [0, 1, 2, 8, 10, 11, 14, 15]);
  assert.deepEqual([...s.terms].sort(), ["-0-0", "000-", "1-1-"].sort());
});

test("Petrick: the cyclic function Σm(0,1,2,5,6,7) needs exactly three terms, not four", () => {
  const s = simplifyMinterms(["A", "B", "C"], [0, 1, 2, 5, 6, 7]);
  assert.equal(s.terms.length, 3);
  assert.equal(s.essential.length, 0, "every prime of a cyclic function is optional");
  assert.equal(s.primes.length, 6);
  assert.equal(s.exact, true);
});

test("don't-cares are used to grow terms but never have to be covered", () => {
  // Σm(1,3,7,11,15) + d(0,2,5) over four variables: A'D + CD
  const s = simplifyMinterms(["A", "B", "C", "D"], [1, 3, 7, 11, 15], [0, 2, 5]);
  assert.deepEqual([...s.terms].sort(), ["--11", "0--1"].sort());
  const plain = simplifyMinterms(["A", "B", "C", "D"], [1, 3, 7, 11, 15]);
  assert.ok(s.terms.length <= plain.terms.length);
});

// The independent check: enumerate EVERY implicant of f, keep the maximal ones,
// try every subset of them, and take the cheapest cover.
function coverMinimum(n: number, ones: number[]): { terms: number; literals: number } {
  const cubes: { value: number; dash: number }[] = [];
  const total = 1 << n;
  for (let dash = 0; dash < total; dash += 1) {
    for (let value = 0; value < total; value += 1) {
      if ((value & dash) !== 0) continue;
      const members: number[] = [];
      for (let m = 0; m < total; m += 1) if ((m & ~dash) === value) members.push(m);
      if (members.every((m) => ones.includes(m))) cubes.push({ value, dash });
    }
  }
  const members = (c: { value: number; dash: number }): number[] => Array.from({ length: total }, (_, m) => m).filter((m) => (m & ~c.dash) === c.value);
  const primes = cubes.filter((c) => !cubes.some((d) => d !== c && members(c).every((m) => members(d).includes(m)) && members(d).length > members(c).length));
  const lit = (c: { dash: number }): number => n - [...c.dash.toString(2)].filter((b) => b === "1").length;
  let best = { terms: Infinity, literals: Infinity };
  for (let mask = 0; mask < 1 << primes.length; mask += 1) {
    const chosen = primes.filter((_, i) => (mask >> i) & 1);
    if (!ones.every((m) => chosen.some((c) => (m & ~c.dash) === c.value))) continue;
    const cost = { terms: chosen.length, literals: chosen.reduce((s, c) => s + lit(c), 0) };
    if (cost.terms < best.terms || (cost.terms === best.terms && cost.literals < best.literals)) best = cost;
  }
  return best;
}

function checkAgainstExhaustive(n: number, ones: number[]): void {
  const vars = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  const s = simplifyMinterms(vars, ones);
  // it computes the function
  const back = sopToExpr(s);
  const got = mintermsOf(back, vars);
  assert.deepEqual(got, [...ones].sort((a, b) => a - b), `n=${n} ones=${ones}`);
  // and is minimal by the same measure
  const cost = { terms: s.terms.length, literals: s.terms.reduce((sum, t) => sum + [...t].filter((c) => c !== "-").length, 0) };
  const want = ones.length === 0 ? { terms: 0, literals: 0 } : coverMinimum(n, ones);
  assert.deepEqual(cost, want, `n=${n} ones=${ones}: got ${s.terms.join(" + ")}`);
}

test("Quine–McCluskey is minimal: every one of the 256 functions of 3 variables, against exhaustive search", () => {
  for (let f = 0; f < 256; f += 1) {
    const ones = Array.from({ length: 8 }, (_, m) => m).filter((m) => (f >> m) & 1);
    checkAgainstExhaustive(3, ones);
  }
});

test("Quine–McCluskey is minimal on 300 pseudo-random functions of 4 variables", () => {
  let seed = 12345;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let k = 0; k < 300; k += 1) {
    const density = 0.2 + 0.6 * rand();
    const ones = Array.from({ length: 16 }, (_, m) => m).filter(() => rand() < density);
    checkAgainstExhaustive(4, ones);
  }
});

test("simplify handles five and six variables and still computes the same function", () => {
  let seed = 99;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const n of [5, 6]) {
    for (let k = 0; k < 10; k += 1) {
      const vars = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
      const ones = Array.from({ length: 1 << n }, (_, m) => m).filter(() => rand() < 0.4);
      const s = simplifyMinterms(vars, ones);
      assert.deepEqual(mintermsOf(sopToExpr(s), vars), ones);
      assert.equal(s.exact, true);
    }
  }
});

// ---- writing ----------------------------------------------------------------------------------------

test("formatBool: logic and digital notation", () => {
  assert.equal(formatBool(P("A and B or not C"), "logic"), "(A ∧ B) ∨ ¬C");
  assert.equal(formatBool(P("A and B or not C"), "digital"), "A·B + C′");
  assert.equal(formatBool(P("not (A or B)"), "logic"), "¬(A ∨ B)");
  assert.equal(formatBool(P("not (A or B)"), "digital"), "(A + B)′");
  assert.equal(formatBool(P("p -> q"), "logic"), "p → q");
  assert.equal(formatBool(P("p <-> q"), "logic"), "p ↔ q");
  assert.equal(formatBool(P("A xor B"), "digital"), "A ⊕ B");
  assert.equal(formatBool(P("A nand B"), "digital"), "(A·B)′");
  assert.equal(formatBool(P("A nor B"), "logic"), "¬(A ∨ B)");
  assert.equal(formatBool(P("A and 1 or 0"), "logic"), "(A ∧ V) ∨ F");
  assert.equal(formatBool(P("A and 1 or 0"), "digital"), "A·1 + 0");
  assert.equal(formatBool(P("A''"), "digital"), "A′′");
  assert.equal(formatBool(P("not not A"), "logic"), "¬¬A");
  assert.equal(formatBool(P("A and B and C"), "logic"), "A ∧ B ∧ C");
  assert.equal(formatBool(P("A -> (B -> C)"), "logic"), "A → (B → C)");
});

test("formatSop", () => {
  const s = { vars: ["A", "B", "C"], terms: ["01-", "1-1"] };
  assert.equal(formatSop(s, "digital"), "A′·B + A·C");
  assert.equal(formatSop(s, "logic"), "(¬A ∧ B) ∨ (A ∧ C)");
  assert.equal(formatSop({ vars: ["A"], terms: ["1"] }, "logic"), "A");
});

// A written expression reads back as the same function: format ∘ parse is the
// identity up to equivalence, in both notations, on random trees.
test("format then parse gives back an equivalent expression (random trees, both notations)", () => {
  let seed = 7;
  const rand = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const vars = ["A", "B", "C", "D"];
  const ops = ["and", "or", "xor", "nand", "nor", "imp", "iff"] as const;
  const gen = (depth: number): BoolExpr => {
    if (depth === 0 || rand(5) === 0) return rand(9) === 0 ? { kind: "const", value: rand(2) === 0 } : V(vars[rand(4)]!);
    if (rand(4) === 0) return NOT(gen(depth - 1));
    return BIN(ops[rand(ops.length)]!, gen(depth - 1), gen(depth - 1));
  };
  for (let k = 0; k < 400; k += 1) {
    const e = gen(4);
    for (const notation of ["logic", "digital"] as const) {
      const text = formatBool(e, notation);
      const back = P(text);
      assert.ok(equivalent(e, back), `${notation}: ${text}`);
    }
  }
});
