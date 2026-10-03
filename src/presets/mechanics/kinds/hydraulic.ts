/**
 * hydraulic: a hydraulic press (Pascal). The same pressure acts on both
 * pistons, F₁/A₁ = F₂/A₂, so F₂ = F₁·A₂/A₁; the large piston moves A₁/A₂ of
 * the small one's travel. The pistons' diameters are drawn to scale (∝ √A);
 * the forces are not, because their ratio is often a hundred or more -- a
 * line under the figure says so, with or without the answers.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { SpecError, parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import * as v from "../../validate.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveHydraulic } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, arrow, arrowLabel, eq, freeName, name, panelBelow, quantity } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "force", path);
  const as = v.array(raw, "areas", path, "the pistons' areas [A₁, A₂], m²");
  if (as.length !== 2 || as.some((a) => typeof a !== "number" || !(a > 0))) throw new SpecError(`${path}.areas must be two positive areas, m²`);
  const [a1, a2] = as as number[];
  if (!(a2! > a1!)) throw new SpecError(`${path}.areas: the second piston (where the force comes out) must be the larger`);
  if (a2! / a1! > 400) throw new SpecError(`${path}.areas: a ratio over 400 cannot be drawn with both pistons visible`);
  if (raw.travel !== undefined) positive(raw, "travel", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers } = common(input);
  const F1 = input.force as number;
  const [A1, A2] = input.areas as [number, number];
  const d1 = input.travel as number | undefined;
  const s = solveHydraulic(F1, A1, A2);
  const w2 = 170;
  const w1 = Math.max(14, w2 * Math.sqrt(A1 / A2)); // diameters ∝ √A
  const top = M + 110;
  const level = top + 30;
  const bottom = top + 190;
  const x1 = M + 100;
  const x2 = x1 + w1 / 2 + 160 + w2 / 2;
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: "a pressão é a mesma nos dois êmbolos (Pascal): F_{1}/A_{1} = F_{2}/A_{2}" });
    lines.push({ text: `${eq("F_{2}", s.F2, "N", locale).replace(/^F_\{2\} /, "F_{2} = F_{1}·A_{2}/A_{1} ")} (${formatNumber(Math.round(s.ratio * 100) / 100, locale)} vezes F_{1})` });
    if (d1 !== undefined) lines.push({ text: eq("d_{2}", (d1 * A1) / A2, "m", locale).replace(/^d_\{2\} /, `o êmbolo maior sobe d_{2} = d_{1}·A_{1}/A_{2} `) });
  }
  // Not an answer: without it the arrows would be read as to scale.
  lines.push({ text: "os êmbolos estão em escala (diâmetro ∝ √A); as setas das forças não" });
  const W0 = Math.ceil(x2 + w2 / 2 + 110 + M);
  const figH = bottom + 50;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  // The vessel: two cylinders joined at the bottom, full of liquid up to the pistons.
  const fluid = [
    { x: x1 - w1 / 2, y: level }, { x: x1 + w1 / 2, y: level }, { x: x1 + w1 / 2, y: bottom - 40 },
    { x: x2 - w2 / 2, y: bottom - 40 }, { x: x2 - w2 / 2, y: level }, { x: x2 + w2 / 2, y: level },
    { x: x2 + w2 / 2, y: bottom }, { x: x1 - w1 / 2, y: bottom },
  ];
  b.poly(fluid, { fill: "#DCE9F5", stroke: INK, width: 2.2, close: true, id: "fluido" });
  // The walls rise just past the pistons, so the forces are drawn above them.
  for (const [x, w, id] of [[x1, w1, "1"], [x2, w2, "2"]] as const) {
    b.poly([{ x: x - w / 2, y: level - 16 }, { x: x - w / 2, y: level }], { stroke: INK, width: 2.2, id: `parede-${id}` });
    b.poly([{ x: x + w / 2, y: level - 16 }, { x: x + w / 2, y: level }], { stroke: INK, width: 2.2, id: `parede-${id}b` });
  }
  // The pistons.
  b.poly([{ x: x1 - w1 / 2 + 2, y: level - 12 }, { x: x1 + w1 / 2 - 2, y: level - 12 }, { x: x1 + w1 / 2 - 2, y: level }, { x: x1 - w1 / 2 + 2, y: level }], { fill: "#3B4350", stroke: INK, width: 1, close: true, id: "embolo-1" });
  b.poly([{ x: x2 - w2 / 2 + 2, y: level - 12 }, { x: x2 + w2 / 2 - 2, y: level - 12 }, { x: x2 + w2 / 2 - 2, y: level }, { x: x2 - w2 / 2 + 2, y: level }], { fill: "#3B4350", stroke: INK, width: 1, close: true, id: "embolo-2" });
  // Each piston's area named under its own column.
  freeName(b, "A_{1}", x1, bottom + 18, INK, 13);
  freeName(b, "A_{2}", x2, bottom + 18, INK, 13);
  // F₁ pushes down on the small piston; F₂ comes out of the large one.
  arrow(b, { x: x1, y: level - 12 - 60 }, { x: x1, y: level - 12 }, GREEN, "f1");
  name(b, "F_{1}", x1 + 22, level - 46, "f1", GREEN, 15);
  arrow(b, { x: x2, y: level - 12 }, { x: x2, y: level - 12 - 90 }, KEY, "f2");
  arrowLabel(b, "F_{2}", { x: x2, y: level - 12 - 90 }, { x: 1, y: 0 }, KEY, "f2");
  freeName(b, `F_{1} = ${formatNumber(F1, locale)} N`, x1 - 10, top - 76, GREEN, 12);
  void quantity;
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? "prensa hidráulica"));
}

export const hydraulic: Kind = { id: "hydraulic", fields: ["force", "areas", "travel"], validate, draw };
