#!/usr/bin/env node
/**
 * The MCP adapter — second binding over the command schema.
 *
 * It hand-writes no tools. Every command in `COMMANDS` becomes a tool with the
 * same name, the same summary and the same parameters, because a hand-written
 * second surface drifts from the first and nothing notices when it does.
 *
 * Built on the SDK's low-level `Server` rather than the ergonomic wrapper: the
 * wrapper wants Zod schemas, and the command table already produces JSON
 * Schema. Translating one into the other would put a second description of
 * every parameter in the middle — the exact duplication this binding exists to
 * avoid.
 *
 * It also serves the knowledge tree as RESOURCES. That is the part decision
 * 0002 cared about: a host that does not speak Claude skills still gets the
 * selection narrative, the rule reference and every preset doc, with no skill
 * mechanism at all.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { COMMANDS, commandByName, paramsToJsonSchema } from "../commands.ts";
import { MODULES } from "../modules/repertoire.ts";
import { PRESETS } from "../selection/vocabulary.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");

export const INSTRUCTIONS =
  "Prancheta draws complex figures — schematics, graphs, mind maps, annotated figures — " +
  "as verified vector output. Before drawing, read the prancheta://selection resource and " +
  "call the `select` tool. Choosing the wrong kind of figure is the failure this tool " +
  "exists to prevent, and it cannot be fixed by drawing the wrong one well. Then call " +
  "`render` with a preset input. Every render returns checks; a figure that fails them is " +
  "reported, not hidden.";

export type KnowledgeResource = {
  uri: string;
  name: string;
  description: string;
  path: string;
};

/** The knowledge tree as URIs. One place, so a test can enumerate it. */
export function knowledgeResources(): KnowledgeResource[] {
  const resources: KnowledgeResource[] = [
    {
      uri: "prancheta://selection",
      name: "Choosing what to draw",
      description:
        "The hand-written selection narrative: how to decide what a figure is, and what " +
        "drawing it as a graph would destroy. Read this first.",
      path: join(projectRoot, "docs", "selection", "SELECTION.md"),
    },
    {
      uri: "prancheta://selection/rules",
      name: "Selection rule reference",
      description: "Generated reference for every selection rule, by id.",
      path: join(projectRoot, "docs", "selection", "RULES.generated.md"),
    },
    {
      uri: "prancheta://constraints",
      name: "Constraints, and the three you may stand down",
      description:
        "Which structural refusals can be relaxed per figure (overlap, connector crossing, " +
        "curved connectors), why a relaxed check reports not-applicable rather than pass, " +
        "and how curves stay honest by being checked as they are drawn.",
      path: join(projectRoot, "docs", "CONSTRAINTS.md"),
    },
    {
      uri: "prancheta://typography",
      name: "Typography: two axes, and what is bundled",
      description:
        "Why type keys on `level` (how loud) rather than `role` (what it means), the four " +
        "type packs, which of their faces are actually bundled versus wished for, and why " +
        "tracking is measured in the mirror rather than only drawn.",
      path: join(projectRoot, "docs", "design", "TYPOGRAPHY.md"),
    },
    {
      uri: "prancheta://effects",
      name: "Effects: depth cues that are checked, not decorated",
      description:
        "When a shadow, glow, blur or occlusion carries information rather than noise, " +
        "and why an effect's reach is treated as geometry the canvas has to fit.",
      path: join(projectRoot, "docs", "effects", "EFFECTS.md"),
    },
  ];

  for (const preset of PRESETS) {
    resources.push({
      uri: `prancheta://preset/${preset.id}`,
      name: `${preset.id} preset`,
      description: `${preset.summary} When to choose it, and when not to.`,
      path: join(projectRoot, "src", "presets", preset.id, "PRESET.md"),
    });
  }

  resources.push({
    uri: "prancheta://modules",
    name: "Figure modules: the repertoire and the protocol",
    description:
      "Figure kinds the core cannot draw itself — circuits, maps, molecules, unit cells " +
      "and more — how to run one, what the core checks about it, and what it never checks.",
    path: join(projectRoot, "modules", "README.md"),
  });

  for (const module of MODULES) {
    resources.push({
      uri: `prancheta://module/${module.id}`,
      name: `${module.id} module`,
      description: `${module.summary} Why the core cannot draw it, and what it does not attempt.`,
      path: join(projectRoot, "modules", module.id, "MODULE.md"),
    });
  }

  return resources;
}

/** Tool definitions, generated from the command table. Never hand-written. */
export function toolDefinitions(): { name: string; description: string; inputSchema: unknown }[] {
  return COMMANDS.map((command) => ({
    name: command.name,
    description: command.summary,
    inputSchema: paramsToJsonSchema(command),
  }));
}

export function createServer(): Server {
  const server = new Server(
    { name: "prancheta", version: "0.0.0" },
    { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions() }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const command = commandByName(request.params.name);
    if (command === undefined) {
      return {
        content: [{ type: "text", text: `unknown tool "${request.params.name}"` }],
        isError: true,
      };
    }
    try {
      const result = await command.run(request.params.arguments ?? {});
      // A failing check is a RESULT, not a protocol error: the caller asked for
      // a figure and got one, with its problems named. Only a thrown error —
      // bad spec, missing file — is isError.
      return { content: [{ type: "text", text: result.text }], isError: false };
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: knowledgeResources().map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: "text/markdown",
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = knowledgeResources().find((entry) => entry.uri === request.params.uri);
    if (resource === undefined) throw new Error(`unknown resource "${request.params.uri}"`);
    return {
      contents: [
        {
          uri: resource.uri,
          mimeType: "text/markdown",
          text: await readFile(resource.path, "utf8"),
        },
      ],
    };
  });

  return server;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;

if (invokedDirectly) {
  await createServer().connect(new StdioServerTransport());
}
