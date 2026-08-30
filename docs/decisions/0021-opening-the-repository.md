# 0021 — Opening the repository

## Status

Accepted.

## The defect

The project was built as a private working repository and was about to be made
public with the habits of a private one still in it. An audit found four
problems, only one of which is about code.

**A live API key sat in `.claude/settings.local.json`.** It was never committed
and never in history — but the only thing keeping it out was a rule in *one
developer's global gitignore*, at `~/.config/git/ignore`. A global ignore does
not travel with a clone. The repository was one `git add -f`, one fresh
machine, or one contributor away from publishing a credential, and nothing in
the repository itself would have objected.

**The licence was declared but not granted.** `package.json` said
`"license": "MIT"` and no `LICENSE` file existed. A declared licence with no
text grants nothing; the default is exclusive copyright, so the repository
would have been public and legally unusable.

**`npm test` was red on every fresh clone.** Fifteen test files spawn `python`
and — correctly, per their own headers — *fail* rather than skip when the
interpreter or a module's third-party imports are missing. There was no
`requirements.txt` anywhere, and the README called Python "optional". So the
first command a new contributor runs would fail, for reasons unrelated to
anything they were about to change, in a way the documentation said should not
happen.

**Nothing ran on anyone else's machine.** No CI. The `.gitattributes`
`eol=lf` fix exists because a Windows checkout once broke the byte-for-byte
doc checks — a class of bug that is invisible without a second platform.

## The decision

**Ignore secrets in the repository, not in the developer.**
`.claude/settings.local.json` and `.env` are now in the project `.gitignore`.
The protection has to be a property of the clone, because that is what a
contributor gets.

**Ship the licence text.** `LICENSE` (MIT) is in the root, where GitHub, npm
and every scanner look for it. Bundled third-party assets keep their own terms,
recorded in `assets/README.md` — Inter under the SIL OFL, the Michelangelo
plate as an expired-copyright reproduction, Natural Earth as public domain. Two
of those require no attribution at all; recording them anyway is the point,
because "no attribution required" and "no provenance recorded" are different
claims.

**Split the suite by dependency, not by strictness.** `npm test` is the core
suite: Node and Chromium, nothing else, green on a clean clone.
`npm run test:modules` is the Python set, `npm run test:all` is both, and
`check:all` and CI run `test:all`. The fifteen files still fail loudly — that
behaviour is untouched. They are simply asked for by name.

Membership is **derived, not listed**: `scripts/run-tests.ts` reads each test's
own source and assigns it by whether it spawns the interpreter. A hand-kept
list would drift the first time someone added a module test, and the drift
would be silent in the worst direction — the new file would land in the core
suite and break the clean-clone promise the split exists to make. The script
also fails outright if it detects *zero* Python tests, because that would mean
the marker had stopped matching and both CI jobs were running the same thing.

**Two CI jobs, matching the split.** `core` on Linux runs typecheck, the core
suite, both staleness checks and the root-clean check; `modules` installs
Python and runs the module suite. The core job is also what proves the CRLF
fix holds, since it is a Linux checkout of a repository developed on Windows.

**Community files live in `.github/`.** `SECURITY.md`, `CODE_OF_CONDUCT.md`,
and the issue and PR templates are all found by GitHub there. This keeps ADR
0011's root discipline intact while still putting them where they are looked
for. `LICENSE` is the exception and goes in the root, because a licence nobody
finds is not a licence.

## What was refused

**Publishing to npm.** `"private": true` stays. The package metadata is now
complete — `repository`, `homepage`, `bugs`, `keywords`, `engines` — so
removing that one line is all a publish would need. But `bin` points at raw
`.ts` files that only run on a type-stripping runtime, and whether this ships
as a package or as a repository you clone is a product decision, not a
tidying-up decision. It is left to be made deliberately rather than made by
accident.

**Making the Python tests skip.** The obvious fix for a red clean clone is
`test.skip()` when the import is missing. Refused: ADR 0005 rests on modules
being verified for real, and a suite that goes green by declining to run is
exactly the failure those headers were written against. Moving them behind a
named script keeps the loud failure and removes the ambush.

**Deleting the Michelangelo plate.** 2.1 MB of a 8 MB asset budget, used by one
experiment. Recording its provenance costs a paragraph; removing it would cost
a working experiment. Provenance was the cheaper correct answer.

**A CLA.** Contributions are MIT under the same terms as the project, stated in
`CONTRIBUTING.md`. A CLA is overhead that buys a single-maintainer project
nothing it needs.

## The cost, stated

**`npm test` now proves less than it did.** It was the whole suite; it is now
the part of the suite that needs no Python. A maintainer who runs only
`npm test` before committing can break a module and not find out. That is why
`check:all` — the documented pre-commit gate — runs `test:all`, and why CI runs
both jobs regardless of what was run locally.

**The derived membership is a regex over test sources.** It is guarded against
matching nothing, but not against a test that shells out to Python by some
route the marker does not recognise. Such a test would join the core suite and
fail there. The guard catches the systemic failure; this one would be caught by
the first CI run.

**The CI timings are unmeasured.** The workflow is written from the local
numbers in ADR 0020; a GitHub runner is a different machine, and neither job's
duration has been observed. Nothing depends on those numbers being right.

**The security policy promises a response within a week.** That is one person's
realistic estimate, stated as such in the document, and it is a promise the
project now carries.

## References

- [ADR 0011](0011-project-organization.md) — root directory discipline, amended
  here to admit `LICENSE` and `.github/`.
- [ADR 0020](0020-the-test-loop.md) — the test ladder this splits.
- [ADR 0005](0005-module-protocol.md) — why module verification is for real,
  and so why the Python tests may not be made to skip.
