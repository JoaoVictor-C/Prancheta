/**
 * banked: a curve of radius R banked at θ, no friction, seen in cross-section.
 * N and P add to a horizontal resultant pointing to the curve's centre:
 * N·cos θ = P and N·sen θ = m·v²/R, so the ideal speed is v = √(g·R·tg θ).
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveBanked } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { BLOCK, GREEN, INK, KEY, M, PAPER, SLOPE, SOFT, arcPts, arrow, arrowLabel, eq, hatchLine, name, panelBelow, quantity } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "radius", path);
  positive(raw, "mass", path);
  const angle = v.requiredNumber(raw, "angle", path);
  if (angle < 10 || angle > 60) throw new SpecError(`${path}.angle must be from 10 to 60 degrees, got ${angle}`);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const R = input.radius as number;
  const mass = input.mass as number;
  const theta = input.angle as number;
  const t = (theta * Math.PI) / 180;
  const s = solveBanked(mass, g, R, theta);
  const L = 380;
  const Ht = L * Math.tan(t);
  const x0 = M + 120;
  const k = 110 / s.N;
  const side = 56;
  const u = { x: Math.cos(t), y: -Math.sin(t) }; // up the slope
  const n = { x: -Math.sin(t), y: -Math.cos(t) }; // out of the road, toward the centre
  const topPad = Math.max(60, s.N * k * Math.cos(t) + 40 - (Ht * 0.5));
  const yb = M + topPad + Ht;
  const A = { x: x0, y: yb };
  const B = { x: x0 + L, y: yb };
  const T = { x: x0 + L, y: yb - Ht };
  const len = L / Math.cos(t);
  const Q = { x: A.x + u.x * len * 0.5, y: A.y + u.y * len * 0.5 };
  const G = { x: Q.x + (n.x * side) / 2, y: Q.y + (n.y * side) / 2 };
  const pTip = { x: G.x, y: G.y + s.P * k };
  const nTip = { x: G.x + n.x * s.N * k, y: G.y + n.y * s.N * k };
  const fTip = { x: G.x - s.Fc * k, y: G.y };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: "sem atrito: N e P somam uma resultante horizontal, apontando para o centro da curva" });
    lines.push({ text: `N·cos θ = P = ${quantity(s.P, locale).text} N   ·   ${eq("N", s.N, "N", locale)}` });
    lines.push({ text: `${eq("F_{c}", s.Fc, "N", locale).replace(/^F_\{c\} /, "F_{c} = N·sen θ = P·tg θ ")} = m·v²/R` });
    lines.push({ text: eq("v", s.vIdeal, "m/s", locale).replace(/^v /, "velocidade ideal: v = √(g·R·tg θ) ") });
  }
  const W0 = Math.ceil(B.x + 70 + M);
  const figH = Math.max(yb + 40, pTip.y + 40);
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  b.poly([A, B, T], { fill: SLOPE, stroke: INK, width: 2.2, close: true, id: "pista" });
  hatchLine(b, A.x - 100, B.x + 40, yb, 1, "solo");
  // The angle at the road's inner edge, labelled as on the incline.
  const half = Math.sin(t / 2);
  const d = 16;
  const Ra = Math.max(44, Math.ceil((d * (1 - half)) / half) + 8);
  b.poly(arcPts(A, Ra, -t, 0, 24), { stroke: INK, width: 1.4, id: "angulo" });
  b.label(`${formatNumber(theta, locale)}°`, A.x + (Ra + d) * Math.cos(-t / 2), A.y + (Ra + d) * Math.sin(-t / 2), { size: 14, weight: 700, colour: INK, annotates: "angulo" });
  // The car, square on the road.
  const corners = [
    { x: Q.x - (u.x * side) / 2, y: Q.y - (u.y * side) / 2 },
    { x: Q.x + (u.x * side) / 2, y: Q.y + (u.y * side) / 2 },
    { x: Q.x + (u.x * side) / 2 + n.x * side, y: Q.y + (u.y * side) / 2 + n.y * side },
    { x: Q.x - (u.x * side) / 2 + n.x * side, y: Q.y - (u.y * side) / 2 + n.y * side },
  ];
  b.poly(corners, { fill: BLOCK, stroke: INK, width: 2, close: true, id: "carro" });
  // The resultant, dashed, closing the parallelogram of N and P.
  b.poly([nTip, fTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-n" });
  b.poly([pTip, fTip], { stroke: SOFT, width: 1.1, lineStyle: "dashed", id: "proj-p" });
  arrow(b, G, fTip, SOFT, "resultante", { width: 1.8, dashed: true });
  arrow(b, G, pTip, KEY, "peso");
  arrow(b, G, nTip, GREEN, "normal");
  b.circle(G, 3, { fill: INK, stroke: INK, width: 1, id: "cg" });
  arrowLabel(b, "P", pTip, { x: 0, y: 1 }, KEY, "peso");
  arrowLabel(b, "N", nTip, n, GREEN, "normal");
  arrowLabel(b, "F_{c}", fTip, { x: -1, y: 0 }, SOFT, "resultante");
  // Which way the centre is.
  arrow(b, { x: A.x - 20, y: yb - 22 }, { x: A.x - 80, y: yb - 22 }, SOFT, "centro", { width: 1.4 });
  name(b, "centro da curva", A.x - 50, yb - 40, "centro", SOFT, 12);
  void name;
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "curva compensada"));
}

export const banked: Kind = { id: "banked", fields: ["radius", "mass", "angle"], validate, draw };
