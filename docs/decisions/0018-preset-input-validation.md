# 0018 — The preset input is validated, and the line against the checks is drawn at repair

## Status

Accepted.

## The defect

Every input this project accepts was validated except the one it tells agents to write.

`parseSpec` is two hundred lines of hand-rolled refusals with exact field paths, because the IR is the contract and its error messages are part of the product. The preset input had none. `isPresetInput` checked that `preset` was one of five strings and handed everything else, unexamined, to an expander — and both the skill and the MCP instructions say *run `select`, then write a preset input as JSON and render it*. The one surface an agent authors was the one surface nothing read.

Three failures, measured against this repo before the change:

| input | what came back |
| --- | --- |
| `{"preset":"graph","edges":[{"from":"a","to":"zzz"}]}` | fifteen frames of minified ELK, `Referenced shape does not exist: zzz`, no mention of `edges[0].to` |
| `{"preset":"chart","categories":[{"label":"Q1","value":42}]}` | `TypeError: Cannot read properties of undefined (reading 'length')`, with a stack into `presets/chart/preset.ts:88` |
| `{"preset":"flowchart", …}` | `spec.version must be 1, got undefined` |

The third is the one that decided the priority. `isPresetInput` returns false for an unknown preset, so the document fell through to the raw-IR validator, which answered a question nobody asked it. The flowchart reflex is the failure this whole project exists to intercept, and the request that most needed intercepting was met with a complaint about a version field the author never wrote.

## The decision

**One dispatch.** `isPresetInput(parsed) ? expand(parsed) : parseSpec(parsed)` had been written independently four times — three in `commands.ts` (render, and both sides of `diff`) and once in `anim/sequence.ts`. Four copies is four places a new guard has to be remembered, and `animate` was the copy that got forgotten: an N-state sequence validated nothing and paid a browser launch per state before saying so. All four now call `parseFigureInput`. This removed a duplication rather than adding a layer beside one, and it covered `animate` at no extra cost.

**Refuse by name.** An unknown preset is now told its own name, given the repertoire, and pointed at `select` — and, when the name smells like a flowchart, told plainly that `graph` draws one but that availability is not a reason. A document with neither `preset` nor `version` is told it is neither, rather than being asked about one of them.

**Validate what the expander presupposes.** Not "is this well-formed" — that boundary lets a `stacked100` category summing to zero through, and well-formedness has no referent outside the validator itself. The remit is required fields and their types, collections the expander indexes or divides, finite numbers *including ones it derives*, unique ids, and referential completeness for every within-document id reference. "Is every division, index and non-empty assumption in `expandChart` guarded" is a question you answer by reading `expandChart`. The other formulation is not auditable at all.

**But stop at repair.** The full test is: *knowable from the document alone, AND outside anything the repair loop may legitimately change.* Repair's entire edit vocabulary is `width | height | wrap | canvasPadding` (`src/repair.ts`), so data, ids and references are ours and box geometry is not.

The line runs through `annotated-figure`, three keys apart, and that is the example to remember:

- `callouts[0].points` naming a part that was never declared — **ours**. A reference cannot be repaired into existence.
- a part declared taller than its canvas — **the checks'**. Repair grows boxes for a living, and refusing it here would turn a figure this project can fix into one it will not draw, pre-empting a better-informed stage (which sees measured geometry) with a worse-informed one (which sees declared numbers).

Statically knowable is not the test. There is a test for that in `tests/preset-validate.test.ts`, asserting the oversized part is *not* refused, so the rule cannot quietly drift into "refuse everything you can see".

**Name the near miss; never act on it.** `categories[0]` missing `values` while holding `value` is told exactly that, and told that nothing is renamed for it. Naming the near miss is what makes the refusal actionable; coercing it would change the author's document and hide the mistake that produced it. This is the discipline the repair loop already follows — it edits geometry and reports every edit, and it never edits intent.

**A malformed document produces nothing.** This is not in tension with *a figure that fails its checks is reported, never hidden*. A failed check leaves a figure to look at; a malformed document does not, and a half-expanded figure would be a lie.

## `validate`

A command that answers "can this be drawn at all" without launching Chromium, so `render` is paid for once instead of once per typo. It cost almost nothing: the `COMMANDS` table generates the CLI, the MCP tool and both doc surfaces from one declaration.

Its summary leads with its own limit rather than trailing it, because the generated tables in `AGENTS.md` and `SKILL.md` print only the first sentence — and an agent that reads "validate" and stops has learned exactly the wrong lesson. Overlap, contrast, text fit and every unrepaired defect are measured from a real render. The same discipline `modules/README.md` already states about itself: these verify malformation, never misrepresentation.

## Considered and rejected

**A schema library.** `parseSpec` is hand-rolled precisely so the prose is authored. `Expected array, received undefined at categories.0.values` is worse than the sentence this project would write, and it cannot name the near miss.

**Generating validators from the TypeScript types.** They are erased at runtime, and the generator would be a third artefact to keep honest.

**Accumulating every error instead of throwing on the first.** `parseSpec` throws on the first and every call site catches one; accumulating would mean every validator returns a list instead of throwing, changing the shape of the layer to save an agent one round trip. For machine-authored JSON the first error is nearly always the real one — an agent that got `values` wrong got it wrong in every category.

**An exit-code fix.** The reported "CLI exits 0 on a thrown error" was measured through a shell pipeline, which reports the last stage's status. Checked directly: `0` clean, `1` malformed, `2` failing checks. There was nothing to fix, and looking first is why nothing was broken looking for it.

## Limits, stated rather than closed

**The validators can drift from their expanders.** They are a second description of each preset's input, sitting beside its TypeScript type, and nothing *mechanically* forces a new optional field to gain a clause. Mitigated three ways — each validator lives in its preset's own directory, under the code-plus-prose discipline ADR 0002 already establishes and `preset-docs.test.ts` already enforces; a coverage test asserts every implemented preset has a clause that actually refuses; and every preset fixture this repo ships is run through the layer. That last one is regression cover and close to a tautology as evidence of anything else — the fixtures were the reference while the validators were written. The five adversarial inputs are the only evidence the layer is not decorative.

This is the same class of limit stated in `SELECTION.md`: CI checks self-consistency between two artefacts with a common author.

**This layer covers figure documents, not module invocations.** `module python --args "…"` reaches the same CLI and the same MCP tool table and never touches `parseFigureInput`. Its input is an argv string and its likeliest failure is a missing Python dependency. `MODULES` already declares each module's `needs`, so turning that into a named refusal is cheap and on-theme — and is deliberately not in this change.

**`parseSpec` still leaves `layoutConstraints` id references to a check, and that is not a contradiction.** A named check reports those, so the author hears about them in the manifest. Nothing reported a dangling graph edge; the first thing to notice was ELK, and it noticed by throwing.
