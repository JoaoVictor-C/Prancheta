/**
 * Five-option graph sets (ADR 0066): panels (A)–(E) of small graphs in one
 * figure. ENEM asks "which graph represents…" and answers with five; each is
 * a function-graph of its own, drawn and labelled by the same rules, and the
 * set is ONE figure so the five share a size and a page.
 *
 * Each panel is built alone, before frame resolution, then moved into its
 * cell: canvas points translated, every id prefixed with the panel's letter
 * -- frames, marks, blocks, series, and every reference to them (`annotates`,
 * `names`, `on`, `gridOf`, a framed point's frame). The generated ids follow:
 * a frame `pA-plane` grids out `pA-plane-axis-x`, which is what a root
 * marker's `on: ["plane-axis-x"]` became. Nothing is re-derived; a panel
 * says exactly what it said alone.
 */

import type { Block, FigureSpec, Frame, Mark, MarkSegment, Point, Scene } from "../../ir/types.ts";
import { SpecError } from "../../ir/types.ts";
import { BUNDLED_FONT_STACK } from "../../export/fonts.ts";
import { labelWidth } from "../shared/text.ts";
import type { AxisInput, FunctionGraphInput, PanelInput } from "./preset.ts";

/** Room on each panel's left for its letter, and between cells. */
const GUTTER = 30;
const GAP = 18;

type FramedPoint = { frame: string; x: number; y: number };

/** One panel's input: every field it leaves out taken from the set. */
export function panelInput(set: FunctionGraphInput, panel: PanelInput): FunctionGraphInput {
  const { panels: _p, columns: _c, title: _t, ...base } = set;
  const { label: _l, x, y, y2, ...own } = panel;
  const merged: FunctionGraphInput = {
    ...base,
    ...own,
    x: { ...set.x, ...(x ?? {}) } as AxisInput,
    y: { ...set.y, ...(y ?? {}) } as AxisInput,
  };
  const y2Merged = set.y2 === undefined && y2 === undefined ? undefined : ({ ...(set.y2 ?? {}), ...(y2 ?? {}) } as AxisInput);
  if (y2Merged !== undefined) merged.y2 = y2Merged;
  else delete merged.y2;
  return merged;
}

export const panelLetter = (panel: PanelInput, i: number): string => panel.label ?? String.fromCharCode(65 + i);

export function composePanels(set: FunctionGraphInput, build: (input: FunctionGraphInput) => FigureSpec): FigureSpec {
  const panels = set.panels ?? [];
  if (panels.length === 0) throw new SpecError("function-graph.panels must list at least one panel");
  const columns = Math.max(1, Math.min(set.columns ?? 2, panels.length));
  const built = panels.map((panel, i) => ({ letter: panelLetter(panel, i), spec: build(panelInput(set, panel)) }));
  const scenes = built.map((b) => b.spec.root as Scene);
  const cellW = Math.max(...scenes.map((s) => s.width as number));
  const cellH = Math.max(...scenes.map((s) => s.height as number));
  const rows = Math.ceil(panels.length / columns);
  const W = columns * (GUTTER + cellW) + (columns - 1) * GAP;
  const H = rows * cellH + (rows - 1) * GAP;
  const frames: Frame[] = [];
  const children: Block[] = [];
  const marks: Mark[] = [];
  built.forEach(({ letter, spec }, i) => {
    const scene = spec.root as Scene;
    const col = i % columns;
    const row = Math.floor(i / columns);
    const dx = col * (GUTTER + cellW + GAP) + GUTTER;
    const dy = row * (cellH + GAP);
    const prefix = `p${letter}-`;
    const id = (s: string): string => `${prefix}${s}`;
    const move = (p: Point | FramedPoint): Point | FramedPoint =>
      "frame" in p && typeof p.frame === "string" ? { ...p, frame: id(p.frame) } : { x: p.x + dx, y: p.y + dy };
    for (const frame of scene.frames ?? []) {
      const origin = frame.origin as Point;
      frames.push({ ...frame, id: id(frame.id), origin: { x: origin.x + dx, y: origin.y + dy } });
    }
    for (const mark of scene.marks ?? []) {
      marks.push({
        ...mark,
        id: id(mark.id),
        from: move(mark.from as Point),
        segments: mark.segments.map((seg): MarkSegment =>
          "line" in seg ? { line: move(seg.line as Point) } : { arc: move(seg.arc as Point), centre: move(seg.centre as Point) },
        ),
        ...(mark.gridOf === undefined ? {} : { gridOf: id(mark.gridOf) }),
        ...(mark.series === undefined ? {} : { series: id(mark.series) }),
        ...(mark.on === undefined ? {} : { on: mark.on.map(id) }),
      });
    }
    for (const child of scene.children as Block[]) {
      if (child.type !== "block") throw new SpecError("function-graph.panels: a panel drew something other than a block");
      children.push({
        ...child,
        ...(child.id === undefined ? {} : { id: id(child.id) }),
        x: (child.x as number) + dx,
        y: (child.y as number) + dy,
        ...(child.annotates === undefined ? {} : { annotates: id(child.annotates) }),
        ...(child.names === undefined ? {} : { names: id(child.names) }),
        ...(child.gridOf === undefined ? {} : { gridOf: id(child.gridOf) }),
        ...(child.annotatesPlace === undefined ? {} : { annotatesPlace: move(child.annotatesPlace as Point) as Point }),
      });
    }
    // The panel's letter, beside it at mid-height: what the question's
    // options name. It names the whole panel, which is no one element.
    const text = `(${letter})`;
    const size = 15;
    const w = labelWidth(text, size, 0.1, 700);
    const h = Math.ceil(size * 1.45 + 3);
    children.push({
      type: "block",
      id: id("letter"),
      label: text,
      x: dx - GUTTER + 4,
      y: dy + (scene.height as number) / 2 - h / 2,
      width: w,
      height: h,
      padding: 0,
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      wrap: "none",
      textAlign: "start",
      verticalAlign: "center",
      textColor: "#181B21",
      fontFamily: BUNDLED_FONT_STACK,
      fontSize: size,
      fontWeight: 700,
      letterSpacing: 0.1,
      freeStanding: true,
    });
  });
  const first = built[0]!.spec;
  return {
    version: 1,
    title: set.title ?? "function graph panels",
    canvas: first.canvas!,
    root: { type: "scene", layout: "absolute", width: W, height: H, frames, children, connectors: [], marks },
  };
}
