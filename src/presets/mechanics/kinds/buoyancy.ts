/**
 * buoyancy: a cube of side s and density ρ_c in a liquid of density ρ_l. It
 * floats when ρ_c < ρ_l, sunk to the fraction ρ_c/ρ_l of its height, with the
 * buoyant force equal to its weight; otherwise it is drawn sinking, the
 * buoyant force ρ_l·g·V less than its weight (on the bottom, the floor holds
 * the rest). Both forces leave the cube: the scale is set so the smaller one
 * does, and when that would make the larger one too long, neither is to scale
 * and the figure says so.
 */

import type { FigureSpec } from "../../../ir/types.ts";
import { parseSpec } from "../../../ir/types.ts";
import { formatNumber } from "../../../locale/format.ts";
import { Board } from "../../function-graph/board.ts";
import type { PanelLineInput } from "../../shared/panel.ts";
import { solveBuoyancy } from "../physics.ts";
import { common, positive } from "../kind.ts";
import type { Kind, MechanicsInput } from "../kind.ts";
import { GREEN, INK, KEY, M, PAPER, SOFT, arrow, arrowLabel, dimension, eq, freeName, name, panelBelow, quantity, rect } from "../draw.ts";

function validate(raw: Record<string, unknown>, path: string): void {
  positive(raw, "density", path);
  positive(raw, "side", path);
  if (raw.liquidDensity !== undefined) positive(raw, "liquidDensity", path);
}

function draw(input: MechanicsInput): FigureSpec {
  const { locale, answers, g } = common(input);
  const rhoC = input.density as number;
  const rhoL = (input.liquidDensity as number | undefined) ?? 1000;
  const side = input.side as number;
  const V = side ** 3;
  const s = solveBuoyancy(rhoC, rhoL, V, g);
  const cpx = 110; // the cube's side in px
  const top = M + 80;
  const level = top + 70;
  const cx = M + 220;
  const cubeTop = s.floats ? level - cpx * (1 - s.fraction) : level + 70;
  let lenP = 110;
  let lenE = 110;
  let toScale = true;
  if (!s.floats) {
    lenE = cpx / 2 + 34; // E starts at the centre and must leave the cube
    lenP = (lenE * s.P) / s.E;
    if (lenP > 260) { lenP = 260; toScale = false; }
  }
  const G = { x: cx + 18, y: cubeTop + cpx / 2 + 10 };
  const tank = { x0: M + 60, x1: M + 460, top, bottom: Math.max(level + 230, G.y + lenP + 60) };
  const lines: PanelLineInput[] = [];
  if (answers) {
    lines.push({ text: `P = ρ_{c}·V·g = ${quantity(s.P, locale).text} N   ·   E = ρ_{l}·V_{sub}·g` });
    lines.push(s.floats
      ? { text: `ρ_{c} < ρ_{l}: flutua, com E = P; a fração submersa é V_{sub}/V = ρ_{c}/ρ_{l} = ${quantity(s.fraction, locale).text}` }
      : { text: `ρ_{c} ≥ ρ_{l}: afunda; E = ${quantity(s.E, locale).text} N < P; apoiado no fundo, recebe dele N = P − E = ${quantity(s.apparent, locale).text} N` });
    if (s.floats) lines.push({ text: eq("h_{sub}", s.fraction * side, "m", locale).replace(/^h_\{sub\} /, "altura submersa: h_{sub} ") });
  }
  if (!toScale) lines.push({ text: "as setas P e E não estão em escala" });
  const W0 = Math.ceil(tank.x1 + 140 + M);
  const figH = tank.bottom + 40;
  const panel = panelBelow({ W: W0, y: figH }, lines);
  const W = Math.ceil(Math.max(W0, panel.width + 2 * M));
  const H = Math.ceil(figH + panel.height + M);
  const b = new Board(W, H, PAPER);
  // The liquid, then the tank's walls over it.
  b.poly([{ x: tank.x0, y: level }, { x: tank.x1, y: level }, { x: tank.x1, y: tank.bottom }, { x: tank.x0, y: tank.bottom }], { fill: "#DCE9F5", stroke: "none", close: true, id: "liquido" });
  b.poly([{ x: tank.x0, y: level }, { x: tank.x1, y: level }], { stroke: "#2F6FAE", width: 1.6, id: "superficie" });
  b.poly([{ x: tank.x0, y: tank.top }, { x: tank.x0, y: tank.bottom }, { x: tank.x1, y: tank.bottom }, { x: tank.x1, y: tank.top }], { stroke: INK, width: 2.4, id: "tanque" });
  rect(b, cx, cubeTop, cpx, cpx, "corpo");
  // Named above the cube, right of the E arrow that rises from it.
  const tag = `lado ${formatNumber(side, locale)} m · ρ_{c} = ${formatNumber(rhoC, locale)} kg/m³`;
  name(b, tag, cx - 8 + b.measure(tag, 12, 0.1, 700) / 2, cubeTop - 16, "corpo", INK, 12);
  freeName(b, `líquido: ρ_{l} = ${formatNumber(rhoL, locale)} kg/m³`, (tank.x0 + tank.x1) / 2, tank.bottom - 18, SOFT, 12);
  // Forces from the cube's centre, to one scale: P down, E up (from the submerged part's centre).
  arrow(b, G, { x: G.x, y: G.y + lenP }, KEY, "peso");
  arrowLabel(b, "P", { x: G.x, y: G.y + lenP }, { x: 1, y: 0 }, KEY, "peso");
  const Bc = { x: cx - 18, y: s.floats ? (level + cubeTop + cpx) / 2 : cubeTop + cpx / 2 };
  arrow(b, Bc, { x: Bc.x, y: Bc.y - lenE }, GREEN, "empuxo");
  arrowLabel(b, "E", { x: Bc.x, y: Bc.y - lenE }, { x: -1, y: 0 }, GREEN, "empuxo");
  // The submerged height beside the cube.
  if (s.floats) {
    dimension(b, cx + cpx / 2 + 30, level, cubeTop + cpx, "submersa");
    name(b, "h_{sub}", cx + cpx / 2 + 56, (level + cubeTop + cpx) / 2, "submersa", SOFT, 13);
  }
  panel.draw(b);
  return parseSpec(b.spec(input.title ?? (s.floats ? "corpo flutuando" : "corpo afundando")));
}

export const buoyancy: Kind = { id: "buoyancy", fields: ["density", "liquidDensity", "side"], validate, draw };
