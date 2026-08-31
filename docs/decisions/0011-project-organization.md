# ADR 0011: Project Organization and Root Directory Discipline

**Status:** Accepted  
**Date:** 2026-08-23  
**Deciders:** Project maintainers

## Context

The root directory had grown cluttered with 11+ experiment files, temporary scripts, and debug artifacts without clear organizational boundaries or documented standards. This clutter created multiple problems:

1. **Discoverability** — no clear convention for where code should live, leading new contributors to guess
2. **Security hygiene** — credentials and sensitive files (api.env, etc.) accumulated in the root instead of proper ignore paths
3. **Process discipline** — lacking standards despite strong technical foundations in the codebase
4. **Professional appearance** — the root looked chaotic, making the project appear less mature than it is

The project had good technical patterns but needed structural organization to scale.

## Decision

**Establish strict conventions for what lives in the root, where experiments belong, and how temporary files are managed.**

### Root directory contents (only)

The root contains:

- **Package files:** `package.json`, `package-lock.json`, `tsconfig.json`, etc.
- **Top-level documentation:** `README.md`, `ROADMAP.md`, `TODO.md`, `AGENTS.md`, `CONTRIBUTING.md`
- **The licence:** `LICENSE`
- **Directories:** `src/`, `tests/`, `fixtures/`, `modules/`, `docs/`, `assets/`, `out/`, `node_modules/`, `scripts/`, `experiments/`, `temp/`
- **Hidden configuration:** `.claude/`, `.github/`, `.gitignore`, `.gitattributes`, `.git/`, `.npmrc`, etc.

Everything else must go elsewhere.

### Two amendments from opening the repository ([ADR 0021](0021-opening-the-repository.md))

`LICENSE` is in the root and not under `docs/`, breaking the pattern
deliberately: GitHub, npm and every licence scanner look in the root, and a
licence nobody finds is not a licence.

`.github/` holds the community health files — `SECURITY.md`,
`CODE_OF_CONDUCT.md`, the issue and PR templates — and the CI workflows.
GitHub finds them there, which is what lets this ADR's root discipline survive
contact with an open repository: the alternative was four more root files.

### Experiment locations

Experiments are organized by type:

- **Generator experiments** → `/experiments/generators/`
- **Probe experiments** → `/experiments/probes/`
- **Sketch experiments** → `/experiments/sketches/`

Each experiment lives in its own subdirectory with a README explaining its purpose.

### Temporary files and debug artifacts

- **Temporary files** go in `/temp/` (gitignored by default)
- **No abandoned debug files** in root (err.txt, out.txt, debug.log, etc.)
- All temp files must be cleaned up before committing or documented as persistent if needed

### Security boundaries

- No credentials in root (api.env, .env, tokens.json, etc.)
- Sensitive files must be in properly-gitignored locations or managed by the build system
- `.env.example` and `secrets.template.json` document required vars; actual secrets never committed
- **Ignore rules live in the repository, never in a developer's global config.** A
  global `~/.config/git/ignore` does not travel with a clone, so a secret it
  protects is protected on exactly one machine. `.claude/settings.local.json`
  and `.env` are ignored by the project `.gitignore` for this reason (ADR 0021)

## Rationale

### Why root cleanliness matters

A clean root serves as the project's "front door":
- First-time contributors see organized structure immediately
- Build scripts and config are easily discoverable
- Reduces cognitive load for team members
- Signals professional maintenance practices

### Why three experiment categories

Experiments fall into natural types:
- **Generators:** code that produces output (new features, test data)
- **Probes:** diagnostic or exploratory code (performance measurements, compatibility checks)
- **Sketches:** visual or conceptual experiments (mockups, prototypes)

One experiments/ directory would mix types; three subdirectories preserve clarity while keeping experiments together and separate from production src/.

### Why /temp/ for temporary files

Using `/temp/` instead of scattered .gitignore patterns:
- Signals intent clearly (this is transient)
- Single gitignore rule (`/temp/*`) is simpler than many scattered rules
- Developers know where to put throwaway work
- Easy to clean before releases

### Security through structure

Putting no credentials in root makes it impossible to accidentally commit them:
- Credentials belong in environment or secure vaults, not files
- `.env.example` documents what's needed without exposing secrets
- Root stays safe by convention and structure, not vigilance

## Consequences

### Positive

- Root is clean, professional, and immediately navigable
- New contributors have clear guidance on where code belongs
- Experimental work doesn't pollute src/ or the main branch
- Security risk from root-level credentials is eliminated
- Easier to maintain .gitignore and enforce discipline
- Automated checks can validate compliance

### Negative

- Requires discipline from all contributors
- Moving existing experiments takes initial effort
- New developers must learn the convention
- Automation is needed to prevent regressions

### Enforcement

Compliance is maintained through:

1. **`npm run check:root-clean`** — validates that root contains only allowed files/directories
2. **.gitignore patterns** — prevent common clutter (*.log, .DS_Store, node_modules/ outside src/, etc.)
3. **Code review** — human review catches new clutter before it merges
4. **Documentation** — this ADR and the root README explain the why

## Alternatives considered

### Single experiments/ directory

**Rejected:** Loses information about experiment type. Mixing generators, probes, and sketches in one folder makes it harder to scan and understand intent at a glance.

### No enforcement, just guidelines

**Rejected:** Discipline erodes without tooling. Contributing developers would eventually create root-level debug files, abandoned scripts, or credentials out of convenience. Active enforcement through `check:root-clean` is required.

### Stricter root (no top-level docs in root)

**Rejected:** README, ROADMAP, and TODO belong in root by convention across the software ecosystem. Hiding them in docs/ would surprise contributors and violate expectations.

### Credentials in a config/ directory

**Rejected:** Any committed credentials file (even as template) is a security anti-pattern. Credentials belong in environment variables or secure vaults, never in the repo structure.

## References

- Project `.gitignore` — defines ignored patterns for /temp/ and common artifacts
- `npm run check:root-clean` — implementation of root-directory validation
- [ADR 0009: Termination for translation repair](0009-termination-for-translation-repair.md) — related discipline in repair loop behavior
