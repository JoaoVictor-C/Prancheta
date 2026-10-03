/**
 * conical: a bob on a string of length L sweeping a horizontal circle, the
 * string at θ from the vertical. T and P add to a horizontal resultant toward
 * the circle's centre: T·cos θ = P, T·sen θ = m·v²/r with r = L·sen θ; the
 * period is 2π√(L·cos θ / g).
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveConical } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, SOFT, arcPts, arrow, arrowLabel, eq, hatchLine, name, panelBelow, quantity, unitTo } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "length", path);
  positive(raw, "mass", path);
  const angle = v.requiredNumber(raw, "angle", path);
  if (angle < 15 || angle > 70) throw new SpecError(`${path}.angle must be from 15 to 70 degrees from the vertical, got ${angle}`);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const L = input.length as number;
  const mass = input.mass as number;
  const theta = input.angle as number;
  const t = (theta * Math.PI) / 180;
  const s = solveConical(mass, g, L, theta);
  const Lpx = 220;
  const ceil = M + 30;
  const O = { x: M + 200, y: ceil };
  const bob: Point = { x: O.x + Lpx * Math.sin(t), y: O.y + Lpx * Math.cos(t) };
  const C = { x: O.x, y: bob.y };
  const rpx = bob.x - O.x;
  const k = 100 / s.T;
  // T along the string, drawn beside it (outer side) so it does not hide it.
  const along = unitTo(bob, O);
  const outer = { x: Math.cos(t) * 11, y: -Math.sin(t) * 11 };
  const tFrom = { x: bob.x + outer.x, y: bob.y + outer.y };
  const tTip = { x: tFrom.x + along.x * s.T * k, y: tFrom.y + along.y * s.T * k };
  const pTip = { x: bob.x, y: bob.y + s.P * k };
  const fTip = { x: bob.x - s.Fc * k, y: bob.y };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `${eq("r", s.r, "m", locale).replace(/^r /, "r = L·sen θ ")}   ·   T·cos θ = P = ${quantity(s.P, locale).text} N   ·   ${eq("T", s.T, "N", locale)}` });
    lines.push({ text: `${eq("F_{c}", s.Fc, "N", locale).replace(/^F_\{c\} /, "F_{c} = T·sen θ = P·tg θ ")} = m·v²/r` });
    lines.push({ text: `${eq("v", s.v, "m/s", locale).replace(/^v /, "v = √(g·r·tg θ) ")}   ·   ${eq("período", s.period, "s", locale).replace(/^período /, "período = 2π√(L·cos θ/g) ")}` });
  }
  const W0 = Math.ceil(bob.x + 170 + M);
  const figH = Math.max(pTip.y + 40, bob.y + 60);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, O.x - 70, O.x + 70, ceil, -1, "teto");
  // The vertical axis and the horizontal circle the bob sweeps.
  b.poly([O, { x: O.x, y: C.y + 30 }], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "eixo" });
  const ellipse: Point[] = Array.from({ length: 97 }, (_, i) => {
    const a = (2 * Math.PI * i) / 96;
    return { x: C.x + rpx * Math.cos(a), y: C.y + rpx * 0.35 * Math.sin(a) };
  });
  b.poly(ellipse, { stroke: SOFT, width: 1.2, lineStyle: "dashed", id: "circulo" });
  // The string, its length, and its angle with the vertical.
  b.poly([O, bob], { stroke: INK, width: 1.8, id: "fio" });
  const mid = { x: (O.x + bob.x) / 2, y: (O.y + bob.y) / 2 };
  // L on the outer side of the string's upper part: T runs along its lower part.
  const upper = { x: O.x + (bob.x - O.x) * 0.42, y: O.y + (bob.y - O.y) * 0.42 };
  const out = { x: Math.cos(t), y: -Math.sin(t) };
  b.place(`L = ${formatNumber(L, locale)} m`, upper.x + out.x * 30, upper.y + out.y * 30, [out], { size: 13, weight: 700, colour: INK, annotates: "fio", steps: 6 });
  void mid;
  const half = Math.sin(t / 2);
  const d = 15;
  const Ra = Math.max(40, Math.ceil((d * (1 - half)) / half) + 8);
  b.poly(arcPts(O, Ra, Math.PI / 2 - t, Math.PI / 2, 20), { stroke: INK, width: 1.3, id: "angulo" });
  b.label(`${formatNumber(theta, locale)}°`, O.x + (Ra + d) * Math.cos(Math.PI / 2 - t / 2), O.y + (Ra + d) * Math.sin(Math.PI / 2 - t / 2), { size: 14, weight: 700, colour: INK, annotates: "angulo" });
  // Forces on the bob, to one scale, and their horizontal resultant.
  const tFull = { x: bob.x + along.x * s.T * k, y: bob.y + along.y * s.T * k };
  b.poly([tFull, fTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-t" });
  b.poly([pTip, fTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-p" });
  arrow(b, bob, fTip, SOFT, "resultante", { width: 1.8, dashed: true });
  arrow(b, tFrom, tTip, GREEN, "tracao");
  arrow(b, bob, pTip, KEY, "peso");
  b.circle(bob, 9, { fill: KEY, stroke: INK, width: 1.2, id: "corpo" });
  arrowLabel(b, "T", tTip, { x: 1, y: 0 }, GREEN, "tracao");
  arrowLabel(b, "P", pTip, { x: 1, y: 0 }, KEY, "peso");
  arrowLabel(b, "F_{c}", fTip, { x: -1, y: 0 }, SOFT, "resultante");
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "pêndulo cônico"));
}

export const conical: Kind = { id: "conical", fields: ["length", "mass", "angle"], validate, draw };
