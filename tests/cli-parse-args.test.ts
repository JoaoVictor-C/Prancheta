/**
 * Unit tests for src/cli.ts's argv-to-params translation, specifically the
 * --args comma-delimiter fix: a string[] param used to only ever accept one
 * occurrence of its flag, whose value was later comma-split in
 * src/commands.ts's toStringArray -- so any individual value containing its
 * own comma (a Python module argument like --data=10,20,30) broke silently.
 * Several modules (dendrogram, circuit, genomic, topology, map) independently
 * worked around this with a ";"/":" convention documented in their own
 * MODULE.md. The fix: repeating the flag now accumulates raw, un-split
 * values, so a comma survives intact. A single occurrence is left as a plain
 * string, so every existing "a,b,c" caller is unaffected.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli.ts";
import { commandByName, toStringArray } from "../src/commands.ts";

const moduleCommand = commandByName("module")!;

test("a single --args occurrence stays a plain string (backward compatible with toStringArray's comma-split)", () => {
  const args = parseArgs(moduleCommand, ["python", "--args", "modules/foo/render.py,--name=bar"]);
  assert.equal(args.args, "modules/foo/render.py,--name=bar");
});

test("repeated --args occurrences accumulate into an array, each value taken verbatim", () => {
  const args = parseArgs(moduleCommand, [
    "python",
    "--args",
    "modules/foo/render.py",
    "--args",
    "--data=10,20,30",
  ]);
  assert.deepEqual(args.args, ["modules/foo/render.py", "--data=10,20,30"]);
});

test("three or more repeated --args occurrences all accumulate, in order", () => {
  const args = parseArgs(moduleCommand, [
    "python",
    "--args",
    "modules/foo/render.py",
    "--args",
    "--labels=P,Q,R",
    "--args",
    "--data=0,0;1,1",
  ]);
  assert.deepEqual(args.args, ["modules/foo/render.py", "--labels=P,Q,R", "--data=0,0;1,1"]);
});

test("a single --args value with no comma round-trips unchanged", () => {
  const args = parseArgs(moduleCommand, ["python", "--args", "modules/foo/render.py"]);
  assert.equal(args.args, "modules/foo/render.py");
});

test("toStringArray: end to end, a single occurrence with an embedded comma still splits (the old shorthand)", () => {
  const args = parseArgs(moduleCommand, ["python", "--args", "modules/foo/render.py,--name=bar"]);
  assert.deepEqual(toStringArray(args.args), ["modules/foo/render.py", "--name=bar"]);
});

test("toStringArray: end to end, repeated --args survive a comma inside one value intact", () => {
  const args = parseArgs(moduleCommand, [
    "python",
    "--args",
    "modules/foo/render.py",
    "--args",
    "--data=10,20,30",
  ]);
  assert.deepEqual(toStringArray(args.args), ["modules/foo/render.py", "--data=10,20,30"]);
});

test("toStringArray: a genuine array (as the MCP binding passes straight through) is never comma-split, even at length 1", () => {
  assert.deepEqual(toStringArray(["--data=10,20,30"]), ["--data=10,20,30"]);
});

test("toStringArray: undefined and null both yield an empty array", () => {
  assert.deepEqual(toStringArray(undefined), []);
  assert.deepEqual(toStringArray(null), []);
});
