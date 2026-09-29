/**
 * automaton: DFAs and NFAs drawn Sipser style. The runs are computed, so these
 * tests pin the SIMULATION against independent oracles (a regular expression,
 * binary arithmetic) over every short word, and decode the DRAWN geometry --
 * where each arrowhead lands, what each label says -- instead of trusting the
 * preset's own numbers a second time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  epsilonClosure,
  expandAutomaton,
  normaliseAutomaton,
  prettyName,
  runDfa,
  runNfa,
  stateOrder,
  subsetConstruction,
  validateAutomatonInput,
} from "../src/presets/automaton/preset.ts";
import type { Automaton, AutomatonInput } from "../src/presets/automaton/preset.ts";
import { SpecError } from "../src/ir/types.ts";
import type { Block, Mark, Point, Scene } from "../src/ir/types.ts";
import { render } from "../src/pipeline.ts";

const dir = fileURLToPath(new URL("../fixtures/automaton/", import.meta.url));
const fixtures = readdirSync(dir).filter((n) => n.endsWith(".json"));
const load = (name: string): Record<string, unknown> => {
  const { preset: _p, ...rest } = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
  return rest;
};
const automatonOf = (name: string): Automaton => normaliseAutomaton(load(name));
const blocksOf = (spec: { root: unknown }): Block[] => (spec.root as Scene).children.filter((c): c is Block => c.type === "block");
const marksOf = (spec: { root: unknown }): Mark[] => (spec.root as Scene).marks ?? [];
const expand = (input: Record<string, unknown>) => expandAutomaton(input as unknown as AutomatonInput);

/** Every word over `alphabet` of length 0..n. */
function words(alphabet: string[], n: number): string[] {
  let level = [""];
  const all = [""];
  for (let i = 0; i < n; i += 1) {
    level = level.flatMap((w) => alphabet.map((s) => w + s));
    all.push(...level);
  }
  return all;
}

// ---- the simulation, against independent oracles --------------------------------------

test("DFA 'ends in ab' agrees with /ab$/ on every word up to length 8", () => {
  const a = automatonOf("dfa-ends-in-ab.json");
  for (const w of words(["a", "b"], 8)) assert.equal(runDfa(a, w).accepted, /ab$/.test(w), JSON.stringify(w));
});

test("DFA 'even number of a's' agrees with counting", () => {
  const a = automatonOf("dfa-even-as.json");
  for (const w of words(["a", "b"], 8)) assert.equal(runDfa(a, w).accepted, [...w].filter((s) => s === "a").length % 2 === 0, JSON.stringify(w));
});

test("DFA 'binary divisible by 5' agrees with arithmetic on every word up to length 9", () => {
  const a = automatonOf("dfa-div-by-5.json");
  for (const w of words(["0", "1"], 9)) assert.equal(runDfa(a, w).accepted, (w === "" ? 0 : parseInt(w, 2)) % 5 === 0, JSON.stringify(w));
});

test("a DFA run is one state per symbol read, starting at the start state", () => {
  const a = automatonOf("dfa-ends-in-ab.json");
  const run = runDfa(a, "aab");
  assert.deepEqual(run.path, ["q0", "q1", "q1", "q2"]);
  assert.deepEqual(run.symbols, ["a", "a", "b"]);
  assert.equal(run.dead, false);
});

test("NFA with ε agrees with its language a* | (ab)*a", () => {
  const a = automatonOf("nfa-epsilon.json");
  for (const w of words(["a", "b"], 8)) assert.equal(runNfa(a, w).accepted, /^(a*|(ab)*a)$/.test(w), JSON.stringify(w));
});

test("NFA 'third symbol from the end is a' agrees with /a[ab][ab]$/", () => {
  const a = automatonOf("nfa-third-from-end.json");
  for (const w of words(["a", "b"], 8)) assert.equal(runNfa(a, w).accepted, /a[ab][ab]$/.test(w), JSON.stringify(w));
});

test("an NFA run starts from the ε-closure of the start state and lists states in the automaton's order", () => {
  const a = automatonOf("nfa-epsilon.json");
  const run = runNfa(a, "a");
  assert.deepEqual(run.sets[0], ["q0", "q1", "q2"]);
  assert.deepEqual(run.sets[1], ["q1", "q3"]);
});

test("ε-closure follows chains of ε, terminates on ε-cycles and includes the starting states", () => {
  const a: Automaton = {
    kind: "nfa",
    alphabet: ["a"],
    states: ["p", "q", "r", "s"],
    start: "p",
    accept: [],
    transitions: [
      { from: "p", on: "ε", to: "q" },
      { from: "q", on: "ε", to: "r" },
      { from: "r", on: "ε", to: "p" },
      { from: "r", on: "a", to: "s" },
    ],
  };
  assert.deepEqual(epsilonClosure(a, ["p"]), ["p", "q", "r"]);
  assert.deepEqual(epsilonClosure(a, ["s"]), ["s"]);
  assert.deepEqual(epsilonClosure(a, []), []);
});

test("a partial DFA falls into the implicit dead state on a missing transition and rejects", () => {
  const a = automatonOf("dfa-partial-dead.json");
  const run = runDfa(a, "ba");
  assert.equal(run.dead, true);
  assert.equal(run.accepted, false);
  assert.deepEqual(run.path, ["q0"]);
  assert.equal(runDfa(a, "abbc").accepted, true);
});

// ---- the subset construction ----------------------------------------------------------

test("subsetConstruction gives a total DFA equivalent to the NFA (ε and third-from-end)", () => {
  for (const name of ["nfa-epsilon.json", "nfa-third-from-end.json"]) {
    const nfa = automatonOf(name);
    const dfa = subsetConstruction(nfa);
    assert.equal(dfa.kind, "dfa");
    for (const s of dfa.states) {
      for (const sym of dfa.alphabet) {
        assert.equal(dfa.transitions.filter((t) => t.from === s && t.on === sym).length, 1, `${name}: ${s} on ${sym}`);
      }
    }
    for (const w of words(nfa.alphabet, 8)) assert.equal(runDfa(dfa, w).accepted, runNfa(nfa, w).accepted, `${name}: ${JSON.stringify(w)}`);
    // The result is itself a valid input: it validates.
    normaliseAutomaton({ ...dfa });
  }
});

test("subsetConstruction starts at the closure of the start state and reaches 2^3 = 8 subsets for 'third from the end'", () => {
  assert.equal(subsetConstruction(automatonOf("nfa-epsilon.json")).start, "{q0,q1,q2}");
  const dfa = subsetConstruction(automatonOf("nfa-third-from-end.json"));
  assert.equal(dfa.states.length, 8);
  assert.equal(dfa.states[0], "{q0}");
  assert.equal(dfa.accept.length, 4);
});

test("subsetConstruction names the empty subset ∅ and accepts a subset holding an accepting state", () => {
  const dfa = subsetConstruction(automatonOf("nfa-epsilon.json"));
  assert.ok(dfa.states.includes("∅"));
  assert.ok(!dfa.accept.includes("∅"));
  assert.ok(dfa.accept.includes("{q0,q1,q2}"));
});

// ---- validation -----------------------------------------------------------------------

const ends = (): AutomatonInput => load("dfa-ends-in-ab.json") as unknown as AutomatonInput;
const refuses = (input: unknown, pattern: RegExp): void =>
  assert.throws(() => validateAutomatonInput(input as Record<string, unknown>), (e: unknown) => e instanceof SpecError && pattern.test(e.message), String(pattern));

test("a DFA missing a transition is refused, naming the state and symbol, and 'partial' is offered", () => {
  const input = ends();
  input.transitions = input.transitions.filter((t) => !(t.from === "q1" && t.on === "b"));
  refuses(input, /"q1" on "b".*partial/s);
});

test("a DFA with two transitions on one symbol is refused, naming both targets", () => {
  const input = ends();
  input.transitions.push({ from: "q0", on: "a", to: "q2" });
  refuses(input, /"q0" has 2 transitions on "a".*"q1" and "q2".*deterministic/s);
});

test("ε in a DFA, an unknown state, an unknown symbol, partial on an NFA and unknown keys are refused with their path", () => {
  const eps = ends();
  eps.transitions.push({ from: "q0", on: "ε", to: "q1" });
  refuses(eps, /transitions\[6\]\.on.*only in an NFA/);
  const badState = ends();
  badState.transitions[0] = { from: "q0", on: "a", to: "q9" };
  refuses(badState, /transitions\[0\]\.to "q9" is not one of the states/);
  const badSymbol = ends();
  badSymbol.transitions[1] = { from: "q0", on: "c", to: "q0" };
  refuses(badSymbol, /transitions\[1\]\.on "c" is not in the alphabet/);
  refuses({ ...ends(), kind: "nfa", partial: true }, /partial applies to a DFA only/);
  refuses({ ...ends(), acepts: [] }, /automaton\.acepts is not a field/);
  refuses({ ...ends(), start: "z" }, /start "z" is not one of the states/);
  refuses({ ...ends(), accept: ["q7"] }, /accept\[0\] "q7"/);
  refuses({ ...ends(), alphabet: ["a", "ε"] }, /ε is the empty word/);
  refuses({ ...ends(), words: ["abc"] }, /words\[0\] "abc" contains "c"/);
});

test("a layout must place every state, only real states, and no two at one place", () => {
  refuses({ ...ends(), layout: { q0: [0, 0], q1: [1, 0] } }, /gives no position for state "q2"/);
  refuses({ ...ends(), layout: { q0: [0, 0], q1: [1, 0], q2: [2, 0], q9: [3, 0] } }, /layout\.q9 is not one of the states/);
  refuses({ ...ends(), layout: { q0: [0, 0], q1: [1, 0], q2: [1, 0] } }, /same place/);
});

test("a partial DFA validates, and a repeated identical transition is merged, not refused", () => {
  validateAutomatonInput(load("dfa-partial-dead.json"));
  const nfa = load("nfa-epsilon.json");
  (nfa.transitions as unknown[]).push({ from: "q1", on: "a", to: "q1" });
  assert.equal(normaliseAutomaton(nfa).transitions.length, 5);
});

test("stateOrder is breadth first from the start, unreachable states last", () => {
  const a = automatonOf("dfa-div-by-5.json");
  assert.deepEqual(stateOrder(a), ["r0", "r1", "r2", "r3", "r4"]);
  const b = normaliseAutomaton({
    ...load("dfa-even-as.json"),
    states: ["z", "q0", "q1"],
    transitions: [
      { from: "q0", on: ["a", "b"], to: "q1" },
      { from: "q1", on: ["a", "b"], to: "q0" },
      { from: "z", on: ["a", "b"], to: "z" },
    ],
  });
  assert.deepEqual(stateOrder(b), ["q0", "q1", "z"]);
});

test("names set digits after a letter as subscripts", () => {
  assert.equal(prettyName("q0"), "q₀");
  assert.equal(prettyName("q12"), "q₁₂");
  assert.equal(prettyName("{q0,q1}"), "{q₀,q₁}");
  assert.equal(prettyName("∅"), "∅");
  assert.equal(prettyName("inicio"), "inicio");
});

// ---- what is drawn --------------------------------------------------------------------

type Circle = { centre: Point; r: number };
/** A state's circle, decoded from its quarter arcs. */
function circles(spec: { root: unknown }): Map<string, Circle> {
  const out = new Map<string, Circle>();
  for (const m of marksOf(spec)) {
    if (!/^state-\d+$/.test(m.id)) continue;
    const seg = m.segments[0] as { arc: Point; centre: Point };
    const from = m.from as Point;
    out.set(m.id, { centre: seg.centre, r: Math.hypot(from.x - seg.centre.x, from.y - seg.centre.y) });
  }
  return out;
}
const onCircle = (p: Point, c: Circle): boolean => Math.abs(Math.hypot(p.x - c.centre.x, p.y - c.centre.y) - c.r) < 0.05;

/** The (from, to) pair each edge id stands for: groups in order of first appearance, as the preset builds them. */
function edgePairs(a: Automaton): { id: string; from: string; to: string; symbols: string[] }[] {
  const groups: { from: string; to: string; symbols: string[] }[] = [];
  for (const t of a.transitions) {
    let g = groups.find((x) => x.from === t.from && x.to === t.to);
    if (g === undefined) {
      g = { from: t.from, to: t.to, symbols: [] };
      groups.push(g);
    }
    g.symbols.push(t.on);
  }
  return groups.map((g, i) => ({ id: `edge-${i + 1}`, ...g }));
}

for (const filename of fixtures) {
  test(`${filename}: every arrowhead's tip lies on its target's circle and every tail on its source's, never at a centre`, () => {
    const input = load(filename);
    const a = normaliseAutomaton(input);
    const spec = expand(input);
    const marks = marksOf(spec);
    const byState = circles(spec);
    const stateCircle = (name: string): Circle => byState.get(`state-${a.states.indexOf(name) + 1}`)!;
    for (const e of edgePairs(a)) {
      const shaft = marks.find((m) => m.id === e.id)!;
      const head = marks.find((m) => m.id === `${e.id}-head`)!;
      const tip = head.from as Point;
      assert.ok(onCircle(tip, stateCircle(e.to)), `${filename}: ${e.id} tip is not on ${e.to}'s circle`);
      assert.ok(onCircle(shaft.from as Point, stateCircle(e.from)), `${filename}: ${e.id} does not start on ${e.from}'s circle`);
      if (e.from !== e.to) assert.ok(!onCircle(tip, stateCircle(e.from)));
    }
    const startHead = marks.find((m) => m.id === "start-arrow-head")!;
    assert.ok(onCircle(startHead.from as Point, stateCircle(a.start)));
  });

  test(`${filename}: states are named q₀-style, accepting states are double circles, edge labels merge symbols and name their edge`, () => {
    const input = load(filename);
    const a = normaliseAutomaton(input);
    const spec = expand(input);
    const blocks = blocksOf(spec);
    const marks = marksOf(spec);
    a.states.forEach((s, i) => {
      const name = blocks.find((b) => b.label === prettyName(s));
      assert.ok(name !== undefined, `${s} is named`);
      const double = marks.some((m) => m.id === `state-${i + 1}-inner`);
      assert.equal(double, a.accept.includes(s), `${s}: double circle iff accepting`);
      assert.equal(name!.annotates, double ? `state-${i + 1}-inner` : `state-${i + 1}`);
    });
    for (const e of edgePairs(a)) {
      const label = blocks.find((b) => b.annotates === e.id);
      assert.ok(label !== undefined, `${e.id} has a label`);
      assert.equal(label!.label, e.symbols.join(", "));
    }
    assert.equal(marks.filter((m) => /^edge-\d+$/.test(m.id)).length, edgePairs(a).length, "one arrow per (from, to) pair");
  });

  test(`${filename}: the panel prints one verdict per word, each the one the simulation computes`, () => {
    const input = load(filename);
    const a = normaliseAutomaton(input);
    const spec = expand(input);
    const text = blocksOf(spec).map((b) => b.label ?? "");
    const verdicts = text.filter((t) => /: (aceita|rejeita)$/.test(t));
    const ws = (input.words as string[] | undefined) ?? [];
    assert.equal(verdicts.length, ws.length);
    // Continuation lines of a wrapped run carry the verdict; count accepted / rejected instead of matching rows.
    const accepted = ws.filter((w) => (a.kind === "dfa" ? runDfa(a, w).accepted : runNfa(a, w).accepted)).length;
    assert.equal(verdicts.filter((t) => t.endsWith(": aceita")).length, accepted);
    if (a.partial === true) assert.match(text.join("\n"), /Estado morto implícito/);
    else assert.doesNotMatch(text.join("\n"), /Estado morto/);
  });
}

test("the panel reads like the textbook: the DFA path with symbols, the NFA sequence of sets", () => {
  const dfa = blocksOf(expand(load("dfa-ends-in-ab.json"))).map((b) => b.label);
  assert.ok(dfa.includes("q₀ →a q₁ →a q₁ →b q₂: aceita"), dfa.join(" | "));
  assert.ok(dfa.includes("q₀ →b q₀ →a q₁: rejeita"));
  assert.ok(dfa.includes("q₀: rejeita"), "the empty word is a run of length 0");
  const nfa = blocksOf(expand(load("nfa-epsilon.json"))).map((b) => b.label);
  assert.ok(nfa.includes("{q₀, q₁, q₂} →a {q₁, q₃} →a {q₁} →a {q₁}: aceita"), nfa.join(" | "));
  assert.ok(nfa.includes("{q₀, q₁, q₂} →b ∅ →a ∅: rejeita"));
});

test("nothing about acceptance is typed: changing the accepting set changes the verdicts", () => {
  const input = load("dfa-ends-in-ab.json");
  const text = (i: Record<string, unknown>): string[] => blocksOf(expand(i)).map((b) => b.label ?? "");
  assert.ok(text(input).includes("q₀ →a q₁ →a q₁ →b q₂: aceita"));
  assert.ok(text({ ...input, accept: ["q0", "q1"] }).includes("q₀ →a q₁ →a q₁ →b q₂: rejeita"));
});

test("a partial DFA's panel says a dead state is implied and names the missing transitions; a dead run ends in 'morto'", () => {
  const text = blocksOf(expand(load("dfa-partial-dead.json"))).map((b) => b.label ?? "");
  assert.ok(text.some((t) => t.startsWith("Estado morto implícito")));
  assert.ok(text.includes("q₀ →b morto: rejeita"), text.join(" | "));
});

test("two opposite transitions are two arcs bulging to the left of their own travel; a lone edge is one straight run", () => {
  const spec = expand(load("dfa-even-as.json"));
  const a = automatonOf("dfa-even-as.json");
  const marks = marksOf(spec);
  const c = circles(spec);
  const c0 = c.get("state-1")!.centre;
  const c1 = c.get("state-2")!.centre;
  const pair = edgePairs(a).filter((e) => e.from !== e.to);
  assert.equal(pair.length, 2);
  const sides = pair.map((e) => {
    const m = marks.find((x) => x.id === e.id)!;
    const seg = m.segments[0] as { arc?: Point; centre?: Point };
    assert.ok(seg.arc !== undefined && seg.centre !== undefined, "curved, not straight");
    // The arc's own centre lies on the side opposite its bulge; the sign of the cross product tells the sides apart.
    const cross = (c1.x - c0.x) * (seg.centre!.y - c0.y) - (c1.y - c0.y) * (seg.centre!.x - c0.x);
    return Math.sign(cross) * (e.from === "q0" ? 1 : -1);
  });
  assert.equal(sides[0], sides[1], "same handedness relative to travel, so opposite sides of the chord");
  const straight = marksOf(expand(load("dfa-partial-dead.json"))).find((m) => m.id === "edge-1")!;
  assert.ok("line" in straight.segments[0]!);
});

test("layout: a chain of up to four states is a line, anything else a circle, and 'layout' overrides", () => {
  const centresOf = (input: Record<string, unknown>): Point[] => [...circles(expand(input)).values()].map((x) => x.centre);
  const level = (ps: Point[]): boolean => ps.every((p) => Math.abs(p.y - ps[0]!.y) < 0.01);
  assert.ok(level(centresOf(load("dfa-partial-dead.json"))), "a chain is a line");
  assert.ok(!level(centresOf(load("dfa-ends-in-ab.json"))), "q2 → q0 skips q1: not a chain, so a circle");
  const five = centresOf(load("dfa-div-by-5.json"));
  const mid = { x: five.reduce((s, p) => s + p.x, 0) / 5, y: five.reduce((s, p) => s + p.y, 0) / 5 };
  const radii = five.map((p) => Math.hypot(p.x - mid.x, p.y - mid.y));
  assert.ok(Math.max(...radii) - Math.min(...radii) < 0.01, "five states sit on one circle");
  assert.ok(level(centresOf({ ...load("dfa-ends-in-ab.json"), layout: "line" })));
  const placed = centresOf({ ...load("dfa-ends-in-ab.json"), layout: { q0: [0, 0], q1: [1, 1], q2: [2, 0] } });
  assert.ok(placed[1]!.y < placed[0]!.y, "y is up: q1 (y = 1) is drawn above q0");
  assert.equal(placed[0]!.y, placed[2]!.y);
});

test("the start arrow comes from nowhere: its tail is clear of every circle", () => {
  const spec = expand(load("dfa-ends-in-ab.json"));
  const arrow = marksOf(spec).find((m) => m.id === "start-arrow")!;
  for (const circle of circles(spec).values()) {
    assert.ok(Math.hypot((arrow.from as Point).x - circle.centre.x, (arrow.from as Point).y - circle.centre.y) > circle.r + 20);
  }
});

// ---- rendered ---------------------------------------------------------------------------

fixtures.forEach((filename) => {
  test(`render fixture ${filename}: every check passes`, async () => {
    const raw = JSON.parse(readFileSync(join(dir, filename), "utf8")) as Record<string, unknown>;
    assert.equal(raw.preset, "automaton");
    const { preset: _preset, ...input } = raw;
    validateAutomatonInput(input);
    const result = await render(expand(input), { maxPasses: 3 });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${filename}: ${check.id} ${check.status}: ${check.detail}`);
    }
  });
});

test("render: a forced line with a skip edge, a placed layout and a determinised NFA all pass their checks", async () => {
  const base = load("dfa-ends-in-ab.json");
  const dfa = subsetConstruction(automatonOf("nfa-third-from-end.json"));
  const inputs: Record<string, unknown>[] = [
    { ...base, layout: "line" },
    { ...base, layout: { q0: [0, 0], q1: [1.2, 0.9], q2: [1.2, -0.9] } },
    { kind: "dfa", alphabet: dfa.alphabet, states: dfa.states, start: dfa.start, accept: dfa.accept, transitions: dfa.transitions, words: ["baab"] },
  ];
  for (const input of inputs) {
    const result = await render(expand(input), { maxPasses: 3, raster: false });
    for (const check of result.manifest.checks) {
      assert.ok(check.status === "pass" || check.status === "not-applicable", `${check.id} ${check.status}: ${check.detail}`);
    }
  }
});
