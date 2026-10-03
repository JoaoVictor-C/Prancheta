# Documentation map

Every document in the repository, what it is for, and how it is kept current. **Generated** documents are rebuilt by a script and a stale one fails `npm run check:docs`. **Hand-written** ones are kept current by the procedure in [CONTRIBUTING.md](../CONTRIBUTING.md#the-procedure-for-a-new-preset-or-feature): the step that changes the code also changes the document.

## Start here

| document | what it is | kept by |
| --- | --- | --- |
| [README.md](../README.md) | What Prancheta is, the repertoire, the checks, the commands. | hand-written prose; its tables are **generated** |
| [AGENTS.md](../AGENTS.md) | The working notes an agent reads before drawing: tests, commands, repertoire, sheets. | **generated** (`gen:views`) |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Setup, where code goes, and the procedure for adding a preset or a feature. | hand-written |
| [ROADMAP.md](../ROADMAP.md) | What was built, in order, with what each step found. | hand-written, one entry per merged body of work |
| [TODO.md](../TODO.md) | What is open, and what was deliberately refused. | hand-written, pruned when items land |

## Choosing and drawing

| document | what it is | kept by |
| --- | --- | --- |
| [selection/SELECTION.md](selection/SELECTION.md) | How to choose a figure kind: the reasoning. | hand-written |
| [selection/RULES.generated.md](selection/RULES.generated.md) | The selection rule table. | **generated** (`gen:rules`) |
| `src/presets/<id>/PRESET.md` | Each preset's input, what it computes, its refusals. | hand-written, beside the code |
| [../modules/README.md](../modules/README.md) | The figure modules and their protocol. | hand-written; `modules/<id>/MODULE.md` beside each |
| [CONSTRAINTS.md](CONSTRAINTS.md) | The three constraints a figure may stand down. | hand-written |
| [design/TYPOGRAPHY.md](design/TYPOGRAPHY.md) | Type: two axes, and what is bundled. | hand-written |
| [design/GEOMETRY.generated.md](design/GEOMETRY.generated.md) · [design/PALETTE.generated.md](design/PALETTE.generated.md) | Shapes and arrowheads · palettes and contrast. | **generated** (`gen:shapes`, `gen:palette`) |
| [effects/EFFECTS.md](effects/EFFECTS.md) · [effects/REFERENCE.generated.md](effects/REFERENCE.generated.md) | Effects: the reasoning · the parameter and bleed reference. | hand-written · **generated** (`gen:effects`) |

## Why things are the way they are

| folder | what is in it | kept by |
| --- | --- | --- |
| [decisions/](decisions/README.md) | Architecture decision records, with a generated index giving each one's status and the next free number. | one ADR per decision; the index is **generated** |
| [plans/](plans/README.md) | Plans written before a body of work, one in progress and the rest done. | hand-written; status line on each |
| [research/](research/) | The landscape survey, the language choice, the module survey, the ENEM coverage audit. | hand-written, dated; not updated after the fact |
| [gallery/](gallery/) | The README's plates. | regenerated from `experiments/generators` |

## Where the rest lives

- **Fixtures:** `fixtures/<preset>/`, one folder per preset. Raw IR specs are in `fixtures/ir/`, animation states in `fixtures/animate/`, and selection cases in `fixtures/selection/`.
- **Exercise lists:** `experiments/exercises/<list>/lista.json`, built by `sheet` into `ProjectHub/Listas/<list>/`.
- **Generators and probes:** `experiments/` — see [CONTRIBUTING.md](../CONTRIBUTING.md#where-to-put-your-code).
