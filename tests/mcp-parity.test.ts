import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { COMMANDS, paramsToJsonSchema } from "../src/commands.ts";
import { knowledgeResources, toolDefinitions } from "../src/mcp/server.ts";
import { PRESETS } from "../src/selection/vocabulary.ts";
import { MODULES } from "../src/modules/repertoire.ts";

// --- TOOL / COMMAND PARITY: the point of M3 -----------------------------------

test("toolDefinitions has exactly one entry per COMMANDS entry, same names, same order", () => {
  const tools = toolDefinitions();
  assert.equal(tools.length, COMMANDS.length);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    COMMANDS.map((command) => command.name),
  );
});

test("every tool description equals its command's summary", () => {
  const tools = toolDefinitions();
  for (let i = 0; i < COMMANDS.length; i++) {
    assert.equal(tools[i]!.description, COMMANDS[i]!.summary);
  }
});

test("every tool inputSchema deep-equals paramsToJsonSchema(command)", () => {
  const tools = toolDefinitions();
  for (let i = 0; i < COMMANDS.length; i++) {
    assert.deepEqual(tools[i]!.inputSchema, paramsToJsonSchema(COMMANDS[i]!));
  }
});

// --- KNOWLEDGE RESOURCES ---------------------------------------------------

/**
 * The narrative resources, named rather than counted. A bare count told us
 * only that the number had changed; naming them says which document went
 * missing, and makes adding one a deliberate edit here rather than a
 * arithmetic adjustment.
 */
const NARRATIVE_RESOURCES = [
  "prancheta://selection",
  "prancheta://selection/rules",
  "prancheta://constraints",
  "prancheta://effects",
  "prancheta://modules",
];

test("knowledgeResources includes one resource per preset plus every narrative resource", () => {
  const resources = knowledgeResources();
  const presetResources = resources.filter((resource) => resource.uri.startsWith("prancheta://preset/"));
  assert.equal(presetResources.length, PRESETS.length);
  for (const preset of PRESETS) {
    assert.ok(
      resources.some((resource) => resource.uri === `prancheta://preset/${preset.id}`),
      `missing resource for preset ${preset.id}`,
    );
  }
  for (const uri of NARRATIVE_RESOURCES) {
    assert.ok(
      resources.some((resource) => resource.uri === uri),
      `missing narrative resource ${uri}`,
    );
  }
  assert.equal(
    resources.length,
    PRESETS.length + MODULES.length + NARRATIVE_RESOURCES.length,
  );
});

/**
 * Modules were built, documented, and then unreachable: nothing in the resource
 * tree mentioned them, so an agent could not read about a figure kind it had
 * never been told existed. One resource per module is what fixes that, and this
 * asserts it stays fixed as the repertoire grows.
 */
test("knowledgeResources includes one resource per figure module", () => {
  const resources = knowledgeResources();
  const moduleResources = resources.filter((resource) =>
    resource.uri.startsWith("prancheta://module/"),
  );
  assert.equal(moduleResources.length, MODULES.length);
  for (const module of MODULES) {
    assert.ok(
      resources.some((resource) => resource.uri === `prancheta://module/${module.id}`),
      `missing resource for module ${module.id}`,
    );
  }
});

test("every resource uri is unique and starts with prancheta://", () => {
  const resources = knowledgeResources();
  const uris = resources.map((resource) => resource.uri);
  assert.equal(new Set(uris).size, uris.length, "duplicate resource uris");
  for (const uri of uris) {
    assert.ok(uri.startsWith("prancheta://"), `uri "${uri}" does not start with prancheta://`);
  }
});

test("every resource path exists on disk", () => {
  const resources = knowledgeResources();
  for (const resource of resources) {
    assert.ok(existsSync(resource.path), `resource "${resource.uri}" path does not exist: ${resource.path}`);
  }
});
