/**
 * A small closed parser for set expressions over named sets: the language a
 * Conjuntos exercise shades in ("sombreie (A ∪ B) − C").
 *
 *   expression := term { ("∪" | "−") term }          left associative
 *   term       := factor { "∩" factor }               binds tighter
 *   factor     := ("~" | "¬" | "!" | "not") factor | atom { complement }
 *   atom       := set name | "U" | "∅" | "(" expression ")"
 *   complement := "'" | "′" | "ᶜ" | "^c" | "^{c}"
 *
 * Synonyms, so a spec can be typed on any keyboard: union `∪ | + union`,
 * intersection `∩ & inter intersect`, difference `− - – \ minus`. There is no
 * eval and no host language: the grammar above is everything. A name that is
 * not one of the sets is refused with the names that were expected.
 *
 * `∪` and `−` share a level (as + and − do), so `A ∪ B − C` is
 * `(A ∪ B) − C`; the canonical text `printSetExpr` writes always brackets a
 * mix of the two, so a reader never has to know that.
 */

import { SpecError } from "../../ir/types.ts";

export type SetExpr =
  | { k: "set"; i: number }
  | { k: "universe" }
  | { k: "empty" }
  | { k: "not"; a: SetExpr }
  | { k: "and"; a: SetExpr; b: SetExpr }
  | { k: "or"; a: SetExpr; b: SetExpr }
  | { k: "minus"; a: SetExpr; b: SetExpr };

type Tok = { t: "set"; i: number; at: number } | { t: "universe" | "empty" | "(" | ")" | "or" | "and" | "minus" | "post-not" | "pre-not"; at: number };

const RESERVED = ["union", "inter", "intersect", "minus", "not"];

/** Names a set may not take: they would be read as operators or as the universe. */
export function isReservedSetName(name: string, universe: string): boolean {
  return name === "U" || name === universe || name === "∅" || RESERVED.includes(name.toLowerCase());
}

const WORD = /[\p{L}\p{N}_]/u;
const isWord = (c: string): boolean => WORD.test(c) && c !== "ᶜ";

function tokenize(src: string, names: readonly string[], universe: string, path: string): Tok[] {
  const out: Tok[] = [];
  const s = src;
  let i = 0;
  const fail = (msg: string, at: number): never => {
    throw new SpecError(`${path}: ${msg} (at position ${at + 1} of ${JSON.stringify(src)})`);
  };
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(") out.push({ t: "(", at: i });
    else if (ch === ")") out.push({ t: ")", at: i });
    else if (ch === "∪" || ch === "|" || ch === "+") out.push({ t: "or", at: i });
    else if (ch === "∩" || ch === "&") out.push({ t: "and", at: i });
    else if (ch === "−" || ch === "-" || ch === "–" || ch === "\\") out.push({ t: "minus", at: i });
    else if (ch === "'" || ch === "′" || ch === "’" || ch === "ᶜ") out.push({ t: "post-not", at: i });
    else if (ch === "~" || ch === "¬" || ch === "!") out.push({ t: "pre-not", at: i });
    else if (ch === "∅") out.push({ t: "empty", at: i });
    else if (ch === "^") {
      const m = /^\^\s*(\{\s*c\s*\}|c)(?![\p{L}\p{N}_])/u.exec(s.slice(i));
      if (m === null) fail(`"^" must be followed by c (the complement, A^c), not ${JSON.stringify(s.slice(i, i + 3))}`, i);
      out.push({ t: "post-not", at: i });
      i += m![0].length;
      continue;
    } else if (isWord(ch)) {
      let j = i;
      while (j < s.length && isWord(s[j]!)) j += 1;
      const word = s.slice(i, j);
      const idx = names.indexOf(word);
      const lower = word.toLowerCase();
      if (idx >= 0) out.push({ t: "set", i: idx, at: i });
      else if (word === "U" || word === universe) out.push({ t: "universe", at: i });
      else if (lower === "union") out.push({ t: "or", at: i });
      else if (lower === "inter" || lower === "intersect") out.push({ t: "and", at: i });
      else if (lower === "minus") out.push({ t: "minus", at: i });
      else if (lower === "not") out.push({ t: "pre-not", at: i });
      else {
        const hint = word.length > 1 && [...word].every((c) => names.includes(c)) ? ` -- write the operator between them: ${[...word].join(" ∪ ")}` : "";
        fail(`${JSON.stringify(word)} is not one of the sets (${names.join(", ")}), the universe (U) or an operator${hint}`, i);
      }
      i = j;
      continue;
    } else fail(`unexpected character ${JSON.stringify(ch)}`, i);
    i += 1;
  }
  return out;
}

/** Parse `src` over the given set names. Throws SpecError naming `path`. */
export function parseSetExpr(src: string, names: readonly string[], universe = "U", path = "venn.shade"): SetExpr {
  if (typeof src !== "string" || src.trim() === "") throw new SpecError(`${path} must be a non-empty set expression such as "(A ∪ B) − C", got ${JSON.stringify(src)}`);
  const toks = tokenize(src, names, universe, path);
  let p = 0;
  const fail = (msg: string, at: number): never => {
    throw new SpecError(`${path}: ${msg} (at position ${at + 1} of ${JSON.stringify(src)})`);
  };
  const peek = (): Tok | undefined => toks[p];

  const parseOr = (): SetExpr => {
    let left = parseAnd();
    for (;;) {
      const t = peek();
      if (t === undefined || (t.t !== "or" && t.t !== "minus")) return left;
      p += 1;
      const right = parseAnd();
      left = t.t === "or" ? { k: "or", a: left, b: right } : { k: "minus", a: left, b: right };
    }
  };
  const parseAnd = (): SetExpr => {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t === undefined || t.t !== "and") return left;
      p += 1;
      left = { k: "and", a: left, b: parseUnary() };
    }
  };
  const parseUnary = (): SetExpr => {
    const t = peek();
    if (t !== undefined && t.t === "pre-not") {
      p += 1;
      return { k: "not", a: parseUnary() };
    }
    let e = parseAtom();
    for (;;) {
      const q = peek();
      if (q === undefined || q.t !== "post-not") return e;
      p += 1;
      e = { k: "not", a: e };
    }
  };
  const parseAtom = (): SetExpr => {
    const t = peek();
    if (t === undefined) return fail("the expression ends where a set was expected", src.length);
    p += 1;
    if (t.t === "set") return { k: "set", i: t.i };
    if (t.t === "universe") return { k: "universe" };
    if (t.t === "empty") return { k: "empty" };
    if (t.t === "(") {
      const e = parseOr();
      const close = peek();
      if (close === undefined || close.t !== ")") return fail("a bracket is never closed", t.at);
      p += 1;
      return e;
    }
    return fail("a set was expected here, found an operator", t.at);
  };

  const e = parseOr();
  const rest = peek();
  if (rest !== undefined) fail(rest.t === ")" ? "a closing bracket has no opening one" : "two sets in a row: an operator (∪ ∩ −) is missing", rest.at);
  return e;
}

/** Is a point that belongs to exactly the sets in `member` inside the expression? */
export function evalSetExpr(e: SetExpr, member: readonly boolean[]): boolean {
  switch (e.k) {
    case "set":
      return member[e.i] === true;
    case "universe":
      return true;
    case "empty":
      return false;
    case "not":
      return !evalSetExpr(e.a, member);
    case "and":
      return evalSetExpr(e.a, member) && evalSetExpr(e.b, member);
    case "or":
      return evalSetExpr(e.a, member) || evalSetExpr(e.b, member);
    case "minus":
      return evalSetExpr(e.a, member) && !evalSetExpr(e.b, member);
  }
}

const OPS = { or: "∪", and: "∩", minus: "−" } as const;

/** The canonical text of an expression: ∪ ∩ − and a prime, bracketed wherever a reader could misread it. */
export function printSetExpr(e: SetExpr, names: readonly string[], universe = "U"): string {
  type Parent = "top" | "or" | "and" | "minus" | "not";
  const go = (x: SetExpr, parent: Parent): string => {
    switch (x.k) {
      case "set":
        return names[x.i]!;
      case "universe":
        return universe;
      case "empty":
        return "∅";
      case "not":
        return `${go(x.a, "not")}′`;
      case "and":
      case "or":
      case "minus": {
        const text = `${go(x.a, x.k)} ${OPS[x.k]} ${go(x.b, x.k)}`;
        const brackets =
          parent === "not" ||
          (parent === "and" && x.k !== "and") ||
          (parent === "or" && x.k === "minus") ||
          (parent === "minus" && x.k !== "and");
        return brackets ? `(${text})` : text;
      }
    }
  };
  return go(e, "top");
}
