/**
 * The command schema — one definition, two bindings.
 *
 * Decision 0002 says the MCP adapter mirrors the CLI 1:1 and is generated from
 * the same schema rather than hand-maintained. This is that schema. A command
 * declares its name, what it does, its parameters, and a handler; the CLI
 * parses argv into those parameters and the MCP server turns the same
 * declarations into tool definitions.
 *
 * The point is not to save typing. It is that a hand-written second binding
 * drifts: a flag gets added to the CLI, the MCP tool keeps the old shape, and
 * nobody notices because nothing compares them. Here a drift is a type error,
 * and a test asserts the two surfaces enumerate the same commands.
 */

import { readFile } from "node:fs/promises";
import { parseSpec } from "./ir/types.ts";
import { expand, isPresetInput } from "./presets/index.ts";
import { render } from "./pipeline.ts";
import type { RenderOptions } from "./pipeline.ts";
import { rank } from "./selection/rank.ts";
import { FLOOR, RULES } from "./selection/rules.ts";
import { IDIOM, PRESETS, STRUCTURE, partitionPredicates } from "./selection/vocabulary.ts";
import { EFFECT_NAMES, EFFECT_PRESETS, resolveEffects } from "./effects/types.ts";
import { MODULES, exampleArgs } from "./modules/repertoire.ts";
import { bleedOf, isEmpty as bleedIsEmpty } from "./effects/bleed.ts";
import { THEMES } from "./theme.ts";
import { WCAG_AA_NORMAL, contrastRatio } from "./colour/contrast.ts";

export type ParamType = "string" | "number" | "boolean" | "string[]";

export type ParamSpec = {
  name: string;
  type: ParamType;
  description: string;
  required?: boolean;
  /** Short CLI flag, e.g. "o" for --out/-o. Positional params have none. */
  short?: string;
  /** Positional on the CLI rather than a flag. */
  positional?: boolean;
  default?: string | number | boolean;
};

export type CommandResult = {
  /** Plain text for a terminal or an MCP text block. */
  text: string;
  /** Structured payload for callers that want data rather than prose. */
  data?: unknown;
  /** Non-zero means a check failed, not that the command errored. */
  exitCode?: number;
};

export type Command = {
  name: string;
  summary: string;
  params: ParamSpec[];
  run(args: Record<string, unknown>): Promise<CommandResult>;
};

// ---------------------------------------------------------------------------

const renderCommand: Command = {
  name: "render",
  summary: "Render a figure spec or preset input to SVG, PNG and a manifest.",
  params: [
    {
      name: "spec",
      type: "string",
      description: "Path to a JSON file holding raw figure IR or a preset input.",
      required: true,
      positional: true,
    },
    {
      name: "out",
      type: "string",
      description: "Output directory.",
      short: "o",
      default: "out",
    },
    { name: "scale", type: "number", description: "PNG pixel density.", default: 2 },
    {
      name: "repair",
      type: "boolean",
      description: "Repair geometric defects. Set false to see the figure exactly as authored.",
      default: true,
    },
    {
      name: "maxPasses",
      type: "number",
      description: "Layout passes, including the first.",
      default: 3,
    },
    {
      name: "maxScale",
      type: "number",
      description: "How far a box may grow, as a multiple of its original size.",
      default: 3,
    },
    {
      name: "fontEmbed",
      type: "string",
      description:
        "\"embed\" inlines the bundled font as a base64 @font-face; \"outline\" converts " +
        "every glyph to a filled path with zero runtime font dependency. Default \"none\".",
      default: "none",
    },
    {
      name: "pdf",
      type: "boolean",
      description: "Also write a PDF alongside the SVG and PNG.",
      default: false,
    },
    {
      name: "pdfSize",
      type: "string",
      description:
        "PDF page size: \"figure\" (default, the page IS the figure, unscaled), \"a4\", " +
        "\"a4-landscape\", \"letter\", \"letter-landscape\", or \"<width>x<height>mm\".",
      default: "figure",
    },
  ],
  async run(args) {
    const specPath = String(args.spec);
    const parsed: unknown = JSON.parse(await readFile(specPath, "utf8"));
    const spec = isPresetInput(parsed) ? expand(parsed) : parseSpec(parsed);

    const fontEmbed = String(args.fontEmbed ?? "none");
    if (fontEmbed !== "none" && fontEmbed !== "embed" && fontEmbed !== "outline") {
      throw new Error(`--fontEmbed must be "none", "embed" or "outline", got "${fontEmbed}"`);
    }
    const pdfSize = parsePdfSize(String(args.pdfSize ?? "figure"));
    const options: RenderOptions = {
      scale: Number(args.scale ?? 2),
      repair: args.repair !== false,
      maxPasses: Number(args.maxPasses ?? 3),
      maxScale: Number(args.maxScale ?? 3),
      fontEmbed,
      pdf: args.pdf === true ? { size: pdfSize } : undefined,
    };

    const started = Date.now();
    const result = await render(spec, options);
    const elapsed = Date.now() - started;
    const { manifest } = result;

    const lines: string[] = [
      `${manifest.figure.width} x ${manifest.figure.height}  ` +
        `${manifest.elements.length} elements  ${manifest.passes} pass(es)  ${elapsed}ms`,
    ];
    for (const edit of manifest.repairs) {
      lines.push(
        `  fix  pass ${edit.pass}: ${edit.target}.${edit.property} ` +
          `${edit.from} -> ${edit.to} (${edit.reason})`,
      );
    }
    for (const check of manifest.checks) {
      const mark =
        check.status === "pass" ? "ok  " : check.status === "fail" ? "FAIL" : "n/a ";
      lines.push(
        `  ${mark} ${check.id} [${check.target}]${check.detail === undefined ? "" : ` — ${check.detail}`}`,
      );
    }
    for (const item of manifest.unrepaired) {
      lines.push(`  !    unrepaired ${item.check.id} [${item.check.target}] — ${item.why}`);
    }
    for (const warning of manifest.warnings) lines.push(`  warn ${warning}`);

    return {
      text: lines.join("\n"),
      // The PNG (and PDF, if requested) ride along as Buffers. The CLI writes
      // them to disk; the MCP binding drops them, because a base64 image or
      // PDF in a tool result is a payload nobody asked for.
      data: {
        manifest,
        svg: result.svg,
        png: result.png,
        pdf: result.pdf,
        effectiveSpec: result.effectiveSpec,
      },
      exitCode: manifest.ok ? 0 : 2,
    };
  },
};

/** "a4", "letter-landscape", "210x297mm", or "figure" -- what --pdfSize accepts. */
function parsePdfSize(value: string): NonNullable<RenderOptions["pdf"]>["size"] {
  if (
    value === "figure" ||
    value === "a4" ||
    value === "a4-landscape" ||
    value === "letter" ||
    value === "letter-landscape"
  ) {
    return value;
  }
  const match = /^([\d.]+)x([\d.]+)mm$/.exec(value);
  if (match) return { widthMm: Number(match[1]), heightMm: Number(match[2]) };
  throw new Error(
    `--pdfSize must be "figure", "a4", "a4-landscape", "letter", "letter-landscape" or ` +
      `"<width>x<height>mm", got "${value}"`,
  );
}

const selectCommand: Command = {
  name: "select",
  summary:
    "Rank presets for a set of content predicates, with the rules that decided it. " +
    "Answers with a preset, a composition, or 'no preset fits'.",
  params: [
    {
      name: "structure",
      type: "string[]",
      description: `What the content IS. One or more of: ${STRUCTURE.join(", ")}.`,
    },
    {
      name: "idiom",
      type: "string[]",
      description: `How it must be DRAWN. One or more of: ${IDIOM.join(", ")}.`,
    },
  ],
  async run(args) {
    const predicates = partitionPredicates({
      structure: toStringArray(args.structure),
      idiom: toStringArray(args.idiom),
    });
    const selection = rank(predicates);

    const lines = [`outcome: ${selection.outcome}`, selection.rationale, "", "candidates:"];
    for (const candidate of selection.candidates) {
      const state =
        candidate.disqualifiedBy !== undefined
          ? `refused by ${candidate.disqualifiedBy}`
          : candidate.score >= FLOOR
            ? `viable (${candidate.score})`
            : `below floor (${candidate.score})`;
      const cited = candidate.cited.length > 0 ? ` [${candidate.cited.join(", ")}]` : "";
      lines.push(`  ${candidate.preset}: ${state}${cited}`);
    }
    if (selection.unknown.length > 0) {
      lines.push(
        "",
        `unknown predicates (recorded, never scored): ${selection.unknown.join(", ")}`,
        "These are the signal that the vocabulary may be missing something.",
      );
    }
    if (selection.notYetImplemented.length > 0) {
      lines.push("", `not yet implemented: ${selection.notYetImplemented.join(", ")}`);
    }

    return { text: lines.join("\n"), data: selection, exitCode: 0 };
  },
};

const presetsCommand: Command = {
  name: "presets",
  summary: "List the repertoire: every preset, whether it is implemented, and what it is for.",
  params: [],
  async run() {
    const lines = PRESETS.map(
      (preset) =>
        `${preset.id}${preset.implemented ? "" : " (not implemented)"} — ${preset.summary}`,
    );
    return { text: lines.join("\n"), data: PRESETS, exitCode: 0 };
  },
};

const rulesCommand: Command = {
  name: "rules",
  summary: "Print the selection rule table: what each rule reacts to and what it does.",
  params: [],
  async run() {
    const lines = [`floor: ${FLOOR}`, ""];
    for (const rule of RULES) {
      const effect =
        rule.effect === "disqualify" ? "DISQUALIFIES" : `favours (+${rule.weight})`;
      lines.push(
        `${rule.id}\n  when ${rule.axis}:${rule.when} -> ${effect} ${rule.preset} ` +
          `(priority ${rule.priority})\n  ${rule.statement}`,
      );
    }
    return { text: lines.join("\n"), data: { floor: FLOOR, rules: RULES }, exitCode: 0 };
  },
};

/**
 * The effect repertoire, with the one number an author actually needs.
 *
 * Listing the names would be half an answer. What decides whether an effect is
 * usable in a given figure is how far past its own edges it puts ink, because
 * that is what has to fit on the canvas — so every entry reports its bleed,
 * measured the same way checks.ts measures it rather than described in prose.
 */
/**
 * The theme repertoire, with the number an author actually needs: does the
 * text on each role clear WCAG AA against the fill it sits on. Colour was
 * invisible the same way the modules were before they got a command --
 * nothing surfaced that "light" and "print" existed at all, or what a role
 * would look like under them, until an author already knew the palette
 * names to ask for.
 */
const themesCommand: Command = {
  name: "themes",
  summary:
    "List the theme repertoire: every named palette, its roles, and whether " +
    "each role's text clears WCAG AA against its own fill.",
  params: [],
  async run() {
    const lines: string[] = [];
    for (const theme of Object.values(THEMES)) {
      lines.push(`${theme.name} — canvas ${theme.canvas.background}`);
      for (const [role, colours] of Object.entries(theme.roles)) {
        const background = colours.fill === "transparent" ? theme.canvas.background : colours.fill;
        const ratio = contrastRatio(colours.text, background);
        const verdict =
          ratio === null
            ? "unmeasurable"
            : ratio >= WCAG_AA_NORMAL
              ? `${Math.round(ratio * 100) / 100}:1 pass`
              : `${Math.round(ratio * 100) / 100}:1 FAIL`;
        lines.push(`  ${role.padEnd(8)} fill ${colours.fill.padEnd(12)} text ${colours.text.padEnd(9)} ${verdict}`);
      }
      lines.push("");
    }
    lines.push(
      "Set canvas.theme in a spec (\"dark\" | \"light\" | \"print\") to select one; unset " +
        "renders exactly as before this command existed. contrast-sufficient and " +
        "categorical-colours-distinguishable check every render against these numbers, not " +
        "just this listing.",
    );
    return { text: lines.join("\n"), data: THEMES, exitCode: 0 };
  },
};

const effectsCommand: Command = {
  name: "effects",
  summary:
    "List the effect repertoire: every named effect, what it is composed of, " +
    "and how far past an element's own edges it puts ink.",
  params: [],
  async run() {
    const entries = EFFECT_NAMES.map((name) => {
      const chain = resolveEffects(name);
      const bleed = bleedOf(chain);
      return {
        name,
        chain: chain.map((effect) => effect.kind),
        bleed,
        spreads: !bleedIsEmpty(bleed),
      };
    });

    const lines = entries.map((entry) => {
      const reach = entry.spreads
        ? `bleeds left ${round(entry.bleed.left)} top ${round(entry.bleed.top)} ` +
          `right ${round(entry.bleed.right)} bottom ${round(entry.bleed.bottom)}`
        : "stays inside its own bounds";
      return `${entry.name} — ${entry.chain.join(" + ")}; ${reach}`;
    });
    lines.push("");
    lines.push(
      "An effect never changes layout. One that spreads needs room on the canvas; " +
        "if there is none, the effect-within-canvas check fails and the repair loop " +
        "grows canvas.padding rather than moving anything.",
    );

    return { text: lines.join("\n"), data: entries, exitCode: 0 };
  },
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The module repertoire.
 *
 * Modules are separate processes, so nothing about them showed up anywhere a
 * caller looks. An agent cannot choose a figure kind it has never heard of,
 * which made eleven working modules effectively invisible. Each entry carries
 * a runnable example rather than a description of one — the gap between "there
 * is a circuit module" and actually invoking it was most of the friction.
 */
const modulesCommand: Command = {
  name: "modules",
  summary:
    "List the figure modules: what each draws, what it needs installed, and " +
    "a command that runs it.",
  params: [],
  async run() {
    const lines: string[] = [];
    for (const module of MODULES) {
      const needs =
        module.dependencies.length === 0
          ? "no third-party dependencies"
          : `needs ${module.dependencies.join(", ")}`;
      lines.push(`${module.id} — ${module.summary} (${needs})`);
      if (module.shortcuts.length > 0) {
        lines.push(`  --name= ${module.shortcuts.join(" | ")}`);
      }
      for (const entry of module.entries) {
        lines.push(`  ${entry.path}${entry.note === undefined ? "" : ` — ${entry.note}`}`);
      }
      lines.push(`  node src/cli.ts module python --args "${exampleArgs(module)}"`);
      lines.push("");
    }
    lines.push(
      "The module declares what it drew; the core measures it. See modules/README.md " +
        "for the protocol, what is checked, and what is never checked.",
    );
    return { text: lines.join("\n"), data: MODULES, exitCode: 0 };
  },
};

const moduleCommand: Command = {
  name: "module",
  summary:
    "Run a figure module in another language and verify what it drew. " +
    "The module declares semantics; the core measures every coordinate itself.",
  params: [
    {
      name: "command",
      type: "string",
      description: "Executable to run, e.g. python.",
      required: true,
      positional: true,
    },
    {
      name: "args",
      type: "string[]",
      description: "Arguments passed to the module, comma-separated.",
    },
    { name: "width", type: "number", description: "Canvas width.", default: 720 },
    { name: "height", type: "number", description: "Canvas height.", default: 520 },
    { name: "out", type: "string", description: "Output directory.", short: "o", default: "out" },
  ],
  async run(args) {
    const { runAndVerifyModule } = await import("./modules/run.ts");
    const started = Date.now();
    const result = await runAndVerifyModule({
      command: String(args.command),
      args: toStringArray(args.args),
      input: { width: Number(args.width ?? 720), height: Number(args.height ?? 520) },
    });
    const elapsed = Date.now() - started;
    const { verification, output } = result;

    const failed = verification.checks.filter((check) => check.status === "fail");
    const lines: string[] = [
      `${verification.canvas.width} x ${verification.canvas.height}  ` +
        `${output.elements.length} declared  ${elapsed}ms`,
    ];
    for (const check of verification.checks) {
      const mark =
        check.status === "pass" ? "ok  " : check.status === "fail" ? "FAIL" : "n/a ";
      const examined = verification.coverage[check.id] ?? 0;
      lines.push(
        `  ${mark} ${check.id} (${examined} examined)` +
          `${check.detail === undefined ? "" : ` — ${check.detail}`}`,
      );
    }
    for (const note of output.notes ?? []) lines.push(`  note ${note}`);
    lines.push(
      "",
      "Checked for malformation, not misrepresentation: a reversed colour scale, " +
        "a misleading projection, or text at the wrong scale all pass silently.",
    );

    return {
      text: lines.join("\n"),
      data: { verification, svg: output.svg, elements: output.elements },
      exitCode: failed.length === 0 ? 0 : 2,
    };
  },
};

const diffCommand: Command = {
  name: "diff",
  summary:
    "Lay out two states of a figure and report what changed between them: " +
    "appeared, disappeared, moved, resized, restyled, retexted.",
  params: [
    {
      name: "before",
      type: "string",
      description: "Path to the first state.",
      required: true,
      positional: true,
    },
    {
      name: "after",
      type: "string",
      description: "Path to the second state.",
      required: true,
      positional: true,
    },
  ],
  async run(args) {
    const { diffFigures } = await import("./anim/diff.ts");
    const load = async (path: string) => {
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      return isPresetInput(parsed) ? expand(parsed) : parseSpec(parsed);
    };
    const [before, after] = await Promise.all([
      load(String(args.before)),
      load(String(args.after)),
    ]);
    const [renderedBefore, renderedAfter] = [
      await render(before, { repair: false }),
      await render(after, { repair: false }),
    ];
    const diff = diffFigures(renderedBefore.figure, renderedAfter.figure);

    const lines: string[] = [
      `${diff.persisted} element(s) persisted; ` +
        Object.entries(diff.counts)
          .filter(([, count]) => count > 0)
          .map(([kind, count]) => `${count} ${kind}`)
          .join(", "),
      "",
    ];
    for (const delta of diff.deltas) {
      if (delta.kind === "unchanged") continue;
      lines.push(
        `  ${delta.kind.padEnd(12)} ${delta.id}${delta.detail === undefined ? "" : `  ${delta.detail}`}`,
      );
    }
    if (!diff.expressible) {
      lines.push("", "NOT EXPRESSIBLE:");
      for (const problem of diff.unexplained) lines.push(`  ${problem}`);
    }

    return { text: lines.join("\n"), data: diff, exitCode: diff.expressible ? 0 : 2 };
  },
};

export const COMMANDS: Command[] = [
  renderCommand,
  selectCommand,
  presetsCommand,
  rulesCommand,
  effectsCommand,
  themesCommand,
  modulesCommand,
  moduleCommand,
  diffCommand,
];

export function commandByName(name: string): Command | undefined {
  return COMMANDS.find((command) => command.name === name);
}

export function toStringArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  // An array arrives pre-split and is taken verbatim, comma and all: either
  // the CLI's --flag was repeated (see parseArgs in cli.ts), which is how a
  // module argument containing its own comma -- e.g. --data=10,20,30 --
  // survives intact, or the MCP binding passed a real JSON array straight
  // from the caller. Only a bare string, the classic single-flag "a,b,c"
  // shorthand, gets comma-split.
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** JSON Schema for one command's parameters, used by the MCP binding. */
export function paramsToJsonSchema(command: Command): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const param of command.params) {
    properties[param.name] =
      param.type === "string[]"
        ? { type: "array", items: { type: "string" }, description: param.description }
        : { type: param.type, description: param.description };
    if (param.required === true) required.push(param.name);
  }
  return required.length > 0
    ? { type: "object", properties, required }
    : { type: "object", properties };
}
