/**
 * spring: a block hanging at rest from a spring, k·x = m·g, beside the same
 * spring unloaded. L₀ and the stretch x are dimension lines to one scale.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveSpring } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, SOFT, arrow, arrowLabel, dimension, eq, hatchLine, name, panelBelow, quantity, rect, springPath } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "mass", path);
  positive(raw, "stiffness", path);
  if (raw.natural !== undefined) positive(raw, "natural", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const mass = input.mass as number;
  const kSpring = input.stiffness as number;
  const L0 = (input.natural as number | undefined) ?? 0.2;
  const s = solveSpring(mass, g, kSpring);
  const scale = 230 / (L0 + s.x); // px per metre: the stretched spring is 230 px long
  const L0px = L0 * scale;
  const Xpx = s.x * scale;
  if (Xpx < 18) throw new SpecError(`mechanics: the stretch x = ${quantity(s.x, locale).text} m is too small beside L₀ = ${formatNumber(L0, locale)} m to draw to scale; use a shorter natural length`);
  const ceil = M + 30;
  const xL = M + 90;
  const xR = xL + 190;
  const yNat = ceil + L0px;
  const yEnd = yNat + Xpx;
  const bw = 60;
  const bh = 48;
  const kF = 90 / s.P;
  const pTip = { x: xR, y: yEnd + bh + s.P * kF };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P = m·g = ${quantity(s.P, locale).text} N` });
    lines.push({ text: "em equilíbrio, F_{el} = P: k·x = m·g" });
    lines.push({ text: `x = m·g/k = ${eq("", s.x, "m", locale).slice(3)} (${quantity(s.x * 100, locale).text} cm)` });
    lines.push({ text: `comprimento com o bloco: L_{0} + x = ${quantity(L0 + s.x, locale).text} m` });
  }
  const W0 = Math.ceil(xR + 120 + M);
  const figH = pTip.y + 34;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, xL - 50, xR + 60, ceil, -1, "teto");
  // The natural end, carried across as a dashed guide.
  b.poly([{ x: xL + 16, y: yNat }, { x: xR + 70, y: yNat }], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "guia" });
  b.poly(springPath(xL, ceil, yNat), { stroke: INK, width: 1.8, id: "mola-livre" });
  b.circle({ x: xL, y: yNat }, 3.5, { stroke: INK, width: 1, fill: INK, id: "ponta" });
  b.poly(springPath(xR, ceil, yEnd), { stroke: INK, width: 1.8, id: "mola" });
  rect(b, xR, yEnd, bw, bh, "bloco");
  name(b, `${formatNumber(mass, locale)} kg`, xR, yEnd + bh / 2, "bloco", INK, 13);
  // L₀ beside the unloaded spring, x beside the stretch: both to scale.
  dimension(b, xL - 34, ceil, yNat, "l0");
  name(b, "L_{0}", xL - 56, (ceil + yNat) / 2, "l0", SOFT, 14);
  b.poly([{ x: xR + 34, y: yEnd }, { x: xR + 62, y: yEnd }], { stroke: SOFT, width: 1.1, id: "ext-x" });
  dimension(b, xR + 54, yNat, yEnd, "x");
  name(b, "x", xR + 72, (yNat + yEnd) / 2, "x", SOFT, 15);
  // The spring's pull and the weight: equal, to one scale.
  const f0 = { x: xR - 22, y: yEnd - 3 };
  const fTip = { x: f0.x, y: f0.y - s.Fel * kF };
  arrow(b, f0, fTip, GREEN, "elastica");
  arrow(b, { x: xR, y: yEnd + bh }, pTip, KEY, "peso");
  arrowLabel(b, "F_{el}", fTip, { x: -1, y: 0 }, GREEN, "elastica");
  arrowLabel(b, "P", pTip, { x: 1, y: 0 }, KEY, "peso");
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "bloco suspenso por uma mola"));
}

export const spring: Kind = { id: "spring", fields: ["mass", "stiffness", "natural"], validate, draw };
