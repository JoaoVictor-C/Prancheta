/** Drawing helpers shared by the two genetics figures. */

import type { Block, TextRun } from "../../ir/types.ts";
import { runsText } from "../../ir/types.ts";
import type { Board, LabelOptions } from "../function-graph/board.ts";
import { hasScripts, runsWidth } from "../shared/panel.ts";

/** A label made of runs (real sub/superscripts), its box measured from the runs. */
export function runsLabel(board: Board, runs: TextRun[], cx: number, cy: number, o: LabelOptions & { size?: number } = {}): Block {
  const size = o.size ?? 13;
  const width = runsWidth(runs, size, o.weight ?? 400, o.tracking ?? 0.1);
  const block = board.label(runsText(runs), cx, cy, { ...o, width });
  if (hasScripts(runs)) block.runs = runs.map((r) => ({ ...r }));
  return block;
}

export const widthOf = (runs: TextRun[], size: number, weight = 400): number => runsWidth(runs, size, weight);
