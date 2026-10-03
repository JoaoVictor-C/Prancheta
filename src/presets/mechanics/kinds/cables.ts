/**
 * cables: a weight hung from a knot held by two cables at α (left) and β
 * (right) above the horizontal. At the knot T₁ + T₂ + P = 0: the horizontal
 * parts cancel (T₁·cos α = T₂·cos β) and the vertical parts hold the weight
 * (T₁·sen α + T₂·sen β = P). An inset closes the three forces head to tail
 * into the force triangle, to the same scale.
 */

import type { FigureSpec, Point } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveCables } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { INK, KEY, M, PAPER, SOFT, TENSION, arcPts, arrow, arrowLabel, eq, freeName, hatchLine, name, panelBelow, rect } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "mass", path);
  const as = v.array(raw, "angles", path, "two angles above the horizontal [α, β], degrees");
  if (as.length !== 2 || as.some((a) => typeof a !== "number" || a < 15 || a > 75)) throw new SpecError(`${path}.angles must be two angles from 15 to 75 degrees`);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const mass = input.mass as number;
  const [alpha, beta] = input.angles as [number, number];
  const a = (alpha * Math.PI) / 180;
  const bb = (beta * Math.PI) / 180;
  const s = solveCables(mass, g, alpha, beta);
  const k = 100 / Math.max(s.P, s.T1, s.T2);
  const ceil = M + 30;
  const drop = 150; // knot below the ceiling
  const K = { x: M + 60 + drop / Math.tan(a), y: ceil + drop };
  const left = { x: K.x - drop / Math.tan(a), y: ceil };
  const right = { x: K.x + drop / Math.tan(bb), y: ceil };
  const bTop = K.y + 70;
  const u1 = { x: -Math.cos(a), y: -Math.sin(a) };
  const u2 = { x: Math.cos(bb), y: -Math.sin(bb) };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: "no nó: T_{1} + T_{2} + P = 0" });
    lines.push({ text: "horizontal: T_{1}·cos α = T_{2}·cos β   ·   vertical: T_{1}·sen α + T_{2}·sen β = P" });
    lines.push({ text: `P = ${formatNumber(s.P, locale)} N   ·   ${eq("T_{1}", s.T1, "N", locale)}   ·   ${eq("T_{2}", s.T2, "N", locale)}` });
  }
  const insetX = right.x + 120;
  const W0 = Math.ceil(insetX + Math.max(s.T1, s.T2) * k + 90 + M);
  const figH = Math.max(bTop + 60 + s.P * k * 0.0, ceil + s.P * k + 120, bTop + 80);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, left.x - 30, right.x + 30, ceil, -1, "teto");
  b.poly([K, left], { stroke: INK, width: 1.8, id: "cabo-1" });
  b.poly([K, right], { stroke: INK, width: 1.8, id: "cabo-2" });
  b.poly([K, { x: K.x, y: bTop }], { stroke: INK, width: 1.8, id: "fio" });
  rect(b, K.x, bTop, 60, 44, "bloco");
  name(b, `${formatNumber(mass, locale)} kg`, K.x, bTop + 22, "bloco", INK, 13);
  b.circle(K, 4, { fill: INK, stroke: INK, width: 1, id: "no" });
  // The angles with the horizontal at the knot.
  b.poly([{ x: K.x - 70, y: K.y }, { x: K.x + 70, y: K.y }], { stroke: SOFT, width: 1, lineStyle: "dashed", id: "horizontal" });
  // Each angle's radius from d < (R + d)·sen(θ/2), as on the incline.
  const d = 16;
  const radius = (t: number): number => Math.max(40, Math.ceil((d * (1 - Math.sin(t / 2))) / Math.sin(t / 2)) + 6);
  const R1 = radius(a);
  const R2 = radius(bb);
  b.poly(arcPts(K, R1, Math.PI, Math.PI + a, 16), { stroke: INK, width: 1.2, id: "ang-1" });
  b.poly(arcPts(K, R2, -bb, 0, 16), { stroke: INK, width: 1.2, id: "ang-2" });
  b.label(`${formatNumber(alpha, locale)}°`, K.x - (R1 + d) * Math.cos(a / 2), K.y - (R1 + d) * Math.sin(a / 2), { size: 13, weight: 700, colour: INK, annotates: "ang-1" });
  b.label(`${formatNumber(beta, locale)}°`, K.x + (R2 + d) * Math.cos(bb / 2), K.y - (R2 + d) * Math.sin(bb / 2), { size: 13, weight: 700, colour: INK, annotates: "ang-2" });
  // The tensions beside their cables, outward, to scale.
  const off1 = { x: -u1.y * 10, y: u1.x * 10 }; // the side away from the angle
  const off2 = { x: -u2.y * 10, y: u2.x * 10 };
  // Inside the V, a little way along each cable, so the two never cross near the knot.
  const t1From = { x: K.x + off1.x + u1.x * 24, y: K.y + off1.y + u1.y * 24 };
  const t2From = { x: K.x + off2.x + u2.x * 24, y: K.y + off2.y + u2.y * 24 };
  const t1Tip = { x: t1From.x + u1.x * s.T1 * k, y: t1From.y + u1.y * s.T1 * k };
  const t2Tip = { x: t2From.x + u2.x * s.T2 * k, y: t2From.y + u2.y * s.T2 * k };
  arrow(b, t1From, t1Tip, TENSION, "t1");
  arrow(b, t2From, t2Tip, TENSION, "t2");
  arrowLabel(b, "T_{1}", t1Tip, { x: off1.x / 10, y: off1.y / 10 }, TENSION, "t1");
  arrowLabel(b, "T_{2}", t2Tip, { x: off2.x / 10, y: off2.y / 10 }, TENSION, "t2");
  // The force triangle, head to tail: P down, then T₁, then T₂ back to the start.
  const S: Point = { x: insetX, y: ceil + 40 };
  const S1 = { x: S.x, y: S.y + s.P * k };
  const S2 = { x: S1.x + u1.x * s.T1 * k, y: S1.y + u1.y * s.T1 * k };
  freeName(b, "T_{1} + T_{2} + P = 0", S.x + 10, M + 12, SOFT, 12);
  arrow(b, S, S1, KEY, "tri-p");
  arrow(b, S1, S2, TENSION, "tri-t1");
  arrow(b, S2, S, TENSION, "tri-t2");
  // Each side named at its middle, outside the triangle.
  const cen = { x: (S.x + S1.x + S2.x) / 3, y: (S.y + S1.y + S2.y) / 3 };
  const side = (p: Point, q: Point, text: string, id: string, colour: string): void => {
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const out = { x: m.x - cen.x, y: m.y - cen.y };
    const l = Math.hypot(out.x, out.y);
    name(b, text, m.x + (out.x / l) * 22, m.y + (out.y / l) * 22, id, colour, 14);
  };
  side(S, S1, "P", "tri-p", KEY);
  side(S1, S2, "T_{1}", "tri-t1", TENSION);
  side(S2, S, "T_{2}", "tri-t2", TENSION);
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "corpo suspenso por dois cabos"));
}

export const cables: Kind = { id: "cables", fields: ["mass", "angles"], validate, draw };
