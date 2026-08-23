import { test } from "node:test";
import assert from "node:assert/strict";

import { COMMANDS, commandByName, paramsToJsonSchema } from "../src/commands.ts";
import type { ParamType } from "../src/commands.ts";

const VALID_TYPES: ParamType[] = ["string", "number", "boolean", "string[]"];

// --- 1. BASIC SHAPE ----------------------------------------------------------

test("every command has a non-empty name and summary", () => {
  for (const command of COMMANDS) {
    assert.ok(command.name.length > 0, `command with empty name: ${JSON.stringify(command)}`);
    assert.ok(command.summary.length > 0, `command "${command.name}" has empty summary`);
  }
});

test("command names are unique", () => {
  const names = COMMANDS.map((command) => command.name);
  const unique = new Set(names);
  assert.equal(unique.size, names.length, `duplicate command names: ${names.join(", ")}`);
});

test("every param has a name, type and description", () => {
  for (const command of COMMANDS) {
    for (const param of command.params) {
      assert.ok(
        param.name.length > 0,
        `command "${command.name}" has a param with an empty name`,
      );
      assert.ok(
        param.type.length > 0,
        `command "${command.name}" param "${param.name}" has an empty type`,
      );
      assert.ok(
        param.description.length > 0,
        `command "${command.name}" param "${param.name}" has an empty description`,
      );
    }
  }
});

test("every param type is one of the valid ParamType values", () => {
  for (const command of COMMANDS) {
    for (const param of command.params) {
      assert.ok(
        (VALID_TYPES as string[]).includes(param.type),
        `command "${command.name}" param "${param.name}" has invalid type "${param.type}"`,
      );
    }
  }
});

// The original rule here was "at most one positional param", which was an
// assumption from when `render` was the only command rather than a real
// constraint — `diff` legitimately takes a before and an after. What actually
// matters is that positionals are unambiguous: the CLI fills them in order, so
// an optional one would make it impossible to tell which was omitted.
test("every positional param is required, so argv order is unambiguous", () => {
  for (const command of COMMANDS) {
    const positional = command.params.filter((param) => param.positional === true);
    for (const param of positional) {
      assert.equal(
        param.required,
        true,
        `command "${command.name}" has an optional positional param "${param.name}"; ` +
          "the CLI fills positionals in order and could not tell which was skipped",
      );
    }
  }
});

// --- 2. paramsToJsonSchema ----------------------------------------------------

test("paramsToJsonSchema produces type object with a property per param", () => {
  for (const command of COMMANDS) {
    const schema = paramsToJsonSchema(command);
    assert.equal(schema.type, "object");
    const propertyNames = Object.keys(schema.properties);
    assert.deepEqual(
      propertyNames.sort(),
      command.params.map((param) => param.name).sort(),
      `schema properties for "${command.name}" do not match its params`,
    );
  }
});

test("paramsToJsonSchema adds items for string[] params", () => {
  for (const command of COMMANDS) {
    const schema = paramsToJsonSchema(command);
    for (const param of command.params) {
      if (param.type === "string[]") {
        const property = schema.properties[param.name] as { type: string; items?: unknown };
        assert.equal(property.type, "array");
        assert.deepEqual(property.items, { type: "string" });
      }
    }
  }
});

test("paramsToJsonSchema required array contains exactly the required params", () => {
  for (const command of COMMANDS) {
    const schema = paramsToJsonSchema(command);
    const expectedRequired = command.params
      .filter((param) => param.required === true)
      .map((param) => param.name)
      .sort();
    if (expectedRequired.length === 0) {
      assert.equal(schema.required, undefined, `"${command.name}" should have no required array`);
    } else {
      assert.deepEqual((schema.required ?? []).slice().sort(), expectedRequired);
    }
  }
});

// --- 3. commandByName ----------------------------------------------------------

test("commandByName finds each command by name", () => {
  for (const command of COMMANDS) {
    assert.equal(commandByName(command.name), command);
  }
});

test("commandByName returns undefined for an unknown name", () => {
  assert.equal(commandByName("definitely-not-a-real-command"), undefined);
});
