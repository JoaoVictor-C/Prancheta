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
import { SpecError, parseSpec } from "./ir/types.ts";
import type { FigureNode } from "./ir/types.ts";
import { isPresetInput, parseFigureInput } from "./presets/index.ts";
import { render } from "./pipeline.ts";
import type { RenderOptions } from "./pipeline.ts";
import { rank } from "./selection/rank.ts";
import { FLOOR, RULES } from "./selection/rules.ts";
import { DOMAIN, IDIOM, PRESETS, STRUCTURE, partitionPredicates } from "./selection/vocabulary.ts";
import { EFFECT_NAMES, EFFECT_PRESETS, resolveEffects } from "./effects/types.ts";
import { STYLE_IDS, STYLE_PACKS } from "./effects/styles.ts";
import { TYPE_IDS, TYPE_LEVELS, TYPE_PACKS, hostDependentLevels, isSelfContained } from "./typography.ts";
import { MODULES, exampleArgs } from "./modules/repertoire.ts";
import { bleedOf, isEmpty as bleedIsEmpty } from "./effects/bleed.ts";
import { THEMES } from "./theme.ts";
import { WCAG_AA_NORMAL, contrastRatio } from "./colour/contrast.ts";

const NEWLINE = String.fromCharCode(10);

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
    const spec = parseFigureInput(parsed);

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
    {
      name: "domain",
      type: "string[]",
      description:
        `Subject matter no preset can compute, which reaches a figure module instead. ` +
        `One or more of: ${DOMAIN.join(", ")}.`,
    },
  ],
  async run(args) {
    const predicates = partitionPredicates({
      structure: toStringArray(args.structure),
      idiom: toStringArray(args.idiom),
      domain: toStringArray(args.domain),
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
    if (selection.delegates.length > 0) {
      lines.push("", "delegates:");
      for (const delegate of selection.delegates) {
        lines.push(
          `  ${delegate.module}: ${delegate.score >= FLOOR ? "viable" : "below floor"} (${delegate.score}) [${delegate.cited.join(", ")}] — ${delegate.summary}`,
        );
      }
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
      return parseFigureInput(parsed);
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

const animateCommand: Command = {
  name: "animate",
  summary:
    "Tween a sequence of two or more states of a figure into an animated SVG: eased " +
    "position for moved boxes, crossfades for those arriving and leaving, optional " +
    "per-element stagger, and a motion check that models what the renderer actually " +
    "does at every transition and every state boundary.",
  params: [
    {
      name: "states",
      type: "string[]",
      description:
        "Paths to each state, in order. Two states is a single transition; more is a " +
        "checked sequence (ADR 0016) -- every consecutive pair needs at least one " +
        "persisting element, or the run is refused as two unrelated figures rather than one evolving.",
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
    {
      name: "durationMs",
      type: "number",
      description: "Transition length in milliseconds.",
      default: 500,
    },
    {
      name: "delayMs",
      type: "number",
      description: "Hold on the first state before the transition starts.",
      default: 0,
    },
    {
      name: "easing",
      type: "string",
      description:
        "CSS timing function: linear, ease, ease-in, ease-out, ease-in-out, or " +
        "cubic-bezier(x1,y1,x2,y2). Must be non-decreasing; overshoot is refused.",
      default: "linear",
    },
    {
      name: "loop",
      type: "boolean",
      description: "Repeat forever instead of settling on the second state.",
      default: false,
    },
  ],
  async run(args) {
    const { parseEasing } = await import("./anim/easing.ts");

    // Validated before anything is rendered: a duration the browser rejects
    // makes the whole <style> block inert, so the manifest would report a
    // transition over an SVG that never moves.
    const durationMs = Number(args.durationMs ?? 500);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new SpecError(
        `animate: --durationMs must be a positive number of milliseconds, got ${String(args.durationMs)}`,
      );
    }
    const delayMs = Number(args.delayMs ?? 0);
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new SpecError(
        `animate: --delayMs must be zero or a positive number of milliseconds, got ${String(args.delayMs)}`,
      );
    }
    const easing = parseEasing(String(args.easing ?? "linear"));

    const states = toStringArray(args.states);
    if (states.length < 2) {
      throw new SpecError(`animate: needs at least 2 states, got ${states.length}`);
    }

    // Three or more states: a checked sequence (ADR 0016, M14). Its own
    // module owns the piecewise machinery -- every function it calls per
    // segment is the exact two-state pipeline below, unchanged, run once per
    // consecutive pair rather than once for the whole command.
    if (states.length > 2) {
      const { animateSequence } = await import("./anim/sequence.ts");
      const result = await animateSequence(states, {
        durationMs,
        delayMs,
        easing,
        loop: args.loop === true,
      });

      const manifest = {
        version: 1 as const,
        states: result.states.map((state) => state.rendered.manifest),
        segments: result.segments.map((segment) => ({
          from: segment.index,
          to: segment.index + 1,
          persisted: segment.diff.persisted,
          counts: segment.diff.counts,
        })),
        transitionChecks: result.transitionChecks,
        disclosed: result.disclosed,
        ok: result.ok,
      };

      const totalPersisted = result.segments.reduce((sum, segment) => sum + segment.diff.persisted, 0);
      const totalTweened = result.segments.reduce((sum, segment) => sum + segment.timeline.moved.length, 0);
      const totalFadedIn = result.segments.reduce(
        (sum, segment) => sum + segment.timeline.faded.filter((fade) => fade.direction === "in").length,
        0,
      );
      const totalFadedOut = result.segments.reduce(
        (sum, segment) => sum + segment.timeline.faded.filter((fade) => fade.direction === "out").length,
        0,
      );
      const lines: string[] = [
        `${states.length} states, ${result.segments.length} transition(s) at ${durationMs}ms each ` +
          `(${durationMs * result.segments.length}ms total), ${totalPersisted} persisted-element ` +
          `boundary crossing(s), ${totalTweened} tweened, ${totalFadedIn} faded in, ${totalFadedOut} faded out`,
      ];
      for (const check of result.transitionChecks) {
        const mark = check.status === "pass" ? "ok  " : check.status === "fail" ? "FAIL" : "n/a ";
        lines.push(
          `  ${mark} ${check.id} [${check.target}]${check.detail === undefined ? "" : ` — ${check.detail}`}`,
        );
      }
      if (result.disclosed.hardCut.length > 0) {
        lines.push(
          `  !    ${result.disclosed.hardCut.join(", ")} moved but also changed size, style or text at some ` +
            `boundary, so ${result.disclosed.hardCut.length === 1 ? "it hard-cuts" : "they hard-cut"} there ` +
            `rather than tweening (diff.ts gives an element one delta kind per segment; ADR 0013)`,
        );
      }
      if (result.disclosed.clippedOnExit.length > 0) {
        lines.push(
          `  !    ${result.disclosed.clippedOnExit.join(", ")} fades out beyond the canvas at the state it ` +
            `leaves from, so ${result.disclosed.clippedOnExit.length === 1 ? "it is" : "they are"} clipped while leaving`,
        );
      }
      result.states.forEach((state, index) => {
        if (!state.rendered.manifest.ok) {
          const authored = index === 0 || index === result.states.length - 1 ? " as authored" : "";
          lines.push(`  FAIL one or more checks on state ${index}${authored} (see manifest.states[${index}])`);
        }
      });
      if (!result.ok) {
        lines.push("  !    no repair strategy for this check — translation repair is not wired (M10 debt)");
      }

      return { text: lines.join("\n"), data: { manifest, svg: result.svg }, exitCode: result.ok ? 0 : 2 };
    }

    // Exactly two states: the original M11-M13 path, unchanged, so every
    // already-verified test keeps asserting on the exact output it always has.
    const { diffFigures } = await import("./anim/diff.ts");
    const { validateAnimationSpecs, buildTimeline } = await import("./anim/timeline.ts");
    const { boxesDoNotOverlapDuringTransition, connectorsClearOfBoxesDuringTransition } =
      await import("./anim/checks.ts");
    const { renderedRoutes } = await import("./anim/route.ts");
    const { renderedTrajectories, requireLinearWhenStaggered } = await import("./anim/trajectory.ts");
    const { emitAnimatedSvg } = await import("./anim/emit.ts");
    const { toSvg } = await import("./render/svg.ts");

    const load = async (path: string) => {
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      return parseFigureInput(parsed);
    };
    const [before, after] = await Promise.all([
      load(states[0]!),
      load(states[1]!),
    ]);
    // Repair disabled, same reasoning as `diff`: repair moves boxes for
    // reasons that have nothing to do with the author's two authored states,
    // and animating a repair artefact would confuse the very thing this
    // command exists to verify.
    const [renderedBefore, renderedAfter] = [
      await render(before, { repair: false }),
      await render(after, { repair: false }),
    ];
    const diff = diffFigures(renderedBefore.figure, renderedAfter.figure);

    // Both guards throw SpecError on the first violation; that propagates to
    // the CLI's own SpecError handling, same as an invalid spec would.
    validateAnimationSpecs(before, after, diff, renderedBefore.figure, renderedAfter.figure);

    const timeline = buildTimeline(diff, renderedBefore.figure, renderedAfter.figure);

    // One derivation of the motion, read by the check here and by the emitter
    // below (ADR 0013). M11 let those two derive it separately and they
    // disagreed.
    const trajectories = renderedTrajectories(renderedAfter.figure, timeline, renderedBefore.figure);
    // Guard 3: a staggered figure must be linear, or the check stops being
    // exact about what the browser will draw (ADR 0015).
    requireLinearWhenStaggered(trajectories, easing);

    const routes = renderedRoutes(renderedAfter.figure, renderedBefore.figure);
    const frames = { after: renderedAfter.figure, before: renderedBefore.figure };
    const transitionChecks = [
      ...boxesDoNotOverlapDuringTransition(trajectories, frames),
      ...connectorsClearOfBoxesDuringTransition(routes, trajectories, frames),
    ];

    // Disclosure, not refusal (ADR 0013). Three things the timeline or the
    // docs used to claim that the renderer does not do; naming them is cheaper
    // than refusing specs that are perfectly legitimate.
    const hardCut = [...trajectories.values()]
      .filter((trajectory) => !trajectory.tweened)
      .filter((trajectory) => {
        const previous = renderedBefore.figure.elements.find((e) => e.id === trajectory.id);
        return (
          previous !== undefined &&
          previous.kind === "box" &&
          (Math.abs(previous.x - trajectory.to.x) > 0.5 || Math.abs(previous.y - trajectory.to.y) > 0.5)
        );
      })
      .map((trajectory) => trajectory.id)
      .sort();
    // What actually leaves the canvas, as opposed to what the timeline names:
    // an element disappears, and it is drawn at its first-state place and
    // faded out (ADR 0014). One that sits outside the second state's canvas is
    // clipped there, and that is worth saying rather than letting the reader
    // assume they saw it go.
    const leavingIds = new Set(
      timeline.faded.filter((fade) => fade.direction === "out").map((fade) => fade.id),
    );
    const leaving = renderedBefore.figure.elements.filter((element) => leavingIds.has(element.id));
    const clippedOnExit = leaving
      .filter((element) => element.kind === "box")
      .filter((element) => {
        const box = element as Extract<typeof element, { kind: "box" }>;
        return (
          box.x < 0 ||
          box.y < 0 ||
          box.x + box.width > renderedAfter.figure.width ||
          box.y + box.height > renderedAfter.figure.height
        );
      })
      .map((element) => element.id)
      .sort();

    // The base SVG is the second state plus what is on its way out, drawn
    // underneath so departing content never obscures what is arriving.
    const drawn = {
      ...renderedAfter.figure,
      elements: [...leaving, ...renderedAfter.figure.elements],
    };
    const baseSvg =
      leaving.length === 0 ? renderedAfter.svg : toSvg(drawn, renderedAfter.effectiveSpec.title);

    const svg = emitAnimatedSvg(baseSvg, drawn, trajectories, routes, {
      durationMs,
      delayMs,
      easing,
      loop: args.loop === true,
    });

    const ok =
      renderedBefore.manifest.ok &&
      renderedAfter.manifest.ok &&
      transitionChecks.every((check) => check.status !== "fail");

    const manifest = {
      version: 1 as const,
      before: renderedBefore.manifest,
      after: renderedAfter.manifest,
      diff: { persisted: diff.persisted, counts: diff.counts },
      transitionChecks,
      disclosed: { hardCut, clippedOnExit },
      ok,
    };

    const fadedIn = timeline.faded.length - leavingIds.size;
    const lines: string[] = [
      `${diff.persisted} element(s) persisted, ` +
        `${timeline.moved.length} tweened, ${fadedIn} faded in, ${leavingIds.size} faded out`,
    ];
    for (const check of transitionChecks) {
      const mark = check.status === "pass" ? "ok  " : check.status === "fail" ? "FAIL" : "n/a ";
      lines.push(
        `  ${mark} ${check.id} [${check.target}]${check.detail === undefined ? "" : ` — ${check.detail}`}`,
      );
    }
    if (hardCut.length > 0) {
      lines.push(
        `  !    ${hardCut.join(", ")} moved but also changed size, style or text, so ${hardCut.length === 1 ? "it hard-cuts" : "they hard-cut"} ` +
          `rather than tweening (diff.ts gives an element one delta kind; ADR 0013)`,
      );
    }
    if (clippedOnExit.length > 0) {
      lines.push(
        `  !    ${clippedOnExit.join(", ")} fades out beyond the second state's canvas, so ${clippedOnExit.length === 1 ? "it is" : "they are"} clipped while leaving`,
      );
    }
    // manifest.before reports on the AUTHORED first state, which is not a
    // frame this animation ever renders: at t=0 every untweened box already
    // sits at its second-state position. Worth checking, worth not confusing
    // with the transition.
    if (!renderedBefore.manifest.ok) lines.push("  FAIL one or more checks on the first state as authored (see manifest.before; it is not a rendered frame)");
    if (!renderedAfter.manifest.ok) lines.push("  FAIL one or more checks on the second state (see manifest.after)");
    if (!ok) lines.push("  !    no repair strategy for this check — translation repair is not wired (M10 debt)");

    return { text: lines.join("\n"), data: { manifest, svg }, exitCode: ok ? 0 : 2 };
  },
};


/**
 * `validate` -- the document, never the figure.
 *
 * The limit leads the summary rather than trailing it, and deliberately. The
 * generated command tables in AGENTS.md and SKILL.md print only the first
 * sentence, and an agent that reads "validate" and stops has learned exactly
 * the wrong lesson: overlap, contrast, text fit and every unrepaired defect
 * are measured from a real render, and this command never launches one. It
 * answers "can this be drawn at all", so that `render` is paid for once
 * instead of once per typo.
 */
const validateCommand: Command = {
  name: "validate",
  summary:
    "Check a spec or preset input WITHOUT drawing it -- shape, references and " +
    "arithmetic only, never whether the figure is any good. Overlap, contrast and " +
    "text fit are measured from a real render, so `render` still has to run.",
  params: [
    {
      name: "spec",
      type: "string",
      description: "Path to a JSON file holding raw figure IR or a preset input.",
      required: true,
      positional: true,
    },
  ],
  async run(args) {
    const specPath = String(args.spec);
    const parsed: unknown = JSON.parse(await readFile(specPath, "utf8"));
    const spec = parseFigureInput(parsed);

    const shape = isPresetInput(parsed) ? `preset ${parsed.preset}` : "raw IR";
    return {
      text:
        `ok   ${shape}, ${countNodes(spec.root)} element(s) after expansion\n` +
        `     Nothing here is a claim about the drawing. Run \`render\` for the checks.`,
      data: { spec },
      exitCode: 0,
    };
  },
};

/** Elements the expansion produced -- a number worth seeing before drawing it. */
function countNodes(node: FigureNode): number {
  let total = 1;
  const children = (node as { children?: FigureNode[] }).children;
  if (Array.isArray(children)) for (const child of children) total += countNodes(child);
  return total;
}


/**
 * `styles` -- the pack repertoire, with the reach each one costs.
 *
 * The bleed numbers are the point, not decoration on the listing. A pack that
 * puts ink 30px past every primary's own edge needs that much room on the
 * canvas, and an author choosing between packs is choosing between those costs.
 */
const stylesCommand: Command = {
  name: "styles",
  summary:
    "List the style packs: a whole look applied by role, so an effect is named " +
    "once for a figure rather than written on every element by hand. A pack only " +
    "fills in what an element did not declare, and is checked exactly as a " +
    "hand-written effect is.",
  params: [],
  async run() {
    const lines: string[] = [];
    for (const pack of STYLE_PACKS) {
      lines.push(`${pack.id} — ${pack.summary}`);
      for (const [role, effect] of Object.entries(pack.roles)) {
        const names = Array.isArray(effect) ? effect : [effect];
        const resolved = resolveEffects(names);
        const bleed = bleedOf(resolved);
        const reach = bleedIsEmpty(bleed)
          ? "stays inside its own bounds"
          : `bleeds left ${bleed.left} top ${bleed.top} right ${bleed.right} bottom ${bleed.bottom}`;
        lines.push(`  ${role.padEnd(8)} ${String(names.join(" + ")).padEnd(16)} ${reach}`);
      }
      if (pack.vignette !== undefined) {
        lines.push(`  ${"canvas".padEnd(8)} vignette ${pack.vignette}`);
      }
      lines.push("");
    }
    lines.push(
      'Set canvas.style in a spec ("' +
        STYLE_IDS.join('" | "') +
        '") to apply one. A block that declares its own `effect` keeps it — a pack is a',
    );
    lines.push(
      "default, never an override — and `callout` is never styled, because a callout carries",
    );
    lines.push("no fill or border by design. Unset renders exactly as before packs existed.");
    return { text: lines.join("\n") };
  },
};


/**
 * `type` -- the typography repertoire.
 *
 * Reports self-contained vs host-dependent per pack, because that is the one
 * thing a caller cannot see from the output: a pack naming a Didone draws
 * beautifully here and falls back to Georgia on a machine without it, and a
 * figure that reflows on someone else's computer is a portability defect this
 * project already takes seriously (see fontEmbed, and resolvePlatformFonts).
 */
const typeCommand: Command = {
  name: "type",
  summary:
    "List the type packs: family, size, weight and tracking for each `level` an " +
    "element can declare. `level` is how LOUD text is and is independent of `role`, " +
    "which is what it MEANS -- a warning caption is both at once.",
  params: [],
  async run() {
    const lines: string[] = [];
    for (const pack of TYPE_PACKS) {
      const dependent = hostDependentLevels(pack);
      const where = isSelfContained(pack)
        ? "self-contained — every face bundled, draws identically anywhere"
        : `host-dependent at ${dependent.join(", ")} — those first choices may fall back`;
      lines.push(`${pack.id} — ${pack.summary}`);
      lines.push(`  ${where}`);
      for (const level of TYPE_LEVELS) {
        const step = pack.levels[level];
        const bits = [
          `${step.size}px`,
          step.weight === undefined ? "" : `w${step.weight}`,
          step.letterSpacing === undefined ? "" : `tracking ${step.letterSpacing}px`,
        ].filter((bit) => bit !== "");
        lines.push(
          `  ${level.padEnd(9)} ${bits.join("  ").padEnd(30)} ${step.family.split(",")[0]}`,
        );
      }
      lines.push("");
    }
    lines.push(
      'Set canvas.type in a spec ("' + TYPE_IDS.join('" | "') + '"), or `type` on a preset input.',
    );
    lines.push(
      "An element declares `level` for how loud it is; one that declares none is set as body.",
    );
    lines.push(
      "A pack fills only what an element did not declare, and tracking is applied in the HTML",
    );
    lines.push("mirror too, so the width Chromium measured is the width that gets drawn.");
    return { text: lines.join(NEWLINE) };
  },
};

export const COMMANDS: Command[] = [
  renderCommand,
  validateCommand,
  selectCommand,
  presetsCommand,
  rulesCommand,
  effectsCommand,
  themesCommand,
  stylesCommand,
  typeCommand,
  modulesCommand,
  moduleCommand,
  diffCommand,
  animateCommand,
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
