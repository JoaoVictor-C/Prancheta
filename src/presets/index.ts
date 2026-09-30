/**
 * Presets.
 *
 * A preset is a MACRO, not a parallel pipeline: it takes a compact input and
 * expands it into ordinary IR. Everything downstream — measurement, checks,
 * repair, SVG, manifest — stays uniform and none of it knows presets exist.
 * That is what stops the repertoire turning into four half-engines.
 *
 * Each preset lives in its own directory beside its doc and fixtures, per
 * decision 0002: a preset is irreducibly code plus prose, and splitting the two
 * is how the pair ships half-updated.
 */

import { SpecError, parseSpec } from "../ir/types.ts";
import type { FigureSpec } from "../ir/types.ts";
import { PRESETS } from "../selection/vocabulary.ts";
import { STYLE_IDS } from "../effects/styles.ts";
import { TYPE_IDS } from "../typography.ts";
import * as v from "./validate.ts";
import type { PresetId } from "../selection/vocabulary.ts";
import { expandGraph, validateGraphInput } from "./graph/preset.ts";
import type { GraphInput } from "./graph/preset.ts";
import { expandMindmap, validateMindmapInput } from "./mindmap/preset.ts";
import type { MindmapInput } from "./mindmap/preset.ts";
import { expandAnnotatedFigure, validateAnnotatedFigureInput } from "./annotated-figure/preset.ts";
import type { AnnotatedFigureInput } from "./annotated-figure/preset.ts";
import { expandLabelledBlocks, validateLabelledBlocksInput } from "./labelled-blocks/preset.ts";
import type { LabelledBlocksInput } from "./labelled-blocks/preset.ts";
import { expandChart, validateChartInput } from "./chart/preset.ts";
import type { ChartInput } from "./chart/preset.ts";
import { expandFunctionGraph, validateFunctionGraphInput } from "./function-graph/preset.ts";
import type { FunctionGraphInput } from "./function-graph/preset.ts";
import { expandSignChart, validateSignChartInput } from "./sign-chart/preset.ts";
import type { SignChartInput } from "./sign-chart/preset.ts";
import { expandValueTable, validateValueTableInput } from "./value-table/preset.ts";
import type { ValueTableInput } from "./value-table/preset.ts";
import { expandNumberLine, validateNumberLineInput } from "./number-line/preset.ts";
import type { NumberLineInput } from "./number-line/preset.ts";
import { expandVectors, validateVectorsInput } from "./vectors/preset.ts";
import type { VectorsInput } from "./vectors/preset.ts";
import { expandUnitCircle, validateUnitCircleInput } from "./unit-circle/preset.ts";
import type { UnitCircleInput } from "./unit-circle/preset.ts";
import { expandConstruction, validateConstructionInput } from "./construction/preset.ts";
import type { ConstructionInput } from "./construction/preset.ts";
import { expandSpace, validateSpaceInput } from "./space/preset.ts";
import type { SpaceInput } from "./space/preset.ts";
import { expandSolid, validateSolidInput } from "./solid/preset.ts";
import type { SolidInput } from "./solid/preset.ts";
import { expandSurface, validateSurfaceInput } from "./surface/preset.ts";
import type { SurfaceInput } from "./surface/preset.ts";
import { expandRevolution, validateRevolutionInput } from "./revolution/preset.ts";
import type { RevolutionInput } from "./revolution/preset.ts";
import { expandField, validateFieldInput } from "./field/preset.ts";
import type { FieldInput } from "./field/preset.ts";
import { expandSequence, validateSequenceInput } from "./sequence/preset.ts";
import type { SequenceInput } from "./sequence/preset.ts";
import { expandLinearMap, validateLinearMapInput } from "./linear-map/preset.ts";
import type { LinearMapInput } from "./linear-map/preset.ts";
import { expandCircuit, validateCircuitInput } from "./circuit/preset.ts";
import type { CircuitInput } from "./circuit/preset.ts";
import { expandOptics, validateOpticsInput } from "./optics/preset.ts";
import type { OpticsInput } from "./optics/preset.ts";
import { expandAutomaton, validateAutomatonInput } from "./automaton/preset.ts";
import type { AutomatonInput } from "./automaton/preset.ts";
import { expandTruthTable, validateTruthTableInput } from "./truth-table/preset.ts";
import type { TruthTableInput } from "./truth-table/preset.ts";
import { expandLogicCircuit, validateLogicCircuitInput } from "./logic-circuit/preset.ts";
import type { LogicCircuitInput } from "./logic-circuit/preset.ts";
import { expandStatistics, validateStatisticsInput } from "./statistics/preset.ts";
import type { StatisticsInput } from "./statistics/preset.ts";
import { expandDistribution, validateDistributionInput } from "./distribution/preset.ts";
import type { DistributionInput } from "./distribution/preset.ts";
import { expandProbabilityTree, validateProbabilityTreeInput } from "./probability-tree/preset.ts";
import type { ProbabilityTreeInput } from "./probability-tree/preset.ts";
import { expandVenn, validateVennInput } from "./venn/preset.ts";
import type { VennInput } from "./venn/preset.ts";
import { expandAcidBase, validateAcidBaseInput } from "./acid-base/preset.ts";
import type { AcidBaseInput } from "./acid-base/preset.ts";

/**
 * Every preset input may also name a style pack and a theme. They are declared
 * here rather than on each of the five inputs because they are not a preset's
 * business: a preset decides what the figure IS, and these decide what it looks
 * like. Attaching them in one place also means a sixth preset gets them free.
 */
export type CommonPresetOptions = {
  /** Style pack, applied by role. See src/effects/styles.ts. */
  style?: string;
  /** Named palette. */
  theme?: "dark" | "light" | "print";
  /** Type pack. See src/typography.ts. */
  type?: string;
  /**
   * false: draw what an exercise GIVES and nothing it ASKS for -- no solved
   * current, no image position, no probability, no count in a region, no
   * filled-in table cell. The same input with answers left on is the
   * solution's figure. A sheet sets it to false on every statement figure of
   * a preset that honours it (ANSWER_AWARE). Default true.
   */
  answers?: boolean;
};

/**
 * The presets that compute an answer an exercise could ask for, and draw
 * without it under `answers: false`. A preset outside this list refuses the
 * option rather than ignoring it.
 */
export const ANSWER_AWARE: readonly string[] = [
  "value-table", "sign-chart", "number-line", "vectors", "unit-circle",
  "construction", "space", "solid", "surface", "revolution", "field", "sequence", "linear-map",
  "circuit", "optics", "automaton", "truth-table", "logic-circuit",
  "statistics", "distribution", "probability-tree", "venn", "acid-base",
];

export type PresetInput = (
  | ({ preset: "graph" } & GraphInput)
  | ({ preset: "mindmap" } & MindmapInput)
  | ({ preset: "annotated-figure" } & AnnotatedFigureInput)
  | ({ preset: "labelled-blocks" } & LabelledBlocksInput)
  | ({ preset: "chart" } & ChartInput)
  | ({ preset: "function-graph" } & FunctionGraphInput)
  | ({ preset: "sign-chart" } & SignChartInput)
  | ({ preset: "value-table" } & ValueTableInput)
  | ({ preset: "number-line" } & NumberLineInput)
  | ({ preset: "vectors" } & VectorsInput)
  | ({ preset: "unit-circle" } & UnitCircleInput)
  | ({ preset: "construction" } & ConstructionInput)
  | ({ preset: "space" } & SpaceInput)
  | ({ preset: "solid" } & SolidInput)
  | ({ preset: "surface" } & SurfaceInput)
  | ({ preset: "revolution" } & RevolutionInput)
  | ({ preset: "field" } & FieldInput)
  | ({ preset: "sequence" } & SequenceInput)
  | ({ preset: "linear-map" } & LinearMapInput)
  | ({ preset: "circuit" } & CircuitInput)
  | ({ preset: "optics" } & OpticsInput)
  | ({ preset: "automaton" } & AutomatonInput)
  | ({ preset: "truth-table" } & TruthTableInput)
  | ({ preset: "logic-circuit" } & LogicCircuitInput)
  | ({ preset: "statistics" } & StatisticsInput)
  | ({ preset: "distribution" } & DistributionInput)
  | ({ preset: "probability-tree" } & ProbabilityTreeInput)
  | ({ preset: "venn" } & VennInput)
  | ({ preset: "acid-base" } & AcidBaseInput)
) &
  CommonPresetOptions;

export function expand(input: PresetInput): FigureSpec {
  const spec = expandPreset(input);
  if (input.style === undefined && input.theme === undefined && input.type === undefined) {
    return spec;
  }
  return {
    ...spec,
    canvas: {
      ...spec.canvas,
      ...(input.style === undefined ? {} : { style: input.style }),
      ...(input.theme === undefined ? {} : { theme: input.theme }),
      ...(input.type === undefined ? {} : { type: input.type }),
    },
  };
}

function expandPreset(input: PresetInput): FigureSpec {
  switch (input.preset) {
    case "graph":
      return expandGraph(input);
    case "mindmap":
      return expandMindmap(input);
    case "annotated-figure":
      return expandAnnotatedFigure(input);
    case "labelled-blocks":
      return expandLabelledBlocks(input);
    case "chart":
      return expandChart(input);
    case "function-graph":
      return expandFunctionGraph(input);
    case "sign-chart":
      return expandSignChart(input);
    case "value-table":
      return expandValueTable(input);
    case "number-line":
      return expandNumberLine(input);
    case "vectors":
      return expandVectors(input);
    case "unit-circle":
      return expandUnitCircle(input);
    case "construction":
      return expandConstruction(input);
    case "space":
      return expandSpace(input);
    case "solid":
      return expandSolid(input);
    case "surface":
      return expandSurface(input);
    case "revolution":
      return expandRevolution(input);
    case "field":
      return expandField(input);
    case "sequence":
      return expandSequence(input);
    case "linear-map":
      return expandLinearMap(input);
    case "circuit":
      return expandCircuit(input);
    case "optics":
      return expandOptics(input);
    case "automaton":
      return expandAutomaton(input);
    case "truth-table":
      return expandTruthTable(input);
    case "logic-circuit":
      return expandLogicCircuit(input);
    case "statistics":
      return expandStatistics(input);
    case "distribution":
      return expandDistribution(input);
    case "probability-tree":
      return expandProbabilityTree(input);
    case "venn":
      return expandVenn(input);
    case "acid-base":
      return expandAcidBase(input);
  }
}

/**
 * Refuse a preset input the expanders cannot honestly consume.
 *
 * One function per preset, each living beside the expander it guards, so a new
 * field is edited in a directory whose siblings are already tested for
 * agreement (ADR 0002). Nothing MECHANICALLY forces a new optional field to
 * gain a clause here -- that limit is real and is recorded in ADR 0018 rather
 * than papered over.
 */
export function validatePresetInput(input: PresetInput): void {
  const raw = input as unknown as Record<string, unknown>;
  // The common options first, so a bad style name is refused by name rather
  // than reaching the renderer as an unknown pack that silently does nothing.
  v.optionalEnum(raw, "style", input.preset, STYLE_IDS);
  v.optionalEnum(raw, "theme", input.preset, ["dark", "light", "print"]);
  v.optionalEnum(raw, "type", input.preset, TYPE_IDS);
  if (raw.answers !== undefined) {
    if (typeof raw.answers !== "boolean") throw new SpecError(`${input.preset}.answers must be true or false`);
    if (!ANSWER_AWARE.includes(input.preset)) {
      throw new SpecError(`${input.preset}.answers: this preset draws no computed answer to hide -- write the question's figure as its own input`);
    }
  }
  return validateOwn(input.preset, stripCommon(raw));
}

/** The common options are checked above; each preset's own validator sees only its own fields. */
function stripCommon(raw: Record<string, unknown>): Record<string, unknown> {
  const { answers: _answers, ...rest } = raw;
  return rest;
}

function validateOwn(preset: PresetInput["preset"], raw: Record<string, unknown>): void {
  const input = { preset } as PresetInput;
  switch (input.preset) {
    case "graph":
      return validateGraphInput(raw);
    case "mindmap":
      return validateMindmapInput(raw);
    case "annotated-figure":
      return validateAnnotatedFigureInput(raw);
    case "labelled-blocks":
      return validateLabelledBlocksInput(raw);
    case "chart":
      return validateChartInput(raw);
    case "function-graph":
      return validateFunctionGraphInput(raw);
    case "sign-chart":
      return validateSignChartInput(raw);
    case "value-table":
      return validateValueTableInput(raw);
    case "number-line":
      return validateNumberLineInput(raw);
    case "vectors":
      return validateVectorsInput(raw);
    case "unit-circle":
      return validateUnitCircleInput(raw);
    case "construction":
      return validateConstructionInput(raw);
    case "space":
      return validateSpaceInput(raw);
    case "solid":
      return validateSolidInput(raw);
    case "surface":
      return validateSurfaceInput(raw);
    case "revolution":
      return validateRevolutionInput(raw);
    case "field":
      return validateFieldInput(raw);
    case "sequence":
      return validateSequenceInput(raw);
    case "linear-map":
      return validateLinearMapInput(raw);
    case "circuit":
      return validateCircuitInput(raw);
    case "optics":
      return validateOpticsInput(raw);
    case "automaton":
      return validateAutomatonInput(raw);
    case "truth-table":
      return validateTruthTableInput(raw);
    case "logic-circuit":
      return validateLogicCircuitInput(raw);
    case "statistics":
      return validateStatisticsInput(raw);
    case "distribution":
      return validateDistributionInput(raw);
    case "probability-tree":
      return validateProbabilityTreeInput(raw);
    case "venn":
      return validateVennInput(raw);
    case "acid-base":
      return validateAcidBaseInput(raw);
  }
}

export function isPresetInput(value: unknown): value is PresetInput {
  if (typeof value !== "object" || value === null) return false;
  const preset = (value as { preset?: unknown }).preset;
  return (
    preset === "graph" ||
    preset === "mindmap" ||
    preset === "annotated-figure" ||
    preset === "labelled-blocks" ||
    preset === "chart" ||
    preset === "function-graph" ||
    preset === "sign-chart" ||
    preset === "value-table" ||
    preset === "number-line" ||
    preset === "vectors" ||
    preset === "unit-circle" ||
    preset === "construction" ||
    preset === "space" ||
    preset === "solid" ||
    preset === "surface" ||
    preset === "revolution" ||
    preset === "field" ||
    preset === "sequence" ||
    preset === "linear-map" ||
    preset === "circuit" ||
    preset === "optics" ||
    preset === "automaton" ||
    preset === "truth-table" ||
    preset === "logic-circuit" ||
    preset === "statistics" ||
    preset === "distribution" ||
    preset === "probability-tree" ||
    preset === "venn" ||
    preset === "acid-base"
  );
}

export type {
  GraphInput,
  MindmapInput,
  AnnotatedFigureInput,
  LabelledBlocksInput,
  ChartInput,
  FunctionGraphInput,
  SignChartInput,
  ValueTableInput,
  NumberLineInput,
  VectorsInput,
  UnitCircleInput,
  ConstructionInput,
  SpaceInput,
  SolidInput,
  SurfaceInput,
  RevolutionInput,
  FieldInput,
  SequenceInput,
  LinearMapInput,
  CircuitInput,
  OpticsInput,
  AutomatonInput,
  TruthTableInput,
  LogicCircuitInput,
  StatisticsInput,
  DistributionInput,
  ProbabilityTreeInput,
  VennInput,
  AcidBaseInput,
};
export type { PresetId };

/**
 * The one place a parsed JSON document becomes a FigureSpec.
 *
 * Four call sites had independently written `isPresetInput(parsed) ?
 * expand(parsed) : parseSpec(parsed)` -- three in commands.ts (render, and
 * both sides of diff) and one in anim/sequence.ts. Four copies of a dispatch
 * is four places a new guard has to be remembered, and the animate path was
 * the one that got forgotten: an N-state sequence validated nothing, and paid
 * a browser launch per state before saying so.
 *
 * The ternary also had a hole neither copy could see. `isPresetInput` returns
 * false for an unknown preset, so `{"preset": "flowchart"}` fell through to
 * the raw-IR validator and came back as `spec.version must be 1, got
 * undefined` -- the IR parser answering a question nobody asked it, about the
 * exact request this project exists to intercept.
 */
export function parseFigureInput(parsed: unknown): FigureSpec {
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const preset = (parsed as { preset?: unknown }).preset;
    if (preset !== undefined) {
      if (!isPresetInput(parsed)) throw unknownPreset(preset);
      validatePresetInput(parsed);
      return expand(parsed);
    }
    if ((parsed as { version?: unknown }).version === undefined) throw neitherShape();
  }
  return parseSpec(parsed);
}

/**
 * Named by what was asked for, not by what the parser wanted. The repertoire
 * is listed because an agent that guessed "flowchart" has no other way to
 * learn what it may guess instead, and `select` is named because guessing is
 * the failure -- a flowchart renders beautifully and is still the wrong
 * answer when the content is not a graph.
 */
function unknownPreset(preset: unknown): SpecError {
  const known = PRESETS.filter((entry) => entry.implemented).map((entry) => entry.id);
  const name = JSON.stringify(preset);
  const graphNote =
    typeof preset === "string" && /flow|chart|diagram|flowchart/i.test(preset)
      ? `\nA flowchart is what \`graph\` draws -- but reach for it because the content ` +
        `has entities and relations, not because it is available.`
      : "";
  return new SpecError(
    `no preset named ${name}. The repertoire is: ${known.join(", ")}.\n` +
      `Run \`select\` with what the content is and how it must be drawn; it answers with ` +
      `a preset, a composition of two, or "no preset fits -- author raw IR".${graphNote}`,
  );
}

/** Neither shape, said as both -- rather than complaining about one of them. */
function neitherShape(): SpecError {
  const known = PRESETS.filter((entry) => entry.implemented).map((entry) => entry.id);
  return new SpecError(
    `this is neither a preset input nor a version-1 IR document: it has no "preset" ` +
      `and no "version". Add "preset" (one of: ${known.join(", ")}) to use the preset ` +
      `layer, or "version": 1 to author raw IR.`,
  );
}
