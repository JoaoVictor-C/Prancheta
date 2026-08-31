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

**The split is by dependency, not by strictness.** Fifteen test files spawn
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

Knowing where code belongs keeps the project coherent:

- **src/** - Core TypeScript implementation
  - IR, checks, repair, rendering, CLI, and MCP server code
  - Main entry point for features and logic

- **tests/** - Test files
  - Follow kebab-case naming with `.test.ts` suffix
  - Structure mirrors what you're testing

- **fixtures/** - JSON test fixtures
  - Descriptive kebab-case names
  - Organized by what they test

- **modules/** - Python modules for specialized work
  - Each module (map, molecule, etc.) is a self-contained directory
  - Every module includes a `MODULE.md` describing its purpose and interface
  - See `modules/map/MODULE.md` or `modules/molecule/MODULE.md` for the template

- **docs/** - Documentation
  - Architectural decisions in `docs/decisions/` (ADRs)
  - Follows established ADR template (check existing examples)

- **experiments/** - Research and prototyping
  - **generators/** - Code generation and synthesis research
  - **probes/** - Observability and analysis tools
  - **sketches/** - Exploratory implementations
  - Clean up or formalize to src/ or modules/ when ready

- **temp/** - Temporary files (gitignored)
  - For scratch work, logs, and temporary outputs
  - Never commit these

## Where to Put Your Code

**New core features** → `src/`
- Updates to IR, checks, rendering, CLI, or MCP
- When in doubt, start here

**New tests** → `tests/`
- Name the test file after what you're testing
- E.g., testing `src/render.ts` → `tests/render.test.ts`

**Test fixtures** → `fixtures/`
- Use descriptive kebab-case names
- E.g., `fixtures/complex-ir-with-cycles.json`

**New Python modules** → `modules/`
- Create a directory with your module name
- Include `MODULE.md` describing purpose and interface (use existing MODULE.md files as templates)
- Keep modules self-contained and independently testable

**Experimental work** → `experiments/`
- Categorize under `generators/`, `probes/`, or `sketches/`
- Move to src/ or modules/ when it's ready
- Avoid committing incomplete experiments; clean up or formalize first

**Never** put experiments or temporary files in the root directory.

## Documentation Standards

**Architectural Decision Records (ADRs)**
- Store in `docs/decisions/` with a descriptive filename
- Follow the ADR template used in existing decision records
- Document the decision, context, alternatives considered, and consequences
- ADRs guide implementation; keep them and code in sync

**Module Documentation (MODULE.md)**
- Every Python module must have a `MODULE.md` at its root
- Document the module's purpose, interface, and key design decisions
- See `modules/map/MODULE.md` or `modules/molecule/MODULE.md` for the structure to follow

**Generated Files**
- `AGENTS.md`, `.claude/skills/prancheta/SKILL.md` are auto-generated
- Their prose lives in `scripts/gen-views.ts`; edit it there
- Update them by running `npm run gen:views`
- Never edit these files manually; changes will be overwritten

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
