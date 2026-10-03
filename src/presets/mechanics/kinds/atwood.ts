/**
 * atwood: two masses over one fixed pulley. a = |m₂ − m₁|g/(m₁ + m₂) and
 * T = 2m₁m₂g/(m₁ + m₂); the heavier block is drawn lower.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveAtwood } from "../physics.ts";
import { common, twoMasses } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { INK, KEY, M, PAPER, TENSION, WHEEL, arcPts, arrow, arrowLabel, eq, hatchLine, name, panelBelow, quantity, rect } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  twoMasses(raw, path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const [m1, m2] = input.masses as [number, number];
  const s = solveAtwood(m1, m2, g);
  const k = 100 / Math.max(s.P1, s.P2);
  const ceil = M + 30;
  const r = 40;
  const C = { x: M + 200, y: ceil + 56 };
  const bw = 56;
  const bh = 48;
  const base = C.y + s.T * k + 40; // room for each T arrow under the wheel
  const top1 = base + (s.heavier === 1 ? 40 : 0);
  const top2 = base + (s.heavier === 2 ? 40 : 0);
  const x1 = C.x - r;
  const x2 = C.x + r;
  const p1Tip = { x: x1, y: top1 + bh + s.P1 * k };
  const p2Tip = { x: x2, y: top2 + bh + s.P2 * k };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P_{1} = ${quantity(s.P1, locale).text} N   ·   P_{2} = ${quantity(s.P2, locale).text} N` });
    lines.push({ text: eq("a", s.a, "m/s²", locale).replace(/^a /, "a = |m_{2} − m_{1}|·g/(m_{1} + m_{2}) ") });
    lines.push({ text: eq("T", s.T, "N", locale).replace(/^T /, "T = 2·m_{1}·m_{2}·g/(m_{1} + m_{2}) ") });
    lines.push({ text: s.heavier === 0 ? "massas iguais: o sistema fica em equilíbrio" : `o bloco ${s.heavier} (${formatNumber(s.heavier === 1 ? m1 : m2, locale)} kg) desce, o outro sobe` });
  }
  const W0 = Math.ceil(x2 + bw / 2 + 140 + M);
  const figH = Math.max(p1Tip.y, p2Tip.y) + 34;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, C.x - 90, C.x + 90, ceil, -1, "teto");
  b.poly([{ x: C.x, y: ceil }, C], { stroke: INK, width: 2.4, id: "haste" });
  b.circle(C, r, { stroke: INK, width: 2.2, fill: WHEEL, id: "polia" });
  b.poly([{ x: x1, y: top1 }, ...arcPts(C, r, Math.PI, 2 * Math.PI), { x: x2, y: top2 }], { stroke: INK, width: 1.8, id: "fio" });
  b.circle(C, 3, { stroke: INK, width: 1, fill: INK, id: "eixo" });
  rect(b, x1, top1, bw, bh, "bloco-1");
  rect(b, x2, top2, bw, bh, "bloco-2");
  name(b, `${formatNumber(m1, locale)} kg`, x1, top1 + bh / 2, "bloco-1", INK, 13);
  name(b, `${formatNumber(m2, locale)} kg`, x2, top2 + bh / 2, "bloco-2", INK, 13);
  // Tension beside each rope, outward; weights from the blocks' bottoms.
  const t1 = { x: x1 - 10, y: top1 - 3 };
  const t2 = { x: x2 + 10, y: top2 - 3 };
  arrow(b, t1, { x: t1.x, y: t1.y - s.T * k }, TENSION, "tracao-1");
  arrow(b, t2, { x: t2.x, y: t2.y - s.T * k }, TENSION, "tracao-2");
  arrow(b, { x: x1, y: top1 + bh }, p1Tip, KEY, "peso-1");
  arrow(b, { x: x2, y: top2 + bh }, p2Tip, KEY, "peso-2");
  arrowLabel(b, "T", { x: t1.x, y: t1.y - s.T * k }, { x: -1, y: 0 }, TENSION, "tracao-1");
  arrowLabel(b, "T", { x: t2.x, y: t2.y - s.T * k }, { x: 1, y: 0 }, TENSION, "tracao-2");
  arrowLabel(b, "P_{1}", p1Tip, { x: -1, y: 0 }, KEY, "peso-1");
  arrowLabel(b, "P_{2}", p2Tip, { x: 1, y: 0 }, KEY, "peso-2");
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "máquina de Atwood"));
}

export const atwood: Kind = { id: "atwood", fields: ["masses"], validate, draw };
