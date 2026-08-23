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

import type { FigureSpec } from "../ir/types.ts";
import type { PresetId } from "../selection/vocabulary.ts";
import { expandGraph } from "./graph/preset.ts";
import type { GraphInput } from "./graph/preset.ts";
import { expandMindmap } from "./mindmap/preset.ts";
import type { MindmapInput } from "./mindmap/preset.ts";
import { expandAnnotatedFigure } from "./annotated-figure/preset.ts";
import type { AnnotatedFigureInput } from "./annotated-figure/preset.ts";
import { expandLabelledBlocks } from "./labelled-blocks/preset.ts";
import type { LabelledBlocksInput } from "./labelled-blocks/preset.ts";
import { expandChart } from "./chart/preset.ts";
import type { ChartInput } from "./chart/preset.ts";

export type PresetInput =
  | ({ preset: "graph" } & GraphInput)
  | ({ preset: "mindmap" } & MindmapInput)
  | ({ preset: "annotated-figure" } & AnnotatedFigureInput)
  | ({ preset: "labelled-blocks" } & LabelledBlocksInput)
  | ({ preset: "chart" } & ChartInput);

export function expand(input: PresetInput): FigureSpec {
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
    preset === "chart"
  );
}

export type { GraphInput, MindmapInput, AnnotatedFigureInput, LabelledBlocksInput, ChartInput };
export type { PresetId };
