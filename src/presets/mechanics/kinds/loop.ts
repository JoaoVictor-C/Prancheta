/**
 * loop: a body at the top of a vertical loop of radius R. Both forces point to
 * the centre there, and together they are the centripetal force:
 * N + P = m v²/R. The least speed that keeps contact makes N = 0: v = √(gR).
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveLoop } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { BLOCK, GREEN, INK, KEY, M, PAPER, SOFT, arcPts, arrow, arrowLabel, eq, hatchLine, name, panelBelow, quantity } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "radius", path);
  positive(raw, "mass", path);
  if (raw.speed !== undefined) positive(raw, "speed", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const R = input.radius as number;
  const mass = input.mass as number;
  const s = solveLoop(mass, g, R, input.speed as number | undefined);
  const Rpx = 130;
  const C = { x: M + 220, y: M + 60 + Rpx };
  const k = 70 / Math.max(s.P, s.N);
  const br = 20;
  const body = { x: C.x, y: C.y - Rpx + br + 4 }; // inside the track, at the top
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: "no topo, N e P apontam para o centro: N + P = m·v²/R" });
    lines.push({ text: `${eq("v_{mín}", s.vMin, "m/s", locale).replace(/^v_\{mín\} /, "velocidade mínima (N = 0): v_{mín} = √(g·R) ")}` });
    if (input.speed !== undefined) {
      lines.push(s.contact
        ? { text: `com v = ${formatNumber(s.v, locale)} m/s: ${eq("N", s.N, "N", locale).replace(/^N /, "N = m·v²/R − P ")}` }
        : { text: `com v = ${formatNumber(s.v, locale)} m/s < v_{mín}: o corpo perde contato antes do topo` });
    }
  }
  const W0 = Math.ceil(C.x + Rpx + 180 + M);
  const figH = C.y + Rpx + 40;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  hatchLine(b, C.x - Rpx - 80, C.x + Rpx + 80, C.y + Rpx, 1, "solo");
  b.poly(arcPts(C, Rpx, 0, 2 * Math.PI, 96), { stroke: INK, width: 3, id: "pista" });
  b.circle(C, 3.5, { fill: INK, stroke: INK, width: 1, id: "centro" });
  // The radius to the lower left, away from the forces at the top, with its given length.
  const rEnd = { x: C.x - Rpx * Math.SQRT1_2, y: C.y + Rpx * Math.SQRT1_2 };
  b.poly([C, rEnd], { stroke: SOFT, width: 1.2, lineStyle: "dashed", id: "raio" });
  b.place(`R = ${formatNumber(R, locale)} m`, (C.x + rEnd.x) / 2 + 30, (C.y + rEnd.y) / 2 + 6, [{ x: Math.SQRT1_2, y: Math.SQRT1_2 }], { size: 13, weight: 700, colour: SOFT, annotates: "raio", steps: 8 });
  // The body touches the track, so its mass is written inside it.
  b.circle(body, br, { fill: BLOCK, stroke: INK, width: 1.4, id: "corpo" });
  name(b, `${formatNumber(mass, locale)} kg`, body.x, body.y, "corpo", INK, 11);
  // Both forces down, toward the centre, to one scale; N drawn beside P so neither hides the other.
  const pTip = { x: body.x - 8, y: body.y + br + s.P * k };
  arrow(b, { x: body.x - 8, y: body.y + br }, pTip, KEY, "peso");
  arrowLabel(b, "P", pTip, { x: -1, y: 0 }, KEY, "peso");
  if (s.N > 1e-9) {
    const nTip = { x: body.x + 8, y: body.y + br + s.N * k };
    arrow(b, { x: body.x + 8, y: body.y + br }, nTip, GREEN, "normal");
    arrowLabel(b, "N", nTip, { x: 1, y: 0 }, GREEN, "normal");
  }
  void quantity;
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "globo da morte (loop)"));
}

export const loop: Kind = { id: "loop", fields: ["radius", "mass", "speed"], validate, draw };
