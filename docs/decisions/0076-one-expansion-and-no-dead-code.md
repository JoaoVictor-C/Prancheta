# 0076 — One expansion per figure, no dead code, and an audit of every test and ADR

## Status

Accepted · 2026-10-03. Amends [0018](0018-preset-input-validation.md) (the validator's probe no longer runs inside `parseFigureInput`) and [0009](0009-termination-for-translation-repair.md) (its implementation is removed).

## The need

The question was whether the 75 ADRs and 154 test files were all necessary, or whether some were redundant complexity. It was answered by measuring, not by reading titles. Every test was timed (JUnit report), every test file's imports and fixture use were listed, every ADR's text was compared with its preset's `PRESET.md`, and the slow paths were profiled.

## What was found

**Every figure was built twice.**
- Thirty preset validators end by running their own expander as a probe, so a precondition only the expander can see is refused by `validate` without a browser (ADR 0018).
- `parseFigureInput` validated and then expanded, so every render, every sheet and every test built each figure twice.
- Expanding the 336 preset fixtures took 29.7 s, about half of it for nothing.

**Label placement measured every candidate against every segment.**
- `rectToPolyline` ran a full distance computation against each segment of curves with thousands of points, and allocated five objects per segment.
- That was most of a distribution's or a revolution's expansion time.

**Two tests paid for expansions they did not need.**
- *The fixture-validation walk (59 s).* It only needed to check documents, yet it expanded all 336 fixtures.
- *`panel.test.ts` (81 s).* It tests one shared panel builder, yet it expanded every fixture of eighteen presets, twice. Each preset's own render test already pays for that.

**Five modules were dead, with tests that kept them looking alive.**
- `src/scales.ts` and `src/presets/chart/data-binding.ts` (M8);
- `src/layout/grouping.ts`, `src/layout/solver.ts` and `src/layout/repair.ts` (M10, the translation repair of ADR 0009).

Nothing in the product imported them; TODO.md had said so since 2026-08-24 and left it open. That came to 872 lines of code and 781 lines of tests.

**One ADR was not a decision.** `0003-effects-extension` was a five-phase plan that was never carried out, and it shared the number 0003 with "repairs are edits".

## Decision

1. **Validate, then expand once.**
   - `parseFigureInput` runs validation with the probe off (`withoutProbe`) and expands once. The expansion raises the same errors the probe would have.
   - The `validate` command and `validatePresetInput` keep the probe, so they still refuse everything without a browser.
   - A validator ends with `v.probe(() => expandX(raw))`.
2. **Prune exactly.** `rectToPolyline` skips a segment whose bounding box is already farther than the best distance found so far, and the space placer skips ink whose box cannot meet the label. Both give the same answers with less arithmetic; the full suite is the proof.
3. **Tests pay only for what they test.**
   - The fixture walk checks documents only: the common options and each preset's own rules. That is what caught `collision.type` clashing with the type pack, and it still runs on every fixture.
   - `panel.test.ts` checks one panel-drawing fixture per preset.
4. **Dead code is deleted, not kept as a backlog.** The five modules and their tests are removed; git keeps them. ADR 0009's argument stands as the design if translation repair is ever wanted, and its status says so. `constraints-satisfied` still verifies constraints; it was never repaired by them.
5. **A plan lives with the plans.** The effects-extension document moved to `docs/plans/EFFECTS-EXTENSION-PLAN.md` as *not pursued*, which frees 0003. ADR numbers are now unique, and the test that holds them to it has no exception left.

## What was kept, and why

**The ADRs.**
- *Not duplicates of the docs.* Each preset ADR shares 0–5 % of its text with its `PRESET.md` (15 % for 0073, the smallest). The ADRs record what was refused and what it cost, which the docs do not. An ADR is a record, and none was deleted.
- *Easier to follow.* The generated index now shows each record's amendments and corrections ("see 0063"), so a chain like 0012 → 0013 or 0062 → 0063 is visible without opening each file.

**The per-preset "render every fixture, answers on and off" loops.**
- The two answer states are different figures with different labels, and both are checked.
- Folding the thirty loops into one generic file would save boilerplate and nothing else. Each file stays readable on its own, so they stay.

**The small render tests** (`render`, `raw-ir-example`, `chart-ruled-render`, `presets-render`). Each asserts something the others do not: the PNG bytes, the worked example, the axis declaration, the connector joins. Merging them would only reduce the file count.

## Consequences

**Speed.**

| what | before | after |
| --- | --- | --- |
| core suite, wall clock | 127 s | 89 s |
| core suite, per-test durations summed | 828 s | 638 s |
| expanding every preset fixture once | 29.7 s | 10.3 s |
| `distribution.test.ts` | 74 s | 36 s |
| `panel.test.ts` | 81 s | 5 s |
| the fixture walk | 59 s | under 1 s |

Every CLI render and sheet build also expands once instead of twice.

**What remains.** Revolution and surface expansion is now dominated by hidden-line visibility, which is real work. The slowest files are the ones that render many figures (mechanics, optics, distribution, sheets), and their time is the browser's.

**A new rule.** Code that nothing imports is removed in the change that notices it, or given an owner. It is never left as a TODO.
