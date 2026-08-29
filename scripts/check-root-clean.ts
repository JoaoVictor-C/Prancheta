/**
 * Check that the root directory contains only approved files and directories.
 *
 * Enforces ADR 0011: Project Organization
 *
 * Usage:
 *   node scripts/check-root-clean.ts        # Check and report violations
 *   node scripts/check-root-clean.ts --check # Exit 1 if violations found (for CI)
 */

import * as fs from 'fs';
import * as path from 'path';

const APPROVED_ROOT_ITEMS = new Set([
  // Package files
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.npmrc',
  '.gitignore',

  // Documentation
  'README.md',
  'ROADMAP.md',
  'TODO.md',
  'AGENTS.md',
  'CONTRIBUTING.md',

  // Directories
  'src',
  'tests',
  'fixtures',
  'modules',
  'docs',
  'assets',
  'out',
  'node_modules',
  'experiments',
  'temp',

  // Hidden config
  '.claude',

  // The repository itself, not a project file -- but readdirSync sees it like
  // any other entry, and ADR 0011 lists `.git/` among approved hidden items.
  // Omitting it meant this check had never passed on an actual clone: only on
  // a copy of the tree with no VCS directory. Every other hidden root entry
  // (.gitignore, .npmrc, .claude) was already approved above.
  '.git',

  // Scripts directory
  'scripts',
]);

interface CheckResult {
  violations: string[];
  isClean: boolean;
}

function checkRootClean(): CheckResult {
  const rootPath = process.cwd();
  const items = fs.readdirSync(rootPath);

  const violations: string[] = [];

  for (const item of items) {
    if (!APPROVED_ROOT_ITEMS.has(item)) {
      violations.push(item);
    }
  }

  return {
    violations,
    isClean: violations.length === 0,
  };
}

function main() {
  const isCheckMode = process.argv.includes('--check');

  const result = checkRootClean();

  if (result.isClean) {
    console.log('✓ Root directory is clean');
    process.exit(0);
  } else {
    console.error('✗ Root directory contains unapproved items:');
    for (const violation of result.violations) {
      console.error(`  - ${violation}`);
    }
    console.error('');
    console.error('Approved root items are defined in scripts/check-root-clean.ts');
    console.error('See ADR 0011 (docs/decisions/0011-project-organization.md) for standards.');
    console.error('');
    console.error('Suggestions:');
    console.error('  - Experiment files → experiments/generators/, experiments/probes/, or experiments/sketches/');
    console.error('  - Temporary files → temp/');
    console.error('  - Debug/log files → Delete or move to temp/');
    console.error('  - Config files → Consider if they belong in root or should be in .claude/');

    if (isCheckMode) {
      process.exit(1);
    } else {
      process.exit(0); // Don't fail in non-check mode, just report
    }
  }
}

main();
