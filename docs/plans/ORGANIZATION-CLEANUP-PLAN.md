# Organization Cleanup Plan

**Status:** done. Carried out 2026-08-23 as [ADR 0011](../decisions/0011-project-organization.md), CONTRIBUTING.md and `check:root-clean`; of the git follow-ups below, CI and the PR template exist; pre-commit hooks were not added. Document upkeep is now [ADR 0075](../decisions/0075-keeping-the-docs-true.md).

**Date:** 2026-08-23  
**Confidence:** 0.80 (from deep reasoning)

## Problem Statement

Reasoning analysis identified mixed discipline: strong technical foundations but weak process discipline. Specific issues:

1. **Root directory cluttered** - 11+ stray experiment files
2. **Security/hygiene issues** - `api.env`, `err.txt` in root
3. **No automation** - Check scripts exist but require manual invocation
4. **No organizational rules** - No documented standards for project structure
5. **Not a git repository** - Cannot use git-based automation (pre-commit hooks, CI/CD)

## Goals

1. Clean root directory to contain only essential project files
2. Establish clear directory structure for experiments and temporary files
3. Document organizational rules so they're enforced going forward
4. Create automation where possible (npm scripts, validation checks)
5. Add enforcement mechanisms for non-git context

## Implementation Plan

### Phase 1: Directory Structure (IMMEDIATE)

**Create proper locations for displaced files:**

```
/experiments/          # Research sketches and one-off explorations
  /generators/         # Pattern generator experiments (chladni, bifurcation, etc.)
  /probes/            # Investigation scripts (probe-scale.mjs, etc.)
  /sketches/          # Temporary TypeScript sketches
/temp/                # Explicitly temporary files (gitignored if git is added later)
```

**Root should contain ONLY:**
- Package files: `package.json`, `package-lock.json`, `tsconfig.json`, `.npmrc`, `.gitignore`
- Documentation: `README.md`, `ROADMAP.md`, `TODO.md`, `AGENTS.md`
- Directories: `src/`, `tests/`, `fixtures/`, `modules/`, `docs/`, `assets/`, `out/`, `node_modules/`
- Hidden config: `.claude/`

### Phase 2: File Migration (IMMEDIATE)

| Current Location | New Location | Reason |
|------------------|--------------|--------|
| `gen-bifurcation.mjs` | `experiments/generators/bifurcation.mjs` | Pattern generator experiment |
| `gen-chladni.mjs` | `experiments/generators/chladni.mjs` | Pattern generator experiment |
| `gen-delaunay.mjs` | `experiments/generators/delaunay.mjs` | Pattern generator experiment |
| `gen-harmonograph.mjs` | `experiments/generators/harmonograph.mjs` | Pattern generator experiment |
| `gen-lib.mjs` | `experiments/generators/lib.mjs` | Shared generator utilities |
| `gen-navguide.mjs` | `experiments/generators/navguide.mjs` | Navigation guide experiment |
| `gen-phyllotaxis.mjs` | `experiments/generators/phyllotaxis.mjs` | Pattern generator experiment |
| `gen-ulam.mjs` | `experiments/generators/ulam.mjs` | Pattern generator experiment |
| `probe-scale.mjs` | `experiments/probes/scale.mjs` | Scale investigation probe |
| `generate-navigation-spec.ts` | `experiments/sketches/navigation-spec.ts` | Temporary sketch |
| `render-missing-features.ts` | `experiments/sketches/missing-features.ts` | Temporary sketch |
| `render-navigation-diagram.ts` | `experiments/sketches/navigation-diagram.ts` | Temporary sketch |
| `api.env` | DELETE or move to `temp/` | Potential credentials, security issue |
| `err.txt` | DELETE | Abandoned debug output |

### Phase 3: Documentation (IMMEDIATE)

Create ADR 0011 documenting organizational rules:
- Root directory standards
- Where experiments go
- When to clean up temporary files
- Security hygiene (no credentials in root)

Create CONTRIBUTING.md with:
- Project structure overview
- Where to put new code
- How to run checks before committing
- Style guide references

### Phase 4: Automation (IMMEDIATE)

Add npm scripts for validation:
```json
{
  "check:root-clean": "Check root contains only approved files",
  "check:all": "Run all checks (views, refs, docs, tests, root-clean)",
  "validate": "Run typecheck and check:all"
}
```

Create `scripts/check-root-clean.ts`:
- Whitelist of approved root files/directories
- Fails if unexpected files found
- Integrated into `npm run check:all`

### Phase 5: .gitignore Update (IMMEDIATE)

Add to `.gitignore`:
```
temp/
*.env
*.log
err.txt
out.txt
debug*.txt
```

## Success Criteria

- [ ] Root directory contains ≤20 items (currently ~30)
- [ ] All experiment files in `/experiments`
- [ ] `api.env` and `err.txt` removed or secured
- [ ] ADR 0011 written and linked from README
- [ ] CONTRIBUTING.md created
- [ ] `npm run check:root-clean` script exists and passes
- [ ] `.gitignore` updated to prevent future clutter

## Risk Mitigation

**Risk:** Moving files breaks existing code that references them  
**Mitigation:** Search codebase for references before moving; update imports

**Risk:** Deleting `api.env` breaks something  
**Mitigation:** Check if referenced in code; if needed, move to `temp/` with warning

**Risk:** Experiment files contain valuable unreferenced code  
**Mitigation:** Move, don't delete; experiments/ directory preserves them

## Rollback

If any step breaks the build:
1. `npm run test` to verify
2. `npm run typecheck` to verify
3. If broken, reverse the specific file move
4. Document the dependency that prevented cleanup

## Future Work (When Git is Initialized)

- Add pre-commit hooks running `npm run validate`
- Add GitHub Actions CI running full test suite + all checks
- Add branch protection requiring checks to pass
- Add PR template reminding about `npm run validate`

## Estimated Effort

- Phase 1 (directories): 5 minutes
- Phase 2 (migration): 15 minutes
- Phase 3 (documentation): 30 minutes
- Phase 4 (automation): 20 minutes
- Phase 5 (gitignore): 5 minutes
- **Total: ~75 minutes**

Can be parallelized:
- Phases 1-2 together (directory creation + migration)
- Phases 3-5 together (all documentation and config)
- Phase 4 can be dispatched to a Haiku agent
