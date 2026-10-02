/**
 * The reading panel, once (ADR 0062).
 *
 * Most presets that compute something print it: a few lines of readings set
 * under the figure -- a circuit's U_AB and powers, a lens's Gauss arithmetic,
 * a law's standardisation, a boxplot's quartiles. Each preset used to build
 * that panel itself, with its own wrap, its own line height, its own colours
 * and, in the circuit, subscripts faked as separate blocks at estimated
 * offsets. This module is the one builder: lines in, wrapped and typeset
 * blocks out, every block `freeStanding` with an id under `panel-`, and the
 * same lines recorded on the spec as `readings` so a sheet can lift the panel
 * out of the drawing and set it as page text (`liftReadings`).
 *
 * Two steps, because a preset needs the panel's height before its Board
 * exists (the canvas is sized from it): `layoutPanel` wraps and measures,
 * `Panel.draw` places.
 */

import type { Block, FigureSpec, ReadingEmphasis, ReadingLine, Readings, Scene, TextRun } from "../../ir/types.ts";
import { runsText } from "../../ir/types.ts";
import type { Board } from "../function-graph/board.ts";
import { lineBox } from "../function-graph/board.ts";
import { LABEL_SLACK, wrapText } from "./text.ts";
import { measureText } from "../../layout/text-metrics.ts";
import type { WrapRules } from "./text.ts";

export const PANEL_INK = "#181B21";
export const PANEL_SOFT = "#4E5763";

/** Size of a sub/superscript relative to its line; the mirror's SCRIPT_STYLE sets the same 0.7em. */
const SCRIPT_SCALE = 0.7;

export type PanelLineInput = {
  /**
   * The line. A string may mark scripts with `_{…}` and `^{…}` ("U_{AB} =
   * V_{A} − V_{B}"); see `rich`. Or give the runs directly.
   */
  text: string | TextRun[];
  emphasis?: ReadingEmphasis;
  /** For emphasis "accent". */
  colour?: string;
  /** A short coloured rule before the (first wrapped) line. */
  swatch?: string;
  /** Id suffix: the line's block is `panel-<id>` (a wrapped line adds `-2`, `-3`…). Default: its index. */
  id?: string;
  /** false: never wrap this line (it is drawn as wide as it is). Default true. */
  wrap?: boolean;
  /** A term set strong in its own column, the text hanging beside it (see ReadingLine.lead). */
  lead?: string | TextRun[];
  /** Extra space before this line, in px. */
  gap?: number;
};

export type PanelOptions = {
  /** The widest a line may be, in px; longer lines wrap. */
  width: number;
  /** Font size. Default 13. */
  size?: number;
  /** Baseline-to-baseline distance. Default 1.75 × size. */
  lineHeight?: number;
  /** Which words a wrap must not part (see shared/text.ts). */
  rules?: WrapRules;
  /** Emphasis of lines that state none. Default "normal". */
  emphasis?: ReadingEmphasis;
};

/** One laid-out line: what the panel draws and what `readings` records. */
/** One drawn (wrapped) line. `hangs`: it sits in the text column beside the leads. */
export type PanelLine = Omit<ReadingLine, "gap"> & { id: string; width: number; hangs: boolean; gapBefore: number };

// ---- rich text --------------------------------------------------------------------------------

/**
 * Runs from a string with `_{…}` (subscript) and `^{…}` (superscript) marks:
 * `rich("U_{AB} = V_{A}")` is U, AB as a subscript, " = V", A as a subscript.
 * A lone `_` or `^` without braces is literal text, so "proj_v" stays as
 * typed unless it is written "proj_{v}". Adjacent plain pieces merge.
 */
export function rich(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const push = (t: string, script?: "sub" | "sup"): void => {
    if (t === "") return;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.script === script) last.text += t;
    else runs.push(script === undefined ? { text: t } : { text: t, script });
  };
  const re = /([_^])\{([^{}]*)\}/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    push(text.slice(at, m.index));
    push(m[2]!, m[1] === "_" ? "sub" : "sup");
    at = m.index! + m[0].length;
  }
  push(text.slice(at));
  return runs;
}

const asRuns = (text: string | TextRun[]): TextRun[] => (typeof text === "string" ? rich(text) : text);

/** True when any run is a sub/superscript -- only then does a block need `runs`. */
export const hasScripts = (runs: readonly TextRun[]): boolean => runs.some((r) => r.script !== undefined);

/**
 * The width of runs at `size` in the bundled face (ADR 0063): each run
 * measured at its own size -- a script at 0.7 of the line's, as the mirror
 * sets it -- plus the same `LABEL_SLACK` a label keeps.
 */
export function runsWidth(runs: readonly TextRun[], size: number, weight = 400, tracking = 0.1): number {
  let px = 0;
  for (const run of runs) {
    const s = run.script === undefined ? size : size * SCRIPT_SCALE;
    px += measureText(run.text, { size: s, weight, tracking });
  }
  return Math.ceil(px + LABEL_SLACK);
}

// Scripts ride through wrapText (which speaks plain strings split at spaces)
// as private-use brackets around their text, and come back out as runs.
const OPEN = { sub: "", sup: "" } as const;
const CLOSE = { sub: "", sup: "" } as const;

function encode(runs: readonly TextRun[]): string {
  return runs.map((r) => (r.script === undefined ? r.text : `${OPEN[r.script]}${r.text}${CLOSE[r.script]}`)).join("");
}

function decode(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let script: "sub" | "sup" | undefined;
  let buf = "";
  const flush = (): void => {
    if (buf !== "") runs.push(script === undefined ? { text: buf } : { text: buf, script });
    buf = "";
  };
  for (const ch of text) {
    if (ch === OPEN.sub || ch === OPEN.sup) {
      flush();
      script = ch === OPEN.sub ? "sub" : "sup";
    } else if (ch === CLOSE.sub || ch === CLOSE.sup) {
      flush();
      script = undefined;
    } else buf += ch;
  }
  flush();
  return runs;
}

/** Runs wrapped to lines no wider than `maxPx` (by `measure`), a script never parted from its word. */
export function wrapRuns(runs: readonly TextRun[], maxPx: number, measure: (runs: TextRun[]) => number, rules: WrapRules = {}): TextRun[][] {
  const plainRules: WrapRules = {
    ...(rules.joinsPrevious === undefined ? {} : { joinsPrevious: (w: string) => rules.joinsPrevious!(runsText(decode(w))) }),
    ...(rules.joinsNext === undefined ? {} : { joinsNext: (w: string) => rules.joinsNext!(runsText(decode(w))) }),
  };
  return wrapText(encode(runs), maxPx, (s) => measure(decode(s)), plainRules).map(decode);
}

// ---- the panel --------------------------------------------------------------------------------

export const EMPHASIS_STYLE: Record<ReadingEmphasis, { weight: number; colour?: string }> = {
  normal: { weight: 400, colour: PANEL_INK },
  strong: { weight: 700, colour: PANEL_INK },
  soft: { weight: 400, colour: PANEL_SOFT },
  accent: { weight: 700 },
};

/** Room a swatch takes before its line's text. */
const SWATCH_W = 22;
const SWATCH_GAP = 12;
/** Space between a lead column and the text beside it. */
const LEAD_GAP = 16;
const LEAD_WEIGHT = 700;

export class Panel {
  /** The drawn lines, wrapped. */
  readonly lines: PanelLine[];
  /** The lines as given, unwrapped: what `readings` records, for a page to wrap at its own width. */
  readonly source: ReadingLine[];
  readonly size: number;
  readonly lineHeight: number;
  /** Text starts this far right of `left`: room for swatches when any line has one. */
  readonly indent: number;
  /** Width of the lead column (0 when no line has a lead), the gap after it included. */
  readonly leadColumn: number;

  constructor(lines: PanelLine[], source: ReadingLine[], size: number, lineHeight: number, indent: number, leadColumn: number) {
    this.lines = lines;
    this.source = source;
    this.size = size;
    this.lineHeight = lineHeight;
    this.indent = indent;
    this.leadColumn = leadColumn;
  }

  /** Total height of the lines and the gaps between them, first line's top to last line's bottom. */
  get height(): number {
    return this.lines.reduce((h, l) => h + l.gapBefore, 0) + this.lines.length * this.lineHeight;
  }

  /** The widest line, swatch and lead room included. */
  get width(): number {
    if (this.lines.length === 0) return 0;
    return Math.max(...this.lines.map((l) => this.indent + (l.hangs ? this.leadColumn : 0) + l.width));
  }

  get empty(): boolean {
    return this.lines.length === 0;
  }

  /**
   * Set every line on the board, the first line's box top at `top`, starting
   * at `left` ("start") or centred on the canvas ("center"). `cut` is where
   * the figure proper ends: the canvas y a sheet crops the drawing to when it
   * lifts the panel out (`liftReadings`). Records the readings on the board
   * and returns the panel's bottom edge.
   */
  draw(board: Board, o: { left?: number; top: number; cut: number; align?: "start" | "center" }): number {
    const align = o.align ?? "start";
    const left = align === "center" ? (board.W - this.width) / 2 : (o.left ?? 0);
    let y = o.top;
    const label = (runs: TextRun[], x: number, cy: number, w: number, weight: number, colour: string, id: string): void => {
      const block: Block = board.label(runsText(runs), x + w / 2, cy, {
        size: this.size,
        weight,
        colour,
        align: "start",
        width: w,
        id,
        claim: false,
        freeStanding: true,
      });
      if (hasScripts(runs)) block.runs = runs.map((r) => ({ ...r }));
    };
    for (const line of this.lines) {
      y += line.gapBefore;
      const cy = y + this.lineHeight / 2;
      if (line.swatch !== undefined) {
        board.poly([{ x: left, y: cy }, { x: left + SWATCH_W, y: cy }], { stroke: line.swatch, width: 3.5, id: `panel-swatch-${line.id}` });
      }
      const style = EMPHASIS_STYLE[line.emphasis];
      const colour = line.colour ?? style.colour ?? PANEL_INK;
      if (line.lead !== undefined) {
        label(line.lead, left + this.indent, cy, this.leadColumn - LEAD_GAP, LEAD_WEIGHT, colour, `panel-${line.id}-lead`);
      }
      if (line.runs.length > 0) {
        label(line.runs, left + this.indent + (line.hangs ? this.leadColumn : 0), cy, line.width, style.weight, colour, `panel-${line.id}`);
      }
      y += this.lineHeight;
    }
    board.readings = this.readings(o.cut);
    return y;
  }

  /** The lines as data, for `FigureSpec.readings`. */
  readings(cut: number): Readings | undefined {
    if (this.source.length === 0) return undefined;
    return { top: cut, lines: this.source.map((l) => structuredClone(l)) };
  }
}

/** Wrap and measure the lines (no Board needed): the panel's height is known before the canvas is. */
export function layoutPanel(input: readonly PanelLineInput[], o: PanelOptions): Panel {
  const size = o.size ?? 13;
  const lineHeight = o.lineHeight ?? Math.round(size * 1.75);
  const indent = input.some((l) => l.swatch !== undefined) ? SWATCH_W + SWATCH_GAP : 0;
  const leads = input.filter((l) => l.lead !== undefined).map((l) => runsWidth(asRuns(l.lead!), size, LEAD_WEIGHT));
  const leadColumn = leads.length === 0 ? 0 : Math.max(...leads) + LEAD_GAP;
  const out: PanelLine[] = [];
  const source: ReadingLine[] = [];
  input.forEach((line, i) => {
    const emphasis = line.emphasis ?? o.emphasis ?? "normal";
    if (emphasis === "accent" && line.colour === undefined) throw new Error("panel: an accent line needs a colour");
    const weight = EMPHASIS_STYLE[emphasis].weight;
    const measure = (runs: TextRun[]): number => runsWidth(runs, size, weight);
    const runs = asRuns(line.text);
    const lead = line.lead === undefined ? undefined : asRuns(line.lead);
    const hangs = lead !== undefined;
    const room = o.width - indent - (hangs ? leadColumn : 0);
    const pieces = runs.length === 0 ? [[]] : line.wrap === false ? [runs] : wrapRuns(runs, room, measure, o.rules);
    const id = line.id ?? String(i);
    const gap = line.gap ?? 0;
    pieces.forEach((piece, k) => {
      out.push({
        id: k === 0 ? id : `${id}-${k + 1}`,
        runs: piece,
        emphasis,
        width: piece.length === 0 ? 0 : measure(piece),
        hangs,
        gapBefore: k === 0 ? gap : 0,
        ...(emphasis === "accent" ? { colour: line.colour! } : {}),
        ...(k === 0 && line.swatch !== undefined ? { swatch: line.swatch } : {}),
        ...(k === 0 && lead !== undefined ? { lead } : {}),
      });
    });
    source.push({
      runs: runs.length === 0 ? [{ text: " " }] : runs.map((r) => ({ ...r })),
      emphasis,
      ...(emphasis === "accent" ? { colour: line.colour! } : {}),
      ...(line.swatch === undefined ? {} : { swatch: line.swatch }),
      ...(lead === undefined ? {} : { lead: lead.map((r) => ({ ...r })) }),
      ...(gap > 0 ? { gap } : {}),
    });
  });
  return new Panel(out, source, size, lineHeight, indent, leadColumn);
}

/** The box a panel line occupies, for a preset that must keep other ink clear of it. */
export const panelLineBox = (size: number): number => lineBox(size);

// ---- lifting the panel out of the drawing -----------------------------------------------------

/** Is this id part of a reading panel? */
export const isPanelId = (id: string | undefined): boolean => id !== undefined && id.startsWith("panel-");

/**
 * The figure without its reading panel, cropped to where the figure proper
 * ends, and the panel's lines -- for a sheet to set as page text (ADR 0062).
 * A figure with no panel comes back unchanged with no readings.
 *
 * Refuses (throws) when anything that is not the panel lies below the cut:
 * cropping it away would silently delete part of the drawing.
 */
export function liftReadings(spec: FigureSpec): { spec: FigureSpec; readings?: Readings } {
  const readings = spec.readings;
  if (readings === undefined) return { spec };
  const { readings: _dropped, ...rest } = spec;
  if (spec.root.type !== "scene") throw new Error("liftReadings: a figure with readings must have a scene root");
  const scene = spec.root as Scene;
  const cut = readings.top;
  const slack = 0.5;
  const children = scene.children.filter((c) => !isPanelId(c.id));
  for (const c of children) {
    const bottom = (c.y ?? 0) + (c.height ?? 0);
    if (typeof c.y === "number" && bottom > cut + slack) {
      throw new Error(`liftReadings: ${c.id ?? "a block"} reaches y = ${bottom}, below the panel's cut at ${cut}`);
    }
  }
  const marks = (scene.marks ?? []).filter((m) => !isPanelId(m.id));
  for (const m of marks) {
    const ys = [m.from, ...m.segments.map((s) => ("line" in s ? s.line : "arc" in s ? s.arc : undefined))]
      .map((p) => (p as { y?: unknown } | undefined)?.y)
      .filter((y): y is number => typeof y === "number");
    if (ys.some((y) => y > cut + slack)) throw new Error(`liftReadings: mark ${m.id} reaches below the panel's cut at ${cut}`);
  }
  const root: Scene = { ...scene, children, marks, height: cut };
  return { spec: { ...rest, root }, readings };
}
