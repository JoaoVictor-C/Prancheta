#!/usr/bin/env node
/**
 * The CLI — first binding over the command schema.
 *
 * It contains no figure logic at all: it turns argv into a parameter object,
 * calls the command, and prints what comes back. Every command it can run, the
 * MCP server can run too, because both enumerate the same table.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { COMMANDS, commandByName } from "./commands.ts";
import type { Command } from "./commands.ts";
import { SpecError } from "./ir/types.ts";

function usage(command?: Command): string {
  if (command === undefined) {
    const width = Math.max(...COMMANDS.map((entry) => entry.name.length));
    const list = COMMANDS.map(
      (entry) => `  ${entry.name.padEnd(width)}  ${firstSentence(entry.summary)}`,
    ).join("\n");
    return `prancheta <command> [options]\n\nCommands:\n${list}\n\nRun "prancheta <command> --help" for options.`;
  }

  const positional = command.params
    .filter((param) => param.positional === true)
    .map((param) => (param.type === "string[]" ? `<${param.name}...>` : `<${param.name}>`))
    .join(" ");
  const flags = command.params
    .filter((param) => param.positional !== true)
    .map((param) => {
      const short = param.short === undefined ? "    " : `-${param.short}, `;
      const value = param.type === "boolean" ? "" : ` <${param.type === "string[]" ? "a,b" : param.type}>`;
      const fallback = param.default === undefined ? "" : ` (default: ${String(param.default)})`;
      const negatable = param.type === "boolean" ? `\n      --no-${param.name}` : "";
      return `  ${short}--${param.name}${value}  ${param.description}${fallback}${negatable}`;
    })
    .join("\n");

  return `prancheta ${command.name} ${positional}\n\n${command.summary}\n${
    flags === "" ? "" : `\nOptions:\n${flags}\n`
  }`;
}

function firstSentence(text: string): string {
  const stop = text.indexOf(". ");
  return stop === -1 ? text : `${text.slice(0, stop)}.`;
}

export function parseArgs(command: Command, argv: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const param of command.params) {
    if (param.default !== undefined) args[param.name] = param.default;
  }

  const positionals = command.params.filter((param) => param.positional === true);
  let positionalIndex = 0;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("-")) {
      const param = positionals[positionalIndex];
      if (param === undefined) throw new Error(`unexpected argument "${token}"`);
      if (param.type === "string[]") {
        // A variadic positional -- must be the LAST one, and consumes every
        // remaining non-flag token rather than a single value. Distinct from
        // a repeatable FLAG's "string[]" (--args a --args b): here there is
        // no flag name to repeat, so arity is "as many bare tokens as follow".
        const existing = args[param.name];
        args[param.name] = existing === undefined ? [token] : [...(existing as string[]), token];
      } else {
        args[param.name] = token;
        positionalIndex += 1;
      }
      continue;
    }

    const negated = token.startsWith("--no-");
    const name = negated ? token.slice(5) : token.replace(/^--?/, "");
    const param = command.params.find(
      (entry) => entry.name === name || (entry.short !== undefined && entry.short === name),
    );
    if (param === undefined) throw new Error(`unknown option "${token}"`);

    if (param.type === "boolean") {
      args[param.name] = !negated;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`option "${token}" needs a value`);
    if (param.type === "string[]") {
      // Repeatable, not comma-joined: --args a --args b keeps "a" and "b"
      // intact even when either one contains a comma of its own (a module
      // argument like --data=10,20,30). A single occurrence is left as a
      // plain string, so the classic "a,b,c" single-flag shorthand still
      // comma-splits exactly as before -- see toStringArray in commands.ts,
      // which only treats an already-array value (two or more --flag
      // occurrences here, or any array passed straight through by the MCP
      // binding) as pre-split.
      const existing = args[param.name];
      args[param.name] = existing === undefined ? value : [...(Array.isArray(existing) ? existing : [existing]), value];
    } else {
      args[param.name] = param.type === "number" ? Number(value) : value;
    }
    i += 1;
  }

  for (const param of command.params) {
    if (param.required === true && args[param.name] === undefined) {
      throw new Error(`${command.name} needs <${param.name}>`);
    }
  }
  return args;
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.log(usage());
    return 1;
  }

  const name = args[0]!;
  if (name === "-h" || name === "--help" || name === "help") {
    console.log(usage());
    return 0;
  }

  const command = commandByName(name);
  if (command === undefined) {
    // The commonest way to land here is `npm run render <spec>`, where npm eats
    // the word "render" as the script name and the path arrives in its place.
    if (/\.json$/i.test(name)) {
      console.error(
        `expected a command, got the spec path "${name}".\n` +
          `Did you mean:  prancheta render ${name}\n\n${usage()}`,
      );
      return 1;
    }
    console.error(`unknown command "${name}"\n\n${usage()}`);
    return 1;
  }

  const rest = args.slice(1);
  if (rest.includes("-h") || rest.includes("--help")) {
    console.log(usage(command));
    return 0;
  }

  const parsed = parseArgs(command, rest);
  const result = await command.run(parsed);

  // `render` is the one command with artefacts to write. Writing them is the
  // CLI's job, not the command's: an MCP caller wants the manifest, not files
  // scattered in whatever directory the server happens to be running in.
  const payload = result.data as
    | { manifest?: unknown; svg?: string; png?: Buffer; pdf?: Buffer }
    | undefined;
  if (command.name === "render" && payload?.svg !== undefined) {
    const outDir = String(parsed.out ?? "out");
    const stem = basename(String(parsed.spec), extname(String(parsed.spec)));
    await mkdir(outDir, { recursive: true });
    const svgPath = join(outDir, `${stem}.svg`);
    const pngPath = join(outDir, `${stem}.png`);
    const manifestPath = join(outDir, `${stem}.manifest.json`);
    const pdfPath = join(outDir, `${stem}.pdf`);
    await writeFile(svgPath, payload.svg, "utf8");
    if (payload.png !== undefined) await writeFile(pngPath, payload.png);
    if (payload.pdf !== undefined) await writeFile(pdfPath, payload.pdf);
    await writeFile(manifestPath, `${JSON.stringify(payload.manifest, null, 2)}\n`, "utf8");

    const [head, ...rest] = result.text.split("\n");
    console.log(head);
    console.log(`  ${resolve(svgPath)}`);
    console.log(`  ${resolve(pngPath)}`);
    if (payload.pdf !== undefined) console.log(`  ${resolve(pdfPath)}`);
    console.log(`  ${resolve(manifestPath)}`);
    if (rest.length > 0) console.log(rest.join("\n"));
    return result.exitCode ?? 0;
  }

  if (command.name === "animate" && payload?.svg !== undefined) {
    const outDir = String(parsed.out ?? "out");
    const statePaths = Array.isArray(parsed.states) ? parsed.states.map(String) : [String(parsed.states)];
    // Every state's name joined by "-" is fine for a two-state transition and
    // unusable for a sequence: 51 states produced a 700-character filename that
    // the filesystem refused, AFTER every state had been rendered and checked.
    // Past a handful of states the name says which run this is, not what is in
    // it -- the manifest already lists every state by path.
    const stems = statePaths.map((path) => basename(path, extname(path)));
    const stem =
      stems.length <= 3
        ? stems.join("-")
        : `${stems[0]}-to-${stems[stems.length - 1]}-${stems.length}states`;
    await mkdir(outDir, { recursive: true });
    const svgPath = join(outDir, `${stem}.animated.svg`);
    const manifestPath = join(outDir, `${stem}.animated.manifest.json`);
    await writeFile(svgPath, payload.svg, "utf8");
    await writeFile(manifestPath, `${JSON.stringify(payload.manifest, null, 2)}\n`, "utf8");
    console.log(result.text);
    console.log(`  ${resolve(svgPath)}`);
    console.log(`  ${resolve(manifestPath)}`);
    return result.exitCode ?? 0;
  }

  console.log(result.text);
  return result.exitCode ?? 0;
}

// Guarded the same way src/mcp/server.ts guards its own entry point: importing
// this module (e.g. from a test that wants parseArgs) must not launch a real
// CLI run using whatever argv the importer happens to have.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;

if (invokedDirectly) {
  main(process.argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      if (error instanceof SpecError) console.error(`invalid spec: ${error.message}`);
      else console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    });
}
