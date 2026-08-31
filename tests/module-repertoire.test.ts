/**
 * The repertoire table against the filesystem.
 *
 * `src/modules/repertoire.ts` is hand-curated because a one-line summary is
 * editorial. Everything else about it can drift — a module gets added and
 * nobody lists it, a script is renamed and the documented path rots, a module
 * is deleted and its entry lingers — so everything else about it is checked
 * here rather than trusted.
 *
 * This is the same bargain the preset repertoire makes: curated where
 * judgement is needed, mechanical everywhere it is not.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MODULES, exampleArgs, moduleById } from "../src/modules/repertoire.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modulesDir = join(root, "modules");

/** Every directory under modules/ that actually documents itself as a module. */
function moduleDirectories(): string[] {
  return readdirSync(modulesDir)
    .filter((entry) => statSync(join(modulesDir, entry)).isDirectory())
    .filter((entry) => existsSync(join(modulesDir, entry, "MODULE.md")))
    .sort();
}

test("the repertoire is not empty (guards against a vacuous suite)", () => {
  assert.ok(MODULES.length >= 7, `expected the full repertoire, found ${MODULES.length}`);
});

test("every module directory on disk appears in the repertoire", () => {
  const listed = new Set(MODULES.map((module) => module.id));
  const missing = moduleDirectories().filter((id) => !listed.has(id));
  assert.deepEqual(
    missing,
    [],
    `these modules exist on disk but are not in src/modules/repertoire.ts: ${missing.join(", ")}`,
  );
});

test("every repertoire entry corresponds to a real module directory", () => {
  const onDisk = new Set(moduleDirectories());
  const phantom = MODULES.map((module) => module.id).filter((id) => !onDisk.has(id));
  assert.deepEqual(
    phantom,
    [],
    `these are listed in the repertoire but have no modules/<id>/MODULE.md: ${phantom.join(", ")}`,
  );
});

test("every declared entry script exists", () => {
  for (const module of MODULES) {
    assert.ok(module.entries.length > 0, `${module.id} declares no entry point`);
    for (const entry of module.entries) {
      assert.ok(
        existsSync(join(root, entry.path)),
        `${module.id} names ${entry.path}, which does not exist`,
      );
    }
  }
});

test("every module has a MODULE.md and the index links to it", () => {
  const index = readFileSync(join(modulesDir, "README.md"), "utf8");
  for (const module of MODULES) {
    assert.ok(
      existsSync(join(modulesDir, module.id, "MODULE.md")),
      `${module.id} has no MODULE.md`,
    );
    assert.ok(
      index.includes(`${module.id}/MODULE.md`),
      `modules/README.md does not link to ${module.id}/MODULE.md`,
    );
  }
});

test("ids are unique and summaries are real sentences", () => {
  const ids = MODULES.map((module) => module.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate module id");
  for (const module of MODULES) {
    assert.ok(module.summary.length > 20, `${module.id} has a stub summary`);
    assert.match(module.summary, /\.$/, `${module.id}'s summary should end in a full stop`);
  }
});

/**
 * A shortcut that no longer exists is the failure this catches: the table would
 * still look right, and the example command it produces would fail at runtime.
 * The keys live in each module's own NAMED dict, so that is what is read.
 */
test("every declared shortcut appears in its module's source", () => {
  for (const module of MODULES) {
    if (module.shortcuts.length === 0) continue;
    const sources = module.entries
      .map((entry) => readFileSync(join(root, entry.path), "utf8"))
      .join("\n");
    for (const shortcut of module.shortcuts) {
      assert.ok(
        sources.includes(`"${shortcut}"`),
        `${module.id} lists the shortcut "${shortcut}", which does not appear in its source`,
      );
    }
  }
});

test("moduleById finds a real module and rejects an invented one", () => {
  assert.equal(moduleById("molecule")?.id, "molecule");
  assert.equal(moduleById("not-a-module"), undefined);
});

test("exampleArgs produces a runnable --args value", () => {
  for (const module of MODULES) {
    const args = exampleArgs(module);
    const [path] = args.split(",");
    assert.ok(existsSync(join(root, path!)), `${module.id}'s example names a missing script`);
    if (module.shortcuts.length > 0) {
      assert.match(args, /,--name=/, `${module.id} has shortcuts but its example uses none`);
    }
  }
});

/**
 * No module may name a font the measuring machine might not have.
 *
 * Every module used to write `font-family="Segoe UI, sans-serif"` into its own
 * SVG. Segoe UI is proprietary and absent from every Linux machine, so the
 * browser that MEASURES the result resolved something else, the glyphs came
 * out a different width, and the same figure was a different figure depending
 * on who rendered it. Three module tests failed that way the first time CI
 * ran -- and one of them was a PLANTED defect in the map probe that stopped
 * being detected at all, which is the silent pass this repertoire exists to
 * refuse.
 *
 * The core now hands the family down with the canvas size and supplies the
 * matching @font-face when it loads the SVG. This is the guard that keeps a
 * hardcoded face from creeping back in one render at a time.
 */
test("no module hardcodes a font family instead of using the one it was given", () => {
  const offenders: string[] = [];
  for (const module of MODULES) {
    for (const entry of module.entries) {
      const source = readFileSync(join(root, entry.path), "utf8");
      for (const [i, line] of source.split("\n").entries()) {
        // The declaration the core supplies, and the module-level default that
        // exists only for running the script by hand, are both fine.
        if (!line.includes("font-family=")) continue;
        if (line.includes("{FONT_STACK}")) continue;
        offenders.push(`${entry.path}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these lines name a font directly instead of using FONT_STACK: ${offenders.join(", ")}`,
  );
});
