import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkPredicate,
  generateVariants,
  mulberry32,
  sampleDomain,
  sampleParams,
  seedFrom,
  VariantsError,
  numericValue,
  toNumbers,
  type Domains,
  type Predicate,
} from "../src/sheet/variants.ts";
import { evaluateParams } from "../src/sheet/calc.ts";

// --- PRNG determinism --------------------------------------------------

test("mulberry32: same seed produces the same sequence", () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test("mulberry32: different seeds diverge", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

test("mulberry32: values stay within [0, 1)", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test("seedFrom: same string hashes the same, different strings differ", () => {
  assert.equal(seedFrom("ex-1.1"), seedFrom("ex-1.1"));
  assert.notEqual(seedFrom("ex-1.1"), seedFrom("ex-1.2"));
});

test("generateVariants: same seed -> same admitted params; different seed -> different", async () => {
  const domains: Domains = { a: { int: [1, 100] } };
  const r1 = await generateVariants({ domains, count: 5, seed: 42 });
  const r2 = await generateVariants({ domains, count: 5, seed: 42 });
  const r3 = await generateVariants({ domains, count: 5, seed: 43 });
  assert.deepEqual(
    r1.variants.map((v) => v.params),
    r2.variants.map((v) => v.params),
  );
  assert.notDeepEqual(
    r1.variants.map((v) => v.params),
    r3.variants.map((v) => v.params),
  );
});

// --- domain sampling ---------------------------------------------------

test("sampleDomain: int stays within bounds", () => {
  const rng = mulberry32(1);
  const domain = { int: [3, 7] as [number, number] };
  for (let i = 0; i < 200; i += 1) {
    const v = sampleDomain("a", domain, rng) as number;
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 7, `${v} out of [3,7]`);
  }
});

test("sampleDomain: int excludes named values", () => {
  const rng = mulberry32(2);
  const domain = { int: [-2, 2] as [number, number], exclude: [0] };
  for (let i = 0; i < 200; i += 1) {
    const v = sampleDomain("a", domain, rng);
    assert.notEqual(v, 0);
  }
});

test("sampleDomain: int with all values excluded refuses", () => {
  const rng = mulberry32(3);
  assert.throws(() => sampleDomain("a", { int: [1, 1], exclude: [1] }, rng), VariantsError);
});

test("sampleDomain: choice only returns declared values", () => {
  const rng = mulberry32(4);
  const domain = { choice: [1, 2, 5, "1/2"] };
  const seen = new Set<unknown>();
  for (let i = 0; i < 200; i += 1) seen.add(sampleDomain("a", domain, rng));
  for (const v of seen) assert.ok(domain.choice.includes(v as number | string));
});

test("sampleDomain: decimal stays within bounds and is step-quantised", () => {
  const rng = mulberry32(5);
  const domain = { decimal: [0, 2, 0.5] as [number, number, number] };
  const allowed = new Set([0, 0.5, 1, 1.5, 2]);
  for (let i = 0; i < 200; i += 1) {
    const v = sampleDomain("a", domain, rng) as number;
    assert.ok(allowed.has(v), `${v} not in step-quantised set`);
  }
});

test("sampleDomain: decimal prints cleanly (no float noise)", () => {
  const rng = mulberry32(6);
  const domain = { decimal: [0, 3, 0.1] as [number, number, number] };
  for (let i = 0; i < 200; i += 1) {
    const v = sampleDomain("a", domain, rng) as number;
    assert.equal(String(v).length <= 4, true, `${v} has float noise`);
  }
});

test("sampleDomain: sign returns +1 or -1 only, both eventually appear", () => {
  const rng = mulberry32(7);
  const seen = new Set<number>();
  for (let i = 0; i < 200; i += 1) seen.add(sampleDomain("a", { sign: true }, rng) as number);
  assert.deepEqual([...seen].sort(), [-1, 1]);
});

test("sampleDomain: unknown shape refuses", () => {
  const rng = mulberry32(8);
  // @ts-expect-error deliberately malformed for the test
  assert.throws(() => sampleDomain("a", { bogus: true }, rng), VariantsError);
});

test("sampleParams: samples every declared name", () => {
  const rng = mulberry32(9);
  const domains: Domains = { a: { int: [1, 3] }, b: { sign: true } };
  const params = sampleParams(domains, rng);
  assert.deepEqual(Object.keys(params).sort(), ["a", "b"]);
});

// --- predicates ----------------------------------------------------------

test("checkPredicate: integer", () => {
  assert.deepEqual(checkPredicate({ integer: "a" }, { a: 4 }), { ok: true });
  const bad = checkPredicate({ integer: "a" }, { a: 4.3 });
  assert.equal(bad.ok, false);
});

test("checkPredicate: fraction with maxDen", () => {
  assert.deepEqual(checkPredicate({ fraction: "a", maxDen: 3 }, { a: 1 / 3 }), { ok: true });
  const bad = checkPredicate({ fraction: "a", maxDen: 3 }, { a: 1 / 7 });
  assert.equal(bad.ok, false);
});

test("checkPredicate: range", () => {
  assert.deepEqual(checkPredicate({ range: ["a", 0, 10] }, { a: 5 }), { ok: true });
  assert.equal(checkPredicate({ range: ["a", 0, 10] }, { a: 11 }).ok, false);
});

test("checkPredicate: nonzero", () => {
  assert.deepEqual(checkPredicate({ nonzero: "a - b" }, { a: 1, b: 0 }), { ok: true });
  assert.equal(checkPredicate({ nonzero: "a - b" }, { a: 1, b: 1 }).ok, false);
});

test("checkPredicate: positive", () => {
  assert.deepEqual(checkPredicate({ positive: "a" }, { a: 1 }), { ok: true });
  assert.equal(checkPredicate({ positive: "a" }, { a: -1 }).ok, false);
  assert.equal(checkPredicate({ positive: "a" }, { a: 0 }).ok, false);
});

test("checkPredicate: distinct", () => {
  assert.deepEqual(checkPredicate({ distinct: ["a", "b", "c"] }, { a: 1, b: 2, c: 3 }), { ok: true });
  assert.equal(checkPredicate({ distinct: ["a", "b"] }, { a: 1, b: 1 }).ok, false);
});

test("checkPredicate: unknown kind refuses by name", () => {
  assert.throws(() => checkPredicate({ bogus: "a" } as unknown as Predicate, { a: 1 }), VariantsError);
});

test("checkPredicate: unknown variable name refuses", () => {
  assert.throws(() => checkPredicate({ positive: "z" }, { a: 1 }), VariantsError);
});

// --- generateVariants: admission loop -----------------------------------

test("generateVariants: predicates filter draws", async () => {
  const domains: Domains = { a: { int: [-5, 5] } };
  const predicates: Predicate[] = [{ positive: "a" }];
  const result = await generateVariants({ domains, predicates, count: 5, seed: 1 });
  assert.equal(result.variants.length, 5);
  for (const v of result.variants) assert.ok((v.params.a as number) > 0);
});

test("generateVariants: duplicates are rejected and counted", async () => {
  // A domain with only one legal value forces every draw after the first to
  // collide, so "duplicate" must appear in the rejection stats and the
  // shortfall must report count not reached.
  const domains: Domains = { a: { int: [1, 1] } };
  const result = await generateVariants({ domains, count: 3, seed: 2, maxTries: 10 });
  assert.equal(result.variants.length, 1);
  assert.ok((result.rejections.duplicate ?? 0) >= 1);
  assert.ok(result.shortfall);
  assert.equal(result.shortfall?.admitted, 1);
  assert.equal(result.shortfall?.requested, 3);
});

test("generateVariants: admit callback rejection is counted by reason", async () => {
  const domains: Domains = { a: { int: [1, 10] } };
  let calls = 0;
  const result = await generateVariants({
    domains,
    count: 3,
    seed: 3,
    maxTries: 100,
    admit: async (params) => {
      calls += 1;
      const a = params.a as number;
      return a % 2 === 0 ? { ok: true, reasons: [] } : { ok: false, reasons: ["figure-check-failed"] };
    },
  });
  assert.ok(calls > 0);
  assert.equal(result.variants.length, 3);
  for (const v of result.variants) assert.equal((v.params.a as number) % 2, 0);
  assert.ok((result.rejections["figure-check-failed"] ?? 0) > 0);
});

test("generateVariants: shortfall reported when predicates are unsatisfiable", async () => {
  const domains: Domains = { a: { int: [1, 3] } };
  const predicates: Predicate[] = [{ range: ["a", 100, 200] }];
  const result = await generateVariants({ domains, predicates, count: 2, seed: 4, maxTries: 20 });
  assert.equal(result.variants.length, 0);
  assert.ok(result.shortfall);
  assert.equal(result.shortfall?.admitted, 0);
  assert.equal(result.triesUsed, 20);
  assert.ok(Object.keys(result.rejections).length > 0);
});

test("generateVariants: pinFirst becomes variant 0, unsampled", async () => {
  const domains: Domains = { a: { int: [1, 3] } };
  const result = await generateVariants({
    domains,
    count: 3,
    seed: 5,
    pinFirst: { a: 999 },
  });
  assert.equal(result.variants[0]?.params.a, 999);
  assert.equal(result.variants[0]?.index, 0);
  assert.equal(result.variants.length, 3);
});

test("generateVariants: pinFirst rejected by its own predicates throws", async () => {
  const domains: Domains = { a: { int: [1, 3] } };
  const predicates: Predicate[] = [{ positive: "a" }];
  await assert.rejects(
    generateVariants({ domains, predicates, count: 2, seed: 6, pinFirst: { a: -1 } }),
    VariantsError,
  );
});

/** The sheet's evaluator of params, as the sheet wires it: sampled values are overrides. */
function viaCalc(spec: Record<string, number | string>) {
  return (sampled: Readonly<Record<string, number | string>>) => {
    try {
      return Object.fromEntries(evaluateParams(spec, toNumbers(sampled)).values);
    } catch (error) {
      return { refused: `params: ${(error as Error).message}` };
    }
  };
}

test("generateVariants: evaluate supplies derived params, computed by calc.evaluateParams", async () => {
  const domains: Domains = { a: { int: [1, 5] }, b: { int: [1, 5] } };
  const result = await generateVariants({
    domains,
    count: 3,
    seed: 7,
    evaluate: viaCalc({ a: 1, b: 1, sum: "a + b" }),
  });
  for (const v of result.variants) {
    assert.equal(v.env.sum, (v.params.a as number) + (v.params.b as number));
    assert.deepEqual(Object.keys(v.params), ["a", "b"], "params are the sampled values only");
  }
});

test("generateVariants: predicates see derived params", async () => {
  const domains: Domains = { a: { int: [1, 5] }, b: { int: [1, 5] } };
  const predicates: Predicate[] = [{ nonzero: "sum - 6" }];
  const result = await generateVariants({
    domains,
    predicates,
    count: 3,
    seed: 8,
    evaluate: viaCalc({ a: 1, b: 1, sum: "a + b" }),
    maxTries: 500,
  });
  assert.equal(result.variants.length, 3);
  for (const v of result.variants) assert.notEqual(v.env.sum, 6);
});

test("generateVariants: predicates see calculus params (an integral) exactly as the sheet computes them", async () => {
  const spec = { a: 1, b: 1, "f(x)": "a*x^2", A: "integral(f(x), x, 0, b)" };
  const result = await generateVariants({
    domains: { a: { choice: ["1/2", 1, 2] }, b: { int: [1, 4] } },
    predicates: [{ range: ["A", 0, 10] }],
    count: 4,
    seed: 9,
    evaluate: viaCalc(spec),
  });
  for (const v of result.variants) {
    const expected = evaluateParams(spec, toNumbers(v.params)).values.get("A")!;
    assert.equal(v.env.A, expected);
    assert.ok(v.env.A! <= 10);
  }
});

test("generateVariants: a draw the evaluator refuses is rejected under its reason, not thrown", async () => {
  // integral of 1/(x - c) over [0, 2] has a pole when c is inside it.
  const result = await generateVariants({
    domains: { c: { int: [-3, 5] } },
    count: 3,
    seed: 10,
    evaluate: (sampled) => {
      const refused = viaCalc({ c: 3, I: "integral(1/(x - c), x, 0, 2)" })(sampled);
      return "refused" in refused ? { refused: "pole" } : refused;
    },
  });
  assert.equal(result.variants.length, 3);
  for (const v of result.variants) assert.ok((v.params.c as number) < 0 || (v.params.c as number) > 2);
  assert.ok((result.rejections.pole ?? 0) > 0);
});

test("generateVariants: \"1/2\" and 0.5 are the same draw", async () => {
  const result = await generateVariants({
    domains: { a: { choice: ["1/2"] } },
    count: 2,
    seed: 11,
    maxTries: 5,
    pinFirst: { a: 0.5 },
  });
  assert.equal(result.variants.length, 1);
  assert.equal(result.rejections.duplicate, 4);
  assert.equal(numericValue("a", "1/2"), 0.5);
  assert.throws(() => numericValue("a", "x + 1"), VariantsError);
});

test("generateVariants: deterministic order across two identical runs, including triesUsed", async () => {
  const domains: Domains = { a: { int: [1, 50] } };
  const predicates: Predicate[] = [{ integer: "a" }];
  const r1 = await generateVariants({ domains, predicates, count: 8, seed: "lista-1.1" });
  const r2 = await generateVariants({ domains, predicates, count: 8, seed: "lista-1.1" });
  assert.deepEqual(r1.variants, r2.variants);
  assert.equal(r1.triesUsed, r2.triesUsed);
});

test("generateVariants: count must be a positive integer", async () => {
  await assert.rejects(generateVariants({ domains: {}, count: 0, seed: 1 }), VariantsError);
});
