/**
 * Dangling-reference guard, the version that actually bites.
 *
 * The first attempt at this checked for backtick-quoted preset ids in the
 * selection narrative — and was vacuous, because that document refers to
 * presets in prose ("a mindmap", "the graph preset") rather than as literal
 * tokens. A test that cannot fail is worse than no test: it reads as coverage.
 *
 * What IS mechanically checkable, and what actually breaks when a preset is
 * renamed, is the links. Every preset doc links to its fixture and to its
 * sibling presets; every decision links to the others. Rename a directory and
 * those go stale silently.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every markdown file we author by hand, plus the generated views. */
function markdownFiles(): string[] {
  const found: string[] = [];
  const skip = new Set(["node_modules", "out", ".git"]);

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".md")) found.push(full);
    }
  };

  walk(root);
  return found;
}

/** Relative links only: external URLs and anchors are not ours to verify. */
function relativeLinks(markdown: string): string[] {
  const links: string[] = [];
  const pattern = /\]\(([^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const target = match[1]!;
    if (/^[a-z]+:\/\//i.test(target)) continue;
    if (target.startsWith("#")) continue;
    links.push(target.split("#")[0]!);
  }
  return links;
}

const files = markdownFiles();

test("there are markdown files to check (guards against a vacuous suite)", () => {
  assert.ok(files.length >= 8, `expected several markdown files, found ${files.length}`);
});

for (const file of files) {
  const relative = file.slice(root.length + 1);
  test(`every relative link resolves: ${relative}`, () => {
    const links = relativeLinks(readFileSync(file, "utf8"));
    const broken = links.filter((link) => !existsSync(resolve(dirname(file), link)));
    assert.deepEqual(
      broken,
      [],
      `${relative} links to ${broken.join(", ")}, which does not exist`,
    );
  });
}

test("the guard is not vacuous: real links were found and checked", () => {
  const total = files.reduce(
    (count, file) => count + relativeLinks(readFileSync(file, "utf8")).length,
    0,
  );
  assert.ok(total >= 15, `expected to check many links, only found ${total}`);
});
