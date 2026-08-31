/**
 * The manifest: what was drawn, where, whether it is defensible, and — since
 * M1 — what had to be changed to make it so.
 *
 * A renderer that emits only pixels can be looked at. A renderer that emits a
 * manifest can be checked, and a manifest that also carries the repair log can
 * be argued with: the caller sees which of their sizes did not survive contact
 * with the text they wrote.
 */

import { runChecks } from "./checks.ts";
import type { Check } from "./checks.ts";
import { unionOf } from "./checks.ts";
import type { LaidOutFigure, Rect } from "./ir/types.ts";
import type { RepairEdit } from "./repair.ts";

export type Manifest = {
  version: 1;
  title: string | null;
  figure: { width: number; height: number };
  elements: ManifestElement[];
  checks: Check[];
  /** Edits the repair loop had to make, in the order it made them. */
  repairs: RepairEdit[];
  /** Layout passes run. 1 means the figure was clean as authored. */
  passes: number;
  /** Failures no repair strategy could address, with the reason. */
  unrepaired: { check: Check; why: string }[];
  warnings: string[];
  /** False if any check still fails. The single number a caller should read. */
  ok: boolean;
};

export type ManifestElement = {
  id: string;
  /**
   * "decoration" is a mark: ink that names nothing and joins nothing. The
   * word is borrowed from the module protocol, which has used it for exactly
   * this since decision 0005, rather than minting a second one for the same
   * idea in the core.
   */
  kind: "box" | "text" | "connector" | "decoration";
  box: Rect;
  ownerId?: string;
  /** For text: the exact strings drawn, one per rendered line. */
  lines?: string[];
  /** For connectors: the block ids actually joined, so a verifier can check them. */
  joins?: string[];
};

export type { Check };

export type ManifestOptions = {
  title?: string;
  warnings?: string[];
  repairs?: RepairEdit[];
  passes?: number;
  unrepaired?: { check: Check; why: string }[];
};

export function buildManifest(figure: LaidOutFigure, options: ManifestOptions = {}): Manifest {
  const checks = runChecks(figure);
  const warnings = [...(options.warnings ?? [])];
  const elements: ManifestElement[] = [];

  for (const element of figure.elements) {
    if (element.kind === "box") {
      elements.push({
        id: element.id,
        kind: "box",
        box: { x: element.x, y: element.y, width: element.width, height: element.height },
      });
      continue;
    }
    if (element.kind === "connector") {
      elements.push({
        id: element.id,
        kind: "connector",
        box: unionOf(
          element.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
        ),
        // Either end may be a bare point rather than a block, so `joins` lists
        // the boxes this connector actually attaches to -- which for a free
        // vector is none at all, and saying so is the honest report.
        ownerId: element.fromId ?? undefined,
        joins: [element.fromId, element.toId].filter((id): id is string => id !== null),
      });
      continue;
    }
    if (element.kind === "mark") {
      // A mark declares no semantics of its own -- it names nothing and joins
      // nothing -- so the manifest records only where its ink went.
      elements.push({
        id: element.id,
        kind: "decoration",
        box: unionOf(
          element.points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })),
        ),
      });
      continue;
    }
    elements.push({
      id: element.id,
      kind: "text",
      ownerId: element.ownerId ?? undefined,
      box: unionOf(element.lines.map((line) => line.box)),
      lines: element.lines.map((line) => line.text),
    });
    for (const line of element.lines) {
      if (line.baselineUncertain) {
        warnings.push(
          `${element.id}: line "${truncate(line.text)}" used a fallback font; its baseline is approximate`,
        );
      }
    }
  }

  return {
    version: 1,
    title: options.title ?? null,
    figure: { width: figure.width, height: figure.height },
    elements,
    checks,
    repairs: options.repairs ?? [],
    passes: options.passes ?? 1,
    unrepaired: options.unrepaired ?? [],
    warnings,
    // A not-applicable check has verified nothing, but it has not found a
    // defect either. Only a genuine failure makes a figure not ok.
    ok: checks.every((check) => check.status !== "fail"),
  };
}

function truncate(value: string): string {
  return value.length <= 32 ? value : `${value.slice(0, 32)}…`;
}
