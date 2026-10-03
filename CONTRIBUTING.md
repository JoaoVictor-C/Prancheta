# Contributing to Prancheta

Welcome! This document describes how to structure your contributions to keep Prancheta organized and maintainable.

By participating you agree to the [Code of Conduct](.github/CODE_OF_CONDUCT.md).
Security problems go through [the security policy](.github/SECURITY.md), not
the issue tracker.

## Getting Set Up

Node 22.18 or newer — the project runs TypeScript directly with no build step,
so it needs a runtime with native type stripping. Developed and tested on
Node 25.

```bash
git clone https://github.com/JoaoVictor-C/Prancheta.git
cd Prancheta
npm install
npx playwright install chromium
```

Chromium is not optional: the browser is the layout oracle, so nothing renders
without it.

**Python is only for the [figure modules](modules/README.md).** Skip it unless
you are touching `modules/`:

```bash
python -m pip install -r modules/requirements.txt
```

Verify the setup:

```bash
npm run typecheck    # Verify TypeScript compiles
npm test             # The core suite -- Node and Chromium only
npm run check:docs   # Verify generated views are up to date
npm run check:all    # All of the above, plus modules and the root-clean check
```

`npm test` should be green on a fresh clone with no Python installed. If it is
not, that is a bug worth an issue on its own.

## How to Contribute

1. **Open an issue first** for anything larger than a fix. A figure you cannot
   draw is the most useful kind of feature request — the concrete figure says
   whether the answer is a preset, a module, or a new primitive.
2. **Fork and branch** from `master`. One idea per branch.
3. **Work through the checklist** in the sections below — a new degree of
   freedom ships with the check that constrains it.
4. **Run `npm run check:all`** before you push.
5. **Open a pull request** and fill in the template. Say what you actually ran;
   an unticked box is fine, a wrongly ticked one is not.

Reviews look for the same things the project holds itself to: does the change
measure what it claims, is the failure mode loud, and does a passing suite
actually mean the figure is right.

### Licensing of contributions

Prancheta is [MIT licensed](LICENSE). By submitting a pull request you agree
that your contribution is licensed under the same terms, and that you have the
right to submit it. There is no CLA to sign.

## Running Tests While You Work

Every render drives a real headless browser, so the full suite costs about a
minute. Almost none of that minute concerns the file you just edited, so
**escalate rather than starting at the top**:

| command | when to use it | cost |
| --- | --- | --- |
| `npm run test:one <file>` | You changed one thing. Reach for this first. | ~2s |
| `npm run test:fast` | A broad sweep while iterating. | ~51s |
| `npm test` | Before committing. The core suite. | ~61s |
| `npm run test:modules` | You touched `modules/`. Needs Python. | slow |
| `npm run test:all` | Everything. What `check:all` runs, and CI. | slowest |
| `npm run test:watch` | Continuous re-run as you edit. | — |

**The split is by dependency, not by strictness.** The test files that spawn
`python` and fail loudly when the interpreter or a module import is missing,
rather than skipping — a probe that goes quietly green is indistinguishable
from one that never ran. That behaviour is unchanged; it simply lives behind
`test:modules` so a fresh clone without Python still gets a green `npm test`.
Which files belong to which suite is derived in `scripts/run-tests.ts` from
each test's own source, so adding a Python-spawning test needs no bookkeeping.

`test:one` forwards anything `node --test` accepts, so you can narrow to a
single test:

```bash
npm run test:one -- --test-name-pattern="sRGB" tests/colour.test.ts
```

**What `test:fast` gives up.** It sets `PRANCHETA_SKIP_RASTER=1`, turning off
PNG rasterisation — most of the cost of a render, and something only
`tests/render.test.ts` actually reads. That test asks for the pixels explicitly
(`render(spec, { raster: true })`), so the flag cannot hollow it out. But a fast
run does **not** prove the figure a reader receives can be produced. It is an
iteration tool; `npm test` is the gate.

**Never interrupt a test run.** `node --test` workers outlive their parent on
Windows, and each abandoned cohort quietly slows every run that follows — enough
to drag a 69s baseline past ten minutes and make later measurements meaningless.
If you do kill one, reap the orphans before trusting another timing:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'trace-event-file-pattern' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## Project Structure

| folder | what is in it |
| --- | --- |
| `src/` | The core: the IR (`ir/`), layout (`layout/`), `checks.ts` and `checks-catalogue.ts`, `repair.ts`, rendering and export (`render/`, `export/`), animation (`anim/`), the CLI and MCP bindings (`cli.ts`, `commands.ts`, `mcp/`), selection (`selection/`), sheets (`sheet/`), and shared maths, geometry, locale and colour. |
| `src/presets/<id>/` | One folder per preset: `preset.ts` (expand), its validator, its solvers, and `PRESET.md` beside the code. A preset that grows past one file splits by kind, as `mechanics/` does (`physics.ts`, `draw.ts`, `kind.ts`, `kinds/`). |
| `fixtures/<id>/` | One folder per preset, named after it. Raw IR specs go in `fixtures/ir/`, animation states in `fixtures/animate/`, selection cases in `fixtures/selection/`. Nothing sits loose in `fixtures/`; a test fails if it does. |
| `tests/` | One file per subject, kebab-case, `.test.ts`. Tests that spawn Python are routed to `test:modules` automatically by `scripts/run-tests.ts`. |
| `modules/<id>/` | Python figure modules, each with a `MODULE.md` ([modules/README.md](modules/README.md)). |
| `docs/` | Decisions, plans, research, design and selection docs. [docs/README.md](docs/README.md) is the map. |
| `experiments/exercises/<list>/` | Exercise lists (`lista.json`), built by `sheet` into `ProjectHub/Listas/<list>/`. |
| `experiments/generators/`, `probes/`, `sketches/` | Generators for the gallery, investigation scripts, sketches. Promote to `src/` or `modules/` when ready. |
| `scripts/` | Generators for docs (`gen-*.ts`), the test runner, and the standalone checks. |
| `temp/`, `out/` | Scratch and render output. Gitignored; never commit them. |

## Where to Put Your Code

- **A new kind of figure with something to compute** → a preset, following the procedure below.
- **A new kind of figure that needs a real Python library** → a module ([modules/README.md](modules/README.md) has the bar it must clear).
- **A new check** → `src/checks.ts`, plus its line in `src/checks-catalogue.ts`. The type system refuses the check without that line.
- **A new option on an existing preset** → its `preset.ts`, its validator, a fixture, a test, and the option documented in its `PRESET.md`.
- **A one-off illustration with nothing to compute** → raw IR; `fixtures/ir/raw-ir-fuel-cell.json` is the worked example.

**Never** put experiments or temporary files in the root directory (`npm run check:root-clean`).

**Code that nothing imports** is deleted in the change that notices it, or given an owner then. It is not left as a TODO (ADR 0076).

## The procedure for a new preset or feature

Presets and features land often. A document is kept current by the same change that changes the code, never by a later cleanup. Steps marked **(checked)** fail the build if skipped (`tests/preset-completeness.test.ts`, `npm run check:docs`). The others rely on you.

**Before**

1. **Plan, if it takes more than one sitting.** Add a `docs/plans/PLAN-<SUBJECT>.md` with a rules section and a status table, and add its row to [docs/plans/README.md](docs/plans/README.md).
2. **Decide, if it changes how something works.** Write an ADR with the next free number from [docs/decisions/README.md](docs/decisions/README.md) (see [Writing an ADR](#writing-an-adr)).

**While building a preset**

3. Create `src/presets/<id>/` with `preset.ts`, a validator ending in `v.probe(() => expandX(raw))` (so `validate` sees the expander's refusals while `render` still expands once, ADR 0076), and `PRESET.md`. The doc covers input, what is computed, refusals and `answers: false`, and cites its ADR. **(checked)**
4. Register it:
   - add it to `PresetId`, `PRESETS` and `PRESET_AREA` in `src/selection/vocabulary.ts` **(checked: type error)**;
   - add at least one selection rule in `src/selection/rules.ts` **(checked)**;
   - write the paragraph in `docs/selection/SELECTION.md` saying when to choose it and when not to.
5. Put fixtures in `fixtures/<id>/` **(checked)** and write a test that renders every fixture with every check passing, with answers on and off **(checked: a test names it)**.
6. **Look at the PNGs.** Green checks do not mean legible. Every new figure is opened and inspected before it is called done.

**Before the pull request**

7. Run `npm run gen:views` and `npm run gen:rules`. The README tables, AGENTS.md, the skill and the ADR index regenerate. **(checked: `check:docs`)**
8. Edit the hand-written prose the change made untrue: the README paragraphs, the preset's neighbours' `PRESET.md` ("not for … use `<id>`"), and AGENTS.md's hand-written sections in `scripts/gen-views.ts`.
9. Tick the plan's row. If it was the last row, add the **Status:** line and move the plan to *Done*.
10. Prune [TODO.md](TODO.md) of what this landed, and add what it found and left open.
11. Write the [ROADMAP.md](ROADMAP.md) entry: dated, what landed, and what building it found.
12. Run `npm run typecheck`, `npm test` and `npm run check:docs`, and say in the PR what you ran.

A feature that is not a preset (a check, a sheet option, a command) follows the same steps minus 3–5. A new check's line in `checks-catalogue.ts` is **(checked: type error)**.

## Writing an ADR

`docs/decisions/NNNN-short-name.md`, taking the next free number from the generated [index](docs/decisions/README.md). Never reuse a number. The shape:

```markdown
# NNNN — The decision, stated as a sentence

## Status

Accepted · YYYY-MM-DD

## The need

## Decision

## Consequences
```

The `# NNNN — ` heading and the `## Status` block are read by the index generator, and a test requires the status. When a later ADR changes an earlier one, edit the earlier one's status line to say so ("amended by 0075"); leave its text as it was.

## Documentation Standards

- **Generated files** are rebuilt by `scripts/gen-*.ts`; edit the generator, never the output. They are:
  - `AGENTS.md`, `.claude/skills/prancheta/SKILL.md` and `docs/decisions/README.md`;
  - the `<!-- generated:… -->` regions of `README.md`;
  - every `*.generated.md`.
- **Module docs:** every module has a `MODULE.md` covering its purpose, interface and the bugs its checks caught.
- **History is not rewritten.** ROADMAP entries, finished plans, research notes and old ADRs keep their text. When a file moves, its links are updated and nothing else.
## Key Principles

- **Every new degree of freedom ships with the check that constrains it**
  - If you add a new configuration option, add a check that validates it
  - If you add new IR structure, add checks that verify it's well-formed

- **ADRs guide implementation**
  - Check `docs/decisions/` before making architectural choices
  - If your change contradicts an existing ADR, update the ADR and discuss in your PR

- **Tests verify behavior; checks verify correctness**
  - Write tests for new features and bug fixes
  - Write checks for invariants and constraints
  - Checks catch problems early and at scale

- **Root directory stays clean**
  - Only essential project files in the root (package.json, tsconfig.json, etc.)
  - Organize everything else into appropriate subdirectories

## Workflow Tips

1. **Start with a test or check** - Define the behavior you want, then implement it
2. **Run checks locally** - Catch issues before pushing: `npm run check:all`
   (or `npm test` plus `npm run check:docs` if you have no Python installed)
3. **Keep commits focused** - One idea per commit makes reviews easier
4. **Document as you code** - Add ADRs and MODULE.md updates alongside your changes
5. **Clean up experiments** - Formalize or remove experimental code before it becomes permanent

## Questions?

If something isn't clear, check the existing code structure, ADRs in `docs/decisions/`, and MODULE.md files in `modules/`. They're the source of truth for how Prancheta is organized.
