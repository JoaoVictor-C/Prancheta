/**
 * elevator: a body on the floor of an elevator accelerating at a (up
 * positive). The floor pushes N = m(g + a): more than the weight while the
 * acceleration points up (rising faster, or falling and braking), less while
 * it points down, zero in free fall. A scale on the floor reads N.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveElevator } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, RUST, SLOPE, arrow, arrowLabel, eq, name, panelBelow, quantity, rect } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "mass", path);
  v.requiredNumber(raw, "acceleration", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const mass = input.mass as number;
  const a = input.acceleration as number;
  const s = solveElevator(mass, g, a);
  const k = 90 / Math.max(s.P, s.N);
  const cabin = { x0: M + 120, y0: M + 60, w: 200, h: 260 };
  const floor = cabin.y0 + cabin.h;
  const bw = 54;
  const bh = 70;
  const G = { x: cabin.x0 + cabin.w / 2, y: floor - bh / 2 };
  const lines: PanelLineInput[] = [];
  if (answers) {
    const how = Math.abs(a) < 1e-9 ? "velocidade constante (ou parado)" : a > 0 ? "subindo cada vez mais rápido, ou descendo e freando" : "descendo cada vez mais rápido, ou subindo e freando";
    lines.push({ text: `a = ${formatNumber(a, locale)} m/s² (${a >= 0 ? "para cima" : "para baixo"}): ${how}` });
    lines.push({ text: `${eq("N", s.N, "N", locale).replace(/^N /, "N − P = m·a  →  N = m(g + a) ")}   ·   P = ${quantity(s.P, locale).text} N` });
    lines.push({ text: `uma balança no piso indicaria ${quantity(s.N / g, locale).text} kg (peso aparente)` });
  }
  const W0 = Math.ceil(cabin.x0 + cabin.w + 160 + M);
  const figH = Math.max(floor + 50, G.y + s.P * k + 50);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  // The cabin on its cable.
  b.poly([{ x: G.x, y: M + 10 }, { x: G.x, y: cabin.y0 }], { stroke: INK, width: 2.2, id: "cabo" });
  b.poly([{ x: cabin.x0, y: cabin.y0 }, { x: cabin.x0 + cabin.w, y: cabin.y0 }, { x: cabin.x0 + cabin.w, y: floor }, { x: cabin.x0, y: floor }], { fill: "#F4F2EC", stroke: INK, width: 2.4, close: true, id: "cabine" });
  b.poly([{ x: cabin.x0, y: floor }, { x: cabin.x0 + cabin.w, y: floor }, { x: cabin.x0 + cabin.w, y: floor + 10 }, { x: cabin.x0, y: floor + 10 }], { fill: SLOPE, stroke: INK, width: 1.6, close: true, id: "piso" });
  rect(b, G.x, floor - bh, bw, bh, "corpo");
  name(b, `${formatNumber(mass, locale)} kg`, G.x - bw / 2 - 30, G.y - 12, "corpo", INK, 13);
  // N and P on the body, to one scale, side by side.
  const nTip = { x: G.x + 9, y: G.y - s.N * k };
  const pTip = { x: G.x - 9, y: G.y + s.P * k };
  if (s.N > 1e-9) {
    arrow(b, { x: G.x + 9, y: G.y }, nTip, GREEN, "normal");
    arrowLabel(b, "N", nTip, { x: 0, y: -1 }, GREEN, "normal");
  }
  arrow(b, { x: G.x - 9, y: G.y }, pTip, KEY, "peso");
  arrowLabel(b, "P", pTip, { x: 0, y: 1 }, KEY, "peso");
  // The acceleration beside the cabin, on its own scale.
  if (Math.abs(a) > 1e-9) {
    const ax = cabin.x0 + cabin.w + 44;
    const ay = cabin.y0 + cabin.h / 2;
    const len = Math.min(80, 20 + Math.abs(a) * 6);
    const tip = { x: ax, y: ay - Math.sign(a) * len };
    arrow(b, { x: ax, y: ay }, tip, RUST, "aceleracao");
    arrowLabel(b, "a", tip, { x: 1, y: 0 }, RUST, "aceleracao");
  }
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "corpo num elevador"));
}

export const elevator: Kind = { id: "elevator", fields: ["mass", "acceleration"], validate, draw };
