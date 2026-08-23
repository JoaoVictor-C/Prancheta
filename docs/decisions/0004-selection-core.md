# Decision 0004 — The selection core is a rule table with a hand-written narrative

**Status:** committed · 2026-08-19 (during M2)
**Decision:** Selection is a two-axis predicate vocabulary, a flat rule table evaluated as a deterministic ranking, and a hand-written narrative that cites rule ids. CI verifies the decision procedure — never a proxy for the model.
**Method:** Terza session `ff301563` — 3 iterations, 2 passes, halt on signal, final confidence 0.88.

---

## The problem with the plan as written

[The build plan](../PLAN.md) promised the selection core would ship with "~20 real request phrasings → expected preset, judged against expectation". That suite is not constructible as stated: the thing being tested is a judgement made by a model reading prose, and CI has no model, no API key, and must be deterministic and offline.

Three candidates, and the two obvious ones both fail:

- **Pure prose with a manual rubric** leaves the project's differentiator as the one part with no automated verification — in a project whose entire thesis is that verification is what the competition lacks. A solo maintainer with five other projects drops the rubric first, and this one has already watched prose-only rules fail to reach the packaged artefact once, in `teaching-checker`.
- **A keyword classifier** is worse, and not because it is imperfect. It would be the only component whose green tests certify an artefact that never runs in production. That manufactures false confidence exactly where the project stakes its claim.

## What was adopted

**Two axes.** Content **structure** (graph, hierarchy, series, scene, set) and presentation **idiom** (plain-flow, annotated, cross-section, substrate, chart). An idiom constrains how a figure is drawn; it never changes what the content is.

**Closed at scoring, open at recording.** Only known predicates carry weight, so no caller can silently reshape the decision. An unrecognised predicate is preserved verbatim and reported — which is the only mechanical signal available that the vocabulary is missing something.

**A flat rule table**, each rule carrying an id, an axis, the value it reacts to, a preset, favour-with-weight or disqualify, an explicit priority, and a one-line statement. Rules never reference other rules.

**Deterministic ranking** against one global floor. Output is ordered candidates with cited reasons. Ties break by score, then priority, then id — total and stable, never engine key order.

**Three outcomes, all first-class:** `single`, `compose` (two candidates clear the floor on *disjoint* evidence), and `none` (author raw IR rather than forcing the request into the nearest genre).

**A hand-written narrative** ([SELECTION.md](../selection/SELECTION.md)) citing rule ids, with a generated rule reference beneath it. This preserves [decision 0002](0002-deliverable-shape.md), which established that comparative selection knowledge cannot be generated — only the reference is machine-written.

## Three corrections that came from the attacks, not the proposal

The first design was wrong three times, and each fix came out of a critical pass:

1. **The structure/idiom split.** The original single-axis vocabulary made "spatial substrate" *disqualify* a graph. Counter-example: *"draw our microservice call graph as a subway map"* is unambiguously a graph and unambiguously demands a substrate — the rule meant to prevent one mistake rejected the only correct answer.
2. **Explicit priorities.** "Deterministic ranking" was an overstatement while ties were unspecified. An org chart fires both the hierarchy and graph rules, because a tree *is* a graph, and the winner fell out of array order.
3. **Closed-at-scoring / open-at-recording.** Nothing could detect a *missing* predicate — the tests caught dead vocabulary but not absent vocabulary. Unknown predicates surfacing in a manifest turn that blind spot into an instrument.

## What CI verifies, exactly

Ranking correctness for every fixture · disqualification **ordering** (the anti-default property: for non-graph content the graph preset must rank *below the floor*, not merely lose) · tie-freedom · bidirectional citation between narrative and table · no unknown predicates in fixtures except where declared · vocabulary hygiene · and a **replay check** — take the predicate vector recorded in a figure's manifest, run it back through the table, assert the winner is the preset actually used.

That last one is the closest thing to verifying model behaviour available offline. It cannot catch a model that misreads a request. It does catch one that recorded "this is a spatial scene" and then rendered a flowchart anyway. The reading stays unverified; the **follow-through** becomes verified.

## Stated limits, not to be softened

- **CI does not verify that a model reads a request correctly.** That needs a model in the loop and ships as a script, not a test. The twenty phrasings are tested only from the annotated vector onward.
- **The fixtures and the rule table share an author.** CI checks self-consistency between two artefacts from one hand, not correctness against an external standard. The phrase "judged against expectation" must never appear without naming whose expectation it is.
- **At four presets the ranking's advantages are largely latent.** `compose` and `none` are reachable but thinly exercised; the benefit is collected later, when the repertoire is big enough for candidates to genuinely compete. Paid for now, collected later — recorded as a trade rather than presented as immediate value.

## What building it immediately caught

Running the twenty fixtures against the table failed four of them on the first attempt — the suite earned its place before it was even wired into CI:

- **A rule-table defect (3 cases).** `plain-flow` was weighted as real evidence, so every ordinary flowchart came out as `compose: graph + labelled-blocks`. Plain flow is the *absence* of an idiom; its weight now sits below the floor deliberately.
- **A fixture defect (1 case).** A "dependency tree" annotated as *both* hierarchy and graph was expected to yield `mindmap`; the table said `graph`. The table was right — asserting both means it is not a strict tree, and dependency graphs have diamonds. The fixture was corrected, and the correction is recorded in its `why`.
