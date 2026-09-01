import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { rank, replayMatches } from "../src/selection/rank.ts";
import type { Candidate, Selection } from "../src/selection/rank.ts";
import { DELEGATE_RULES, FLOOR, RULES } from "../src/selection/rules.ts";
import { DELEGATES, DOMAIN, IDIOM, STRUCTURE, partitionPredicates } from "../src/selection/vocabulary.ts";
import type { PresetId } from "../src/selection/vocabulary.ts";

const fixturePath = fileURLToPath(
  new URL("../fixtures/selection/phrasings.json", import.meta.url),
);
const docPath = fileURLToPath(new URL("../docs/selection/SELECTION.md", import.meta.url));

type FixtureCase = {
  phrasing: string;
  predicates: { structure: string[]; idiom: string[] };
  expect: { outcome: "single" | "compose" | "none"; chosen: PresetId[]; unknown?: string[] };
  why: string;
};

const fixtureRaw = JSON.parse(readFileSync(fixturePath, "utf8")) as { cases: FixtureCase[] };
const cases = fixtureRaw.cases;

function sorted(values: string[]): string[] {
  return [...values].sort();
}

// --- 1. FIXTURE RANKING ----------------------------------------------------

for (const c of cases) {
  test(`fixture ranking: ${c.phrasing}`, () => {
    const predicates = partitionPredicates(c.predicates);
    const selection = rank(predicates);
    assert.equal(selection.outcome, c.expect.outcome, `outcome for: ${c.phrasing}`);
    assert.deepEqual(
      sorted(selection.chosen),
      sorted(c.expect.chosen),
      `chosen for: ${c.phrasing}`,
    );
    assert.deepEqual(
      sorted(selection.unknown),
      sorted(c.expect.unknown ?? []),
      `unknown for: ${c.phrasing}`,
    );
  });
}

// --- 2. DISQUALIFICATION ORDERING (anti-default property) ------------------

for (const c of cases) {
  const hasGraphStructure = c.predicates.structure.includes("graph");
  const hasSubstrateIdiom = c.predicates.idiom.includes("substrate");

  // A hierarchy IS a graph, so drawing it as one is a defensible alternative
  // rather than the documented failure. The anti-default property is about
  // content a graph would MISREPRESENT — a scene, a series, a bare set — not
  // about content a graph merely serves less well. S-hierarchy-favours-graph-weakly
  // keeps graph viable at exactly FLOOR for these, on purpose.
  const hasHierarchyStructure = c.predicates.structure.includes("hierarchy");

  if (!hasGraphStructure && !hasHierarchyStructure) {
    test(`anti-default: graph is refused or sub-floor when not requested (${c.phrasing})`, () => {
      const predicates = partitionPredicates(c.predicates);
      const selection = rank(predicates);
      const graphCandidate = selection.candidates.find((candidate) => candidate.preset === "graph")!;
      const isOut = graphCandidate.disqualifiedBy !== undefined || graphCandidate.score < FLOOR;
      assert.ok(
        isOut,
        `graph candidate must be disqualified or sub-floor for: ${c.phrasing}, got score=${graphCandidate.score} disqualifiedBy=${graphCandidate.disqualifiedBy}`,
      );
    });
  }

  if (hasSubstrateIdiom) {
    test(`anti-default: labelled-blocks is never viable under substrate (${c.phrasing})`, () => {
      const predicates = partitionPredicates(c.predicates);
      const selection = rank(predicates);
      const blocksCandidate = selection.candidates.find(
        (candidate) => candidate.preset === "labelled-blocks",
      )!;
      const isOut = blocksCandidate.disqualifiedBy !== undefined || blocksCandidate.score < FLOOR;
      assert.ok(
        isOut,
        `labelled-blocks must be disqualified or sub-floor under substrate for: ${c.phrasing}`,
      );
    });
  }
}

// --- 3. TIE-FREEDOM ----------------------------------------------------------

function viableSorted(selection: Selection): Candidate[] {
  return selection.candidates.filter(
    (candidate) => candidate.disqualifiedBy === undefined && candidate.score >= FLOOR,
  );
}

for (const c of cases) {
  test(`tie-freedom: top two viable candidates are not tied (${c.phrasing})`, () => {
    const predicates = partitionPredicates(c.predicates);
    const selection = rank(predicates);
    const viable = viableSorted(selection);
    if (viable.length >= 2) {
      const [first, second] = viable;
      const tied = first!.score === second!.score && first!.priority === second!.priority;
      assert.ok(
        !tied,
        `top two viable candidates must not tie on (score, priority) for: ${c.phrasing}`,
      );
    }
  });

  test(`determinism: rank is stable across repeated calls (${c.phrasing})`, () => {
    const predicates = partitionPredicates(c.predicates);
    const first = rank(predicates);
    const second = rank(predicates);
    assert.deepEqual(first, second);
  });

  test(`determinism: rank is insensitive to predicate array order (${c.phrasing})`, () => {
    const predicates = partitionPredicates(c.predicates);
    const reordered = {
      structure: [...predicates.structure].reverse(),
      idiom: [...predicates.idiom].reverse(),
      domain: [...predicates.domain].reverse(),
      unknown: predicates.unknown ? [...predicates.unknown].reverse() : undefined,
    };
    const original = rank(predicates);
    const shuffled = rank(reordered);
    assert.equal(shuffled.outcome, original.outcome);
    assert.deepEqual(sorted(shuffled.chosen), sorted(original.chosen));
  });
}

// --- 4. COMPOSE and NONE are exercised --------------------------------------

test("fixture file exercises the compose outcome at least once", () => {
  assert.ok(
    cases.some((c) => c.expect.outcome === "compose"),
    "expected at least one fixture with expect.outcome === 'compose'",
  );
});

test("fixture file exercises the none outcome at least once", () => {
  assert.ok(
    cases.some((c) => c.expect.outcome === "none"),
    "expected at least one fixture with expect.outcome === 'none'",
  );
});

// --- 5. CITATION COVERAGE, both directions ----------------------------------

const docText = readFileSync(docPath, "utf8");

test("every rule id in RULES is cited somewhere in SELECTION.md", () => {
  const missing = RULES.filter((rule) => !docText.includes(rule.id)).map((rule) => rule.id);
  assert.deepEqual(missing, [], `rule ids missing from SELECTION.md: ${missing.join(", ")}`);
});

test("every rule-id-shaped token in SELECTION.md exists in RULES", () => {
  const ruleIdPattern = /\b[SI]-[a-z0-9]+(?:-[a-z0-9]+)*\b/g;
  const found = new Set(docText.match(ruleIdPattern) ?? []);
  const knownIds = new Set(RULES.map((rule) => rule.id));
  const unknownTokens = [...found].filter((token) => !knownIds.has(token));
  assert.deepEqual(
    unknownTokens,
    [],
    `tokens in SELECTION.md matching the rule-id shape but absent from RULES: ${unknownTokens.join(", ")}`,
  );
});

// --- 6. UNKNOWN PREDICATES ---------------------------------------------------

test("partitionPredicates preserves unknown structure and idiom values, drops none", () => {
  const predicates = partitionPredicates({
    structure: ["graph", "linear-extent"],
    idiom: ["chart", "made-up-idiom"],
  });
  assert.deepEqual(sorted(predicates.structure), ["graph"]);
  assert.deepEqual(sorted(predicates.idiom), ["chart"]);
  assert.deepEqual(
    sorted(predicates.unknown ?? []),
    sorted(["structure:linear-extent", "idiom:made-up-idiom"]),
  );
});

test("partitionPredicates omits the unknown key entirely when nothing is unknown", () => {
  const predicates = partitionPredicates({ structure: ["graph"], idiom: ["plain-flow"] });
  assert.equal(predicates.unknown, undefined);
});

test("rank never scores unknown predicates", () => {
  const withUnknown = rank(
    partitionPredicates({ structure: ["graph", "bogus-structure"], idiom: [] }),
  );
  const withoutUnknown = rank(partitionPredicates({ structure: ["graph"], idiom: [] }));
  // Same known predicates, differing only by an unknown extra: candidates identical
  // except we don't compare `unknown` itself.
  assert.deepEqual(
    withUnknown.candidates.map(({ preset, score, priority, disqualifiedBy }) => ({
      preset,
      score,
      priority,
      disqualifiedBy,
    })),
    withoutUnknown.candidates.map(({ preset, score, priority, disqualifiedBy }) => ({
      preset,
      score,
      priority,
      disqualifiedBy,
    })),
  );
});

test("fixtures carry unknown predicates only where expect.unknown is declared", () => {
  for (const c of cases) {
    const predicates = partitionPredicates(c.predicates);
    const declaresUnknown = (c.expect.unknown ?? []).length > 0;
    if (!declaresUnknown) {
      assert.deepEqual(
        predicates.unknown ?? [],
        [],
        `fixture "${c.phrasing}" has unknown predicates but declares none in expect.unknown`,
      );
    } else {
      assert.ok(
        (predicates.unknown ?? []).length > 0,
        `fixture "${c.phrasing}" declares expect.unknown but partitionPredicates found none`,
      );
    }
  }
});

test("every DOMAIN value reaches exactly one module, and every delegate rule names a real one", () => {
  const reached = new Map<string, string[]>();
  for (const rule of DELEGATE_RULES) {
    assert.ok(
      DOMAIN.includes(rule.when),
      `delegate rule ${rule.id} names domain "${rule.when}", which is not in the vocabulary`,
    );
    assert.ok(
      DELEGATES.some((entry) => entry.id === rule.module),
      `delegate rule ${rule.id} names module "${rule.module}", which is not delegable`,
    );
    reached.set(rule.when, [...(reached.get(rule.when) ?? []), rule.module]);
  }
  for (const domain of DOMAIN) {
    const modules = reached.get(domain) ?? [];
    assert.equal(
      modules.length,
      1,
      `domain "${domain}" should reach exactly one module, reaches ${modules.length}: ${modules.join(", ")}`,
    );
  }
});

test("a domain delegates, and refuses the preset that would misrepresent it", () => {
  // A molecule IS a graph. That is precisely why the graph preset has to be
  // refused rather than merely out-scored: it would render beautifully.
  const selection = rank(partitionPredicates({ structure: ["graph"], domain: ["molecular"] }));
  assert.equal(selection.outcome, "delegate");
  assert.equal(selection.delegateTo, "molecule");
  assert.deepEqual(selection.chosen, [], "a delegation chooses no preset");
  const graph = selection.candidates.find((candidate) => candidate.preset === "graph");
  assert.equal(graph?.disqualifiedBy, "D-molecular-disqualifies-graph");
});

test("no domain predicate leaves selection unchanged", () => {
  // The axis has to be inert when empty, or every existing figure's recorded
  // reasoning would start replaying differently.
  const withoutDomain = rank(partitionPredicates({ structure: ["graph"], idiom: ["plain-flow"] }));
  assert.equal(withoutDomain.outcome, "single");
  assert.deepEqual(withoutDomain.chosen, ["graph"]);
  assert.deepEqual(withoutDomain.delegates, []);
  assert.equal(withoutDomain.delegateTo, undefined);
});

// --- 7. REPLAY ----------------------------------------------------------------

for (const c of cases) {
  if (c.expect.chosen.length === 0) continue;

  test(`replayMatches is true for the chosen preset (${c.phrasing})`, () => {
    const predicates = partitionPredicates(c.predicates);
    assert.equal(replayMatches(predicates, c.expect.chosen[0]!), true);
  });
}

test("replayMatches is false for a preset that was not chosen", () => {
  // "draw our microservice call graph as a subway map" chooses only "graph";
  // "labelled-blocks" is not among the presets ever chosen for it.
  const c = cases.find((entry) => entry.phrasing === "draw our microservice call graph as a subway map")!;
  assert.ok(c, "expected the subway-map fixture to exist");
  const predicates = partitionPredicates(c.predicates);
  assert.equal(replayMatches(predicates, "labelled-blocks"), false);
});

// --- 8. VOCABULARY HYGIENE ----------------------------------------------------

test("every STRUCTURE value is referenced by at least one rule", () => {
  const referenced = new Set(RULES.filter((rule) => rule.axis === "structure").map((rule) => rule.when));
  const dead = STRUCTURE.filter((value) => !referenced.has(value));
  assert.deepEqual(dead, [], `unreferenced STRUCTURE values: ${dead.join(", ")}`);
});

test("every IDIOM value is referenced by at least one rule", () => {
  const referenced = new Set(RULES.filter((rule) => rule.axis === "idiom").map((rule) => rule.when));
  const dead = IDIOM.filter((value) => !referenced.has(value));
  assert.deepEqual(dead, [], `unreferenced IDIOM values: ${dead.join(", ")}`);
});

test("every rule's `when` belongs to its axis's vocabulary", () => {
  const structureSet = new Set<string>(STRUCTURE);
  const idiomSet = new Set<string>(IDIOM);
  const domainSet = new Set<string>(DOMAIN);
  for (const rule of RULES) {
    const vocabulary =
      rule.axis === "structure" ? structureSet : rule.axis === "idiom" ? idiomSet : domainSet;
    assert.ok(
      vocabulary.has(rule.when),
      `rule ${rule.id} has axis ${rule.axis} but when="${rule.when}" is not in that axis's vocabulary`,
    );
  }
});
