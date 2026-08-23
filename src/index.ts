/**
 * Library entry point — the contract holder (decision 0002).
 *
 * Everything else (CLI, MCP adapter, skill) is a binding over this.
 */

export { render, toLaidOutFigure } from "./pipeline.ts";
export type { RenderResult, RenderOptions } from "./pipeline.ts";
export { parseSpec, SpecError } from "./ir/types.ts";
export type {
  FigureSpec,
  FigureNode,
  Block,
  Stack,
  LaidOutFigure,
  PlacedElement,
  PlacedBox,
  PlacedText,
  TextLine,
  Rect,
} from "./ir/types.ts";
export { buildManifest } from "./manifest.ts";
export type { Manifest, ManifestElement, ManifestOptions } from "./manifest.ts";
export { normalise, cloneNormalised } from "./ir/normalise.ts";
export type { NodeIndex } from "./ir/normalise.ts";
export { runChecks, overflowOf, unionOf, EPSILON } from "./checks.ts";
export type { Check, CheckId, Overflow } from "./checks.ts";
export { applyEdits, isMonotone, newBudget, planRepairs, planWrapFallback } from "./repair.ts";
export type { RepairEdit, RepairBudget, RepairPlan } from "./repair.ts";
export { rank, replayMatches } from "./selection/rank.ts";
export type { Selection, Candidate } from "./selection/rank.ts";
export { RULES, FLOOR, ruleById } from "./selection/rules.ts";
export type { Rule } from "./selection/rules.ts";
export {
  STRUCTURE,
  IDIOM,
  PRESETS,
  partitionPredicates,
  isStructure,
  isIdiom,
} from "./selection/vocabulary.ts";
export type { Structure, Idiom, PresetId, Predicates } from "./selection/vocabulary.ts";
export { toSvg } from "./render/svg.ts";
export { theme, palette } from "./theme.ts";
export {
  EFFECT_PRESETS,
  EFFECT_NAMES,
  EffectError,
  appliesToLabel,
  labelChain,
  resolveEffects,
} from "./effects/types.ts";
export type { Effect, EffectKind, EffectRef, ResolvedEffect } from "./effects/types.ts";
export {
  bleedOf,
  filterRegion,
  gaussianExtent,
  inkBounds,
  needsFilter,
  sigmaOf,
  unionRects,
  GAUSSIAN_EXTENT_SIGMAS,
  NO_BLEED,
  REGION_PAD,
} from "./effects/bleed.ts";
export type { Bleed } from "./effects/bleed.ts";
export { DefsRegistry } from "./effects/filters.ts";
export { attachEffects, collectEffectChains } from "./effects/apply.ts";
export { planCanvasRepairs, MAX_CANVAS_PADDING } from "./repair.ts";
