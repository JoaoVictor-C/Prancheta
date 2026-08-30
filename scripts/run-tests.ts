/**
 * The suite splitter.
 *
 * Fifteen test files spawn `python` and fail loudly when the interpreter or a
 * module's third-party imports are missing -- deliberately, because a probe
 * that goes quietly green looks identical to one that never ran. That is the
 * right behaviour for a maintainer and the wrong first impression for someone
 * who has just cloned the repository: `npm test` would go red for a reason
 * that has nothing to do with the code they are about to touch.
 *
 * So the split is by *dependency*, not by strictness. The core suite needs
 * Node and Chromium and nothing else. The module suite needs Python and the
 * packages in modules/requirements.txt, and it still fails loudly -- it is
 * simply asked for by name, and CI runs it in its own job.
 *
 * Membership is DERIVED, not listed: a file belongs to the module suite when
 * its own source spawns python. A hand-maintained list would drift the first
 * time a test was added, and drift here is silent -- the file would land in
 * the core suite and break the clean-clone promise this script exists to keep.
 *
 * Usage:
 *   node scripts/run-tests.ts              # core suite (no Python needed)
 *   node scripts/run-tests.ts --modules    # only the Python module suite
 *   node scripts/run-tests.ts --all        # both
 *   node scripts/run-tests.ts --fast       # core, PNG rasterisation off
 *   node scripts/run-tests.ts --watch      # core, re-run on change
 *
 * Anything else on the command line is forwarded to `node --test` verbatim.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(root, "tests");

/** A test file needs Python when it spawns the interpreter itself. */
function spawnsPython(file: string): boolean {
  return /command:\s*"python"/.test(readFileSync(join(testsDir, file), "utf8"));
}

function testFiles(): { core: string[]; modules: string[] } {
  const core: string[] = [];
  const modules: string[] = [];
  for (const entry of readdirSync(testsDir).sort()) {
    if (!entry.endsWith(".test.ts")) continue;
    (spawnsPython(entry) ? modules : core).push(join("tests", entry));
  }
  return { core, modules };
}

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);

const wantModules = flag("--modules") || flag("--all");
const wantCore = flag("--all") || !flag("--modules");
const loader = flag("--fast") ? "./scripts/test-fast.ts" : "./scripts/test-browser.ts";

const forwarded = argv.filter((arg) => !["--modules", "--all", "--fast"].includes(arg));

const { core, modules } = testFiles();
const files = [...(wantCore ? core : []), ...(wantModules ? modules : [])];

if (files.length === 0) {
  console.error("No test files matched. Expected tests/*.test.ts to exist.");
  process.exit(1);
}

// A vacuous run is the failure mode this script could introduce: if the marker
// regex ever stopped matching, every module test would silently join the core
// suite and CI's two jobs would both run the same thing.
if (modules.length === 0) {
  console.error(
    "No Python-spawning tests were detected. Either they were removed, or the\n" +
      "detection marker in scripts/run-tests.ts no longer matches how they spawn\n" +
      "the interpreter. Fix the marker rather than ignoring this.",
  );
  process.exit(1);
}

const suite = wantCore && wantModules ? "core + modules" : wantModules ? "modules" : "core";
console.log(`Running ${suite} suite: ${files.length} file(s).`);
if (wantModules) {
  console.log("The module suite needs `python` on PATH plus modules/requirements.txt.");
}

const result = spawnSync(
  process.execPath,
  ["--import", loader, "--test", ...forwarded, ...files],
  { stdio: "inherit", cwd: root },
);

process.exit(result.status ?? 1);
