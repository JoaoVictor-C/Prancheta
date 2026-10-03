# 0075 — Keeping the docs true: generated tables, a plans folder, and a preset that ships complete

## Status

Accepted · 2026-10-03

## The need

New presets and features were landing daily, and the documents that describe them fell behind. When this decision was made:

- **The README.** It said "seven presets" when thirty-three shipped, and listed nineteen checks when thirty-five existed. Its decision list stopped at 0027 of 74.
- **ROADMAP.md** stopped on 2026-08-30, before every phase of the coverage plan.
- **The plans.** Eight plans sat loose in `docs/` with no sign of which were finished. Two still said "Ready to implement" and "In Progress" months after shipping.
- **TODO.md** still described modules that had been removed.
- **The fixtures.** Thirty-nine were loose in `fixtures/` while every newer preset had its own folder.
- **ADR numbers.** Two ADRs share the number 0003, and nothing said which number came next.

Nothing was wrong with the code, and every check passed. The failure was the one TODO.md had already named: "the parts of the docs that go stale fastest are exactly the parts no check reads." The views that *were* generated (AGENTS.md, the skill, four references) had stayed correct the whole time.

## Decision

**1. Tables that restate the code are generated; prose stays hand-written.** The README keeps its prose. Its repertoire, check, command and module tables, and a line of counts, sit between `<!-- generated:name -->` markers that `scripts/gen-views.ts` fills. A missing marker is an error, not a skip. `check:views` fails on a stale README exactly as it does on a stale AGENTS.md.

The sources are typed so that an omission is a type error:

- `CHECK_CATALOGUE` in `src/checks-catalogue.ts` is a `Record<CheckId, …>`, so a check cannot be added without saying what it asks.
- `PRESET_AREA` in `src/selection/vocabulary.ts` is a `Record<PresetId, …>`, so a preset cannot be added without a shelf in the README.

**2. The decision index is generated.** `docs/decisions/README.md` is read from each ADR's own heading and status line, and states the next free number.

**3. Plans live in `docs/plans/`, each with a status.** Each plan carries a **Status:** line at its head. An index lists the one in progress and the ones done. A finished plan is kept, not deleted, because it records why things were built in the order they were.

**4. A preset ships complete, and a test says so.** `tests/preset-completeness.test.ts` holds every implemented preset to six things:

- a `src/presets/<id>/` folder with its `PRESET.md`;
- at least one fixture in `fixtures/<id>/`;
- a test that names it;
- an ADR cited from its `PRESET.md` (the four pre-ADR presets are listed by name);
- a place in `PRESET_AREA`;
- a selection rule that mentions it.

The same test holds the ADRs to unique numbers (with the historical 0003 pair named as the one exception) and to a status line each.

**5. One procedure, written down.** CONTRIBUTING.md now has the steps for a new preset or feature. Each step names the document it touches, and the steps the machine checks are marked as such. The remaining steps are the ones a generator cannot do: the ROADMAP entry, the plan row, the TODO pruning, and the prose in the README.

## Consequences

- Stale counts and tables become red builds instead of something a reader notices months later.
- The historical documents (ROADMAP entries, finished plans, research, old ADRs) are not rewritten. Their links were updated where files moved, and their content stays as it was written.
- **The fixtures moved.** The 39 loose fixtures moved to `fixtures/<preset>/`, and raw IR specs went to `fixtures/ir/`. Every reference in tests, docs and scripts was updated in the same change.
- **What is still hand-written can still go stale.** That covers the ROADMAP, TODO and the README's prose. The procedure is the only guard there. This is the limit [ROADMAP.md](../../ROADMAP.md) already accepts ("Generated host views guarantee freshness, not usefulness"), restated here rather than solved.
