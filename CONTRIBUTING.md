# Contributing to Prancheta

Welcome! This document describes how to structure your contributions to keep Prancheta organized and maintainable.

## Quick Checks Before Contributing

Before you start work, run these to ensure your environment is set up:

```bash
npm run typecheck    # Verify TypeScript compiles
npm run test         # Run the test suite
npm run check:docs   # Verify generated views are up to date
npm run check:all    # All of the above, plus the root-clean check
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
3. **Keep commits focused** - One idea per commit makes reviews easier
4. **Document as you code** - Add ADRs and MODULE.md updates alongside your changes
5. **Clean up experiments** - Formalize or remove experimental code before it becomes permanent

## Questions?

If something isn't clear, check the existing code structure, ADRs in `docs/decisions/`, and MODULE.md files in `modules/`. They're the source of truth for how Prancheta is organized.
